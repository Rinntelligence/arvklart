// Enkle forklaringer på fagord. I tekster kan et ord skrives som [[nøkkel]] eller
// [[nøkkel|visningstekst]], så viser UI-et det som et klikkbart ord med forklaring.

export const TERMS = {
  arving: { term: 'arving', def: 'En person som har rett til arv – enten fordi loven sier det, eller fordi det står i et testament.' },
  dodsbo: { term: 'dødsbo', def: 'Alt avdøde eide og skyldte da hen døde. Det som er igjen når gjelden er betalt, er det som arves.' },
  skifte: { term: 'skifte', def: 'Selve oppgjøret etter et dødsfall: gjelden betales, og det som er igjen fordeles mellom arvingene.' },
  privatSkifte: { term: 'privat skifte', def: 'Arvingene gjør oppgjøret selv, uten at tingretten styrer det. Det er det vanligste. Arvingene blir da ansvarlige for avdødes gjeld.' },
  offentligSkifte: { term: 'offentlig skifte', def: 'Tingretten styrer oppgjøret, vanligvis ved at en advokat (bostyrer) blir oppnevnt. Brukes ved uenighet, usikker gjeld eller når ingen vil ta ansvaret.' },
  uskiftebo: { term: 'uskifteboet', def: 'Alt gjenlevende overtok i uskifte, og alt hen har eid siden – også det som er spart opp eller kjøpt senere. Når hen dør, deles det mellom arvingene etter begge.' },
  forstavdode: { term: 'førstavdøde', def: 'Den av ektefellene eller samboerne som døde først.' },
  lengstlevende: { term: 'lengstlevende', def: 'Den av ektefellene eller samboerne som levde lengst – den som satt i uskifte.' },
  uskifte: { term: 'uskifte', def: 'Gjenlevende ektefelle eller samboer overtar boet uten å dele det med de andre arvingene nå. Barna får arven senere – som regel når gjenlevende dør.' },
  skifteattest: { term: 'skifteattest', def: 'Et dokument fra tingretten som viser hvem som har rett til å ta seg av dødsboet, for eksempel overfor banken.' },
  uskifteattest: { term: 'uskifteattest', def: 'Et dokument fra tingretten som viser at gjenlevende sitter i uskifte og kan disponere boet.' },
  saerkullsbarn: { term: 'særkullsbarn', def: 'Et barn som avdøde har fra et annet forhold – altså ikke et felles barn med gjenlevende ektefelle eller samboer.' },
  livsarving: { term: 'livsarving', def: 'Avdødes barn, barnebarn, oldebarn og så videre.' },
  pliktdel: { term: 'pliktdelsarv', def: 'Den delen av arven barn har krav på, uansett hva som står i et testament: 2/3 av arven, men høyst 15 G per barn.' },
  minstearv: { term: 'minstearv', def: 'Et minstebeløp ektefelle eller samboer har rett til å arve, regnet i grunnbeløp (G). Et testament kan ikke ta den bort.' },
  grunnbelop: { term: 'grunnbeløpet', def: 'Grunnbeløpet i folketrygden (G). Det brukes i arveloven for å beregne minstearv og grensen for pliktdelsarv, og justeres hvert år 1. mai.' },
  G: { term: 'G', def: 'Grunnbeløpet i folketrygden. Det brukes i arveloven for å beregne minstearv og grensen for pliktdelsarv, og justeres hvert år 1. mai.' },
  felleseie: { term: 'felleseie', def: 'Utgangspunktet i et ekteskap: det ektefellene eier, deles likt når ekteskapet slutter, også ved dødsfall.' },
  saereie: { term: 'særeie', def: 'Eiendeler som holdes utenfor delingen mellom ektefeller, fordi det er avtalt i en ektepakt eller bestemt av den som ga en gave eller arv.' },
  ektepakt: { term: 'ektepakt', def: 'En skriftlig avtale mellom ektefeller om eierforhold, for eksempel særeie. Den må være tinglyst i Ektepaktregisteret.' },
  skjevdeling: { term: 'skjevdeling', def: 'Retten til å holde utenfor delingen det man hadde før ekteskapet, eller har arvet eller fått i gave fra andre.' },
  avkorting: { term: 'forskudd på arv', def: 'En gave til et barn som avdøde sa skulle trekkes fra barnets arv senere.' },
  proklama: { term: 'proklama', def: 'En offentlig kunngjøring der avdødes kreditorer blir bedt om å melde krav innen en frist. Slik får dere oversikt over gjelden.' },
  bostyrer: { term: 'bostyrer', def: 'En advokat som tingretten oppnevner for å gjennomføre et offentlig skifte.' },
  tingretten: { term: 'tingretten', def: 'Domstolen som har ansvaret for dødsbo i kommunen der avdøde bodde. Tingretten gir gratis veiledning om arveoppgjør.' },
  testament: { term: 'testament', def: 'Et skriftlig dokument der avdøde har bestemt hvem som skal arve hva. Det må være underskrevet med to vitner.' },
  statsforvalteren: { term: 'statsforvalteren', def: 'Statens representant i fylket. Statsforvalteren forvalter blant annet arv til barn under 18 år og godkjenner enkelte avtaler på deres vegne.' },
}

// Fagord som får forklaring automatisk der de står i en tekst, også uten [[…]].
// Rekkefølgen betyr noe: lengre ord (uskifteattest, uskifteboet) må komme før kortere (uskifte).
const L = '\\p{L}'
const AUTO = [
  ['uskifteattest', 'uskifteattest\\p{L}*'],
  ['skifteattest', 'skifteattest\\p{L}*'],
  ['uskiftebo', 'uskiftebo(?:et|er)?'],
  ['uskifte', 'uskifte(?:t|ts)?'],
  ['saerkullsbarn', 'særkullsbarn\\p{L}*'],
  ['pliktdel', 'pliktdelsarv\\p{L}*'],
  ['minstearv', 'minstearv\\p{L}*'],
  ['saereie', 'særeie(?:t|ts|r)?'],
  ['felleseie', 'felleseie(?:t|ts)?'],
  ['ektepakt', 'ektepakt(?:en|er|ene)?'],
  ['skjevdeling', 'skjevdeling(?:en)?'],
  ['proklama', 'proklama(?:et)?'],
  ['bostyrer', 'bostyrer(?:en|e)?'],
  ['offentligSkifte', 'offentlig skifte'],
  ['privatSkifte', 'privat skifte'],
  ['livsarving', 'livsarving(?:er|ene|en)?'],
  ['avkorting', 'forskudd på arv'],
  ['grunnbelop', 'grunnbeløpet'],
  ['statsforvalteren', 'statsforvalteren'],
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
