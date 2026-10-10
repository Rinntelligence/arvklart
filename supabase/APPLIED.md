# Migreringer i produksjon

Oversikt over hvilke SQL-filer som er kjørt i produksjonsdatabasen (`swmuztsejghweqmaogol`), og hvordan det er verifisert. Migreringene kjøres manuelt (SQL Editor eller Supabase MCP), og `supabase_migrations.schema_migrations` er derfor ufullstendig. **Oppdater denne filen hver gang noe kjøres i produksjon.**

Sist verifisert: 2026-10-09 (funksjoner, policies, triggere og RLS på `items` lest ut og sammenlignet med repoet før migreringen over); fullstendig 2026-10-08, ved å sammenligne prod med en lokal database bygget fra repoet (som i `test/db/run.sh`). Sammenlignet ble kolonner, constraints, indekser, triggere, RLS, policies (hash av `qual`/`with_check`) og funksjoner (md5 av kildekoden uten `\r`).

## Status per fil

| Fil | I prod | Verifisert slik |
|---|---|---|
| `legacy/01_setup.sql` | ja | tabeller og kolonner finnes (oppsettet fra før repoet) |
| `legacy/02_tasks_documents_heirs.sql` | ja | `tasks`, `documents`, `heirs` finnes |
| `legacy/03_item_ai_columns.sql` | ja | `items.condition/purchase_price/purchase_year` finnes |
| `legacy/04_goodwill.sql` | ja | `chores`, `goodwill_log` finnes. **Avvik:** `chores_size_check` mangler i prod |
| `legacy/05_estate_categories.sql` | ja | `categories.estate_id` + indeks finnes |
| `migrations/20261005_estate_wizard_answers.sql` | ja | `estates.wizard_answers/wizard_updated_at` finnes |
| `migrations/20261005_item_passes.sql` | ja | `item_passes` + policies (hash lik) |
| `migrations/20261005_join_estate_requires_heir.sql` | ja | `join_estate()` kildekode lik |
| `migrations/20261006_founder_security.sql` | ja | `founder_*`-funksjoner lik, `founders`, `founder_audit_log` |
| `migrations/20261007_ai_usage.sql` | ja | `ai_usage`, `claim_ai_call()` lik, rettigheter bare `service_role` |
| `migrations/20261007_demo_reset.sql` | ja | `reset_demo_estate()` lik |
| `migrations/20261007_item_columns.sql` | ja (kolonnene fantes fra før) | **Avvik:** `extra_images` og `value_voter_ids` er `text[]` i prod (filen sier `jsonb`/`uuid[]`; `add column if not exists` endrer ikke typen). Appen virker med begge |
| `migrations/20261007_security_hardening.sql` | ja | alle policies, `guard_item_update`, `is_estate_*`, Storage-policies lik |
| `migrations/20261008_estimate_reasoning.sql` | **ja, 2026-10-08 16:31 UTC** | kjørt med `lock_timeout` via MCP (`schema_migrations` 20261008163106). 223 eksisterende rader uendret (hash før/etter), røyktest som innlogget bruker rullet tilbake |
| `migrations/20261008_revoke_cleanup_old_closed_estates.sql` | **ja, 2026-10-08 16:33 UTC** | `schema_migrations` 20261008163341. `anon`/`authenticated` får 42501, `service_role` kan fortsatt |
| `migrations/20261008_guard_item_value_disposal.sql` | **ja, 2026-10-09 12:11 UTC** | kjørt i én transaksjon med `lock_timeout` 5 s via `supabase db query --linked` (`schema_migrations` 20261009121126), etter at frontend uten «Kast» var i prod. Før: definisjonene hentet ut og bekreftet lik repoet. Etter: md5 for `guard_item_update` = `487b50fa…` (lik filen), ny `items_delete`, kontroll med demokontoene i en transaksjon som ble rullet tilbake (medlem kan ikke kastmerke, admin kan), røyktest i nettleseren 17/17. Tilbakerulling: `rollback/20261008_guard_item_value_disposal.down.sql` |
| `migrations/20261008_cleanup_runs.sql` | **nei** | må kjøres før `cleanup-closed-estates` / `cleanup-orphan-images` deployes (uten tabellen avbrytes kjøringen før noe slettes) |
| `migrations/20261010_interests_reason_update.sql` | **ja, 2026-10-09 15:05 UTC** | `schema_migrations` 20261009150536. Kjørt sammen med 20261011–20261013 i én transaksjon (R4 steg 3). Kontroll: policy `interests_update`, bare `reason` kan oppdateres, lengdesjekk validert (ingen eksisterende over 1000 tegn). Etterkontroll med demokonto (rullet tilbake): egen begrunnelse 1 rad, andres 0, `item_id` låst. Tilbakerulling: `rollback/20261010_interests_reason_update.down.sql` |
| `migrations/20261011_ai_usage_metrics.sql` | **ja, 2026-10-09 15:05 UTC** | `schema_migrations` 20261009150537. Kjørt i samme transaksjon som 20261010, 20261012 og 20261013. Kontroll: 10 målekolonner, `claim_ai_call()` md5 lik repoet (31b03a27…), grensene uendret; etterkontroll ga `usage_id` (rullet tilbake). Tilbakerulling: `rollback/20261011_ai_usage_metrics.down.sql` |
| `migrations/20261012_items_ai_analysis.sql` | **ja, 2026-10-09 15:05 UTC** | `schema_migrations` 20261009150538. Kjørt i samme transaksjon som 20261010, 20261011 og 20261013. Kontroll: `items.ai_analysis` finnes (alle 224 gjenstander har null, ingen omskriving), `guard_item_update()` md5 lik repoet (c81566e4…, før 487b50fa…); etterkontroll: demokonto kan ikke endre `ai_analysis` på andres gjenstand (rullet tilbake). Tilbakerulling: `rollback/20261012_items_ai_analysis.down.sql` |
| `migrations/20261013_profiles_preferred_lang.sql` | **ja, 2026-10-09 15:05 UTC** | `schema_migrations` 20261009150539. Kjørt i samme transaksjon som 20261010–20261012, før frontend fra PR C. Lesesjekk før: alle 27 profiler hadde bare standardverdien `'en'` (ingen hadde valgt). Kontroll: standardverdien er fjernet, alle 27 er `null` (= norsk), sjekk `no`/`en`/null. Tilbakerulling: `rollback/20261013_profiles_preferred_lang.down.sql` |
| `migrations/20261014_item_images_private.sql` | **ja, 2026-10-09 22:32 UTC** | `schema_migrations` 20261009223234 (`item_images_private`). Kjørt etter S2. Før: policyene i prod var lik repoet (rollback-fila gjenskaper dem nøyaktig). Kontroll: `public = false`, ny `item_images_delete` (administrator, eller eier og medlem; ikke demo). Etterkontroll: Storage gir ingen av 301 bilder uten innlogging, signerte URL-er gir 301 av 301, medlemmer i de fire berørte boene ser alle sine bilder, utenforstående 0, opplasting med ekstrabilde og demo virker. **Avvik (lukket 2026-10-10):** Smart CDN svarte fortsatt fra hurtigbufferen på tidligere hentede offentlige URL-er (299 kopier og 134 originaler), sannsynligvis fordi bøtten ble gjort privat med SQL utenom Storage API. Å skrive filer på nytt med samme innhold ugyldiggjorde ikke bufferen (pilot på 5 filer). Lukket med det offisielle CDN Purge API-et (`purgeCache` på én fil som pilot, så `purgeBucketCache('item-images')` 2026-10-10 11:26 UTC): alle 303 aktive og 341 originaler gir 400 uten innhold på den offentlige URL-en, og 303 av 303 virker med signert URL. Lærdom: gjør bøtter private via Storage API, eller kjør `purgeBucketCache` etter en SQL-endring. Tilbakerulling: `rollback/20261014_item_images_private.down.sql` |
| `migrations/20261015_ai_estate_budget.sql` | **ja, 2026-10-09** | `schema_migrations` 20261009175442 (`ai_estate_budget`). Kjørt i én transaksjon etter grønn CI. Kontroll: bare 5-parameterversjonen av `claim_ai_call()` finnes (md5 33513465…), `ai_usage.estate_id` er `uuid`, `authenticated`/`anon` kan ikke kalle funksjonen. Etterkontroll i prod med testbo og testkontoer: kallet registreres på boet, utenforstående får `not_member` (403). Tilbakerulling: `rollback/20261015_ai_estate_budget.down.sql` (deploy forrige versjon av AI-funksjonene først) |
| `migrations/20261016_value_votes_and_wish_guard.sql` | nei | F0: kolonnerettigheter på `items` (stemmekolonnene beskyttet), `vote_item_value()`, ønsker og «nei takk» bare på gjenstander som ikke er tildelt. Kjøres sammen med frontend som stemmer via RPC. Tilbakerulling: `rollback/20261016_value_votes_and_wish_guard.down.sql` |
| `migrations/20261017_estate_events_and_assignment.sql` | nei | F1: `estate_events` (logg), `assign_items`/`unassign_item`/`draw_lot`, `assigned_to`/`status` beskyttet, insert-sperre for tildeling og andres stemmer, logging av ønsker, `anonymize_estate_events` (brukes av `delete-account`, som må deployes sammen), demo-nullstilling tømmer loggen. Krever frontend fra samme PR. Tilbakerulling: `rollback/20261017_estate_events_and_assignment.down.sql` |

