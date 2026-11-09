-- Tilbakerulling av 20261109210000_demo_content_fixes.sql: reset_demo_estate() som i 20261109190000_demo_identity.sql
-- (de gamle ønsketekstene). Rettelsene i tittel, beskrivelse og bilde rulles ikke tilbake: de gamle tekstene var feil.
-- Slett også raden i supabase_migrations.schema_migrations hvis migreringen er registrert der.

create or replace function public.reset_demo_estate()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_estate constant uuid := 'deed0001-0000-0000-0000-000000000001';
  v_kari uuid;
  v_lars uuid;
  v_mona uuid;
  v_demo uuid[] := '{}';
  v_emails text[];
  v_role text;
  v_id uuid;
  v_n int;
begin
  -- Demokontoene finnes bare etter merket serveren setter (app_metadata.arvklart_demo). Mangler en konto, er to merket
  -- likt, eller er en merket konto medlem eller eier i et annet bo, stopper nullstillingen, og demo-login slipper ingen inn.
  foreach v_role in array array['kari', 'lars', 'mona'] loop
    select count(*) into v_n from auth.users where raw_app_meta_data ->> 'arvklart_demo' = v_role;
    if v_n = 0 then raise exception 'Demoen er ikke satt opp: ingen konto er merket som demokontoen %', v_role using errcode = 'P0002'; end if;
    if v_n > 1 then raise exception 'Flere kontoer er merket som demokontoen %', v_role; end if;
    select id into v_id from auth.users where raw_app_meta_data ->> 'arvklart_demo' = v_role;
    if exists (select 1 from estate_members where user_id = v_id and estate_id <> v_estate)
       or exists (select 1 from estates where owner_id = v_id and id <> v_estate) then
      raise exception 'Kontoen merket som demokontoen % er medlem eller eier i et annet bo; den røres ikke', v_role;
    end if;
    v_demo := v_demo || v_id;
  end loop;
  v_kari := v_demo[1];
  v_lars := v_demo[2];
  v_mona := v_demo[3];
  if not exists (select 1 from estates where id = v_estate) then
    raise exception 'Demoen er ikke satt opp: demoboet finnes ikke' using errcode = 'P0002';
  end if;
  -- E-postene demokontoene har nå (før og etter byttet til @arvklart.no), for personene på listen
  select array_agg(lower(email)) into v_emails from auth.users where id = any(v_demo) and email is not null;

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
  -- Personene på listen: bare de som er koblet til en demokonto eller har en demokontos e-post (ikke e-postdomenet)
  delete from heirs where estate_id = v_estate
    and not (coalesce(user_id = any(v_demo), false) or coalesce(lower(email) = any(v_emails), false));
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
