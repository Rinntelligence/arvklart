-- Demoinnholdet i «Fam. Hansen sitt bo»: feil rettes, og eksempelsvarene viser bedre hva Arvklart er til for.
--
-- Rettelser (bare når feltet fortsatt har den feilaktige teksten, så en senere rettelse aldri overskrives):
--  • Sofaen (face0002) hadde beskrivelsen til et spisebord i eik. Ny beskrivelse sier bare det bildet viser.
--  • Serviset (face0009) het «Jul middagsservise, 24 deler», med «18 deler», merke og modell i beskrivelsen. Det kan
--    ikke bekreftes, så tittel og beskrivelse er nøytrale.
--  • Gifteringene (face0006) manglet beskrivelse, og ønskene i nullstillingen handlet om et ur.
--  • Maleriet (face0004) ble tilskrevet en oppdiktet maler og årstall. Beskrivelsen sier nå bare hva det viser.
--  • Familiealbumet (face0012) hadde beskrivelsen til en symaskin.
--  • Gitaren (db1836d7) har ikke bilde. Bildet kobles til bare hvis fila deed0001-…/demo__db1836d7.jpg allerede ligger i
--    item-images (lastes opp uten EXIF med supabase/seed/upload_demo_images.mjs); ellers gjøres ingenting.
--
-- Eksempelsvarene (ønskene i reset_demo_estate()) er skrevet om, så et besøk viser at flere i familien kan ønske seg
-- det samme og begrunne det, også med minner, og at de kan snakke sammen om det. Gjenstander som flere ønsker:
-- gyngestolen, sofaen, maleriet, gifteringene og albumet; resten har én interessent. Ellers er reset_demo_estate()
-- lik 20261109190000_demo_identity.sql (demomerket, sperrene). Nullstillingen rører ikke tittel, beskrivelse eller
-- bilde, så rettelsene står etter hver demoinnlogging. Verdiene endres ikke. Demoen nullstilles til slutt, så de nye
-- svarene gjelder straks. Kan kjøres flere ganger.

do $$
declare
  v_estate constant uuid := 'deed0001-0000-0000-0000-000000000001';
  v_prefix text;
begin
  if not exists (select 1 from public.estates where id = v_estate) then
    return; -- ingen demo i denne databasen (f.eks. før seed)
  end if;

  update public.items
     set description = 'Tre-seters sofa i mørkegrønn velur, med to ryggputer, to valseputer og skrå ben i tre.'
   where id = 'face0002-0000-0000-0000-000000000002' and estate_id = v_estate
     and (description is null or description ilike '%spisebord%' or description ilike '%eik%');
  update public.items
     set title = 'Grønn 3-seters sofa'
   where id = 'face0002-0000-0000-0000-000000000002' and estate_id = v_estate
     and title ilike '%bord%';

  update public.items
     set title = 'Middagsservise',
         description = 'Middagsservise fra familiens kjøkken. Antall deler og produsent er ikke registrert.'
   where id = 'face0009-0000-0000-0000-000000000009' and estate_id = v_estate
     and (title ~ '[0-9]+ (deler|stk)' or title ilike '%stavangerflint%'
          or description ilike '%stavangerflint%' or description ilike '%flint blue%' or description ~ '[0-9]+ deler');

  update public.items set description = 'To gifteringer i gull.'
   where id = 'face0006-0000-0000-0000-000000000006' and estate_id = v_estate and (description is null or description = '');
  update public.items
     set description = 'Oljemaleri med en stor blomsterbukett i vase mot mørk bakgrunn. Har hengt i stua så lenge barna kan huske.'
   where id = 'face0004-0000-0000-0000-000000000004' and estate_id = v_estate and description ilike '%Andreassen%';
  update public.items set description = 'Familiealbum med bilder fra 1954–1959.'
   where id = 'face0012-0000-0000-0000-000000000012' and estate_id = v_estate
     and title ilike 'familiealbum%' and (description ilike '%symaskin%' or description ilike '%sykmaskin%');

  -- Gitaren: bildet kobles bare til når fila finnes i bøtten. Adressen tas fra demoboets andre bilder.
  if exists (select 1 from storage.objects where bucket_id = 'item-images' and name = v_estate::text || '/demo__db1836d7.jpg') then
    select regexp_replace(image_url, '[^/]+$', '') into v_prefix
      from public.items where estate_id = v_estate and image_url like '%/item-images/' || v_estate::text || '/%' limit 1;
    if v_prefix is not null then
      update public.items set image_url = v_prefix || 'demo__db1836d7.jpg'
       where id = 'db1836d7-4b59-4036-b95b-37443affed62' and estate_id = v_estate and image_url is null;
    end if;
  end if;
