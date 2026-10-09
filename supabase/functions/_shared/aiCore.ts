// Ren kjerne for AI-kallene, uten nettverk og uten runtime-importer, så den kan testes i Node
// (test/functions/aiCore.test.js): modellvalg, parametre, tolking av svaret, validering, kategori og kostnad.
// Selve kallet mot Anthropic ligger i ai.ts.

// ── Modell ─────────────────────────────────────────────────────────────────────────────────────────
// Claude Haiku 5.5 er standard. Haiku 4.5 er bare manuell tilbakerulling (secret AI_MODEL), ingen
// automatisk fallback eller ruting mellom modeller.
export const DEFAULT_MODEL = 'claude-haiku-5-5'
export const ROLLBACK_MODEL = 'claude-haiku-4-5'
export type Model = typeof DEFAULT_MODEL | typeof ROLLBACK_MODEL
export type Effort = 'low' | 'medium' | 'high'

export function resolveModel(value: string | null | undefined): { model: Model; warning: string | null } {
  const v = (value || '').trim()
  if (!v || v === DEFAULT_MODEL) return { model: DEFAULT_MODEL, warning: null }
  if (v === ROLLBACK_MODEL) return { model: ROLLBACK_MODEL, warning: null }
  return { model: DEFAULT_MODEL, warning: `Ukjent AI_MODEL «${v}», bruker ${DEFAULT_MODEL}` }
}

// ── Feil ───────────────────────────────────────────────────────────────────────────────────────────
// Faste koder appen kan oversette. Råtekst fra Anthropic eller koden sendes aldri til klienten.
export type AiErrorCode = 'ai_refused' | 'ai_invalid' | 'ai_timeout' | 'ai_busy' | 'ai_error' | 'ai_unavailable'
export class AiError extends Error {
  code: AiErrorCode
  constructor(code: AiErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}
export const ERROR_STATUS: Record<AiErrorCode | 'error', number> = {
  ai_refused: 422, ai_invalid: 502, ai_timeout: 504, ai_busy: 503, ai_error: 502, ai_unavailable: 503, error: 500,
}
export const ERROR_TEXT: Record<AiErrorCode | 'error', string> = {
  ai_refused: 'AI-en kunne ikke vurdere dette. Fyll inn selv.',
  ai_invalid: 'AI-en ga et svar vi ikke kunne bruke. Prøv igjen.',
  ai_timeout: 'AI-en brukte for lang tid. Prøv igjen.',
  ai_busy: 'AI-tjenesten er opptatt akkurat nå. Prøv igjen om litt.',
  ai_error: 'AI-tjenesten svarte med feil. Prøv igjen senere.',
  ai_unavailable: 'AI-funksjonene er ikke tilgjengelige akkurat nå.',
  error: 'Noe gikk galt. Prøv igjen.',
}
// Utfall som lagres i ai_usage.outcome
export const OUTCOME: Record<AiErrorCode | 'error', string> = {
  ai_refused: 'refused', ai_invalid: 'invalid', ai_timeout: 'timeout', ai_busy: 'busy', ai_error: 'error', ai_unavailable: 'error', error: 'error',
}

// ── Parametre ──────────────────────────────────────────────────────────────────────────────────────
// Strukturert output (JSON-skjema) på begge modellene. På 5.5 er adaptiv thinking på som standard og
// styres med effort; 4.5 kjenner ikke effort. Ingen temperature/top_p/top_k, prefill eller budget_tokens
// (gir 400 på 5.5).
export type Schema = Record<string, unknown>
export function buildParams(p: { model: Model; system: string; content: unknown; schema: Schema; maxTokens: number; effort: Effort }) {
  const output_config: Record<string, unknown> = { format: { type: 'json_schema', schema: p.schema } }
  if (p.model === DEFAULT_MODEL) output_config.effort = p.effort
  return {
    model: p.model,
    max_tokens: p.maxTokens,
    system: p.system,
    messages: [{ role: 'user', content: p.content }],
    output_config,
  }
}

// ── Tolking av svaret ──────────────────────────────────────────────────────────────────────────────
type Block = { type: string; text?: string }
export type Usage = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }
export type AiMessage = { content: Block[]; stop_reason: string | null; stop_details?: { category?: string | null } | null; usage?: Usage; model?: string }

// Svaret kan starte med thinking-blokker (5.5); bare tekstblokkene er svaret
export const textOf = (m: AiMessage) => m.content.filter(b => b.type === 'text').map(b => b.text || '').join('')

