-- Tilgangsreglene testet som ulike brukere. Hver sjekk skriver «OK  …» eller stopper med FAIL.
\set ON_ERROR_STOP 1
-- Hjelpere (som postgres)
create or replace function public.t_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from auth.users where email = p_email), ''), false);
  perform set_config('request.jwt.claim.email', coalesce(p_email, ''), false);
  perform set_config('request.jwt.claim.role', case when p_email is null then 'anon' else 'authenticated' end, false);
end $$;
create or replace function public.t_eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FAIL %: fikk %, ventet %', label, actual, expected; end if;
  raise notice 'OK   %', label;
end $$;
grant execute on function public.t_as(text), public.t_eq(anyelement, anyelement, text) to anon, authenticated;

-- Oppsett: Eva lager et bo og legger til Frank som arving
select t_as('eva@test.no'); set role authenticated;
insert into profiles (user_id, display_name, email, is_founder, plan) values (auth.uid(), 'Eva', 'fake@x.no', true, 'enterprise');
select t_eq((select is_founder from profiles where user_id = auth.uid()), false, 'kan ikke gjøre seg selv til founder ved insert');
select t_eq((select plan from profiles where user_id = auth.uid()), 'free', 'plan tvinges til free');
select t_eq((select email from profiles where user_id = auth.uid()), 'eva@test.no', 'e-post settes fra innloggingen');
update profiles set is_founder = true, plan = 'business', display_name = 'Eva H' where user_id = auth.uid();
select t_eq((select is_founder::text || plan || display_name from profiles where user_id = auth.uid()), 'falsefreeEva H', 'update endrer navn, ikke founder/plan');
-- Språk per konto (20261013_profiles_preferred_lang.sql)
with u as (update profiles set preferred_lang = 'en' where user_id = auth.uid() returning 1)
  select t_eq((select count(*)::int from u), 1, 'bruker kan velge språk på egen profil');
do $$ begin
  update profiles set preferred_lang = 'de' where user_id = auth.uid();
  raise exception 'FAIL: ukjent språk ble lagret';
exception when check_violation then raise notice 'OK   språket må være no eller en';
end $$;
with u as (update profiles set preferred_lang = 'en' where user_id <> auth.uid() returning 1)
  select t_eq((select count(*)::int from u), 0, 'bruker kan ikke endre andres språk');
insert into estates (id, name, owner_id, invite_code) values ('eeee0000-0000-0000-0000-000000000001', 'Evas bo', auth.uid(), 'EVA123');
insert into estate_members (estate_id, user_id, role) values ('eeee0000-0000-0000-0000-000000000001', auth.uid(), 'admin');
insert into heirs (estate_id, name, email, relationship) values ('eeee0000-0000-0000-0000-000000000001', 'Frank', 'frank@test.no', 'Barn');
insert into categories (label, estate_id) values ('Møbler', 'eeee0000-0000-0000-0000-000000000001');
insert into items (id, estate_id, title, added_by) values ('11110000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000001', 'Stol', auth.uid());
reset role;

-- Frank blir med via join_estate
select t_as('frank@test.no'); set role authenticated;
insert into profiles (user_id, display_name) values (auth.uid(), 'Frank');
select t_eq((select count(*)::int from items), 0, 'ikke-medlem ser ingen gjenstander');
select t_eq((select count(*)::int from profiles), 1, 'ser bare egen profil før han er med i et bo');
do $$ begin
  insert into estate_members (estate_id, user_id, role) values ('eeee0000-0000-0000-0000-000000000001', auth.uid(), 'admin');
  raise exception 'FAIL: kunne legge seg selv inn i bo';
exception when insufficient_privilege then raise notice 'OK   kan ikke legge seg selv inn i andres bo';
end $$;
select estate_name from join_estate('eva123');
select t_eq((select count(*)::int from items), 1, 'medlem ser boets gjenstander');
select t_eq((select count(*)::int from profiles), 2, 'ser profilene til dem han deler bo med');
-- Medlem kan ikke tildele
do $$ begin
  update items set assigned_to = auth.uid(), status = 'assigned' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne tildele';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke tildele gjenstander';
end $$;
-- Medlem kan ikke legge inn arvinger (og dermed slippe inn andre)
do $$ begin
  insert into heirs (estate_id, name, email) values ('eeee0000-0000-0000-0000-000000000001', 'Inntrenger', 'outsider@test.no');
  raise exception 'FAIL: medlem kunne legge inn arving';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke legge inn arvinger';
end $$;
update heirs set email = 'outsider@test.no';
select t_eq((select email from heirs where name = 'Frank'), 'frank@test.no', 'medlem kan ikke endre arvingers e-post');
-- Medlem legger inn egen gjenstand, viser interesse, sletter egen gjenstand
insert into items (id, estate_id, title, added_by) values ('11110000-0000-0000-0000-000000000002', 'eeee0000-0000-0000-0000-000000000001', 'Lampe', auth.uid());
do $$ begin
  insert into items (estate_id, title, added_by, status) values ('eeee0000-0000-0000-0000-000000000001', 'Snik', auth.uid(), 'assigned');
  raise exception 'FAIL: kunne opprette tildelt gjenstand';
exception when insufficient_privilege then raise notice 'OK   kan ikke opprette en allerede tildelt gjenstand';
end $$;
do $$ begin
  insert into items (estate_id, title, added_by, value_agree_count, value_voter_ids) values ('eeee0000-0000-0000-0000-000000000001', 'Falske stemmer', auth.uid(), 5, array['00000000-0000-0000-0000-0000000000e1'::uuid]);
  raise exception 'FAIL: kunne opprette gjenstand med andres stemmer';