## Finnes bare i produksjon (ikke i repoet)

| Objekt | Kommentar |
|---|---|
| migrering `20260921173019_estate_closed_at_and_cleanup` | eneste rad i `schema_migrations` før 2026-10-08 |
| funksjon `cleanup_old_closed_estates()` | gammel SQL-sletting (sletter ikke bilder). Kan nå bare kalles av `service_role`. Bør fjernes når cron for `cleanup-closed-estates` er på plass |
| funksjon og trigger `set_estate_closed_at` på `estates` | setter `closed_at` når `status` endres til/fra `closed`. Forenlig med `AdminPage` |
| `profiles.preferred_market` (default `'ebay'`) | brukes ikke av koden. Alle rader har standardverdien. (`preferred_lang` fantes også her med default `'en'`; ryddet og tatt i bruk av 20261013_profiles_preferred_lang.sql) |
| FK `comments_profile_fkey`, `comments_user_id_fkey`, `interests_profile_fkey` → `profiles(user_id)` | repoet har FK til `auth.users` |
| indekser `items_estate_id_idx`, `interests_item_id_idx` | nyttige, mangler i repoet |
| `rls_auto_enable()` + event-trigger `ensure_rls` | Supabase-plattformens funksjon, ikke vår |
| extensions: `pg_cron` 1.6.4 og `supabase_vault` 0.3.1 installert, `pg_net` ikke installert | `cron.job` er tom |

