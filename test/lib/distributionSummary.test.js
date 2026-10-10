// Oversikten over fordelingen (src/lib/distributionSummary.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDistribution, diffText } from '../../src/lib/distributionSummary.js'

const members = [{ user_id: 'k', profiles: { display_name: 'Kari', email: 'k@x' } }, { user_id: 'l', profiles: { display_name: 'Lars', email: 'l@x' } }]
const it = (id, extra) => ({ id, title: id, interests: [], ...extra })

test('per arving: sum av kjente fordelingsverdier, ukjente telles for seg, avvik fra lik andel', () => {
  const items = [
    it('a', { status: 'assigned', assigned_to: 'k', agreed_value: 3000 }),
    it('b', { status: 'assigned', assigned_to: 'l', agreed_value: 1000 }),
    it('c', { status: 'assigned', assigned_to: 'l', agreed_value: null }),
  ]
  const s = summarizeDistribution({ items, members })
  const kari = s.perHeir.find(h => h.user_id === 'k'), lars = s.perHeir.find(h => h.user_id === 'l')
  assert.deepEqual([kari.sum, lars.sum, lars.unknown, s.totalKnown], [3000, 1000, 1, 4000])
  assert.deepEqual([kari.target, kari.diff, lars.diff], [2000, 1000, -1000])
  assert.match(diffText(kari, s), /^ca\. .*1.?000.* mer enn en lik andel$/)
  assert.match(diffText(lars, s), /mindre enn en lik andel$/)
  assert.equal(s.weighted, false)
})

test('vektet mål bare med bekreftede andeler; små avvik er på linje', () => {
  const items = [it('a', { status: 'assigned', assigned_to: 'k', agreed_value: 3000 }), it('b', { status: 'assigned', assigned_to: 'l', agreed_value: 1000 })]
  const heirs = [{ user_id: 'k', percentage: 75 }, { user_id: 'l', percentage: 25 }]
  const s = summarizeDistribution({ items, members, heirs, estate: { shares_confirmed: true, split_mode: 'custom' } })
  assert.equal(s.weighted, true)
  assert.equal(diffText(s.perHeir.find(h => h.user_id === 'k'), s), 'på linje med sin andel')
})

test('ingen vil ha, ikke avklart og om fordelingen er komplett', () => {
  const items = [
    it('a', { status: 'assigned', assigned_to: 'k' }),
    it('b', { disposition: 'sell' }),
    it('c', { disposition: null, marked_for_disposal: true }),
    it('d', { interests: [{ user_id: 'k' }, { user_id: 'l' }] }),
  ]
  const s = summarizeDistribution({ items, members })
  assert.deepEqual([s.unwanted.sell.length, s.unwanted.undecided.length, s.pending.length, s.complete], [1, 1, 1, false])
  const done = summarizeDistribution({ items: [items[0], items[1]], members })
  assert.equal(done.complete, true)
})

test('protokollen fra et godkjent forslag bruker øyeblikksbildet', async () => {
  const { snapshotInput } = await import('../../src/lib/distributionSummary.js')
  const snap = { member_names: { k: 'Kari' }, items: [{ id: 'a', title: 'Stol', status: 'assigned', assigned_to: 'k', agreed_value: 500, wanted_by: 0 }, { id: 'b', title: 'Vase', status: 'active', wanted_by: 2 }], heirs: [] }
  const s = summarizeDistribution(snapshotInput(snap))
  assert.equal(s.perHeir[0].name, 'Kari')
  assert.equal(s.perHeir[0].sum, 500)
  assert.equal(s.pending.length, 1)
})
