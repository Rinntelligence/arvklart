-- Kolonner på items som appen bruker, men som ble lagt inn direkte i dashboardet og aldri kom med
-- i SQL-filene. I produksjon finnes de allerede (da gjør denne filen ingenting); på en ny database
-- trengs de for å legge til gjenstander, sveipe «kast», stemme på verdiestimat og nullstille demoen.

alter table public.items add column if not exists extra_images jsonb default '[]'::jsonb;
alter table public.items add column if not exists marked_for_disposal boolean default false;
alter table public.items add column if not exists value_agree_count int default 0;
alter table public.items add column if not exists value_disagree_count int default 0;
alter table public.items add column if not exists value_voter_ids uuid[] default '{}';
alter table public.items add column if not exists value_suggestions jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
