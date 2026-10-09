-- Rull tilbake 20261013_profiles_preferred_lang.sql: fjerner sjekken. Kolonnen og brukernes valg beholdes
-- (appen faller da tilbake til språket i nettleseren hvis den gamle koden kjører). Standardverdien 'en'
-- settes ikke tilbake: den førte til at alle så ut til å ha valgt engelsk.
begin;
alter table public.profiles drop constraint if exists profiles_preferred_lang_chk;
commit;
