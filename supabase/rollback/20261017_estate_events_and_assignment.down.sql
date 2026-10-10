-- Rull tilbake 20261017_estate_events_and_assignment.sql: tildeling skjer igjen med direkte oppdatering
-- (forrige frontend), loggen fjernes, demo-nullstillingen som i 20261007_demo_reset.sql.
-- Deploy forrige frontend og delete-account først. Loggen (estate_events) slettes – ta en kopi hvis den skal beholdes.
begin;
create or replace function public.protected_item_columns()
returns text[] language sql immutable as $$
  select array['value_agree_count', 'value_disagree_count', 'value_voter_ids', 'value_suggestions']
$$;
select public.apply_item_update_grants();
drop trigger if exists guard_item_insert on public.items;
drop function if exists public.guard_item_insert();
drop trigger if exists log_interest_change on public.interests;
drop trigger if exists log_pass_change on public.item_passes;
drop function if exists public.log_wish_change();
drop function if exists public.assign_items(uuid, jsonb, text);
drop function if exists public.unassign_item(uuid);
drop function if exists public.draw_lot(uuid);
drop function if exists public.anonymize_estate_events(uuid);
drop function if exists public.require_estate_admin(uuid);
drop function if exists public.log_estate_event(uuid, uuid, text, jsonb);
drop table if exists public.estate_events;
-- reset_demo_estate() sletter loggen bare hvis tabellen finnes, så den virker videre uten endring.
notify pgrst, 'reload schema';
commit;
