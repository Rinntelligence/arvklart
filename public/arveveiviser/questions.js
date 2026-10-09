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
  { value: 'yes', label: 'Ja', label_en: 'Yes' },
  { value: 'no', label: 'Nei', label_en: 'No' },
  { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
]

export const SECTIONS = [
  { id: 'death', label: 'Dødsfallet', label_en: 'The death' },
  { id: 'family', label: 'Familie', label_en: 'Family' },
  { id: 'marriage', label: 'Eierforhold', label_en: 'Ownership' },
  { id: 'testament', label: 'Testament', label_en: 'Will' },
  { id: 'assets', label: 'Formue', label_en: 'Assets' },
  { id: 'settlement', label: 'Oppgjøret', label_en: 'The settlement' },
]

export const QUESTIONS = [
  // ── Dødsfallet ────────────────────────────────────────────────
  {
    id: 'role',
    section: 'death',
    type: 'single',
    title: 'Hvem er du i dette arveoppgjøret?', title_en: 'Who are you in this inheritance settlement?',
    why: 'Vi bruker svaret til å formulere spørsmål og resultat slik at de passer deg. Det endrer ikke selve beregningen.', why_en: 'We use the answer to phrase the questions and the result so that they suit you. It does not change the calculation itself.',
    options: [
      { value: 'survivor', label: 'Gjenlevende ektefelle eller samboer', label_en: 'Surviving spouse or cohabitant' },
      { value: 'child', label: 'Barn av avdøde', label_en: 'Child of the deceased' },
      { value: 'relative', label: 'Annen slektning eller arving', label_en: 'Another relative or heir' },
      { value: 'helper', label: 'Jeg hjelper noen andre', label_en: 'I am helping someone else' },
    ],
  },
  {
    id: 'deathDate',
    section: 'death',
    type: 'date',
    title: 'Når døde avdøde?', title_en: 'When did the deceased die?',
    why: 'Datoen avgjør hvilken arvelov som gjelder, og hvilket grunnbeløp (G) som brukes når vi beregner minstearv og grensen for pliktdelsarv.', why_en: 'The date decides which Inheritance Act applies, and which basic amount (G) is used when we calculate the minimum inheritance and the limit for the compulsory share (pliktdelsarv).',
    learnMore: {
      text: 'Arveloven av 2019 gjelder for dødsfall fra og med 1. januar 2021. For dødsfall før dette gjelder den gamle arveloven av 1972, som har noen andre regler. Grunnbeløpet i folketrygden (G) justeres hvert år 1. mai.', text_en: 'The Inheritance Act of 2019 applies to deaths on or after 1 January 2021. For earlier deaths, the old Inheritance Act of 1972 applies, which has some different rules. The National Insurance basic amount (G) is adjusted every year on 1 May.',
      sources: ['arveloven_ikraft', 'nav_g'],
    },
  },
  {
    id: 'residence',
    section: 'death',
    type: 'single',
    title: 'Bodde avdøde fast i Norge da hen døde?', title_en: 'Was the deceased permanently resident in Norway when they died?',
    why: 'Som hovedregel er det landet der avdøde hadde sitt siste faste bosted som bestemmer hvilke arveregler som gjelder.', why_en: 'As a main rule, it is the country where the deceased last had their permanent residence that decides which inheritance rules apply.',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Bodde avdøde i et annet land, kan det landets arvelov gjelde – også for eiendeler i Norge. Det kan også være gjort et lovvalg i testament. Veiviseren beregner bare etter norske regler.', text_en: 'If the deceased lived in another country, that country\'s inheritance law may apply – also to assets in Norway. A choice of law may also have been made in a will. The guide only calculates under Norwegian rules.',
      sources: ['arveloven_internasjonal'],
    },
  },

  // ── Familie ───────────────────────────────────────────────────
  {
    id: 'maritalStatus',
    section: 'family',
    type: 'single',
    title: 'Var avdøde gift eller samboer da hen døde?', title_en: 'Was the deceased married or cohabiting when they died?',
    titleSurvivor: 'Var du gift eller samboer med avdøde?', titleSurvivor_en: 'Were you married to or cohabiting with the deceased?',
    why: 'Ektefeller og samboere har ulike rettigheter. Det avgjør både hvem som arver, og om gjenlevende kan sitte i uskifte.', why_en: 'Spouses and cohabitants have different rights. It decides both who inherits and whether the survivor can keep the estate undivided (uskifte).',
    options: [
      { value: 'married', label: 'Gift (eller registrert partner)', label_en: 'Married (or registered partner)' },
      { value: 'cohabitant', label: 'Samboer', label_en: 'Cohabitant' },
      { value: 'separated', label: 'Separert', label_en: 'Separated', hint: 'Eller det var søkt om separasjon eller skilsmisse før dødsfallet', hint_en: 'Or separation or divorce had been applied for before the death' },
      { value: 'none', label: 'Verken gift eller samboer', label_en: 'Neither married nor cohabiting', hint: 'Ugift, skilt, enke eller enkemann', hint_en: 'Unmarried, divorced, widow or widower', hintSurvivor: 'Da regnes du ikke som gjenlevende ektefelle eller samboer etter arveloven', hintSurvivor_en: 'Then you are not regarded as a surviving spouse or cohabitant under the Inheritance Act' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      title: 'Hva regnes som samboer?', title_en: 'Who counts as a cohabitant?',
      text: 'Med samboer menes to personer over 18 år som bor sammen i et ekteskapslignende forhold, og som ikke er gift med eller samboer med noen andre. Ektefeller arver ikke hverandre hvis en av dem hadde søkt om separasjon eller skilsmisse før dødsfallet.', text_en: 'A cohabitant means two people over 18 who live together in a marriage-like relationship and who are not married to or cohabiting with anyone else. Spouses do not inherit from each other if one of them had applied for separation or divorce before the death.',
      sources: ['arveloven_samboer_def', 'arveloven_separasjon'],
    },
  },
  {
    id: 'cohabitantChildren',
    section: 'family',
    type: 'single',
    showIf: { q: 'maritalStatus', eq: 'cohabitant' },
    title: 'Hadde avdøde og samboeren barn sammen – eller ventet de barn?', title_en: 'Did the deceased and the cohabitant have children together – or were they expecting a child?',
    titleSurvivor: 'Hadde du og avdøde barn sammen – eller venter dere barn?', titleSurvivor_en: 'Did you and the deceased have children together – or are you expecting a child?',
    why: 'Samboere har bare arverett og rett til uskifte etter loven dersom de har, har hatt eller venter barn sammen.', why_en: 'Cohabitants only have a statutory right to inherit and to keep the estate undivided (uskifte) if they have, have had or are expecting children together.',
    options: [
      { value: 'yes', label: 'Ja', label_en: 'Yes', hint: 'Også voksne barn, eller barn som er døde', hint_en: 'Also adult children, or children who have died' },
      { value: 'no', label: 'Nei', label_en: 'No' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      text: 'Det er ikke et krav om hvor lenge dere har bodd sammen når dere har felles barn. Uten felles barn arver ikke en samboer etter loven, men kan arve gjennom testament.', text_en: 'There is no requirement for how long you have lived together when you have children together. Without children together, a cohabitant does not inherit under the law, but can inherit through a will.',
      sources: ['arveloven_samboer_arv'],
    },
  },
  // ── Tidligere uskifte: avdøde var enke eller enkemann og satt i uskifte ──
  {
    id: 'previousUskifte',
    section: 'family',
    type: 'single',
    showIf: { fact: 'askPreviousUskifte' },
    title: 'Satt avdøde i uskifte etter en ektefelle eller samboer som døde tidligere?', title_en: 'Was the deceased keeping an undivided estate (uskifte) after a spouse or cohabitant who died earlier?',
    why: 'Det er vanlig at en enke eller enkemann har sittet i uskifte. Når hen dør, skal uskifteboet deles mellom arvingene etter begge to – ikke bare etter avdøde. Svaret endrer derfor hvem som arver hva.', why_en: 'It is common for a widow or widower to have kept an undivided estate. When they die, the undivided estate is divided between the heirs of both of them – not only the heirs of the deceased. The answer therefore changes who inherits what.',
    options: [
      { value: 'yes', label: 'Ja', label_en: 'Yes', hint: 'For eksempel: mor beholdt alt da far døde, og barna fikk ikke arven etter far da', hint_en: 'For example: mother kept everything when father died, and the children did not receive their inheritance from father then' },
      { value: 'no', label: 'Nei', label_en: 'No', hint: 'Også hvis arven etter den første ble gjort opp da hen døde', hint_en: 'Also if the inheritance after the first to die was settled when they died' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      title: 'Hva betyr det å sitte i uskifte?', title_en: 'What does it mean to keep an undivided estate (uskifte)?',
      text: 'Når en ektefelle dør, kan den gjenlevende velge å overta alt udelt, i stedet for å dele arven med barna med en gang. Det kalles å sitte i uskifte. Arven etter den første blir da liggende i boet til gjenlevende dør. Tingretten har registrert uskiftet og utstedt en uskifteattest, så du kan spørre tingretten hvis du er usikker.', text_en: 'When a spouse dies, the survivor can choose to take over everything undivided, instead of sharing the inheritance with the children straight away. This is called keeping an undivided estate (uskifte). The inheritance after the first to die then stays in the estate until the survivor dies. The district court (tingretten) has registered the undivided estate and issued a certificate (uskifteattest), so you can ask the district court if you are unsure.',
      sources: ['arveloven_uskifte', 'arveloven_uskifte_deling', 'domstol_uskifte'],
    },
  },
  {
    id: 'previousUskifteType',
    section: 'family',
    type: 'single',
    showIf: { q: 'previousUskifte', eq: 'yes' },
    title: 'Var den som døde først, gift med avdøde eller samboer?', title_en: 'Was the person who died first married to the deceased, or a cohabitant?',
    why: 'Etter et ekteskap deles uskifteboet i to like deler. Etter et samboerskap deles det etter hvor mye hver av dem eide da uskiftet startet.', why_en: 'After a marriage, the undivided estate is split into two equal halves. After cohabitation, it is split according to how much each of them owned when the undivided estate started.',
    options: [
      { value: 'married', label: 'Gift (eller registrert partner)', label_en: 'Married (or registered partner)' },
      { value: 'cohabitant', label: 'Samboer', label_en: 'Cohabitant' },
    ],
    learnMore: { sources: ['arveloven_uskifte_deling', 'arveloven_uskifte_samboer_deling'] },
  },
  {
    id: 'previousUskifteShare',
    section: 'family',
    type: 'percent',
    optional: true,
    showIf: { q: 'previousUskifteType', eq: 'cohabitant' },
    title: 'Omtrent hvor stor del av det som ble holdt i uskifte, eide {first}?', title_en: 'Roughly what share of what was kept undivided did {first} own?',
    why: 'Etter samboere deles uskifteboet etter verdiene da uskiftet startet. Eide {first} for eksempel 60 prosent av boligen, får arvingene etter hen 60 prosent av uskifteboet. Vet du ikke, regner vi med halvparten.', why_en: 'After cohabitants, the undivided estate is divided according to the values when it started. If {first} owned for example 60 per cent of the home, their heirs get 60 per cent of the undivided estate. If you do not know, we assume half.',
    learnMore: {
      text: 'Samboere kan bare sitte i uskifte med felles bolig og innbo, bil og fritidsbolig. Det er verdiforholdet mellom det hver av dere eide av disse tingene da uskiftet startet, som avgjør delingen. Står det noe om dette i uskifteattesten eller i papirene fra tingretten, kan du bruke det.', text_en: 'Cohabitants can only keep an undivided estate with their joint home and household contents, car and holiday home. The division is decided by the ratio between the values each of them owned of these things when the undivided estate started. If the certificate (uskifteattest) or the papers from the district court say something about this, you can use that.',
      sources: ['arveloven_uskifte_samboer', 'arveloven_uskifte_samboer_deling'],
    },
  },
  {
    id: 'hasChildren',
    section: 'family',
    type: 'single',
    showIf: { not: { q: 'cohabitantChildren', eq: 'yes' } },
    title: 'Hadde avdøde barn?', title_en: 'Did the deceased have children?',
    why: 'Barn og deres etterkommere (livsarvinger) arver først. Svaret avgjør hvem som kan ha krav på arv.', why_en: 'Children and their descendants (livsarvinger) inherit first. The answer decides who may be entitled to inherit.',
    options: [
      { value: 'yes', label: 'Ja', label_en: 'Yes', hint: 'Også adoptivbarn, barn fra tidligere forhold og barn som er døde', hint_en: 'Also adopted children, children from earlier relationships and children who have died' },
      { value: 'no', label: 'Nei', label_en: 'No' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
  },
  {
    id: 'children',
    section: 'family',
    type: 'children',
    showIf: { any: [{ q: 'hasChildren', eq: 'yes' }, { q: 'cohabitantChildren', eq: 'yes' }] },
    title: 'Fortell oss om barna til avdøde', title_en: 'Tell us about the deceased\'s children',
    // Forklaringen tilpasses: spørsmålene om felles barn vises bare når de er relevante.
    why: f => [
      'Hvert barn arver like mye. Er et barn dødt, går barnets del videre til barnets egne barn.',
      f.hasPartner ? (f.survivor
        ? 'Vi spør også om barna er dine. Barn avdøde hadde med andre, kalles særkullsbarn og har egne rettigheter.'
        : 'Vi spør også om barna er felles med {partner}. Barn avdøde hadde med andre, kalles særkullsbarn og har egne rettigheter.') : '',
      f.previousUskifte ? 'Fordi avdøde satt i uskifte, spør vi om hvert barn også er barnet til {first}. Da arver barnet også etter hen.' : '',
    ].filter(Boolean).join(' '),
    why_en: f => [
      'Each child inherits the same amount. If a child has died, that child\'s share passes on to their own children.',
      f.hasPartner ? (f.survivor
        ? 'We also ask whether the children are yours. Children the deceased had with others are called særkullsbarn and have their own rights.'
        : 'We also ask whether the children are shared with {partner}. Children the deceased had with others are called særkullsbarn and have their own rights.') : '',
      f.previousUskifte ? 'Because the deceased kept an undivided estate, we ask whether each child is also the child of {first}. Then the child also inherits from them.' : '',
    ].filter(Boolean).join(' '),
    learnMore: {
      showIf: { any: [{ fact: 'hasPartner' }, { fact: 'previousUskifte' }] },
      title: 'Hva er et særkullsbarn?', title_en: 'What is a særkullsbarn?',
      text: 'Et særkullsbarn er et barn som avdøde har fra et annet forhold – altså ikke et felles barn med gjenlevende ektefelle eller samboer. Særkullsbarn må samtykke dersom gjenlevende vil sitte i uskifte. Et barn som var unnfanget før dødsfallet og blir født levende, arver også. Adoptivbarn arver på lik linje med andre barn.', text_en: 'A særkullsbarn is a child the deceased has from another relationship – that is, not a joint child with the surviving spouse or cohabitant. Such children must consent if the survivor wants to keep an undivided estate. A child who was conceived before the death and is born alive also inherits. Adopted children inherit on an equal footing with other children.',
      sources: ['arveloven_livsarvinger', 'arveloven_uskifte_saerkull'],
    },
  },
  {
    id: 'previousSpouseChildren',
    section: 'family',
    type: 'single',
    showIf: { fact: 'previousUskifte' },
    title: 'Hadde {first} barn med noen andre enn avdøde?', title_en: 'Did {first} have children with anyone other than the deceased?',
    why: 'Den delen av uskifteboet som hører til {first}, går til barna hans eller hennes – både felles barn med avdøde og barn fra andre forhold. Barn {first} hadde med andre, arver bare fra denne delen.', why_en: 'The part of the undivided estate that belongs to {first} goes to their children – both joint children with the deceased and children from other relationships. Children {first} had with others inherit only from this part.',
    options: [
      { value: 'yes', label: 'Ja', label_en: 'Yes' },
      { value: 'no', label: 'Nei', label_en: 'No' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      text: 'Arvingene etter {first} bestemmes ut fra hvem som lever når uskifteboet skiftes – altså nå. Er et av barna dødt, arver barnets egne barn i stedet. Hadde {first} ingen barn som lever eller har etterkommere, går delen til foreldrene, søsknene eller andre slektninger av hen.', text_en: 'The heirs of {first} are decided by who is alive when the undivided estate is divided – that is, now. If one of the children has died, that child\'s own children inherit instead. If {first} had no children who are alive or have descendants, the part goes to their parents, siblings or other relatives.',
      sources: ['arveloven_uskifte_arvinger', 'arveloven_uskifte_deling'],
    },
  },
  {
    id: 'previousSpouseChildrenList',
    section: 'family',
    type: 'otherChildren',
    showIf: { q: 'previousSpouseChildren', eq: 'yes' },
    title: 'Fortell oss om barna {first} hadde med andre', title_en: 'Tell us about the children {first} had with others',
    why: 'De deler den delen av uskifteboet som går til arvingene etter {first}, likt med de felles barna. Er et barn dødt, arver barnets barn i stedet.', why_en: 'They share the part of the undivided estate that goes to the heirs of {first} equally with the joint children. If a child has died, that child\'s children inherit instead.',
    learnMore: { sources: ['arveloven_uskifte_arvinger', 'arveloven_livsarvinger'] },
  },
  {
    id: 'separateChildrenConsent',
    section: 'family',
    type: 'single',
    showIf: { all: [{ fact: 'uskifteRelevant' }, { fact: 'hasSeparateChildren' }] },
    title: 'Samtykker særkullsbarna til at {partner} sitter i uskifte?', title_en: 'Do the deceased\'s children from other relationships consent to {partner} keeping an undivided estate?',
    titleSurvivor: 'Samtykker særkullsbarna til at du sitter i uskifte?', titleSurvivor_en: 'Do the deceased\'s children from other relationships consent to you keeping an undivided estate?',
    why: 'Gjenlevende kan bare sitte i uskifte med særkullsbarnas arv hvis de samtykker. Uten samtykke må særkullsbarna få sin arv nå.', why_en: 'The survivor can only keep these children\'s inheritance undivided if they consent. Without consent, they must receive their inheritance now.',
    options: [
      { value: 'yes', label: 'Ja, alle samtykker', label_en: 'Yes, all of them consent' },
      { value: 'no', label: 'Nei, minst ett av dem samtykker ikke', label_en: 'No, at least one of them does not consent' },
      { value: 'unknown', label: 'Vet ikke ennå', label_en: 'Don\'t know yet' },
      { value: 'notRelevant', label: 'Uskifte er ikke aktuelt for oss', label_en: 'An undivided estate is not relevant for us' },
    ],
    learnMore: {
      text: 'Et særkullsbarn som samtykker, gir fra seg retten til å få arven nå. Arven kommer i stedet når gjenlevende dør eller skifter. Er særkullsbarnet under 18 år, må vergen samtykke, og statsforvalteren må godkjenne det. Samtykker ikke særkullsbarnet, kan gjenlevende likevel sitte i uskifte med resten når særkullsbarnet har fått sin del.', text_en: 'A child from another relationship who consents gives up the right to receive the inheritance now. It comes instead when the survivor dies or divides the estate. If the child is under 18, the guardian must consent and the County Governor (statsforvalteren) must approve it. If the child does not consent, the survivor can still keep the rest undivided once the child has received their share.',
      sources: ['arveloven_uskifte_saerkull', 'domstol_uskifte'],
    },
  },
  {
    id: 'parents',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsParents' },
    title: 'Lever avdødes foreldre?', title_en: 'Are the deceased\'s parents alive?',
    why: 'Når avdøde ikke etterlater seg barn eller barnebarn, er det foreldrene og deres etterkommere (søsken, nevøer og nieser) som arver neste.', why_en: 'When the deceased leaves no children or grandchildren, the parents and their descendants (siblings, nephews and nieces) inherit next.',
    options: [
      { value: 'both', label: 'Ja, begge lever', label_en: 'Yes, both are alive' },
      { value: 'mother', label: 'Bare moren lever', label_en: 'Only the mother is alive' },
      { value: 'father', label: 'Bare faren lever', label_en: 'Only the father is alive' },
      { value: 'none', label: 'Nei, ingen av dem lever', label_en: 'No, neither is alive' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: { sources: ['arveloven_andre_arvegang'] },
  },
  {
    id: 'hasSiblings',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsSiblings' },
    title: 'Hadde avdøde søsken eller halvsøsken?', title_en: 'Did the deceased have siblings or half-siblings?',
    why: 'Er en av foreldrene død, går den forelderens del videre til avdødes søsken på den siden – og til søsknenes barn (nevøer og nieser) hvis et søsken er dødt.', why_en: 'If one of the parents has died, that parent\'s share passes on to the deceased\'s siblings on that side – and to the siblings\' children (nephews and nieces) if a sibling has died.',
    options: [
      { value: 'yes', label: 'Ja', label_en: 'Yes', hint: 'Også søsken som er døde', hint_en: 'Also siblings who have died' },
      { value: 'no', label: 'Nei', label_en: 'No' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
  },
  {
    id: 'siblings',
    section: 'family',
    type: 'siblings',
    showIf: { all: [{ fact: 'needsSiblings' }, { q: 'hasSiblings', eq: 'yes' }] },
    title: 'Fortell oss om søsknene til avdøde', title_en: 'Tell us about the deceased\'s siblings',
    why: 'Helsøsken arver fra både mors- og farssiden. Halvsøsken arver bare fra den siden de har felles med avdøde.', why_en: 'Full siblings inherit from both the mother\'s and the father\'s side. Half-siblings only inherit from the side they share with the deceased.',
    learnMore: { sources: ['arveloven_andre_arvegang'] },
  },
  {
    id: 'hasGrandparentLine',
    section: 'family',
    type: 'single',
    showIf: { fact: 'needsGrandparents' },
    title: 'Lever noen av avdødes besteforeldre, tanter, onkler eller søskenbarn?', title_en: 'Are any of the deceased\'s grandparents, aunts, uncles or cousins alive?',
    why: 'Når det verken finnes barn, foreldre, søsken eller nevøer og nieser, arver besteforeldrene og deres barn (avdødes tanter og onkler).', why_en: 'When there are no children, parents, siblings, nephews or nieces, the grandparents and their children (the deceased\'s aunts and uncles) inherit.',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Er en tante eller onkel død, går delen videre til hans eller hennes barn (avdødes søskenbarn). Lenger enn det går ikke arveretten. Finnes det ingen arvinger etter loven og heller ikke testament, går arven til frivillig arbeid for barn og unge.', text_en: 'If an aunt or uncle has died, the share passes on to their children (the deceased\'s cousins). The right to inherit goes no further than that. If there are no heirs under the law and no will, the inheritance goes to voluntary work for children and young people.',
      sources: ['arveloven_tredje_arvegang', 'arveloven_staten'],
    },
  },
  {
    id: 'grandparents',
    section: 'family',
    type: 'grandparents',
    showIf: { all: [{ fact: 'needsGrandparents' }, { q: 'hasGrandparentLine', eq: 'yes' }] },
    title: 'Fortell oss om besteforeldrene', title_en: 'Tell us about the grandparents',
    why: 'Halvparten går til farssiden og halvparten til morssiden. Er en besteforelder død, går den delen til barna hans eller hennes (avdødes tanter og onkler).', why_en: 'Half goes to the father\'s side and half to the mother\'s side. If a grandparent has died, that share goes to their children (the deceased\'s aunts and uncles).',
    learnMore: { sources: ['arveloven_tredje_arvegang'] },
  },

  // ── Eierforhold (ektefeller) ──────────────────────────────────
  {
    id: 'separateProperty',
    section: 'marriage',
    type: 'single',
    showIf: { fact: 'married' },
    title: 'Hadde avdøde og {partner} en ektepakt?', title_en: 'Did the deceased and {partner} have a marital agreement (ektepakt)?',
    titleSurvivor: 'Hadde du og avdøde en ektepakt?', titleSurvivor_en: 'Did you and the deceased have a marital agreement (ektepakt)?',
    why: 'En ektepakt kan bestemme at noe skal holdes utenfor når formuen deles. Det påvirker hvor mye som er avdødes, og dermed hva som skal arves.', why_en: 'A marital agreement can decide that something is kept out when the property is divided. That affects how much belongs to the deceased, and therefore what is inherited.',
    options: [
      { value: 'no', label: 'Nei', label_en: 'No', hint: 'Da er som regel alt felles formue', hint_en: 'Then everything is usually joint property' },
      { value: 'yes', label: 'Ja', label_en: 'Yes', hint: 'Eller noen har gitt arv eller gave med beskjed om at det skal holdes utenfor', hint_en: 'Or someone gave an inheritance or gift with the condition that it is kept separate' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      title: 'Særeie og felleseie – kort forklart', title_en: 'Separate property and joint property – briefly explained',
      text: 'Når ingenting annet er avtalt, eier ektefeller formuen sin som «felleseie». Det betyr at alt deles likt når ekteskapet slutter – også ved dødsfall. «Særeie» er det som er holdt utenfor denne delingen, fordi ektefellene har avtalt det i en ektepakt, eller fordi noen som ga en av dem arv eller gave, bestemte det. Er du usikker, kan du sjekke Ektepaktregisteret i Brønnøysundregistrene.', text_en: 'Unless otherwise agreed, spouses own their property as «joint property» (felleseie). This means that everything is divided equally when the marriage ends – also on death. «Separate property» (særeie) is what is kept out of this division, because the spouses agreed it in a marital agreement, or because someone who gave one of them an inheritance or a gift decided so. If you are unsure, you can check the Register of Marriage Settlements at the Brønnøysund Register Centre.',
      sources: ['ekteskapsloven_saereie', 'ekteskapsloven_deling'],
    },
  },
  {
    id: 'separatePropertyWho',
    section: 'marriage',
    type: 'single',
    showIf: { q: 'separateProperty', eq: 'yes' },
    title: 'Hvem sine eiendeler skal holdes utenfor?', title_en: 'Whose assets are to be kept separate?',
    why: 'Det avdøde har holdt utenfor (særeie), går i sin helhet inn i dødsboet. Det gjenlevende har holdt utenfor, beholder gjenlevende selv.', why_en: 'What the deceased kept separate (særeie) goes in full into the estate. What the survivor kept separate, the survivor keeps.',
    options: [
      { value: 'deceased', label: 'Noe av det avdøde eide', label_en: 'Some of what the deceased owned' },
      { value: 'survivor', label: 'Noe av det gjenlevende eier', label_en: 'Some of what the survivor owns' },
      { value: 'both', label: 'Begge deler', label_en: 'Both' },
    ],
  },
  {
    id: 'separatePropertyAtDeath',
    section: 'marriage',
    type: 'single',
    showIf: { q: 'separateProperty', eq: 'yes' },
    title: 'Står det i ektepakten at dette bare gjelder ved skilsmisse – og ikke ved dødsfall?', title_en: 'Does the marital agreement say that this only applies on divorce – and not on death?',
    why: 'Mange ektepakter sier at eiendelene skal holdes utenfor ved skilsmisse, men være felles hvis en av ektefellene dør. Da deles alt likt likevel.', why_en: 'Many marital agreements say that the assets are kept separate on divorce, but are joint if one of the spouses dies. Then everything is divided equally anyway.',
    options: [
      { value: 'no', label: 'Nei, det gjelder også ved dødsfall', label_en: 'No, it also applies on death' },
      { value: 'yes', label: 'Ja, ved dødsfall er alt felles likevel', label_en: 'Yes, on death everything is joint anyway' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
  },
  {
    id: 'skjevdeling',
    section: 'marriage',
    type: 'single',
    showIf: { fact: 'married' },
    title: 'Hadde avdøde eller {partner} verdier fra før ekteskapet, eller fikk noen av dem arv eller gaver under ekteskapet?', title_en: 'Did the deceased or {partner} have assets from before the marriage, or did either of them receive inheritance or gifts during the marriage?',
    titleSurvivor: 'Hadde noen av dere verdier fra før ekteskapet, eller fikk dere arv eller gaver under ekteskapet?', titleSurvivor_en: 'Did either of you have assets from before the marriage, or did you receive inheritance or gifts during the marriage?',
    why: 'Slike verdier kan i mange tilfeller holdes utenfor delingen av felleseiet (skjevdeling). Det kan endre hvor stor del av felleseiet som hører til dødsboet.', why_en: 'In many cases such assets can be kept out of the division of joint property (skjevdeling). That can change how large a part of the joint property belongs to the estate.',
    options: [
      { value: 'no', label: 'Nei, ingen vesentlige verdier', label_en: 'No, no significant assets' },
      { value: 'yes', label: 'Ja', label_en: 'Yes' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      title: 'Hva er skjevdeling?', title_en: 'What is skjevdeling?',
      text: 'Verdier som en ektefelle hadde da ekteskapet ble inngått, eller som er arvet eller fått i gave fra andre enn ektefellen, kan kreves holdt utenfor delingen. Det må kunne dokumenteres at verdiene fortsatt finnes – for eksempel i den samme boligen. Skjevdeling må kreves; det skjer ikke automatisk.', text_en: 'Assets a spouse had when the marriage was entered into, or that were inherited or received as a gift from someone other than the spouse, can be claimed kept out of the division (skjevdeling). It must be possible to document that the assets still exist – for example in the same home. Skjevdeling must be claimed; it does not happen automatically.',
      sources: ['ekteskapsloven_skjevdeling'],
    },
  },
  {
    id: 'skjevdelingAmounts',
    section: 'marriage',
    type: 'amounts',
    showIf: { q: 'skjevdeling', eq: 'yes' },
    title: 'Omtrent hvor mye kan holdes utenfor delingen?', title_en: 'Roughly how much can be kept out of the division?',
    why: 'Vi bruker beløpene til å vise hvordan fordelingen kan endre seg hvis skjevdeling kreves. Er du usikker, kan du la feltene stå tomme.', why_en: 'We use the amounts to show how the distribution may change if skjevdeling is claimed. If you are unsure, you can leave the fields empty.',
    fields: [
      { key: 'deceased', label: 'Avdødes verdier fra før ekteskapet, arv og gaver', label_en: 'The deceased\'s assets from before the marriage, inheritance and gifts' },
      { key: 'survivor', label: 'Gjenlevendes verdier fra før ekteskapet, arv og gaver', label_en: 'The survivor\'s assets from before the marriage, inheritance and gifts' },
    ],
    optional: true,
  },

  // ── Testament ─────────────────────────────────────────────────
  {
    id: 'testament',
    section: 'testament',
    type: 'single',
    title: 'Har avdøde skrevet testament?', title_en: 'Did the deceased write a will?',
    why: 'Et testament kan endre fordelingen. Loven setter likevel grenser for hva et testament kan bestemme når det finnes barn, ektefelle eller samboer med felles barn.', why_en: 'A will can change the distribution. The law still sets limits on what a will can decide when there are children, a spouse, or a cohabitant with children together.',
    options: YES_NO_UNKNOWN,
    learnMore: {
      text: 'Testamenter oppbevares ofte hjemme, hos advokat, i bank eller hos tingretten. Tingretten kan sjekke om avdøde har deponert et testament der. Testamentet må være skriftlig og underskrevet i nærvær av to vitner for å være gyldig.', text_en: 'Wills are often kept at home, with a lawyer, in a bank or with the district court. The district court can check whether the deceased deposited a will there. To be valid, the will must be in writing and signed in the presence of two witnesses.',
      sources: ['arveloven_testament_form', 'domstol_testament'],
    },
  },
  {
    id: 'testamentContent',
    section: 'testament',
    type: 'multi',
    showIf: { q: 'testament', eq: 'yes' },
    title: 'Hva sier testamentet? Velg alt som passer.', title_en: 'What does the will say? Choose all that apply.',
    why: 'Du trenger ikke tolke testamentet juridisk – velg det som ligner mest. Vi forklarer hvilke grenser loven setter.', why_en: 'You do not need to interpret the will legally – choose what fits best. We explain the limits the law sets.',
    options: [
      { value: 'giveaway', label: 'Gir penger eller eiendeler til noen som ikke ellers ville arvet', label_en: 'Gives money or assets to someone who would not otherwise inherit', hint: 'For eksempel en venn eller en organisasjon', hint_en: 'For example a friend or an organisation' },
      { value: 'toCohabitant', label: 'Gir noe til {partnerDeg}', label_en: 'Gives something to {partnerDeg}', showIf: { fact: 'cohabitantNoChildren' } },
      { value: 'uneven', label: 'Gir noen av arvingene mer enn andre, eller bestemte gjenstander', label_en: 'Gives some of the heirs more than others, or specific items' },
      { value: 'limitsPartner', label: 'Gir {partnerDeg} mindre enn loven ellers ville gitt', label_en: 'Gives {partnerDeg} less than the law would otherwise give', showIf: { fact: 'partnerInherits' } },
      { value: 'separateClause', label: 'Bestemmer at arven skal være mottakerens særeie', label_en: 'Decides that the inheritance is to be the recipient\'s separate property' },
      { value: 'uskifte', label: 'Sier noe om uskifte', label_en: 'Says something about an undivided estate (uskifte)', showIf: { fact: 'uskifteRelevant' } },
      { value: 'other', label: 'Noe annet, eller jeg er usikker', label_en: 'Something else, or I am not sure' },
    ],
  },
  {
    id: 'testamentAmount',
    section: 'testament',
    type: 'number',
    showIf: { q: 'testamentContent', includes: 'giveaway' },
    title: 'Omtrent hvor mye er det testamentet gir bort til andre enn arvingene etter loven?', title_en: 'Roughly how much does the will give away to people other than the statutory heirs?',
    why: 'Vi sjekker om beløpet er innenfor det testamentet lovlig kan bestemme over, og trekker det fra før resten fordeles.', why_en: 'We check whether the amount is within what the will can lawfully decide over, and deduct it before the rest is distributed.',
    unit: 'kr',
  },
  {
    id: 'testamentCohabitantAmount',
    section: 'testament',
    type: 'number',
    showIf: { q: 'testamentContent', includes: 'toCohabitant' },
    title: 'Omtrent hvor mye gir testamentet til samboeren?', title_en: 'Roughly how much does the will give to the cohabitant?',
    titleSurvivor: 'Omtrent hvor mye gir testamentet til deg?', titleSurvivor_en: 'Roughly how much does the will give to you?',
    why: 'Når avdøde hadde barn, kan et testament bare gi bort en viss del av arven. For samboere som har bodd sammen i minst fem år, gjelder en egen regel.', why_en: 'When the deceased had children, a will can only give away a certain part of the inheritance. A special rule applies to cohabitants who have lived together for at least five years.',
    unit: 'kr',
  },
  {
    id: 'testamentPartnerKnew',
    section: 'testament',
    type: 'single',
    showIf: { q: 'testamentContent', includes: 'limitsPartner' },
    title: 'Fikk {partner} vite om testamentet mens avdøde levde?', title_en: 'Did {partner} learn about the will while the deceased was alive?',
    titleSurvivor: 'Fikk du vite om testamentet mens avdøde levde?', titleSurvivor_en: 'Did you learn about the will while the deceased was alive?',
    why: 'Et testament kan bare gi ektefelle eller samboer mindre enn loven sier, dersom de fikk vite om testamentet før dødsfallet. En minstearv er uansett beskyttet.', why_en: 'A will can only give a spouse or cohabitant less than the law says if they learned about the will before the death. A minimum inheritance is protected in any case.',
    options: YES_NO_UNKNOWN,
    learnMore: { sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'] },
  },
  {
    id: 'cohabitantFiveYears',
    section: 'testament',
    type: 'single',
    showIf: { q: 'testamentContent', includes: 'toCohabitant' },
    title: 'Hadde avdøde og samboeren bodd sammen i minst fem år?', title_en: 'Had the deceased and the cohabitant lived together for at least five years?',
    titleSurvivor: 'Hadde du og avdøde bodd sammen i minst fem år?', titleSurvivor_en: 'Had you and the deceased lived together for at least five years?',
    why: 'Har dere bodd sammen de siste fem årene, kan testamentet gi samboeren inntil fire ganger grunnbeløpet (4 G – omtrent 546 000 kr i 2026), selv om det går ut over barnas pliktdelsarv.', why_en: 'If you have lived together for the last five years, the will can give the cohabitant up to four times the basic amount (4 G – about NOK 546,000 in 2026), even if it reduces the children\'s compulsory share (pliktdelsarv).',
    options: YES_NO_UNKNOWN,
    learnMore: { sources: ['arveloven_testament_samboer'] },
  },

  // ── Forskudd på arv ──────────────────────────────────────────
  {
    id: 'advancements',
    section: 'testament',
    type: 'single',
    showIf: { fact: 'hasDescendants' },
    title: 'Fikk noen av barna forskudd på arv?', title_en: 'Did any of the children receive an advance on their inheritance?',
    why: 'Forskudd på arv kan trekkes fra mottakerens arv, slik at fordelingen mellom barna blir riktig.', why_en: 'An advance on inheritance can be deducted from the recipient\'s inheritance, so that the distribution between the children is right.',
    options: [
      { value: 'no', label: 'Nei', label_en: 'No' },
      { value: 'yes', label: 'Ja, og avdøde sa at det skulle trekkes fra arven', label_en: 'Yes, and the deceased said it should be deducted from the inheritance' },
      { value: 'gift', label: 'Noen fikk gaver, men det ble ikke sagt noe om forskudd', label_en: 'Some received gifts, but nothing was said about an advance' },
      { value: 'unknown', label: 'Vet ikke', label_en: 'Don\'t know' },
    ],
    learnMore: {
      title: 'Hva er forskudd på arv (avkorting)?', title_en: 'What is an advance on inheritance (avkorting)?',
      text: 'En gave til et barn trekkes bare fra arven dersom avdøde bestemte det da gaven ble gitt, eller senere i et testament. Vanlige gaver til jul og bursdag, og vanlig forsørgelse og utdanning, regnes normalt ikke som forskudd.', text_en: 'A gift to a child is only deducted from the inheritance if the deceased decided so when the gift was given, or later in a will. Ordinary Christmas and birthday presents, and ordinary support and education, are normally not regarded as advances.',
      sources: ['arveloven_avkorting'],
    },
  },
  {
    id: 'advancementAmounts',
    section: 'testament',
    type: 'advancements',
    showIf: { q: 'advancements', eq: 'yes' },
    title: 'Hvor mye fikk hvert barn i forskudd?', title_en: 'How much did each child receive as an advance?',
    why: 'Oppgi verdien da forskuddet ble gitt. Vi legger forskuddene til boet og trekker dem fra hos den som mottok dem.', why_en: 'Enter the value when the advance was given. We add the advances to the estate and deduct them from the person who received them.',
  },
  // ── Formue og gjeld ───────────────────────────────────────────
  {
    id: 'assets',
    section: 'assets',
    type: 'assets',
    title: 'Hva eide og skyldte avdøde?', title_en: 'What did the deceased own and owe?',
    titleMarried: 'Hva eide og skyldte {couple}?', titleMarried_en: 'What did {couple} own and owe?',
    why: 'Arv beregnes av det som er igjen når gjelden er betalt. Omtrentlige beløp holder – du kan alltid gå tilbake og justere.', why_en: 'Inheritance is calculated from what is left when the debts have been paid. Approximate amounts are fine – you can always go back and adjust.',
  },
  {
    id: 'previousUskifteOutside',
    section: 'assets',
    type: 'number',
    optional: true,
    showIf: { fact: 'previousUskifte' },
    title: 'Omtrent hvor mye av det avdøde eide, hørte ikke til uskifteboet?', title_en: 'Roughly how much of what the deceased owned did not belong to the undivided estate?',
    why: 'Som hovedregel hører alt avdøde eide, til uskifteboet – også det hen sparte opp eller kjøpte etter at uskiftet startet. Det som ikke hørte til, går bare til arvingene etter avdøde. Vet du ikke, kan du la feltet stå tomt.', why_en: 'As a main rule, everything the deceased owned belongs to the undivided estate – also what they saved or bought after the undivided estate started. What did not belong to it goes only to the heirs of the deceased. If you do not know, you can leave the field empty.',
    unit: 'kr',
    learnMore: {
      title: 'Hva kan holdes utenfor uskifteboet?', title_en: 'What can be kept outside the undivided estate?',
      text: 'For ektefeller: arv eller gaver avdøde fikk mens hen satt i uskifte, og som giveren bestemte skulle være særeie. For samboere: alt annet enn felles bolig og innbo, bil og fritidsbolig – for eksempel bankinnskudd og aksjer som var avdødes egne. Det må kunne sannsynliggjøres at verdiene ikke hører til uskifteboet.', text_en: 'For spouses: inheritance or gifts the deceased received while keeping the undivided estate, which the giver decided were to be separate property. For cohabitants: everything other than the joint home and household contents, car and holiday home – for example bank deposits and shares that were the deceased\'s own. It must be shown to be probable that the assets do not belong to the undivided estate.',
      sources: ['arveloven_uskifte_formue', 'arveloven_uskifte_saereie', 'arveloven_uskifte_samboer'],
    },
  },
  {
    id: 'debtOverview',
    section: 'assets',
    type: 'single',
    title: 'Har dere full oversikt over gjelden til avdøde?', title_en: 'Do you have a full overview of the deceased\'s debts?',
    why: 'Arvinger som overtar boet ved privat skifte, blir personlig ansvarlige for avdødes gjeld. Er dere usikre, finnes det trygge måter å avklare dette på først.', why_en: 'Heirs who take over the estate in a private settlement become personally liable for the deceased\'s debts. If you are unsure, there are safe ways to clarify this first.',
    options: [
      { value: 'yes', label: 'Ja, vi har god oversikt', label_en: 'Yes, we have a good overview' },
      { value: 'no', label: 'Nei, det kan finnes gjeld vi ikke kjenner til', label_en: 'No, there may be debts we do not know about' },
    ],
    learnMore: {
      title: 'Hva er proklama?', title_en: 'What is a proklama?',
      text: 'Et proklama er en kunngjøring der avdødes kreditorer blir bedt om å melde krav innen en frist. Krav som ikke meldes innen fristen, kan i mange tilfeller falle bort. Det er en trygg måte å få oversikt over gjelden før dere overtar boet.', text_en: 'A proklama is a public notice asking the deceased\'s creditors to report their claims by a deadline. Claims not reported by the deadline may in many cases lapse. It is a safe way to get an overview of the debts before you take over the estate.',
      sources: ['domstol_proklama', 'skifteloven_proklama'],
    },
  },

  // ── Oppgjøret ─────────────────────────────────────────────────
  {
    id: 'circumstances',
    section: 'settlement',
    type: 'multi',
    title: 'Gjelder noe av dette?', title_en: 'Does any of this apply?',
    why: 'Disse forholdene kan gjøre et privat skifte vanskelig, og noen av dem krever ekstra steg.', why_en: 'These circumstances can make a private settlement difficult, and some of them require extra steps.',
    exclusive: 'none',
    options: [
      { value: 'disagreement', label: 'Arvingene er uenige, eller samarbeider dårlig', label_en: 'The heirs disagree, or cooperate poorly' },
      { value: 'unreachable', label: 'En arving er ukjent, vanskelig å nå eller bor i utlandet', label_en: 'An heir is unknown, hard to reach or lives abroad' },
      { value: 'minor', label: 'En av arvingene er under 18 år', label_en: 'One of the heirs is under 18' },
      { value: 'guardianship', label: 'En av arvingene har verge', label_en: 'One of the heirs has a guardian' },
      { value: 'none', label: 'Ingen av disse', label_en: 'None of these' },
    ],
  },
]

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map(q => [q.id, q]))

// Kategorier i formue-steget. `uskifteCohabitant` markerer eiendeler en samboer kan sitte i uskifte med.
export const ASSET_FIELDS = [
  { key: 'bank', label: 'Bankinnskudd', label_en: 'Bank deposits' },
  { key: 'home', label: 'Bolig', label_en: 'Home', uskifteCohabitant: true },
  { key: 'cabin', label: 'Fritidsbolig', label_en: 'Holiday home', uskifteCohabitant: true },
  { key: 'car', label: 'Bil og andre kjøretøy', label_en: 'Car and other vehicles', uskifteCohabitant: true },
  { key: 'securities', label: 'Aksjer, fond og andre verdipapirer', label_en: 'Shares, funds and other securities' },
  { key: 'contents', label: 'Innbo og personlige eiendeler', label_en: 'Household contents and personal belongings', uskifteCohabitant: true },
  { key: 'other', label: 'Annen formue', label_en: 'Other assets' },
]
export const DEBT_FIELDS = [
  { key: 'mortgage', label: 'Boliglån', label_en: 'Mortgage' },
  { key: 'otherDebt', label: 'Annen gjeld', label_en: 'Other debt', hint: 'Forbrukslån, kreditt, skatt, regninger', hint_en: 'Consumer loans, credit, tax, bills' },
]
