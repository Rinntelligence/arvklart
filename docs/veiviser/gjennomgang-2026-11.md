# Arveveiviseren (`/veiviser`): gjennomgang av funksjon, innhold og SEO, november 2026

Gjelder draft-PR-en på grenen `claude/veiviser-innhold` (bygger på PR #62, der veiviseren ble lagt direkte i siden).

**Avgrensning.** Beregningene og spørsmålslogikken er ikke endret.
- Endringene gjelder innholdet på selve siden: `sections.js`, `ramme.html` og `pages.js`.
- I veiviseren er definisjonen av minstearv (`glossary.js`), to resultattekster i `rules.js` (T18, T23) og én hjelpetekst i `questions.js` (T38) rettet, fordi de var upresise eller motsa beregningen. Hvilket varsel som vises, og beløpene, er uendret.
- Forslag som ville endret beregningen, står i avsnitt 7.

**Kildekontroll.** Lovdata, Domstolene, NAV og Skatteetaten kunne ikke åpnes direkte fra arbeidsmiljøet (Lovdata er sperret i nettverkspolicyen). Påstandene er derfor kontrollert mot utdrag av primærkildene fra søk, og mot kildelisten veiviseren allerede bruker (`public/arveveiviser/sources.js`). Alt som er merket **Krever juridisk godkjenning før merge**, må leses av en jurist mot gjeldende tekst før PR-en flettes.

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
| Forskudd på arv til barn, med beskjed fra avdøde | Korrekt (testet) | scenarios 19 | Trekkes fra; aldri tilbakebetaling |
| Gaver uten beskjed om forskudd | Korrekt | `rules.js` advancementGifts | Trekkes ikke fra; forklart |
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
| T11 | Ordliste, minstearv (side) | Et minstebeløp ektefelle (4 G eller 6 G) eller samboer med felles barn (4 G) arver, uansett testament. | Et minstebeløp ektefelle (4 G eller 6 G) arver, uansett testament. Samboer med felles barn arver 4 G, men et testament kan begrense det hvis samboeren visste om testamentet. | Arveloven § 12 tredje ledd; beregningen gjør allerede dette (`calculate.js` partnerInheritance: protected 0 for samboer) | **Krever juridisk godkjenning før merge** |
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
| T26 | Fase 2, 60-dagersfristen (K3, U5) | Ta gjerne kontakt med tingretten innen 60 dager etter dødsfallet — de gir råd og veiledning uten kostnad. Er dere usikre eller uenige, spør spesifikt om hvilken skifteform som passer boet deres. | Fristen er 60 dager etter dødsfallet: innen da må minst én arving ha påtatt seg gjelden og meldt privat skifte til tingretten, eller gjenlevende ektefelle eller samboer ha meldt at de vil sitte i uskifte. Retten kan sette en annen frist. Tingretten veileder om skifteformene, og skjemaene ligger på domstol.no. | Fristen er ikke en frist for å kontakte retten. Den gjelder overtakelse av gjelden ved privat skifte og melding om uskifte. Tingretten gir veiledning, ikke juridiske råd. «Uten kostnad» er fjernet fordi det ikke kunne bekreftes | Arveloven §§ 117–118 (privat skifte), § 19 (ektefelle) og § 28 (samboer); [Domstolene: Hva må arvinger gjøre?](https://www.domstol.no/no/dodsfall-arv-og-skifte/hva-ma-arvinger-gjore-etter-et-dodsfall/); [skjema for samboere](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/melding-om-uskiftet-bo-for-samboere.pdf) | **Krever juridisk godkjenning før merge** |
| T27 | Ordliste, bo av liten verdi (K5) | Forenklet skifteform for dødsbo der eiendelene knapt dekker gravferdskostnadene og eventuell gjeld. | Er avdødes eiendeler av liten verdi når gravferden er betalt, kan tingretten gi den som ordnet gravferden, eller en annen som sto avdøde nær, fullmakt til å ta hånd om dem uten vanlig skifte. Ansvaret for gjelden er begrenset til det man får. | Vilkåret er at eiendelene er av liten verdi etter gravferdsutgiftene, ikke gjelden. Det er en fullmakt, ikke en skifteform | Arveloven § 95; [Domstolenes skjema](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/erklaring-om-privat-oppgjor-av-dodsbo-av-liten-verdi.pdf) | **Krever juridisk godkjenning før merge** |
| T28 | Ordliste, proklama (K7) | … melde krav innen seks uker, slik at boets gjeld blir klarlagt før fordeling. | … melde krav innen seks uker etter siste kunngjøring. Krav som ikke meldes i tide, kan falle bort, så boets gjeld blir klarlagt før fordelingen. | Fristen løper fra siste kunngjøring. Virkningen (kravet kan falle bort) er grunnen til å be om proklama | Arveloven §§ 100–103; [SNL: proklama](https://snl.no/proklama) | **Krever juridisk godkjenning før merge** |
| T29 | Ordliste, summarisk skifte (K4) | Forenklet skifteform der arvingene overtar et lite bo mot å dekke gravferdsutgiftene, uten et fullt privat eller offentlig skifte. | Et forenklet offentlig skifte som gjenlevende ektefelle kan be tingretten om. Ektefellen lager selv en oversikt over eiendelene og gjelden. | Den gamle definisjonen beskrev bo av liten verdi. Summarisk skifte er et forenklet offentlig skifte som bare gjenlevende ektefelle kan be om | Arveloven § 141; [Domstolene: Forskjellige former for skifte](https://www.domstol.no/no/dodsfall-arv-og-skifte/forskjellige-former-for-skifte/); Prop. 107 L (2017–2018) | **Krever juridisk godkjenning før merge.** Vurder om begrepet bør stå i ordlisten i det hele tatt |
| T30 | Ordliste, uskifte | … overtar boet udelt i stedet for å skifte med de andre arvingene nå. Barna arver senere. | … For samboere gjelder det felles bolig og innbo, bil og fritidsbolig. Barna arver senere. | Samboerens uskifte gjelder bare disse eiendelene. Veiviseren regner allerede slik (`calculate.js`, scenarios 8) | Arveloven § 28; [skjema for samboere](https://www.domstol.no/globalassets/da/skjema/arv-og-skifte/melding-om-uskiftet-bo-for-samboere.pdf) | **Krever juridisk godkjenning før merge** |
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

## 5. Uenighet mellom innholdet og beregningslogikken

| # | Innhold | Logikk | Status |
|---|---|---|---|
| U1 | Fase 3: forskudd «normalt trekkes fra» | Trekkes bare fra når avdøde sa det (`questions.js` advancements, `rules.js` advancementGifts) | Rettet (T6) |
| U2 | Ordlisten: samboerens 4 G gjelder «uansett testament» | Testament kan ta den bort hvis samboeren visste om det (`calculate.js:149`, protected 0) | Rettet (T11, T12, T24) |
| U3 | Resultatteksten testamentLimitsPartnerKnew: «Minstearven er likevel beskyttet» | For samboer blir arven 0 kr | Rettet som tekst (T23). Beregningen er uendret |
| U4 | Fase 5: arvemelding innen tre måneder | Ingen plikt for dødsfall fra 2014; veiviseren gjelder fra 2021 | Rettet (T10, T36) |
| U5 | Fase 2: «Ta gjerne kontakt med tingretten innen 60 dager» | Fristen gjelder overtakelse av gjelden ved privat skifte (§ 117) og melding om uskifte (§§ 19 og 28) | Rettet (T26) |
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

## 7. Plan for endringer i beregningslogikken (F11–F13, ikke gjort)

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

**Juridisk risiko: høy, men sjelden.** Feil arvinger og feil beløp vises uten varsel. I verste fall flyttes arven til en annen arvegangsklasse, og pliktdelsarven blir feil. Brukeren har ingen grunn til å mistenke feilen.

**Anbefalt løsning i to trinn:**
1. **Trinn 1: stopp i stedet for feil svar** (liten PR, lav risiko).
   - Nytt spørsmål når et barn eller søsken er dødt: «Er noen av barna til {navn} også døde, og etterlot de seg barn?» (Ja / Nei / Vet ikke).
   - «Ja» eller «Vet ikke» gir en blokkering i `engine.js` collectBlockers: «Veiviseren regner ikke ut arv i flere ledd. Kontakt tingretten eller en advokat.»
   - Tekstene i ledetekstene presiseres: «… som lever» i 1. klasse, og «Tell bare barn som lever» i 2. klasse.
   - Lagrede svar uten spørsmålet tolkes som «Nei», slik at eksisterende bo ikke endres. Det må sies i resultatet: «Forutsetter at ingen barnebarn, nevøer eller nieser er døde og har etterlatt barn.»
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
- `changes.test.js`: lagrede svar uten det nye feltet gir uendret resultat.
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
- runde 2: T16–T21, T23–T32 og T34–T38.

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
| F13 | Samboerens 4 G ved testament, unntak for varsling | Beregning (etter juridisk avklaring) | 2 |
| F2 | Stebarn er ikke avdødes arvinger (hint) | Spørsmålstekst | 3 |
| F12 | Grensen for bo av liten verdi | Beregning og tekst | 4 |
| F3 | «Snakk med advokat» ved utland, felles testament, landbruk og stor skjevdeling | Regler | 5 |
| F4–F10 | Se avsnitt 2 | Ulike | Senere |

## 9. Sjekkliste før PR #63 kan merges

- [ ] **Jurist** har lest A-listen (avsnitt 8) mot gjeldende lovtekst på Lovdata, og godkjent eller rettet hver endring.
- [ ] **T32 (bankkonto)** er kontrollert mot bankene eller Finans Norge, eller tatt ut.
- [ ] **T36:** formuleringen om arv over 100 000 kr er kontrollert mot Skatteetaten (gjort, se T37).
- [ ] **Produkteier** har godkjent B-listen (avsnitt 8).
- [ ] **`UPDATED`** i `sections.js` er satt til datoen PR-en flettes, og fasiten er laget på nytt hvis noe er endret etter godkjenningen.
- [ ] **CI** er grønn på siste commit: testene, databasen, SEO-sjekken og røyktesten mot forhåndsvisningen.
- [ ] **Forhåndsvisningen** er sett på mobil og PC av en person.
- [ ] **F11, F12 og F13** er registrert som egne oppgaver. F11 bør komme rett etter merge.
