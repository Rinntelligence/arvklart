// Hvordan et verdianslag fra estimate-value vises. Ren funksjon, testes i test/lib/valueAdvice.test.js.
// Tar hele svaret fra estimate-value eller valuationRecord(svar) (begge har method, estimate, confidence og basis),
// og gjenstandens ai_analysis (AI-vurderingen og familiens rettelser) når den finnes.
//
// Arvklart har ikke tilgang til markedsdata (FINN m.fl. har ikke gitt tilgang), så et AI-anslag er modellens egen
// gjetning. Kalibreringen mot 20 solgte gjenstander (eval/, 2026-11-19) viste at den bommer mest, og oftest for lavt,
// der signatur, ekthet, metall og etterspørsel avgjør prisen: sølv (12 ganger for lavt), sølje og ur (3–4 ganger),
// også når merket var kjent. Derfor:
// - 'instead': ren AI-gjetning (ingen sammenligninger fra familien) som er over 10 000 kr, er kunst, smykker/ur eller
//   samleobjekter, eller kan være sølv eller gull. Beløpet vises ikke og lagres ikke som verdi; familien rådes til å
//   få gjenstanden vurdert, sjekke stempelet eller finne solgte priser selv.
// - 'suggest': beløpet vises (som spenn), med en merknad om takst. Gjelder anslag fra familiens sammenligninger i
//   de samme tilfellene.
// - 'none': spennet vises.
import { formatNOK } from './format.js'
import { L } from './lang.js'
import { effectiveIdentification } from './aiCorrections.js'

export const APPRAISE_CATEGORIES = ['art', 'jewelry_watches', 'collectibles']
export const APPRAISE_ABOVE_NOK = 10000

const isAppraiseCategory = x => APPRAISE_CATEGORIES.includes(x?.basis?.category_key)
const norm = s => (typeof s === 'string' ? s.toLocaleLowerCase('nb') : '')

// Ikke edelmetall: nysølv og alpakka er nikkellegeringer, farge er ikke materiale, og sølv- eller gullkant er dekor
// (f.eks. porselen med gullkant)
const NOT_METAL = /nysølv|nysolv|alpakka|nickel silver|sølvfarg|sølvgrå|gullfarg|silver[- ]?colou?r|gold[- ]?colou?r|silver[- ]?tone|gold[- ]?tone|(?:sølv|gull)(?:kant|dekor|rand|stripe|glans|maling)|(?:silver|gold)(?:en)?[- ]?(?:rim|trim|edge|decoration|leaf)/g
// Overflatebelegg: et svar fra familien om at det er forsølvet eller forgylt, betyr vanlig bruksvare
const PLATED = /forsølv|forsolv|forgyl|plett|plated|\bepns\b|\bepbm\b/
const SILVER_WORD = /sølv|solv|sylv|silver|sterling/
const GOLD_WORD = /\bgull(?!smed)|\bgold(?!smith)/
// Tallstempler (830S, 925, 14K, 585 …) teller bare i materialet og i stempler, ikke på etiketter og prislapper
const SILVER_NUM = /\b(?:800|830|835|900|925)\s?s?\b/
const GOLD_NUM = /\b(?:8|9|10|14|18|20|21|22|24)\s?(?:k|kt|karat|ct)\b|\b(?:333|375|585|750|916|999)\b/
// Gullsmed og sølvsmed: laget av en som arbeider i edelmetall
const SMITH = /gullsmed|sølvsmed|solvsmed|sylvsmi|goldsmith|silversmith/

function metalIn(text, numbers = true) {
  const t = norm(text).replace(NOT_METAL, ' ')
  if (SILVER_WORD.test(t) || (numbers && SILVER_NUM.test(t))) return 'silver'
  if (GOLD_WORD.test(t) || (numbers && GOLD_NUM.test(t))) return 'gold'
  return null
}

export function preciousMetal(record) {
  if (!record || typeof record !== 'object') return null
  const corrections = record.corrections && typeof record.corrections === 'object' ? record.corrections : {}
  const answered = corrections.material !== undefined && corrections.material !== null && typeof corrections.material === 'object'
  const id = effectiveIdentification(record.ai, corrections)
  const material = id.material?.value || ''
  // «Vet ikke» fra familien er ikke et svar om forsølvet: da gjelder rådet om å sjekke stempelet fortsatt
  const unsure = /ukjent|usikker|vet ikke|unknown|not sure/.test(norm(material))
  if (answered && !unsure && PLATED.test(norm(material))) return null
  const fromMaterial = metalIn(material)
  if (fromMaterial) return { kind: fromMaterial, answered }
  if (answered && norm(material).trim()) return null // familien har oppgitt et annet materiale
  const marks = Array.isArray(record.ai?.marks) ? record.ai.marks : []
  for (const m of marks) {
    const kind = metalIn(m?.text, m?.kind === 'hallmark' || m?.kind === 'stamp' || m?.kind === 'engraving')
    if (kind) return { kind, answered }
    if (m?.kind === 'hallmark') return { kind: 'precious', answered }
  }
  const makers = [id.brand, id.manufacturer, id.designer_or_artist, ...marks.map(m => ({ value: m?.text }))]
  if (makers.some(v => SMITH.test(norm(v?.value)))) return { kind: 'precious', answered }
  return null
}

