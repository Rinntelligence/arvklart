// Mottakere (src/lib/recipients.js): brukerrollen gir ingen rett til gjenstander; personene på listen gjør
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receivesItems, recipientsOf, recipientOf, personOfUser, interestedPeople } from '../../src/lib/recipients.js'

const heirs = [
  { id: 'A', name: 'Anne', user_id: 'a', relationship: 'Barn' },               // administrator og arving
  { id: 'G', name: 'Gunn', user_id: null, relationship: 'Barn' },              // uten konto
  { id: 'R', name: 'Rolf', user_id: 'r', relationship: 'Advokat' },            // rådgiver, ikke mottaker
  { id: 'S', name: 'Siri', user_id: 's', relationship: 'Rådgiver', receives_items: true }, // eksplisitt registrert
  { id: 'N', name: 'Nils', user_id: 'n', relationship: 'Barn', receives_items: false },
]

test('mottakere: standard ja, unntatt rådgiverroller; familiens eksplisitte valg vinner', () => {
  assert.deepEqual(recipientsOf(heirs).map(h => h.id), ['A', 'G', 'S'])
  assert.equal(receivesItems(heirs[2]), false)
  assert.equal(receivesItems(heirs[3]), true)
})

test('tildelingen peker på personen; eldre tildeling via kontoen; person uten konto', () => {
  assert.equal(recipientOf({ assigned_heir_id: 'G' }, heirs).name, 'Gunn')
  assert.equal(recipientOf({ assigned_to: 'a' }, heirs).name, 'Anne')
  assert.equal(recipientOf({ assigned_heir_id: 'G', assigned_to: null }, heirs).user_id, null)
  assert.equal(recipientOf({ assigned_to: 'ukjent' }, heirs), null)
})

test('ønsker kobles til personen via kontoen; kontoer som ikke er mottakere, er ikke med', () => {
  const people = recipientsOf(heirs)
  assert.equal(personOfUser('a', people).id, 'A')
  assert.equal(personOfUser('r', people), null, 'advokaten er ikke mottaker')
  assert.equal(personOfUser('cato', people), null, 'administrator som ikke står på listen')
  assert.deepEqual(interestedPeople({ interests: [{ user_id: 'a' }, { user_id: 'r' }, { user_id: 'cato' }, { user_id: 'a' }] }, people).map(p => p.id), ['A'])
})
