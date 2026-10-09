// Markedsmotoren (M1): søk, matching og beregning av verdi fra sammenlignbare gjenstander. Ren modul uten
// runtime-importer, testes i Node (test/functions/market.test.js). Brukes av estimate-value.
//
// Regler (plan 2026-10-09):
// • Matching krever ikke merke eller modell. Generiske gjenstander søkes på type, materiale og periode,
//   med lavere sikkerhet.
// • Prisene holdes atskilt: solgt bekreftet av en kilde, solgt oppgitt av familien, annonsepris og nypris.
//   De slås aldri sammen. Nypris er bare en referanse og aldri en verdi.
// • 3–7 gode treff vises som «spenn i N treff» (lavest–høyest) med median, ikke som et statistisk intervall.
//   Fra 8 treff brukes 25.–75. persentil.
// • Treff som skiller seg mye ut, markeres og gjør anslaget mer usikkert, men fjernes ikke.
// • Under 3 gode treff i samme gruppe gir ingen markedsverdi: treffene vises som eksempler.
// • Forklaringen skrives av koden, ikke av AI.
import type { Analysis } from './analysis.ts'

export type PriceType = 'sold_price' | 'asking_price' | 'new_price'
export type Reference = {
  provider: string // 'user' = lagt inn av familien; senere 'tradera', 'auctionet' …
  url: string | null
  title: string
  price: number
  currency: string
  price_type: PriceType
  date: string | null // YYYY-MM-DD
  verified: boolean // salgsprisen er bekreftet av kilden (ikke bare oppgitt av noen)
}
export type ScoredReference = Reference & {
  match: number | null; match_reasons: string[]; used: boolean; excluded_reason: string | null; flags: string[]
}
export type Specificity = 'precise' | 'broad' | 'generic'
export type Group = 'sold_verified' | 'sold_reported' | 'asking'

export const MAX_USER_REFERENCES = 10
export const MIN_HITS = 3
export const PERCENTILE_FROM = 8

// ── Hva gjenstanden er ─────────────────────────────────────────────────────────────────────────────

export type Identity = {
  maker: string | null; model: string | null; type: string | null; material: string | null; period: string | null
  makerReliable: boolean; modelReliable: boolean
}

// Rettelser er allerede lagt inn i analysen (applyCorrections). «Pålitelig» betyr lest direkte fra gjenstanden
// eller bekreftet av familien.
export function identityOf(a: Analysis | null, title = ''): Identity {
  const id = a?.identification
  const reliable = (v: { basis: string } | null | undefined) => !!v && (v.basis === 'observed' || v.basis === 'family')
  const maker = id?.brand || id?.manufacturer || id?.designer_or_artist || null
  const model = id?.model_number || id?.model || null
  return {
    maker: maker?.value || null, model: model?.value || null,
    type: id?.object_type?.value || (a ? null : title.trim() || null),
    material: id?.material?.value || null, period: id?.period?.value || null,
    makerReliable: reliable(maker), modelReliable: reliable(model),
  }
}

export function specificityOf(i: Identity): Specificity {
  if (i.maker && i.model && i.makerReliable && i.modelReliable) return 'precise'
  if (i.maker) return 'broad'
  return 'generic'
}

// Høyst to søk: det mest presise som grunnlaget tillater, og ett bredere
export function buildQueries(i: Identity, searchQuery: string | null = null, title = ''): string[] {
  const join = (...p: (string | null)[]) => p.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  const out: string[] = []
  if (i.maker && i.model && i.makerReliable && i.modelReliable) out.push(join(i.maker, i.model, i.type))
  if (i.maker) out.push(join(i.maker, i.type, out.length ? null : i.material))
  if (!i.maker) out.push(join(i.type, i.material, i.period) || searchQuery || title)
  if (out.length < 2 && searchQuery) out.push(searchQuery)
  return [...new Set(out.map(q => q.slice(0, 100)).filter(Boolean))].slice(0, 2)
}

// Søkelenker brukeren kan åpne selv (ingen innhenting fra sidene)
export function searchLinks(query: string): { provider: string; url: string }[] {
  if (!query) return []
  const q = encodeURIComponent(query)
  return [
    { provider: 'finn', url: `https://www.finn.no/recommerce/forsale/search?q=${q}` },
    { provider: 'tradera', url: `https://www.tradera.com/search?q=${q}` },
  ]
}

