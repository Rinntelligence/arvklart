#!/usr/bin/env bash
# Starter Vite mot en falsk Supabase-adresse (alle kall simuleres i testen) og kjører akseptansetestene
# for «Legg til flere». Krever Chromium (CHROMIUM_PATH, standard /opt/pw-browsers/chromium). Kjør: npm run test:e2e
set -euo pipefail
cd "$(dirname "$0")/../.."
PORT=${PORT:-5179}
VITE_SUPABASE_URL=https://test.supabase.co VITE_SUPABASE_ANON_KEY=test npx vite --port "$PORT" --strictPort >/tmp/arvklart-e2e-vite.log 2>&1 &
VITE=$!
trap 'kill $VITE 2>/dev/null || true' EXIT
until curl -sf "localhost:$PORT" >/dev/null 2>&1; do sleep 1; done
BASE_URL="http://localhost:$PORT" node test/e2e/addItemsPage.mjs
BASE_URL="http://localhost:$PORT" node test/e2e/a11y.mjs
