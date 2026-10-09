-- Tilbakerulling av migrations/20261008_guard_item_value_disposal.sql (kjørt i prod 2026-10-09 12:11 UTC).
-- Gjenoppretter guard_item_update og items_delete slik de var før (lik 20261007_security_hardening.sql).
-- Kjøres bare etter godkjenning: supabase db query --linked -f supabase/rollback/20261008_guard_item_value_disposal.down.sql
begin;
set local lock_timeout = '5s';
create or replace function public.guard_item_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.estate_id is distinct from old.estate_id then
    raise exception 'Gjenstanden kan ikke flyttes til et annet bo' using errcode = '42501';
  end if;
  if (new.assigned_to is distinct from old.assigned_to or new.status is distinct from old.status)
     and not public.is_estate_admin(old.estate_id) then
    raise exception 'Bare administratorer kan tildele gjenstander' using errcode = '42501';
  end if;
  if public.is_demo_user()
     and (to_jsonb(new) - '{assigned_to,status,marked_for_disposal}'::text[])
         is distinct from (to_jsonb(old) - '{assigned_to,status,marked_for_disposal}'::text[]) then
    raise exception 'Demokontoen kan ikke endre gjenstander' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop policy if exists "items_delete" on public.items;
create policy "items_delete" on public.items for delete using (
  not public.is_demo_user() and (public.is_estate_admin(estate_id) or added_by = auth.uid())
);
commit;
