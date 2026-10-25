// Jevn fordeling etter fordelingsverdi (items.agreed_value). Ren logikk (testes med node --test).
// Beslutningsstøtte, ikke en juridisk fasit: familien godkjenner fordelingen til slutt.
//
// - Fordelingsverdien er atskilt fra AI-anslaget (estimated_value) og arvingenes forslag.
// - Ukjent verdi er ikke 0. Gjenstander uten fordelingsverdi tas ikke med i den jevne fordelingen og
//   sperrer den ikke; de listes for seg og fordeles på annen måte (eller får verdi først).
//   En avtalt verdi på 0 kr er en gyldig verdi.
// - Fordelingen gjelder personene på listen som kan få gjenstander (src/lib/recipients.js), ikke kontoer.
// - Med bekreftede arveandeler (confirmedWeights) vektes fordelingen: den med lavest sum i forhold til
//   sin andel får neste gjenstand. Ellers deles det likt.
import { parseNOK } from './format.js'
import { recipientsOf, recipientIdOf, interestedPeople, receivesItems } from './recipients.js'
import { isSettled, pendingMembersFor } from './estateProgress.js'

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

// Andeler per person på listen (0–1) når administrator har bekreftet at arveandelene gjelder innbo og
// løsøre, fordelingen er «egendefinert %» og andelene summerer til 100. Bare mottakere teller (også de
// uten konto). Ellers null (lik deling).
export function confirmedWeights(heirs = [], estate = null) {
  if (!estate?.shares_confirmed || estate.split_mode !== 'custom') return null
  const sum = heirs.reduce((a, h) => a + (Number(h.percentage) || 0), 0)
  if (Math.abs(sum - 100) > 0.5) return null
  const out = {}
  for (const h of recipientsOf(heirs)) if (Number(h.percentage) > 0) out[h.id] = Number(h.percentage) / 100
  return Object.keys(out).length ? out : null
}

// Hvem får hva: gjenstandene med fordelingsverdi sorteres etter synkende verdi, og hver går til den av de
// interesserte mottakerne (eller, uten interesserte, av alle mottakerne) som har lavest sum i forhold til
// andelen så langt, medregnet det de har fått fra før. people: mottakerne ([{ id, user_id }], personer på
// listen); weights: { personId: andel } eller null for lik deling. → { itemId: personId }
export function equalValueResolutions(items, people, assignedItems = [], weights = null) {
  const w = pid => (weights ? weights[pid] || 0 : 1)
  const eligible = people.filter(p => w(p.id) > 0)
  if (!eligible.length || !items.length) return {}
  const totals = Object.fromEntries(eligible.map(p => [p.id, 0]))
  for (const a of assignedItems) {
    const pid = recipientIdOf(a, people)
    if (pid in totals && itemValue(a) !== null) totals[pid] += itemValue(a)
  }
  const res = {}
  for (const item of items.filter(i => itemValue(i) !== null).sort((a, b) => itemValue(b) - itemValue(a))) {
    const interested = interestedPeople(item, eligible).map(p => p.id)
    const candidates = interested.length ? interested : eligible.map(p => p.id)
    const winner = candidates.reduce((best, pid) => (totals[pid] / w(pid) < totals[best] / w(best) ? pid : best))
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

// «Tildel alle som bare én ønsker»: åpne gjenstander med nøyaktig én interesse fra et nåværende medlem.
// ready: avklart (alle som skal ta stilling, har svart) og interessenten er én person på listen med «Kan få
// gjenstander» → { item, heir }. waiting: noen har ikke svart → { item, pending }; manglende svar er aldri
// «nei takk». unlinked: interessenten er ikke en person som kan få gjenstander → { item, reason }.
// Databasen kontrollerer det samme (assign_items med metoden 'single', 20261023_settled_assignment_checks.sql).
export function singleInterestAssignments(items, members, passes, heirs = []) {
  const memberIds = new Set(members.map(m => m.user_id))
  const out = { ready: [], waiting: [], unlinked: [] }
  for (const raw of items) {
    if (raw.status === 'assigned') continue
    const wanters = [...new Set((raw.interests || []).map(x => x.user_id).filter(u => memberIds.has(u)))]
    if (wanters.length !== 1) continue
    const item = { ...raw, interests: (raw.interests || []).filter(x => memberIds.has(x.user_id)) }
    if (!isSettled(item, members, passes, heirs)) { out.waiting.push({ item, pending: pendingMembersFor(item, members, passes, heirs) }); continue }
    const linked = heirs.filter(h => h.user_id && h.user_id === wanters[0])
    if (linked.length !== 1) { out.unlinked.push({ item, reason: 'no_person' }); continue }
    if (!receivesItems(linked[0])) { out.unlinked.push({ item, reason: 'not_recipient' }); continue }
    out.ready.push({ item, heir: linked[0] })
  }
  return out
}