exception when insufficient_privilege then raise notice 'OK   en ny gjenstand kan bare ha skaperens egen stemme';
end $$;
insert into interests (item_id, user_id) values ('11110000-0000-0000-0000-000000000001', auth.uid());
-- Begrunnelsen på eget ønske kan legges til, endres og fjernes (20261010_interests_reason_update.sql)
with u as (update interests set reason = 'Husker den fra hytta' where item_id = '11110000-0000-0000-0000-000000000001' and user_id = auth.uid() returning 1)
  select t_eq((select count(*)::int from u), 1, 'arving kan legge til begrunnelse på eget ønske');
update interests set reason = null where item_id = '11110000-0000-0000-0000-000000000001' and user_id = auth.uid();
select t_eq((select reason from interests where item_id = '11110000-0000-0000-0000-000000000001' and user_id = auth.uid()), null::text, 'arving kan fjerne begrunnelsen');
update interests set reason = 'Husker den fra hytta' where item_id = '11110000-0000-0000-0000-000000000001' and user_id = auth.uid();
do $$ begin
  update interests set item_id = '11110000-0000-0000-0000-000000000002' where user_id = auth.uid();
  raise exception 'FAIL: kunne flytte ønsket til en annen gjenstand';
exception when insufficient_privilege then raise notice 'OK   kan bare endre begrunnelsen, ikke hvilken gjenstand ønsket gjelder';
end $$;
do $$ begin
  update interests set user_id = '00000000-0000-0000-0000-0000000000f1' where user_id = auth.uid();
  raise exception 'FAIL: kunne gi ønsket til en annen';
exception when insufficient_privilege then raise notice 'OK   kan ikke endre hvem ønsket tilhører';
end $$;
do $$ begin
  update interests set reason = repeat('x', 1001) where user_id = auth.uid();
  raise exception 'FAIL: begrunnelse over 1000 tegn ble lagret';
exception when check_violation then raise notice 'OK   begrunnelsen er begrenset til 1000 tegn';
end $$;
insert into item_passes (item_id, user_id) values ('11110000-0000-0000-0000-000000000002', auth.uid());
with d as (delete from items where id = '11110000-0000-0000-0000-000000000002' returning 1) select t_eq((select count(*)::int from d), 1, 'den som la inn gjenstanden kan slette den');
with d as (delete from items where id = '11110000-0000-0000-0000-000000000001' returning 1) select t_eq((select count(*)::int from d), 0, 'medlem kan ikke slette andres gjenstand');
with d as (delete from categories returning 1) select t_eq((select count(*)::int from d), 0, 'medlem kan ikke slette kategorier');
-- Verdi og kastmerking er fordelingskritiske (20261008_guard_item_value_disposal.sql)
do $$ begin
  update items set estimated_value = '1' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne endre verdien på andres gjenstand';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke endre verdien på andres gjenstand';
end $$;
do $$ begin
  update items set estimate_reasoning = 'Nesten verdiløs' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne endre verdibegrunnelsen';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke endre verdibegrunnelsen på andres gjenstand';
end $$;
do $$ begin
  update items set marked_for_disposal = true where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne merke for kast';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke merke gjenstander for kast';
end $$;
-- Stemmer på verdi skrives bare via vote_item_value() (20261016_value_votes_and_wish_guard.sql)
do $$ begin
  update items set value_agree_count = 99 where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne skrive stemmetelleren direkte';
exception when insufficient_privilege then raise notice 'OK   stemmetellerne kan ikke skrives direkte';
end $$;
do $$ begin
  update items set value_suggestions = '[{"name":"Falsk","value":1}]' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne skrive verdiforslag direkte';
exception when insufficient_privilege then raise notice 'OK   verdiforslag kan ikke skrives direkte';
end $$;
select t_eq((vote_item_value('11110000-0000-0000-0000-000000000001', 'disagree', 1800))->>'ok', 'true', 'medlem kan stemme med eget verdiforslag');
select t_eq((vote_item_value('11110000-0000-0000-0000-000000000001', 'agree'))->>'reason', 'already_voted', 'bare én stemme per person');
select t_eq((select value_disagree_count || ':' || jsonb_array_length(value_suggestions) || ':' || (value_suggestions->-1->>'name') from items where id = '11110000-0000-0000-0000-000000000001'),
  '1:1:Frank', 'stemmen og forslaget lagres med navnet fra profilen');
update items set title = 'Stol i eik', estimated_value = estimated_value where id = '11110000-0000-0000-0000-000000000001';
select t_eq((select title from items where id = '11110000-0000-0000-0000-000000000001'), 'Stol i eik', 'medlem kan fortsatt rette tittel når verdien er uendret');
insert into items (id, estate_id, title, added_by) values ('11110000-0000-0000-0000-000000000003', 'eeee0000-0000-0000-0000-000000000001', 'Klokke', auth.uid());
update items set estimated_value = '2500' where id = '11110000-0000-0000-0000-000000000003';
select t_eq((select estimated_value::text from items where id = '11110000-0000-0000-0000-000000000003'), '2500', 'den som la inn gjenstanden kan sette verdien');
do $$ begin
  update items set marked_for_disposal = true where id = '11110000-0000-0000-0000-000000000003';
  raise exception 'FAIL: medlem kunne merke egen gjenstand for kast';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke merke egen gjenstand for kast heller';
end $$;
-- AI-vurderingen behandles som verdien (20261012_items_ai_analysis.sql)
do $$ begin
  update items set ai_analysis = '{"v":2,"ai":{"suggestion":{"title":"Søppel"}}}' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: medlem kunne endre AI-vurderingen på andres gjenstand';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke endre AI-vurderingen på andres gjenstand';
