# ArvKlart — Claude Code Guide

## Prosjektoversikt
ArvKlart er en norsk SaaS-tjeneste for arveoppgjør. React 18 + Vite SPA, Supabase (PostgreSQL, Auth, Storage, Edge Functions), deployert på Vercel.

## Branching-regler
- **Aldri push direkte til `main`** — `main` er produksjon og deployes automatisk til Vercel
- Lag alltid en feature-branch: `baard/feature-navn` eller `orjan/feature-navn`
- Lag PR til `main` når du er ferdig — be den andre om review

## Teknisk stack
- **Frontend**: React 18 + Vite, inline JSX-styles (ingen CSS-filer)
- **Design**: Alle komponenter bruker inline `style`-props med palette-tokens (se nedenfor)
- **Database**: Supabase (PostgreSQL) — se `supabase/README.md` for struktur, rekkefølge og deploy
- **Auth**: Supabase Auth (e-post/passord, glemt passord). Navnet ved registrering lagres i `user_metadata.display_name`, og profilen opprettes fra det ved første innlogging (`App.jsx`)
- **Språk**: norsk og engelsk. All tekst skrives som `L('norsk', 'english')` fra `src/lib/lang.js`; datoer og beløp formateres med `locale()` (eller `formatNOK` i `src/lib/format.js`). Verdier som lagres i databasen (kategorier, relasjoner, oppgavekategorier) er alltid norske og oversettes bare ved visning. Arveveiviseren er bare på norsk
- **Deployment**: Vercel, automatisk fra `main`

## Fargepalett — bruk alltid disse
```
#3A2F26  espresso (primær bakgrunn, topbar)
#FBF9F5  snow (side-bakgrunn)
#E8DFD0  sand (kort, input-bakgrunn)
#D9CFC0  grense/border
#9C8267  latte (sekundær tekst)
#5C4530  valnøtt (primær tekst i lys kontekst)
#5F6E52  mørk sage (suksess, aksent)
#8B9A7D  sage
#DCE3D2  tåkesage (subtil bakgrunn)
```

## Typografi
- `fontFamily: 'Karla, sans-serif'` — brødtekst og UI
- `fontFamily: "'Fraunces', serif"` — overskrifter/display

## Filer som IKKE skal røres uten diskusjon
- `src/lib/supabase.js` — Supabase-klient, endringer kan bryte auth
- `supabase/migrations/` — SQL-migrasjoner, må koordineres med live database
- `supabase/legacy/` — opprinnelig oppsett, allerede kjørt i produksjon
- `src/hooks/usePlan.jsx` — abonnements-logikk
- `.env` / `.env.local` — aldri commit hemmeligheter

## Supabase-konvensjoner
- Alle nye tabeller skal ha RLS aktivert
- Policies: brukere leser/skriver kun egne data og data for bo de er medlem i. Bruk hjelpefunksjonene `is_estate_member(estate_id)`, `is_estate_admin(estate_id)` og `is_demo_user()` (se `20261007_security_hardening.sql`)
- Admin-handlinger håndheves i databasen, ikke bare i UI: tildeling (trigger på `items`), arvinger, kategorier og `remove_estate_member()`
- Migrasjoner: lag fil i `supabase/migrations/` med navn `YYYYMMDD_beskrivende_navn.sql`, test med `npm run test:db`
- Edge Functions: `supabase/functions/<navn>/index.ts` (Deno). Felles kode i `supabase/functions/_shared/`. Funksjoner som koster penger (AI) skal kreve innlogget bruker (`getUser`)
- AI: alle kall går til Claude Haiku (`claude-haiku-4-5`) via Anthropics SDK i `_shared/ai.ts`, og hvert kall registreres med `claimAiCall()` først (tabellen `ai_usage`). Grenser: 30 kall/time og 150/døgn per bruker; demoen 5 per besøk (økt) og 300/døgn totalt
- Storage: `estate-docs` er privat (`documents/<bo-id>/…`, åpnes med `createSignedUrl`); `item-images` er offentlig, nye filer lagres under `<bo-id>/…` (`src/lib/images.js`)

