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
- **Språk**: norsk og engelsk. All tekst skrives som `L('norsk', 'english')` fra `src/lib/lang.js`; datoer og beløp formateres med `locale()` (eller `formatNOK` i `src/lib/format.js`). Verdier som lagres i databasen (kategorier, relasjoner, oppgavekategorier) er alltid norske og oversettes bare ved visning. Språket følger kontoen: `profiles.preferred_lang` (`no`/`en`/`null`). `null` betyr ikke valgt, og da gjelder norsk.
  - Ved innlogging tas kontoens språk i bruk med `adoptProfileLang` i `lang.js`.
  - Byttet lagres med `changeLanguage` i `languagePref.js` fra menyen og fra «Min konto». Det lagres også i `user_metadata.lang` for e-postmalene.
  - `localStorage` (`hs_lang`) er bare en hurtigbuffer.
  - Delt innhold i boet skrives aldri om av ett språkvalg. Standardoppgavene lagres på norsk og oversettes ved visning.
  - Arveveiviseren er på norsk, med en engelsk oversettelse: `public/arveveiviser/i18n.js` gir `tr(no, en)` og `field(obj, key)`, der innholdet får `*_en`-felter. Den engelske versjonen vises bare med `?lang=en`, og appen sender det bare når `VITE_GUIDE_EN=true`. Flagget er av i prod til de engelske tekstene er juridisk gjennomgått, og norsk er alltid den gjeldende versjonen
- **E-post**: malene for Supabase Auth (bekreftelse, nytt passord, magisk lenke, ny e-post) ligger i `supabase/templates/` og er på norsk eller engelsk etter `user_metadata.lang`, som `signUp` setter. De legges inn i dashbordet manuelt, se `supabase/README.md`
- **Deployment**: Vercel, automatisk fra `main`

## Fargepalett — bruk alltid disse
```
#3A2F26  espresso (primær bakgrunn, topbar)
#FBF9F5  snow (side-bakgrunn)
#E8DFD0  sand (kort, input-bakgrunn)
#D9CFC0  grense/border
#75604B  mørk latte (sekundær tekst; 5,7:1 på snow, 4,5:1 på sand)
#9C8267  latte (bare ikoner, diagramflater og dekor; for lys som tekst)
#9A8B78  feltkant (input/select/textarea; 3,3:1 mot hvit)
#5C4530  valnøtt (primær tekst i lys kontekst)
#5F6E52  mørk sage (suksess, aksent)
#8B9A7D  sage
#DCE3D2  tåkesage (subtil bakgrunn)
```

Tilgjengelighet (WCAG 2.2 AA): ikke bruk `outline:'none'`; fokus vises med `:focus-visible` i `index.html` (mørke flater setter lys ring selv). Hvit tekst bare på `#5F6E52` eller mørkere, ikke på `#8B9A7D`.

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
- Ønsker (`interests`): hver bruker kan legge til, slette og endre begrunnelsen (`reason`, maks 1000 tegn) på sine egne. Bare kolonnen `reason` kan oppdateres, og begrunnelsen er synlig for alle i boet. Påbegynt tekst tas vare på i fanen (`src/lib/reasonDraft.js`, sessionStorage) og slettes ved lagring og utlogging
- Admin-handlinger håndheves i databasen, ikke bare i UI: tildeling, kastmerking og verdi (trigger `guard_item_update` på `items`; verdien kan også endres av den som la inn gjenstanden), arvinger, kategorier og `remove_estate_member()`. Den som la inn en gjenstand kan slette den bare før den er tildelt
- Migrasjoner: lag fil i `supabase/migrations/` med navn `YYYYMMDD_beskrivende_navn.sql`, test med `npm run test:db`
- Edge Functions: `supabase/functions/<navn>/index.ts` (Deno). Felles kode i `supabase/functions/_shared/`. Funksjoner som koster penger (AI) skal kreve innlogget bruker (`getUser`)
- AI: alle kall går til Claude Haiku 5.5 (`claude-haiku-5-5`; manuell tilbakerulling til `claude-haiku-4-5` med hemmeligheten `AI_MODEL`) via `callStructured()` i `_shared/ai.ts`. Kallene bruker strukturert svar (JSON-skjema) med validering i `_shared/aiCore.ts`, og høyst ett nytt forsøk. Ingen `temperature` eller prefill (gir 400 på 5.5); effort er `medium` for bildeanalyse og `low` for verdianslag. Hvert kall registreres med `claimAiCall()` først (tabellen `ai_usage`, som også får målinger) og gir faste feilkoder (`ai_refused`, `ai_busy` …) som appen oversetter i `aiErrorMessage()`. Grenser: 30 kall/time og 150/døgn per bruker; demoen 5 per besøk (økt) og 300/døgn totalt
- AI-vurdering av bilder (`analyze-item`, skjema i `_shared/analysis.ts`) lagres i `items.ai_analysis` (jsonb, `v: 2`).
  - Feltet `ai` er AI-forslaget, og det endres aldri etter lagring.
  - `review` sier om brukeren godtok eller endret hvert forslag.
  - Det brukeren har valgt, står i de vanlige kolonnene.
  - AI fyller bare felt brukeren ikke har endret (`applyAiSuggestion` i `src/lib/itemAiHelpers.js`).
  - Tilstand kan være `unknown` («Ikke vurdert»), som er standard for nye gjenstander.
  - Eldre gjenstander har `null` og skrives ikke om.
  - `ai_analysis` kan bare endres av administrator eller den som la inn gjenstanden.
