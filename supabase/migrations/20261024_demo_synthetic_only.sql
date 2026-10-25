-- Demoen viser bare syntetiske demokontoer (kari/lars/mona.demo@heirsplit.no).
--
-- Før: den ekte appeieren var eier og administrator i demoboet (seed/demo_estate.sql), og ekte kontoer kunne
-- bli medlemmer. Navnene deres ble da vist for alle som åpnet demoen (ønsker med begrunnelse, «Per arving»,
-- verdiforslag). Nå håndhever reset_demo_estate() ved hver demoinnlogging at:
--   • bare demokontoene er medlemmer, og Mona eier boet
--   • ønsker, «nei takk», kommentarer, verdistemmer/-forslag og personer på listen fra andre kontoer fjernes
--     (bare i demoboet; kontoene og andre bo røres ikke)
--   • «eier»-ønskene i nullstillingen er fordelt på Kari og Lars, så de omstridte gjenstandene fortsatt har
--     minst to interessenter
--   • demokontoene har faste profilnavn (Kari Hansen, Lars Hansen, Mona Hansen-Dahl)
--
-- Sperre (engangs): finnes det ekte kontoer i demoboet, avbrytes migreringen med mindre antallet er bekreftet
-- på forhånd i samme transaksjon:
--   set local arvklart.demo_real_members = '<antall>';
-- Antallet leses først skrivebeskyttet (se supabase/APPLIED.md). Uten ekte kontoer (som i testdatabasen) går
-- den rett gjennom. Kan kjøres flere ganger.
-- Tilbakerulling: rollback/20261024_demo_synthetic_only.down.sql

do $$
declare
  v_estate constant uuid := 'deed0001-0000-0000-0000-000000000001';
  n int;
  expected text := nullif(current_setting('arvklart.demo_real_members', true), '');
begin
  select count(distinct u.id) into n
  from auth.users u
  where coalesce(lower(u.email), '') not like '%.demo@heirsplit.no'
    and (u.id in (select user_id from estate_members where estate_id = v_estate)
      or u.id = (select owner_id from estates where id = v_estate));
  if n > 0 and (expected is null or expected <> n::text) then
    raise exception 'Demoboet har % ekte konto(er). Les antallet skrivebeskyttet først, og bekreft det med: set local arvklart.demo_real_members = ''%'';', n, n;
  end if;
end $$;

create or replace function public.reset_demo_estate()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_estate constant uuid := 'deed0001-0000-0000-0000-000000000001';
  v_kari uuid;
  v_lars uuid;
  v_mona uuid;
  v_demo uuid[];
