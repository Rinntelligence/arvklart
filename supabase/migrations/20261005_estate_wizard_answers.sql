-- Lagrer svarene fra arveveiviseren på boet, slik at brukeren kan gå tilbake og endre dem
-- fra hvilken som helst enhet. Appen fungerer uten disse kolonnene (svarene lagres da bare
-- lokalt i nettleseren), men bør kjøres i Supabase SQL Editor.
--
-- RLS: kolonnene dekkes av eksisterende policies på estates
-- (medlemmer kan lese, administratorer kan oppdatere).

alter table estates add column if not exists wizard_answers jsonb;
alter table estates add column if not exists wizard_updated_at timestamptz;
