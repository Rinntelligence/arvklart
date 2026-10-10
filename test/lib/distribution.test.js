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

test('gjenstander uten fordelingsverdi hoppes over og sperrer ikke de andre', () => {
  const items = [it('a', 1000, ['k', 'l']), it('b', null, ['k', 'l']), it('c', 400, ['k', 'l'])]
  assert.deepEqual(equalValueResolutions(items, ['k', 'l']), { a: 'k', c: 'l' })
  assert.deepEqual(itemsWithoutValue(items).map(i => i.id), ['b'])
  // tidligere tildelt uten verdi teller ikke i summen
  assert.deepEqual(equalValueResolutions([it('a', 1000, ['k', 'l'])], ['k', 'l'], [{ id: 'x', agreed_value: null, assigned_to: 'k' }]), { a: 'k' })
})

test('jevn fordeling med avtalt 0 kr og tidligere tildelinger', () => {
  const items = [it('a', 1000, ['k', 'l']), it('b', 600, ['k', 'l']), it('c', 0, ['k', 'l'])]
  const res = equalValueResolutions(items, ['k', 'l'], [{ id: 'x', agreed_value: 500, assigned_to: 'k' }])
  // l (0) får a (1000) -> l=1000; k (500) får b (600) -> k=1100; c (0) går til lavest sum, l
  assert.deepEqual(res, { a: 'l', b: 'k', c: 'l' })
})

test('vektet etter bekreftede andeler: den med lavest sum i forhold til andelen får neste', () => {
  // k har 2/3, l har 1/3: k får 900, l får 600 (600/0.33 > 900/0.67 → k får 300 også)
  const items = [it('a', 900, ['k', 'l']), it('b', 600, ['k', 'l']), it('c', 300, ['k', 'l'])]
  const res = equalValueResolutions(items, ['k', 'l'], [], { k: 2 / 3, l: 1 / 3 })
  assert.deepEqual(res, { a: 'k', b: 'l', c: 'k' })
})

test('andeler brukes bare når de er bekreftet, egendefinert og summerer til 100', () => {
  const heirs = [{ user_id: 'k', percentage: 50 }, { user_id: 'l', percentage: 50 }, { user_id: null, percentage: 0 }]
  assert.deepEqual(confirmedWeights(heirs, { shares_confirmed: true, split_mode: 'custom' }), { k: 0.5, l: 0.5 })
  assert.equal(confirmedWeights(heirs, { shares_confirmed: false, split_mode: 'custom' }), null)
  assert.equal(confirmedWeights(heirs, { shares_confirmed: true, split_mode: 'equal' }), null)
  assert.equal(confirmedWeights([{ user_id: 'k', percentage: 60 }], { shares_confirmed: true, split_mode: 'custom' }), null)
})

test('valueTotal teller ukjente for seg', () => {
  assert.deepEqual(valueTotal([it('a', 100), it('b', null), it('c', 0)]), { sum: 100, unknown: 1 })
})