export type Validation<T> = { ok: true; value: T } | { ok: false; reason: string }
export type Reply<T> =
  | { kind: 'ok'; value: T }
  | { kind: 'refused'; category: string | null }
  | { kind: 'truncated' }
  | { kind: 'invalid'; reason: string }

export function interpretReply<T>(m: AiMessage, validate: (v: unknown) => Validation<T>): Reply<T> {
  if (m.stop_reason === 'refusal') return { kind: 'refused', category: m.stop_details?.category ?? null }
  if (m.stop_reason === 'max_tokens' || m.stop_reason === 'model_context_window_exceeded') return { kind: 'truncated' }
  let parsed: unknown
  try { parsed = JSON.parse(textOf(m).trim()) } catch { return { kind: 'invalid', reason: 'ikke gyldig JSON' } }
  const v = validate(parsed)
  return v.ok ? { kind: 'ok', value: v.value } : { kind: 'invalid', reason: v.reason }
}

// Ett nytt forsøk, og bare når det kan hjelpe: avkuttet svar (dobbel max_tokens) eller ugyldig svar.
// Avslag prøves aldri på nytt.
export function nextAttempt(reply: Reply<unknown>, attempt: number, maxTokens: number): { retry: boolean; maxTokens: number } {
  if (attempt >= 2 || reply.kind === 'ok' || reply.kind === 'refused') return { retry: false, maxTokens }
  return { retry: true, maxTokens: reply.kind === 'truncated' ? maxTokens * 2 : maxTokens }
}

// ── Kostnad ────────────────────────────────────────────────────────────────────────────────────────
// USD per million tokens. Haiku 5.5 har dyrere satser når prompten er over 100K tokens.
// Cache-lesing koster 0,1× og 5-minutters cache-skriving 1,25× inndataprisen.
const PRICES: Record<Model, { input: number; output: number; longInput?: number; longOutput?: number; longAbove?: number }> = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, longInput: 0.50, longOutput: 2.50, longAbove: 100_000 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}
export function estimateCostUsd(model: Model, u: Usage = {}): number {
  const p = PRICES[model]
  const input = u.input_tokens || 0, output = u.output_tokens || 0
  const cacheRead = u.cache_read_input_tokens || 0, cacheWrite = u.cache_creation_input_tokens || 0
  const long = p.longAbove != null && input + cacheRead + cacheWrite > p.longAbove
  const inRate = long ? (p.longInput ?? p.input) : p.input, outRate = long ? (p.longOutput ?? p.output) : p.output
  const usd = (input * inRate + cacheRead * inRate * 0.1 + cacheWrite * inRate * 1.25 + output * outRate) / 1_000_000
  return Math.round(usd * 1_000_000) / 1_000_000
}

// ── Hjelpere for validering ────────────────────────────────────────────────────────────────────────
export const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : null)
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// ── Bildeanalyse (dagens felter) ───────────────────────────────────────────────────────────────────
export const CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const
export const CONFIDENCE = ['high', 'medium', 'low'] as const

// Kategorien er fri tekst i skjemaet (boets kategorier varierer, og et nytt skjema per bo ville måttet
// kompileres på nytt); her godtas bare et navn fra boets liste.
export const LEGACY_ANALYSIS_SCHEMA: Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'category', 'condition', 'confidence'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    condition: { type: 'string', enum: [...CONDITIONS] },
    confidence: { type: 'string', enum: [...CONFIDENCE] },
  },
}

export type LegacyAnalysis = { title: string; description: string; category: string | null; condition: string; confidence: string }

export function validateLegacyAnalysis(categories: string[]) {
  return (v: unknown): Validation<LegacyAnalysis> => {
    if (!isObj(v)) return { ok: false, reason: 'ikke et objekt' }
    const title = clip(v.title, 120)
    if (!title) return { ok: false, reason: 'mangler tittel' }
    const condition = oneOf(v.condition, CONDITIONS)
    const confidence = oneOf(v.confidence, CONFIDENCE)
    if (!condition || !confidence) return { ok: false, reason: 'ugyldig tilstand eller sikkerhet' }
    const wanted = clip(v.category, 60).toLocaleLowerCase('nb')
    const category = categories.find(c => c.toLocaleLowerCase('nb') === wanted) ?? null
    return { ok: true, value: { title, description: clip(v.description, 600), category, condition, confidence } }
  }
}

// ── Verdianslag ────────────────────────────────────────────────────────────────────────────────────
export const ESTIMATE_SCHEMA: Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['low_nok', 'likely_nok', 'high_nok', 'reasoning', 'confidence'],
  properties: {
    low_nok: { type: 'integer' },
    likely_nok: { type: 'integer' },
    high_nok: { type: 'integer' },
    reasoning: { type: 'string' },
    confidence: { type: 'string', enum: [...CONFIDENCE] },
  },
}