end $$;
update items set ai_analysis = '{"v":2,"ai":{},"review":{"title":"edited"}}' where id = '11110000-0000-0000-0000-000000000003';
select t_eq((select ai_analysis->'review'->>'title' from items where id = '11110000-0000-0000-0000-000000000003'), 'edited', 'den som la inn gjenstanden kan lagre AI-vurderingen');
do $$ begin
  update items set ai_analysis = '"tekst"' where id = '11110000-0000-0000-0000-000000000003';
  raise exception 'FAIL: AI-vurdering som ikke er et objekt ble lagret';
exception when check_violation then raise notice 'OK   AI-vurderingen må være et JSON-objekt';
end $$;
do $$ begin
  update items set ai_analysis = jsonb_build_object('v', 2, 'pad', repeat('x', 21000)) where id = '11110000-0000-0000-0000-000000000003';
  raise exception 'FAIL: for stor AI-vurdering ble lagret';
exception when check_violation then raise notice 'OK   AI-vurderingen er begrenset i størrelse';
end $$;
-- Poeng kan bare gis via complete_chore
insert into chores (id, estate_id, title, size, points) values ('cccc0000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-000000000001', 'Rydde', 'small', 9999);
do $$ begin
  insert into goodwill_log (estate_id, user_id, event_type, points) values ('eeee0000-0000-0000-0000-000000000001', auth.uid(), 'x', 1000);
  raise exception 'FAIL: kunne gi seg selv poeng';
exception when insufficient_privilege then raise notice 'OK   kan ikke skrive poeng direkte';
end $$;
select complete_chore('cccc0000-0000-0000-0000-000000000001');
select complete_chore('cccc0000-0000-0000-0000-000000000001');
select t_eq((select count(*)::int || ':' || sum(points) from goodwill_log), '1:15', 'oppgave gir poeng én gang, etter størrelse');
-- Storage
insert into storage.objects (bucket_id, name) values ('estate-docs', 'documents/eeee0000-0000-0000-0000-000000000001/testament.pdf');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('estate-docs', 'documents/deed0001-0000-0000-0000-000000000001/x.pdf');
  raise exception 'FAIL: kunne laste opp i annet bo';
exception when insufficient_privilege then raise notice 'OK   kan ikke laste opp dokumenter i andres bo';
end $$;
insert into storage.objects (bucket_id, name, owner) values ('item-images', 'eeee0000-0000-0000-0000-000000000001/item-1.jpg', auth.uid());
do $$ begin
  insert into storage.objects (bucket_id, name) values ('item-images', 'items/random.jpg');
  raise exception 'FAIL: kunne laste opp bilde utenfor boets mappe';
exception when insufficient_privilege then raise notice 'OK   bilder må lastes opp under boets mappe';
end $$;
insert into documents (estate_id, name, file_url, file_path, uploaded_by) values ('eeee0000-0000-0000-0000-000000000001', 'testament.pdf', 'x', 'documents/eeee0000-0000-0000-0000-000000000001/testament.pdf', auth.uid());
update documents set folder = 'will';
select t_eq((select folder from documents), 'will', 'medlem kan flytte dokument til mappe');
reset role;
-- Private gjenstandsbilder (20261014_item_images_private.sql)
select t_eq((select public from storage.buckets where id = 'item-images'), false, 'item-images er privat');
insert into storage.objects (bucket_id, name, owner) values ('item-images', 'eeee0000-0000-0000-0000-000000000001/eva-bilde.jpg', (select id from auth.users where email = 'eva@test.no'));
select t_as('frank@test.no'); set role authenticated;
with d as (delete from storage.objects where name = 'eeee0000-0000-0000-0000-000000000001/eva-bilde.jpg' returning 1)
  select t_eq((select count(*)::int from d), 0, 'medlem kan ikke slette andres bilde');
with d as (delete from storage.objects where name = 'eeee0000-0000-0000-0000-000000000001/item-1.jpg' returning 1)
  select t_eq((select count(*)::int from d), 1, 'medlem kan slette sitt eget bilde');
reset role;
select t_as('eva@test.no'); set role authenticated;
with d as (delete from storage.objects where name = 'eeee0000-0000-0000-0000-000000000001/eva-bilde.jpg' returning 1)
  select t_eq((select count(*)::int from d), 1, 'administrator kan slette bilder i boet');
reset role;
select t_as('outsider@test.no'); set role authenticated;
select t_eq((select count(*)::int from storage.objects where bucket_id = 'item-images'), 0, 'utenforstående ser ingen gjenstandsbilder');
reset role;

-- Frank sender en tilbakemelding og kan lese sin egen (dataeksporten), ikke andres
select t_as('frank@test.no'); set role authenticated;
insert into feedback (user_id, type, content) values (auth.uid(), 'idea', 'Fin app');
reset role;
select t_as('eva@test.no'); set role authenticated;
insert into feedback (user_id, type, content) values (auth.uid(), 'bug', 'Noe feil');
select t_eq((select count(*)::int from feedback), 1, 'ser bare egen tilbakemelding');
reset role;

-- Founder med tofaktor kan endre abonnement via founder_set_plan(); uten tofaktor ikke
insert into founders (user_id) values ('00000000-0000-0000-0000-0000000000e1');
select t_as('eva@test.no'); set role authenticated;
do $$ begin
  perform founder_set_plan('00000000-0000-0000-0000-0000000000f1', 'family');
  raise exception 'FAIL: founder uten tofaktor kunne endre plan';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK   founder uten tofaktor kan ikke endre plan';
end $$;
select set_config('request.jwt.claim.aal', 'aal2', false);
select founder_set_plan('00000000-0000-0000-0000-0000000000f1', 'family');
select set_config('request.jwt.claim.aal', '', false);
reset role;
select t_eq((select plan from profiles where user_id = '00000000-0000-0000-0000-0000000000f1'), 'family', 'founder med tofaktor kan endre plan (trigger slipper gjennom)');

