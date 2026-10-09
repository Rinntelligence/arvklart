# Supabase

Database, lagring og edge-funksjoner for ArvKlart.

```
supabase/
├── legacy/       Opprinnelig oppsett (01–05). Allerede kjørt i produksjon – kjøres bare på en ny, tom database.
├── migrations/   Endringer etter oppsettet, kjøres i navnerekkefølge (YYYYMMDD_navn.sql).
├── rollback/     Tilbakerulling av en migrering (`<migrering>.down.sql`). Kjøres bare ved feil, etter godkjenning.
├── seed/         Demo-boet «Fam. Hansen sitt bo».
└── functions/    Edge-funksjoner (Deno). Felles kode ligger i _shared/.
```

## Ny database fra bunnen

Kjør i SQL Editor, i denne rekkefølgen:

1. `legacy/01_setup.sql` → `05_estate_categories.sql`
2. Alle filene i `migrations/` i navnerekkefølge
3. `seed/demo_estate.sql` (valgfritt; se instruksjonene øverst i filen)
4. Legg inn første founder (se nederst i `migrations/20261006_founder_security.sql`)

## Migrasjoner

- Kjør migrasjonen i SQL Editor **før** frontend som trenger den deployes.
- `20261007_security_hardening.sql` fjerner alle policies på app-tabellene og lager dem på nytt. Nye policies legges derfor inn der, eller i en ny migrasjon. Ikke legg dem inn manuelt i dashboardet.
- Test endringer lokalt med `npm run test:db` (krever Docker). Testen bygger databasen fra filene over og sjekker tilgangsreglene i `test/db/rls.sql`.

## Edge-funksjoner

| Funksjon | Brukes til | Hemmeligheter |
|---|---|---|
| `analyze-item` | AI-analyse av bilde av en gjenstand (Claude Haiku, teller mot AI-kvoten) | `ANTHROPIC_API_KEY`, valgfri `AI_MODEL` |
| `estimate-value` | AI-verdiestimat (Claude Haiku, teller mot AI-kvoten) | `ANTHROPIC_API_KEY`, valgfri `AI_MODEL` |
| `delete-account` | Sletting av egen konto (GDPR) | – |
| `demo-login` | «Test ut demo»: nullstiller demo-boet og logger inn | `DEMO_PASSWORD`, valgfri `DEMO_USER_ID` |
| `cleanup-closed-estates` | Sletter bo som har vært avsluttet i over 12 måneder (daglig, cron) | `CRON_SECRET` |
| `cleanup-orphan-images` | Manuell opprydding av foreldreløse bilder (aldri cron) | `CRON_SECRET` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` og `SUPABASE_SERVICE_ROLE_KEY` legges inn av Supabase automatisk.

```bash
# --use-api pakker funksjonene hos Supabase; Docker i Codespaces når ikke esm.sh
# analyze-item sjekker innloggingen selv (getUser) og kjører i prod med verify_jwt av; behold det
supabase functions deploy analyze-item --no-verify-jwt --use-api
supabase functions deploy estimate-value --use-api
supabase functions deploy delete-account --use-api
supabase functions deploy demo-login --no-verify-jwt --use-api
supabase functions deploy cleanup-closed-estates --no-verify-jwt --use-api
supabase functions deploy cleanup-orphan-images --no-verify-jwt --use-api

