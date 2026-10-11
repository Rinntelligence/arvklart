// Oversikt over fordelingen slik den står nå (F5): per arving, gjenstander ingen vil ha og det som ikke er
// avklart. Ren logikk (testes med node --test). Brukes av /estate/:id/fordeling og protokollen (PDF).
//
// Verdiutjevningen er beslutningsstøtte, ikke en juridisk fasit. Den regnes bare av kjente fordelingsverdier;
// gjenstander uten verdi telles for seg og regnes aldri som 0 kr.
import { L } from './lang.js'
import { formatNOK } from './format.js'
import { itemValue, confirmedWeights } from './distribution.js'
import { recipientsOf, recipientOf } from './recipients.js'

export function summarizeDistribution({ items = [], members = [], heirs = [], estate = null }) {
  // Per person på listen som kan få gjenstander (også uten konto). Brukerrollen teller ikke: en administrator
  // vises bare når hen står på listen. Fra eldre data kan en tildeling peke på en konto uten person på
  // listen; den vises da under kontonavnet, så ingenting forsvinner.
  const accountName = id => members.find(m => m.user_id === id)?.profiles?.display_name || L('tidligere medlem', 'former member')
  const people = recipientsOf(heirs)
  const assigned = items.filter(i => i.status === 'assigned')
  const extra = []
  for (const i of assigned) {
    const h = recipientOf(i, heirs)
    if (h && !people.includes(h) && !extra.includes(h)) extra.push(h)
  }
  const orphanAccounts = [...new Set(assigned.filter(i => !recipientOf(i, heirs)).map(i => i.assigned_to || null))]

  const perHeir = [
    ...[...people, ...extra].map(h => {
      const mine = assigned.filter(i => recipientOf(i, heirs)?.id === h.id)
      return { heir_id: h.id, user_id: h.user_id || null, name: h.name, items: mine, receives: people.includes(h) }
    }),
    ...orphanAccounts.map(uid => ({ heir_id: null, user_id: uid, name: uid ? accountName(uid) : L('Ukjent mottaker', 'Unknown recipient'),
      items: assigned.filter(i => !recipientOf(i, heirs) && (i.assigned_to || null) === uid), receives: false })),
  ].map(h => {
    const known = h.items.filter(i => itemValue(i) !== null)
    return { ...h, sum: known.reduce((a, i) => a + itemValue(i), 0), unknown: h.items.length - known.length }
  })
  const totalKnown = perHeir.reduce((a, h) => a + h.sum, 0)
  const weights = confirmedWeights(heirs, estate)
  const shareBase = people.length || perHeir.length
  for (const h of perHeir) {
    const share = weights ? (weights[h.heir_id] || 0) : (h.receives ? 1 / shareBase : 0)
    h.share = share
    h.target = Math.round(totalKnown * share)
    h.diff = Math.round(h.sum - h.target)
  }

  const open = items.filter(i => i.status !== 'assigned')
  const unwanted = open.filter(i => !i.interests?.length)
  const byDisp = d => unwanted.filter(i => (i.disposition || null) === d)
  const pending = open.filter(i => i.interests?.length)
  return {
    perHeir, totalKnown, weighted: !!weights,
    unwanted: { sell: byDisp('sell'), donate: byDisp('donate'), discard: byDisp('discard'), undecided: byDisp(null) },
    pending, // ønsket av noen, men ikke tildelt ennå
    complete: pending.length === 0 && byDisp(null).length === 0,
    itemCount: items.length,
  }
}

// «ca. 4 000 kr mer enn en lik andel» – bare som beslutningsstøtte. Små avvik (under 2 % av totalen
// eller 100 kr) regnes som på linje.
export function diffText(h, { totalKnown, weighted }) {
  const of = weighted ? L('sin andel', 'their share') : L('en lik andel', 'an equal share')
  const tolerance = Math.max(100, totalKnown * 0.02)
  if (Math.abs(h.diff) <= tolerance) return L(`på linje med ${of}`, `in line with ${of}`)
  const amount = formatNOK(Math.abs(h.diff))
  return h.diff > 0 ? L(`ca. ${amount} mer enn ${of}`, `about ${amount} more than ${of}`) : L(`ca. ${amount} mindre enn ${of}`, `about ${amount} less than ${of}`)
}

// Et godkjent forslag lagrer tilstanden (distribution_versions.snapshot). Dette gjør den om til samme
// form som summarizeDistribution bruker, så protokollen lages fra det som faktisk ble godkjent.
export function snapshotInput(snapshot = {}) {
  // Nye øyeblikksbilder har personene (heirs) og assigned_heir_id. Eldre har kontonavn (member_names) og
  // assigned_to; de brukes bare som reserve for tildelinger som ikke kan kobles til en person.
  const names = snapshot.member_names || {}
  return {
    items: (snapshot.items || []).map(i => ({ ...i, interests: Array.from({ length: i.wanted_by || 0 }, () => ({})) })),
    members: Object.entries(names).map(([user_id, display_name]) => ({ user_id, profiles: { display_name } })),
    heirs: snapshot.heirs || [],
    estate: { shares_confirmed: snapshot.shares_confirmed, split_mode: snapshot.split_mode },
  }
}
