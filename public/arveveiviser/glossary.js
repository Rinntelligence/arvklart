// Enkle forklaringer på fagord. I tekster kan et ord skrives som [[nøkkel]] eller
// [[nøkkel|visningstekst]], så viser UI-et det som et klikkbart ord med forklaring.

export const TERMS = {
  arving: { term: 'arving', term_en: 'heir', def: 'En person som har rett til arv – enten fordi loven sier det, eller fordi det står i et testament.', def_en: 'A person entitled to inherit – either because the law says so, or because it is stated in a will.' },
  dodsbo: { term: 'dødsbo', term_en: 'estate (dødsbo)', def: 'Alt avdøde eide og skyldte da hen døde. Det som er igjen når gjelden er betalt, er det som arves.', def_en: 'Everything the deceased owned and owed when they died. What is left when the debts have been paid is what is inherited.' },
  skifte: { term: 'skifte', term_en: 'settlement (skifte)', def: 'Selve oppgjøret etter et dødsfall: gjelden betales, og det som er igjen fordeles mellom arvingene.', def_en: 'The settlement itself after a death: the debts are paid, and what is left is divided between the heirs.' },
  privatSkifte: { term: 'privat skifte', term_en: 'private settlement (privat skifte)', def: 'Arvingene gjør oppgjøret selv, uten at tingretten styrer det. Det er det vanligste. Arvingene blir da ansvarlige for avdødes gjeld.', def_en: 'The heirs settle the estate themselves, without the district court managing it. This is the most common. The heirs then become liable for the deceased\'s debts.' },
  offentligSkifte: { term: 'offentlig skifte', term_en: 'public administration (offentlig skifte)', def: 'Tingretten styrer oppgjøret, vanligvis ved at en advokat (bostyrer) blir oppnevnt. Brukes ved uenighet, usikker gjeld eller når ingen vil ta ansvaret.', def_en: 'The district court manages the settlement, usually by appointing a lawyer as administrator (bostyrer). Used in case of disagreement, uncertain debts, or when nobody wants to take responsibility.' },
  uskiftebo: { term: 'uskifteboet', term_en: 'the undivided estate (uskifteboet)', def: 'Alt gjenlevende overtok i uskifte, og alt hen har eid siden – også det som er spart opp eller kjøpt senere. Når hen dør, deles det mellom arvingene etter begge.', def_en: 'Everything the survivor took over undivided, and everything they have owned since – including what was saved or bought later. When they die, it is divided between the heirs of both.' },
  forstavdode: { term: 'førstavdøde', term_en: 'the first to die (førstavdøde)', def: 'Den av ektefellene eller samboerne som døde først.', def_en: 'The spouse or cohabitant who died first.' },
  lengstlevende: { term: 'lengstlevende', term_en: 'the longest-living (lengstlevende)', def: 'Den av ektefellene eller samboerne som levde lengst – den som satt i uskifte.', def_en: 'The spouse or cohabitant who lived longest – the one who kept the undivided estate.' },
  uskifte: { term: 'uskifte', term_en: 'undivided estate (uskifte)', def: 'Gjenlevende ektefelle eller samboer overtar boet uten å dele det med de andre arvingene nå. Barna får arven senere – som regel når gjenlevende dør.', def_en: 'The surviving spouse or cohabitant takes over the estate without dividing it with the other heirs now. The children receive their inheritance later – usually when the survivor dies.' },
  skifteattest: { term: 'skifteattest', term_en: 'probate certificate (skifteattest)', def: 'Et dokument fra tingretten som viser hvem som har rett til å ta seg av dødsboet, for eksempel overfor banken.', def_en: 'A document from the district court showing who is entitled to deal with the estate, for example with the bank.' },
  uskifteattest: { term: 'uskifteattest', term_en: 'undivided estate certificate (uskifteattest)', def: 'Et dokument fra tingretten som viser at gjenlevende sitter i uskifte og kan disponere boet.', def_en: 'A document from the district court showing that the survivor keeps an undivided estate and can manage it.' },
  saerkullsbarn: { term: 'særkullsbarn', term_en: 'child from another relationship (særkullsbarn)', def: 'Et barn som avdøde har fra et annet forhold – altså ikke et felles barn med gjenlevende ektefelle eller samboer.', def_en: 'A child the deceased has from another relationship – that is, not a joint child with the surviving spouse or cohabitant.' },
  livsarving: { term: 'livsarving', term_en: 'descendant (livsarving)', def: 'Avdødes barn, barnebarn, oldebarn og så videre.', def_en: 'The deceased\'s children, grandchildren, great-grandchildren and so on.' },
  pliktdel: { term: 'pliktdelsarv', term_en: 'compulsory share (pliktdelsarv)', def: 'Den delen av arven barn har krav på, uansett hva som står i et testament: 2/3 av arven, men høyst 15 G per barn.', def_en: 'The part of the inheritance children are entitled to, whatever a will says: 2/3 of the inheritance, but at most 15 G per child.' },
  minstearv: { term: 'minstearv', term_en: 'minimum inheritance (minstearv)', def: 'Et minstebeløp ektefelle eller samboer har rett til å arve, regnet i grunnbeløp (G). Et testament kan ikke ta den bort.', def_en: 'A minimum amount a spouse or cohabitant is entitled to inherit, calculated in basic amounts (G). A will cannot take it away.' },
  grunnbelop: { term: 'grunnbeløpet', term_en: 'the basic amount (G)', def: 'Grunnbeløpet i folketrygden (G). Det brukes i arveloven for å beregne minstearv og grensen for pliktdelsarv, og justeres hvert år 1. mai.', def_en: 'The National Insurance basic amount (G). The Inheritance Act uses it to calculate the minimum inheritance and the limit for the compulsory share, and it is adjusted every year on 1 May.' },
  G: { term: 'G', def: 'Grunnbeløpet i folketrygden. Det brukes i arveloven for å beregne minstearv og grensen for pliktdelsarv, og justeres hvert år 1. mai.', def_en: 'The National Insurance basic amount. The Inheritance Act uses it to calculate the minimum inheritance and the limit for the compulsory share, and it is adjusted every year on 1 May.' },
  felleseie: { term: 'felleseie', term_en: 'joint property (felleseie)', def: 'Utgangspunktet i et ekteskap: det ektefellene eier, deles likt når ekteskapet slutter, også ved dødsfall.', def_en: 'The starting point in a marriage: what the spouses own is divided equally when the marriage ends, also on death.' },
  saereie: { term: 'særeie', term_en: 'separate property (særeie)', def: 'Eiendeler som holdes utenfor delingen mellom ektefeller, fordi det er avtalt i en ektepakt eller bestemt av den som ga en gave eller arv.', def_en: 'Assets kept out of the division between spouses, because it was agreed in a marital agreement or decided by the person who gave a gift or inheritance.' },
  ektepakt: { term: 'ektepakt', term_en: 'marital agreement (ektepakt)', def: 'En skriftlig avtale mellom ektefeller om eierforhold, for eksempel særeie. Den må være tinglyst i Ektepaktregisteret.', def_en: 'A written agreement between spouses about ownership, for example separate property. It must be registered in the Register of Marriage Settlements.' },
  skjevdeling: { term: 'skjevdeling', term_en: 'skewed division (skjevdeling)', def: 'Retten til å holde utenfor delingen det man hadde før ekteskapet, eller har arvet eller fått i gave fra andre.', def_en: 'The right to keep out of the division what one had before the marriage, or has inherited or received as a gift from others.' },
  avkorting: { term: 'forskudd på arv', term_en: 'advance on inheritance (avkorting)', def: 'En gave til et barn som avdøde sa skulle trekkes fra barnets arv senere.', def_en: 'A gift to a child that the deceased said should later be deducted from the child\'s inheritance.' },
  proklama: { term: 'proklama', term_en: 'public notice to creditors (proklama)', def: 'En offentlig kunngjøring der avdødes kreditorer blir bedt om å melde krav innen en frist. Slik får dere oversikt over gjelden.', def_en: 'A public notice asking the deceased\'s creditors to report their claims by a deadline. This gives you an overview of the debts.' },
  bostyrer: { term: 'bostyrer', term_en: 'estate administrator (bostyrer)', def: 'En advokat som tingretten oppnevner for å gjennomføre et offentlig skifte.', def_en: 'A lawyer appointed by the district court to carry out a public administration of the estate.' },
  tingretten: { term: 'tingretten', term_en: 'the district court (tingretten)', def: 'Domstolen som har ansvaret for dødsbo i kommunen der avdøde bodde. Tingretten gir gratis veiledning om arveoppgjør.', def_en: 'The court responsible for estates in the municipality where the deceased lived. The district court gives free guidance on inheritance settlements.' },
  testament: { term: 'testament', term_en: 'will', def: 'Et skriftlig dokument der avdøde har bestemt hvem som skal arve hva. Det må være underskrevet med to vitner.', def_en: 'A written document in which the deceased decided who is to inherit what. It must be signed with two witnesses.' },
  statsforvalteren: { term: 'statsforvalteren', term_en: 'the County Governor (statsforvalteren)', def: 'Statens representant i fylket. Statsforvalteren forvalter blant annet arv til barn under 18 år og godkjenner enkelte avtaler på deres vegne.', def_en: 'The state\'s representative in the county. Among other things, the County Governor manages inheritance for children under 18 and approves certain agreements on their behalf.' },
}