// ── Matching ───────────────────────────────────────────────────────────────────────────────────────

// Små bokstaver uten aksenter, og ø/æ som o/ae, så norske og svenske ord kan sammenlignes (og \b virker)
export const normalize = (s: string) => s.toLocaleLowerCase('nb').replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFD').replace(/\p{M}/gu, '')
const tokens = (s: string) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 2)
const PERIOD_NOISE = new Set(['tallet', 'tall', 'talls', 'century', 'arhundre', 'ca', 'circa', 'tidlig', 'sent', 'early', 'late'])

// Alle ord i feltet må finnes i tittelen (ord fra fire bokstaver godtar bøyning: «tallerken» ~ «tallerkener»)
function fieldMatches(field: string, title: string[], period = false): boolean {
  const want = tokens(field).filter(t => !(period && PERIOD_NOISE.has(t)))
  if (!want.length) return false
  const has = (w: string) => title.some(t => t === w || (w.length >= 4 && t.startsWith(w)) || (period && /^\d{4}$/.test(w) && t.startsWith(w.slice(2, 3) + '0')))
  return period ? want.some(has) : want.every(has)
}

const WEIGHTS = { maker: 0.3, model: 0.3, type: 0.25, material: 0.1, period: 0.05 } as const

// Samsvar 0–1 mellom en annonse og gjenstanden: andelen av det vi vet om gjenstanden som også står i tittelen
export function scoreMatch(title: string, i: Identity): { match: number | null; reasons: string[]; makerMatched: boolean } {
  const t = tokens(title)
  let known = 0, got = 0
  const reasons: string[] = []
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const v = i[k]
    if (!v) continue
    known += WEIGHTS[k]
    if (fieldMatches(v, t, k === 'period')) { got += WEIGHTS[k]; reasons.push(k) }
  }
  return { match: known ? Math.round((got / known) * 100) / 100 : null, reasons, makerMatched: reasons.includes('maker') }
}

// Treff som ikke er en tilsvarende gjenstand til salgs: deler, defekt, ønskes kjøpt, leie, bytte, flere i én
const EXCLUDE = [
  /\b(deler|reservedel\w*|delar|reservdel\w*|for parts|parts only|spare parts)\b/, /\b(defekt\w*|odelagt|trasig|broken|not working)\b/,
  /\b(onskes|kjopes|sokes|kopes|wanted|wtb)\b/, /\b(leie|utleie|hyra|hyres|for rent)\b/, /\b(bytte|byttes|byte|swap)\b/,
]
const MULTIPLE = /\b(lot|samling|parti|pakke|bundle)\b|\b([2-9]|\d{2,})\s?(stk|st|pcs|x)\b|\bx\s?([2-9]|\d{2,})\b/

export function exclusionReason(title: string): string | null {
  const t = normalize(title)
  if (EXCLUDE.some(r => r.test(t))) return 'not_comparable'
  if (MULTIPLE.test(t)) return 'multiple_items'
  return null
}

// Gode treff, ekskluderte og duplikater. Familiens egne sammenligninger er valgt av dem og regnes som gode;
// de vurderes ikke mot ordlisten, men får samsvar for visningen.
export function matchAndFilter(refs: Reference[], i: Identity): ScoredReference[] {
  const seen = new Set<string>()
  return refs.map(r => {
    const s = scoreMatch(r.title, i)
    const out: ScoredReference = { ...r, match: s.match, match_reasons: s.reasons, used: false, excluded_reason: null, flags: [] }
    const key1 = r.url ? `u:${r.url.replace(/[?#].*$/, '').toLowerCase()}` : null
    const key2 = `t:${normalize(r.title).replace(/\s+/g, ' ').trim()}|${r.price}`
    if ((key1 && seen.has(key1)) || seen.has(key2)) out.excluded_reason = 'duplicate'
    else if (!(r.price > 0) || !Number.isFinite(r.price)) out.excluded_reason = 'no_price'
    else if (r.currency !== 'NOK') out.excluded_reason = 'currency'
    else if (r.provider !== 'user') {
      out.excluded_reason = exclusionReason(r.title)
      if (!out.excluded_reason && (s.match == null || s.match < 0.6 || (i.maker && !s.makerMatched))) out.excluded_reason = 'weak_match'
    }
    if (key1) seen.add(key1)
    seen.add(key2)
    return out
  })
}

