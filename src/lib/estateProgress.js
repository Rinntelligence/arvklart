// Hva som gjenstår i et bo. Ren logikk uten Supabase, slik at den kan testes med node --test.
// En arving har «tatt stilling» til en gjenstand når hen har vist interesse eller sagt nei takk
// (item_passes). Tildelte gjenstander er ferdige og teller ikke med.
import { L } from './lang.js'

const normEmail = e => (e || '').trim().toLowerCase()

// Medlemmer som er lagt inn som bobestyrer, advokat eller rådgiver arver ikke, og trenger ikke
// ta stilling til gjenstandene. Alle andre medlemmer (også eieren) må det.
export const ADVISOR_RELATIONSHIPS = ['Bobestyrer', 'Advokat', 'Rådgiver']

export const decidingMembers = (members, heirs = []) => {
  const advisorEmails = heirs
    .filter(h => ADVISOR_RELATIONSHIPS.includes(h.relationship) && h.email)
    .map(h => normEmail(h.email))
  return members.filter(m => !advisorEmails.includes(normEmail(m.profiles?.email)))
}

// Flere vil ha gjenstanden, og den er ikke tildelt ennå.
export const isContested = item => item.status !== 'assigned' && (item.interests?.length || 0) > 1

// Returnerer [{ member, items }] for hvert medlem som ikke har tatt stilling til alt.
export const getUndecided = (items, members, passes, heirs = []) => {
  const open = items.filter(i => i.status !== 'assigned')
  return decidingMembers(members, heirs).map(member => ({
    member,
    items: open.filter(i =>
      !i.interests?.some(x => x.user_id === member.user_id) &&
      !passes.some(p => p.item_id === i.id && p.user_id === member.user_id)
    ),
  })).filter(u => u.items.length > 0)
}

// Gjenstående steg i fornuftig rekkefølge. Bare steg som ikke er ferdige tas med.
export const buildRemainingSteps = ({ estateId, userId, items, members, passes, heirs, tasks }) => {
  const steps = []
  const open = items.filter(i => i.status !== 'assigned')
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const item = n => count(n, L('gjenstand', 'item'), L('gjenstander', 'items'))

  const memberEmails = members.map(m => normEmail(m.profiles?.email)).filter(Boolean)
  const notJoined = heirs.filter(h => !h.email || !memberEmails.includes(normEmail(h.email)))
  if (notJoined.length) steps.push({
    key: 'join',
    title: L(`${count(notJoined.length, 'arving', 'arvinger')} har ikke blitt med i boet`, `${count(notJoined.length, 'heir has', 'heirs have')} not joined the estate`),
    detail: notJoined.map(h => h.name).join(', '),
    path: `/estate/${estateId}/heirs`,
  })

  const undecided = getUndecided(items, members, passes, heirs)
  if (undecided.length) steps.push({
    key: 'decide',
    title: L('Alle må ta stilling til gjenstandene', 'Everyone must decide on the items'),
    detail: undecided.map(u => `${u.member.profiles?.display_name || L('Ukjent', 'Unknown')}: ${item(u.items.length)}`).join(' · '),
    ...(undecided.some(u => u.member.user_id === userId) && { path: `/estate/${estateId}/swipe`, pathLabel: L('Ta stilling', 'Decide') }),
  })

  const contested = open.filter(isContested)
  if (contested.length) steps.push({
    key: 'conflicts',
    title: L(`${item(contested.length)} ønskes av flere`, `${item(contested.length)} wanted by several heirs`),
    detail: undecided.length
      ? L('Løses med Løsningsmetoder når alle har tatt stilling', 'Resolved with Resolution methods once everyone has decided')
      : L('Løses med Løsningsmetoder', 'Resolved with Resolution methods'),
    path: `/estate/${estateId}/conflicts`,
  })

  const single = open.filter(i => i.interests?.length === 1)
  if (single.length) steps.push({
    key: 'single',
    title: L(`${item(single.length)} har én interessent og kan tildeles`, `${item(single.length)} ${single.length === 1 ? 'has' : 'have'} one interested heir and can be assigned`),
    detail: L('Administrator tildeler fra gjenstandssiden', 'The administrator assigns from the item page'),
  })

  const deciding = decidingMembers(members, heirs)
  const everyonePassed = i => deciding.length > 0 && deciding.every(m => passes.some(p => p.item_id === i.id && p.user_id === m.user_id))
  // Uavklart = ingen valgt disponering (salg, gave eller kassering). Et gammelt kastemerke
  // (marked_for_disposal) er ikke et vedtak, så de gjenstandene står som uavklarte.
  const unwanted = open.filter(i => !i.interests?.length && !i.disposition && everyonePassed(i))
  if (unwanted.length) steps.push({
    key: 'unwanted',
    title: L(`${item(unwanted.length)} vil ingen ha`, `No one wants ${item(unwanted.length)}`),
    detail: L('Bestem sammen om de skal selges, gis bort eller kastes', 'Decide together whether to sell, give away or discard them'),
    path: `/estate/${estateId}/ingen-vil-ha`,
    pathLabel: L('Bestem', 'Decide'),
  })

  const openTasks = tasks.filter(t => !t.completed)
  if (openTasks.length) steps.push({
    key: 'tasks',
    title: L(`${count(openTasks.length, 'oppgave', 'oppgaver')} i sjekklisten er ikke fullført`, `${count(openTasks.length, 'checklist task is', 'checklist tasks are')} not completed`),
    path: `/estate/${estateId}/tasks`,
  })

  return steps
}

// Fordeling av gjenstandene i fire grupper som ikke overlapper, til statuslinjen på bo-siden.
export const getStatusBreakdown = items => {
  const open = items.filter(i => i.status !== 'assigned')
  return {
    assigned: items.length - open.length,
    contested: open.filter(i => (i.interests?.length || 0) > 1).length,
    single: open.filter(i => i.interests?.length === 1).length,
    none: open.filter(i => !i.interests?.length).length,
  }
}
