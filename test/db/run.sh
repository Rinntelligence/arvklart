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
for f in supabase/migrations/2026100[7-9]*.sql supabase/migrations/2026101*.sql supabase/migrations/2026102*.sql; do [ -f "$f" ] || continue; "${PSQL[@]}" < "$f" >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: $f"; exit 1; }; done

# En eldre migrering kjørt på nytt etter en nyere skal aldri åpne beskyttede kolonner igjen (protected_columns)
"${PSQL[@]}" < supabase/migrations/20261018_agreed_value_and_shares.sql >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: 20261018"; exit 1; }
OPEN=$("${PSQL[@]}" -tA -c "select count(*) from protected_columns where has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'UPDATE')")
if [ "$OPEN" != "0" ]; then echo "Beskyttede kolonner ble åpnet igjen av en eldre migrering: $OPEN"; exit 1; fi
for f in supabase/migrations/20261019*.sql supabase/migrations/2026102*.sql; do "${PSQL[@]}" < "$f" >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: $f"; exit 1; }; done

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

echo "Spørringer gjennom PostgREST:"
node --test test/db/queries.mjs test/db/cleanup.mjs
