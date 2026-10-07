-- Grenser for AI-bruk (bildeanalyse og verdiestimat), så ingen kan drive opp regningen hos Anthropic.
-- Edge-funksjonene kaller claim_ai_call() før de spør AI-en; bare service_role kan kalle den.
--
--   • Vanlige brukere: maks 30 kall i timen og 150 i døgnet.
--   • Demoen: 5 kall per demo-økt (hver besøkende får en ny økt), og maks 300 demo-kall i døgnet
--     totalt, så demo-login ikke kan brukes til å omgå grensen.

create table if not exists public.ai_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text,
  fn text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_user_time_idx on public.ai_usage (user_id, created_at);
create index if not exists ai_usage_demo_session_idx on public.ai_usage (session_id) where is_demo;

-- RLS uten policies: ingen klient kan lese eller skrive tabellen.
alter table public.ai_usage enable row level security;

create or replace function public.claim_ai_call(p_user_id uuid, p_session_id text, p_fn text, p_is_demo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  demo_per_session constant int := 5;
  demo_per_day constant int := 300;
  user_per_hour constant int := 30;
  user_per_day constant int := 150;
  used int;
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
    insert into ai_usage (user_id, session_id, fn, is_demo) values (p_user_id, p_session_id, p_fn, true);
    return jsonb_build_object('ok', true, 'remaining', demo_per_session - used - 1);
  end if;

  if (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 hour') >= user_per_hour
     or (select count(*) from ai_usage where user_id = p_user_id and created_at > now() - interval '1 day') >= user_per_day then
    return jsonb_build_object('ok', false, 'reason', 'rate_limit');
  end if;
  insert into ai_usage (user_id, session_id, fn) values (p_user_id, p_session_id, p_fn);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.claim_ai_call(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_ai_call(uuid, text, text, boolean) to service_role;

notify pgrst, 'reload schema';
