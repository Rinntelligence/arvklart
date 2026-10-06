-- Sikker tilgang til founder-dashboardet. Kjøres i Supabase SQL Editor FØR frontend deployes,
-- ellers får founder-dashboardet ikke hentet data.
--
-- Hva migrasjonen fikser:
-- 1. Før kunne enhver innlogget bruker sette is_founder = true (og plan = 'enterprise') på sin
--    egen profil fra nettleserkonsollen, fordi update-policyen på profiles ikke begrenset kolonner.
--    Nå bestemmes founder-rollen av en egen tabell (founders) som klienten ikke kan skrive til,
--    og en trigger hindrer at klienten endrer is_founder og plan.
-- 2. Founder-tilgang krever nå tofaktor (TOTP). is_founder() er bare sann når JWT-en har aal2,
--    altså når brukeren har bekreftet en kode fra autentiseringsappen i denne sesjonen.
-- 3. Founder-data hentes via security definer-funksjoner (founder_dashboard, founder_set_plan)
--    i stedet for brede select-policies. Hver founder-handling logges i founder_audit_log.
-- 4. Før kunne alle innloggede lese alle profiler (e-post, plan). Nå ser man bare sin egen profil
--    og profilene til medlemmer i bo man selv er med i.
--
-- ETTER KJØRING: legg inn founders (se nederst), og hver founder setter opp tofaktor på /founder.

-- ============================================================
-- 1. FOUNDER-ROLLE
-- ============================================================

-- RLS uten policies: ingen klient kan lese eller skrive. Endres bare i SQL Editor / med service_role.
create table if not exists public.founders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);
alter table public.founders enable row level security;

-- Founder OG tofaktor bekreftet i denne sesjonen. Brukes av alle founder-funksjoner.
create or replace function public.is_founder()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from founders where user_id = auth.uid())
     and coalesce(auth.jwt()->>'aal', '') = 'aal2';
$$;

-- Bare medlemskap, uten krav til tofaktor. Lar frontend avgjøre om tofaktor-steget skal vises.
-- Avslører ingenting om andre brukere.
create or replace function public.am_i_founder()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from founders where user_id = auth.uid());
$$;

revoke all on function public.is_founder() from public, anon;
revoke all on function public.am_i_founder() from public, anon;
grant execute on function public.is_founder() to authenticated;
grant execute on function public.am_i_founder() to authenticated;

-- profiles.is_founder beholdes kun som visningsflagg (menylenken i TopBar) og speiler founders.
create or replace function public.sync_profile_founder_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update profiles set is_founder = false where user_id = old.user_id;
    return old;
  end if;
  update profiles set is_founder = true where user_id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_profile_founder_flag on public.founders;
create trigger sync_profile_founder_flag
  after insert or delete on public.founders
  for each row execute function public.sync_profile_founder_flag();

-- ============================================================
-- 2. LÅS is_founder OG plan MOT KLIENTEN
-- ============================================================

-- current_user er 'authenticated'/'anon' for kall direkte fra klienten, men eieren av funksjonen
-- (postgres) inne i security definer-funksjoner som founder_set_plan. Feltene beholdes stille
-- i stedet for å kaste feil, slik at upsertProfile(... plan: 'free') ikke nullstiller betalende brukere.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.is_founder := false;
      new.plan := 'free';
    else
      new.is_founder := old.is_founder;
      new.plan := old.plan;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Flagget speiler founders-tabellen. Fjerner eventuelle brukere som har gitt seg selv flagget via
-- hullet over. Ekte founders får det tilbake når de legges i founders (se nederst).
update public.profiles p
  set is_founder = exists (select 1 from public.founders f where f.user_id = p.user_id)
  where p.is_founder is distinct from exists (select 1 from public.founders f where f.user_id = p.user_id);

-- ============================================================
-- 3. PROFILER: KUN EGEN OG MEDLEMMER I SAMME BO
-- ============================================================

