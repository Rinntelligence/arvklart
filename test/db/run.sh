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
for f in supabase/migrations/2026100[7-9]*.sql; do "${PSQL[@]}" < "$f" >/dev/null 2>&1 || { echo "Kan ikke kjøres på nytt: $f"; exit 1; }; done

echo "Tilgangsregler:"
OUT=$("${PSQL[@]}" < test/db/rls.sql 2>&1 || true)
echo "$OUT" | grep -oE "(OK|FAIL) .*|ERROR: .*" | sed 's/^/  /'
if echo "$OUT" | grep -qE "FAIL|ERROR"; then exit 1; fi

docker run -d --name "$API" --network "container:$DB" \
  -e PGRST_DB_URI="postgres://authenticator:test@localhost:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters" \
  -e PGRST_SERVER_PORT=3000 postgrest/postgrest:v12.2.3 >/dev/null
until curl -sf localhost:54330/ >/dev/null 2>&1; do sleep 1; done

echo "Spørringer gjennom PostgREST:"
node --test test/db/queries.mjs test/db/cleanup.mjs
