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
-- join_estate(): kjør 20261005_join_estate_requires_heir.sql på nytt (uten kobling).
-- guard_item_insert(): kjør 20261017_estate_events_and_assignment.sql sin versjon på nytt hvis F1 beholdes.
notify pgrst, 'reload schema';
commit;
