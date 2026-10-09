-- Rull tilbake 20261010_interests_reason_update.sql: ingen kan endre en begrunnelse igjen
-- (appen viser da en feilmelding ved lagring). Eksisterende begrunnelser beholdes.
begin;
drop policy if exists "interests_update" on public.interests;
revoke update (reason) on public.interests from authenticated;
grant update on public.interests to anon, authenticated;  -- Supabase-standarden; uten policy gir den ingen tilgang
alter table public.interests drop constraint if exists interests_reason_len;
commit;
