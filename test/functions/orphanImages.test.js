// Manuell opprydding av foreldreløse bilder (supabase/functions/_shared/orphanImages.ts): standard dry_run,
// 30 dagers grense, bekreftelsestoken og at refererte filer og eksisterende bo aldri røres.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './fakeSupabase.js'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/orphanImages.ts') : null
const SECRET = 'b'.repeat(40)
const NOW = new Date('2026-10-08T12:00:00Z')
const LIVE = '22222222-0000-0000-0000-000000000001'  // eksisterende bo
const GONE = '22222222-0000-0000-0000-000000000009'  // bo som er slettet, filer ligger igjen
const URL = 'https://p.supabase.co/storage/v1/object/public/item-images/'
const OLD = { created_at: '2026-08-01T00:00:00Z', size: 1000 }   // 68 dager
const NEW = { created_at: '2026-09-20T00:00:00Z', size: 1000 }   // 18 dager

const setup = () => fakeSupabase({
  tables: {
    estates: [{ id: LIVE, branding_logo: URL + 'logos/live-logo.png' }],
    items: [{ id: 1, estate_id: LIVE, image_url: URL + 'items/referert.jpg', extra_images: JSON.stringify([URL + 'items/referert%202.jpg']) }],
    cleanup_runs: [],
  },
  storage: {
    'item-images': {
      'items/referert.jpg': OLD, 'items/referert 2.jpg': OLD,        // refereres → aldri
      'items/foreldrelos-1.jpg': OLD, 'items/foreldrelos-2.jpg': OLD, // kandidater
      'items/ny-foreldrelos.jpg': NEW,                                // under 30 dager → ikke ennå
      'logos/live-logo.png': OLD, 'logos/gammel-logo.png': OLD,       // logo i bruk / kandidat
      [`${LIVE}/ureferert.jpg`]: OLD,                                 // eksisterende bos mappe → aldri
      [`${GONE}/rest.jpg`]: OLD,                                      // slettet bo → kandidat
    },
  },
})
const CANDIDATES = ['items/foreldrelos-1.jpg', 'items/foreldrelos-2.jpg', 'logos/gammel-logo.png', `${GONE}/rest.jpg`]
const req = (body, headers = { 'x-cron-secret': SECRET }) =>
  new Request('https://x/functions/v1/cleanup-orphan-images', { method: 'POST', headers, body: body ? JSON.stringify(body) : undefined })
const call = (fake, body, headers) => mod.handleCleanupOrphanImages(req(body, headers), { secret: SECRET, admin: () => fake.client, now: NOW, log: () => {} })

describe('foreldreløse bilder', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  test('finner bare urefererte filer eldre enn 30 dager utenfor eksisterende bo', async () => {
    const files = await mod.findOrphanImages(setup().client, NOW)
    assert.deepEqual(files.map(f => f.path), [...CANDIDATES].sort())
  })

  test('uten body er det dry_run: ingen sideeffekter, ingen filstier i svaret', async () => {
    const fake = setup()
    const r = await call(fake)
    assert.equal(r.status, 200)
    assert.equal(r.body.dry_run, true)
    assert.equal(r.body.count, 4)
    assert.equal(r.body.total_bytes, 4000)
    assert.deepEqual(r.body.by_folder, { items: 2, logos: 1, '<slettet bo>': 1 })
    assert.match(r.body.confirm, /^[0-9a-f]{64}$/)
    assert.deepEqual(fake.mutations, [])
    assert.ok(!JSON.stringify(r.body).match(/foreldrelos|gammel-logo|\.jpg|\.png/))
  })

  test('sletting uten eller med feil token avvises (409), ingenting slettes', async () => {
    for (const confirm of [undefined, 'feil', '0'.repeat(64)]) {
      const fake = setup()
      const r = await call(fake, { dry_run: false, confirm })
      assert.equal(r.status, 409)
      assert.deepEqual(fake.mutations, [])
    }
  })

  test('sletting med token fra dry_run sletter akkurat kandidatene og logger kjøringen', async () => {
    const fake = setup()
    const { body: dry } = await call(fake)
    const r = await call(fake, { dry_run: false, confirm: dry.confirm })
    assert.equal(r.status, 200)
    assert.equal(r.body.deleted, 4)
    const left = [...fake.buckets['item-images'].keys()].sort()
    assert.deepEqual(left, ['items/ny-foreldrelos.jpg', 'items/referert 2.jpg', 'items/referert.jpg', 'logos/live-logo.png', `${LIVE}/ureferert.jpg`].sort())
    assert.equal(fake.db.cleanup_runs[0].status, 'ok')
    assert.equal(fake.db.cleanup_runs[0].deleted_count, 4)
  })

  test('endres listen etter dry_run (en fil blir referert), avvises slettingen', async () => {
    const fake = setup()
    const { body: dry } = await call(fake)
    fake.db.items.push({ id: 2, estate_id: LIVE, image_url: URL + 'items/foreldrelos-1.jpg', extra_images: [] })
    const r = await call(fake, { dry_run: false, confirm: dry.confirm })
    assert.equal(r.status, 409)
    assert.ok(fake.buckets['item-images'].has('items/foreldrelos-1.jpg'))
  })

  test('krever x-cron-secret', async () => {
    const r = await mod.handleCleanupOrphanImages(req(undefined, {}), { secret: SECRET, admin: () => { throw new Error('nei') }, now: NOW })
    assert.equal(r.status, 401)
  })
})
