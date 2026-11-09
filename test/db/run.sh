#!/usr/bin/env bash
# Tester databasen slik den blir etter alle SQL-filene i supabase/: tilgangsregler (rls.sql)
# og appens spørringer gjennom PostgREST (queries.mjs). Krever Docker. Kjør: npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."

DB=arvklart-test-db
API=arvklart-test-api
cleanup() { docker rm -f "$DB" "$API" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$DB" -p 54330:3000 -e POSTGRES_PASSWORD=test postgres:15 >/dev/null
# Postgres-imaget starter på nytt etter initialiseringen; vent på den endelige serveren
until docker logs "$DB" 2>&1 | grep -q "PostgreSQL init process complete" \
  && docker exec "$DB" psql -U postgres -c 'select 1' >/dev/null 2>&1; do sleep 1; done

PSQL=(docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q)
FILES=(
  test/db/supabase_stub.sql
  supabase/legacy/01_setup.sql
  supabase/legacy/02_tasks_documents_heirs.sql
  supabase/legacy/03_item_ai_columns.sql
  supabase/legacy/04_goodwill.sql
  supabase/legacy/05_estate_categories.sql
  test/db/live_extras.sql
  supabase/migrations/*.sql
  supabase/seed/demo_estate.sql
)
for f in ${FILES[@]}; do
  "${PSQL[@]}" < "$f" >/dev/null 2>/tmp/arvklart-sql.err || { echo "Feil i $f:"; cat /tmp/arvklart-sql.err; exit 1; }
done
# Migrasjonene skal tåle å kjøres to ganger
for f in supabase/migrations/2026100[7-9]*.sql supabase/migrations/2026101*.sql supabase/migrations/2026102*.sql supabase/migrations/202611*.sql; do [ -f "$f" ] || continue; "${PSQL[@]}" < "$f" >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: $f"; exit 1; }; done

# En eldre migrering kjørt på nytt etter en nyere skal aldri åpne beskyttede kolonner igjen (protected_columns)
"${PSQL[@]}" < supabase/migrations/20261018_agreed_value_and_shares.sql >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: 20261018"; exit 1; }
OPEN=$("${PSQL[@]}" -tA -c "select count(*) from protected_columns where has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'UPDATE')")
if [ "$OPEN" != "0" ]; then echo "Beskyttede kolonner ble åpnet igjen av en eldre migrering: $OPEN"; exit 1; fi
for f in supabase/migrations/20261019*.sql supabase/migrations/2026102*.sql supabase/migrations/202611*.sql; do "${PSQL[@]}" < "$f" >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: $f"; exit 1; }; done

# Sperren i 20261109190000_demo_identity.sql: migreringen avbryter (og lagrer ingenting) hvis en demokonto ikke er merket,
# eller hvis en merket konto er medlem i et annet bo enn demoboet (en ekte konto merket ved en feil)
guard() { ( echo "begin; $1"; cat supabase/migrations/20261109190000_demo_identity.sql; echo "rollback;" ) | "${PSQL[@]}" 2>&1 >/dev/null || true; }
OUT=$(guard "update auth.users set raw_app_meta_data = '{}' where email = 'lars.demo@heirsplit.no';")
echo "$OUT" | grep -q "Avbrutt: 0 konto(er) er merket som demokontoen lars" || { echo "20261109 avbrøt ikke når Lars ikke var merket: $OUT"; exit 1; }
OUT=$(guard "update auth.users set raw_app_meta_data = '{}' where email = 'kari.demo@heirsplit.no'; update auth.users set raw_app_meta_data = '{\"arvklart_demo\":\"kari\"}' where email = 'eva@test.no'; insert into estates (name, owner_id, invite_code) select 'Evas bo', id, 'EVA' || substr(md5(random()::text), 1, 5) from auth.users where email = 'eva@test.no';")
echo "$OUT" | grep -q "Avbrutt: 1 merket konto(er) er medlem eller eier i et annet bo" || { echo "20261109 avbrøt ikke for en merket konto i et annet bo: $OUT"; exit 1; }
if [ "$("${PSQL[@]}" -tA -c "select count(*) from auth.users where raw_app_meta_data ? 'arvklart_demo'")" != "3" ]; then echo "Sperretesten for 20261109 endret merkingen"; exit 1; fi

# 20261109210000_demo_content_fixes.sql mot demoboet slik det var i produksjon (sofa med spisebordtekst, servise med
# «24 deler»/«18 deler» og merke, gitar uten bilde), i en transaksjon som rulles tilbake. Uten bildefil skal gitaren
# stå uten bilde; med fila i item-images kobles den til. Andre gjenstander og verdiene endres ikke, og
# nullstillingen etterpå tar ikke rettelsene tilbake.
content_fix() { ( echo "begin;"; cat <<'SQL'
update items set title = 'Grønn 3-seters sofa', description = 'Solid spisebord i eik, ca. 1920. Plass til 10 personer. Har vært familiens midtpunkt i tre generasjoner. Noe slitasje, men i god stand.' where id = 'face0002-0000-0000-0000-000000000002';
update items set title = 'Jul middagsservise, 24 deler', description = 'Komplett middagsservise i Stavangerflint, 1960-modellen «Flint Blue». 18 deler. Noe slitasje på tallerkener, ingen sprekker.' where id = 'face0009-0000-0000-0000-000000000009';
update interests set reason = 'Vi mangler et skikkelig spisebord — dette er drømmen' where item_id = 'face0002-0000-0000-0000-000000000002' and user_id = (select id from auth.users where email = 'mona.demo@heirsplit.no');
update items set description = null where id = 'face0006-0000-0000-0000-000000000006';
update items set description = 'Signert oljemaleri av norsk maler K. Andreassen, 1978. 80×120 cm. Har hengt i stua siden 1980. Originalt pynteramme i gull.' where id = 'face0004-0000-0000-0000-000000000004';
update items set title = 'Familiealbum 1954-1959', description = 'Elektrisk Singer-sykmaskin fra 1938, arvet fra oldemor. Sjelden modell i trefrems-utførelse. Fungerer med ny ledning.' where id = 'face0012-0000-0000-0000-000000000012';
insert into items (id, estate_id, title, description, condition, added_by_name, status) values ('db1836d7-4b59-4036-b95b-37443affed62', 'deed0001-0000-0000-0000-000000000001', 'Sigma akustisk gitar', 'Akustisk gitar fra Sigma Guitars.', 'good', 'Demo', 'active');
create temp table f_before as select md5(string_agg(t::text, ',' order by t.id)) as others, (select md5(string_agg(concat_ws('/', id, estimated_value, agreed_value), ',' order by id)) from items) as vals
  from items t where t.id not in ('face0002-0000-0000-0000-000000000002', 'face0009-0000-0000-0000-000000000009', 'face0004-0000-0000-0000-000000000004', 'face0006-0000-0000-0000-000000000006', 'face0012-0000-0000-0000-000000000012', 'db1836d7-4b59-4036-b95b-37443affed62');
SQL
echo "$1"; cat supabase/migrations/20261109210000_demo_content_fixes.sql; cat <<'SQL'
do $$
declare v_url text; v_other text;
begin
  if (select description from items where id = 'face0002-0000-0000-0000-000000000002') <> 'Tre-seters sofa i mørkegrønn velur, med to ryggputer, to valseputer og skrå ben i tre.' then raise exception 'FEIL: sofaen'; end if;
  if (select title || ' | ' || description from items where id = 'face0009-0000-0000-0000-000000000009') <> 'Middagsservise | Middagsservise fra familiens kjøkken. Antall deler og produsent er ikke registrert.' then raise exception 'FEIL: serviset'; end if;
  if (select description from items where id = 'face0006-0000-0000-0000-000000000006') <> 'To gifteringer i gull.'
     or (select description from items where id = 'face0004-0000-0000-0000-000000000004') ~* 'andreassen|80×120'
     or (select description from items where id = 'face0012-0000-0000-0000-000000000012') <> 'Familiealbum med bilder fra 1954–1959.' then raise exception 'FEIL: gifteringer, maleri eller album'; end if;
  if exists (select 1 from interests x join items i on i.id = x.item_id where i.estate_id = 'deed0001-0000-0000-0000-000000000001' and x.reason ~* 'spisebord|stavangerflint|\mur\M') then raise exception 'FEIL: ønsketekst'; end if;
  if (select count(*) from interests where item_id = 'db1836d7-4b59-4036-b95b-37443affed62') <> 1 then raise exception 'FEIL: gitaren har ikke Lars sitt ønske'; end if;
  if (select count(*) from (select item_id from interests x join items i on i.id = x.item_id where i.estate_id = 'deed0001-0000-0000-0000-000000000001' group by item_id having count(*) >= 2) c) < 4 then raise exception 'FEIL: for få gjenstander som flere ønsker'; end if;
  if (select md5(string_agg(t::text, ',' order by t.id)) from items t where t.id not in ('face0002-0000-0000-0000-000000000002', 'face0009-0000-0000-0000-000000000009', 'face0004-0000-0000-0000-000000000004', 'face0006-0000-0000-0000-000000000006', 'face0012-0000-0000-0000-000000000012', 'db1836d7-4b59-4036-b95b-37443affed62')) <> (select others from f_before) then raise exception 'FEIL: andre gjenstander endret'; end if;
  if (select md5(string_agg(concat_ws('/', id, estimated_value, agreed_value), ',' order by id)) from items) <> (select vals from f_before) then raise exception 'FEIL: verdier endret'; end if;
  select image_url into v_url from items where id = 'db1836d7-4b59-4036-b95b-37443affed62';
  select regexp_replace(image_url, '[^/]+$', '') into v_other from items where id = 'face0001-0000-0000-0000-000000000001';
  if exists (select 1 from storage.objects where name = 'deed0001-0000-0000-0000-000000000001/demo__db1836d7.jpg') then
    if v_url is distinct from v_other || 'demo__db1836d7.jpg' then raise exception 'FEIL: gitarbildet ble ikke koblet til (%)', v_url; end if;
  elsif v_url is not null then raise exception 'FEIL: gitaren fikk bilde uten fil'; end if;
  perform reset_demo_estate();
  if (select description from items where id = 'face0002-0000-0000-0000-000000000002') not like 'Tre-seters sofa%'
     or (select title from items where id = 'face0009-0000-0000-0000-000000000009') <> 'Middagsservise' then raise exception 'FEIL: nullstillingen tok rettelsene tilbake'; end if;
  if exists (select 1 from interests x join items i on i.id = x.item_id where i.estate_id = 'deed0001-0000-0000-0000-000000000001' and x.reason ~* 'spisebord|stavangerflint') then raise exception 'FEIL: nullstillingen la inn gamle ønsketekster'; end if;
  if (select image_url from items where id = 'db1836d7-4b59-4036-b95b-37443affed62') is distinct from v_url then raise exception 'FEIL: nullstillingen endret gitarbildet'; end if;
  raise notice 'INNHOLD OK';
end $$;
SQL
echo "rollback;" ) | "${PSQL[@]}" 2>&1 >/dev/null || true; }
OUT=$(content_fix "")
echo "$OUT" | grep -q "INNHOLD OK" || { echo "20261109210000 (uten bildefil): $OUT"; exit 1; }
OUT=$(content_fix "insert into storage.buckets (id, name) values ('item-images', 'item-images') on conflict do nothing; insert into storage.objects (bucket_id, name) values ('item-images', 'deed0001-0000-0000-0000-000000000001/demo__db1836d7.jpg');")
echo "$OUT" | grep -q "INNHOLD OK" || { echo "20261109210000 (med bildefil): $OUT"; exit 1; }

# Ingen funksjon i public kan kalles av anon, og authenticated kan bare kalle dem i client_functions
FNS="from pg_proc p where p.pronamespace = 'public'::regnamespace and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')"
ANON=$("${PSQL[@]}" -tA -c "select string_agg(p.oid::regprocedure::text, ', ') $FNS and has_function_privilege('anon', p.oid, 'EXECUTE')")
if [ -n "$ANON" ]; then echo "anon kan kalle funksjoner: $ANON"; exit 1; fi
EXTRA=$("${PSQL[@]}" -tA -c "select string_agg(p.oid::regprocedure::text, ', ') $FNS and has_function_privilege('authenticated', p.oid, 'EXECUTE') and p.oid not in (select to_regprocedure(signature) from client_functions where to_regprocedure(signature) is not null)")
if [ -n "$EXTRA" ]; then echo "authenticated kan kalle funksjoner som ikke står i client_functions (legg dem inn og kjør apply_function_grants()): $EXTRA"; exit 1; fi
MISSING=$("${PSQL[@]}" -tA -c "select string_agg(signature, ', ') from client_functions where to_regprocedure(signature) is null")
if [ -n "$MISSING" ]; then echo "client_functions viser til funksjoner som ikke finnes: $MISSING"; exit 1; fi

# Alle RPC-ene appen kaller (supabase.rpc('…') i src/), må stå i client_functions, ellers bryter appen etter 20261022
APP_RPCS=$(grep -rhoE "rpc\('[a-z_]+'" src | sed -E "s/rpc\('([a-z_]+)'/\1/" | sort -u | paste -sd, -)
NOT_GRANTED=$("${PSQL[@]}" -tA -c "select string_agg(n, ', ') from unnest(string_to_array('$APP_RPCS', ',')) n where not exists (select 1 from client_functions c where c.reason = 'rpc' and split_part(split_part(c.signature, '(', 1), '.', 2) = n)")
if [ -n "$NOT_GRANTED" ]; then echo "Appen kaller RPC-er som ikke står i client_functions: $NOT_GRANTED"; exit 1; fi

echo "Tilgangsregler:"
# Felles tilfeller for «avklart gjenstand» (samme som test/estate/settled.test.js)
OUT=$("${PSQL[@]}" -v cases="$(cat test/fixtures/settled_cases.json)" < test/db/rls.sql 2>&1 || true)
echo "$OUT" | grep -oE "(OK|FAIL) .*|ERROR: .*" | sed 's/^/  /'
if echo "$OUT" | grep -qE "FAIL|ERROR"; then exit 1; fi

docker run -d --name "$API" --network "container:$DB" \
  -e PGRST_DB_URI="postgres://authenticator:test@localhost:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters" \
  -e PGRST_SERVER_PORT=3000 postgrest/postgrest:v12.2.3 >/dev/null
until curl -sf localhost:54330/ >/dev/null 2>&1; do sleep 1; done

# Demoboet i kjent tilstand (bare syntetiske kontoer, ønsker og «nei takk» lagt inn), uavhengig av hva rls.sql gjorde
"${PSQL[@]}" -q -c "select reset_demo_estate()" >/dev/null
echo "Spørringer gjennom PostgREST:"
node --test test/db/queries.mjs test/db/cleanup.mjs
