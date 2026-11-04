# Sikkerhetskontroller i arveveiviseren: F11 og F14 (november 2026)

**Mål:** veiviseren skal heller stoppe enn å vise et arveresultat som kan være feil. Endringen legger til spørsmål og blokkeringer i den eksisterende arkitekturen:
- spørsmål med `showIf` i `questions.js`;
- fakta i `facts.js`;
- harde blokkeringer i `engine.js` `collectBlockers`.

En hard blokkering stopper beregningen helt. Veiviseren viser da bare forklaringen og knappen «Gå til spørsmålet».

**Ikke endret:** beregningen av arv (`calculate.js`, `heirs.js`). Fradrag for forskudd brukes nå bare når vilkårene er avklart (`facts.advancements`). Det er den eneste endringen i hva som regnes ut, og den er nødvendig for sikkerhetskontrollen.

**Gamle lagrede svar:** et svar som mangler, også i svar lagret før disse spørsmålene fantes, behandles som **uavklart** og blokkerer. Det tolkes aldri som «Nei». Veiviseren spør da om det manglende svaret (`firstUnanswered`, og «Gå til spørsmålet» i resultatet).

Bygger på gjennomgangen i PR #63 (`docs/veiviser/gjennomgang-2026-11.md`, F11 og F14). Dette er kontroll med AI mot primærkilder, **ikke juridisk godkjenning**.

## F11: arvinger i flere ledd enn motoren regner

**Problemet** (`heirs.js`):
- **Barn som er dødt:** veiviseren spør bare om antall barnebarn som lever. Et barnebarn som er dødt og har egne barn (oldebarn), kommer ikke med. Har barnet bare etterlatt seg slike barnebarn, filtreres hele linjen bort. Da kan arven gå til foreldre eller søsken i stedet.
- **Søsken som er dødt:** det samme gjelder nevøer og nieser.
- **Uskifte:** det samme gjelder barna til den som døde først, når avdøde satt i uskifte.