export type Estimate = { low_nok: number; likely_nok: number; high_nok: number; reasoning: string; confidence: string }
const MAX_NOK = 50_000_000

export function validateEstimate(v: unknown): Validation<Estimate> {
  if (!isObj(v)) return { ok: false, reason: 'ikke et objekt' }
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x) : NaN)
  const low = n(v.low_nok), likely = n(v.likely_nok), high = n(v.high_nok)
  if (![low, likely, high].every(x => x > 0 && x <= MAX_NOK)) return { ok: false, reason: 'beløp mangler eller er utenfor gyldig område' }
  if (!(low <= likely && likely <= high)) return { ok: false, reason: 'intervallet henger ikke sammen' }
  const confidence = oneOf(v.confidence, CONFIDENCE)
  if (!confidence) return { ok: false, reason: 'ugyldig sikkerhet' }
  return { ok: true, value: { low_nok: low, likely_nok: likely, high_nok: high, reasoning: clip(v.reasoning, 600), confidence } }
}

// Inndata til verdianslaget, med grenser. Ukjent tilstand forblir ukjent (blir ikke «good»).
export type EstimateInput = { title: string; description: string; category: string; condition: string | null; purchasePrice: number | null; purchaseYear: number | null; identifiedModel: string }
export function readEstimateInput(body: Record<string, unknown>, now = new Date()): EstimateInput | string {
  const title = clip(body.title, 200)
  if (!title) return 'Mangler navn på gjenstanden'
  const price = typeof body.purchase_price === 'number' ? body.purchase_price : Number(body.purchase_price)
  const year = typeof body.purchase_year === 'number' ? body.purchase_year : Number(body.purchase_year)
  return {
    title,
    description: clip(body.description, 2000),
    category: clip(body.category, 60),
    condition: oneOf(body.condition, CONDITIONS),
    purchasePrice: Number.isFinite(price) && price > 0 && price <= 10_000_000 ? Math.round(price) : null,
    purchaseYear: Number.isInteger(year) && year >= 1900 && year <= now.getFullYear() ? year : null,
    identifiedModel: clip(body.ai_identified_model, 200),
  }
}

// ── Kategorinøkkel ─────────────────────────────────────────────────────────────────────────────────
// Boets kategorier er fritekst (norsk eller engelsk). Først eksakt navn, så ordstammer der hvert ord
// må starte med stammen (så «Verktøy» ikke blir «tøy»/klær). Lengste stamme vinner.
export const CATEGORY_KEYS = ['furniture', 'art', 'jewelry_watches', 'electronics', 'kitchen_porcelain', 'books', 'textiles_clothing',
  'tools', 'sports_outdoor', 'decor', 'collectibles', 'vehicles', 'documents_memorabilia', 'other'] as const
export type CategoryKey = typeof CATEGORY_KEYS[number]

