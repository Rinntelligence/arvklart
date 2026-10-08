// Automatisk sletting av avsluttede bo (supabase/functions/_shared/closedEstates.ts): tilgang, dry_run,
// kjørelogg, delvise feil og ny kjøring. Node 22.18+ (TypeScript); eldre Node hopper over.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, manyFiles } from './fakeSupabase.js'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/closedEstates.ts') : null
const SECRET = 'a'.repeat(20) + 'hemmelig-og-lang-nok-1234'
const NOW = new Date('2026-10-08T03:17:00Z')
const OLD = '11111111-0000-0000-0000-000000000001'   // avsluttet for 13 mnd siden → slettes
const RECENT = '11111111-0000-0000-0000-000000000002' // avsluttet for 11 mnd siden → beholdes
const ACTIVE = '11111111-0000-0000-0000-000000000003' // aktivt → beholdes
const OLD2 = '11111111-0000-0000-0000-000000000004'  // avsluttet for 14 mnd siden → slettes
const URL = 'https://p.supabase.co/storage/v1/object/public/item-images/'

const setup = (opts = {}) => fakeSupabase({
  tables: {
    estates: [
      { id: OLD, name: 'Bo Hansen', status: 'closed', closed_at: '2025-09-01T00:00:00Z' },
      { id: RECENT, name: 'Bo Olsen', status: 'closed', closed_at: '2025-11-20T00:00:00Z' },
      { id: ACTIVE, name: 'Bo Berg', status: 'active', closed_at: null },
      { id: OLD2, name: 'Bo Dahl', status: 'closed', closed_at: '2025-08-01T00:00:00Z' },
    ],
    items: [
      { id: 'i1', estate_id: OLD, title: 'Bestemors gyngestol', image_url: URL + 'items/legacy.jpg', extra_images: [] },
      { id: 'i2', estate_id: RECENT, title: 'Klokke', image_url: null, extra_images: [] },
      { id: 'i3', estate_id: OLD2, title: 'Maleri', image_url: null, extra_images: [] },
    ],
    documents: [{ id: 'd1', estate_id: OLD, name: 'testament.pdf', file_path: `documents/${OLD}/testament.pdf` }],
    feedback: [{ id: 'f1', estate_id: OLD, content: 'kari@example.no skrev dette' }, { id: 'f2', estate_id: ACTIVE, content: 'beholdes' }],
    cleanup_runs: [],
  },
  storage: {
    'item-images': { ...manyFiles(OLD, 1500), ...manyFiles(OLD2, 2), ...manyFiles(RECENT, 2), 'items/legacy.jpg': {} },
    'estate-docs': { [`documents/${OLD}/testament.pdf`]: {} },
  },
  ...opts,
})

