# Supabase

Database, lagring og edge-funksjoner for ArvKlart.

```
supabase/
├── legacy/       Opprinnelig oppsett (01–05). Allerede kjørt i produksjon – kjøres bare på en ny, tom database.
├── migrations/   Endringer etter oppsettet, kjøres i navnerekkefølge (YYYYMMDD_navn.sql).
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
| `analyze-item` | AI-analyse av bilde av en gjenstand | `ANTHROPIC_API_KEY` |
| `estimate-value` | AI-verdiestimat | `ANTHROPIC_API_KEY` |
| `delete-account` | Sletting av egen konto (GDPR) | – |
| `demo-login` | «Test ut demo»: nullstiller demo-boet og logger inn | `DEMO_PASSWORD`, valgfri `DEMO_USER_ID` |
| `cleanup-closed-estates` | Sletter bo som har vært avsluttet i over 12 måneder | `CRON_SECRET` |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` og `SUPABASE_SERVICE_ROLE_KEY` legges inn av Supabase automatisk.

```bash
# --use-api pakker funksjonene hos Supabase; Docker i Codespaces når ikke esm.sh
supabase functions deploy analyze-item --use-api
supabase functions deploy estimate-value --use-api
supabase functions deploy delete-account --use-api
supabase functions deploy demo-login --no-verify-jwt --use-api
supabase functions deploy cleanup-closed-estates --no-verify-jwt --use-api

supabase secrets set DEMO_PASSWORD='<passordet til mona.demo@heirsplit.no>'
supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
```

Funksjonene `analyze-item`, `estimate-value` og `delete-account` krever innlogget bruker. `demo-login` og `cleanup-closed-estates` kalles uten brukerøkt og har derfor `--no-verify-jwt`. Cleanup-funksjonen sjekker i stedet headeren `x-cron-secret`.

## Automatisk sletting av avsluttede bo

Personvernerklæringen lover at avsluttede bo slettes etter 12 måneder. En administrator avslutter boet under «Administrer», og da settes `closed_at`.

Sett opp sletting én gang. Gå til Supabase Dashboard → Integrations → Cron → «Create job»:

- Type: Supabase Edge Function, `cleanup-closed-estates`, metode POST
- Plan: `0 3 1 * *` (kl. 03:00 den 1. hver måned)
- Header: `x-cron-secret: <samme verdi som CRON_SECRET>`
