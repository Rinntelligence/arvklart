// Familiens egne sammenligninger (items.ai_analysis.corrections.references): lenke, tittel, pris, type og dato
// for en tilsvarende gjenstand. Valgfritt; brukes av markedsmotoren i estimate-value (_shared/market.ts), som
// leser dem med readUserReferences og samme grenser som her.
import { parseNOK } from './format.js'
import { L } from './lang.js'
import { effectiveIdentification } from './aiCorrections.js'

export const MAX_REFERENCES = 10
export const PRICE_TYPES = ['sold_price', 'asking_price', 'new_price']
export const priceTypeLabel = t => ({
  sold_price: L('Solgt for', 'Sold for'),
  asking_price: L('Til salgs for (annonsepris)', 'For sale at (asking price)'),
  new_price: L('Ny pris', 'New price'),
}[t] || '')

export const familyReferences = record => (Array.isArray(record?.corrections?.references) ? record.corrections.references : [])

// Gjenstander uten AI-analyse får et ai_analysis-dokument bare for familiens egne opplysninger
export const emptyRecord = () => ({ v: 2, meta: {}, ai: null, review: {}, corrections: {}, valuation: null })

// Ny sammenligning lagt til i dokumentet, eller { error } med en melding på brukerens språk
export function withReference(record, input, userId, { at = new Date().toISOString(), id = `r${Date.now().toString(36)}` } = {}) {
  const title = String(input.title ?? '').trim().slice(0, 120)
  const price = parseNOK(input.price)
  const url = String(input.url ?? '').trim()
  const date = String(input.date ?? '').trim()
  if (!title) return { error: L('Skriv hva det er, f.eks. «Figgjo Lotte tallerken, FINN».', 'Describe it, e.g. «Figgjo Lotte plate, FINN».') }
  if (!(price > 0) || price > 100_000_000) return { error: L('Skriv prisen i kroner, f.eks. 450.', 'Enter the price in NOK, e.g. 450.') }
  if (!PRICE_TYPES.includes(input.price_type)) return { error: L('Velg om den er solgt, til salgs eller ny.', 'Choose whether it was sold, is for sale or is new.') }
  if (url && !/^https?:\/\/\S{3,300}$/.test(url)) return { error: L('Lenken må starte med https://', 'The link must start with https://') }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: L('Ugyldig dato.', 'Invalid date.') }
  const base = record || emptyRecord()
  const list = familyReferences(base)
  if (list.length >= MAX_REFERENCES) return { error: L(`Høyst ${MAX_REFERENCES} sammenligninger per gjenstand.`, `At most ${MAX_REFERENCES} comparisons per item.`) }
  const ref = { id, title, price: Math.round(price), price_type: input.price_type, url: url || null, date: date || null, by: userId, at }
  return { record: { ...base, corrections: { ...(base.corrections || {}), references: [...list, ref] } } }
}

export function withoutReference(record, id) {
  const list = familyReferences(record)
  return { ...record, corrections: { ...(record.corrections || {}), references: list.filter(r => r.id !== id) } }
}

// Søkefrasen til «Søk på FINN»: merke og modell (med familiens rettelser) og type, ellers AI-ens søkefrase,
// ellers navnet på gjenstanden
export function marketQuery(record, title = '') {
  const id = effectiveIdentification(record?.ai, record?.corrections)
  const maker = id.brand || id.manufacturer || id.designer_or_artist
  const model = id.model_number || id.model
  const parts = [maker?.value, model?.value, id.object_type?.value].filter(Boolean)
  return (maker ? parts.join(' ') : record?.ai?.search_query || title || parts.join(' ')).trim().slice(0, 100)
}

export const searchLinks = query => (query ? [
  { provider: 'finn', label: L('Søk på FINN', 'Search FINN'), url: `https://www.finn.no/recommerce/forsale/search?q=${encodeURIComponent(query)}` },
  { provider: 'tradera', label: L('Søk på Tradera', 'Search Tradera'), url: `https://www.tradera.com/search?q=${encodeURIComponent(query)}` },
] : [])
