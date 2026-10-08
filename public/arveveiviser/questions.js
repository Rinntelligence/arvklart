// Alle spørsmålene i veiviseren, i den rekkefølgen de stilles.
// Hvert spørsmål vises bare når `showIf` er oppfylt (se conditions.js), slik at
// brukeren kun får spørsmål som er relevante for sin situasjon.
//
// Tekst kan inneholde plassholdere som fylles inn i UI-et:
//   {partner}     → «ektefellen» / «samboeren»
//   {partnerDu}   → «deg» når brukeren selv er gjenlevende, ellers «ektefellen»/«samboeren»
//
// Typer: single, multi, date, number, percent, children, otherChildren, siblings, grandparents, assets, amounts, advancements
// `optional: true` betyr at feltet kan stå tomt.

const YES_NO_UNKNOWN = [
  { value: 'yes', label: 'Ja' },
  { value: 'no', label: 'Nei' },
  { value: 'unknown', label: 'Vet ikke' },
]

export const SECTIONS = [
  { id: 'death', label: 'Dødsfallet' },
  { id: 'family', label: 'Familie' },
  { id: 'marriage', label: 'Eierforhold' },
  { id: 'testament', label: 'Testament' },
  { id: 'assets', label: 'Formue' },
  { id: 'settlement', label: 'Oppgjøret' },
]