- Verdianslag (`estimate-value`, logikk i `_shared/valuation.ts`) er et *veiledende AI-anslag*, ikke en markedsverdi.
  - Det bygger på bildeanalysen (`analysis` eller `item_id`) uten å sende bildene igjen, og bruker ingen eksterne kilder.
  - Modellen anslår for den registrerte tilstanden, med veiledning per type gjenstand.
  - Koden trekker ikke fra noe i tillegg. Den gjør bare intervallet bredere og senker sikkerheten når grunnlaget er usikkert.
  - For lite grunnlag gir `status: 'insufficient'` med tips og ingen verdi (aldri 0 kr).
  - AI-ens anslag lagres i `ai_analysis.valuation`, adskilt fra `estimated_value`.
- Storage: `estate-docs` er privat (`documents/<bo-id>/…`, åpnes med `createSignedUrl`); `item-images` vises med tidsbegrensede, signerte URL-er via `<StoredImage>` (`src/components/StoredImage.jsx`, `src/lib/imageUrls.js`). Databasen lagrer fortsatt den offentlige URL-en som identifikator. Bøtten gjøres privat i S3, så bruk aldri `<img src={item.image_url}>` direkte. Nye filer lagres under `<bo-id>/…` (`src/lib/images.js`)

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
npm run test:e2e   # akseptansetester i Chromium (CHROMIUM_PATH) med simulert Supabase: «Legg til flere», tilgjengelighet, kundereisen, hvem kan kaste/endre verdi/slette, begrunnelse etter «Vil ha»
```
Avhengighetene er låst i `package-lock.json` (bruk `npm ci`). GitHub Actions (`.github/workflows/test.yml`) kjører alle testene, også `test:db`, på hver PR.

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
| `/estate/:id/add-many` | AddItemsPage | Legg til opptil 20 gjenstander: kamera i appen (ett bilde = én gjenstand, «Flere bilder av denne» for flere), kamerarull/filer/dra-og-slipp, AI analyserer alle (ett kall per gjenstand). AI lagrer aldri selv: brukeren ser over kortene og trykker «Godkjenn og lagre alle» |
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
- Automatisk sletting 12 mnd etter at et bo avsluttes (`estates.closed_at`): edge-funksjonen `cleanup-closed-estates` (data, filer og tilbakemeldinger knyttet til boet), skal kjøres daglig av Supabase Cron; kjøringer logges i `cleanup_runs`. Foreldreløse bilder ryddes bare manuelt med `cleanup-orphan-images` (dry_run + bekreftelse). Se `supabase/README.md`
- Behandlingsansvarlig (selskapsnavn og org.nr.) fylles inn i `COMPANY` i `OtherPages.jsx`