-- Utenforstående ser ingenting
select t_as('outsider@test.no'); set role authenticated;
select t_eq((select count(*)::int from storage.objects), 0, 'utenforstående ser ingen filer');
select t_eq((select count(*)::int from documents) + (select count(*)::int from heirs) + (select count(*)::int from items), 0, 'utenforstående ser ingen dokumenter, arvinger eller gjenstander');
select t_eq((select count(*)::int from profiles), 0, 'utenforstående ser ingen andres profiler');
do $$ begin
  insert into interests (item_id, user_id) values ('11110000-0000-0000-0000-000000000001', auth.uid());
  raise exception 'FAIL: utenforstående kunne vise interesse';
exception when insufficient_privilege then raise notice 'OK   utenforstående kan ikke vise interesse';
end $$;
reset role;
select t_as(null); set role anon;
select t_eq((select count(*)::int from profiles) + (select count(*)::int from estates), 0, 'anon ser ingenting');
reset role;

-- Eva (admin): tildeler, fjerner medlem
select t_as('eva@test.no'); set role authenticated;
select t_eq((select count(*)::int from storage.objects where bucket_id = 'estate-docs'), 1, 'medlem ser boets filer');
-- F1 (20261017): tildeling bare via databasefunksjonene, og alt logges
do $$ begin
  update items set assigned_to = '00000000-0000-0000-0000-0000000000f1'::uuid, status = 'assigned' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: admin kunne tildele med direkte oppdatering';
exception when insufficient_privilege then raise notice 'OK   heller ikke admin kan tildele med direkte oppdatering';
end $$;
select t_eq((assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'manual'))->>'assigned', '1', 'admin kan tildele via assign_items');
select t_eq((select status from items where id = '11110000-0000-0000-0000-000000000001'), 'assigned', 'admin kan tildele');
select t_eq((assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'manual'))->'skipped'->>0, '11110000-0000-0000-0000-000000000001', 'en gjenstand som allerede er tildelt, hoppes over');
select t_eq((select count(*)::int from estate_events where item_id = '11110000-0000-0000-0000-000000000001' and kind = 'assigned' and data->>'method' = 'manual' and actor = auth.uid()), 1, 'tildelingen logges med metode og hvem som gjorde det');
do $$ begin
  perform assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000003","user_id":"00000000-0000-0000-0000-0000000000a9"}]', 'manual');
  raise exception 'FAIL: kunne tildele til en som ikke er medlem';
exception when invalid_parameter_value then raise notice 'OK   kan bare tildele til medlemmer av boet';
end $$;
select t_eq((unassign_item('11110000-0000-0000-0000-000000000001'))->>'ok', 'true', 'admin kan angre tildelingen via unassign_item');
select t_eq((select count(*)::int from estate_events where item_id = '11110000-0000-0000-0000-000000000001' and kind = 'unassigned'), 1, 'angringen logges');
select t_eq((draw_lot('11110000-0000-0000-0000-000000000001'))->>'winner', '00000000-0000-0000-0000-0000000000f1', 'loddtrekningen skjer i databasen blant dem som ønsker gjenstanden');
do $$ begin
  perform assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000e1"}]', 'lottery');
  raise exception 'FAIL: loddtrekningen kunne byttes ut med en annen mottaker';
exception when invalid_parameter_value then raise notice 'OK   tildeling etter loddtrekning må være lik siste trekning';
end $$;
select t_eq((assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'lottery'))->>'assigned', '1', 'vinneren av loddtrekningen kan tildeles');
select t_eq((select data->>'draw_no' || ':' || jsonb_array_length(data->'candidates') from estate_events where item_id = '11110000-0000-0000-0000-000000000001' and kind = 'lottery_draw'), '1:1', 'trekningen logges med kandidater og nummer');
select unassign_item('11110000-0000-0000-0000-000000000001');
-- F3 (20261018): fordelingsverdi, kobling arving–konto og bekreftede andeler
do $$ begin
  update items set agreed_value = 1 where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: admin kunne skrive fordelingsverdien direkte';
exception when insufficient_privilege then raise notice 'OK   fordelingsverdien kan ikke skrives direkte, heller ikke av admin';
end $$;
select t_eq((set_agreed_values('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","value":1200,"source":"heir"}]'))->>'updated', '1', 'admin kan sette fordelingsverdi via set_agreed_values');
select t_eq((select agreed_value::text || ':' || agreed_value_source || ':' || coalesce(estimated_value::text, '-') from items where id = '11110000-0000-0000-0000-000000000001'), '1200.00:heir:-', 'fordelingsverdien holdes atskilt fra AI-anslaget (som er urørt)');
select t_eq((select (data->>'value') || ':' || (data->>'source') from estate_events where item_id = '11110000-0000-0000-0000-000000000001' and kind = 'agreed_value_set' order by id desc limit 1), '1200:heir', 'fordelingsverdien logges med kilde');
do $$ begin
  perform set_agreed_values('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","value":5,"source":"magi"}]');
  raise exception 'FAIL: ukjent kilde ble godtatt';
exception when invalid_parameter_value then raise notice 'OK   kilden må være ai, heir eller manual';
end $$;
select set_agreed_values('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","value":0,"source":"manual"}]');
select t_eq((select agreed_value::text from items where id = '11110000-0000-0000-0000-000000000001'), '0.00', '0 kr kan settes eksplisitt');
select set_agreed_values('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","value":null}]');
select t_eq((select coalesce(agreed_value::text, 'mangler') from items where id = '11110000-0000-0000-0000-000000000001'), 'mangler', 'manglende verdi er null, ikke 0');
select t_eq((select user_id::text || ':' || linked_via from heirs where name = 'Frank'), '00000000-0000-0000-0000-0000000000f1:join_estate', 'arvingen kobles til kontoen når hen selv blir med');
do $$ begin
  update heirs set user_id = auth.uid() where name = 'Frank';
  raise exception 'FAIL: admin kunne koble en arving til en konto';
