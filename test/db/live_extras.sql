-- Policies som er lagt inn manuelt i den live databasen og ikke finnes i repo-SQL-en.
-- 20261007_security_hardening.sql skal fjerne dem, også den som gjelder alle bøtter.
create policy "Some manual dashboard policy" on items for select using (true);
create policy "Manual storage policy" on storage.objects for select using (bucket_id = 'estate-docs');
create policy "Manual any-bucket policy" on storage.objects for select using (auth.role() = 'authenticated');
