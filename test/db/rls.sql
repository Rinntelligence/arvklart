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
insert into interests (item_id, user_id) values ('11110000-0000-0000-0000-000000000001', auth.uid());
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
insert into storage.objects (bucket_id, name) values ('item-images', 'eeee0000-0000-0000-0000-000000000001/item-1.jpg');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('item-images', 'items/random.jpg');
  raise exception 'FAIL: kunne laste opp bilde utenfor boets mappe';
exception when insufficient_privilege then raise notice 'OK   bilder må lastes opp under boets mappe';
end $$;
insert into documents (estate_id, name, file_url, file_path, uploaded_by) values ('eeee0000-0000-0000-0000-000000000001', 'testament.pdf', 'x', 'documents/eeee0000-0000-0000-0000-000000000001/testament.pdf', auth.uid());
update documents set folder = 'will';
select t_eq((select folder from documents), 'will', 'medlem kan flytte dokument til mappe');
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
update items set assigned_to = '00000000-0000-0000-0000-0000000000f1'::uuid, status = 'assigned' where id = '11110000-0000-0000-0000-000000000001';
select t_eq((select status from items where id = '11110000-0000-0000-0000-000000000001'), 'assigned', 'admin kan tildele');
update items set assigned_to = null, status = 'active' where id = '11110000-0000-0000-0000-000000000001';
update items set marked_for_disposal = true, estimated_value = '100' where id = '11110000-0000-0000-0000-000000000001';
select t_eq((select marked_for_disposal::text || ':' || estimated_value::text from items where id = '11110000-0000-0000-0000-000000000001'), 'true:100', 'admin kan merke for kast og endre verdi');
update items set assigned_to = '00000000-0000-0000-0000-0000000000f1'::uuid, status = 'assigned' where id = '11110000-0000-0000-0000-000000000003';
reset role;
select t_as('frank@test.no'); set role authenticated;
with d as (delete from items where id = '11110000-0000-0000-0000-000000000003' returning 1) select t_eq((select count(*)::int from d), 0, 'kan ikke slette egen gjenstand etter at den er tildelt');
reset role;
select t_as('eva@test.no'); set role authenticated;
do $$ begin
  perform remove_estate_member('eeee0000-0000-0000-0000-000000000001', auth.uid());
  raise exception 'FAIL: eieren ble fjernet';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK   eieren kan ikke fjernes (%)', sqlerrm;
end $$;
select remove_estate_member('eeee0000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1'::uuid);
select t_eq((select count(*)::int from estate_members where estate_id = 'eeee0000-0000-0000-0000-000000000001'), 1, 'admin kan fjerne medlem');
select t_eq((select count(*)::int from interests), 0, 'det fjernede medlemmets interesser er borte');
update estates set status = 'closed', closed_at = now() where id = 'eeee0000-0000-0000-0000-000000000001';
select t_eq((select status from estates where id = 'eeee0000-0000-0000-0000-000000000001'), 'closed', 'admin kan avslutte boet');
reset role;

-- Demo: Mona kan vise interesse og fordele, men ikke endre boet
select t_as('mona.demo@heirsplit.no'); set role authenticated;
select t_eq((select count(*)::int > 0 from items), true, 'demo ser demo-boet');
delete from interests where user_id = auth.uid() and item_id = 'face0002-0000-0000-0000-000000000002';
insert into interests (item_id, user_id) values ('face0002-0000-0000-0000-000000000002', auth.uid());
insert into item_passes (item_id, user_id) values ('face0010-0000-0000-0000-000000000010', auth.uid());
update items set marked_for_disposal = true where id = 'face0012-0000-0000-0000-000000000012';
update items set assigned_to = auth.uid(), status = 'assigned' where id = 'face0002-0000-0000-0000-000000000002';
select t_eq((select status from items where id = 'face0002-0000-0000-0000-000000000002'), 'assigned', 'demo kan prøve tildeling');
do $$ begin
  update items set title = 'Hacket' where id = 'face0001-0000-0000-0000-000000000001';
  raise exception 'FAIL: demo kunne endre tittel';
exception when insufficient_privilege then raise notice 'OK   demo kan ikke endre gjenstander';
end $$;
with d as (delete from items returning 1) select t_eq((select count(*)::int from d), 0, 'demo kan ikke slette gjenstander');
with d as (delete from estate_members where user_id <> auth.uid() returning 1) select t_eq((select count(*)::int from d), 0, 'demo kan ikke fjerne andre medlemmer');
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
reset role;
select t_eq((select invite_code from estates where id = 'deed0001-0000-0000-0000-000000000001'), 'HANSEN2025', 'demo kan ikke endre invitasjonskoden');
select t_eq((select display_name from profiles where email = 'mona.demo@heirsplit.no'), 'Mona Hansen-Dahl', 'demo kan ikke endre profilen');

-- Nullstilling av demoen
select reset_demo_estate();
select t_eq((select count(*)::int from interests where item_id::text like 'face%'), 18, 'nullstilling gjenoppretter alle interesser');
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
  for i in 1..30 loop
    r := claim_ai_call('00000000-0000-0000-0000-0000000000e1', 'eva-okt', 'analyze-item', false);
    if not (r->>'ok')::boolean then raise exception 'FAIL: vanlig bruker stoppet etter % kall', i - 1; end if;
  end loop;
  r := claim_ai_call('00000000-0000-0000-0000-0000000000e1', 'eva-okt', 'analyze-item', false);
  if (r->>'ok')::boolean or r->>'reason' <> 'rate_limit' then raise exception 'FAIL: kall 31 ga %', r; end if;
  raise notice 'OK   vanlige brukere stoppes etter 30 AI-kall i timen';
end $$;