## Engangsjobber

| Jobb | Kjørt | Resultat |
|---|---|---|
| S2 `migrate-legacy-images` (copy) | **ja, 2026-10-09 22:16 UTC** | 278 bilder kopiert fra `items/` til `<bo-id>/legacy__…` og 193 gjenstander pekt om (85 ekstrabilder i 67 gjenstander); 0 feil, 0 gamle referanser igjen. Kontroll: alle kopier finnes i riktig bo, like store som originalen; alle 278 lastet over HTTP. Originalene ble beholdt til sletting var godkjent |
| Sikkerhetskopi før sletting | **ja, 2026-10-10 12:05 UTC** | Fullt innhold av alle 341 filer i `items/` (278 originaler + 63 ubrukte, 1 048 MB) med SHA-256-manifest, lagret lokalt hos eieren utenfor Storage og utenfor repoet. Verifisert: 341/341 leses og stemmer med manifestet, de 278 kopiene i boene er byte-identiske med originalene, og en gjenoppretting (opplasting fra kopien) ga identisk fil |
| S2 `delete_old` (originaler) | **ja, 2026-10-10 12:08 UTC** | 278 originaler slettet. Tokenet fra tørrkjøringen var lik SHA-256 av den verifiserte originallisten. Før: 0 aktive referanser til `items/` |
| Sletting av ubrukte filer | **ja, 2026-10-10 12:09 UTC** | 63 filer i `items/` uten kopi og uten referanse i noen tekst-, jsonb- eller array-kolonne i `public`, og uten bruk i koden, slettet med eksplisitt liste via Storage API etter kontroll av at nøyaktig disse 63 var igjen. `items/` er tom |
| CDN-purge etter sletting | **ja, 2026-10-10 12:09 UTC** | `purgeBucketCache('item-images')`. Etterkontroll: 0 av 341 slettede filer åpne via gamle offentlige URL-er, 303/303 aktive bilder virker med signert URL og 0 offentlig, 0 av 307 bildereferanser peker til manglende fil, medlemmer i de fire berørte boene ser alle sine bilder, utenforstående 0. Opplasting med ekstrabilde, visning og demo testet |
| Opprydding | **ja, 2026-10-10 12:15 UTC** | `migrate-legacy-images` slettet, `LEGACY_IMAGES_SECRET` fjernet, testkontoene (`arvklart-prodtest-*`) og testboet slettet med filer (kontrollert: bare testkontoer som medlemmer). Ingen ekte brukerdata berørt |