export function valueAdvice(x, record = null) {
  if (!x || (x.status && x.status !== 'ok')) return 'none'
  const likely = Number(x.estimate?.likely)
  if (!(likely > 0)) return 'none'
  // Eldre svar uten method er AI-anslag; market_sold / market_asking bygger på familiens sammenligninger
  const isModel = !x.method || x.method === 'model'
  const risky = likely > APPRAISE_ABOVE_NOK || isAppraiseCategory(x) || !!preciousMetal(record)
  if (risky) return isModel ? 'instead' : 'suggest'
  return 'none'
}

// Teksten når beløpet ikke vises ('instead'): overskrift og forklaring
export function appraiseText(x, record = null) {
  const metal = preciousMetal(record)
  if (metal) {
    return metal.kind === 'gold'
      ? {
          title: L('Gull eller forgylt? Det avgjør verdien', 'Gold or gold-plated? That decides the value'),
          body: L(
            'Se etter et stempel som 14K, 18K, 585 eller 750, gjerne på innsiden eller baksiden. Gull har en metallverdi i tillegg til bruksverdien, og et AI-anslag ut fra bilder bommer ofte med mye. Få gjenstanden vurdert av en gullsmed, eller finn hva tilsvarende faktisk er solgt for.',
            'Look for a stamp such as 14K, 18K, 585 or 750, often on the inside or the back. Gold has a metal value on top of its use value, and an AI estimate from photos is often far off. Have the item assessed by a goldsmith, or find out what similar items have actually sold for.',
          ),
        }
      : {
          title: L('Sølv eller forsølvet? Det avgjør verdien', 'Silver or silver-plated? That decides the value'),
          body: L(
            'Se etter et stempel som 830S, 925S eller «Sterling», gjerne på baksiden eller undersiden. Ekte sølv har en metallverdi i tillegg til bruksverdien, og AI-en kan ikke se forskjell på bilder. Få gjenstanden vurdert av en gullsmed, eller finn hva tilsvarende faktisk er solgt for.',
            'Look for a stamp such as 830S, 925S or «Sterling», often on the back or underside. Real silver has a metal value on top of its use value, and the AI cannot tell the difference from photos. Have the item assessed by a goldsmith, or find out what similar items have actually sold for.',
          ),
        }
  }
  return isAppraiseCategory(x)
    ? {
        title: L('Kan ha reell verdi – få den vurdert', 'May have real value – get it appraised'),
        body: L(
          'For kunst, smykker og samleobjekter avgjør signatur, ekthet, materiale og etterspørsel prisen, og et AI-anslag kan bomme med mye, også når merket er kjent. Få gjenstanden vurdert av en takstmann eller et auksjonshus, eller finn hva tilsvarende faktisk er solgt for.',
          'For art, jewellery and collectibles the price depends on signature, authenticity, material and demand, and an AI estimate can be far off, even when the maker is known. Have the item appraised by a valuer or an auction house, or find out what similar items have actually sold for.',
        ),
      }
    : {
        title: L('Kan være verdt mye – sjekk før dere bruker et tall', 'May be worth a lot – check before you use a number'),
        body: L(
          'Dette kan være verdt mer enn 10 000 kr, og da kan et AI-anslag bomme med mye. Finn hva tilsvarende faktisk er solgt for, eller få gjenstanden vurdert av en fagperson.',
          'This may be worth more than NOK 10,000, and then an AI estimate can be far off. Find out what similar items have actually sold for, or have the item assessed by an expert.',
        ),
      }
}

// Merknaden når beløpet vises, men en takst kan gi et sikrere tall ('suggest')
export function suggestText(x, record = null) {
  if (preciousMetal(record)) return L('Sølv og gull: sjekk stempelet, og få det gjerne vurdert av en gullsmed.', 'Silver and gold: check the stamp, and consider having it assessed by a goldsmith.')
  return isAppraiseCategory(x)
    ? L('For kunst, smykker og samleobjekter kan en takst gi et sikrere tall.', 'For art, jewellery and collectibles an appraisal can give a more reliable figure.')
    : L('Over 10 000 kr lønner det seg å få en takst før dere fordeler.', 'Above NOK 10,000 it pays to get an appraisal before you share things out.')
}

// Spennet som tekst, f.eks. «kr 300–kr 800». Ett beløp hvis lav og høy er like.
export function formatRange(low, high) {
  if (!(low > 0) || !(high > 0)) return ''
  return low === high ? formatNOK(low) : `${formatNOK(low)}–${formatNOK(high)}`
}
