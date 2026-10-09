-- Måling av AI-kallene: modell, tokens, antall bilder, tid, anslått kostnad og utfall per kall.
-- Edge-funksjonene fyller dette inn etter kallet (service_role). Ingen innhold lagres: ingen bilder,
-- prompter, titler eller svar. Tabellen er fortsatt utilgjengelig for klienter (RLS uten policies).
--
-- claim_ai_call() returnerer i tillegg usage_id, så raden kan oppdateres etterpå. Grensene er uendret.
-- Kan kjøres flere ganger.

alter table public.ai_usage
  add column if not exists model text,
  add column if not exists input_tokens int,
  add column if not exists output_tokens int,
  add column if not exists cache_read_tokens int,
  add column if not exists image_count smallint,
  add column if not exists latency_ms int,
  add column if not exists cost_usd numeric(10,6),
  add column if not exists outcome text,
  add column if not exists attempts smallint,
  add column if not exists schema_version smallint;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_outcome_chk' and conrelid = 'public.ai_usage'::regclass) then
    alter table public.ai_usage add constraint ai_usage_outcome_chk
      check (outcome is null or outcome in ('ok', 'refused', 'invalid', 'timeout', 'busy', 'error', 'insufficient'));
  end if;
end $$;

create or replace function public.claim_ai_call(p_user_id uuid, p_session_id text, p_fn text, p_is_demo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  demo_per_session constant int := 5;
  demo_per_day constant int := 300;
  user_per_hour constant int := 30;
  user_per_day constant int := 150;
  used int;
  new_id bigint;
begin
  -- Ett kall om gangen per økt/bruker, så samtidige kall ikke slipper forbi grensen
  perform pg_advisory_xact_lock(hashtext(coalesce(p_session_id, p_user_id::text)));

  if p_is_demo then
    select count(*) into used from ai_usage where is_demo and session_id = p_session_id;
    if used >= demo_per_session then
      return jsonb_build_object('ok', false, 'reason', 'demo_limit', 'remaining', 0);
    end if;
    if (select count(*) from ai_usage where is_demo and created_at > now() - interval '1 day') >= demo_per_day then
      return jsonb_build_object('ok', false, 'reason', 'demo_limit', 'remaining', 0);
    end if;
    insert into ai_usage (user_id, session_id, fn, is_demo) values (p_user_id, p_session_id, p_fn, true) returning id into new_id;
    return jsonb_build_object('ok', true, 'remaining', demo_per_session - used - 1, 'usage_id', new_id);
  end if;

  if (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 hour') >= user_per_hour
     or (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 day') >= user_per_day then
    return jsonb_build_object('ok', false, 'reason', 'rate_limit');
  end if;
  insert into ai_usage (user_id, session_id, fn) values (p_user_id, p_session_id, p_fn) returning id into new_id;
  return jsonb_build_object('ok', true, 'usage_id', new_id);
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
