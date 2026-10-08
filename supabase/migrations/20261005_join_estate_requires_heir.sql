-- Invitasjon til et bo krever nå både invitasjonskoden OG at brukerens e-post er lagt inn
-- på en arving i boet (siden «Arvinger»). Kjøres i Supabase SQL Editor FØR frontend deployes,
-- ellers får ingen blitt med i bo.
--
-- 1. join_estate(code): eneste vei inn i et bo for andre enn eieren. Kjører som security definer,
--    så den kan slå opp boet og arvingene selv om brukeren ikke er medlem ennå.
-- 2. Strammer inn insert-policyen på estate_members: før kunne enhver innlogget bruker legge
--    seg selv inn i hvilket som helst bo (også som admin). Nå kan bare eieren legge seg selv inn.

create or replace function public.join_estate(p_code text)
returns table (estate_id uuid, estate_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.email(), '')));
  v_estate estates%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_estate from estates where invite_code = upper(trim(p_code));
  if not found then
    raise exception 'invalid_code';
  end if;

  if not exists (select 1 from estate_members m where m.estate_id = v_estate.id and m.user_id = v_uid) then
    if v_email = '' or not exists (
      select 1 from heirs h where h.estate_id = v_estate.id and lower(trim(h.email)) = v_email
    ) then
      raise exception 'not_invited';
    end if;
    insert into estate_members (estate_id, user_id, role) values (v_estate.id, v_uid, 'member');
  end if;

  return query select v_estate.id, v_estate.name;
end;
$$;

revoke all on function public.join_estate(text) from public, anon;
grant execute on function public.join_estate(text) to authenticated;

-- Hjelpefunksjon for policyen under (security definer for å unngå RLS-rekursjon mot estates).
create or replace function public.is_estate_owner(p_estate_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from estates where id = p_estate_id and owner_id = auth.uid());
$$;

grant execute on function public.is_estate_owner(uuid) to authenticated;

drop policy if exists "Authenticated can join estates" on estate_members;
drop policy if exists "Owners can add themselves to their estate" on estate_members;
create policy "Owners can add themselves to their estate" on estate_members for insert with check (
  user_id = auth.uid() and public.is_estate_owner(estate_id)
);

-- Be API-et (PostgREST) laste inn den nye funksjonen med en gang.
notify pgrst, 'reload schema';
