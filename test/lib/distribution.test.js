import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemValue, aiEstimate, itemsWithoutValue, equalValueResolutions, valueTotal, confirmedWeights } from '../../src/lib/distribution.js'

// agreed_value er fordelingsverdien; estimated_value er AI-anslaget
const it = (id, value, interested = [], extra = {}) => ({ id, agreed_value: value, interests: interested.map(user_id => ({ user_id })), ...extra })

test('fordelingsverdi: ukjent er null, 0 er en verdi; AI-anslaget leses for seg', () => {
  assert.equal(itemValue(it('a', null)), null)
  assert.equal(itemValue(it('a', '')), null)
  assert.equal(itemValue(it('a', '0.00')), 0)
  assert.equal(itemValue(it('a', 0)), 0)
  assert.equal(itemValue(it('a', '1500.00')), 1500)
  assert.equal(itemValue({ id: 'a', estimated_value: '1500' }), null, 'AI-anslaget er ikke en fordelingsverdi')
  assert.equal(aiEstimate({ estimated_value: '1 500 kr' }), 1500)
})

// Mottakerne er personer på listen (heirs): K og L har konto (k, l); G har ikke konto
const K = { id: 'K', user_id: 'k' }, Lp = { id: 'L', user_id: 'l' }, G = { id: 'G', user_id: null }
const people = [K, Lp]

test('gjenstander uten fordelingsverdi hoppes over og sperrer ikke de andre', () => {
  const items = [it('a', 1000, ['k', 'l']), it('b', null, ['k', 'l']), it('c', 400, ['k', 'l'])]
  assert.deepEqual(equalValueResolutions(items, people), { a: 'K', c: 'L' })
  assert.deepEqual(itemsWithoutValue(items).map(i => i.id), ['b'])
  // tidligere tildelt uten verdi teller ikke i summen
  assert.deepEqual(equalValueResolutions([it('a', 1000, ['k', 'l'])], people, [{ id: 'x', agreed_value: null, assigned_heir_id: 'K' }]), { a: 'K' })
})

test('jevn fordeling med avtalt 0 kr og tidligere tildelinger (til personen)', () => {
  const items = [it('a', 1000, ['k', 'l']), it('b', 600, ['k', 'l']), it('c', 0, ['k', 'l'])]
  const res = equalValueResolutions(items, people, [{ id: 'x', agreed_value: 500, assigned_heir_id: 'K' }])
  // L (0) får a (1000) -> L=1000; K (500) får b (600) -> K=1100; c (0) går til lavest sum, L
  assert.deepEqual(res, { a: 'L', b: 'K', c: 'L' })
  // eldre tildeling som bare har kontoen, regnes til personen med den kontoen
  assert.deepEqual(equalValueResolutions(items, people, [{ id: 'x', agreed_value: 500, assigned_to: 'k' }]), res)
})

test('vektet etter bekreftede andeler: den med lavest sum i forhold til andelen får neste', () => {
  // K har 2/3, L har 1/3: K får 900, L får 600 (600/0.33 > 900/0.67 → K får 300 også)
  const items = [it('a', 900, ['k', 'l']), it('b', 600, ['k', 'l']), it('c', 300, ['k', 'l'])]
  const res = equalValueResolutions(items, people, [], { K: 2 / 3, L: 1 / 3 })
  assert.deepEqual(res, { a: 'K', b: 'L', c: 'K' })
})

test('person uten konto kan få gjenstander; ønsker fra kontoer som ikke er mottakere teller ikke', () => {
  // ingen av mottakerne ønsker a (bare kontoen «x», som ikke står på listen): alle mottakere er kandidater
  const res = equalValueResolutions([it('a', 1000, ['x']), it('b', 500, ['x'])], [G, K])
  assert.deepEqual(res, { a: 'G', b: 'K' })
})

test('andeler brukes bare når de er bekreftet, egendefinert og summerer til 100 – per person, også uten konto', () => {
  const heirs = [{ id: 'K', user_id: 'k', percentage: 50 }, { id: 'G', user_id: null, percentage: 50 }, { id: 'A', relationship: 'Advokat', percentage: 0 }]
  assert.deepEqual(confirmedWeights(heirs, { shares_confirmed: true, split_mode: 'custom' }), { K: 0.5, G: 0.5 })
  assert.equal(confirmedWeights(heirs, { shares_confirmed: false, split_mode: 'custom' }), null)
  assert.equal(confirmedWeights(heirs, { shares_confirmed: true, split_mode: 'equal' }), null)
  assert.equal(confirmedWeights([{ id: 'K', percentage: 60 }], { shares_confirmed: true, split_mode: 'custom' }), null)
})

test('valueTotal teller ukjente for seg', () => {
  assert.deepEqual(valueTotal([it('a', 100), it('b', null), it('c', 0)]), { sum: 100, unknown: 1 })
})