end $$;

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
    ('face0001-0000-0000-0000-000000000001'::uuid, 'lars' , 'Jeg husker den fra barndommen — bestemor satt alltid der og strikket'),
    ('face0001-0000-0000-0000-000000000001'::uuid, 'kari' , 'Mamma elsket den stolen. Jeg vil ta vare på den til barna mine'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'lars' , 'Vi har plass til den i stua, og den passer perfekt hos oss'),
    ('face0002-0000-0000-0000-000000000002'::uuid, 'mona' , 'Her satt vi alle sammen på julaften. Den vil jeg gjerne ha hjemme hos oss'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'kari' , 'Det hørte alltid til i stua. Jeg kan ikke forestille meg det noe annet sted'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'lars' , 'Pappa var veldig glad i dette maleriet. Jeg vil beholde minnet'),
    ('face0004-0000-0000-0000-000000000004'::uuid, 'mona' , 'Det minner meg om søndagsmiddagene hjemme. Kanskje vi kan snakke sammen om hvem som tar vare på det?'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'kari' , 'Mamma og pappa bar disse ringene i over 60 år. De betyr mye for meg'),
    ('face0006-0000-0000-0000-000000000006'::uuid, 'mona' , 'Jeg vil gjerne at ringene går videre til barnebarna. Det kan vi bli enige om sammen'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'kari' , 'Jeg bruker musikkanlegg daglig og dette er av fantastisk kvalitet'),
    ('face0008-0000-0000-0000-000000000008'::uuid, 'lars' , 'Er stor B&O-fan. Har alltid likt dette anlegget'),
    ('face0012-0000-0000-0000-000000000012'::uuid, 'kari' , 'Bildene betyr alt for meg. Jeg vil gjerne skanne dem og dele dem med alle i familien'),
    ('face0012-0000-0000-0000-000000000012'::uuid, 'lars' , 'Vi bør alle få tilgang til bildene — men noen må ta vare på originalene'),
    ('face0012-0000-0000-0000-000000000012'::uuid, 'mona' , 'Barna mine har aldri sett disse bildene. Jeg vil gjerne vise dem hvor de kommer fra'),
    ('face0005-0000-0000-0000-000000000005'::uuid, 'kari' , 'Har alltid vært fascinert av den. Vil gjerne ha den i hylla mi'),
    ('face0007-0000-0000-0000-000000000007'::uuid, 'mona' , 'Mamma hadde det på seg på alle store familiedager. Jeg vil ta godt vare på det'),
    ('face0003-0000-0000-0000-000000000003'::uuid, 'lars' , 'Jeg har plass til den, og jeg vil gjerne ta vare på bøkene til pappa'),
    ('face0009-0000-0000-0000-000000000009'::uuid, 'mona' , 'Vil bruke det når hele familien samles til jul'),
    ('db1836d7-4b59-4036-b95b-37443affed62'::uuid, 'lars' , 'Pappa lærte meg de første grepene på denne gitaren. Jeg vil gjerne spille på den igjen')
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


-- Nullstill demoen nå, så de nye eksempelsvarene gjelder straks (feiler den, rulles hele migreringen tilbake)
do $$ begin
  if exists (select 1 from public.estates where id = 'deed0001-0000-0000-0000-000000000001') then perform public.reset_demo_estate(); end if;
end $$;

do $$ begin
  if to_regprocedure('public.apply_function_grants()') is not null then perform public.apply_function_grants(); end if;
end $$;

notify pgrst, 'reload schema';
