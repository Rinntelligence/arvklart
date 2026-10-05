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
- **Database**: Supabase (PostgreSQL) — `supabase/` mappen har migrations og edge functions
- **Auth**: Supabase Auth (e-post/passord + magisk lenke)
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
- `src/hooks/usePlan.jsx` — abonnements-logikk
- `.env` / `.env.local` — aldri commit hemmeligheter

## Supabase-konvensjoner
- Alle nye tabeller skal ha RLS aktivert
- Policies: brukere leser/skriver kun egne data og data for bo de er medlem i
- Migrasjoner: lag fil i `supabase/migrations/` med navn `YYYYMMDD_beskrivende_navn.sql`
- Edge Functions: `supabase/functions/<navn>/index.ts` (Deno)

## Demokonto
`mona.demo@heirsplit.no` er en demo-bruker — ikke slett eller endre dennes data i databasen

## Vanlige kommandoer
```bash
npm run dev        # start dev-server lokalt
npm run build      # bygg for produksjon
npm run preview    # forhåndsvis bygget lokalt
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
| `/personvern` | PrivacyPage | Personvernerklæring + vilkår (offentlig) |
| `/konto` | AccountPage | Dataeksport og kontosletting |
| `/logg-inn` | LoginPage | Innlogging/registrering |

## GDPR og personvern
- Samtykkedialog for AI-bildeanalyse er i `AddItemPage.jsx` (localStorage-nøkkel: `ai_consent`)
- Slett-konto-funksjon er i `supabase/functions/delete-account/index.ts`
- Automatisk sletting 12 mnd etter bo lukkes: SQL-funksjon `cleanup_old_closed_estates()` kjøres månedlig via pg_cron
- Personvernerklæringen inneholder `[SELSKAPSNAVN AS]` og `[ORGNR]` som må fylles inn i `OtherPages.jsx`
