-- Kjørelogg for vedlikeholdsjobbene (cleanup-closed-estates, cleanup-orphan-images), så feilkjøringer
-- kan oppdages. Én rad per ekte kjøring (dry_run logges ikke). Bare service_role (edge-funksjonene)
-- kan lese og skrive. Ingen persondata: bo-id-er, antall og forkortede feilmeldinger uten filstier.
--
-- Oppdage feil:
--   select * from cleanup_runs where status <> 'ok' order by started_at desc;          -- feil/delvis/krasjet
--   select max(started_at) from cleanup_runs where job = 'cleanup-closed-estates';     -- eldre enn 2 døgn = cron går ikke

create table if not exists public.cleanup_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  deleted_count int not null default 0,
  failed_count int not null default 0,
  details jsonb
);

create index if not exists cleanup_runs_job_time_idx on public.cleanup_runs (job, started_at desc);

-- RLS uten policies: ingen klient kan lese eller skrive tabellen
alter table public.cleanup_runs enable row level security;
revoke all on public.cleanup_runs from anon, authenticated;

notify pgrst, 'reload schema';