// ── Beregning ──────────────────────────────────────────────────────────────────────────────────────

export const groupOf = (r: Reference): Group | 'new' =>
  r.price_type === 'new_price' ? 'new' : r.price_type === 'asking_price' ? 'asking' : r.verified ? 'sold_verified' : 'sold_reported'

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b)
// Persentil med lineær interpolasjon (som Excel PERCENTILE.INC)
export function percentile(xs: number[], p: number): number {
  const s = sorted(xs)
  const pos = (s.length - 1) * p
  const lo = Math.floor(pos), hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export type MarketResult = {
  status: 'ok' | 'insufficient'
  group: Group | null
  method: 'market_sold' | 'market_asking' | null
  price_type: 'sold_price' | 'asking_price' | null
  estimate: { low: number; likely: number; high: number } | null
  range_kind: 'hits' | 'p25_p75' | null
  confidence: 'high' | 'medium' | 'low' | null
  reasons: string[]
  stats: { n_used: number; n_found: number; n_excluded: number; min: number | null; max: number | null; median: number | null; p25: number | null; p75: number | null; date_from: string | null; date_to: string | null }
  references: ScoredReference[]
}

const RANK: Record<string, number> = { low: 0, medium: 1, high: 2 }
const capAt = (c: 'high' | 'medium' | 'low', max: 'high' | 'medium' | 'low') => (RANK[c] > RANK[max] ? max : c)
const roundNok = (n: number) => (n >= 1000 ? Math.round(n / 50) * 50 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n))

export function compute(scored: ScoredReference[], specificity: Specificity): MarketResult {
  const refs = scored.map(r => ({ ...r, flags: [...r.flags] }))
  const usable = (g: Group) => refs.filter(r => !r.excluded_reason && groupOf(r) === g)
  const group = (['sold_verified', 'sold_reported', 'asking'] as Group[]).find(g => usable(g).length >= MIN_HITS) ?? null
  const n_found = refs.length, n_excluded = refs.filter(r => r.excluded_reason).length
  const empty = { n_used: 0, n_found, n_excluded, min: null, max: null, median: null, p25: null, p75: null, date_from: null, date_to: null }
  if (!group) {
    return { status: 'insufficient', group: null, method: null, price_type: null, estimate: null, range_kind: null, confidence: null, reasons: ['too_few_hits'], stats: empty, references: refs }
  }

  const used = usable(group)
  used.forEach(r => { r.used = true })
  const prices = used.map(r => r.price)
  const median = percentile(prices, 0.5)
  const many = used.length >= PERCENTILE_FROM
  const p25 = many ? percentile(prices, 0.25) : null, p75 = many ? percentile(prices, 0.75) : null
  const min = Math.min(...prices), max = Math.max(...prices)
  const reasons: string[] = []

  // Avvik markeres, men beholdes: sjeldne og verdifulle gjenstander finnes
  const deviating = used.filter(r => r.price > median * 3 || r.price < median / 3)
  deviating.forEach(r => r.flags.push('deviates'))
  if (deviating.length) reasons.push('deviating_hits')

  // Store sprik mellom solgte priser og annonsepriser: begge vises, og sikkerheten blir lav
  if (group !== 'asking') {
    const asking = usable('asking').map(r => r.price)
    if (asking.length >= 2) {
      const ratio = percentile(asking, 0.5) / median
      if (ratio > 2 || ratio < 0.5) reasons.push('sold_asking_spread')
    }
  }

  let confidence: 'high' | 'medium' | 'low' = many ? 'high' : 'medium'
  if (specificity === 'generic') { reasons.push('generic_match'); confidence = capAt(confidence, 'medium') }
  if (group === 'sold_reported') { reasons.push('family_reported'); confidence = capAt(confidence, 'medium') }
  if (group === 'asking') { reasons.push('asking_prices'); confidence = capAt(confidence, 'medium') }
  if (deviating.length || reasons.includes('sold_asking_spread')) confidence = 'low'

  const dates = used.map(r => r.date).filter((d): d is string => !!d).sort()
  return {
    status: 'ok', group,
    method: group === 'asking' ? 'market_asking' : 'market_sold',
    price_type: group === 'asking' ? 'asking_price' : 'sold_price',
    estimate: { low: roundNok(many ? p25! : min), likely: roundNok(median), high: roundNok(many ? p75! : max) },
    range_kind: many ? 'p25_p75' : 'hits',
    confidence, reasons,
    stats: { n_used: used.length, n_found, n_excluded, min, max, median, p25, p75, date_from: dates[0] ?? null, date_to: dates[dates.length - 1] ?? null },
    references: refs,
  }
}