const req = (headers = {}, { method = 'POST', query = '', body } = {}) =>
  new Request(`https://x/functions/v1/cleanup-closed-estates${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
const call = (fake, request, extra = {}) => {
  const lines = []
  return mod.handleCleanupClosedEstates(request, { secret: SECRET, admin: () => fake.client, now: NOW, log: l => lines.push(l), ...extra })
    .then(r => ({ ...r, lines }))
}

describe('tilgang', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  const untouched = () => { throw new Error('databasen skal ikke røres') }
  for (const [name, headers, secret] of [
    ['uten header', {}, SECRET],
    ['feil hemmelighet', { 'x-cron-secret': SECRET.slice(0, -1) + 'x' }, SECRET],
    ['hemmelighet med ekstra tegn', { 'x-cron-secret': SECRET + 'x' }, SECRET],
    ['hemmeligheten bare som Authorization', { authorization: `Bearer ${SECRET}` }, SECRET],
    ['CRON_SECRET er ikke satt', { 'x-cron-secret': '' }, undefined],
    ['CRON_SECRET er for kort (fail closed)', { 'x-cron-secret': 'kort' }, 'kort'],
  ]) {
    test(`avviser ${name} med 401 uten å røre databasen`, async () => {
      const r = await mod.handleCleanupClosedEstates(req(headers), { secret, admin: untouched, now: NOW })
      assert.equal(r.status, 401)
    })
  }
  test('riktig hemmelighet, men GET → 405', async () => {
    const r = await mod.handleCleanupClosedEstates(req({ 'x-cron-secret': SECRET }, { method: 'GET' }), { secret: SECRET, admin: untouched, now: NOW })
    assert.equal(r.status, 405)
  })
  test('hemmeligheten havner ikke i svar eller logg', async () => {
    const fake = setup()
    const r = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.ok(!JSON.stringify(r.body).includes(SECRET) && !r.lines.join('').includes(SECRET))
  })
})

describe('dry_run', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  for (const [name, opts] of [['?dry_run=1', { query: '?dry_run=1' }], ['body { dry_run: true }', { body: { dry_run: true } }]]) {
    test(`${name}: ingen sideeffekter, bare antall`, async () => {
      const fake = setup()
      const before = JSON.stringify(fake.db) + [...fake.buckets['item-images'].keys()].length
      const r = await call(fake, req({ 'x-cron-secret': SECRET }, opts))
      assert.equal(r.status, 200)
      assert.deepEqual(fake.mutations, [], 'ingen insert/update/delete/remove')
      assert.equal(JSON.stringify(fake.db) + [...fake.buckets['item-images'].keys()].length, before)
      assert.deepEqual(r.body.estates.map(e => e.id), [OLD2, OLD])
      const old = r.body.estates.find(e => e.id === OLD)
      assert.deepEqual(old, { id: OLD, items: 1, documents: 1, feedback: 1, files: { documents: 1, images: 1501 } })
      const text = JSON.stringify(r.body) + r.lines.join('')
      for (const secret of ['Bo Hansen', 'gyngestol', 'testament', 'kari@', '.jpg']) assert.ok(!text.includes(secret), `rapporten avslører ikke «${secret}»`)
    })
  }
})

describe('sletting', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  test('sletter bare bo avsluttet for over 12 måneder siden – data, filer og tilbakemeldinger', async () => {
    const fake = setup()
    const r = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.equal(r.status, 200)
    assert.deepEqual(fake.db.estates.map(e => e.id).sort(), [RECENT, ACTIVE].sort())
    assert.deepEqual(fake.db.items.map(i => i.id), ['i2'])
    assert.deepEqual(fake.db.documents, [])
    assert.deepEqual(fake.db.feedback.map(f => f.id), ['f2'])
    assert.deepEqual([...fake.buckets['item-images'].keys()].sort(), Object.keys(manyFiles(RECENT, 2)).sort())
    assert.equal(fake.buckets['estate-docs'].size, 0)
    const run = fake.db.cleanup_runs[0]
    assert.equal(run.status, 'ok')
    assert.equal(run.deleted_count, 2)
    assert.ok(run.finished_at)
    assert.ok(!r.lines.join('').match(/\.jpg|Hansen|gyngestol/), 'loggen har ingen filnavn eller navn')
  })

  test('delvis feil: boet med feil står igjen urørt, kjøringen merkes «partial» og neste kjøring sletter det', async () => {
    let broken = true
    const fake = setup({ failRemove: (_b, p) => (broken && p.startsWith(OLD) ? 'error' : false) })
    const first = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.equal(first.status, 207)
    assert.deepEqual(first.body.deleted, [OLD2])
    assert.equal(first.body.failed[0].id, OLD)
    assert.ok(!first.body.failed[0].error.includes(OLD + '/f'), 'feilmeldingen har ikke filstien')
    assert.ok(fake.db.estates.some(e => e.id === OLD), 'boet er ikke slettet')
    assert.ok(fake.db.items.some(i => i.estate_id === OLD) && fake.db.feedback.some(f => f.estate_id === OLD), 'data og tilbakemeldinger står')
    assert.equal(fake.db.cleanup_runs[0].status, 'partial')

    broken = false
    const second = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.equal(second.status, 200)
    assert.deepEqual(second.body.deleted, [OLD])
    assert.ok(!fake.db.estates.some(e => e.id === OLD))
    assert.equal([...fake.buckets['item-images'].keys()].filter(p => p.startsWith(OLD)).length, 0)
  })

  test('alt feiler → 500 og «failed»', async () => {
    const fake = setup({ failRemove: () => 'error' })
    const r = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.equal(r.status, 500)
    assert.equal(fake.db.cleanup_runs[0].status, 'failed')
    assert.equal(fake.db.estates.length, 4)
  })

  test('kan ikke kjøringen logges, slettes ingenting', async () => {
    const fake = setup({ failInsert: true })
    await assert.rejects(() => call(fake, req({ 'x-cron-secret': SECRET })))
    assert.equal(fake.db.estates.length, 4)
    assert.equal(fake.mutations.filter(m => m.op !== 'insert').length, 0)
  })

  test('ingenting å slette → ok og én loggrad', async () => {
    const fake = setup()
    fake.db.estates = fake.db.estates.filter(e => e.status !== 'closed' || e.id === RECENT)
    const r = await call(fake, req({ 'x-cron-secret': SECRET }))
    assert.equal(r.status, 200)
    assert.equal(fake.db.cleanup_runs[0].status, 'ok')
    assert.equal(fake.db.cleanup_runs[0].deleted_count, 0)
  })

  test('grensen er 12 måneder fra kjøretidspunktet', () => {
    assert.equal(mod.cutoffDate(NOW).toISOString(), '2025-10-08T03:17:00.000Z')
  })
})
