// Oversikt over fordelingen slik den står nå (F5): per arving, gjenstander ingen vil ha og det som ikke er
// avklart. Ren logikk (testes med node --test). Brukes av /estate/:id/fordeling og protokollen (PDF).
//
// Verdiutjevningen er beslutningsstøtte, ikke en juridisk fasit. Den regnes bare av kjente fordelingsverdier;
// gjenstander uten verdi telles for seg og regnes aldri som 0 kr.
import { L } from './lang.js'
import { formatNOK } from './format.js'
import { itemValue, confirmedWeights } from './distribution.js'
import { decidingMembers } from './estateProgress.js'

export function summarizeDistribution({ items = [], members = [], heirs = [], estate = null }) {
  const name = id => members.find(m => m.user_id === id)?.profiles?.display_name || L('tidligere medlem', 'former member')
  const deciders = decidingMembers(members, heirs)
  const assigned = items.filter(i => i.status === 'assigned')
  const recipients = [...new Set([...deciders.map(m => m.user_id), ...assigned.map(i => i.assigned_to).filter(Boolean)])]

  const perHeir = recipients.map(uid => {
    const mine = assigned.filter(i => i.assigned_to === uid)
    const known = mine.filter(i => itemValue(i) !== null)
    return { user_id: uid, name: name(uid), items: mine, sum: known.reduce((a, i) => a + itemValue(i), 0), unknown: mine.length - known.length }
  })
  const totalKnown = perHeir.reduce((a, h) => a + h.sum, 0)
  const weights = confirmedWeights(heirs, estate)
  const shareBase = deciders.length || perHeir.length
  for (const h of perHeir) {
    const share = weights ? (weights[h.user_id] || 0) : (deciders.some(m => m.user_id === h.user_id) ? 1 / shareBase : 0)
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
  const names = snapshot.member_names || {}
  return {
    items: (snapshot.items || []).map(i => ({ ...i, interests: Array.from({ length: i.wanted_by || 0 }, () => ({})) })),
    members: Object.entries(names).map(([user_id, display_name]) => ({ user_id, profiles: { display_name } })),
    heirs: snapshot.heirs || [],
    estate: { shares_confirmed: snapshot.shares_confirmed, split_mode: snapshot.split_mode },
  }
}
