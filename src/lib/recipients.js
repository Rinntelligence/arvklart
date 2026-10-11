// Hvem kan få gjenstander (20261021_heir_assignment.sql). Ren logikk (testes med node --test).
//
// Mottakere er personene familien har registrert på listen i boet (heirs) med «Kan få gjenstander»
// (receives_items). Det er familiens registrering, ikke Arvklarts vurdering av arverett. Brukerrollen i
// boet (administrator/medlem) gir ingen rett til gjenstander: en administrator kan få gjenstander bare
// når hen står på listen som mottaker. Personer uten konto kan også få gjenstander.
//
// Tildelinger peker på personen (items.assigned_heir_id), ikke på kontoen. Ønsker og «nei takk» er
// registrert av kontoer (interests.user_id), og kobles til personen via heirs.user_id.
import { ADVISOR_RELATIONSHIPS } from './estateProgress.js'

// Standard før familien har valgt: alle unntatt bobestyrer, advokat og rådgiver (som i databasen)
export const receivesItems = h => (h?.receives_items ?? !ADVISOR_RELATIONSHIPS.includes(h?.relationship)) === true

export const recipientsOf = (heirs = []) => heirs.filter(receivesItems)

// Personen gjenstanden er tildelt: assigned_heir_id, eller (eldre data/øyeblikksbilder) kontoen via heirs.user_id
export function recipientOf(item, heirs = []) {
  if (item?.assigned_heir_id) return heirs.find(h => h.id === item.assigned_heir_id) || null
  if (item?.assigned_to) return heirs.find(h => h.user_id && h.user_id === item.assigned_to) || null
  return null
}
export const recipientIdOf = (item, heirs = []) => recipientOf(item, heirs)?.id || null

// Personen (mottaker) som er koblet til kontoen, eller null
export const personOfUser = (userId, people = []) => (userId ? people.find(p => p.user_id === userId) || null : null)

// Mottakerne blant dem som ønsker gjenstanden
export const interestedPeople = (item, people = []) =>
  (item?.interests || []).map(x => personOfUser(x.user_id, people)).filter(Boolean)
    .filter((p, i, a) => a.findIndex(q => q.id === p.id) === i)

// Tildelt, men uten bekreftet person på listen: eldre tildeling som ikke kunne kobles, eller tildeling der
// kontoen senere er slettet. Endres aldri automatisk; familien bekrefter mottakeren.
export const isUnconfirmedAssignment = item => item?.status === 'assigned' && !item?.assigned_heir_id
export const unconfirmedAssignments = (items = []) => items.filter(isUnconfirmedAssignment)