const EXACT: Record<string, CategoryKey> = {
  'møbler': 'furniture', 'furniture': 'furniture',
  'kunst og bilder': 'art', 'kunst': 'art', 'art': 'art', 'art & pictures': 'art', 'art and pictures': 'art',
  'smykker og ur': 'jewelry_watches', 'smykker': 'jewelry_watches', 'jewelry': 'jewelry_watches', 'jewellery': 'jewelry_watches', 'jewelry and watches': 'jewelry_watches',
  'elektronikk': 'electronics', 'electronics': 'electronics',
  'kjøkken og porselen': 'kitchen_porcelain', 'kjøkken': 'kitchen_porcelain', 'kitchen': 'kitchen_porcelain', 'kitchen and china': 'kitchen_porcelain',
  'bøker': 'books', 'books': 'books',
  'klær og tekstiler': 'textiles_clothing', 'clothing & textiles': 'textiles_clothing', 'clothing and textiles': 'textiles_clothing', 'clothing': 'textiles_clothing',
  'verktøy': 'tools', 'tools': 'tools',
  'sportsutstyr': 'sports_outdoor', 'sports & outdoors': 'sports_outdoor', 'sports equipment': 'sports_outdoor',
  'dekorasjoner': 'decor', 'decorations': 'decor',
  'samleobjekter': 'collectibles', 'collectibles': 'collectibles',
  'kjøretøy': 'vehicles', 'vehicles': 'vehicles',
  'dokumenter': 'documents_memorabilia', 'documents': 'documents_memorabilia',
  'minner og arvestykker': 'documents_memorabilia', 'memories and heirlooms': 'documents_memorabilia',
  'annet': 'other', 'other': 'other',
}
const STEMS: [string, CategoryKey][] = ([
  ['bordservise', 'kitchen_porcelain'], ['servise', 'kitchen_porcelain'], ['porselen', 'kitchen_porcelain'], ['kjøkken', 'kitchen_porcelain'], ['glass', 'kitchen_porcelain'], ['bestikk', 'kitchen_porcelain'],
  ['møbel', 'furniture'], ['møbl', 'furniture'], ['stol', 'furniture'], ['bord', 'furniture'], ['sofa', 'furniture'], ['skap', 'furniture'], ['kommode', 'furniture'],
  ['kunst', 'art'], ['maleri', 'art'], ['bilde', 'art'], ['grafikk', 'art'], ['skulptur', 'art'],
  ['smykke', 'jewelry_watches'], ['ur', 'jewelry_watches'], ['klokke', 'jewelry_watches'], ['armbåndsur', 'jewelry_watches'], ['ring', 'jewelry_watches'],
  ['elektronikk', 'electronics'], ['tv', 'electronics'], ['pc', 'electronics'], ['data', 'electronics'], ['telefon', 'electronics'], ['radio', 'electronics'],
  ['bok', 'books'], ['bøker', 'books'],
  ['klær', 'textiles_clothing'], ['tekstil', 'textiles_clothing'], ['tøy', 'textiles_clothing'], ['teppe', 'textiles_clothing'],
  ['verktøy', 'tools'],
  ['sport', 'sports_outdoor'], ['friluft', 'sports_outdoor'], ['ski', 'sports_outdoor'], ['sykkel', 'sports_outdoor'],
  ['dekor', 'decor'], ['pynt', 'decor'], ['lampe', 'decor'], ['lysestake', 'decor'],
  ['samle', 'collectibles'], ['antikk', 'collectibles'], ['mynt', 'collectibles'], ['frimerke', 'collectibles'],
  ['kjøretøy', 'vehicles'], ['bil', 'vehicles'], ['båt', 'vehicles'], ['motorsykkel', 'vehicles'],
  ['dokument', 'documents_memorabilia'], ['brev', 'documents_memorabilia'], ['minne', 'documents_memorabilia'], ['arvestykke', 'documents_memorabilia'], ['foto', 'documents_memorabilia'],
] as [string, CategoryKey][]).sort((a, b) => b[0].length - a[0].length)

export function categoryKeyFor(label: unknown): CategoryKey {
  const l = typeof label === 'string' ? label.trim().toLocaleLowerCase('nb') : ''
  if (!l) return 'other'
  if (EXACT[l]) return EXACT[l]
  const words = l.split(/[^a-zæøå0-9]+/i).filter(Boolean)
  for (const [stem, key] of STEMS) if (words.some(w => w.startsWith(stem))) return key
  return 'other'
}

// ── Verdifall ut fra kjøpspris ─────────────────────────────────────────────────────────────────────
// Et grovt holdepunkt, ikke en markedsverdi: bare med gyldig kjøpsår og -pris. Ingen kategori stiger
// i verdi av seg selv (samleobjekter: 0 %), og alle har et gulv.
const DEPRECIATION: Record<CategoryKey, { rate: number; floor: number }> = {
  furniture: { rate: 0.08, floor: 0.2 }, art: { rate: 0.02, floor: 0.3 }, jewelry_watches: { rate: 0.03, floor: 0.4 },
  electronics: { rate: 0.30, floor: 0.05 }, kitchen_porcelain: { rate: 0.12, floor: 0.1 }, books: { rate: 0.10, floor: 0.05 },
  textiles_clothing: { rate: 0.20, floor: 0.05 }, tools: { rate: 0.10, floor: 0.15 }, sports_outdoor: { rate: 0.15, floor: 0.1 },
  decor: { rate: 0.08, floor: 0.1 }, collectibles: { rate: 0, floor: 0.5 }, vehicles: { rate: 0.12, floor: 0.1 },
  documents_memorabilia: { rate: 0.10, floor: 0.05 }, other: { rate: 0.12, floor: 0.1 },
}
export function depreciatedValue(key: CategoryKey, price: number | null, year: number | null, now = new Date()) {
  if (price == null || year == null) return null
  const years = Math.max(0, now.getFullYear() - year)
  const { rate, floor } = DEPRECIATION[key]
  const value = Math.round(Math.max(price * Math.pow(1 - rate, years), price * floor))
  return { value, years_old: years, rate_used: rate, original_price: price }
}
