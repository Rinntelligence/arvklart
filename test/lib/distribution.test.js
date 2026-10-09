import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemValue, itemsWithoutValue, equalValueResolutions, valueTotal } from '../../src/lib/distribution.js'

const it = (id, value, interested = []) => ({ id, estimated_value: value, interests: interested.map(user_id => ({ user_id })) })

test('ukjent verdi er null, 0 er en verdi', () => {
  assert.equal(itemValue(it('a', null)), null)
  assert.equal(itemValue(it('a', '')), null)
  assert.equal(itemValue(it('a', 'ukjent')), null)
  assert.equal(itemValue(it('a', '0')), 0)
  assert.equal(itemValue(it('a', 0)), 0)
  assert.equal(itemValue(it('a', '1 500 kr')), 1500)
})

test('jevn fordeling regnes ikke ut når en gjenstand mangler verdi (heller ikke en tidligere tildelt)', () => {
  const items = [it('a', '1000', ['k', 'l']), it('b', null, ['k', 'l'])]
  assert.deepEqual(equalValueResolutions(items, ['k', 'l']), {})
  assert.deepEqual(itemsWithoutValue(items).map(i => i.id), ['b'])
  const assigned = [{ id: 'x', estimated_value: null, assigned_to: 'k' }]
  assert.deepEqual(equalValueResolutions([it('a', '1000', ['k', 'l'])], ['k', 'l'], assigned), {})
})

test('jevn fordeling med avtalt 0 kr og tidligere tildelinger', () => {
  const items = [it('a', '1000', ['k', 'l']), it('b', '600', ['k', 'l']), it('c', '0', ['k', 'l'])]
  const res = equalValueResolutions(items, ['k', 'l'], [{ id: 'x', estimated_value: '500', assigned_to: 'k' }])
  // l (0) får a (1000) -> l=1000; k (500) får b (600) -> k=1100; c (0) går til lavest sum, l
  assert.deepEqual(res, { a: 'l', b: 'k', c: 'l' })
})

test('valueTotal teller ukjente for seg', () => {
  assert.deepEqual(valueTotal([it('a', '100'), it('b', null), it('c', '0')]), { sum: 100, unknown: 1 })
})
