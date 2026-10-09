-- Språk per konto (norsk eller engelsk), så valget følger brukeren mellom enheter.
-- null betyr «ikke valgt», og da brukes norsk (eller språket som er valgt i nettleseren).
--
-- I produksjon fantes kolonnen fra før med standardverdi 'en', men koden har aldri lest eller skrevet den,
-- så ingen har valgt engelsk: alle rader har bare standardverdien. Første gang migreringen kjøres (når
-- standardverdien fortsatt er 'en'), nullstilles disse radene, så eksisterende brukere fortsetter på norsk.
-- Senere kjøringer rører ikke dataene (standardverdien er da fjernet), så brukernes valg beholdes.
-- Hver bruker kan bare endre sin egen profil (profiles_update); demokontoer kan ikke endre profilen.

alter table public.profiles add column if not exists preferred_lang text;

do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'preferred_lang'
      and column_default like '''en''%'
  ) then
    alter table public.profiles alter column preferred_lang drop default;
    update public.profiles set preferred_lang = null where preferred_lang = 'en';
  end if;
end $$;

alter table public.profiles alter column preferred_lang drop default;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_preferred_lang_chk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_preferred_lang_chk
      check (preferred_lang is null or preferred_lang in ('no', 'en'));
  end if;
end $$;
