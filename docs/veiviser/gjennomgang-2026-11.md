# Arveveiviseren (`/veiviser`): gjennomgang av funksjon, innhold og SEO, november 2026

Gjelder draft-PR-en på grenen `claude/veiviser-innhold` (bygger på PR #62, der veiviseren ble lagt direkte i siden).

**Avgrensning.** Beregningene og spørsmålslogikken er ikke endret; resultattekstene i `rules.js` og `engine.js` er heller ikke endret. Endringene gjelder bare innholdet på selve siden: `sections.js`, `ramme.html` og `pages.js`. I tillegg er én definisjon i veiviserens ordliste (`glossary.js`) rettet, fordi den motsa beregningen.

**Kildekontroll.** Lovdata, Domstolene, NAV og Skatteetaten kunne ikke åpnes direkte fra arbeidsmiljøet. Påstandene er derfor kontrollert mot utdrag av primærkildene fra søk, og mot kildelisten veiviseren allerede bruker (`public/arveveiviser/sources.js`). Alt som er merket **Krever juridisk godkjenning før merge**, må leses av en jurist mot gjeldende tekst før PR-en flettes.

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
| Ingen arvinger | Korrekt (testet) | scenarios «ingen arvinger» | Går til frivillig arbeid for barn og unge (§ 76) |
| Samboer med felles barn (4 G) | Korrekt (testet) | scenarios 6, 8 | Også «venter barn» |
| Samboer uten felles barn | Korrekt (testet) | scenarios 7 | Arver ikke uten testament |
| Testament som gir bort for mye | Korrekt (testet) | scenarios 13 | Begrenses av pliktdelsarven (2/3, høyst 15 G per barn) |
| Testament til samboer etter fem år (§ 13) | Korrekt (testet) | scenarios 13 | 4 G går foran pliktdelsarven |
| Testament som begrenser ektefellens arv (§ 10) | Korrekt (testet) | scenarios 13 | Ektefellen får minstearv hvis hen visste om testamentet |
| Testament som begrenser samboerens arv (§ 12) | **Kan villede** | `calculate.js:149`, `rules.js` testamentLimitsPartnerKnew | Beregningen gir riktig 0 kr, men teksten sier «Minstearven er likevel beskyttet, og her blir arven 0 kr». Se avsnitt 5 |
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
| «Bo av liten verdi» | Delvis | `engine.js` SMALL_ESTATE_LIMIT = 170 000 | Kommentaren sier at grensen er «domstolenes praksis», men det er ikke dokumentert med kilde |

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
| F1 | Rett teksten testamentLimitsPartnerKnew for samboer (ikke «minstearven er beskyttet» når den er 0 kr) | Høy | Lav | Lav (tekst, ingen beregning) | `rules.js`, engine_en.js |
| F2 | Si tydelig at ektefellens og samboerens barn fra andre forhold ikke er avdødes arvinger (hint på «Hadde avdøde barn?») | Høy | Lav | Lav | `questions.js` |
| F3 | Egen anbefaling «Snakk med advokat før dere skifter» ved utland, felles testament, landbruk og stor skjevdeling | Høy | Middels | Middels (juridisk avgrensning) | `engine.js` complexReasons, `rules.js` |
| F4 | Forklar § 56 (barn avdøde forsørget) i minorHeir, eller fjern kilden fra varselet | Middels | Lav | Lav | `rules.js` |
| F5 | Dokumenter eller fjern grensen SMALL_ESTATE_LIMIT (170 000 kr) | Middels | Lav | Middels | `engine.js` |
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

## 5. Uenighet mellom innholdet og beregningslogikken

| # | Innhold | Logikk | Status |
|---|---|---|---|
| U1 | Fase 3: forskudd «normalt trekkes fra» | Trekkes bare fra når avdøde sa det (`questions.js` advancements, `rules.js` advancementGifts) | Rettet (T6) |
| U2 | Ordlisten: samboerens 4 G gjelder «uansett testament» | Testament kan ta den bort hvis samboeren visste om det (`calculate.js:149`, protected 0) | Rettet (T11, T12) |
| U3 | Resultatteksten testamentLimitsPartnerKnew: «Minstearven er likevel beskyttet» | For samboer blir arven 0 kr | **Ikke rettet** (resultatlogikk, holdt utenfor). F1 |
| U4 | Fase 5: arvemelding innen tre måneder | Ingen plikt for dødsfall fra 2014; veiviseren gjelder fra 2021 | Rettet (T10) |
| U5 | Fase 2: «Ta gjerne kontakt med tingretten innen 60 dager» | Fristen på 60 dager er fristen for å overta gjelden ved privat skifte (§ 117) og for melding om uskifte (§ 19), ikke en frist for å kontakte retten | Beholdt, flagget (F-tekst 2) |

## 6. Formuleringer som er beholdt uendret, men flagget

Disse kunne ikke kvalitetssikres godt nok mot primærkilden fra arbeidsmiljøet. De er derfor beholdt, slik oppdraget krever, og må kontrolleres.

| # | Formulering (sted) | Hva som må sjekkes |
|---|---|---|
| K1 | «Avdødes bankkonto sperres automatisk … Andre med disposisjonsrett til en felles konto mister denne retten samtidig.» (fase 1) | Bankenes praksis, ikke lov; om det gjelder alle banker og felleskonti |
| K2 | Gravferd: «ektefelle/samboer, barn, foreldre, besteforeldre, søsken, deretter søskens barn» (fase 1) | Gravplassloven § 9 annet ledd: utdrag nevner ektefelle, barn, foreldre, barnebarn, besteforeldre og søsken. Sjekk om samboer er med, og plasseringen av barnebarn |
| K3 | «Ta gjerne kontakt med tingretten innen 60 dager …» (fase 2) | Se U5. Forslag: «Innen 60 dager må dere avklare om boet skal skiftes privat (arveloven § 117), eller melde uskifte (§ 19)» |
| K4 | «Summarisk skifte: Forenklet skifteform der arvingene overtar et lite bo mot å dekke gravferdsutgiftene …» (ordlisten) | Definisjonen ligner bo av liten verdi (§ 95). Summarisk skifte i arveloven ser ut til å være en forenklet behandling ved offentlig skifte. Kan være feil begrep |
| K5 | «Bo av liten verdi: … der eiendelene knapt dekker gravferdskostnadene og eventuell gjeld.» (ordlisten) | § 95: brutto eiendeler etter gravferdsutgiftene må antas å være av liten verdi; «og eventuell gjeld» er ikke vilkåret |
| K6 | «En forhåndsligning (nå: forhåndsfastsetting) avklarer … slik at arvingene slipper skatteoverraskelser» (fase 5) | Begrepet er rettet (T9). Gjelder ikke når gjenlevende sitter i uskifte eller én arving overtar alene (Skatteetaten). Vurder å si det |
| K7 | Proklama: «innen seks uker» (ordlisten) | Bekreftet: seks uker fra siste kunngjøring (§ 102). Bør presiseres |
| K8 | Gravferdsstønad «opptil 30 898 kr (2026-sats)», «ikke behovsprøvd under 18 år», båretransport «over 20 km» | Bekreftet mot nav.no for 2026. Beløpet må oppdateres hvert år |

## 7. Til godkjenning før merge

- **T3, T6, T9, T10, T11 og T12** (merket **Krever juridisk godkjenning før merge**) er gjennomgått og godkjent av jurist, eller rettet.
- **Produktformuleringene T5, T7, T8 og T13** stemmer med det Arvklart gjør.
- **Datoen i avsenderlinjen** (`UPDATED` i `sections.js`) er satt til dagen PR-en flettes.
- **K1–K8:** vurder om de skal rettes nå eller senere. De er ikke endret.
- **Ingen påstand om faglig gjennomgang** står på siden. Den legges til først når en navngitt person har gjort den.
