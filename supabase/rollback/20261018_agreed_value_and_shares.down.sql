-- Rull tilbake 20261018_agreed_value_and_shares.sql: fjerner fordelingsverdi, kobling arving–konto og
-- bekreftede andeler, og gir update på hele heirs/estates igjen. Deploy forrige frontend først.
-- Fordelingsverdiene og koblingene slettes – ta en kopi hvis de skal beholdes.
begin;
delete from public.protected_columns where (table_name = 'items' and column_name in ('agreed_value', 'agreed_value_source'))
  or table_name in ('heirs', 'estates');
drop trigger if exists reset_shares_on_heir_change on public.heirs;
drop function if exists public.reset_shares_on_heir_change();
drop function if exists public.confirm_shares(uuid, boolean);
drop function if exists public.set_agreed_values(uuid, jsonb);
drop trigger if exists guard_heir_insert on public.heirs;
drop function if exists public.guard_heir_insert();
alter table public.items drop constraint if exists items_agreed_value_chk;
alter table public.items drop column if exists agreed_value, drop column if exists agreed_value_source;
alter table public.heirs drop column if exists user_id, drop column if exists linked_via, drop column if exists linked_at;
alter table public.estates drop column if exists shares_confirmed, drop column if exists shares_confirmed_at, drop column if exists shares_confirmed_by;
select public.apply_item_update_grants();
grant update on public.heirs, public.estates to authenticated;
drop function if exists public.protected_heir_columns();
drop function if exists public.apply_update_grants(text, text[]);
-- join_estate() og guard_item_insert() viste til kolonnene over; tilbake til versjonene før denne migreringen
-- (20261005 og 20261017). Rull tilbake 20261019 først.
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
create or replace function public.guard_item_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if coalesce(new.status, 'active') <> 'active' or new.assigned_to is not null then
    raise exception 'En ny gjenstand kan ikke være tildelt' using errcode = '42501';
  end if;
  if coalesce(array_length(new.value_voter_ids, 1), 0) > 1
     or (new.value_voter_ids is not null and not (new.value_voter_ids::text[] <@ array[auth.uid()::text]))
     or coalesce(new.value_agree_count, 0) + coalesce(new.value_disagree_count, 0) > coalesce(array_length(new.value_voter_ids, 1), 0)
     or exists (select 1 from jsonb_array_elements(coalesce(new.value_suggestions, '[]'::jsonb)) s where s->>'user_id' is distinct from auth.uid()::text) then
    raise exception 'En ny gjenstand kan bare ha skaperens egen stemme' using errcode = '42501';
  end if;
  return new;
end;
$$;
notify pgrst, 'reload schema';
commit;