exception when insufficient_privilege then raise notice 'OK   admin kan ikke koble arving og konto selv';
end $$;
do $$ begin
  insert into heirs (estate_id, name, user_id) values ('eeee0000-0000-0000-0000-000000000001', 'Falsk kobling', auth.uid());
  raise exception 'FAIL: kunne opprette arving med kobling';
exception when insufficient_privilege then raise notice 'OK   koblingen kan ikke settes ved opprettelse';
end $$;
do $$ begin
  perform confirm_shares('eeee0000-0000-0000-0000-000000000001', true);
  raise exception 'FAIL: andeler som ikke summerer til 100 ble bekreftet';
exception when invalid_parameter_value then raise notice 'OK   andelene må summere til 100 for å bekreftes';
end $$;
update heirs set percentage = 100 where name = 'Frank';
select confirm_shares('eeee0000-0000-0000-0000-000000000001', true);
select t_eq((select shares_confirmed from estates where id = 'eeee0000-0000-0000-0000-000000000001'), true, 'admin kan bekrefte andelene');
do $$ begin
  update estates set shares_confirmed = false where id = 'eeee0000-0000-0000-0000-000000000001';
  raise exception 'FAIL: bekreftelsen kunne skrives direkte';
exception when insufficient_privilege then raise notice 'OK   bekreftelsen av andelene kan ikke skrives direkte';
end $$;
update heirs set percentage = 90 where name = 'Frank';
select t_eq((select shares_confirmed from estates where id = 'eeee0000-0000-0000-0000-000000000001'), false, 'endret andel nullstiller bekreftelsen');
select t_eq((select count(*)::int from estate_events where estate_id = 'eeee0000-0000-0000-0000-000000000001' and kind = 'shares_unconfirmed' and data->>'reason' = 'heirs_changed'), 1, 'nullstillingen logges');
update estates set name = 'Evas bo' where id = 'eeee0000-0000-0000-0000-000000000001';
select t_eq((select name from estates where id = 'eeee0000-0000-0000-0000-000000000001'), 'Evas bo', 'admin kan fortsatt endre navnet på boet');
-- F4 (20261019): disponering av gjenstander ingen vil ha
do $$ begin
  update items set disposition = 'discard' where id = '11110000-0000-0000-0000-000000000001';
  raise exception 'FAIL: admin kunne skrive disponering direkte';
exception when insufficient_privilege then raise notice 'OK   disponering kan ikke skrives direkte';
end $$;
select t_eq((set_dispositions('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","disposition":"donate"}]'))->>'updated', '1', 'admin kan sette disponering via set_dispositions');
select t_eq((select disposition from items where id = '11110000-0000-0000-0000-000000000001'), 'donate', 'disponeringen er lagret');
select t_eq((select data->>'disposition' from estate_events where item_id = '11110000-0000-0000-0000-000000000001' and kind = 'disposition_set' order by id desc limit 1), 'donate', 'disponeringen logges');
do $$ begin
  perform set_dispositions('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","disposition":"brenn"}]');
  raise exception 'FAIL: ukjent disponering ble godtatt';
exception when invalid_parameter_value then raise notice 'OK   disponering må være selg, gi bort eller kast';
end $$;
select assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'manual');
select t_eq((select coalesce(disposition, 'uavklart') from items where id = '11110000-0000-0000-0000-000000000001'), 'uavklart', 'tildeling til en arving fjerner disponeringen');
do $$ begin
  perform set_dispositions('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","disposition":"sell"}]');
  raise exception 'FAIL: tildelt gjenstand fikk disponering';
exception when invalid_parameter_value then raise notice 'OK   tildelte gjenstander kan ikke disponeres';
end $$;
select unassign_item('11110000-0000-0000-0000-000000000001');
do $$ begin
  perform anonymize_estate_events(auth.uid());
  raise exception 'FAIL: klienten kunne anonymisere loggen';
exception when insufficient_privilege then raise notice 'OK   klienten kan ikke endre loggen via anonymize_estate_events';
end $$;
update items set marked_for_disposal = true, estimated_value = '100' where id = '11110000-0000-0000-0000-000000000001';
select t_eq((select marked_for_disposal::text || ':' || estimated_value::text from items where id = '11110000-0000-0000-0000-000000000001'), 'true:100', 'admin kan merke for kast og endre verdi');
select assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000003","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'manual');
reset role;
select t_as('frank@test.no'); set role authenticated;
with d as (delete from items where id = '11110000-0000-0000-0000-000000000003' returning 1) select t_eq((select count(*)::int from d), 0, 'kan ikke slette egen gjenstand etter at den er tildelt');
select t_eq((select count(*)::int > 0 from estate_events where estate_id = 'eeee0000-0000-0000-0000-000000000001'), true, 'medlem ser boets logg');
do $$ begin
  insert into estate_events (estate_id, kind) values ('eeee0000-0000-0000-0000-000000000001', 'falsk');
  raise exception 'FAIL: medlem kunne skrive i loggen';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke skrive i loggen';
end $$;
do $$ begin
  delete from estate_events;
  raise exception 'FAIL: medlem kunne slette loggen';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke slette eller endre loggen';
end $$;
do $$ begin
  perform assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000f1"}]', 'manual');
  raise exception 'FAIL: medlem kunne tildele via assign_items';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke tildele via assign_items';
end $$;
do $$ begin
  perform set_agreed_values('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","value":1,"source":"manual"}]');
  raise exception 'FAIL: medlem kunne sette fordelingsverdi';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke sette fordelingsverdi';
