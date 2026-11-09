#!/usr/bin/env bash
# Starter Vite mot en falsk Supabase-adresse (alle kall simuleres i testen) og kjører akseptansetestene.
# Krever Chromium (CHROMIUM_PATH, standard /opt/pw-browsers/chromium). Kjør: npm run test:e2e
# swipe.mjs sjekker at sveipeknappene synes uten scrolling på vanlige mobilskjermer.
# csp.mjs, seo.mjs, guides.mjs, veiviser.mjs, chunks.mjs og analytics.mjs kjøres til slutt mot bygget (dist, med testinnholdet i
# test/fixtures/content) med hodene og omskrivingene fra vercel.json
# (test/e2e/staticServer.mjs); seo.mjs trenger de forhåndsrendrede sidene, som bare finnes i bygget.
# Alle testfilene kjøres selv om én feiler, slik at resultatet er fullstendig; skriptet feiler til slutt.
set -uo pipefail
cd "$(dirname "$0")/../.."
PORT=${PORT:-5179}
VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npx vite --port "$PORT" --strictPort >/tmp/arvklart-e2e-vite.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null || true' EXIT
until curl -sf "localhost:$PORT" >/dev/null 2>&1; do sleep 1; done
FAILED=()
for t in test/e2e/addItemsPage.mjs test/e2e/a11y.mjs test/e2e/journey.mjs test/e2e/itemGuard.mjs test/e2e/reason.mjs test/e2e/language.mjs test/e2e/images.mjs test/e2e/market.mjs test/e2e/distribution.mjs test/e2e/swipe.mjs; do
  [ -f "$t" ] || continue
  BASE_URL="http://localhost:$PORT" node "$t" || FAILED+=("$t")
done
# Sikkerhetshodene (vercel.json) testes mot det bygde nettstedet; Vite-utviklingsserveren legger inn skript i HTML-en
DIST=$(mktemp -d)
CSP_PORT=$((PORT + 1))
ARVKLART_CONTENT_DIR=test/fixtures/content VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npx vite build --outDir "$DIST" --emptyOutDir >/tmp/arvklart-e2e-build.log 2>&1 || { echo "Bygget feilet"; cat /tmp/arvklart-e2e-build.log; exit 1; }
node test/e2e/staticServer.mjs "$DIST" "$CSP_PORT" &
STATIC=$!
trap 'kill $VITE $STATIC 2>/dev/null || true; rm -rf "$DIST"' EXIT
until curl -sf "localhost:$CSP_PORT" >/dev/null 2>&1; do sleep 1; done
BASE_URL="http://localhost:$CSP_PORT" node test/e2e/csp.mjs || FAILED+=(test/e2e/csp.mjs)
BASE_URL="http://localhost:$CSP_PORT" node test/e2e/seo.mjs || FAILED+=(test/e2e/seo.mjs)
BASE_URL="http://localhost:$CSP_PORT" node test/e2e/guides.mjs || FAILED+=(test/e2e/guides.mjs)
BASE_URL="http://localhost:$CSP_PORT" node test/e2e/veiviser.mjs || FAILED+=(test/e2e/veiviser.mjs)
DIST="$DIST" BASE_URL="http://localhost:$CSP_PORT" node test/e2e/chunks.mjs || FAILED+=(test/e2e/chunks.mjs)
BASE_URL="http://localhost:$CSP_PORT" node test/e2e/analytics.mjs || FAILED+=(test/e2e/analytics.mjs)
if [ ${#FAILED[@]} -gt 0 ]; then echo "Feilet: ${FAILED[*]}"; exit 1; fi