export const QUESTIONS = [
  // ── Dødsfallet ────────────────────────────────────────────────
  {
    id: 'role',
    section: 'death',
    type: 'single',
    title: 'Hvem er du i dette arveoppgjøret?',
    why: 'Vi bruker svaret til å formulere spørsmål og resultat slik at de passer deg. Det endrer ikke selve beregningen.',
    options: [
      { value: 'survivor', label: 'Gjenlevende ektefelle eller samboer' },
      { value: 'child', label: 'Barn av avdøde' },
      { value: 'relative', label: 'Annen slektning eller arving' },
      { value: 'helper', label: 'Jeg hjelper noen andre' },
    ],
  },
  {
    id: 'deathDate',
    section: 'death',
    type: 'date',
    title: 'Når døde avdøde?',
    why: 'Datoen avgjør hvilken arvelov som gjelder, og hvilket grunnbeløp (G) som brukes når vi beregner minstearv og grensen for pliktdelsarv.',
    learnMore: {
      text: 'Arveloven av 2019 gjelder for dødsfall fra og med 1. januar 2021. For dødsfall før dette gjelder den gamle arveloven av 1972, som har noen andre regler. Grunnbeløpet i folketrygden (G) justeres hvert år 1. mai.',
      sources: ['arveloven_ikraft', 'nav_g'],
    },
  },
  {
    id: 'residence',
    section: 'death',
    type: 'single',
    title: 'Bodde avdøde fast i Norge da hen døde?',
    why: 'Som hovedregel er det landet der avdøde hadde sitt siste faste bosted som bestemmer hvilke arveregler som gjelder.',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Bodde avdøde i et annet land, kan det landets arvelov gjelde – også for eiendeler i Norge. Det kan også være gjort et lovvalg i testament. Veiviseren beregner bare etter norske regler.',
      sources: ['arveloven_internasjonal'],
    },
  },

  // ── Familie ───────────────────────────────────────────────────
  {
    id: 'maritalStatus',
    section: 'family',
    type: 'single',
    title: 'Var avdøde gift eller samboer da hen døde?',
    titleSurvivor: 'Var du gift eller samboer med avdøde?',
    why: 'Ektefeller og samboere har ulike rettigheter. Det avgjør både hvem som arver, og om gjenlevende kan sitte i uskifte.',
    options: [
      { value: 'married', label: 'Gift (eller registrert partner)' },
      { value: 'cohabitant', label: 'Samboer' },
      { value: 'separated', label: 'Separert', hint: 'Eller det var søkt om separasjon eller skilsmisse før dødsfallet' },
      { value: 'none', label: 'Verken gift eller samboer', hint: 'Ugift, skilt, enke eller enkemann', hintSurvivor: 'Da regnes du ikke som gjenlevende ektefelle eller samboer etter arveloven' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      title: 'Hva regnes som samboer?',
      text: 'Med samboer menes to personer over 18 år som bor sammen i et ekteskapslignende forhold, og som ikke er gift med eller samboer med noen andre. Ektefeller arver ikke hverandre hvis en av dem hadde søkt om separasjon eller skilsmisse før dødsfallet.',
      sources: ['arveloven_samboer_def', 'arveloven_separasjon'],
    },
  },
  {
    id: 'cohabitantChildren',
    section: 'family',
    type: 'single',
    showIf: { q: 'maritalStatus', eq: 'cohabitant' },
    title: 'Hadde avdøde og samboeren barn sammen – eller ventet de barn?',
    titleSurvivor: 'Hadde du og avdøde barn sammen – eller venter dere barn?',
    why: 'Samboere har bare arverett og rett til uskifte etter loven dersom de har, har hatt eller venter barn sammen.',
    options: [
      { value: 'yes', label: 'Ja', hint: 'Også voksne barn, eller barn som er døde' },
      { value: 'no', label: 'Nei' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      text: 'Det er ikke et krav om hvor lenge dere har bodd sammen når dere har felles barn. Uten felles barn arver ikke en samboer etter loven, men kan arve gjennom testament.',
      sources: ['arveloven_samboer_arv'],
    },
  },
  // ── Tidligere uskifte: avdøde var enke eller enkemann og satt i uskifte ──
  {
    id: 'previousUskifte',
    section: 'family',
    type: 'single',
    showIf: { fact: 'askPreviousUskifte' },
    title: 'Satt avdøde i uskifte etter en ektefelle eller samboer som døde tidligere?',
    why: 'Det er vanlig at en enke eller enkemann har sittet i uskifte. Når hen dør, skal uskifteboet deles mellom arvingene etter begge to – ikke bare etter avdøde. Svaret endrer derfor hvem som arver hva.',
    options: [
      { value: 'yes', label: 'Ja', hint: 'For eksempel: mor beholdt alt da far døde, og barna fikk ikke arven etter far da' },
      { value: 'no', label: 'Nei', hint: 'Også hvis arven etter den første ble gjort opp da hen døde' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      title: 'Hva betyr det å sitte i uskifte?',
      text: 'Når en ektefelle dør, kan den gjenlevende velge å overta alt udelt, i stedet for å dele arven med barna med en gang. Det kalles å sitte i uskifte. Arven etter den første blir da liggende i boet til gjenlevende dør. Tingretten har registrert uskiftet og utstedt en uskifteattest, så du kan spørre tingretten hvis du er usikker.',
      sources: ['arveloven_uskifte', 'arveloven_uskifte_deling', 'domstol_uskifte'],
    },
  },
  {
    id: 'previousUskifteType',
    section: 'family',
    type: 'single',
    showIf: { q: 'previousUskifte', eq: 'yes' },
    title: 'Var den som døde først, gift med avdøde eller samboer?',
    why: 'Etter et ekteskap deles uskifteboet i to like deler. Etter et samboerskap deles det etter hvor mye hver av dem eide da uskiftet startet.',
    options: [
      { value: 'married', label: 'Gift (eller registrert partner)' },
      { value: 'cohabitant', label: 'Samboer' },
    ],
    learnMore: { sources: ['arveloven_uskifte_deling', 'arveloven_uskifte_samboer_deling'] },
  },
  {
    id: 'previousUskifteShare',
    section: 'family',
    type: 'percent',
    optional: true,
    showIf: { q: 'previousUskifteType', eq: 'cohabitant' },
    title: 'Omtrent hvor stor del av det som ble holdt i uskifte, eide {first}?',
    why: 'Etter samboere deles uskifteboet etter verdiene da uskiftet startet. Eide {first} for eksempel 60 prosent av boligen, får arvingene etter hen 60 prosent av uskifteboet. Vet du ikke, regner vi med halvparten.',
    learnMore: {
      text: 'Samboere kan bare sitte i uskifte med felles bolig og innbo, bil og fritidsbolig. Det er verdiforholdet mellom det hver av dere eide av disse tingene da uskiftet startet, som avgjør delingen. Står det noe om dette i uskifteattesten eller i papirene fra tingretten, kan du bruke det.',
      sources: ['arveloven_uskifte_samboer', 'arveloven_uskifte_samboer_deling'],
    },
  },
  {
    id: 'hasChildren',
    section: 'family',
    type: 'single',
    showIf: { not: { q: 'cohabitantChildren', eq: 'yes' } },
    title: 'Hadde avdøde barn?',
    why: 'Barn og deres etterkommere (livsarvinger) arver først. Svaret avgjør hvem som kan ha krav på arv.',
    options: [
      { value: 'yes', label: 'Ja', hint: 'Også adoptivbarn, barn fra tidligere forhold og barn som er døde' },
      { value: 'no', label: 'Nei' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
  },
  {
    id: 'children',
    section: 'family',
    type: 'children',
    showIf: { any: [{ q: 'hasChildren', eq: 'yes' }, { q: 'cohabitantChildren', eq: 'yes' }] },
    title: 'Fortell oss om barna til avdøde',
    // Forklaringen tilpasses: spørsmålene om felles barn vises bare når de er relevante.
    why: f => [
      'Hvert barn arver like mye. Er et barn dødt, går barnets del videre til barnets egne barn.',
      f.hasPartner ? (f.survivor
        ? 'Vi spør også om barna er dine. Barn avdøde hadde med andre, kalles særkullsbarn og har egne rettigheter.'
        : 'Vi spør også om barna er felles med {partner}. Barn avdøde hadde med andre, kalles særkullsbarn og har egne rettigheter.') : '',
      f.previousUskifte ? 'Fordi avdøde satt i uskifte, spør vi om hvert barn også er barnet til {first}. Da arver barnet også etter hen.' : '',
    ].filter(Boolean).join(' '),
    learnMore: {
      showIf: { any: [{ fact: 'hasPartner' }, { fact: 'previousUskifte' }] },
      title: 'Hva er et særkullsbarn?',
      text: 'Et særkullsbarn er et barn som avdøde har fra et annet forhold – altså ikke et felles barn med gjenlevende ektefelle eller samboer. Særkullsbarn må samtykke dersom gjenlevende vil sitte i uskifte. Et barn som var unnfanget før dødsfallet og blir født levende, arver også. Adoptivbarn arver på lik linje med andre barn.',
      sources: ['arveloven_livsarvinger', 'arveloven_uskifte_saerkull'],
    },
  },
  {
    id: 'previousSpouseChildren',
    section: 'family',
    type: 'single',
    showIf: { fact: 'previousUskifte' },
    title: 'Hadde {first} barn med noen andre enn avdøde?',
    why: 'Den delen av uskifteboet som hører til {first}, går til barna hans eller hennes – både felles barn med avdøde og barn fra andre forhold. Barn {first} hadde med andre, arver bare fra denne delen.',
    options: [
      { value: 'yes', label: 'Ja' },
      { value: 'no', label: 'Nei' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      text: 'Arvingene etter {first} bestemmes ut fra hvem som lever når uskifteboet skiftes – altså nå. Er et av barna dødt, arver barnets egne barn i stedet. Hadde {first} ingen barn som lever eller har etterkommere, går delen til foreldrene, søsknene eller andre slektninger av hen.',
      sources: ['arveloven_uskifte_arvinger', 'arveloven_uskifte_deling'],
    },
  },
  {
    id: 'previousSpouseChildrenList',
    section: 'family',
    type: 'otherChildren',
    showIf: { q: 'previousSpouseChildren', eq: 'yes' },
    title: 'Fortell oss om barna {first} hadde med andre',
    why: 'De deler den delen av uskifteboet som går til arvingene etter {first}, likt med de felles barna. Er et barn dødt, arver barnets barn i stedet.',
    learnMore: { sources: ['arveloven_uskifte_arvinger', 'arveloven_livsarvinger'] },
  },
  {
    id: 'separateChildrenConsent',
    section: 'family',
    type: 'single',
    showIf: { all: [{ fact: 'uskifteRelevant' }, { fact: 'hasSeparateChildren' }] },
    title: 'Samtykker særkullsbarna til at {partner} sitter i uskifte?',
    titleSurvivor: 'Samtykker særkullsbarna til at du sitter i uskifte?',
    why: 'Gjenlevende kan bare sitte i uskifte med særkullsbarnas arv hvis de samtykker. Uten samtykke må særkullsbarna få sin arv nå.',
    options: [
      { value: 'yes', label: 'Ja, alle samtykker' },
      { value: 'no', label: 'Nei, minst ett av dem samtykker ikke' },
      { value: 'unknown', label: 'Vet ikke ennå' },
      { value: 'notRelevant', label: 'Uskifte er ikke aktuelt for oss' },
    ],
    learnMore: {
      text: 'Et særkullsbarn som samtykker, gir fra seg retten til å få arven nå. Arven kommer i stedet når gjenlevende dør eller skifter. Er særkullsbarnet under 18 år, må vergen samtykke, og statsforvalteren må godkjenne det. Samtykker ikke særkullsbarnet, kan gjenlevende likevel sitte i uskifte med resten når særkullsbarnet har fått sin del.',
      sources: ['arveloven_uskifte_saerkull', 'domstol_uskifte'],
    },
  },
  {
    id: 'parents',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsParents' },
    title: 'Lever avdødes foreldre?',
    why: 'Når avdøde ikke etterlater seg barn eller barnebarn, er det foreldrene og deres etterkommere (søsken, nevøer og nieser) som arver neste.',
    options: [
      { value: 'both', label: 'Ja, begge lever' },
      { value: 'mother', label: 'Bare moren lever' },
      { value: 'father', label: 'Bare faren lever' },
      { value: 'none', label: 'Nei, ingen av dem lever' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: { sources: ['arveloven_andre_arvegang'] },
  },
  {
    id: 'hasSiblings',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsSiblings' },
    title: 'Hadde avdøde søsken eller halvsøsken?',
    why: 'Er en av foreldrene død, går den forelderens del videre til avdødes søsken på den siden – og til søsknenes barn (nevøer og nieser) hvis et søsken er dødt.',
    options: [
      { value: 'yes', label: 'Ja', hint: 'Også søsken som er døde' },
      { value: 'no', label: 'Nei' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
  },
  {
    id: 'siblings',
    section: 'family',
    type: 'siblings',
    showIf: { all: [{ fact: 'needsSiblings' }, { q: 'hasSiblings', eq: 'yes' }] },
    title: 'Fortell oss om søsknene til avdøde',
    why: 'Helsøsken arver fra både mors- og farssiden. Halvsøsken arver bare fra den siden de har felles med avdøde.',
    learnMore: { sources: ['arveloven_andre_arvegang'] },
  },
  {
    id: 'hasGrandparentLine',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsGrandparents' },
    title: 'Lever noen av avdødes besteforeldre, tanter, onkler eller søskenbarn?',
    why: 'Når det verken finnes barn, foreldre, søsken eller nevøer og nieser, arver besteforeldrene og deres barn (avdødes tanter og onkler).',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Er en tante eller onkel død, går delen videre til hans eller hennes barn (avdødes søskenbarn). Lenger enn det går ikke arveretten. Finnes det ingen arvinger etter loven og heller ikke testament, går arven til frivillig arbeid for barn og unge.',
      sources: ['arveloven_tredje_arvegang', 'arveloven_staten'],
    },
  },
  {
    id: 'grandparents',
    section: 'family',
    type: 'grandparents',
    showIf: { all: [{ fact: 'needsGrandparents' }, { q: 'hasGrandparentLine', eq: 'yes' }] },
    title: 'Fortell oss om besteforeldrene',
    why: 'Halvparten går til farssiden og halvparten til morssiden. Er en besteforelder død, går den delen til barna hans eller hennes (avdødes tanter og onkler).',
    learnMore: { sources: ['arveloven_tredje_arvegang'] },
  },

  // ── Eierforhold (ektefeller) ──────────────────────────────────
  {
    id: 'separateProperty',
    section: 'marriage',
    type: 'single',
    showIf: { fact: 'married' },
    title: 'Hadde avdøde og {partner} en ektepakt?',
    titleSurvivor: 'Hadde du og avdøde en ektepakt?',
    why: 'En ektepakt kan bestemme at noe skal holdes utenfor når formuen deles. Det påvirker hvor mye som er avdødes, og dermed hva som skal arves.',
    options: [
      { value: 'no', label: 'Nei', hint: 'Da er som regel alt felles formue' },
      { value: 'yes', label: 'Ja', hint: 'Eller noen har gitt arv eller gave med beskjed om at det skal holdes utenfor' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      title: 'Særeie og felleseie – kort forklart',
      text: 'Når ingenting annet er avtalt, eier ektefeller formuen sin som «felleseie». Det betyr at alt deles likt når ekteskapet slutter – også ved dødsfall. «Særeie» er det som er holdt utenfor denne delingen, fordi ektefellene har avtalt det i en ektepakt, eller fordi noen som ga en av dem arv eller gave, bestemte det. Er du usikker, kan du sjekke Ektepaktregisteret i Brønnøysundregistrene.',
      sources: ['ekteskapsloven_saereie', 'ekteskapsloven_deling'],
    },
  },
  {
    id: 'separatePropertyWho',
    section: 'marriage',
    type: 'single',
    showIf: { q: 'separateProperty', eq: 'yes' },
    title: 'Hvem sine eiendeler skal holdes utenfor?',
    why: 'Det avdøde har holdt utenfor (særeie), går i sin helhet inn i dødsboet. Det gjenlevende har holdt utenfor, beholder gjenlevende selv.',
    options: [
      { value: 'deceased', label: 'Noe av det avdøde eide' },
      { value: 'survivor', label: 'Noe av det gjenlevende eier' },
      { value: 'both', label: 'Begge deler' },
    ],
  },
  {
    id: 'separatePropertyAtDeath',
    section: 'marriage',
    type: 'single',
    showIf: { q: 'separateProperty', eq: 'yes' },
    title: 'Står det i ektepakten at dette bare gjelder ved skilsmisse – og ikke ved dødsfall?',
    why: 'Mange ektepakter sier at eiendelene skal holdes utenfor ved skilsmisse, men være felles hvis en av ektefellene dør. Da deles alt likt likevel.',
    options: [
      { value: 'no', label: 'Nei, det gjelder også ved dødsfall' },
      { value: 'yes', label: 'Ja, ved dødsfall er alt felles likevel' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
  },
  {
    id: 'skjevdeling',
    section: 'marriage',
    type: 'single',
    showIf: { fact: 'married' },
    title: 'Hadde avdøde eller {partner} verdier fra før ekteskapet, eller fikk noen av dem arv eller gaver under ekteskapet?',
    titleSurvivor: 'Hadde noen av dere verdier fra før ekteskapet, eller fikk dere arv eller gaver under ekteskapet?',
    why: 'Slike verdier kan i mange tilfeller holdes utenfor delingen av felleseiet (skjevdeling). Det kan endre hvor stor del av felleseiet som hører til dødsboet.',
    options: [
      { value: 'no', label: 'Nei, ingen vesentlige verdier' },
      { value: 'yes', label: 'Ja' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      title: 'Hva er skjevdeling?',
      text: 'Verdier som en ektefelle hadde da ekteskapet ble inngått, eller som er arvet eller fått i gave fra andre enn ektefellen, kan kreves holdt utenfor delingen. Det må kunne dokumenteres at verdiene fortsatt finnes – for eksempel i den samme boligen. Skjevdeling må kreves; det skjer ikke automatisk.',
      sources: ['ekteskapsloven_skjevdeling'],
    },
  },
  {
    id: 'skjevdelingAmounts',
    section: 'marriage',
    type: 'amounts',
    showIf: { q: 'skjevdeling', eq: 'yes' },
    title: 'Omtrent hvor mye kan holdes utenfor delingen?',
    why: 'Vi bruker beløpene til å vise hvordan fordelingen kan endre seg hvis skjevdeling kreves. Er du usikker, kan du la feltene stå tomme.',
    fields: [
      { key: 'deceased', label: 'Avdødes verdier fra før ekteskapet, arv og gaver' },
      { key: 'survivor', label: 'Gjenlevendes verdier fra før ekteskapet, arv og gaver' },
    ],
    optional: true,
  },

  // ── Testament ─────────────────────────────────────────────────
  {
    id: 'testament',
    section: 'testament',
    type: 'single',
    title: 'Har avdøde skrevet testament?',
    why: 'Et testament kan endre fordelingen. Loven setter likevel grenser for hva et testament kan bestemme når det finnes barn, ektefelle eller samboer med felles barn.',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Testamenter oppbevares ofte hjemme, hos advokat, i bank eller hos tingretten. Tingretten kan sjekke om avdøde har deponert et testament der. Testamentet må være skriftlig og underskrevet i nærvær av to vitner for å være gyldig.',
      sources: ['arveloven_testament_form', 'domstol_testament'],
    },
  },
  {
    id: 'testamentContent',
    section: 'testament',
    type: 'multi',
    showIf: { q: 'testament', eq: 'yes' },
    title: 'Hva sier testamentet? Velg alt som passer.',
    why: 'Du trenger ikke tolke testamentet juridisk – velg det som ligner mest. Vi forklarer hvilke grenser loven setter.',
    options: [
      { value: 'giveaway', label: 'Gir penger eller eiendeler til noen som ikke ellers ville arvet', hint: 'For eksempel en venn eller en organisasjon' },
      { value: 'toCohabitant', label: 'Gir noe til {partnerDeg}', showIf: { fact: 'cohabitantNoChildren' } },
      { value: 'uneven', label: 'Gir noen av arvingene mer enn andre, eller bestemte gjenstander' },
      { value: 'limitsPartner', label: 'Gir {partnerDeg} mindre enn loven ellers ville gitt', showIf: { fact: 'partnerInherits' } },
      { value: 'separateClause', label: 'Bestemmer at arven skal være mottakerens særeie' },
      { value: 'uskifte', label: 'Sier noe om uskifte', showIf: { fact: 'uskifteRelevant' } },
      { value: 'other', label: 'Noe annet, eller jeg er usikker' },
    ],
  },
  {
    id: 'testamentAmount',
    section: 'testament',
    type: 'number',
    showIf: { q: 'testamentContent', includes: 'giveaway' },
    title: 'Omtrent hvor mye er det testamentet gir bort til andre enn arvingene etter loven?',
    why: 'Vi sjekker om beløpet er innenfor det testamentet lovlig kan bestemme over, og trekker det fra før resten fordeles.',
    unit: 'kr',
  },
  {
    id: 'testamentCohabitantAmount',
    section: 'testament',
    type: 'number',
    showIf: { q: 'testamentContent', includes: 'toCohabitant' },
    title: 'Omtrent hvor mye gir testamentet til samboeren?',
    titleSurvivor: 'Omtrent hvor mye gir testamentet til deg?',
    why: 'Når avdøde hadde barn, kan et testament bare gi bort en viss del av arven. For samboere som har bodd sammen i minst fem år, gjelder en egen regel.',
    unit: 'kr',
  },
  {
    id: 'testamentPartnerKnew',
    section: 'testament',
    type: 'single',
    showIf: { q: 'testamentContent', includes: 'limitsPartner' },
    title: 'Fikk {partner} vite om testamentet mens avdøde levde?',
    titleSurvivor: 'Fikk du vite om testamentet mens avdøde levde?',
    why: 'Et testament kan bare gi ektefelle eller samboer mindre enn loven sier, dersom de fikk vite om testamentet før dødsfallet. En minstearv er uansett beskyttet.',
    options: YES_NO_UNKNOWN,
    learnMore: { sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'] },
  },
  {
    id: 'cohabitantFiveYears',
    section: 'testament',
    type: 'single',
    showIf: { q: 'testamentContent', includes: 'toCohabitant' },
    title: 'Hadde avdøde og samboeren bodd sammen i minst fem år?',
    titleSurvivor: 'Hadde du og avdøde bodd sammen i minst fem år?',
    why: 'Har dere bodd sammen de siste fem årene, kan testamentet gi samboeren inntil fire ganger grunnbeløpet (4 G – omtrent 546 000 kr i 2026), selv om det går ut over barnas pliktdelsarv.',
    options: YES_NO_UNKNOWN,
    learnMore: { sources: ['arveloven_testament_samboer'] },
  },

  // ── Forskudd på arv ──────────────────────────────────────────
  {
    id: 'advancements',
    section: 'testament',
    type: 'single',
    showIf: { fact: 'hasDescendants' },
    title: 'Fikk noen av barna forskudd på arv?',
    why: 'Forskudd på arv kan trekkes fra mottakerens arv, slik at fordelingen mellom barna blir riktig.',
    options: [
      { value: 'no', label: 'Nei' },
      { value: 'yes', label: 'Ja, og avdøde sa at det skulle trekkes fra arven' },
      { value: 'gift', label: 'Noen fikk gaver, men det ble ikke sagt noe om forskudd' },
      { value: 'unknown', label: 'Vet ikke' },
    ],
    learnMore: {
      title: 'Hva er forskudd på arv (avkorting)?',
      text: 'En gave til et barn trekkes bare fra arven dersom avdøde bestemte det da gaven ble gitt, eller senere i et testament. Vanlige gaver til jul og bursdag, og vanlig forsørgelse og utdanning, regnes normalt ikke som forskudd.',
      sources: ['arveloven_avkorting'],
    },
  },
  {
    id: 'advancementAmounts',
    section: 'testament',
    type: 'advancements',
    showIf: { q: 'advancements', eq: 'yes' },
    title: 'Hvor mye fikk hvert barn i forskudd?',
    why: 'Oppgi verdien da forskuddet ble gitt. Vi legger forskuddene til boet og trekker dem fra hos den som mottok dem.',
  },
  // ── Formue og gjeld ───────────────────────────────────────────
  {
    id: 'assets',
    section: 'assets',
    type: 'assets',
    title: 'Hva eide og skyldte avdøde?',
    titleMarried: 'Hva eide og skyldte {couple}?',
    why: 'Arv beregnes av det som er igjen når gjelden er betalt. Omtrentlige beløp holder – du kan alltid gå tilbake og justere.',
  },
  {
    id: 'previousUskifteOutside',
    section: 'assets',
    type: 'number',
    optional: true,
    showIf: { fact: 'previousUskifte' },
    title: 'Omtrent hvor mye av det avdøde eide, hørte ikke til uskifteboet?',
    why: 'Som hovedregel hører alt avdøde eide, til uskifteboet – også det hen sparte opp eller kjøpte etter at uskiftet startet. Det som ikke hørte til, går bare til arvingene etter avdøde. Vet du ikke, kan du la feltet stå tomt.',
    unit: 'kr',
    learnMore: {
      title: 'Hva kan holdes utenfor uskifteboet?',
      text: 'For ektefeller: arv eller gaver avdøde fikk mens hen satt i uskifte, og som giveren bestemte skulle være særeie. For samboere: alt annet enn felles bolig og innbo, bil og fritidsbolig – for eksempel bankinnskudd og aksjer som var avdødes egne. Det må kunne sannsynliggjøres at verdiene ikke hører til uskifteboet.',
      sources: ['arveloven_uskifte_formue', 'arveloven_uskifte_saereie', 'arveloven_uskifte_samboer'],
    },
  },
  {
    id: 'debtOverview',
    section: 'assets',
    type: 'single',
    title: 'Har dere full oversikt over gjelden til avdøde?',
    why: 'Arvinger som overtar boet ved privat skifte, blir personlig ansvarlige for avdødes gjeld. Er dere usikre, finnes det trygge måter å avklare dette på først.',
    options: [
      { value: 'yes', label: 'Ja, vi har god oversikt' },
      { value: 'no', label: 'Nei, det kan finnes gjeld vi ikke kjenner til' },
    ],
    learnMore: {
      title: 'Hva er proklama?',
      text: 'Et proklama er en kunngjøring der avdødes kreditorer blir bedt om å melde krav innen en frist. Krav som ikke meldes innen fristen, kan i mange tilfeller falle bort. Det er en trygg måte å få oversikt over gjelden før dere overtar boet.',
      sources: ['domstol_proklama', 'skifteloven_proklama'],
    },
  },

  // ── Oppgjøret ─────────────────────────────────────────────────
  {
    id: 'circumstances',
    section: 'settlement',
    type: 'multi',
    title: 'Gjelder noe av dette?',
    why: 'Disse forholdene kan gjøre et privat skifte vanskelig, og noen av dem krever ekstra steg.',
    exclusive: 'none',
    options: [
      { value: 'disagreement', label: 'Arvingene er uenige, eller samarbeider dårlig' },
      { value: 'unreachable', label: 'En arving er ukjent, vanskelig å nå eller bor i utlandet' },
      { value: 'minor', label: 'En av arvingene er under 18 år' },
      { value: 'guardianship', label: 'En av arvingene har verge' },
      { value: 'none', label: 'Ingen av disse' },
    ],
  },
]

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map(q => [q.id, q]))

// Kategorier i formue-steget. `uskifteCohabitant` markerer eiendeler en samboer kan sitte i uskifte med.
export const ASSET_FIELDS = [
  { key: 'bank', label: 'Bankinnskudd' },
  { key: 'home', label: 'Bolig', uskifteCohabitant: true },
  { key: 'cabin', label: 'Fritidsbolig', uskifteCohabitant: true },
  { key: 'car', label: 'Bil og andre kjøretøy', uskifteCohabitant: true },
  { key: 'securities', label: 'Aksjer, fond og andre verdipapirer' },
  { key: 'contents', label: 'Innbo og personlige eiendeler', uskifteCohabitant: true },
  { key: 'other', label: 'Annen formue' },
]
export const DEBT_FIELDS = [
  { key: 'mortgage', label: 'Boliglån' },
  { key: 'otherDebt', label: 'Annen gjeld', hint: 'Forbrukslån, kreditt, skatt, regninger' },
]