-- security definer for å unngå RLS-rekursjon mot estate_members.
create or replace function public.shares_estate_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from estate_members mine
    join estate_members theirs on theirs.estate_id = mine.estate_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

revoke all on function public.shares_estate_with(uuid) from public, anon;
grant execute on function public.shares_estate_with(uuid) to authenticated;

drop policy if exists "Users can view all profiles" on profiles;
drop policy if exists "Users can view own and co-member profiles" on profiles;
create policy "Users can view own and co-member profiles" on profiles for select using (
  user_id = auth.uid() or public.shares_estate_with(user_id)
);

-- Tilbakemeldinger leses nå bare via founder_dashboard() (krever tofaktor).
drop policy if exists "Founder can view feedback" on feedback;

-- ============================================================
-- 4. REVISJONSLOGG
-- ============================================================

-- RLS uten policies: kun lesbar i SQL Editor.
create table if not exists public.founder_audit_log (
  id uuid default gen_random_uuid() primary key,
  founder_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb,
  created_at timestamptz default now()
);
alter table public.founder_audit_log enable row level security;

-- ============================================================
-- 5. FOUNDER-FUNKSJONER
-- ============================================================

create or replace function public.founder_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_founder() then
    raise exception 'not_authorized';
  end if;

  select jsonb_build_object(
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'user_id', p.user_id, 'display_name', p.display_name,
        'avatar_color', p.avatar_color, 'email', p.email, 'plan', p.plan, 'created_at', p.created_at
      ) order by p.created_at desc)
      from profiles p
    ), '[]'::jsonb),
    'estates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'owner_id', e.owner_id, 'status', e.status, 'created_at', e.created_at,
        'item_count', (select count(*) from items i where i.estate_id = e.id),
        'profiles', jsonb_build_object('display_name', op.display_name, 'email', op.email)
      ) order by e.created_at desc)
      from estates e
      left join profiles op on op.user_id = e.owner_id
    ), '[]'::jsonb),
    'feedback', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', f.id, 'type', f.type, 'content', f.content, 'nps_score', f.nps_score, 'created_at', f.created_at,
        'profiles', jsonb_build_object('display_name', fp.display_name, 'avatar_color', fp.avatar_color, 'email', fp.email)
      ) order by f.created_at desc)
      from feedback f
      left join profiles fp on fp.user_id = f.user_id
    ), '[]'::jsonb),
    'item_count', (select count(*) from items)
  ) into v_result;

  insert into founder_audit_log (founder_id, action) values (auth.uid(), 'view_dashboard');
  return v_result;
end;
$$;

create or replace function public.founder_set_plan(p_user_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_founder() then
    raise exception 'not_authorized';
  end if;
  if p_plan not in ('free', 'family', 'business', 'enterprise') then
    raise exception 'invalid_plan';
  end if;

  select plan into v_old from profiles where user_id = p_user_id;
  if not found then
    raise exception 'not_found';
  end if;

  update profiles set plan = p_plan where user_id = p_user_id;
  insert into founder_audit_log (founder_id, action, target_user_id, details)
    values (auth.uid(), 'set_plan', p_user_id, jsonb_build_object('from', v_old, 'to', p_plan));
end;
$$;

revoke all on function public.founder_dashboard() from public, anon;
revoke all on function public.founder_set_plan(uuid, text) from public, anon;
grant execute on function public.founder_dashboard() to authenticated;
grant execute on function public.founder_set_plan(uuid, text) to authenticated;

-- Be API-et (PostgREST) laste inn de nye funksjonene med en gang.
notify pgrst, 'reload schema';

-- ============================================================
-- LEGG INN FOUNDERS (kjøres manuelt, én gang per founder)
-- ============================================================
-- insert into public.founders (user_id)
--   select id from auth.users where email in ('founder1@eksempel.no', 'founder2@eksempel.no')
-- on conflict do nothing;
--
-- Kontroll: ingen andre select-policies på profiles skal gi bredere tilgang.
-- select policyname, cmd, qual from pg_policies where tablename = 'profiles';
