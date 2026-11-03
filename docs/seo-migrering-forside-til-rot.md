# Migrering: offentlig forside til `/`, appen til `/app`

Status: **plan, ikke implementert.** Egen PR med egen risikovurdering. Ikke en del av den tekniske SEO-grunnmuren (PR #56).

## Hvorfor
I dag er `/` den innloggede appen (bo-listen), og den offentlige forsiden ligger på `/home`. Konsekvenser:
- `/` har `X-Robots-Tag: noindex`. Lenker til rotdomenet (de fleste eksterne lenker og merkesøk) gir ingen signaler til `/home`.
- Google leser `WebSite`-markup (nettstedsnavn i søkeresultatene) bare på domenets rot. Nettstedsnavnet kan derfor ikke optimaliseres nå.
- Serveren kan ikke skille innloggede fra besøkende, fordi økten ligger i `localStorage`. `/` kan derfor ikke være begge deler med samme HTML.

## Mål
- `/`: forhåndsrendret offentlig forside, indekserbar, selvrefererende canonical, `Organization` + `WebSite`.
- `/app` (og `/app/estate/:id/…` eller beholdt `/estate/…`, se under): appen, med `noindex`.
- `/home`: 301 til `/`.

## Risiko og tiltak

| Område | Risiko | Tiltak |
|---|---|---|
| **E-postbekreftelse** | `signUp` sender `emailRedirectTo: window.location.origin` (`src/lib/supabase.js`, rør ikke uten diskusjon). Etter bekreftelse lander brukeren på `/` med økt i URL-en, som i dag er appen. | Enten la `/` oppdage en ny økt og sende videre til `/app` (Supabase leser økten fra URL-en uansett side), eller endre `emailRedirectTo` til `/app` (krever diskusjon). **Site URL og Redirect URLs i Supabase** (Authentication → URL Configuration) må inneholde `/app`. Test med ekte e-post på forhåndsvisning. |
| **Nytt passord** | `redirectTo: …/nytt-passord` | Upåvirket. Etter lagring går `onDone` til `/` (`routeAfterLogin(profile, '/')`), som må bli `/app`. |
| **E-postmalene** (`supabase/templates/`) | Bruker `{{ .ConfirmationURL }}`; målet styres av redirect-innstillingene, ikke malene | Ingen malendring. Bekreft i Supabase at Site URL er riktig. |
| **Invitasjoner** `/join/:code` | Lenker ligger i e-post og meldinger hos brukerne | Behold stien uendret (allerede noindex). Etter innlogging sendes brukeren til boet, ikke til `/`. |
| **Interne lenker** | 12 steder i 7 filer peker til `/` (TopBar, FounderGate, App, OtherPages, LandingPage, EstatePage, ResetPasswordPage), pluss `routeAfterLogin(…, '/')`, `notForDemo` (`<Navigate to="/" />`), `<Route path="*" element={<Navigate to="/" />}>` for innloggede, og demoflyten (`navigate('/')` etter `startDemoSession`) | Én konstant (`APP_HOME = '/app'`) og en test som feiler hvis app-koden navigerer til `/`. |
| **Eksisterende brukere** | Bokmerker og «legg til på hjemskjerm» peker til `/` | En lagret økt på `/` (samme sjekk som `public/seo-early.js`) sender videre til `/app` før forsiden vises, eller forsiden viser «Gå til mine bo» tydelig. Aldri en stille endring i hva innloggede ser. Mål i Search Console og supporthenvendelser i to uker. |
| **Demo** | `demo-login` gir en økt, og appen går til `/` og så til demo-boet | Gå rett til `/app` (eller demo-boet). e2e-testen «Test ut demo» fra forsiden må dekke det. |
| **Gamle lenker til `/home`** | Eksterne lenker, Search Console, sitemap | `vercel.json` `redirects`: `/home` → `/` (permanent). Sitemap og `pages.js` oppdateres i samme PR. |
| **SEO-regler** | noindex-regelen unntar i dag ikke `/`, og unntar `/home` | `pages.js`: `/` blir offentlig side. Noindex-unntaket og omskrivingen `/` → `/index.html`-varianten endres. Testene i `test/seo/seo.test.js` håndhever samsvar. Ny H1-, canonical- og hydreringstest for `/`. |
| **Hydrering på `/`** | Samme som `/home` i dag: hydreres bare for norsk uten økt | Gjenbruk `prerendered` og `seo-early.js`. Ingen endring for innloggede. |
| **`/estate/…`-lenker** | Ligger i e-post (`ApprovalPanel`: `/estate/:id/fordeling`) og bokmerker | Behold `/estate/…` som de er (allerede noindex). Bare inngangen `/` flyttes til `/app`. Det gir minst risiko. |

## Rekkefølge
1. Egen PR: `APP_HOME`, ruter og videresendinger, `pages.js`, `vercel.json`, tester (inkl. e2e for e-postbekreftelse via URL-økt, reset, invitasjon, demo og innlogget bokmerke på `/`).
2. Supabase: legg `https://www.arvklart.no/app` til i Redirect URLs **før** utrulling (gjør ikke noe med eksisterende oppføringer).
3. Forhåndsvisning: `node scripts/check-seo.mjs <url>` og manuell røyktest av registrering med e-postbekreftelse, innlogging, nytt passord, invitasjon og demo.
4. Utrulling i rolig periode. `check-seo.mjs --production` rett etterpå.
5. Search Console: URL-inspeksjon av `/` og `/home` (forvent omdirigering), send inn sitemap på nytt. Regn med noen uker der begge URL-ene vises.

## Tilbakerulling
Manuell: Instant Rollback i Vercel til forrige utrulling. Supabase-oppføringen for `/app` kan bli stående (ufarlig). Ingen databaseendringer inngår.
