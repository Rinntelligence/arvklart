// Oversikten over fordelingen (src/lib/distributionSummary.js): per person på listen, ikke per konto
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeDistribution, diffText } from '../../src/lib/distributionSummary.js'

const members = [{ user_id: 'k', profiles: { display_name: 'Kari', email: 'k@x' } }, { user_id: 'l', profiles: { display_name: 'Lars', email: 'l@x' } },
  { user_id: 'adm', profiles: { display_name: 'Admin uten arv', email: 'adm@x' } }]
const heirs = [{ id: 'K', name: 'Kari', user_id: 'k', relationship: 'Barn' }, { id: 'L', name: 'Lars', user_id: 'l', relationship: 'Barn' }]
const it = (id, extra) => ({ id, title: id, interests: [], ...extra })

test('per person: sum av kjente fordelingsverdier, ukjente telles for seg, avvik fra lik andel', () => {
  const items = [
    it('a', { status: 'assigned', assigned_heir_id: 'K', assigned_to: 'k', agreed_value: 3000 }),
    it('b', { status: 'assigned', assigned_heir_id: 'L', agreed_value: 1000 }),
    it('c', { status: 'assigned', assigned_heir_id: 'L', agreed_value: null }),
  ]
  const s = summarizeDistribution({ items, members, heirs })
  const kari = s.perHeir.find(h => h.heir_id === 'K'), lars = s.perHeir.find(h => h.heir_id === 'L')
  assert.deepEqual([kari.sum, lars.sum, lars.unknown, s.totalKnown], [3000, 1000, 1, 4000])
  assert.deepEqual([kari.target, kari.diff, lars.diff], [2000, 1000, -1000])
  assert.match(diffText(kari, s), /^ca\. .*1.?000.* mer enn en lik andel$/)
  assert.match(diffText(lars, s), /mindre enn en lik andel$/)
  assert.equal(s.weighted, false)
  assert.ok(!s.perHeir.some(h => h.name === 'Admin uten arv'), 'administrator som ikke står på listen, er ikke med')
})

test('person uten konto og eksplisitt registrert rådgiver er med; rådgiver uten registrering er ikke', () => {
  const hs = [...heirs, { id: 'G', name: 'Gunn', user_id: null, relationship: 'Barn' }, { id: 'R', name: 'Rolf', relationship: 'Advokat' },
    { id: 'S', name: 'Siri', relationship: 'Rådgiver', receives_items: true }]
  const s = summarizeDistribution({ items: [it('a', { status: 'assigned', assigned_heir_id: 'G', agreed_value: 900 })], members, heirs: hs })
  assert.deepEqual(s.perHeir.map(h => h.name), ['Kari', 'Lars', 'Gunn', 'Siri'])
  assert.equal(s.perHeir.find(h => h.name === 'Gunn').sum, 900)
})

test('tildeling etter kontosletting (assigned_to er null) står fortsatt på personen', () => {
  const s = summarizeDistribution({ items: [it('a', { status: 'assigned', assigned_heir_id: 'K', assigned_to: null, agreed_value: 500 })], members: [], heirs })
  assert.equal(s.perHeir.find(h => h.heir_id === 'K').sum, 500)
})

test('vektet mål bare med bekreftede andeler; små avvik er på linje', () => {
  const items = [it('a', { status: 'assigned', assigned_heir_id: 'K', agreed_value: 3000 }), it('b', { status: 'assigned', assigned_heir_id: 'L', agreed_value: 1000 })]
  const hs = [{ ...heirs[0], percentage: 75 }, { ...heirs[1], percentage: 25 }]
  const s = summarizeDistribution({ items, members, heirs: hs, estate: { shares_confirmed: true, split_mode: 'custom' } })
  assert.equal(s.weighted, true)
  assert.equal(diffText(s.perHeir.find(h => h.heir_id === 'K'), s), 'på linje med sin andel')
})

test('ingen vil ha, ikke avklart og om fordelingen er komplett', () => {
  const items = [
    it('a', { status: 'assigned', assigned_heir_id: 'K' }),
    it('b', { disposition: 'sell' }),
    it('c', { disposition: null, marked_for_disposal: true }),
    it('d', { interests: [{ user_id: 'k' }, { user_id: 'l' }] }),
  ]
  const s = summarizeDistribution({ items, members, heirs })
  assert.deepEqual([s.unwanted.sell.length, s.unwanted.undecided.length, s.pending.length, s.complete], [1, 1, 1, false])
  const done = summarizeDistribution({ items: [items[0], items[1]], members, heirs })
  assert.equal(done.complete, true)
})

test('protokollen fra et godkjent forslag bruker øyeblikksbildet (personer), og eldre bilder med kontonavn', async () => {
  const { snapshotInput } = await import('../../src/lib/distributionSummary.js')
  const snap = { heirs: [{ id: 'K', name: 'Kari', receives_items: true }], items: [{ id: 'a', title: 'Stol', status: 'assigned', assigned_heir_id: 'K', agreed_value: 500, wanted_by: 0 }, { id: 'b', title: 'Vase', status: 'active', wanted_by: 2 }] }
  const s = summarizeDistribution(snapshotInput(snap))
  assert.equal(s.perHeir[0].name, 'Kari')
  assert.equal(s.perHeir[0].sum, 500)
  assert.equal(s.pending.length, 1)
  const old = { member_names: { k: 'Kari' }, items: [{ id: 'a', title: 'Stol', status: 'assigned', assigned_to: 'k', agreed_value: 500, wanted_by: 0 }], heirs: [] }
  const o = summarizeDistribution(snapshotInput(old))
  assert.deepEqual([o.perHeir[0].name, o.perHeir[0].sum], ['Kari', 500])
})

test('eldre tildeling uten bekreftet person vises under kontoen; slettet konto vises som det, ikke som 0 eller borte', () => {
  const items = [
    it('a', { status: 'assigned', assigned_to: 'adm', agreed_value: 700 }),
    it('b', { status: 'assigned', assigned_to: null, agreed_value: null }),
  ]
  const s = summarizeDistribution({ items, members, heirs })
  const legacy = s.perHeir.find(h => h.user_id === 'adm'), gone = s.perHeir.find(h => h.unconfirmed && !h.user_id)
  assert.deepEqual([legacy.name, legacy.unconfirmed, legacy.sum], ['Admin uten arv', true, 700])
  assert.deepEqual([gone.name, gone.items.length], ['Konto som er slettet', 1])
  assert.equal(s.hasRecipients, true)
})