## Demokonto
`mona.demo@heirsplit.no` er en demo-bruker — ikke slett eller endre dennes data i databasen.
- «Test ut demo» kaller edge-funksjonen `demo-login`, som nullstiller demo-boet (`reset_demo_estate()`) og returnerer en økt. Passordet ligger bare i hemmeligheten `DEMO_PASSWORD`, aldri i frontend
- Alle `*.demo@heirsplit.no`-kontoer er skrivebeskyttet i databasen: de kan vise interesse, si nei takk og prøve fordelingen, ikke noe annet
- Demoen kan prøve AI-analyse og verdiestimat på «Legg til gjenstand» (5 forsøk per besøk), men ikke lagre. Da vises «Dette er en demo. Du må opprette et arveoppgjør i Arvklart for å bruke denne funksjonen.»

## Vanlige kommandoer
```bash
npm run dev        # start dev-server lokalt
npm run build      # bygg for produksjon
npm run preview    # forhåndsvis bygget lokalt
npm test           # enhetstester (veiviser, fremdrift, formatering)
npm run test:db    # tilgangsregler og spørringer mot lokal Postgres + PostgREST (krever Docker)
```

## Miljøvariabler som trengs lokalt (.env.local)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
Hent verdiene fra Supabase Dashboard → Project Settings → API.

## Viktige sider og ruter
| Rute | Komponent | Beskrivelse |
|------|-----------|-------------|
| `/` | EstatesPage | Liste over brukerens bo |
| `/estate/:id` | EstatePage | Bo-oversikt |
| `/estate/:id/add` | AddItemPage | Legg til gjenstand (inkl. AI-analyse) |
| `/estate/:id/swipe` | SwipePage | Ta stilling til gjenstander (vil ha / nei takk) |
| `/estate/:id/conflicts` | ConflictPage | Løsningsmetoder (bare admin fordeler) |
| `/estate/:id/heirs` | HeirsPage | Arvinger; e-posten styrer hvem som kan bli med |
| `/estate/:id/admin` | AdminPage | Invitasjon, medlemmer, avslutte boet |
| `/veiviser`, `/estate/:id/guide` | GuidePage | Arveveiviseren (`public/arveveiviser/`) |
| `/personvern` | PrivacyPage | Personvernerklæring + vilkår (offentlig) |
| `/konto` | AccountPage | Dataeksport og kontosletting |
| `/logg-inn` | LoginPage | Innlogging/registrering |

## Founder-dashboard (`/founder`)
- Tilgang styres av tabellen `founders` (kun SQL Editor/service_role kan skrive) og krever tofaktor (TOTP, `aal2`)
- `profiles.is_founder` er bare et visningsflagg som speiler `founders`, og `plan` kan ikke endres fra klienten
- Data hentes kun via `founder_dashboard()` og `founder_set_plan()`; handlinger logges i `founder_audit_log`
- Legg til/fjern founders: fanen «Founders» i dashboardet (`founder_add_founder()` / `founder_remove_founder()`, man kan ikke fjerne seg selv)
- Første founder legges inn i SQL Editor: `insert into founders (user_id) select id from auth.users where email = '...';`
- Se `supabase/migrations/20261006_founder_security.sql`

## GDPR og personvern
- Samtykke til AI (bildeanalyse og verdiestimat) spørres om i `AddItemPage.jsx` og kan trekkes tilbake under «Min konto» (`src/lib/aiConsent.js`, localStorage-nøkkel: `aiConsented`)
- Dataeksport (PDF) er i `AccountPage` + `src/lib/dataExportPdf.js`
- Slett-konto-funksjon er i `supabase/functions/delete-account/index.ts`: sletter bo brukeren er alene om (med filer), gir admin videre i delte bo og fjerner navnet fra gjenstander
- Automatisk sletting 12 mnd etter at et bo avsluttes (`estates.closed_at`): edge-funksjonen `cleanup-closed-estates`, kjørt månedlig av Supabase Cron (se `supabase/README.md`)
- Behandlingsansvarlig (selskapsnavn og org.nr.) fylles inn i `COMPANY` i `OtherPages.jsx`
