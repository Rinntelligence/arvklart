// Jevn verdifordeling. Ren logikk (testes med node --test).
// Ukjent verdi er ikke 0: en gjenstand uten verdi gjør at fordelingen ikke kan regnes ut, fordi
// den ellers ville blitt «gratis» for den som får den. En avtalt verdi på 0 kr er en gyldig verdi.
import { parseNOK } from './format.js'

// null = ukjent verdi
export const itemValue = (item) => parseNOK(item?.estimated_value)

// Gjenstander som mangler verdi: de som skal fordeles, og de som allerede er tildelt
// (tidligere tildelinger regnes med i balansen mellom arvingene)
export function itemsWithoutValue(items, assignedItems = []) {
  return [...items, ...assignedItems].filter(i => itemValue(i) === null)
}

// Hvem får hva: gjenstandene sorteres etter synkende verdi, og hver går til den av de interesserte
// (eller, uten interesserte, av alle) som har lavest sum så langt, medregnet det de har fått fra før.
// Returnerer {} når noe mangler verdi.
export function equalValueResolutions(items, memberIds, assignedItems = []) {
  if (!memberIds.length || !items.length || itemsWithoutValue(items, assignedItems).length) return {}
  const totals = Object.fromEntries(memberIds.map(uid => [uid, 0]))
  for (const a of assignedItems) if (a.assigned_to in totals) totals[a.assigned_to] += itemValue(a)
  const res = {}
  for (const item of [...items].sort((a, b) => itemValue(b) - itemValue(a))) {
    const interested = (item.interests || []).map(x => x.user_id).filter(uid => uid in totals)
    const candidates = interested.length ? interested : Object.keys(totals)
    const winner = candidates.reduce((best, uid) => (totals[uid] < totals[best] ? uid : best))
    res[item.id] = winner
    totals[winner] += itemValue(item)
  }
  return res
}

// Summen av kjente verdier, og hvor mange som mangler verdi
export function valueTotal(items) {
  let sum = 0, unknown = 0
  for (const i of items) { const v = itemValue(i); if (v === null) unknown++; else sum += v }
  return { sum, unknown }
}