end $$;
do $$ begin
  insert into items (estate_id, title, added_by, agreed_value) values ('eeee0000-0000-0000-0000-000000000001', 'Med verdi', auth.uid(), 5);
  raise exception 'FAIL: ny gjenstand med fordelingsverdi ble lagret';
exception when insufficient_privilege then raise notice 'OK   ny gjenstand kan ikke ha fordelingsverdi';
end $$;
do $$ begin
  perform set_dispositions('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","disposition":"discard"}]');
  raise exception 'FAIL: medlem kunne sette disponering';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke sette disponering';
end $$;
do $$ begin
  insert into items (estate_id, title, added_by, disposition) values ('eeee0000-0000-0000-0000-000000000001', 'Med disponering', auth.uid(), 'discard');
  raise exception 'FAIL: ny gjenstand med disponering ble lagret';
exception when insufficient_privilege then raise notice 'OK   ny gjenstand kan ikke ha disponering';
end $$;
do $$ begin
  perform draw_lot('11110000-0000-0000-0000-000000000001');
  raise exception 'FAIL: medlem kunne trekke lodd';
exception when insufficient_privilege then raise notice 'OK   medlem kan ikke trekke lodd';
end $$;
do $$ begin
  insert into interests (item_id, user_id) values ('11110000-0000-0000-0000-000000000003', auth.uid());
  raise exception 'FAIL: ønske på tildelt gjenstand ble lagret';
exception when insufficient_privilege then raise notice 'OK   ønsker kan ikke registreres på tildelte gjenstander';
end $$;
do $$ begin
  insert into item_passes (item_id, user_id) values ('11110000-0000-0000-0000-000000000003', auth.uid());
  raise exception 'FAIL: nei takk på tildelt gjenstand ble lagret';
exception when insufficient_privilege then raise notice 'OK   nei takk kan ikke registreres på tildelte gjenstander';
end $$;
reset role;
select t_as('eva@test.no'); set role authenticated;
do $$ begin
  perform remove_estate_member('eeee0000-0000-0000-0000-000000000001', auth.uid());
  raise exception 'FAIL: eieren ble fjernet';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK   eieren kan ikke fjernes (%)', sqlerrm;
end $$;
with u as (update interests set reason = 'Endret av admin' where user_id <> auth.uid() returning 1)
  select t_eq((select count(*)::int from u), 0, 'admin kan ikke endre andres begrunnelse');
select remove_estate_member('eeee0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'::uuid);
select t_eq((select count(*)::int from estate_members where estate_id = 'eeee0000-0000-0000-0000-000000000001'), 1, 'admin kan fjerne medlem');
select t_eq((select count(*)::int from interests), 0, 'det fjernede medlemmets interesser er borte');
update estates set status = 'closed', closed_at = now() where id = 'eeee0000-0000-0000-0000-000000000001';
select t_eq((select status from estates where id = 'eeee0000-0000-0000-0000-000000000001'), 'closed', 'admin kan avslutte boet');
do $$ begin
  perform assign_items('eeee0000-0000-0000-0000-000000000001', '[{"item_id":"11110000-0000-0000-0000-000000000001","user_id":"00000000-0000-0000-0000-0000000000e1"}]', 'manual');
  raise exception 'FAIL: kunne tildele i et avsluttet bo';
exception when insufficient_privilege then raise notice 'OK   ingen tildeling i et avsluttet bo';
end $$;
reset role;
select t_as('outsider@test.no'); set role authenticated;
select t_eq((select count(*)::int from estate_events), 0, 'utenforstående ser ingen logg');
reset role;

-- Demo: Mona kan vise interesse og fordele, men ikke endre boet
select t_as('mona.demo@heirsplit.no'); set role authenticated;
select t_eq((select count(*)::int > 0 from items), true, 'demo ser demo-boet');
delete from interests where user_id = auth.uid() and item_id = 'face0002-0000-0000-0000-000000000002';
insert into interests (item_id, user_id) values ('face0002-0000-0000-0000-000000000002', auth.uid());
with u as (update interests set reason = 'Fin til hytta' where item_id = 'face0002-0000-0000-0000-000000000002' and user_id = auth.uid() returning 1)
  select t_eq((select count(*)::int from u), 1, 'demo kan endre begrunnelsen på eget ønske');