begin
  select id into v_kari from auth.users where email = 'kari.demo@heirsplit.no';
  select id into v_lars from auth.users where email = 'lars.demo@heirsplit.no';
  select id into v_mona from auth.users where email = 'mona.demo@heirsplit.no';
  if v_kari is null or v_lars is null or v_mona is null or not exists (select 1 from estates where id = v_estate) then
    return; -- demoen er ikke satt opp i denne databasen
  end if;
  v_demo := array[v_kari, v_lars, v_mona];

  -- Bare demokontoene: Mona eier boet, ingen ekte konto er medlem eller står på listen
  update estates set owner_id = v_mona where id = v_estate and owner_id is distinct from v_mona;
  delete from comments where item_id in (select id from items where estate_id = v_estate) and (user_id = v_mona or not (user_id = any(v_demo)));
  delete from interests where item_id in (select id from items where estate_id = v_estate);
  delete from item_passes where item_id in (select id from items where estate_id = v_estate);
  update items set assigned_to = null, assigned_heir_id = null, status = 'active', marked_for_disposal = false, disposition = null,
    value_agree_count = 0, value_disagree_count = 0, value_voter_ids = '{}', value_suggestions = '[]'::jsonb
  where estate_id = v_estate;
  delete from distribution_versions where estate_id = v_estate;
  update heir_representatives set revoked_at = coalesce(revoked_at, now()) where estate_id = v_estate;
  delete from heir_representatives where estate_id = v_estate and not (user_id = any(v_demo));
  delete from heirs where estate_id = v_estate and coalesce(lower(email), '') not like '%.demo@heirsplit.no';
  delete from estate_members where estate_id = v_estate and not (user_id = any(v_demo));
  update profiles set display_name = case user_id when v_kari then 'Kari Hansen' when v_lars then 'Lars Hansen' else 'Mona Hansen-Dahl' end
  where user_id = any(v_demo)
    and display_name is distinct from (case user_id when v_kari then 'Kari Hansen' when v_lars then 'Lars Hansen' else 'Mona Hansen-Dahl' end);

  insert into interests (item_id, user_id, reason)
  select s.item_id, case s.who when 'kari' then v_kari when 'lars' then v_lars else v_mona end, s.reason
  from (values
    ('face0001-0000-0000-0000-000000000001'::uuid, 'lars',  'Jeg husker den fra barndommen — bestemor satt alltid der og strikket'),
    ('face0001-0000-0000-0000-000000000001'::uuid, 'kari',  'Mamma elsket den stolen. Jeg vil ta vare på den til barna mine'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'lars',  'Vi har plass til det i stua og det vil passe perfekt med vår stil'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'mona',  'Vi mangler et skikkelig spisebord — dette er drømmen'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'kari',  'Det hørte alltid til i stua. Jeg kan ikke forestille meg det noe annet sted'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'lars',  'Pappa var veldig glad i dette maleriet. Jeg vil beholde minnet'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'mona',  'Det er det mest verdifulle i boet — og det er vakkert'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'kari',  'Pappa hadde den på seg hver dag. Den betyr mye for meg'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'mona',  'Jeg er den eneste som bruker ur, og det er et klassisk stykke'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'kari',  'Jeg bruker musikkanlegg daglig og dette er av fantastisk kvalitet'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'lars',  'Er stor B&O-fan. Har alltid likt dette anlegget'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'kari',  'Bildene betyr alt. Jeg vil skanne dem og dele digitalt med alle'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'lars',  'Vi bør alle ha tilgang — men noen må oppbevare originalene'),
    ('face0011-0000-0000-0000-000000000011'::uuid, 'mona',  'Jeg har barn som ikke har sett disse bildene ennå'),
    ('face0005-0000-0000-0000-000000000005'::uuid, 'kari',  'Har alltid vært fascinert av den. Vil gjerne ha den i hylla mi'),
    ('face0007-0000-0000-0000-000000000007'::uuid, 'mona',  'Jeg er eneste datter som bruker smykker — og det er mors smykke'),
    ('face0003-0000-0000-0000-000000000003'::uuid, 'lars',  'Jeg er den eneste som har plass til den — og jeg er bibliofil'),
    ('face0009-0000-0000-0000-000000000009'::uuid, 'mona',  'Stavangerflint er en norsk klassiker. Vil bruke det til jul')
  ) as s(item_id, who, reason)
  where exists (select 1 from items where id = s.item_id and estate_id = v_estate)
  on conflict (item_id, user_id) do nothing;

  -- Alle andre enn Mona har sagt nei takk til det de ikke vil ha.
  insert into item_passes (item_id, user_id)
  select i.id, m.user_id
  from items i
  join estate_members m on m.estate_id = i.estate_id
  where i.estate_id = v_estate and m.user_id <> v_mona
    and not exists (select 1 from interests x where x.item_id = i.id and x.user_id = m.user_id)
  on conflict (item_id, user_id) do nothing;

  -- Loggen starter tom for hver besøkende. Dynamisk, så nullstillingen også virker om loggen rulles tilbake.
  if to_regclass('public.estate_events') is not null then
    execute 'delete from public.estate_events where estate_id = $1' using v_estate;
  end if;
end;
$$;
revoke all on function public.reset_demo_estate() from public, anon, authenticated;
grant execute on function public.reset_demo_estate() to service_role;

do $$ begin
  if to_regprocedure('public.apply_function_grants()') is not null then perform public.apply_function_grants(); end if;
end $$;

notify pgrst, 'reload schema';
