-- Rull tilbake 20261016_value_votes_and_wish_guard.sql: update på hele items igjen, stemmer skrives
-- direkte av klienten (forrige frontend), og ønsker/«nei takk» kan registreres på tildelte gjenstander.
-- Deploy forrige frontend først (den nye stemmer via vote_item_value()).
begin;
grant update on public.items to authenticated;
drop policy if exists "interests_insert" on public.interests;
create policy "interests_insert" on public.interests for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id))
);
drop policy if exists "item_passes_insert" on public.item_passes;
create policy "item_passes_insert" on public.item_passes for insert with check (
  user_id = auth.uid() and public.is_estate_member(public.item_estate_id(item_id))
);
drop function if exists public.vote_item_value(uuid, text, numeric);
drop function if exists public.item_is_open(uuid);
drop function if exists public.apply_item_update_grants();
drop function if exists public.protected_item_columns();
drop table if exists public.protected_columns;
notify pgrst, 'reload schema';
commit;
