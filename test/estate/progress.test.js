// Hvem som mangler å ta stilling, og hva som gjenstår i boet.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getUndecided, buildRemainingSteps, getStatusBreakdown, decidingMembers, isContested } from '../../src/lib/estateProgress.js'

const kari = { user_id: 'k', profiles: { display_name: 'Kari', email: 'kari@x.no' } }
const ola = { user_id: 'o', profiles: { display_name: 'Ola', email: 'ola@x.no' } }
const want = (...ids) => ids.map(user_id => ({ user_id }))
const pass = (item_id, user_id) => ({ item_id, user_id })

describe('getUndecided', () => {
  test('interesse og nei takk teller begge som å ta stilling', () => {
    const items = [{ id: 'a', interests: want('k') }, { id: 'b', interests: [] }]
    const res = getUndecided(items, [kari, ola], [pass('a', 'o'), pass('b', 'k')])
    assert.deepEqual(res.map(u => [u.member.user_id, u.items.map(i => i.id)]), [['o', ['b']]])
  })

  test('tildelte gjenstander krever ikke stillingtaken', () => {
    const items = [{ id: 'a', interests: [], status: 'assigned' }]
    assert.deepEqual(getUndecided(items, [kari], []), [])
  })

  test('alle har tatt stilling gir tom liste', () => {
    const items = [{ id: 'a', interests: want('k', 'o') }]
    assert.deepEqual(getUndecided(items, [kari, ola], []), [])
  })
})

describe('decidingMembers', () => {
  const advokat = { user_id: 'a', profiles: { display_name: 'Advokat', email: 'Advokat@Firma.no' } }
  const heirs = [
    { name: 'Kari', email: 'kari@x.no', relationship: 'Barn' },
    { name: 'Advokaten', email: 'advokat@firma.no ', relationship: 'Advokat' },
  ]

  test('bobestyrer, advokat og rådgiver trenger ikke ta stilling', () => {
    assert.deepEqual(decidingMembers([kari, ola, advokat], heirs).map(m => m.user_id), ['k', 'o'])
  })

  test('getUndecided venter ikke på rådgivere', () => {
    const items = [{ id: 'a', interests: want('k', 'o') }]
    assert.deepEqual(getUndecided(items, [kari, ola, advokat], [], heirs), [])
  })
})

describe('isContested', () => {
  test('tildelte gjenstander er ikke ettertraktet lenger', () => {
    assert.equal(isContested({ interests: want('k', 'o') }), true)
    assert.equal(isContested({ interests: want('k', 'o'), status: 'assigned' }), false)
    assert.equal(isContested({ interests: want('k') }), false)
  })
})

describe('buildRemainingSteps', () => {
  const base = { estateId: 'e', userId: 'k', members: [kari, ola], passes: [], heirs: [], tasks: [] }

  test('ferdig bo har ingen steg', () => {
    const items = [{ id: 'a', interests: want('k'), status: 'assigned' }]
    assert.deepEqual(buildRemainingSteps({ ...base, items }), [])
  })

  test('viser hvem som mangler, og lenker til sveip bare når jeg selv mangler', () => {
    const items = [{ id: 'a', interests: want('k') }]
    const [decide] = buildRemainingSteps({ ...base, items }).filter(s => s.key === 'decide')
    assert.match(decide.detail, /Ola: 1 gjenstand/)
    assert.equal(decide.path, undefined)
    const mine = buildRemainingSteps({ ...base, userId: 'o', items }).find(s => s.key === 'decide')
    assert.equal(mine.path, '/estate/e/swipe')
  })

  test('konflikter, én interessent og ingen vil ha', () => {
    const items = [
      { id: 'a', interests: want('k', 'o') },
      { id: 'b', interests: want('k') },
      { id: 'c', interests: [] },
    ]
    const passes = [pass('b', 'o'), pass('c', 'k'), pass('c', 'o')]
    const keys = buildRemainingSteps({ ...base, items, passes }).map(s => s.key)
    assert.deepEqual(keys, ['conflicts', 'single', 'unwanted'])
    assert.equal(buildRemainingSteps({ ...base, items, passes }).find(s => s.key === 'unwanted').path, '/estate/e/ingen-vil-ha')
  })

  test('ingen vil ha: et gammelt kastemerke er ikke en beslutning, en valgt disponering er det', () => {
    const passes = [pass('c', 'k'), pass('c', 'o')]
    const marked = buildRemainingSteps({ ...base, items: [{ id: 'c', interests: [], marked_for_disposal: true }], passes }).map(s => s.key)
    assert.deepEqual(marked, ['unwanted'])
    const decided = buildRemainingSteps({ ...base, items: [{ id: 'c', interests: [], disposition: 'donate' }], passes }).map(s => s.key)
    assert.deepEqual(decided, [])
  })

  test('arvinger som ikke har blitt med og åpne oppgaver', () => {
    const heirs = [{ name: 'Kari', email: 'KARI@x.no ' }, { name: 'Per', email: 'per@x.no' }, { name: 'Lise', email: null }]
    const tasks = [{ completed: true }, { completed: false }]
    const steps = buildRemainingSteps({ ...base, items: [], heirs, tasks })
    assert.equal(steps[0].key, 'join')
    assert.equal(steps[0].detail, 'Per, Lise')
    assert.equal(steps[1].title, '1 oppgave i sjekklisten er ikke fullført')
  })
})

describe('getStatusBreakdown', () => {
  test('hver gjenstand havner i nøyaktig én gruppe', () => {
    const items = [
      { id: 'a', interests: want('k', 'o'), status: 'assigned' },
      { id: 'b', interests: want('k', 'o') },
      { id: 'c', interests: want('k') },
      { id: 'd', interests: [] },
      { id: 'e' },
    ]
    assert.deepEqual(getStatusBreakdown(items), { assigned: 1, contested: 1, single: 1, none: 2 })
  })
})
