-- Sikkerhetsgjennomgangen 2026-10-11 (F2–F4): stram inn hvem som kan kalle databasefunksjonene.
--
-- 1. Supabase gir anon og authenticated EXECUTE på alle nye funksjoner i public, og Postgres gir PUBLIC det
--    samme. «revoke … from public, anon» stengte bare for anon, og der det manglet, kunne også anon kalle
--    funksjonen (triggerfunksjonene, hjelpefunksjonene i policyene, distribution_status, estate_is_open …).
--    Nå er alle funksjoner i public stengt for PUBLIC, anon og authenticated, og authenticated får
--    EXECUTE bare på det som står i client_functions:
--    - 'rpc':    funksjonene appen kaller med supabase.rpc() (alle sjekker selv hvem som kaller)
--    - 'policy': hjelpefunksjonene RLS-policyene bruker; de kjøres med rettighetene til den som spør
--    anon trenger ingen funksjoner: appen gjør ingen databasekall uten innlogging. En spørring uten
--    innlogging gir nå «permission denied» i stedet for et tomt svar (før: 20261007_security_hardening.sql).
--    Triggerfunksjoner trenger ingen EXECUTE for å fyre (Postgres sjekker bare når triggeren lages), og
--    service_role (edge-funksjonene) beholder alt.
--    Ny funksjon som appen skal kalle: legg den inn i client_functions og kjør select apply_function_grants()
--    i samme migrering. CI (test/db/run.sh) feiler hvis anon kan kalle noe, eller authenticated kan kalle
--    noe som ikke står i tabellen.
-- 2. Fast search_path på funksjonene som manglet det (F3). Ingen av dem er security definer i repoet;
--    set_estate_closed_at og cleanup_old_closed_estates finnes bare i produksjon (supabase/APPLIED.md).
-- 3. Tabellene med RLS uten policies (founders, founder_audit_log, ai_usage, protected_columns,
--    cleanup_runs) er med vilje stengt for klientene (F4). Tabellrettighetene fjernes også, så de er stengt
--    selv om RLS skulle bli slått av.
--
-- Kan kjøres flere ganger. Tilbakerulling: rollback/20261021_function_grants.down.sql

-- ── 1. Funksjoner klienten kan kalle ────────────────────────────────────────────

create table if not exists public.client_functions (
  signature text primary key,   -- som regprocedure skriver den, f.eks. 'public.join_estate(text)'
  reason text not null check (reason in ('rpc', 'policy'))
);
alter table public.client_functions enable row level security;
revoke all on public.client_functions from anon, authenticated;

insert into public.client_functions (signature, reason) values
  ('public.add_representative(uuid,uuid,text,text,uuid)', 'rpc'),
  ('public.am_i_founder()', 'rpc'),
  ('public.assign_items(uuid,jsonb,text)', 'rpc'),
  ('public.complete_chore(uuid)', 'rpc'),
  ('public.confirm_decider_removal(uuid)', 'rpc'),
  ('public.confirm_shares(uuid,boolean)', 'rpc'),
  ('public.distribution_status(uuid)', 'rpc'),
  ('public.draw_lot(uuid)', 'rpc'),
  ('public.founder_add_founder(text)', 'rpc'),
  ('public.founder_dashboard()', 'rpc'),
  ('public.founder_list_founders()', 'rpc'),
  ('public.founder_remove_founder(uuid)', 'rpc'),
  ('public.founder_set_plan(uuid,text)', 'rpc'),
  ('public.join_estate(text)', 'rpc'),
  ('public.propose_distribution(uuid)', 'rpc'),
  ('public.remove_estate_member(uuid,uuid)', 'rpc'),
  ('public.respond_distribution(uuid,uuid,text,text,uuid)', 'rpc'),
  ('public.revoke_representative(uuid)', 'rpc'),
  ('public.set_agreed_values(uuid,jsonb)', 'rpc'),
  ('public.set_dispositions(uuid,jsonb)', 'rpc'),
  ('public.set_must_approve(uuid,boolean,text)', 'rpc'),
  ('public.unassign_item(uuid)', 'rpc'),
  ('public.verify_representative(uuid)', 'rpc'),
  ('public.vote_item_value(uuid,text,numeric)', 'rpc'),
  ('public.is_demo_user()', 'policy'),
  ('public.is_estate_admin(uuid)', 'policy'),
  ('public.is_estate_member(uuid)', 'policy'),
  ('public.is_estate_owner(uuid)', 'policy'),
  ('public.item_estate_id(uuid)', 'policy'),
  ('public.item_is_open(uuid)', 'policy'),
  ('public.shares_estate_with(uuid)', 'policy'),
  ('public.try_uuid(text)', 'policy')
on conflict do nothing;

-- Stenger alle funksjoner i public (ikke de som hører til en utvidelse) og gir authenticated EXECUTE på dem
-- i client_functions. Funksjonslisten leses fra databasen, så funksjoner som bare finnes i produksjon også tas med.
create or replace function public.apply_function_grants()
returns void language plpgsql security definer set search_path = public as $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on routine %s from public, anon, authenticated', f);
    execute format('grant execute on routine %s to service_role', f);
  end loop;
  for f in select to_regprocedure(signature) from client_functions where to_regprocedure(signature) is not null loop
    execute format('grant execute on routine %s to authenticated', f);
  end loop;
end;
$$;

select public.apply_function_grants();

-- ── 2. Fast search_path ─────────────────────────────────────────────────────────

-- Funksjonene bruker bare pg_catalog og auth.* (skrevet fullt ut), så de trenger ingen søkesti.
alter function public.try_uuid(text) set search_path = '';
alter function public.is_demo_user() set search_path = '';
alter function public.protect_profile_fields() set search_path = '';
alter function public.guard_distribution_immutable() set search_path = '';

-- Bare i produksjon. set_estate_closed_at bruker bare NEW/OLD og now(); cleanup_old_closed_estates bruker
-- tabellene i public uten skjemanavn og kan bare kalles av service_role.
do $$ begin
  if to_regprocedure('public.set_estate_closed_at()') is not null then
    alter function public.set_estate_closed_at() set search_path = '';
  end if;
  if to_regprocedure('public.cleanup_old_closed_estates()') is not null then
    alter function public.cleanup_old_closed_estates() set search_path = public;
  end if;
end $$;

-- ── 3. Tabeller bare for databasefunksjoner og service_role ─────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['founders', 'founder_audit_log', 'ai_usage', 'protected_columns', 'cleanup_runs', 'client_functions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
      execute format('comment on table public.%I is %L', t,
        'RLS uten policies med vilje: klientene har ingen tilgang. Leses og skrives bare av security definer-funksjoner og service_role (20261021_function_grants.sql).');
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
