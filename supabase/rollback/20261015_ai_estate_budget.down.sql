-- Rull tilbake 20261015_ai_estate_budget.sql: claim_ai_call() med fire parametere og de gamle grensene
-- (30 i timen, 150 i døgnet, ingen bo-grense), som 20261011_ai_usage_metrics.sql.
-- Kolonnen ai_usage.estate_id og indeksen beholdes (de skader ikke); slett dem for seg ved behov:
--   drop index if exists public.ai_usage_estate_time_idx; alter table public.ai_usage drop column if exists estate_id;
-- Edge-funksjoner som sender p_estate_id, må deployes tilbake til forrige versjon først.
begin;
drop function if exists public.claim_ai_call(uuid, text, text, boolean, uuid);
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
commit;