supabase secrets set DEMO_PASSWORD='<passordet til mona.demo@heirsplit.no>'
supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
```

Funksjonene `analyze-item`, `estimate-value` og `delete-account` krever innlogget bruker. Sjekk `verify_jwt` per funksjon med `supabase functions list` før deploy, og behold innstillingen som står i prod. `demo-login` og cleanup-funksjonene kalles uten brukerøkt og har derfor `--no-verify-jwt`. Cleanup-funksjonene sjekker i stedet headeren `x-cron-secret` (minst 32 tegn; mangler `CRON_SECRET` eller er den for kort, avvises alle kall). Hemmeligheten sendes bare som header, aldri i URL-en (URL-er logges av Supabase), og skrives aldri ut i svar eller logg.

### AI-modell

- AI-funksjonene bruker Claude Haiku 5.5 (`claude-haiku-5-5`) med strukturert svar (JSON-skjema) og validering (`_shared/aiCore.ts`, `_shared/ai.ts`).
- **Tilbakerulling til Haiku 4.5** gjøres manuelt, uten ny deploy:
  ```bash
  supabase secrets set AI_MODEL=claude-haiku-4-5
  ```
  Fjern hemmeligheten (`supabase secrets unset AI_MODEL`) for å gå tilbake til standard.
- Det finnes ingen automatisk fallback eller ruting mellom modeller.
- Hvert kall logges i `ai_usage`: modell, tokens, antall bilder, tid, anslått kostnad og utfall. Innhold lagres ikke. Målingene krever `20261011_ai_usage_metrics.sql`. Uten migreringen står de bare i funksjonsloggen.
- **Feilkoder til appen:**

  | Kode | HTTP | Betyr |
  |---|---|---|
  | `ai_refused` | 422 | modellen avslo |
  | `ai_invalid` | 502 | ugyldig svar etter ett nytt forsøk |
  | `ai_timeout` | 504 | tidsavbrudd |
  | `ai_busy` | 503 | opptatt |
  | `ai_error` | 502 | annen feil hos AI-tjenesten |
  | `ai_unavailable` | 503 | nøkkel mangler eller er ugyldig |
  | `rate_limit`, `demo_limit` | 429 | kvoten er brukt opp |
  | `error` | 500 | annen feil |

  Råtekst fra feil sendes aldri til appen.

## Flytting av eldre bilder (engangsjobb før privat bøtte)

`migrate-legacy-images` flytter eldre bilder under `items/` og `logos/` inn i boets mappe (`<bo-id>/legacy__…`). Det er nødvendig fordi signerte URL-er og tilgangsreglene krever bo-mappe, og bøtten skal gjøres privat (S3).

Jobben krever `x-cron-secret` med verdien av den egne engangshemmeligheten `LEGACY_IMAGES_SECRET` (`CRON_SECRET` røres ikke) og deployes med `--no-verify-jwt`. Funksjonen og hemmeligheten fjernes når flyttingen er ferdig. Den kjøres i tre steg, og hvert steg krever bekreftelsestokenet fra forrige svar:

1. `{"mode":"dry_run"}` teller referansene og filene. Ingenting endres.
2. `{"mode":"copy","confirm":"<token>"}` kopierer filene, kontrollerer at hver kopi finnes, og peker `items.image_url`, `extra_images` og `estates.branding_logo` om. **Ingenting slettes.** Steget kan kjøres på nytt.
3. `{"mode":"delete_old","confirm":"<token>"}` sletter bare gamle filer som har en kontrollert kopi og som ingenting peker på lenger.

Foreldreløse filer, altså filer uten referanse og uten kopi, røres ikke. De ryddes med `cleanup-orphan-images`. Funksjonen fjernes når jobben er gjort.

## E-postmaler (norsk og engelsk)

Malene for e-postene fra Supabase Auth ligger i `supabase/templates/`. Repoet er kilden. De gjelder først når de er lagt inn i **Supabase Dashboard → Authentication → Email Templates**, og det er en produksjonsendring som må godkjennes.

| Fil | Mal i dashbordet | Emne |
|---|---|---|
| `confirmation.html` | Confirm signup | `Bekreft e-postadressen din / Confirm your email address` |
| `recovery.html` | Reset password | `Tilbakestill passordet ditt / Reset your password` |
| `magic_link.html` | Magic link | `Logg inn i Arvklart / Log in to Arvklart` |
| `email_change.html` | Change email address | `Bekreft ny e-postadresse / Confirm your new email address` |

- **Språk:** norsk er standard. Engelsk brukes når `user_metadata.lang` er `"en"`. Det settes ved registrering (`signUp` i `src/lib/supabase.js`) og når brukeren bytter språk i appen (`changeLanguage`, PR C). Mangler språket, for eksempel hos brukere som registrerte seg før dette, blir e-posten norsk.
- **Emnene:** de er tospråklige, fordi emnefeltet i dashbordet er felles for begge språk.
- **Test:** `go run test/emails/render.go` kjører i CI og sjekker at malene kan tolkes med Go sine maler, og at de gir norsk som standard og engelsk med `lang = "en"`.
- **Før lansering:** de engelske tekstene skal gjennomgås språklig og juridisk.

## Automatisk sletting av avsluttede bo

Personvernerklæringen lover at avsluttede bo slettes etter 12 måneder. En administrator avslutter boet under «Administrer», og da settes `closed_at`.

`cleanup-closed-estates` sletter bo med `status = 'closed'` og `closed_at` eldre enn 12 måneder. For hvert bo, i denne rekkefølgen:

1. **Filer:** dokumenter (`estate-docs/documents/<bo-id>/`), bilder i `item-images/<bo-id>/`, og eldre bilder og logo som boet peker på. Mappene listes side for side og sjekkes på nytt etter slettingen (opptil tre runder). Står noe igjen, stoppes slettingen av dette boet.
2. **Tilbakemeldinger** (`feedback`) knyttet til boet.
3. **Boet.** Gjenstander, interesser, kommentarer, dokumentrader, arvinger, oppgaver og medlemskap går med via `on delete cascade`.

Feiler et steg, blir boet stående og prøves igjen ved neste kjøring. Brukerkontoene slettes ikke; de finnes uavhengig av boet.

**Testmodus:** `POST …/cleanup-closed-estates?dry_run=1` endrer ingenting og viser bare bo-id og antall rader og filer per bo som ville blitt slettet. Rapporten inneholder ingen navn, titler eller filstier.

**Kjørelogg:** hver ekte kjøring lagres i `cleanup_runs` (bare service_role har tilgang):

```sql
select * from cleanup_runs where status <> 'ok' order by started_at desc;      -- feilet, delvis eller krasjet («running»)
select max(started_at) from cleanup_runs where job = 'cleanup-closed-estates'; -- eldre enn to døgn: cron går ikke
```

### Aktivering (ikke gjort ennå)

Hemmeligheten lagres i Vault, så den ikke står i klartekst i `cron.job`:

```sql
create extension if not exists pg_net;
select vault.create_secret('<samme verdi som CRON_SECRET>', 'cleanup_cron_secret');
select cron.schedule('cleanup-closed-estates', '17 3 * * *', $$
  select net.http_post(
    url := 'https://<prosjekt>.supabase.co/functions/v1/cleanup-closed-estates',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000)
$$);
```

`pg_net` legger forespørselen (med headeren) i `net.http_request_queue` til den er sendt. Bare databaseeieren kan lese den tabellen. Svaret ligger noen timer i `net._http_response`.

## Foreldreløse bilder

Bilder i `item-images` som ingen gjenstand eller logo peker på, kan bli liggende. Det gjelder særlig eldre opplastinger under `items/`, som appen ikke selv har lov til å slette. Slike filer slettes **aldri automatisk**, heller ikke ved kontosletting, fordi eierskapet ikke kan dokumenteres sikkert. `cleanup-orphan-images` er en manuell prosess med eksplisitt godkjenning:

1. `POST …/cleanup-orphan-images` (uten body) gir en `dry_run`: antall, størrelse, datoer, fordeling per mappe og et `confirm`-token. Den gir ingen filstier.
2. Etter godkjenning: `POST` med `{ "dry_run": false, "confirm": "<token>" }`. Bare filer eldre enn 30 dager, utenfor et eksisterende bos mappe og uten referanser tas med. Har listen endret seg siden `dry_run`, avvises kallet (409).
