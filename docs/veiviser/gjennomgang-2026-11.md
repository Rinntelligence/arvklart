# Arveveiviseren (`/veiviser`): gjennomgang av funksjon, innhold og SEO, november 2026

Gjelder draft-PR-en på grenen `claude/veiviser-innhold` (bygger på PR #62, der veiviseren ble lagt direkte i siden).

**Avgrensning.** Beregningene og spørsmålslogikken er ikke endret.
- Endringene gjelder innholdet på selve siden: `sections.js`, `ramme.html` og `pages.js`.
- I veiviseren er definisjonen av minstearv (`glossary.js`), to resultattekster i `rules.js` (T18, T23) og én hjelpetekst i `questions.js` (T38) rettet, fordi de var upresise eller motsa beregningen. Hvilket varsel som vises, og beløpene, er uendret.
- Forslag som ville endret beregningen, står i avsnitt 7.

**Kildekontroll.** Lovdata kan fortsatt ikke åpnes fra arbeidsmiljøet; Lovdata sperrer selv forespørslene. HR-2025-1182-A, lovvedtaket for arveloven (Stortinget) og sidene til Domstolene og Skatteetaten er lest direkte i runde 6 (avsnitt 4e). Avsnitt 4d og 4e sier hva som er bekreftet og hva som er usikkert. Ingenting her er juridisk godkjenning. Påstandene er derfor kontrollert mot utdrag av primærkildene fra søk, og mot kildelisten veiviseren allerede bruker (`public/arveveiviser/sources.js`). Alt som er merket **Krever juridisk godkjenning før merge**, må leses av en jurist mot gjeldende tekst før PR-en flettes.

---

## 1. Hva veiviseren håndterer i dag

Matrisen bygger på koden og testene, ikke på antakelser.
- **Filer:** `questions.js` (spørsmål og vilkår), `facts.js`, `calculate.js` (beregning), `heirs.js` (arverekkefølge), `engine.js` (blokkeringer, forutsetninger og «sammensatt»), `rules.js` (forklaringer og neste steg) og `flow.js`.
- **Tester:** `test/arveveiviser/scenarios.test.js`, `flow.test.js`, `complexity.test.js`, `texts.test.js`, `changes.test.js` og `report.test.js`.

Forklaring på statusene i tabellen:
- **Korrekt (testet):** situasjonen beregnes, og det finnes test som dekker den.
- **Delvis:** situasjonen beregnes etter lovens hovedregel, med et varsel om at resultatet kan bli et annet.
- **Ikke støttet:** veiviseren spør ikke om det, så det påvirker ikke svaret.
- **Kan villede:** svaret eller teksten kan gi feil inntrykk.
- **Stopper:** veiviseren beregner ikke og ber brukeren avklare.

| Situasjon | Status | Hvor (kode / test) | Merknad |
|---|---|---|---|
| Gift med felles barn, uten testament | Korrekt (testet) | `calculate.js` partnerInheritance; scenarios 1–2 | 1/4 til ektefellen, minst 4 G; barna deler resten likt |
| Minstearv 4 G / 6 G for ektefelle | Korrekt (testet) | scenarios «Minstearv», 5 | |
| Gift uten barn: foreldre, søsken, nevøer og nieser | Korrekt (testet) | scenarios 5, 11–12 | 1/2 til ektefellen, minst 6 G; alt hvis ingen i 2. arvegang |
| Ingen ektefelle: barn, foreldre, besteforeldre, søskenbarn | Korrekt (testet) | `heirs.js`; scenarios 9–12 | Barnebarn og søskenbarn trer inn for døde |
| Barnebarn eller nevø/niese som er død og har egne barn | **Kan villede** | `heirs.js` firstOrder og secondOrder (bare ett ledd), `ui.js` (antall) | Feil fordeling innen stammen; i verste fall faller hele linjen bort. Se F11 |
| Ingen arvinger | Korrekt (testet) | scenarios «ingen arvinger» | Går til frivillig arbeid for barn og unge (§ 76) |
| Samboer med felles barn (4 G) | Korrekt (testet) | scenarios 6, 8 | Også «venter barn» |
| Samboer uten felles barn | Korrekt (testet) | scenarios 7 | Arver ikke uten testament |
| Testament som gir bort for mye | Korrekt (testet) | scenarios 13 | Begrenses av pliktdelsarven (2/3, høyst 15 G per barn) |
| Testament til samboer etter fem år (§ 13) | Korrekt (testet) | scenarios 13 | 4 G går foran pliktdelsarven |
| Testament som begrenser ektefellens arv (§ 10) | Korrekt (testet) | scenarios 13 | Ektefellen får minstearv hvis hen visste om testamentet |
| Testament som begrenser samboerens arv (§ 12) | Korrekt (teksten rettet i T23) | `calculate.js:149`, `rules.js` testamentLimitsPartnerKnew | Beregningen gir 0 kr. Før sa teksten «Minstearven er likevel beskyttet». Jurist bør bekrefte 0 kr (F13) |
| Testament med bestemte gjenstander eller ulik fordeling | Delvis | `engine.js` complexReasons testamentUneven | Viser lovens hovedregel med varsel |
| Testament om uskifte, felles eller gjensidig testament | Delvis | testamentUskifte, testamentOther | Varsel; ordlyden vurderes ikke. Felles eller gjensidig testament er ikke et eget valg («Noe annet») |
| Forskudd på arv til barn, med beskjed fra avdøde | **Kan villede** | scenarios 19 | Trekkes alltid fra. For gaver fra 2021 er det bare riktig hvis betingelsen ble satt da gaven ble gitt. Se F14 |
| Gaver uten beskjed om forskudd | **Kan villede** | `rules.js` advancementGifts | Trekkes aldri fra. For gaver gitt før 2021 kan de likevel avkortes (arveloven 1972 § 38, HR-2025-1182-A). Teksten varsler nå (T48); tallene er uendret. Se F14 |
| Forskudd til andre enn barn (barnebarn, søsken) | Ikke støttet | `questions.js` advancements (bare «noen av barna») | |
| Uskifte for ektefelle, med og uten særkullsbarn | Korrekt (testet) | scenarios 1–4 | Samtykke fra særkullsbarn, delvis uskifte (§ 16) |
| Uskifte for samboer (bolig, innbo, bil, fritidsbolig) | Korrekt / delvis | `calculate.js:312`; scenarios 8 | Uklart om samboeren i tillegg kan få 4 G; varsles (uskifteCohabitantRest) |
| Avdøde satt selv i uskifte | Korrekt (testet) | scenarios 18 | Deling etter § 29 og § 39 |
| Særeie og skjevdeling | Korrekt / delvis | scenarios 14–15 | Skjevdeling vises som alternativ beregning med varsel |
| Separert, eller skilsmissesak | Korrekt (testet) | scenarios 20 «separert» | Ingen arv til ektefellen (§ 11) |
| Gjeld større enn eiendelene | Stopper (som valg) | `engine.js` insolvent; scenarios 16 | Uskifte vises ikke; anbefaler tingretten og offentlig skifte |
| Mindreårige arvinger | Delvis | `rules.js` minorHeir, uskifteMinorConsent; scenarios 3–4 | Merknad om verge og statsforvalter. `minorHeir` viser til § 56 (barn avdøde forsørget), men teksten forklarer ikke § 56 |
| Arving med verge | Delvis | `rules.js` guardianship | Merknad |
| Uenige arvinger | Delvis | complexReasons disagreement | Varsel om offentlig skifte |
| Arving ukjent, vanskelig å nå eller i utlandet | Delvis | complexReasons unreachable | Varsel |
| Avdøde bodde i utlandet, eller ukjent bosted | Delvis (kritisk varsel) | complexReasons livedAbroad; scenarios 20 | Regner etter norsk lov og sier at et annet lands lov kan gjelde (§ 78) |
| Eiendeler i utlandet, eller lovvalg i testament | Ikke støttet | – | Arveloven § 78 lar testator velge statsborgerskapslandets lov |
| Dødsfall før 1. januar 2021 | Stopper | `engine.js` oldLaw; flow-test | Gammel arvelov; ingen tall |
| «Vet ikke» om sivilstand, barn, foreldre, søsken eller besteforeldre | Stopper | `engine.js` collectBlockers; flow-tester | Tall bygges aldri på en antakelse om familien |
| Adoptivbarn | Korrekt | hint på «Hadde avdøde barn?» | Regnes som barn |
| Stebarn (ektefellens barn) | Kan villede | `questions.js` hasChildren-hint | Hintet nevner «barn fra tidligere forhold» (avdødes egne). Det sies ikke at ektefellens barn ikke er avdødes arvinger |
| Landbrukseiendom, odel, åsetesrett | Ikke støttet | – | Egne regler; arvelovendring 2020 |
| Livsforsikring og pensjon med begunstiget | Ikke støttet | – | Holdes utenfor boet; bare nevnt i fasene og gravferdssjekken |
| Arveavkall, eller samtidig død | Ikke støttet | – | |
| «Bo av liten verdi» | Delvis | `engine.js` SMALL_ESTATE_LIMIT = 170 000 | Én side hos Domstolene oppgir 170 000 kr; Drammen tingrett og skjemaet tar utgangspunkt i 1 G. Se F12 |

### Når veiviseren bør stoppe eller anbefale advokat (forslag)
- **Stopper riktig i dag:** dødsfall før 2021, «vet ikke» om nær familie, og gjeld større enn eiendelene (som skifteform).
- **Bør gi en tydeligere anbefaling om juridisk bistand:**
  - avdøde bodde i utlandet;
  - testament med bestemte gjenstander, eller felles eller gjensidig testament;
  - skjevdeling over et visst beløp;
  - landbrukseiendom;
  - uenighet.

  I dag er dette varsler («sammensatt»), men det sies ikke uttrykkelig «snakk med advokat før dere skifter». Forslaget er i avsnitt 2.

## 2. Funksjonsforbedringer for senere (ikke gjort nå)

Rangert etter betydning, kompleksitet og risiko. Ingen av dem er implementert.

| # | Forbedring | Betydning | Kompleksitet | Risiko | Filer |
|---|---|---|---|---|---|
| F1 | ~~Rett teksten testamentLimitsPartnerKnew for samboer~~ **Gjort i runde 2 (T23)** | Høy | Lav | Lav (tekst, ingen beregning) | `rules.js` |
| F2 | Si tydelig at ektefellens og samboerens barn fra andre forhold ikke er avdødes arvinger (hint på «Hadde avdøde barn?») | Høy | Lav | Lav | `questions.js` |
| F3 | Egen anbefaling «Snakk med advokat før dere skifter» ved utland, felles testament, landbruk og stor skjevdeling | Høy | Middels | Middels (juridisk avgrensning) | `engine.js` complexReasons, `rules.js` |
| F4 | Forklar § 56 (barn avdøde forsørget) i minorHeir, eller fjern kilden fra varselet | Middels | Lav | Lav | `rules.js` |
| F5 | Dokumenter eller fjern grensen SMALL_ESTATE_LIMIT (170 000 kr); erstattet av F12 i avsnitt 7 | Middels | Lav | Middels | `engine.js` |
| F6 | Forskudd til andre enn barn (barnebarn som trer inn, testamentsarvinger) | Middels | Middels | Middels | `questions.js`, `calculate.js` |
| F7 | Spørsmål om eiendeler i utlandet og lovvalg i testament (§ 78) | Middels | Middels | Høy (internasjonal privatrett) | `questions.js`, `engine.js` |
| F8 | Felles eller gjensidig testament som eget valg | Middels | Middels | Høy | `questions.js`, `calculate.js` |
| F9 | Landbrukseiendom (odel og åsetesrett) som stopp med henvisning | Lav–middels | Lav | Lav | `engine.js` |
| F10 | Livsforsikring med begunstiget: forklar at den holdes utenfor boet | Lav | Lav | Lav | `rules.js` |

## 3. SEO-mål og søkeord per seksjon

Primært søkeord: **arveveiviser**. Sekundære: **hvem arver**, **hvem arver og hvor mye**, og søk om arveprosessen (skifteattest, proklama, uskifte). Fordeling av innbo overlates til `/guider/fordeling-av-innbo` (PR #61), og siden lenker ikke dit før guiden er publisert.

| Seksjon | Mål | Søkeord | Endring i denne PR-en |
|---|---|---|---|
| `<title>` | Verktøysøk og «hvem arver» | arveveiviser, hvem arver og hvor mye | Uendret: «Arveveiviser: Hvem arver – og hvor mye? — Arvklart» |
| Meta-beskrivelse | Klikk fra søk | arveveiviser, hvem arver, hvor mye | Ny, 145 tegn |
| H1 | Tydelig tema | arveveiviser, dødsfall, fordelt bo | Begynner nå med «Arveveiviser» |
| Avsenderlinje | Troverdighet (kvalitetsvurdering) | – | Ny: avsender, sist oppdatert, kontakt |
| Startkortet (H2) | Verktøyet | hvem arver – og hvor mye | Uendret |
| «Hvem arver etter loven?» (H2) | Kort svar som kan siteres (AI-oversikt, utvalgt utdrag) | hvem arver, arverekkefølge, ektefelle, samboer, pliktdelsarv | Ny, etter verktøyet, med kilder |
| «Prosessen i fem faser» (H2, H3 per fase) | Arveprosessen | skifteattest, privat skifte, proklama, uskifte | Oversikt med lenker; rettede fakta |
| Ordliste, ressurser | Begreper og offentlige kilder | pliktdelsarv, skifteattest, uskifte … | Minstearv rettet |

Hypoteser (ikke målt): siden kan få visninger på «hvem arver» og på begrepene i ordlisten. Effekten må måles i Search Console 4–6 uker etter publisering.

## 4. Tekstendringer: før, etter og hvorfor

Fasiten `test/fixtures/veiviser-tekst.json` er laget på nytt fra den endrede rammen (232 tekster, 23 lenker, 36 forklaringer; før 205 / 15 / 37). Endringene under er de eneste forskjellene. Diffen er kontrollert, og testene feiler hvis noe annet endres.

| # | Sted | Før | Etter | Hvorfor | Jurist |
|---|---|---|---|---|---|
| T1 | H1 (`ramme.html`) | Fra dødsfall til fordelt bo — steg for steg | Arveveiviser: fra dødsfall til fordelt bo, steg for steg | Primært søkeord først; budskapet er beholdt | Nei |
| T2 | Avsenderlinje (ny, `sections.js` bylineHtml) | – | Skrevet av Arvklart · Sist oppdatert 4. november 2026 · Kontakt oss | Avsender og dato; ingen påstand om faglig gjennomgang | Nei |
| T3 | «Hvem arver etter loven?» (ny, `sections.js` whoInheritsHtml) | – | Se teksten på siden. Bygger på veiviserens egne regeltekster (`rules.js`: childrenEqual, representation, parentsInherit, grandparentsInherit, spouseQuarter, spouseHalf, spouseAll, cohabitant4G, compulsoryShare) og kildene §§ 4–6, 8, 9, 12, 50 og Domstolene | Svar på «hvem arver» uten å bruke verktøyet | **Krever juridisk godkjenning før merge** |
| T4 | Oversikt over fasene (ny) | – | Nummerert liste med lenke til hver fase | Synlig oversikt og hopp til fase; trekkspillene er beholdt | Nei |
| T5 | Fase 3, merknad | Arvklart lar dere registrere verdivurderinger og forskudd på arv på ett sted, slik at fordelingen senere bygger på et ryddig og omforent grunnlag. | Arvklart lar dere registrere eiendelene med bilde og verdi på ett sted, slik at fordelingen senere bygger på et felles grunnlag. | Appen har ikke registrering av forskudd på arv i boet (bare beregningen i veiviseren) | Nei (produkt) |
| T6 | Fase 3, forskudd på arv | … som normalt trekkes fra vedkommendes andel senere. | … og som avdøde bestemte at skulle trekkes fra arven senere. | Motsa ordlisten og beregningen: veiviseren trekker bare fra når avdøde sa det (`questions.js` advancements, `rules.js` advancementGifts); arveloven § 75 | **Krever juridisk godkjenning før merge** |
| T7 | Fase 4, merknad | Arvklart gjør selve fordelingen ryddig, sporbar og rettferdig for alle arvinger — også når dere er uenige. | Arvklart viser hvem som ønsker hva, og gir dere loddtrekning, runder eller jevn fordeling etter verdi når flere vil ha det samme. Det er dere som avgjør. | Arvklart avgjør ikke hva som er rettferdig og løser ikke uenighet; metodene finnes (CLAUDE.md) | Nei (produkt) |
| T8 | Fase 4, «Slik gjør du det» | … og la plattformen foreslå en rettferdig fordeling dere kan justere sammen. | … Når flere vil ha det samme, kan dere bruke loddtrekning, runder eller jevn fordeling etter verdi som utgangspunkt, og justere sammen. | Samme som T7 | Nei (produkt) |
| T9 | Fase 5 | Be om forhåndsligning … / En forhåndsligning … / … be om forhåndsligning. | Be om forhåndsfastsetting … / Forhåndsfastsetting … / … be om forhåndsfastsetting. | Skatteetatens begrep er forhåndsfastsetting (skattemelding for tidlig innsending, forhåndsfastsetting av dødsbo) | **Krever juridisk godkjenning før merge** |
| T10 | Fase 5, punkt fjernet | Sende arvemelding til Skatteetaten … senest tre måneder etter at fordelingen er klar. | (fjernet) | Arveavgiften ble opphevet fra 1. januar 2014, og Skatteetaten sier at det ikke skal sendes arvemelding for arv mottatt fra 2014. Veiviseren gjelder bare dødsfall fra 2021 | **Krever juridisk godkjenning før merge** |
| T11 | Ordliste, minstearv (side) | Et minstebeløp ektefelle (4 G eller 6 G) eller samboer med felles barn (4 G) arver, uansett testament. | Et minstebeløp ektefelle (4 G eller 6 G) arver, uansett testament. Samboer med felles barn arver 4 G, men et testament kan begrense det hvis samboeren visste om testamentet. | Arveloven § 12 andre ledd (rettet fra «tredje ledd»; § 12 har to ledd); beregningen gjør allerede dette (`calculate.js` partnerInheritance: protected 0 for samboer) | **Krever juridisk godkjenning før merge** |
| T12 | Ordliste i veiviseren (`glossary.js` minstearv, hjelpetekst i spørsmålene) | … Et testament kan ikke ta den bort. | … Et testament kan ikke ta ektefellens minstearv bort. Samboerens kan begrenses hvis samboeren visste om testamentet. | Samme som T11 | **Krever juridisk godkjenning før merge** |
| T13 | Avslutningsboksen | … gjør Arvklart selve fordelingen ryddig, sporbar og rettferdig for alle arvinger. | … gir Arvklart dere oversikt over hvem som ønsker hva, og et skriftlig grunnlag for fordelingen som alle arvingene kan se. | Samme som T7 | Nei (produkt) |
| T14 | Lenker «Domstol.no» i fase 1, 2 og 4 | https://www.domstol.no (forsiden) | Fase 1: …/hva-ma-arvinger-gjore-etter-et-dodsfall/; fase 2 og 4: …/forskjellige-former-for-skifte/ | Presise lenker; samme adresser som veiviserens kildeliste | Nei |
| T15 | Meta-beskrivelse (`pages.js`) | Fra dødsfall til fordelt bo — steg for steg. Finn ut hvem som arver og hvor mye, basert på din situasjon. | Arveveiviser: finn ut hvem som arver og omtrent hvor mye, og se hele prosessen fra dødsfall til fordelt bo, med ordliste og offentlige ressurser. | Søkeordet først; sier hva siden har i tillegg til verktøyet | Nei |

**Utseende, uten ny tekst:**
- **Mobil:** merkelappen «Her hjelper Arvklart deg» står under tittelen på mobil. Før ble tittelen i fase 3 og 4 presset til ett ord per linje.
- **Utskrift:** det nye avsnittet skjules ved utskrift, som de andre seksjonene.

## 4b. Juridisk gjennomgang, runde 2: før, etter, hvorfor og kilde

Andre runde gjennomgikk teksten med juridisk korrekthet foran SEO, særlig:
- arvemeldingen og dagens skatteplikter;
- tredje arvegangsklasse;
- samboerens arv;
- 60-dagersfristen;
- ordlisten.

Beregningene og spørsmålslogikken er ikke endret. To tekster i `rules.js` er rettet: grandparentsInherit og testamentLimitsPartnerKnew. I tillegg er én hjelpetekst i `questions.js` rettet (T38). Alle tre er bare tekst. Hvilket varsel eller spørsmål som vises, og beløpet, er som før.

Fasiten er laget på nytt (240 tekster, 25 lenker, 37 forklaringer; etter runde 1: 232 / 23 / 36). Endringene under er de eneste forskjellene fra runde 1. T37 og T38 kom til etter kontrollen mot Skatteetatens norske veiledning; T37 er den eneste endringen i fasiten etter det.

**Kilder.** Lovdata kan ikke nås fra arbeidsmiljøet (domenet er sperret i nettverkspolicyen). Lovteksten er derfor ikke lest i sin helhet. Påstandene er kontrollert mot:
- Domstolene, Skatteetaten og regjeringen.no;
- utdrag av lovteksten fra søk;
- paragrafhenvisninger i kommentarer.

Hver rad oppgir kildene. Alle rader merket **Krever juridisk godkjenning før merge** må leses mot gjeldende lovtekst på Lovdata.

| # | Sted | Før | Etter | Hvorfor | Kilder | Status |
|---|---|---|---|---|---|---|
| T16 | «Hvem arver», 2. klasse | foreldrene, og søsken, nevøer og nieser i stedet for en forelder som er død. | foreldrene. Er en forelder død, går dennes del til avdødes søsken, og etter et søsken som er dødt, til søskenets barn (nevøer og nieser) og videre nedover. | Før kunne det leses som at nevøer og nieser arver i stedet for en forelder, ved siden av søsknene. De arver bare i stedet for et søsken som er dødt. Andre klasse har ingen grense nedover | Arveloven § 5 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [Domstolene: Hvem er arvinger?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hvem-er-arvinger/) | **Krever juridisk godkjenning før merge** |
| T17 | «Hvem arver», 3. klasse | besteforeldrene, og tanter, onkler og søskenbarn i stedet for en besteforelder som er død. | besteforeldrene, halvt på farssiden og halvt på morssiden. Er en besteforelder død, går dennes del til avdødes tanter og onkler, og etter en tante eller onkel som er død, til hans eller hennes barn (søskenbarn). Lenger går ikke arveretten etter loven. | Søskenbarn arver bare i stedet for en tante eller onkel som er død, ikke direkte i stedet for en besteforelder. Barn av søskenbarn arver ikke. Fordelingen på farssiden og morssiden manglet, men står i `rules.js` | Arveloven § 6 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [NOU 2014: 1 kap. 2](https://www.regjeringen.no/no/dokumenter/nou-2014-1/id750736/?ch=3) (grensen ved besteforeldrenes barnebarn); `questions.js` hasGrandparentLine og `heirs.js` thirdOrder regner allerede slik | **Krever juridisk godkjenning før merge** |
| T18 | `rules.js` grandparentsInherit (resultattekst) | Der arver besteforeldrene – eller tanter, onkler og søskenbarn i stedet for en besteforelder som er død. | Der arver besteforeldrene. Er en besteforelder død, går delen til tanter og onkler, og etter en tante eller onkel som er død, til hans eller hennes barn (søskenbarn). | Samme som T17. CLAUDE.md krever at «Hvem arver» og `rules.js` sier det samme. Beregningen er uendret (`heirs.js`; testen «søskenbarn arver i stedet for en død tante») | Som T17 | **Krever juridisk godkjenning før merge** |
| T19 | «Hvem arver», ektefelle | … men alltid minst 4 G med barn og 6 G uten (minstearv). Finnes verken barn, foreldre, søsken, nevøer eller nieser, arver ektefellen alt. | … men minst 4 G når det finnes barn og 6 G ellers (minstearv). Finnes verken barn, foreldre eller søsken og deres etterkommere, arver ektefellen alt. | «Alltid» var for sterkt (minstearven kan ikke bli mer enn boet). Ektefellen arver alt bare når det ikke finnes noen i 2. klasse, og den omfatter også etterkommere etter nevøer og nieser | Arveloven §§ 8–9 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [Domstolene: Hva arver du?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-arver-du/) | **Krever juridisk godkjenning før merge** |
| T20 | «Hvem arver», samboer | En samboer arver 4 G bare når samboerne har, har hatt eller venter barn sammen. | En samboer arver 4 G etter loven bare når samboerne bodde sammen ved dødsfallet og har, har hatt eller venter barn sammen. Samboere uten felles barn arver bare hvis det står i et testament. | Vilkåret om at de bodde sammen ved dødsfallet manglet. Det var heller ikke sagt at samboere uten felles barn ikke arver etter loven | Arveloven §§ 12–13; [regjeringen.no: Arv og arveloven](https://www.regjeringen.no/no/tema/lov-og-rett/innsikt/arv/id2006122/); [Domstolene: Hva arver du?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-arver-du/) | **Krever juridisk godkjenning før merge** |
| T21 | «Hvem arver», testament | (ny setning) | Ektefellens minstearv kan ikke tas bort, og ektefellens og samboerens arv kan bare begrenses hvis de fikk vite om testamentet før dødsfallet. | Før sto bare pliktdelsarven, som om testament ellers kunne endre alt. Kravet om at de visste om testamentet er det sentrale vernet. Unntaket når det var umulig eller urimelig vanskelig å varsle dem, er ikke nevnt | [regjeringen.no: Arv og arveloven](https://www.regjeringen.no/no/tema/lov-og-rett/innsikt/arv/id2006122/) («kan begrenses i testament bare dersom ektefellen har fått kunnskap om testamentet»); arveloven §§ 10 og 12 | **Krever juridisk godkjenning før merge** |
| T22 | «Hvem arver», kilder | Arveloven §§ 4–6, 8, 9, 12 og 50 · Domstolene: Hvem er arvinger? | Arveloven · Domstolene: Hva arver du? · Domstolene: Hvem er arvinger? | Paragrafnumrene i lenketeksten kunne ikke kontrolleres mot Lovdata. Lenken går til hele loven | – | Nei |
| T23 | `rules.js` testamentLimitsPartnerKnew (resultattekst) | Fordi {partnerDu} visste om testamentet, kan det gi mindre enn loven ellers sier. Minstearven er likevel beskyttet, og her blir arven {partnerAmount}. | … Med testamentet blir arven {partnerAmount}. Ektefellens minstearv kan ikke tas bort, men samboerens arv kan begrenses. | **F1/U3.** For samboer gir beregningen 0 kr, og da var «minstearven er likevel beskyttet» feil. Bare tekst: når varselet vises, og beløpet, er uendret (`calculate.js` partnerInheritance) | Arveloven §§ 10 og 12; [regjeringen.no](https://www.regjeringen.no/no/tema/lov-og-rett/innsikt/arv/id2006122/) | **Krever juridisk godkjenning før merge.** Juristen bør også bekrefte at samboerens 4 G kan begrenses helt (beregningen gir 0 kr) |
| T24 | Ordliste, minstearv (side) og `glossary.js` | … ektefelle (4 G eller 6 G) arver, uansett testament. Samboer med felles barn arver 4 G, men et testament kan begrense det hvis samboeren visste om testamentet. | Et minstebeløp ektefellen arver uansett testament: 4 G når avdøde hadde barn, ellers 6 G. Samboer med felles barn arver 4 G etter loven, men det kan begrenses i et testament hvis samboeren fikk vite om testamentet før dødsfallet. | Sier når det er 4 G og når det er 6 G. «Visste om» er presisert til «fikk vite om … før dødsfallet», som er vilkåret | Som T21 | **Krever juridisk godkjenning før merge** |
| T25 | Fase 2, skifteform | Privat skifte betyr at arvingene selv tar hånd om fordelingen. … For små bo finnes også forenklede former: bo av liten verdi og summarisk skifte, der arvingene overtar boet mot å dekke gravferdsutgiftene. | Privat skifte betyr at arvingene selv tar hånd om oppgjøret, og at minst én av dem påtar seg ansvaret for avdødes gjeld. … Er det lite igjen når gravferden er betalt, kan tingretten i stedet gi fullmakt til å ta hånd om eiendelene (bo av liten verdi). | Gjeldsansvaret er det viktigste ved privat skifte, og det manglet. Summarisk skifte er ikke en skifteform for små bo (se T29) | Arveloven §§ 95 og 117; [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/) | **Krever juridisk godkjenning før merge** |
| T26 | Fase 2, 60-dagersfristen (K3, U5) | Ta gjerne kontakt med tingretten innen 60 dager etter dødsfallet — de gir råd og veiledning uten kostnad. Er dere usikre eller uenige, spør spesifikt om hvilken skifteform som passer boet deres. | Fristen er 60 dager etter dødsfallet: innen da må minst én arving ha påtatt seg gjelden og meldt privat skifte til tingretten, eller gjenlevende ektefelle eller samboer ha meldt at de vil sitte i uskifte. Retten kan sette en annen frist. Tingretten veileder om skifteformene, og skjemaene ligger på domstol.no. | Fristen er ikke en frist for å kontakte retten. Den gjelder overtakelse av gjelden ved privat skifte og melding om uskifte. Tingretten gir veiledning, ikke juridiske råd. «Uten kostnad» er fjernet fordi det ikke kunne bekreftes | Arveloven §§ 117–118 (privat skifte), § 19 (ektefelle), § 34 (samboer) og § 96; [Domstolene: Hva må arvinger gjøre?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-ma-arvinger-gjore-etter-et-dodsfall/); [skjema for samboere](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/melding-om-uskiftet-bo-for-samboere.pdf) | **Krever juridisk godkjenning før merge** |
| T27 | Ordliste, bo av liten verdi (K5) | Forenklet skifteform for dødsbo der eiendelene knapt dekker gravferdskostnadene og eventuell gjeld. | Er avdødes eiendeler av liten verdi når gravferden er betalt, kan tingretten gi den som ordnet gravferden, eller en annen som sto avdøde nær, fullmakt til å ta hånd om dem uten vanlig skifte. Ansvaret for gjelden er begrenset til det man får. | Vilkåret er at eiendelene er av liten verdi etter gravferdsutgiftene, ikke gjelden. Det er en fullmakt, ikke en skifteform | Arveloven § 95; [Domstolenes skjema](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/erklaring-om-privat-oppgjor-av-dodsbo-av-liten-verdi.pdf) | **Krever juridisk godkjenning før merge** |
| T28 | Ordliste, proklama (K7) | … melde krav innen seks uker, slik at boets gjeld blir klarlagt før fordeling. | … melde krav innen seks uker etter siste kunngjøring. Krav som ikke meldes i tide, kan falle bort, så boets gjeld blir klarlagt før fordelingen. | Fristen løper fra siste kunngjøring. Virkningen (kravet kan falle bort) er grunnen til å be om proklama | Arveloven §§ 100–103; [SNL: proklama](https://snl.no/proklama) | **Krever juridisk godkjenning før merge** |
| T29 | Ordliste, summarisk skifte (K4) | Forenklet skifteform der arvingene overtar et lite bo mot å dekke gravferdsutgiftene, uten et fullt privat eller offentlig skifte. | Et forenklet offentlig skifte som gjenlevende ektefelle kan be tingretten om. Ektefellen lager selv en oversikt over eiendelene og gjelden. | Den gamle definisjonen beskrev bo av liten verdi. Summarisk skifte er et forenklet offentlig skifte som bare gjenlevende ektefelle kan be om | Arveloven § 141; [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/); Prop. 107 L (2017–2018) | **Krever juridisk godkjenning før merge.** Vurder om begrepet bør stå i ordlisten i det hele tatt |
| T30 | Ordliste, uskifte | … overtar boet udelt i stedet for å skifte med de andre arvingene nå. Barna arver senere. | … For samboere gjelder det felles bolig og innbo, bil og fritidsbolig. Barna arver senere. | Samboerens uskifte gjelder bare disse eiendelene. Veiviseren regner allerede slik (`calculate.js`, scenarios 8) | Arveloven § 32 (samboerens uskifte); [skjema for samboere](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/melding-om-uskiftet-bo-for-samboere.pdf) | **Krever juridisk godkjenning før merge** |
| T31 | Fase 1, gravferd (K2) | Ansvaret for å arrangere gravferden følger en egen rekkefølge …: ektefelle/samboer, barn, foreldre, besteforeldre, søsken, deretter søskens barn. Blir de ansvarlige uenige, avgjør kommunen … | Retten til å sørge for gravferden følger en egen rekkefølge …: ektefelle eller samboer, barn, foreldre, barnebarn, besteforeldre, søsken, søskens barn og foreldres søsken, så lenge de er over 18 år. Har avdøde skrevet ned hvem som skal sørge for gravferden, gjelder det. Er like nære pårørende uenige, avgjør kommunen … | Barnebarn og foreldres søsken manglet, og så gjorde aldersgrensen og avdødes skriftlige erklæring. Kommunen avgjør bare når like nære pårørende er uenige | Gravplassloven § 9 ([Lovdata](https://lovdata.no/lov/1996-06-07-32)); [Gravplassveilederen](https://www.gravplassveileder.no/gravferd/gravferdsansvarlig-erklaring-og-rettighetsrekkefolge/) | **Krever juridisk godkjenning før merge** |
| T32 | Fase 1, bankkonto (K1) | Banken sperrer kontoen så snart dødsfallet er registrert i Folkeregisteret. Andre med disposisjonsrett til en felles konto mister denne retten samtidig. | Banken sperrer avdødes kontoer når den får melding om dødsfallet, vanligvis via Folkeregisteret. Også den som hadde fullmakt til å bruke kontoen, mister tilgangen til arvingene kan vise skifteattest. Gravferden kan likevel betales fra avdødes konto. | Påstanden om felleskonti kunne ikke bekreftes og er fjernet. At gravferden kan betales fra kontoen, er nyttig og bekreftet av banken | Bankpraksis, ikke lov: [DNB: Dødsbo](https://www.dnb.no/privat/tema/dodsbo.html) | **Krever juridisk og faglig vurdering.** Gjelder bankpraksis; kontroller mot Finans Norge eller flere banker |
| T33 | Fase 1, gravferdsstønad (K8) | Gravferdsstønad er en behovsprøvd støtte til gravferdsutgifter … | Gravferdsstønad er støtte til gravferdsutgifter. Den er behovsprøvd, unntatt når avdøde var under 18 år … | Teksten motsa sjanse-sjekken, som allerede sier at stønaden ikke er behovsprøvd under 18 år | [NAV: Gravferdsstønad](https://www.nav.no/gravferdsstonad) (kontrollert i runde 1) | Nei (samme som sjanse-sjekken) |
| T34 | Fase 4, uenighet | … kan tingretten oppnevne en bobestyrer til å gjennomføre et offentlig skifte. | … kan en arving kreve offentlig skifte, og tingretten oppnevner da en bostyrer som gjennomfører skiftet. | Offentlig skifte krever at en arving ber om det. «Bostyrer» er lovens ord og det samme som i ordlisten | [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/) | **Krever juridisk godkjenning før merge** |
| T35 | Fase 5, forhåndsfastsetting (K6) | Forhåndsfastsetting avklarer boets skattemessige stilling før det avsluttes formelt, slik at arvingene slipper skatteoverraskelser i etterkant. / Ta kontakt med Skatteetaten … og be om forhåndsfastsetting. | Med forhåndsfastsetting blir skatten for dødsboet fastsatt før boet avsluttes, slik at dere ikke må vente på det vanlige skatteoppgjøret. Det kan ikke kreves når gjenlevende sitter i uskifte, eller når én arving har tatt over boet alene. / Lever «Skattemelding for forhåndsfastsetting» for dødsboet når dere vet datoen boet avsluttes, og før det avsluttes. | Sier hva det faktisk er og når det ikke kan brukes. «Skatteoverraskelser» var et løfte som ikke kunne underbygges | [Skatteetaten: Skattemelding for forhåndsfastsetting](https://www.skatteetaten.no/en/person/taxes/tax-return/tax-return-person/tax-return-for-advance-tax-assessment/); [Skatteetaten: Skattemelding og skatteoppgjør for avdøde](https://www.skatteetaten.no/en/person/national-registry/dodsfall/fa-oversikt-over-avdodes-okonomi/) | **Krever juridisk godkjenning før merge** |
| T36 | Fase 5, nytt punkt (erstatter arvemeldingen, T10) | Sende arvemelding til Skatteetaten … senest tre måneder etter at fordelingen er klar. (fjernet i runde 1) | **Sørge for skattemeldingen for avdøde, og oppgi arven i egen skattemelding.** Det skal ikke sendes arvemelding for dødsfall fra 2014. Skattemeldingen for avdøde for dødsåret må likevel leveres, og har du arvet 100 000 kroner eller mer, skal du opplyse om det i din egen skattemelding under «Gave og arv». / Ta vare på opplysninger om hva avdøde betalte for bolig, hytte, aksjer og fond. Det kan ha betydning for skatten hvis dere selger noe dere har arvet. | Arvemeldingen er avviklet, men pliktene som gjelder i dag, manglet etter at punktet ble fjernet: skattemeldingen for dødsåret og opplysningsplikten for arv. Det gamle punktet sa med rette at arven kan ha betydning når arvet eiendom selges; det er beholdt uten detaljer om inngangsverdi, som har unntak | [Skatteetaten: Arveavgiften er opphevet](https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/gift-and-inheritance/inheritance-tax-is-abolished/); [Skatteetaten: Slik påvirkes din skatt som etterlatt](https://www.skatteetaten.no/en/person/national-registry/dodsfall/egen-skatt/); [Skatteetaten: Skattemelding og skatteoppgjør for avdøde](https://www.skatteetaten.no/en/person/national-registry/dodsfall/fa-oversikt-over-avdodes-okonomi/); [Skatte-ABC A-17: Arv og gave – inngangsverdi og kontinuitet](https://www.skatteetaten.no/en/rettskilder/type/handboker/skatte-abc/gjeldende/a-17-arv-og-gave--inngangsverdi-og-kontinuitet/A-17.041/A-17.043/) | **Krever juridisk godkjenning før merge.** Beløpsformuleringen er rettet i T37 |
| T37 | Fase 5, arv over 100 000 kr (rettelse av T36) | … har du arvet 100 000 kroner eller mer, skal du opplyse om det i din egen skattemelding under «Gave og arv». | … har du arvet verdier på over 100 000 kroner, må du opplyse om det i din egen skattemelding under «Gave og arv». | Skatteetatens norske veiledning sier «Har du arvet verdier på over 100 000 kroner, må du opplyse om det i skattemeldingen din. Du legger inn verdien av arven under «Gave og arv».» Grensen er «over», ikke «eller mer», og gjelder verdier, ikke bare penger. (Skjemaet RF-1616 og siden om gaver bruker «100 000 kroner eller mer» for pengegaver; siden for etterlatte er fulgt her.) | [Skatteetaten: Slik påvirkes din skatt som etterlatt](https://www.skatteetaten.no/en/eksempler/etterlatte/dodsfall2/egen-skatt/); [Skatteetaten: Arveavgiften er opphevet](https://www.skatteetaten.no/en/person/taxes/get-the-taxes-right/gift-and-inheritance/inheritance-tax-is-abolished/) | **Krever juridisk godkjenning før merge** |
| T38 | Hjelpetekst til spørsmålet testamentPartnerKnew (`questions.js`, bare tekst) | … dersom de fikk vite om testamentet før dødsfallet. En minstearv er uansett beskyttet. | … Ektefellens minstearv er uansett beskyttet. | Samme feil som F1/T23: samboeren har ingen minstearv som er beskyttet mot testament. Spørsmålet, valgene og når det vises, er uendret | Som T21 | **Krever juridisk godkjenning før merge** |

**Ikke endret i runde 2, men kontrollert:**
- **Klasse 1** («barnebarn i stedet for et barn som er dødt») er riktig, men nevner ikke oldebarn. Det er beholdt for å holde teksten kort.
- **Pliktdelsarven** (2/3, høyst 15 G per barn) stemmer med `rules.js` compulsoryShare og arveloven § 50.
- **Sjanse-sjekken for gravferdsstønad** (30 898 kr i 2026, båretransport over 20 km) ble kontrollert i runde 1 og må oppdateres hvert år.

## 4c. Uavhengig gjennomgang, runde 4: før, etter og kilde

En uavhengig gjennomgang pekte på seks punkter, og alle er kontrollert:
- Punkt 1–5 stemmer og er rettet her (T39–T44).
- Punkt 6 gjelder planen for F11 og er rettet i avsnitt 7.
- Kontrollen avdekket i tillegg T44: en feil i veiviserens hjelpetekst om forskudd som gjennomgangen ikke nevnte.

Beregningsmotoren er ikke endret. Endringene i `questions.js` og `rules.js` er bare tekst.

Lovdata er fortsatt sperret fra arbeidsmiljøet. Kildene under er utdrag fra søk: Lovdata-utdrag der de finnes, ellers forarbeider og kommentarer. Alle rader krever jurist.

| # | Sted | Før | Etter | Hvorfor | Kilder | Status |
|---|---|---|---|---|---|---|
| T39 | «Hvem arver», 1. klasse (punkt 1) | Barna, og barnebarn i stedet for et barn som er dødt. Alle barna arver likt. | Barna, som arver likt. Er et barn dødt, går dets del til barnets barn, og videre til oldebarn og fjernere etterkommere. | Livsarvinger har ingen grense nedover. Fjernere livsarvinger arver på samme måte, med lik andel per gren. Teksten stoppet ved barnebarn. Beregningen regner fortsatt bare ett ledd (F11); resultatteksten representation sier det allerede | Arveloven § 4 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); Prop. 107 L (2017–2018); [Stortingets lovvedtak 55 (2018–2019)](https://www.stortinget.no/no/Saker-og-publikasjoner/Vedtak/Beslutninger/Lovvedtak/2018-2019/vedtak-201819-055/) | **Krever juridisk godkjenning før merge** |
| T40 | «Hvem arver», 3. klasse, og `rules.js` grandparentsInherit (punkt 2) | … til hans eller hennes barn (søskenbarn). Lenger går ikke arveretten etter loven. | … Finnes ingen arvinger på den ene siden, arver den andre siden alt. Lenger enn til søskenbarn går ikke arveretten etter loven. (Resultatteksten: «Finnes ingen arvinger på den ene siden, får den andre siden alt.») | § 6 sier at hele arven går til arvingene på den andre siden når den ene siden ikke har arvinger. Beregningen gjør det allerede (`heirs.js` thirdOrder bruker bare sider med arvinger; testen «besteforeldre: farfar og en halvtante på farssiden, ingen på morssiden») | Arveloven § 6 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [NOU 2014: 1 kap. 2](https://www.regjeringen.no/no/dokumenter/nou-2014-1/id750736/?ch=3); [paragrafer.no: § 6](https://www.paragrafer.no/arverett/arveloven-6/) (kommentar) | **Krever juridisk godkjenning før merge** |
| T41 | Testament og kravet om at ektefelle eller samboer visste om det (punkt 3): «Hvem arver», ordlisten (minstearv), `glossary.js` (minstearv) og hjelpeteksten til testamentPartnerKnew i `questions.js` | … kan bare begrenses hvis de fikk vite om testamentet før dødsfallet. | … hvis de fikk vite om testamentet før dødsfallet, eller det var umulig eller urimelig vanskelig å varsle dem. | Unntaket står i § 10 første ledd annet punktum (ektefelle) og gjelder tilsvarende for samboer (§ 12). Spørsmålet i veiviseren er fortsatt Ja / Nei / Vet ikke, og beregningen tar ikke hensyn til unntaket (F13) | Arveloven §§ 10 og 12 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [NOU 2014: 1 kap. 4](https://www.regjeringen.no/no/dokumenter/nou-2014-1/id750736/?ch=4); [paragrafer.no: § 10](https://www.paragrafer.no/arverett/arveloven-10/) og [§ 12](https://www.paragrafer.no/arverett/arveloven-12/) (kommentar) | **Krever juridisk godkjenning før merge** |
| T42 | Fase 2, 60-dagersfristen (punkt 4) | Fristen er 60 dager etter dødsfallet: innen da må minst én arving ha påtatt seg gjelden og meldt privat skifte til tingretten, eller gjenlevende ektefelle eller samboer ha meldt at de vil sitte i uskifte. … | Skal boet skiftes privat, må minst én arving ha påtatt seg ansvaret for gjelden innen 60 dager etter dødsfallet. Vil gjenlevende ektefelle eller samboer sitte i uskifte, må det også meldes innen 60 dager. Retten kan sette en annen frist. Arvingene kan i stedet kreve offentlig skifte, og overtar ingen boet, kan tingretten selv bestemme offentlig skifte. … | «Innen da må … eller …» kunne leses som at privat skifte og uskifte er de eneste mulighetene. Offentlig skifte (etter krav eller fordi ingen overtar) og bo av liten verdi (står i «Hva er det») er også mulig | Arveloven §§ 117–118, 19, 34 og 96; [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/) («Retten kan også selv beslutte offentlig skifte dersom ingen av arvingene overtar boet til privat skifte»); [Domstolene: Hva må arvinger gjøre?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-ma-arvinger-gjore-etter-et-dodsfall/) | **Krever juridisk godkjenning før merge** |
| T43 | Fase 3, forskudd, og ordlisten (side og `glossary.js`) (punkt 5) | … penger eller gjenstander avdøde ga til en arving mens de levde, og som avdøde bestemte at skulle trekkes fra arven senere. / En gave til et barn som avdøde sa skulle trekkes fra barnets arv senere (avkorting). | … ga til et barn eller barnebarn, på den betingelsen at det skulle trekkes fra arven senere. Betingelsen må ha vært satt da gaven ble gitt. / En gave til et barn eller barnebarn, gitt på den betingelsen at den skal trekkes fra arven senere (avkorting). Betingelsen må være satt da gaven ble gitt. | Etter arveloven 2019 må avkorting være satt som betingelse da ytelsen ble gitt, så mottakeren kunne avslå. Arvelateren kan ikke bestemme det ensidig senere. Avkorting gjelder livsarvinger, ikke «en arving» generelt | Arveloven § 75 ([Lovdata](https://lovdata.no/lov/2019-06-14-21)); [Advokatbladet: Avkortning i arv må bestemmes før 1. januar 2021](https://www.advokatbladet.no/arveloven/avkortning-i-arv-ma-bestemmes-for-1-januar-2021/152880); [paragrafer.no: § 75](https://www.paragrafer.no/arverett/arveloven-75/) (kommentar) | **Erstattet av T45 og T46** (skilte ikke mellom gaver før og etter 2021) |
| T44 | Veiviserens hjelpetekst «Hva er forskudd på arv (avkorting)?» (`questions.js`, bare tekst; ikke nevnt i gjennomgangen) | En gave til et barn trekkes bare fra arven dersom avdøde bestemte det da gaven ble gitt, eller senere i et testament. | En gave til et barn trekkes bare fra arven dersom avdøde satte det som betingelse da gaven ble gitt. For gaver gitt før 2021 kunne avdøde også bestemme det senere, men senest 31. desember 2020. | «Eller senere i et testament» er feil etter arveloven 2019. Overgangsregelen tillot senere fastsettelse for eldre gaver bare til og med 31.12.2020. Veiviseren gjelder dødsfall fra 2021, så overgangsregelen er relevant. Spørsmålet og beregningen er uendret | Som T43 (overgangsregelen: Advokatbladet) | **Feil, erstattet av T47.** Fristen 31.12.2020 er feil etter HR-2025-1182-A |

## 4d. Runde 5: forskudd på arv etter HR-2025-1182-A, og ny kontroll av kildene

### Hva var galt
T44 (runde 4) sa at avkorting for gaver gitt før 2021 «senest» måtte være bestemt 31. desember 2020. Det er feil.
- Kilden var en artikkel i Advokatbladet fra 2020. Den ble skrevet før Høyesterett tok stilling.
- Jeg sjekket ikke om nyere rettspraksis hadde endret forståelsen.
- T43 sa at betingelsen «må være satt da gaven ble gitt», uten å skille på når gaven ble gitt.

### Hva Høyesterett avgjorde
HR-2025-1182-A (24. juni 2025) tolker overgangsregelen i arveloven § 180 sjette ledd:
- Gaver gitt **før 1. januar 2021** følger arveloven 1972 § 38. Det gjelder også når arvelateren først bestemte eller forutsatte avkorting etter 2020.
- Gaver gitt **fra 1. januar 2021** følger arveloven § 75: avkorting må være satt som betingelse da gaven ble gitt.
- Lagmannsrettens dom ble opphevet.

Arveloven 1972 § 38, etter utdrag fra Lovdata:
- En «monaleg gåve» til en livsarving skal avkortes når de andre livsarvingene ikke har fått tilsvarende.
- Det gjelder når arvelateren har bestemt det, eller det er godtgjort at avkortingen samsvarer med arvelaterens forutsetninger.
- Det er ikke formkrav, og bestemmelsen kan komme etter gaven.
- Utlegg til underhold, sykehjelp og utdanning innenfor foreldrenes forsørgelsesplikt regnes ikke som forskudd.

**Kildestatus:**
- **(Utdatert, se avsnitt 4e: dommen er nå lest i sin helhet.)** Dommen er ikke lest i fulltekst. Både domstol.no og lovdata.no er sperret i nettverkspolicyen her, og avsnitt 19–43 er derfor ikke kontrollert.
- **Innholdet er hentet fra flere uavhengige sammendrag**, som er enige om hovedpunktet: [Hjort](https://www.hjort.no/hoyesterettsdom-om-tolkningen-av-overgangsreglene-om-avkortning-i-arv/), [Harris](https://harris.no/aktuelt/avkortning-av-arveforskudd-avklaring-i-ny-dom-fra-hoyesterett/), [Stiegler](https://stiegler.no/aktuelt/ny-dom-fra-hogsterett-om-avkorting-i-arv-for-gaver-gjevne-for-2021/), [Halvorsen & Co](https://halvorsenco.no/en/articles/family-and-heritage/supreme-court-judgement-hr-2025-1182-a-reduction-in-inheritance-and-transitional-rules/), [Langseth](https://www.langsethadvokat.no/avkortning-av-gaver-gitt-for-2021/) og [Dehn](https://www.dehn.no/aktuelt/hoeyesterettsdom-om-avkortning-i-arv-hva-betyr-dette-for-deg/).
- **Halvorsen & Co sitt engelske sammendrag** har én setning om «concurrency requirement» som kan leses motsatt. Den avviker fra de andre og fra brukerens lesning av dommen. Jurist bør lese avsnitt 19–43 selv.

Primærkilder:
- [HR-2025-1182-A](https://www.domstol.no/globalassets/upload/hret/avgjorelser/2025/juni/hr-2025-1182--a.pdf);
- [arveloven 1972 § 38](https://lovdata.no/lov/1972-03-03-5/§38);
- [arveloven §§ 75 og 180](https://lovdata.no/lov/2019-06-14-21).

### Rettelser (T45–T48)

| # | Sted | Før | Etter | Status |
|---|---|---|---|---|
| T45 (erstatter T43) | Fase 3, forskudd | Forskudd på arv er penger eller gjenstander avdøde ga til et barn eller barnebarn, på den betingelsen at det skulle trekkes fra arven senere. Betingelsen må ha vært satt da gaven ble gitt. | Forskudd på arv er en gave til et barn eller barnebarn som skal trekkes fra arven senere (avkorting). Reglene avhenger av når gaven ble gitt. For gaver gitt fra 1. januar 2021 må avdøde ha satt det som betingelse da gaven ble gitt. For gaver gitt før 2021 gjelder den gamle arveloven: en større gave kan trekkes fra hvis avdøde bestemte det, også senere, eller hvis det er godtgjort at det var avdødes forutsetning. / «Slik gjør du det» har fått: «Noter når hver gave ble gitt, og hva avdøde sa eller skrev om den.» | **Krever juridisk godkjenning før merge** |
| T46 (erstatter T43) | Ordlisten, forskudd på arv (side og `glossary.js`) | En gave til et barn eller barnebarn, gitt på den betingelsen at den skal trekkes fra arven senere (avkorting). Betingelsen må være satt da gaven ble gitt. | En gave til et barn eller barnebarn som skal trekkes fra arven senere (avkorting). For gaver gitt fra 2021 må det være satt som betingelse da gaven ble gitt. For gaver gitt før 2021 kan avdøde ha bestemt det senere. | **Krever juridisk godkjenning før merge** |
| T47 (erstatter T44) | Veiviserens hjelpetekst «Hva er forskudd på arv (avkorting)?» (`questions.js`, bare tekst og kilder) | … dersom avdøde satte det som betingelse da gaven ble gitt. For gaver gitt før 2021 kunne avdøde også bestemme det senere, men senest 31. desember 2020. | Reglene avhenger av når gaven ble gitt. En gave gitt fra 1. januar 2021 trekkes bare fra arven dersom avdøde satte det som betingelse da gaven ble gitt. For gaver gitt før 2021 gjelder den gamle arveloven: en større gave kan trekkes fra hvis avdøde bestemte det, også etter 2020, eller hvis det er godtgjort at det var avdødes forutsetning. Veiviseren spør ikke om når gavene ble gitt. | **Krever juridisk godkjenning før merge** |
| T48 | Resultatteksten advancementGifts (`rules.js`, bare tekst og kilder), som vises når brukeren svarer «Noen fikk gaver, men det ble ikke sagt noe om forskudd» | **Vanlige gaver trekkes ikke fra arven.** En gave trekkes bare fra arven hvis avdøde gjorde det til en betingelse at det var forskudd på arv. Det bør helst ha vært skriftlig og kjent for de andre barna. | **Gavene er ikke trukket fra arven.** Veiviseren har ikke trukket fra gavene. For gaver gitt fra 2021 er det riktig når avdøde ikke satte det som betingelse da gaven ble gitt. For gaver gitt før 2021 gjelder den gamle arveloven: en større gave kan likevel trekkes fra hvis avdøde bestemte det, også senere, eller hvis det var avdødes forutsetning. Avklar dette før dere fordeler. | **Krever juridisk godkjenning før merge.** Teksten fantes før PR #63, og var feil for gaver gitt før 2021 |

Kildene til veiviseren (`sources.js`) har fått arveloven 1972 § 38 og HR-2025-1182-A, og § 75 er merket «for gaver fra 2021». Hjelpeteksten og T48 viser til alle tre.

### Selvkritisk kontroll av de andre juridiske endringene

Søkt etter nyere avgjørelser fra Høyesterett og lovendringer for hvert tema. Det jeg ikke fant, er ikke bevis for at det ikke finnes noe. Søk i Lovdata ble ikke gjort, fordi Lovdata er sperret.

| Tema (T-nr.) | Funn | Konsekvens |
|---|---|---|
| Ansvar for gjeld ved privat skifte (T25, T26, T42) | Endringslov [LOV-2023-06-16-59](https://lovdata.no/lov/2023-06-16-59), i kraft 1.10.2023, endret §§ 20, 35, 92, 116, 118 og 139. Retten kan i særlige tilfeller lempe arvingens ansvar overfor enkelte kreditorer (§ 92). Arvinger som etter testament bare får et bestemt gode av liten verdi, kan ikke påta seg gjeldsansvar (§ 116) | Hovedregelen i teksten (minst én arving påtar seg gjelden) står seg. Lempingen er ikke nevnt; det er en forenkling, ikke en feil |
| Uskifte, frist (T26, T42) | Kildene spriker om paragrafnummeret for fristen ved ektefelleuskifte (§ 19 eller § 20), og § 20 ble endret i 2023 | Siden nevner ikke paragrafnummeret. I dette dokumentet er «§ 19» usikkert |
| Samboer (T20, T30, T41) | Ingen ny avgjørelse fra Høyesterett funnet. NOU 2025: 6 *Samboerloven* (mai 2025; lenke ikke kontrollert) er en utredning, ikke vedtatt lov | Teksten står seg. Samboerreglene kan endres senere og bør følges med |
| Uskifte, gaver fra uskifteboet | [HR-2022-2157-A](https://www.domstol.no/globalassets/upload/hret/avgjorelser/2022/november-2022/hr-2022-2157-a.pdf) om gaver fra uskiftet bo (faresone 10–30 % av nettoverdien) | Berører ikke tekstene i PR #63 |
| Pliktdelsarv (T3, «Hvem arver») | Ingen ny avgjørelse fra Høyesterett funnet om § 50 | Ingen endring |
| Arvegangsklassene (T16, T17, T39, T40) | Ingen ny avgjørelse funnet. Bekreftet mot utdrag av §§ 4–6, NOU 2014: 1 og kommentarer | Ingen endring |
| Kjennskap til testament (T21, T41) | Ingen ny avgjørelse funnet. Unntaket bekreftet for § 10; for samboer bare i kommentar og regjeringen.no | Ingen endring; § 12 bør leses av jurist |
| Gravferd (T31) | Gravplassloven § 9 ser ikke ut til å være endret etter 2011. Rekkefølgen stemmer i alle kilder | Ingen endring |
| Summarisk skifte (T29) | «§ 141» kommer bare fra et sekundært sammendrag | Paragrafnummeret er usikkert; teksten på siden nevner det ikke |
| Arv over 100 000 kr (T37) | Bekreftet mot Skatteetatens side for etterlatte | Ingen endring |
| Kildehenvisning, samboer og testament | Varselene testamentLimitsPartnerKnew og -NotKnew, og hjelpeteksten til testamentPartnerKnew, viste til § 13 (testament *til* samboer etter fem år). Regelen om å begrense samboerens arv står i § 12 | Rettet: viser nå til § 12 (`arveloven_samboer_arv`). Ingen tekst er endret |

### Hva er bekreftet, og hva er fortsatt usikkert
- **Bekreftet av flere uavhengige kilder** (men ikke av fulltekst fra Lovdata eller domstol.no):
  - gavetidspunktet avgjør (HR-2025-1182-A);
  - arvegangsklassene;
  - kravet om kjennskap til testament og unntaket fra det (§ 10);
  - 60-dagersfristen og offentlig skifte;
  - bo av liten verdi;
  - samboerens uskifte;
  - gravferdsrekkefølgen;
  - Skatteetatens punkter.
- **Usikkert:**
  - ordlyden i dommens avsnitt 19–43;
  - unntaket fra kjennskapskravet for samboer (§ 12);
  - om samboerens 4 G kan begrenses helt (F13);
  - paragrafnumrene § 19/§ 20 og § 141;
  - bankpraksis (T32).
- **Ingenting i dette dokumentet er juridisk godkjenning.** Kontrollen er gjort med AI mot tilgjengelige kilder og skal leses av jurist.

## 4e. Runde 6: primærkilder lest direkte

Etter at nettverkstilgangen ble utvidet, er primærkildene lest direkte der det var mulig. Lesningen er gjort med AI og er **ikke juridisk godkjenning**.

### Hvilke kilder som faktisk ble åpnet

| Kilde | Åpnet? | Hva som er kontrollert |
|---|---|---|
| [HR-2025-1182-A (PDF, domstol.no)](https://www.domstol.no/globalassets/upload/hret/avgjorelser/2025/juni/hr-2025-1182--a.pdf) | **Ja, hele dommen** (avsnitt 1–49 og domsslutningen) | Avsnitt 19–43, med ordrette sitater av arveloven 1972 § 38 første punktum (avsn. 21), § 75 første ledd (avsn. 22) og § 180 første og sjette ledd (avsn. 25–26). Enstemmig |
| [Lovvedtak 55 (2018–2019), stortinget.no (PDF)](https://www.stortinget.no/globalassets/pdf/lovvedtak/2018-2019/vedtak-201819-055.pdf) | **Ja** | Arveloven 2019 slik den ble vedtatt: §§ 2, 4, 5, 6, 8, 9, 10, 12, 13, 19, 20, 32–35, 50, 75, 76, 95, 96, 102, 116, 117, 118, 141 og 180. **Forbehold:** senere endringer er ikke med, blant annet [LOV-2023-06-16-59](https://lovdata.no/lov/2023-06-16-59) (§§ 20, 35, 92, 116, 118 og 139) og endringen om landbrukseiendom fra 2020 |
| lovdata.no (gjeldende, konsolidert lovtekst) | **Nei** | Lovdata svarer «405 Request stopped by Varnish IPS» til forespørsler fra arbeidsmiljøet, også fra en vanlig nettleser. Det er Lovdatas egen sperre. Den er ikke forsøkt omgått |
| [Domstolene: Hva må arvinger gjøre etter et dødsfall?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-ma-arvinger-gjore-etter-et-dodsfall/) | **Ja** | 60 dager, gjeldsansvar ved privat skifte, proklama (seks uker; gjelder ikke utenlandske kreditorer, pantekrav eller skatte- og avgiftskrav), vilkår for offentlig skifte |
| [Domstolene: Hva arver du?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-arver-du/) og [Hvem er arvinger?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hvem-er-arvinger/) | **Ja** | Minstearv for ektefelle og samboer, testament og kjennskap, pliktdelsarv |
| [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/) | **Nei** (siden ga tom tekst) | – |
| [Skatteetaten: Slik påvirkes din skatt som etterlatt](https://www.skatteetaten.no/person/folkeregister/dodsfall/egen-skatt/) | **Ja** | «Har du arvet verdier på over 100 000 kroner, må du opplyse om det i skattemeldingen. Du legger inn verdien av arven under «Gave og arv».» |
| [Skatteetaten: Dette må du gjøre når du har overtatt et dødsbo](https://www.skatteetaten.no/person/folkeregister/dodsfall/overta-avdodes-bo/) og [Tidlig innsending av skattemelding for dødsbo](https://www.skatteetaten.no/person/skatt/skattemelding/skattemelding-for-person/dodsbo/) | **Ja** | Skattemelding for avdøde for dødsåret; forhåndsfastsetting («så snart eiendeler og formue er fordelt»); kan ikke kreves ved uskifte eller én arving alene |
| [Skatteetaten: Søke om støtte til begravelsen](https://www.skatteetaten.no/person/folkeregister/dodsfall/soke-gravferdsstonad/) | **Ja** | «Retten til stønaden er avhengig av formue» |
| nav.no, gravferdsstønad | **Nei** (adressene ga 404) | Beløpet 30 898 kr er ikke kontrollert på nytt i denne runden |
| Gravplassloven § 9 (Lovdata) | **Nei** (Lovdata sperret) | Rekkefølgen er fortsatt bare kontrollert mot sekundærkilder |

### Hva dommen og lovteksten bekreftet
- **T45–T48 (forskudd):** riktige etter dommen.
  - Avsn. 20: arvelateren kunne etter 1972-loven «når som helst bestemme eller forutsette» avkorting.
  - Avsn. 23: § 75 har et «samtidighetskrav».
  - Avsn. 41: «For gaver som er gitt før 1. januar 2021, gjelder arveloven 1972 § 38.»
  - Avsn. 21: § 38 krever en «monaleg gåve» uten at de andre livsarvingene har fått tilsvarende. Ordet «større» er derfor byttet ut med «betydelig» (dommens ord i avsn. 27). Vilkåret om at de andre ikke har fått tilsvarende, er lagt til i hjelpeteksten.
  - Den uklare setningen i Halvorsen & Co sitt sammendrag gjelder samtidighetskravet i § 75 og strider ikke mot dommen.
- **Bekreftet ordrett mot lovvedtaket:**

  | T-nr. | Paragraf |
  |---|---|
  | T39 | § 4: «På samme måte arver fjernere livsarvinger» |
  | T16 | § 5 |
  | T17 og T40 | § 6, også «Hvis det ikke er arvinger på den ene siden, går hele arven til arvingene på den andre siden» og grensen ved besteforeldrenes barnebarn |
  | T19 | §§ 8–9 |
  | T21, T24 og T41 | §§ 10 og 12, med unntaket «umulig eller urimelig vanskelig å varsle» |
  | T20 | §§ 12–13 |
  | T28 | § 102: «seks uker fra siste kunngjøring»; «faller bort hvis ikke noe annet følger av lov» |
  | T26 og T42 | § 117: «Innen 60 dager etter dødsfallet eller innen en annen frist som retten setter» |
  | T42 | § 96: retten kan sette en kortere eller lengre frist for melding om uskifte |
  | T27 | § 95 |
  | Pliktdelsarv | § 50 |
- **§ 19 er riktig** for fristen ved ektefelleuskifte. § 20 gjelder ektefellens gjeldsansvar.

### Rettelser i denne runden (T49–T53)

| # | Sted | Før | Etter | Primærkilde | Status |
|---|---|---|---|---|---|
| T49 | Forskudd: fase 3, hjelpeteksten og resultatteksten advancementGifts | … en større gave kan trekkes fra … | … en betydelig gave kan trekkes fra … (hjelpeteksten: «en betydelig gave, som de andre barna ikke har fått tilsvarende av, …») | Arveloven 1972 § 38 («monaleg gåve utan at dei andre livsarvingane har fått tilsvarande verdiar»), HR-2025-1182-A avsn. 21 og 27 | **Krever juridisk godkjenning før merge** |
| T50 | Ordliste, summarisk skifte (erstatter T29) | Et forenklet offentlig skifte som gjenlevende ektefelle kan be tingretten om. Ektefellen lager selv en oversikt over eiendelene og gjelden. | Et forenklet offentlig skifte mellom gjenlevende ektefelle eller samboer og de andre arvingene. Registrering og proklama kan sløyfes hvis ektefellen eller samboeren legger frem en oversikt over eiendeler og gjeld som ingen av arvingene bestrider. | Arveloven § 141 annet ledd (gjelder ektefelle **eller samboer**). Ordet «summarisk skifte» står ikke i loven; det brukes av Domstolene | **Krever juridisk godkjenning før merge.** § 141 annet ledd har også vilkåret «minst én av arvingene har påtatt seg ansvaret for arvelaterens forpliktelser», som ikke er nevnt. Vurder å fjerne begrepet fra ordlisten |
| T51 | Ordliste, uskifte for samboer (presiserer T30) | … felles bolig og innbo, bil og fritidsbolig. | … felles bolig og innbo, og bil og fritidsbolig med innbo som de brukte sammen. | Arveloven § 32 (ikke § 28, som stod i dokumentet) | **Krever juridisk godkjenning før merge** |
| T52 | Fase 2, privat skifte (presiserer T25) | … og at minst én av dem påtar seg ansvaret for avdødes gjeld. | … og at minst én myndig arving påtar seg ansvaret for avdødes gjeld. | Arveloven § 116 første ledd («minst én av de myndige arvingene») | **Krever juridisk godkjenning før merge** |
| T53 | Fase 5, forhåndsfastsetting, «Slik gjør du det» (erstatter del av T35) | Lever «Skattemelding for forhåndsfastsetting» for dødsboet når dere vet datoen boet avsluttes, og før det avsluttes. | Med forhåndsfastsetting kan dere sende inn skattemeldingen for dødsboet så snart eiendelene er fordelt til arvingene, i stedet for å vente på den ordinære skattemeldingen. | Skatteetaten: «Forhåndsfastsetting betyr at dere kan sende inn skattemeldingen så snart eiendeler og formue er fordelt til arvingene» | Nei (Skatteetatens egen formulering) |

### Feil i dette dokumentet, rettet
- **«§ 28» for samboerens uskifte var feil.** § 28 gjelder krav om skifte av uskifteformuen. Riktig er § 32 (retten), § 34 (fristen) og § 96 (meldingen). Rettet i T26, T30, T42 og U5.
- **«§ 141» for summarisk skifte** er nå bekreftet som riktig paragraf (§ 141 annet ledd), men innholdet var upresist (T50).

### Nytt om F13 (samboerens 4 G og testament)
- **§ 12 annet ledd:** «Samboerens rett til arv etter første ledd kan begrenses ved testament bare hvis han eller hun har fått kunnskap om testamentet før arvelaterens død.»
- **§ 10 annet ledd** gir ektefellen et beløp som «ikke [kan] fratas … ved testament» (4 G / 6 G). § 12 har ingen tilsvarende grense for samboer.
- Ordlyden støtter derfor at samboerens arv kan begrenses helt, slik `calculate.js` regner (0 kr). Det er likevel en tolkning av ordlyden, ikke av forarbeider eller rettspraksis, og jurist bør bekrefte.

### Fortsatt ikke kontrollert mot primærkilde
- Gjeldende (konsolidert) lovtekst etter endringene i 2020 og 2023, særlig §§ 116 og 118.
- Gravplassloven § 9 (T31).
- Bankpraksis (T32).
- Gravferdsstønadens beløp for 2026.
- Domstolenes side om skifteformene.

## 4f. Runde 7: senere lovendringer (lovvedtaket fra 2019 er ikke gjeldende rett alene)

Lovvedtak 55 (2018–2019) viser loven slik den ble vedtatt. Det er brukt til å kontrollere ordlyden, men ikke alene som dokumentasjon på gjeldende rett. Dette er de kjente endringene i arveloven etter 2019:

| Endringslov | Ikrafttredelse | Hva er endret | Berører tekstene i PR #63? |
|---|---|---|---|
| [LOV-2020-12-18-149](https://lovdata.no/dokument/LTI/lov/2020-12-18-149) (landbrukseiendommer i dødsbo mv.) | Ikke kontrollert | Regler om landbrukseiendom ved skifte | Nei. Veiviseren støtter ikke landbrukseiendom (F9) |
| [LOV-2022-06-22-81](https://lovdata.no/LTI/lov/2022-06-22-81) (digitalt skifte av dødsbo) | 22.6.2022 (etter søkeutdrag) | Ny § 88 a | Nei |
| [LOV-2023-06-16-59](https://lovdata.no/lov/2023-06-16-59) (ansvaret for arvelaterens forpliktelser), [Prop. 86 L (2022–2023)](https://www.regjeringen.no/no/dokumenter/prop.-86-l-20222023/id2968728/), [Innst. 407 L (2022–2023)](https://www.stortinget.no/no/Saker-og-publikasjoner/Publikasjoner/Innstillinger/Stortinget/2022-2023/inns-202223-407l/?all=true) | 1.10.2023 ([FOR-2023-06-16-934](https://lovdata.no/dokument/LTI/forskrift/2023-06-16-934)); gjelder dødsfall etter ikrafttredelsen | Se punktene under tabellen | Nei, ikke det som står. Lemping, ansvarsgrensen under 3 G og regelen om testamentsarving med et lite gode er ikke nevnt. Det er forenklinger, ikke feil |
| En endringslov fra 7. mai 2021 (nummer ikke funnet) | Ikke kontrollert | Ukjent innhold | Ukjent; må sjekkes i Lovdata |

Endringene i LOV-2023-06-16-59, etter søkeutdrag:
- **§ 116, nye ledd:** retten kan i ekstraordinære tilfeller lempe arvingens ansvar overfor enkeltstående kreditorer når boet ikke strekker til. Det gjelder ikke krav arvingen kjente til, eller burde kjent til, da ansvaret ble overtatt.
- **§ 116, ny regel:** en testamentsarving som bare skal få et bestemt, avgrenset gode av liten verdi, regnes ikke som arving når det gjelder ansvaret for gjelden.
- **§§ 20 og 35:** ny setning om at § 116 femte ledd (lempingen) gjelder tilsvarende ved uskifte.
- **§ 92 (fullmakter) og eventuelt §§ 118 og 139:** innholdet er ikke kontrollert.
- **§ 116 første ledd:** hovedregelen ser ut til å stå uendret: minst én myndig arving må påta seg gjelden ved privat skifte.

**Kildestatus:**
- **Ikke lest i fulltekst:** endringslovene og den konsoliderte lovteksten. Lovdata sperrer forespørsler fra arbeidsmiljøet, og stortinget.no og regjeringen.no svarte 403 i denne runden.
- **Grunnlaget for innholdet over:** søkeutdrag fra Lovdata, regjeringen.no og Stortinget, og Advokatforeningens høringsuttalelse.
- **Konklusjon:** ingen av tekstene som er endret i PR #63, strider mot endringene. Det er likevel ikke kontrollert mot den konsoliderte lovteksten, og en jurist bør se på det.

### Funn i veiviserens resultattekster (ikke endret i PR #63)
- **`rules.js` (neste steg ved privat skifte):** «Arvklart kan hjelpe dere med å fordele eiendelene rettferdig.» Dette er samme produktløfte som ble rettet på siden (T7, T13). Det bør rettes; det er en produktbeslutning.
- **`rules.js` (privat skifte):** «Det koster ingenting.» Det er ikke kontrollert om skifteattest alltid er gebyrfri.
- **`rules.js` (gjeld større enn eiendeler):** «Men overtar dere boet ved privat skifte, blir dere personlig ansvarlige for gjelden.» Det stemmer som hovedregel. Det sier ikke at ansvaret er begrenset når boet er under 3 G (§ 116 andre ledd), eller at det kan lempes (fra 2023). Brukere med små bo kan bli unødig skremt.
- **`rules.js` (bo av liten verdi):** «Tingretten bruker i praksis en grense rundt 170 000 kroner.» Kildene spriker (F12).
- **`rules.js` (avdøde under 25 år):** veiviseren sier selv at den ikke tar hensyn til regelen i § 5 tredje ledd. Det er en kjent begrensning, og den er opplyst.

## 4g. Runde 8: resultattekster om gjeldsansvar og produktløfter

Endringene gjelder bare tekst i `rules.js`. Når varslene og stegene vises, og beregningen, er uendret. Tekstene vises i veiviserens resultat, ikke på selve siden, så fasiten er uendret.

| # | Sted (`rules.js`) | Før | Etter | Primærkilde | Status |
|---|---|---|---|---|---|
| T54 | Varselet «Gjelden er større enn det avdøde eide» (insolvent) | Men overtar dere boet ved privat skifte, blir dere personlig ansvarlige for gjelden. Vurder heller offentlig skifte … / Les mer: grensen under 3 G … Tingretten kan veilede dere gratis. | Men den som overtar boet ved privat skifte og påtar seg gjelden, blir som hovedregel personlig ansvarlig for den. Er verdiene i boet under tre ganger grunnbeløpet ({g3}), er ansvaret begrenset til det boet eier etter at begravelsen er betalt. Vurder ellers offentlig skifte … / Les mer: For dødsfall fra 1. oktober 2023 kan retten i ekstraordinære tilfeller lempe ansvaret overfor enkelte kreditorer, men ikke for krav arvingen kjente til da ansvaret ble overtatt. … | Arveloven § 116 første og andre ledd ([lovvedtak 55 (2018–2019)](https://www.stortinget.no/globalassets/pdf/lovvedtak/2018-2019/vedtak-201819-055.pdf), lest); lempingen: [LOV-2023-06-16-59](https://lovdata.no/lov/2023-06-16-59), i kraft 1.10.2023 (bare søkeutdrag) | **Krever juridisk godkjenning før merge.** Grensen under 3 G sto før bare under «Les mer». Nå står den i hovedteksten, fordi varselet vises nettopp når gjelden er større enn verdiene. «Gratis» er fjernet (ikke kontrollert) |
| T55 | «Den som overtar boet, tar ansvar for gjelden» (debtLiability) | Ved privat skifte må minst én voksen arving påta seg ansvaret … Har dere god oversikt over gjelden, er det sjelden et problem. | … minst én myndig arving … Få oversikt over gjelden før noen skriver under. / Les mer: + grensen under 3 G | § 116 første ledd (alle tre punktum) og andre ledd | **Krever juridisk godkjenning før merge.** «Sjelden et problem» var en beroligelse uten grunnlag |
| T56 | Neste steg «Ved privat skifte» (privateSkifte) | Minst én voksen arving skriver under … Det koster ingenting. | Minst én myndig arving skriver under … Skriv ikke under før dere har oversikt over gjelden. | § 116 første ledd; [Domstolene](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-ma-arvinger-gjore-etter-et-dodsfall/): «Er du i tvil om avdøde etterlot seg mer gjeld enn formue, bør du ikke uten videre undertegne på gjeldsansvaret.» | **Krever juridisk godkjenning før merge.** «Det koster ingenting» er fjernet, fordi det ikke er kontrollert |
| T57 | Neste steg «Fordel eiendelene» (divide) | Arvklart kan hjelpe dere med å fordele eiendelene rettferdig. | Arvklart kan vise hvem som ønsker hva, og gi dere loddtrekning, runder eller jevn fordeling etter verdi som utgangspunkt. Det er dere som avgjør. | Samme formulering som T7 på siden | Nei (produkt) |
| T58 | «Boet er lite» (smallEstate) | … kan tingretten gi den som ordnet begravelsen lov til … / Les mer: Tingretten bruker i praksis en grense rundt 170 000 kroner i samlede verdier. | … den som ordnet begravelsen, eller en annen som sto avdøde nær, … / Les mer: Det er tingretten som avgjør om boet er av liten verdi. | Arveloven § 95 første ledd (lovvedtaket, lest): «en person som har ordnet med begravelsen, eller en annen som har stått den avdøde nær» | **Krever juridisk godkjenning før merge.** Kronebeløpet er fjernet fordi kildene spriker. Grensen som styrer når rådet vises (`engine.js`), er uendret (F12) |

**Rettelse av ledd-henvisning:** 3 G-regelen står i § 116 **andre ledd**, ikke tredje. Det er kontrollert mot oppsettet i lovvedtak 55 (2018–2019):
- Første ledd har tre punktum: én myndig arving påtar seg gjelden; flere er solidarisk ansvarlige; de øvrige arvingene er ansvarlige bare inntil verdien av sin arv.
- Andre ledd er grensen under 3 G. Den viser til «første ledd første og annet punktum».
- Tredje ledd gjelder når ingen arvinger er myndige.
- Endringsloven fra 2023 la til fjerde og femte ledd. §§ 20 og 35 viser til «§ 116 femte ledd».

Rettet i dette dokumentet. Teksten i veiviseren nevner ikke ledd. Commit-meldingen til a83319a sier feilaktig «tredje ledd»; pushet historikk er ikke skrevet om.

**Kilder i veiviseren:** ny kilde `arveloven_2023_gjeld` (LOV-2023-06-16-59). Varselet viser nå til Domstolenes side «Hva må arvinger gjøre», som ble lest i runde 6, i stedet for siden om skifteformer, som ga tom tekst.

**Ikke endret, kontrollert:**
- **Uskifte:** «blir personlig ansvarlig for all gjelden» i `engine.js` og i neste steg for uskifte stemmer med §§ 20 og 35. Grensen under 3 G i § 116 andre ledd gjelder bare privat skifte. Lempingen fra 2023 gjelder også ved uskifte, men den er et unntak for ekstraordinære tilfeller og står ikke i teksten. `engine.js` er ikke endret, slik oppdraget krever.

**Funnet, utenfor veiviseren (ikke endret):** formuleringer om «rettferdig» fordeling andre steder i appen:
- meta-beskrivelsen for forsiden (`src/seo/pages.js`): «hjelper familier med å fordele arv på en ryddig, inkluderende og rettferdig måte»;
- overskriften «Rettferdig, ikke bare likt» på forsiden (`src/pages/LandingPage.jsx`);
- beskrivelsene av loddtrekning og runder i appen (`src/pages/ConflictPage.jsx`).

Det er markedsførings- og produkttekster utenfor PR #63 (forsiden har egen fasit og egne tester). De bør vurderes i en egen PR.

## 5. Uenighet mellom innholdet og beregningslogikken

| # | Innhold | Logikk | Status |
|---|---|---|---|
| U1 | Fase 3: forskudd «normalt trekkes fra» | Trekkes bare fra når avdøde sa det (`questions.js` advancements, `rules.js` advancementGifts) | Rettet (T6) |
| U2 | Ordlisten: samboerens 4 G gjelder «uansett testament» | Testament kan ta den bort hvis samboeren visste om det (`calculate.js:149`, protected 0) | Rettet (T11, T12, T24) |
| U3 | Resultatteksten testamentLimitsPartnerKnew: «Minstearven er likevel beskyttet» | For samboer blir arven 0 kr | Rettet som tekst (T23). Beregningen er uendret |
| U4 | Fase 5: arvemelding innen tre måneder | Ingen plikt for dødsfall fra 2014; veiviseren gjelder fra 2021 | Rettet (T10, T36) |
| U5 | Fase 2: «Ta gjerne kontakt med tingretten innen 60 dager» | Fristen gjelder overtakelse av gjelden ved privat skifte (§ 117) og melding om uskifte (§§ 19, 34 og 96) | Rettet (T26) |
| U6 | «Hvem arver» og `rules.js`: søskenbarn «i stedet for en besteforelder» | `heirs.js` thirdOrder: søskenbarn bare i stedet for en tante eller onkel som er død | Rettet (T17, T18) |
| U7 | «Hvem arver»: 1. og 2. klasse «og videre nedover» | `heirs.js` firstOrder og secondOrder regner bare ett ledd under et barn eller søsken som er dødt | **Ikke rettet** (beregningen). Teksten er riktig etter loven; se F11 i avsnitt 7 |

## 6. Formuleringer som var flagget (K1–K8)

Alle er nå behandlet i runde 2.

| # | Formulering (sted) | Utfall |
|---|---|---|
| K1 | Bankkonto og felleskonto (fase 1) | Rettet (T32). Fortsatt bankpraksis, ikke lov: krever vurdering |
| K2 | Rekkefølgen for gravferd (fase 1) | Rettet etter gravplassloven § 9 (T31) |
| K3 | 60 dager (fase 2) | Rettet (T26) |
| K4 | Summarisk skifte (ordlisten) | Rettet (T29); vurder å fjerne begrepet |
| K5 | Bo av liten verdi (ordlisten) | Rettet etter § 95 (T27) |
| K6 | Forhåndsfastsetting (fase 5) | Rettet (T35) |
| K7 | Proklama, seks uker (ordlisten) | Presisert (T28) |
| K8 | Gravferdsstønad (fase 1 og sjanse-sjekken) | Rettet i fase 1 (T33); beløpet må oppdateres hvert år |

## 7. Plan for endringer i beregningslogikken (F11–F14, ikke gjort)

Disse endrer hva veiviseren regner ut eller hvilke spørsmål den stiller. De tas i egne PR-er etter at PR #63 er godkjent, og hver av dem krever juridisk godkjenning av tekst og resultat.

### F11 – etterkommere i flere ledd (høyest prioritet)

**Hva er galt** (`heirs.js`, `ui.js`):
- **1. klasse:** for et barn som er dødt, spør veiviseren bare om antall barnebarn («Hvor mange barn etterlot barnet seg?», `children.N.grandchildren`). Et barnebarn som er dødt og har egne barn (oldebarn), kan ikke registreres.
  - Teller brukeren med det døde barnebarnet, får en død person arv.
  - Teller brukeren det ikke med, får oldebarna ingenting.
  - Har barnet bare etterlatt seg døde barnebarn med egne barn, filtreres hele linjen bort (`childLines`). Da kan veiviseren konkludere med at det ikke finnes livsarvinger, og gi arven til foreldre eller søsken.
- **2. klasse:** for et søsken som er dødt, spør veiviseren bare om antall barn som lever («Hvor mange barn har søskenet som lever?», `siblings.N.children`).
  - Barn av en nevø eller niese som er død, kommer ikke med.
  - Har søskenet bare barnebarn igjen, faller hele grenen bort, og delen går til de andre søsknene (`twoParentSplit`).
  - Arveloven §§ 4 og 5 setter ingen grense nedover i 1. og 2. klasse.
- **3. klasse er riktig:** søskenbarns barn arver ikke (§ 6), og veiviseren spør bare om søskenbarn som lever.

**Juridisk risiko: høy, men sjelden.**
- Feil arvinger og feil beløp kan vises. I verste fall flyttes arven til en annen arvegangsklasse, og pliktdelsarven blir feil.
- I 1. klasse står det allerede et varsel når barnebarn arver: «Veiviseren regner bare ett ledd ned» (`rules.js` representation, more).
- Varselet mangler i 2. klasse, og når hele linjen faller bort, fordi da vises ingen arvinger i den linjen.

**Anbefalt løsning i to trinn:**
1. **Trinn 1: stopp i stedet for feil svar** (liten PR, lav risiko).
   - Nytt spørsmål når et barn eller søsken er dødt: «Er noen av barna til {navn} også døde, og etterlot de seg barn?» (Ja / Nei / Vet ikke).
   - «Ja» eller «Vet ikke» gir en blokkering i `engine.js` collectBlockers: «Veiviseren regner ikke ut arv i flere ledd. Kontakt tingretten eller en advokat.»
   - Tekstene i ledetekstene presiseres: «… som lever» i 1. klasse, og «Tell bare barn som lever» i 2. klasse.
   - **Lagrede svar uten det nye spørsmålet behandles som «Uavklart», ikke «Nei».** Veiviseren viser spørsmålet når brukeren åpner det lagrede svaret, og gir ikke tall før det er besvart. «Nei» ville gjentatt den stille feilen for nettopp dem som allerede har lagret et svar. (Endret etter uavhengig gjennomgang, punkt 6.)
   - **Konsekvens:** Brukere med lagrede svar der et barn eller søsken er dødt, ser et nytt spørsmål i stedet for tallene de så før. Det bør stå hvorfor: «Vi har lagt til et spørsmål for å regne riktig når flere ledd er døde.» Lagrede svar uten noe barn eller søsken som er dødt, berøres ikke, fordi spørsmålet bare vises da.
2. **Trinn 2: full beregning** (større PR, middels risiko; bare hvis trinn 1 viser at det trengs).
   - Etterkommere registreres som et tre i stedet for et antall.
   - `heirs.js` deler rekursivt per stamme.
   - `ui.js` får nestede felt, og lagrede svar (tall) må gjøres om til trær.

**Tester:**
- `scenarios.test.js`, trinn 1:
  - 1. klasse, dødt barn med ett dødt barnebarn som har to barn → blokkering;
  - 2. klasse, dødt søsken med en nevø som er død og har ett barn → blokkering;
  - dødt barn uten barnebarn som lever, men med oldebarn → blokkering, ikke 2. klasse;
  - «Nei» gir samme resultat som i dag (regresjon for alle eksisterende scenarioer).
- `scenarios.test.js`, trinn 2: forventede brøker per stamme, for eksempel ½ · ½ · ½ for hvert av to oldebarn.
- `scenarios.test.js`, regresjon: søskenbarns barn arver aldri.
- `flow.test.js`: spørsmålet vises bare når et barn eller søsken er dødt, og «Vet ikke» stopper.
- `texts.test.js`: norsk og engelsk tekst finnes.
- `changes.test.js`:
  - lagrede svar uten det nye feltet, der et barn eller søsken er dødt, gir «Uavklart» (blokkering med spørsmålet), ikke tall;
  - lagrede svar uten noe barn eller søsken som er dødt, gir uendret resultat.
- e2e `journey.mjs`: én vei gjennom veiviseren som ender i blokkeringen.

### F12 – grensen for bo av liten verdi

**Hva er galt:** `engine.js` SMALL_ESTATE_LIMIT er 170 000 kr, og `rules.js` smallEstate sier at «tingretten bruker i praksis en grense rundt 170 000 kroner». Kildene spriker:
- én side hos Domstolene oppgir 170 000 kr;
- Drammen tingrett og Domstolenes skjema tar utgangspunkt i 1 G etter gravferdsutgiftene;
- arveloven § 95 sier bare «liten verdi».

**Juridisk risiko: lav til middels.** Det er bare et råd («vurder»), og retten avgjør. Men tallet kan gi falske forventninger, og domstolene kan praktisere ulikt.

**Anbefalt løsning:**
- Fjern kronebeløpet fra brukerteksten («Tingretten avgjør om boet er av liten verdi»).
- La grensen bare styre om rådet vises, uttrykt i G med kilde i kodekommentaren.
- Juristen velger 1 G eller 170 000 kr.

**Tester:**
- `scenarios.test.js`: bo rett over og rett under grensen;
- `texts.test.js`: ingen kronebeløp i teksten;
- `report.test.js`: rapporten viser rådet bare under grensen.

### F14 – forskudd på arv: gaver før og etter 1. januar 2021 (ny, høy prioritet)

**Hva er galt** (`questions.js` advancements, `facts.js`, `calculate.js`):
- Veiviseren spør ikke om når gavene ble gitt.
  - «Ja, og avdøde sa at det skulle trekkes fra arven» gir alltid avkorting.
  - «Noen fikk gaver, men det ble ikke sagt noe om forskudd» gir aldri avkorting.
- **For gaver gitt fra 2021:**
  - «Ja» er bare riktig hvis betingelsen ble satt da gaven ble gitt.
  - Har avdøde sagt det senere, trekker veiviseren fra for mye.
- **For gaver gitt før 2021** (arveloven 1972 § 38, HR-2025-1182-A):
  - «Ja» kan være riktig selv om det ble bestemt etter 2020.
  - «Noen fikk gaver …» kan være feil: en større gave kan avkortes hvis avdøde bestemte det senere, eller hvis det var avdødes forutsetning.
  - Mange bo etter dødsfall fra 2021 har gaver fra før 2021, så dette er ikke sjeldent.
- Kravet i § 38 om en «monaleg» (betydelig) gave, og om at de andre livsarvingene ikke har fått tilsvarende, er heller ikke spurt om.

**Juridisk risiko: høy.** Veiviseren kan:
- si at gaver ikke trekkes fra når de kanskje skal;
- trekke fra gaver som ikke skal trekkes fra.

Fordelingen mellom barna blir da feil. Resultatteksten (T48) varsler nå om dette, men tallene er uendret.

**Anbefalt løsning (egen PR, etter F11):**
1. **Nytt spørsmål** når det er svart «Ja» eller «Noen fikk gaver»: «Når ble gavene gitt?» med valgene «Før 2021», «Fra 2021», «Begge deler» og «Vet ikke».
2. **«Fra 2021» + «Ja»:** ett oppfølgingsspørsmål, «Ble det sagt da gaven ble gitt?». «Nei» eller «Vet ikke» gir ingen avkorting og et varsel.
3. **«Før 2021» + «Noen fikk gaver»:** ingen automatisk avkorting. Situasjonen markeres som sammensatt (complexReasons), med varselet om at gaver før 2021 kan avkortes etter den gamle loven, og råd om advokat ved større gaver.
4. **«Begge deler» eller «Vet ikke»:** ingen tall for fordelingen mellom barna før det er avklart, eller begge alternativene vises (med og uten avkorting).
5. **Lagrede svar** uten det nye spørsmålet behandles som «Uavklart», som i F11.
6. **Veiviseren skal ikke vurdere selv** om en gave var «monaleg», eller om det var avdødes forutsetning. Det er skjønn og overlates til familien eller advokat.

**Tester:**
- `scenarios.test.js`:
  - før 2021 + «Ja» → avkorting;
  - fra 2021 + «Ja» + sagt da gaven ble gitt → avkorting;
  - fra 2021 + «Ja» + sagt senere → ingen avkorting og varsel;
  - før 2021 + «Noen fikk gaver» → ingen avkorting og «sammensatt»;
  - «Vet ikke» → blokkering eller to alternativer.
- `flow.test.js`: spørsmålene vises bare når de er relevante.
- `changes.test.js`: lagrede svar gir «Uavklart».
- `texts.test.js` og `i18n.test.js`: begge språk.
- e2e `journey.mjs`: én vei med gave før 2021.

### F13 – samboerens 4 G og testament

**Hva det gjelder:** `calculate.js` partnerInheritance gir `protected: 0` for samboer. Når et testament begrenser samboerens arv og samboeren visste om det, blir arven 0 kr. For ektefelle gir det minstearv (4 G / 6 G).

**Juridisk risiko: middels.** Bygger på at 4 G etter § 12 kan begrenses helt ved testament. Hvis bare en del kan begrenses, er beløpet feil.

To mangler i tillegg:
- Unntaket fra kravet om at samboeren visste om testamentet (når det var umulig eller urimelig vanskelig å varsle) er ikke støttet. Spørsmålet testamentPartnerKnew er bare Ja / Nei / Vet ikke.
- «Vet ikke» gir i dag varselet «kan trolig ikke redusere». Det er riktig som utgangspunkt, men bør si at det må avklares.

**Anbefalt løsning:**
1. Juristen bekrefter regelen i § 12.
2. Stemmer den, endres ikke beregningen. Bare teksten og testene utvides.
3. Stemmer den ikke, endres `protected` for samboer i `calculate.js`, med tester.
4. Unntaket for varsling legges inn som et eget valg som går til blokkering eller «sammensatt», ikke som en beregning.

**Tester:**
- `scenarios.test.js`:
  - samboer, testament begrenser, visste → 0 kr (eller det juristen sier);
  - ektefelle med barn, visste → 4 G; ektefelle uten barn, visste → 6 G;
  - visste ikke → lovens arv;
  - «Vet ikke» → varsel og ingen redusert sum.
- `texts.test.js`: varselteksten for samboer og ektefelle.

## 8. Skille: hva hører hjemme i PR #63, og hva tas senere

**A. Juridiske tekstendringer i PR #63. Må godkjennes før merge:**
- runde 1: T3, T6, T9, T10, T11 og T12;
- runde 2: T16–T21, T23–T32 og T34–T38;
- runde 4 (uavhengig gjennomgang): T39–T42 (T43 og T44 er erstattet);
- runde 5 (forskudd etter HR-2025-1182-A): T45–T48.
- runde 6 (primærkilder lest direkte): T49–T52 (T53 er Skatteetatens egen formulering og hører til B-listen).
- runde 8 (resultattekster om gjeldsansvar): T54, T55, T56 og T58 (T57 er produkt og hører til B-listen).

Alle er tekst. Ingen endrer hva veiviseren regner ut eller spør om.

**B. Produkt- og SEO-endringer i PR #63. Godkjennes av produkteier:**
- T1, T2, T4, T5, T7, T8, T13, T14, T15 og T22;
- T33 (samme som sjanse-sjekken);
- utseendet på mobil;
- datoen i avsenderlinjen.

**C. Tekniske forbedringer i egne PR-er etter merge. Ikke del av PR #63:**

| # | Endring | Type | Prioritet |
|---|---|---|---|
| F11 | Etterkommere i flere ledd (trinn 1: stopp) | Spørsmål og blokkering | 1 |
| F14 | Forskudd: gaver før og etter 2021 | Spørsmål, «sammensatt» og beregning | 1–2 (sammen med eller rett etter F11) |
| F13 | Samboerens 4 G ved testament, unntak for varsling | Beregning (etter juridisk avklaring) | 2 |
| F2 | Stebarn er ikke avdødes arvinger (hint) | Spørsmålstekst | 3 |
| F12 | Grensen for bo av liten verdi | Beregning og tekst | 4 |
| F3 | «Snakk med advokat» ved utland, felles testament, landbruk og stor skjevdeling | Regler | 5 |
| F4–F10 | Se avsnitt 2 | Ulike | Senere |

## 9. Sjekkliste før PR #63 kan merges

- [ ] **Jurist** har lest HR-2025-1182-A (særlig avsnitt 19–43) og arveloven 1972 § 38 og §§ 75 og 180, og bekreftet T45–T48.
- [ ] **Jurist** har lest A-listen (avsnitt 8) mot gjeldende lovtekst på Lovdata, og godkjent eller rettet hver endring.
- [ ] **T32 (bankkonto)** er kontrollert mot bankene eller Finans Norge, eller tatt ut.
- [ ] **T36:** formuleringen om arv over 100 000 kr er kontrollert mot Skatteetaten (gjort, se T37).
- [ ] **Produkteier** har godkjent B-listen (avsnitt 8).
- [ ] **`UPDATED`** i `sections.js` er satt til datoen PR-en flettes, og fasiten er laget på nytt hvis noe er endret etter godkjenningen.
- [ ] **CI** er grønn på siste commit: testene, databasen, SEO-sjekken og røyktesten mot forhåndsvisningen.
- [ ] **Forhåndsvisningen** er sett på mobil og PC av en person.
- [ ] **F11, F14, F13 og F12** er registrert som egne oppgaver. F11 og F14 bør komme rett etter merge.

## 10. Sluttrapport (4. november 2026)

Rapporten bygger på kontroll med AI mot tilgjengelige primærkilder. **Den er ikke juridisk godkjenning.**

### 1. Klart: rettet og kontrollert mot primærkilder

**Lest i fulltekst:**
- [HR-2025-1182-A](https://www.domstol.no/globalassets/upload/hret/avgjorelser/2025/juni/hr-2025-1182--a.pdf);
- arveloven slik den ble vedtatt ([lovvedtak 55 (2018–2019)](https://www.stortinget.no/globalassets/pdf/lovvedtak/2018-2019/vedtak-201819-055.pdf));
- Domstolenes sider om arv og skifte;
- Skatteetatens sider om dødsfall, arv og forhåndsfastsetting.

**Rettet og bekreftet mot disse kildene:**

| Tema | T-nr. |
|---|---|
| Arvegangsklassene (§§ 4–6) | T16, T17, T39, T40 |
| Ektefellens og samboerens arv, testament og kjennskap (§§ 8–10, 12–13) | T19–T21, T24, T41 |
| Pliktdelsarv (§ 50) | – |
| Forskudd før og etter 2021 (HR-2025-1182-A, 1972 § 38, § 75) | T45–T49 |
| 60-dagersfristen og alternativene (§§ 96, 117) | T26, T42 |
| Proklama (§ 102) | T28 |
| Bo av liten verdi (§ 95) | T27, T58 |
| Summarisk skifte (§ 141) | T50 |
| Samboerens uskifte (§ 32) | T51 |
| Gjeldsansvar ved privat skifte, med grensen under 3 G (§ 116) | T52, T54–T56 |
| Arv over 100 000 kr i skattemeldingen | T37 |
| Forhåndsfastsetting | T53 |

**Produktløfter om «rettferdig» fordeling** er fjernet fra veiviseren (T7, T8, T13, T57).

**Beregningsmotoren er uendret.**

### 2. Fortsatt usikkert

| # | Hva | Hvorfor usikkert |
|---|---|---|
| 1 | Gjeldende, konsolidert lovtekst | Lovdata sperrer forespørsler fra arbeidsmiljøet. Endringene fra 2020, 2021 (innhold ukjent), 2022 og 2023 er bare lest i søkeutdrag (avsnitt 4f) |
| 2 | Lempingen fra 2023 (T54) | Ordlyden er ikke lest i fulltekst |
| 3 | Samboerens 4 G ved testament (F13) | Ordlyden i § 12 støtter at arven kan begrenses helt. Det er ikke bekreftet i forarbeider eller rettspraksis |
| 4 | Summarisk skifte (T50) | Vilkåret i § 141 om at en arving har påtatt seg gjelden, er ikke forklart, og begrepet står ikke i loven |
| 5 | Gravplassloven § 9 (T31) og bankpraksis (T32) | Ikke lest i primærkilde |
| 6 | Gravferdsstønaden for 2026 | Beløpet er ikke kontrollert på nytt |
| 7 | «Barn eller barnebarn» for «livsarving» om forskudd | Forenkling |

### 3. Konkrete feil som bør prioriteres etter merge

| Prioritet | # | Feil | Konsekvens for brukeren |
|---|---|---|---|
| 1 | F14 | Veiviseren spør ikke når gaver ble gitt. Gaver «uten beskjed» trekkes aldri fra (kan være feil for gaver før 2021), og «avdøde sa det» trekkes alltid fra (kan være feil for gaver fra 2021) | Feil fordeling mellom barna. Gjelder mange bo |
| 2 | F11 | Bare ett ledd under et barn eller søsken som er dødt | Oldebarn og barn av en nevø eller niese som er død, mangler. I verste fall går arven til feil arvegangsklasse |
| 3 | F13 | Testament som begrenser samboerens arv gir 0 kr. Unntaket fra varselkravet er ikke et valg | Kan gi feil beløp hvis juristen tolker § 12 annerledes |
| 4 | F2 | Det står ikke at ektefellens eller samboerens særkullsbarn ikke arver avdøde | Brukeren kan regne feil arvinger |
| 5 | F12 | Rådet om bo av liten verdi utløses ved 170 000 kr uten sikker kilde | Rådet kan vises for ofte eller for sjelden. Teksten lover ikke lenger et beløp |
| 6 | – | «Rettferdig» i forsidens meta-beskrivelse, overskrift og appens metodebeskrivelser | Produktløfte utenfor veiviseren |

### 4. Hva som må løses før merge

**Før merge av PR #63:**
- [ ] Jurist godkjenner eller retter de juridiske tekstendringene: T3, T6, T9–T12, T16–T21, T23–T32, T34–T42, T45–T52 og T54–T56 og T58.
- [ ] Jurist kontrollerer avsnitt 4f og T54 mot den konsoliderte lovteksten på Lovdata.
- [ ] T32 (bankkonto) kontrolleres eller tas ut.
- [ ] Produkteier godkjenner produkt- og SEO-tekstene: T1, T2, T4, T5, T7, T8, T13–T15, T22, T33, T53 og T57.
- [ ] `UPDATED` settes til datoen for merge; fasiten lages på nytt ved senere endringer.
- [ ] CI er grønn på siste commit, og en person ser forhåndsvisningen på mobil og PC.

### 5. Anbefaling
**PR #63 er klar til juridisk og produktmessig gjennomgang, men ikke til merge før sjekklisten over er oppfylt.** Tekstene er riktigere og bedre underbygd enn i produksjon. Feilene F14 og F11 finnes allerede i produksjon og blir ikke verre av PR-en. De bør tas som egne PR-er rett etter merge.