// Fagord som får forklaring automatisk der de står i en tekst, også uten [[…]].
// Rekkefølgen betyr noe: lengre ord (uskifteattest, uskifteboet) må komme før kortere (uskifte).
const L = '\\p{L}'
const AUTO = [
  ['uskifteattest', 'uskifteattest\\p{L}*'],
  ['skifteattest', 'skifteattest\\p{L}*'],
  ['uskiftebo', 'uskiftebo(?:et|er)?'],
  ['uskifte', 'uskifte(?:t|ts)?|undivided estates?'],
  ['saerkullsbarn', 'særkullsbarn\\p{L}*'],
  ['pliktdel', 'pliktdelsarv\\p{L}*|compulsory share'],
  ['minstearv', 'minstearv\\p{L}*|minimum inheritance'],
  ['saereie', 'særeie(?:t|ts|r)?|separate property'],
  ['felleseie', 'felleseie(?:t|ts)?|joint property'],
  ['ektepakt', 'ektepakt(?:en|er|ene)?|marital agreements?'],
  ['skjevdeling', 'skjevdeling(?:en)?'],
  ['proklama', 'proklama(?:et)?'],
  ['bostyrer', 'bostyrer(?:en|e)?'],
  ['offentligSkifte', 'offentlig skifte|public administration'],
  ['privatSkifte', 'privat skifte|private settlement'],
  ['livsarving', 'livsarving(?:er|ene|en)?'],
  ['avkorting', 'forskudd på arv'],
  ['grunnbelop', 'grunnbeløpet|basic amount'],
  ['statsforvalteren', 'statsforvalteren|County Governor'],
  ['forstavdode', 'førstavdøde(?:s)?'],
  ['lengstlevende', 'lengstlevende(?:s)?'],
].map(([key, re]) => [key, new RegExp(`(?<!${L})(${re})(?!${L})`, 'iu')])

// Gjør første forekomst av hvert fagord i teksten om til [[nøkkel|ord]], så UI-et kan vise
// forklaringen. Ord som allerede er markert, og tekst inne i [[…]], røres ikke.
export function linkTerms(text) {
  let out = String(text ?? '')
  for (const [key, re] of AUTO) {
    if (out.includes(`[[${key}]]`) || out.includes(`[[${key}|`)) continue
    const parts = out.split(/(\[\[[^\]]*\]\])/)
    for (let i = 0; i < parts.length; i += 2) {
      if (!re.test(parts[i])) continue
      parts[i] = parts[i].replace(re, (m) => `[[${key}|${m}]]`)
      break
    }
    out = parts.join('')
  }
  return out
}

// Fagordene som brukes i en tekst – for ordlisten i PDF-en.
export function termsIn(text) {
  const keys = new Set()
  for (const m of linkTerms(text).matchAll(/\[\[([^\]|]+)/g)) if (TERMS[m[1]]) keys.add(m[1])
  return [...keys]
}