**Rettsgrunnlaget:** arveloven § 4 («På samme måte arver fjernere livsarvinger») og § 5 (foreldrenes livsarvinger, uten grense nedover). Lovteksten er kontrollert mot [lovvedtak 55 (2018–2019)](https://www.stortinget.no/globalassets/pdf/lovvedtak/2018-2019/vedtak-201819-055.pdf). 3. arvegangsklasse trenger ikke kontrollen: § 6 stopper ved besteforeldrenes barnebarn (søskenbarn), og veiviseren spør bare om søskenbarn som lever.

**Nye spørsmål** (Ja / Nei / Vet ikke). Hvert spørsmål vises når minst én person i gruppen er død, **også når ingen i neste ledd lever**:

| Spørsmål | Vises når | Blokkering når svaret ikke er «Nei» |
|---|---|---|
| `deeperDescendants`: «Er noen av barnebarna også døde, og etterlot de seg egne barn?» | et barn er dødt (`facts.deadChild`) | `deeperDescendants` |
| `deeperSiblingDescendants`: «Er noen av nevøene eller niesene også døde, og etterlot de seg egne barn?» | søsken er relevante og et søsken er dødt (`facts.deadSibling`) | `deeperSiblingDescendants` |
| `deeperFirstSpouseDescendants`: «Er noen av barnebarna til {first} også døde, og etterlot de seg egne barn?» | avdøde satt i uskifte, og et barn av den som døde først er dødt (`facts.deadFirstSpouseChild`) | `deeperFirstSpouseDescendants` |

- **«Ja»:** «Arven går videre i flere ledd enn veiviseren kan beregne». Kontakt tingretten.
- **«Vet ikke» eller manglende svar:** «Svar på spørsmålet om flere ledd før vi beregner arven».
- **«Nei»:** samme resultat som før.

**Presisering i skjemaet:** feltet for et barn som er dødt het «Hvor mange barn etterlot barnet seg?». Nå heter det «Hvor mange av barnets barn lever?», som feltet for søsken allerede gjorde. Situasjonsteksten sier «… uten barn som lever» i stedet for «… uten å etterlate seg barn», som kunne være feil.

## F14: forskudd på arv og gavetidspunkt

**Rettsgrunnlaget:**
- **Gavetidspunktet avgjør** hvilke regler som gjelder: arveloven § 180 sjette ledd, slik [HR-2025-1182-A](https://www.domstol.no/globalassets/upload/hret/avgjorelser/2025/juni/hr-2025-1182--a.pdf) tolker den (lest i fulltekst; avsnitt 20–23, 33 og 41).
- **Gaver fra 1. januar 2021, § 75:** gaven avkortes «hvis dette var satt som en betingelse for ytelsen». Det er et samtidighetskrav: betingelsen må være satt senest da gaven ble gitt (HR avsnitt 23). Loven sier at betingelsen *bør* være skriftlig. Muntlig kan altså være nok.
- **Gaver før 2021, arveloven 1972 § 38 første punktum** (sitert i HR avsnitt 21): en «monaleg gåve» (betydelig gave), «utan at dei andre livsarvingane har fått tilsvarande verdiar», avkortes hvis arvelateren «har fastsett det» (når som helst, også etter 2020) eller det blir «godtgjort at avkorting vil vere i samsvar med føresetnadene til arvelataren».
- **Avkorting påvirker bare fordelingen mellom livsarvingene** (§ 75 fjerde ledd bokstav d). Med én barnelinje kan forskudd ikke endre resultatet. Derfor vises de nye spørsmålene og blokkeringene bare når det finnes mer enn én linje (`facts.advancementsMatter`). Med én linje er alt som før.

**Nye spørsmål:**
- `advancementTiming`: «Når ble gavene gitt?» med valgene Før 1. januar 2021 / 1. januar 2021 eller senere / Både før og etter / Vet ikke.
- `advancementConditionAtGift`: «Sa avdøde at gaven skulle trekkes fra arven allerede da den ble gitt?» Gjelder gaver fra 2021. Ja / Nei / Vet ikke. Forklaringen sier at muntlig er nok.
- `advancementSubstantial`: «Var gaven betydelig, uten at de andre barna har fått tilsvarende?» Gjelder gaver før 2021. Ja / Nei / Vet ikke.

**Presiserte valg i `advancements`:**
- «Ja, og avdøde sa …» har fått hintet «Også om det bare ble sagt muntlig».
- «Noen fikk gaver, men avdøde sa ikke at de skulle trekkes fra arven» (før: «… det ble ikke sagt noe om forskudd») har fått hintet «Velg «Vet ikke» hvis du ikke vet hva avdøde sa, skriftlig eller muntlig». Det skiller mellom at ingen betingelse ble satt og at det mangler skriftlig dokumentasjon.

**Beslutningstabell** (`facts.js`), når det finnes mer enn én barnelinje:

| Forskudd | Gavetidspunkt | Oppfølging | Resultat |
|---|---|---|---|
| Nei | – | – | Ingen fradrag (som før) |
| Vet ikke | – | – | **Blokkering** (før: regnet uten forskudd) |
| Ja / Gaver uten beskjed | Vet ikke eller mangler | – | **Blokkering** |
| Ja | Før 2021 | Betydelig: Ja | Fradrag |
| Ja | Før 2021 | Betydelig: Nei | Ingen fradrag (vilkårene i § 38 er ikke oppfylt), med forklaring |
| Ja | Før 2021 | Betydelig: Vet ikke eller mangler | **Blokkering** |
| Ja | Fra 2021 | Sagt da gaven ble gitt: Ja | Fradrag |
| Ja | Fra 2021 | Sagt da gaven ble gitt: Nei, Vet ikke eller mangler | **Blokkering** (se merknad under) |
| Ja | Begge | Sagt da gaven ble gitt: Ja, og betydelig: Ja | Fradrag |
| Ja | Begge | Alt annet | **Blokkering** (blandet) |
| Gaver uten beskjed | Fra 2021 | – | Ingen fradrag (ingen betingelse satt, § 75), med forklaring |
| Gaver uten beskjed | Før 2021 eller begge | Betydelig: Nei | Ingen fradrag, med forklaring |
| Gaver uten beskjed | Før 2021 eller begge | Betydelig: Ja, Vet ikke eller mangler | **Blokkering.** Avkorting kan følge av avdødes forutsetning, og det er skjønn veiviseren ikke kan utøve |

**Merknad:** «Ja, avdøde sa det» for en gave fra 2021, der det ble sagt senere, gir trolig ikke fradrag etter § 75. Veiviseren blokkerer likevel i stedet for å regne uten fradrag, fordi svarene peker i ulike retninger. Dette kan vurderes på nytt etter juridisk gjennomgang.

**Blokkeringen** (`advancementsUnresolved`) har tre forklaringer:
- skjønn ved avdødes forutsetning;
- vilkår ved gaver fra 2021 eller blandet;
- generell.

Knappen «Gå til spørsmålet» går til det første uavklarte spørsmålet.

**Tekster:** hjelpeteksten «Hva er forskudd på arv?» og varselet `advancementGifts` («Gavene er ikke trukket fra arven») er skrevet om etter tabellen. Kildelisten har fått `arveloven_1972_avkorting` og `hr_2025_1182`, de samme oppføringene som i PR #63.

## Tester
- **`test/arveveiviser/safety.test.js`** (32 tester):
  - hvert tilfelle i tabellene over;
  - eldre lagrede svar uten de nye feltene;
  - at spørsmålene vises bare når de er relevante;
  - at arven ikke går videre til foreldre når et barn er dødt og svaret mangler;
  - at én barnelinje er uendret;
  - at ektefellens arv er uendret.
- **Eksisterende tester:** standardsvaret for F11 er «Nei» (`helpers.js` `base`), og forskudd i scenario 19 og 20 bruker `ADVANCE_OK` (gave før 2021, betydelig). Alle eksisterende scenarioer gir samme resultat som før.
- **`test/e2e/veiviser.mjs`:** lagrede svar uten de nye feltene (én sjekk for F11, én for F14) gir blokkering uten beløp, «Gå til spørsmålet» åpner riktig spørsmål, og svaret lagres.

## Begrensninger og videre arbeid
- **Bred blokkering:** blokkeringen skjuler også det som ikke påvirkes, som ektefellens eller samboerens del ved forskudd (§ 75 d). Godkjent foreløpig. En mer presis visning, der bare fordelingen mellom barna skjules, er et senere valg.
- **Ingen beregning i flere ledd:** veiviseren beregner fortsatt ikke arv i flere ledd. Den stopper bare. Det er trinn 2 i planen (gjennomgangsdokumentet, avsnitt 7).
- **Skjønn i § 38** (betydelig gave og avdødes forutsetning) overlates til familien eller advokat.
- **Konflikter med PR #63:** tekstene om forskudd i `questions.js`, `rules.js` og `sources.js` er også endret i PR #63, og konfliktene løses i den PR-en som merges sist.