## Edge-funksjoner

| Funksjon | Prod-versjon | Lik repo | Merknad |
|---|---|---|---|
| `analyze-item` | v16 | ja (main 2026-10-09) | U2 (effort `low`, cache av systemprompten; `ANALYZE_EFFORT=medium` ruller tilbake uten deploy) og U3 (`estate_id`). `verify_jwt: false` (sjekker innlogging selv) |
| `estimate-value` | v15 | ja (main 2026-10-09) | v3: markedsmotoren med familiens sammenligninger, rettelser fra U1, AI-budsjett per bo. `verify_jwt: true` |
| `delete-account` | v8 | ja (main 2026-10-09) | S4. Testet i prod med egne testkontoer. `verify_jwt: false` (sjekker innlogging selv) |
| `demo-login` | v6 | ja | |
| `cleanup-closed-estates` | v6 | nei fra 2026-10-08 | repoet har ny versjon (paginering, dry_run, kjørelogg, tilbakemeldinger). Ikke deployet; ingen cron-jobb |
| `cleanup-orphan-images` | – | ny i repoet | ikke deployet |

Merk: `supabase secrets set`/`unset` lager en ny versjon av alle funksjonene (uten kodeendring). Derfor økte også `demo-login` og `cleanup-closed-estates`. `migrate-legacy-images` (S2) er slettet etter bruk.

## Status S1–S4 (personvern for bilder og konto)

Fullført 2026-10-10: S1 signerte bilde-URL-er, S2 eldre bilder flyttet inn i bo-mapper, S3 privat `item-images` med strengere sletterett, S4 `delete-account` v2 og utvidet dataeksport. Gjenværende forbehold:

- Sikkerhetskopien av de slettede filene finnes bare lokalt hos eieren (én kopi). Supabase sine daglige backuper dekker ikke Storage-filer.
- Personverntekstene fra S4 skal gjennomgås juridisk.
- CDN-buffer: gjør bøtter private via Storage API, eller kjør `purgeBucketCache` etter en SQL-endring (se 20261014 over).
- Nettlesere kan ha en offentlig bilde-URL i lokal buffer i inntil 1 time etter siste offentlige visning (`max-age=3600`); appen har brukt signerte URL-er siden S1.

## Plan for varig sporing (ikke innført)

Målet er at `supabase_migrations.schema_migrations` er sannheten, og at drift oppdages automatisk.

1. **Unike versjoner.** Supabase CLI bruker tallet foran første `_` som versjon (primærnøkkel). I dag deler flere filer samme dato (3 × `20261005`, 4 × `20261007`, 2 × `20261008`), så de kan ikke spores slik de heter. Nye filer får navnet `YYYYMMDDHHMMSS_navn.sql` (endring av konvensjonen i CLAUDE.md).
2. **Gi eksisterende filer nytt navn** med unike tidsstempler i dagens rekkefølge. De to filene fra 2026-10-08 får versjonene som allerede er registrert (`20261008163106`, `20261008163341`). `test/db/run.sh` kjører `migrations/*.sql` i alfabetisk rekkefølge, så den virker uendret.
3. **Registrer historikken** én gang: `supabase migration repair --status applied <versjon>` for hver fil som er verifisert over. Det skriver bare til `schema_migrations` og kjører ingen SQL.
4. **Videre:** nye migreringer kjøres med `supabase db push` eller Supabase MCP `apply_migration` med samme navn som filen, aldri som løs SQL. `supabase migration list` viser da eventuelle avvik mellom repo og prod.
5. **Drift-sjekk før hver migrering:** spørringene som ble brukt 2026-10-08 (kolonner, policy-hash, funksjons-hash) legges i `test/db/prod_drift.sql`, og resultatet sammenlignes med en lokal bygging. Vurder senere en planlagt GitHub Action.
6. **Testskjema lik prod:** legg prod-typene (`text[]`) og prod-only objektene inn i `test/db/live_extras.sql`, slik at `npm run test:db` tester det som faktisk kjører.
7. **Rekkefølge ved deploy:** migrering først, så edge-funksjoner, så frontend (`main` deployes automatisk av Vercel).
