// Jevn fordeling etter fordelingsverdi (items.agreed_value). Ren logikk (testes med node --test).
// Beslutningsstøtte, ikke en juridisk fasit: familien godkjenner fordelingen til slutt.
//
// - Fordelingsverdien er atskilt fra AI-anslaget (estimated_value) og arvingenes forslag.
// - Ukjent verdi er ikke 0. Gjenstander uten fordelingsverdi tas ikke med i den jevne fordelingen og
//   sperrer den ikke; de listes for seg og fordeles på annen måte (eller får verdi først).
//   En avtalt verdi på 0 kr er en gyldig verdi.
// - Med bekreftede arveandeler (confirmedWeights) vektes fordelingen: den med lavest sum i forhold til
//   sin andel får neste gjenstand. Ellers deles det likt.
import { parseNOK } from './format.js'

// Fordelingsverdien; null = ukjent
export const itemValue = (item) => {
  const v = item?.agreed_value
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// AI-anslaget (veiledende), for visning og «bruk anslaget som fordelingsverdi»; null = ukjent
export const aiEstimate = (item) => parseNOK(item?.estimated_value)

// Gjenstander som mangler fordelingsverdi: de som skal fordeles, og de som allerede er tildelt
export function itemsWithoutValue(items, assignedItems = []) {
  return [...items, ...assignedItems].filter(i => itemValue(i) === null)
}

// Andeler per bruker (0–1) når administrator har bekreftet at arveandelene gjelder innbo og løsøre,
// fordelingen er «egendefinert %» og andelene summerer til 100. Bare arvinger koblet til en konto teller.
// Ellers null (lik deling).
export function confirmedWeights(heirs = [], estate = null) {
  if (!estate?.shares_confirmed || estate.split_mode !== 'custom') return null
  const sum = heirs.reduce((a, h) => a + (Number(h.percentage) || 0), 0)
  if (Math.abs(sum - 100) > 0.5) return null
  const out = {}
  for (const h of heirs) if (h.user_id && Number(h.percentage) > 0) out[h.user_id] = Number(h.percentage) / 100
  return Object.keys(out).length ? out : null
}

// Hvem får hva: gjenstandene med fordelingsverdi sorteres etter synkende verdi, og hver går til den av de
// interesserte (eller, uten interesserte, av alle) som har lavest sum i forhold til andelen så langt,
// medregnet det de har fått fra før. weights: { userId: andel } eller null for lik deling.
export function equalValueResolutions(items, memberIds, assignedItems = [], weights = null) {
  const w = uid => (weights ? weights[uid] || 0 : 1)
  const eligible = memberIds.filter(uid => w(uid) > 0)
  if (!eligible.length || !items.length) return {}
  const totals = Object.fromEntries(eligible.map(uid => [uid, 0]))
  for (const a of assignedItems) if (a.assigned_to in totals && itemValue(a) !== null) totals[a.assigned_to] += itemValue(a)
  const res = {}
  for (const item of items.filter(i => itemValue(i) !== null).sort((a, b) => itemValue(b) - itemValue(a))) {
    const interested = (item.interests || []).map(x => x.user_id).filter(uid => uid in totals)
    const candidates = interested.length ? interested : eligible
    const winner = candidates.reduce((best, uid) => (totals[uid] / w(uid) < totals[best] / w(best) ? uid : best))
    res[item.id] = winner
    totals[winner] += itemValue(item)
  }
  return res
}

// Summen av kjente fordelingsverdier, og hvor mange som mangler verdi
export function valueTotal(items) {
  let sum = 0, unknown = 0
  for (const i of items) { const v = itemValue(i); if (v === null) unknown++; else sum += v }
  return { sum, unknown }
}
