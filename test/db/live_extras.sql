-- Policies som er lagt inn manuelt i den live databasen og ikke finnes i repo-SQL-en.
-- 20261007_security_hardening.sql skal fjerne dem, også den som gjelder alle bøtter.
create policy "Some manual dashboard policy" on items for select using (true);
create policy "Manual storage policy" on storage.objects for select using (bucket_id = 'estate-docs');
create policy "Manual any-bucket policy" on storage.objects for select using (auth.role() = 'authenticated');

-- Kolonner som finnes bare i produksjon (supabase/APPLIED.md): språk med standardverdi 'en' som koden aldri
-- har brukt. 20261013_profiles_preferred_lang.sql skal fjerne standardverdien og nullstille radene.
alter table public.profiles add column if not exists preferred_lang text default 'en';
alter table public.profiles add column if not exists preferred_market text default 'ebay';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'gammel@test.no') on conflict do nothing;
insert into public.profiles (user_id, display_name) values ('00000000-0000-0000-0000-0000000000c1', 'Gammel bruker') on conflict do nothing;