// ── Forklaring (skrevet av koden) ──────────────────────────────────────────────────────────────────

export function explain(m: MarketResult, english = false): string {
  if (m.status !== 'ok' || !m.estimate) return ''
  const L = (no: string, en: string) => (english ? en : no)
  const kr = (n: number) => `${Math.round(n).toLocaleString(english ? 'en-GB' : 'nb-NO')} ${english ? 'NOK' : 'kr'}`
  const month = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(english ? 'en-GB' : 'nb-NO', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  const s = m.stats
  const when = s.date_from && s.date_to ? ` (${s.date_from.slice(0, 7) === s.date_to.slice(0, 7) ? month(s.date_to) : `${month(s.date_from)} – ${month(s.date_to)}`})` : ''
  const what = {
    sold_verified: L(`${s.n_used} solgte, sammenlignbare gjenstander`, `${s.n_used} sold, comparable items`),
    sold_reported: L(`${s.n_used} salgspriser oppgitt av familien`, `${s.n_used} sale prices reported by the family`),
    asking: L(`${s.n_used} annonsepriser`, `${s.n_used} asking prices`),
  }[m.group!]
  const parts = [L(`Basert på ${what}${when}.`, `Based on ${what}${when}.`)]
  parts.push(m.range_kind === 'p25_p75'
    ? L(`Halvparten av treffene ligger mellom ${kr(s.p25!)} og ${kr(s.p75!)}, median ${kr(s.median!)}.`, `Half of the hits are between ${kr(s.p25!)} and ${kr(s.p75!)}, median ${kr(s.median!)}.`)
    : L(`Spenn i ${s.n_used} treff: ${kr(s.min!)}–${kr(s.max!)}, median ${kr(s.median!)}.`, `Range in ${s.n_used} hits: ${kr(s.min!)}–${kr(s.max!)}, median ${kr(s.median!)}.`))
  if (m.group === 'asking') parts.push(L('Annonsepriser – faktisk salgspris er ofte lavere.', 'Asking prices – the actual sale price is often lower.'))
  const dev = m.references.filter(r => r.flags.includes('deviates')).length
  if (dev) parts.push(L(`${dev} av treffene skiller seg mye ut. De er tatt med, men gjør anslaget mer usikkert.`, `${dev} of the hits differ a lot. They are included, but make the estimate less certain.`))
  if (m.reasons.includes('sold_asking_spread')) parts.push(L('Solgte priser og annonsepriser spriker mye.', 'Sold prices and asking prices differ a lot.'))
  if (m.reasons.includes('generic_match')) parts.push(L('Gjenstanden er ikke identifisert med merke, så treffene er bare omtrent sammenlignbare.', 'The item is not identified by brand, so the hits are only roughly comparable.'))
  return parts.join(' ')
}

// ── Familiens egne sammenligninger (ai_analysis.corrections.references) ────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const PRICE_TYPES: PriceType[] = ['sold_price', 'asking_price', 'new_price']

export function readUserReferences(v: unknown): Reference[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).slice(0, MAX_USER_REFERENCES).flatMap(r => {
    const price = typeof r.price === 'number' ? r.price : Number(r.price)
    const title = typeof r.title === 'string' ? r.title.trim().slice(0, 120) : ''
    const type = PRICE_TYPES.find(t => t === r.price_type)
    if (!title || !type || !Number.isFinite(price) || price <= 0 || price > 100_000_000) return []
    const url = typeof r.url === 'string' && /^https?:\/\/[^\s]{3,300}$/.test(r.url) ? r.url : null
    const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null
    return [{ provider: 'user', url, title, price: Math.round(price), currency: 'NOK', price_type: type, date, verified: false }]
  })
}

// Det som lagres og sendes til appen: ingen kopi av annonseinnhold utover tittel, pris, dato og lenke
export const publicReference = (r: ScoredReference) => ({
  provider: r.provider, url: r.url, title: r.title, price: r.price, currency: r.currency, price_type: r.price_type, date: r.date,
  verified: r.verified, match: r.match, match_reasons: r.match_reasons, used: r.used, excluded_reason: r.excluded_reason, flags: r.flags,
})
