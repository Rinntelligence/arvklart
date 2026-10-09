-- AI-budsjett per bo (U3): større bulkregistreringer stoppes ikke av timegrensen, og ett bo kan ikke
-- drive opp regningen.
--
--   • Vanlige brukere: maks 80 kall i timen og 400 i døgnet (før 30 og 150).
--   • Per bo: maks 1 500 kall de siste 30 dagene, uansett hvem i boet som gjør dem.
--   • Demoen er uendret: 5 kall per demo-økt og 300 demo-kall i døgnet totalt.
--
-- ai_usage får estate_id. Edge-funksjonen sender boet kallet gjelder (fra klienten, eller fra
-- gjenstanden ved verdianslag med item_id). Brukeren må være medlem av boet, ellers avvises kallet
-- (reason 'not_member'), så ingen kan bruke opp et annet bos budsjett. Kall uten bo (eldre klienter)
-- teller bare mot brukerens grenser. Ingen innhold lagres, som før.
-- Kan kjøres flere ganger.

alter table public.ai_usage
  add column if not exists estate_id uuid references public.estates(id) on delete set null;

create index if not exists ai_usage_estate_time_idx on public.ai_usage (estate_id, created_at) where estate_id is not null;

-- Den gamle signaturen (fire parametere) erstattes av en med estate_id som valgfri femte parameter.
-- Edge-funksjoner som ikke sender p_estate_id, treffer den nye funksjonen med standardverdien.
drop function if exists public.claim_ai_call(uuid, text, text, boolean);

create or replace function public.claim_ai_call(p_user_id uuid, p_session_id text, p_fn text, p_is_demo boolean, p_estate_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  demo_per_session constant int := 5;
  demo_per_day constant int := 300;
  user_per_hour constant int := 80;
  user_per_day constant int := 400;
  estate_per_30_days constant int := 1500;
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

  if p_estate_id is not null then
    if not exists (select 1 from estate_members where estate_id = p_estate_id and user_id = p_user_id) then
      return jsonb_build_object('ok', false, 'reason', 'not_member');
    end if;
    -- Ett kall om gangen per bo også, så flere medlemmer samtidig ikke slipper forbi bo-grensen
    perform pg_advisory_xact_lock(hashtext('ai-estate:' || p_estate_id::text));
  end if;

  if (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 hour') >= user_per_hour
     or (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 day') >= user_per_day then
    return jsonb_build_object('ok', false, 'reason', 'rate_limit');
  end if;
  if p_estate_id is not null
     and (select count(*) from ai_usage where estate_id = p_estate_id and created_at > now() - interval '30 days') >= estate_per_30_days then
    return jsonb_build_object('ok', false, 'reason', 'estate_limit');
  end if;
  insert into ai_usage (user_id, session_id, fn, estate_id) values (p_user_id, p_session_id, p_fn, p_estate_id) returning id into new_id;
  return jsonb_build_object('ok', true, 'usage_id', new_id);
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, text, boolean, uuid) to service_role;

notify pgrst, 'reload schema';