insert into item_passes (item_id, user_id) values ('face0010-0000-0000-0000-000000000010', auth.uid());
update items set marked_for_disposal = true where id = 'face0012-0000-0000-0000-000000000012';
select assign_items('deed0001-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('item_id', 'face0002-0000-0000-0000-000000000002', 'user_id', auth.uid())), 'manual');
select t_eq((select status from items where id = 'face0002-0000-0000-0000-000000000002'), 'assigned', 'demo kan prøve tildeling');
do $$ begin
  update items set title = 'Hacket' where id = 'face0001-0000-0000-0000-000000000001';
  raise exception 'FAIL: demo kunne endre tittel';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke endre gjenstander';
end $$;
with d as (delete from items returning 1) select t_eq((select count(*)::int from d), 0, 'demo kan ikke slette gjenstander');
with d as (delete from estate_members where user_id <> auth.uid() returning 1) select t_eq((select count(*)::int from d), 0, 'demo kan ikke fjerne andre medlemmer');
select t_eq((select count(*)::int from items where estate_id = 'deed0001-0000-0000-0000-000000000001' and agreed_value is not null) > 0
  and not exists (select 1 from items where estate_id = 'deed0001-0000-0000-0000-000000000001' and estimated_value ~ '^[0-9]+$' and agreed_value is null), true, 'demoen har fordelingsverdier fra anslagene');
do $$ begin
  perform set_agreed_values('deed0001-0000-0000-0000-000000000001', '[{"item_id":"face0001-0000-0000-0000-000000000001","value":1,"source":"manual"}]');
  raise exception 'FAIL: demo kunne endre fordelingsverdi';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke endre fordelingsverdi';
end $$;
select t_eq((set_dispositions('deed0001-0000-0000-0000-000000000001', '[{"item_id":"face0010-0000-0000-0000-000000000010","disposition":"donate"}]'))->>'updated', '1', 'demo kan prøve disponering i demoboet');
do $$ begin
  perform vote_item_value('face0001-0000-0000-0000-000000000001', 'agree');
  raise exception 'FAIL: demo kunne stemme';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke stemme på verdi';
end $$;
do $$ begin
  insert into comments (item_id, user_id, content) values ('face0001-0000-0000-0000-000000000001', auth.uid(), 'spam');
  raise exception 'FAIL: demo kunne kommentere';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke kommentere';
end $$;
do $$ begin
  perform remove_estate_member('deed0001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b'::uuid);
  raise exception 'FAIL: demo kunne fjerne medlem';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke fjerne medlemmer via RPC';
end $$;
update estates set invite_code = 'HACKED';
update profiles set display_name = 'Hacket' where user_id = auth.uid();
update profiles set preferred_lang = 'en' where user_id = auth.uid();
reset role;
select t_eq((select invite_code from estates where id = 'deed0001-0000-0000-0000-000000000001'), 'HANSEN2025', 'demo kan ikke endre invitasjonskoden');
select t_eq((select display_name from profiles where email = 'mona.demo@heirsplit.no'), 'Mona Hansen-Dahl', 'demo kan ikke endre profilen');
select t_eq((select preferred_lang from profiles where email = 'mona.demo@heirsplit.no'), null::text, 'demo kan ikke endre språket på profilen');
-- Eksisterende brukere fra før migreringen (standardverdien 'en' i prod) står som «ikke valgt», altså norsk
select t_eq((select preferred_lang from profiles where user_id = '00000000-0000-0000-0000-0000000000c1'), null::text, 'gamle profiler med standardverdien en er nullstilt');
select t_eq((select column_default::text from information_schema.columns where table_name = 'profiles' and column_name = 'preferred_lang'), null::text, 'språk har ingen standardverdi');

-- Nullstilling av demoen
select reset_demo_estate();
select t_eq((select count(*)::int from interests where item_id::text like 'face%'), 18, 'nullstilling gjenoppretter alle interesser');
select t_eq((select count(*)::int from estate_events where estate_id = 'deed0001-0000-0000-0000-000000000001'), 0, 'nullstilling tømmer demoens logg');
select t_eq((select count(*)::int from items where estate_id = 'deed0001-0000-0000-0000-000000000001' and disposition is not null), 0, 'nullstilling fjerner disponeringene');
select t_eq((select count(*)::int from items where estate_id = 'deed0001-0000-0000-0000-000000000001' and (status = 'assigned' or marked_for_disposal)), 0, 'nullstilling fjerner tildelinger og kast');
select t_eq((select count(*)::int from item_passes p join auth.users u on u.id = p.user_id where u.email = 'mona.demo@heirsplit.no'), 0, 'Mona må selv ta stilling etter nullstilling');
-- Alle andre har tatt stilling til alt: 12 gjenstander × 3 andre medlemmer
select t_eq((select count(*)::int from items i cross join estate_members m
  where i.estate_id = 'deed0001-0000-0000-0000-000000000001' and m.estate_id = i.estate_id
    and m.user_id <> (select id from auth.users where email = 'mona.demo@heirsplit.no')
    and not exists (select 1 from interests x where x.item_id = i.id and x.user_id = m.user_id)
    and not exists (select 1 from item_passes p where p.item_id = i.id and p.user_id = m.user_id)), 0, 'alle andre enn Mona har tatt stilling');

-- AI-kvote: demoen får 5 forsøk per økt, vanlige brukere 30 i timen; klienten kan ikke kalle funksjonen
select t_as('eva@test.no'); set role authenticated;
do $$ begin
  perform claim_ai_call(auth.uid(), 's1', 'x', false);
  raise exception 'FAIL: klienten kunne kalle claim_ai_call';
exception when insufficient_privilege then raise notice 'OK   klienten kan ikke kalle claim_ai_call direkte';
end $$;
reset role;
-- Edge-funksjonen (service_role) får usage_id og kan fylle inn målingene etterpå (20261011_ai_usage_metrics.sql)
-- Frank, ikke Eva: kvotetesten lenger ned teller Evas kall
select t_eq((claim_ai_call((select id from auth.users where email = 'frank@test.no'), 's-metrics', 'analyze-item', false) ? 'usage_id'), true, 'claim_ai_call returnerer usage_id');
update ai_usage set model = 'claude-haiku-5-5', input_tokens = 1200, output_tokens = 300, image_count = 2, latency_ms = 900, cost_usd = 0.00027, outcome = 'ok', attempts = 1
  where session_id = 's-metrics';
select t_eq((select outcome from ai_usage where session_id = 's-metrics'), 'ok', 'målingene kan lagres på raden');
do $$ begin
  update ai_usage set outcome = 'tull' where session_id = 's-metrics';
  raise exception 'FAIL: ukjent utfall ble lagret';
exception when check_violation then raise notice 'OK   utfall må være en kjent verdi';
end $$;

-- Kjøreloggen for automatisk sletting kan bare leses og skrives av service_role
select t_as('eva@test.no'); set role authenticated;
do $$ begin
  perform 1 from cleanup_runs;
  raise exception 'FAIL: innlogget bruker kunne lese cleanup_runs';
exception when insufficient_privilege then raise notice 'OK   innlogget bruker kan ikke lese cleanup_runs';
end $$;
do $$ begin
  insert into cleanup_runs (job) values ('falsk');
  raise exception 'FAIL: innlogget bruker kunne skrive cleanup_runs';
exception when insufficient_privilege then raise notice 'OK   innlogget bruker kan ikke skrive cleanup_runs';
end $$;
reset role;
select t_as(null); set role anon;
do $$ begin
  perform 1 from cleanup_runs;
  raise exception 'FAIL: anon kunne lese cleanup_runs';
exception when insufficient_privilege then raise notice 'OK   anon kan ikke lese cleanup_runs';
end $$;
reset role;
do $$
declare r jsonb; i int;
begin
  for i in 1..5 loop
    r := claim_ai_call('00000000-0000-0000-0000-00000000000d', 'demo-okt-1', 'estimate-value', true);
    if not (r->>'ok')::boolean or (r->>'remaining')::int <> 5 - i then raise exception 'FAIL: demo-forsøk % ga %', i, r; end if;
  end loop;
  r := claim_ai_call('00000000-0000-0000-0000-00000000000d', 'demo-okt-1', 'estimate-value', true);
  if (r->>'ok')::boolean or r->>'reason' <> 'demo_limit' then raise exception 'FAIL: sjette demo-forsøk ga %', r; end if;
  raise notice 'OK   demoen får 5 AI-forsøk per økt, så demo_limit';
  r := claim_ai_call('00000000-0000-0000-0000-00000000000d', 'demo-okt-2', 'analyze-item', true);
  if not (r->>'ok')::boolean or (r->>'remaining')::int <> 4 then raise exception 'FAIL: ny demo-økt ga %', r; end if;
  raise notice 'OK   en ny demo-økt (ny besøkende) får nye forsøk';
  for i in 1..80 loop
    r := claim_ai_call('00000000-0000-0000-0000-0000000000e1', 'eva-okt', 'analyze-item', false);
    if not (r->>'ok')::boolean then raise exception 'FAIL: vanlig bruker stoppet etter % kall', i - 1; end if;
  end loop;
  r := claim_ai_call('00000000-0000-0000-0000-0000000000e1', 'eva-okt', 'analyze-item', false);
  if (r->>'ok')::boolean or r->>'reason' <> 'rate_limit' then raise exception 'FAIL: kall 81 ga %', r; end if;
  raise notice 'OK   vanlige brukere stoppes etter 80 AI-kall i timen (20261015_ai_estate_budget.sql)';
end $$;

-- AI-budsjett per bo (20261015_ai_estate_budget.sql): bare medlemmer kan bruke boets budsjett, og boet
-- stoppes etter 1 500 kall på 30 dager. Kall uten bo teller bare mot brukerens egne grenser.
do $$
declare r jsonb;
  evas_bo constant uuid := 'eeee0000-0000-0000-0000-000000000001';
  frank constant uuid := '00000000-0000-0000-0000-0000000000f1';
begin
  r := claim_ai_call('00000000-0000-0000-0000-0000000000a9', 'utenfor-okt', 'analyze-item', false, evas_bo);
  if (r->>'ok')::boolean or r->>'reason' <> 'not_member' then raise exception 'FAIL: ikke-medlem på boets budsjett ga %', r; end if;
  if exists (select 1 from ai_usage where session_id = 'utenfor-okt') then raise exception 'FAIL: avvist kall ble registrert'; end if;
  raise notice 'OK   den som ikke er medlem, kan ikke bruke boets AI-budsjett';

  -- Frank ble fjernet fra boet lenger opp; han er utenforstående her og legges inn igjen som medlem
  r := claim_ai_call(frank, 'frank-ute', 'analyze-item', false, evas_bo);
  if (r->>'ok')::boolean or r->>'reason' <> 'not_member' then raise exception 'FAIL: fjernet medlem på boets budsjett ga %', r; end if;
  insert into estate_members (estate_id, user_id, role) values (evas_bo, frank, 'member');
  r := claim_ai_call(frank, 'frank-bo', 'analyze-item', false, evas_bo);
  if not (r->>'ok')::boolean then raise exception 'FAIL: medlem ble avvist: %', r; end if;
  if (select estate_id from ai_usage where id = (r->>'usage_id')::bigint) is distinct from evas_bo then raise exception 'FAIL: estate_id ble ikke lagret'; end if;
  raise notice 'OK   medlemmets kall registreres på boet';

  insert into ai_usage (user_id, session_id, fn, estate_id, created_at)
    select frank, 'frank-fylt', 'analyze-item', evas_bo, now() - interval '2 days' from generate_series(1, 1499);
  r := claim_ai_call(frank, 'frank-bo', 'estimate-value', false, evas_bo);
  if (r->>'ok')::boolean or r->>'reason' <> 'estate_limit' then raise exception 'FAIL: kall 1501 for boet ga %', r; end if;
  r := claim_ai_call(frank, 'frank-uten-bo', 'estimate-value', false);
  if not (r->>'ok')::boolean then raise exception 'FAIL: kall uten bo ble stoppet av bo-grensen: %', r; end if;
  raise notice 'OK   boet stoppes etter 1 500 AI-kall på 30 dager; kall uten bo teller bare mot brukeren';

  update ai_usage set created_at = now() - interval '31 days' where session_id = 'frank-fylt';
  r := claim_ai_call(frank, 'frank-bo', 'estimate-value', false, evas_bo);
  if not (r->>'ok')::boolean then raise exception 'FAIL: kall eldre enn 30 dager telte: %', r; end if;
  raise notice 'OK   kall eldre enn 30 dager teller ikke mot boet';
  delete from ai_usage where session_id in ('frank-fylt', 'frank-bo', 'frank-uten-bo');
  delete from estate_members where estate_id = evas_bo and user_id = frank;
end $$;
