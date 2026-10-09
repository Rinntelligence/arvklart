// Flytting av eldre bilder inn i boets mappe (supabase/functions/_shared/legacyImages.ts, S2):
// ingen bilder går tapt, alle referanser pekes om, og gamle filer slettes bare når kopien finnes.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './fakeSupabase.js'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/legacyImages.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'
const SECRET = 'x'.repeat(40)
const URL = 'https://p.supabase.co/storage/v1/object/public/item-images/'
const A = '32222222-0000-0000-0000-00000000000a'
const B = '32222222-0000-0000-0000-00000000000b'

const setup = (opts = {}) => fakeSupabase({
  tables: {
    items: [
      { id: 'i1', estate_id: A, image_url: `${URL}items/stol.jpg`, extra_images: [`${URL}items/stol-2.jpg`, `${URL}${A}/ny.jpg`] },
      { id: 'i2', estate_id: A, image_url: `${URL}${A}/allerede.jpg`, extra_images: [] },
      { id: 'i3', estate_id: B, image_url: `${URL}items/delt.jpg`, extra_images: '[]' },
      { id: 'i4', estate_id: B, image_url: 'https://images.unsplash.com/x', extra_images: [] },
    ],
    estates: [{ id: A, branding_logo: `${URL}logos/a.png` }, { id: B, branding_logo: null }],
  },
  storage: { 'item-images': {
    'items/stol.jpg': {}, 'items/stol-2.jpg': {}, 'items/delt.jpg': {}, 'items/foreldrelos.jpg': {},
    'logos/a.png': {}, [`${A}/ny.jpg`]: {}, [`${A}/allerede.jpg`]: {},
  } },
  ...opts,
})
const call = (client, body) => mod.handleMigrateLegacyImages(
  new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': SECRET, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  { secret: SECRET, admin: () => client, log: () => {} })

describe('flytting av eldre bilder', { skip }, () => {
  test('stier: reversible og i boets mappe', () => {
    assert.equal(mod.newPathFor(A, 'items/a-b.jpg'), `${A}/legacy__items__a-b.jpg`)
    assert.equal(mod.oldPathFromCopy(`${A}/legacy__items__a-b.jpg`), 'items/a-b.jpg')
    assert.equal(mod.oldPathFromCopy(`${A}/vanlig.jpg`), null)
    assert.equal(mod.newUrlFor(`${URL}items/a.jpg`, `${A}/legacy__items__a.jpg`), `${URL}${A}/legacy__items__a.jpg`)
  })

  test('uten riktig hemmelighet: ingenting skjer', async () => {
    const { client, mutations } = setup()
    const r = await mod.handleMigrateLegacyImages(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': 'feil' } }), { secret: SECRET, admin: () => client })
    assert.equal(r.status, 401)
    assert.equal(mutations.length, 0)
  })

  test('dry_run teller uten endringer, og copy krever tokenet', async () => {
    const { client, mutations } = setup()
    const dry = await call(client, {})
    assert.equal(dry.status, 200)
    assert.deepEqual([dry.body.references, dry.body.files_to_copy, dry.body.items, dry.body.logos, dry.body.estates], [4, 4, 2, 1, 2])
    assert.equal(mutations.length, 0)
    const wrong = await call(client, { mode: 'copy', confirm: 'feil' })
    assert.equal(wrong.status, 409)
    assert.equal(mutations.length, 0)
  })

  test('copy kopierer, kontrollerer og peker om – uten å slette noe; kan kjøres på nytt', async () => {
    const { client, db, buckets, mutations } = setup()
    const { body: { confirm } } = await call(client, {})
    const r = await call(client, { mode: 'copy', confirm })
    assert.equal(r.status, 200)
    assert.equal(r.body.copied, 4)
    assert.equal(r.body.references_left, 0)
    assert.ok(!mutations.some(m => m.op === 'remove'), 'ingenting skal slettes i copy-steget')
    const files = buckets['item-images']
    for (const old of ['items/stol.jpg', 'items/stol-2.jpg', 'items/delt.jpg', 'logos/a.png']) assert.ok(files.has(old), `gammel fil ${old} skal finnes`)
    const i1 = db.items.find(i => i.id === 'i1')
    assert.equal(i1.image_url, `${URL}${A}/legacy__items__stol.jpg`)
    assert.deepEqual(i1.extra_images, [`${URL}${A}/legacy__items__stol-2.jpg`, `${URL}${A}/ny.jpg`])
    assert.equal(db.items.find(i => i.id === 'i3').image_url, `${URL}${B}/legacy__items__delt.jpg`)
    assert.equal(db.items.find(i => i.id === 'i4').image_url, 'https://images.unsplash.com/x', 'eksterne URL-er røres ikke')
    assert.equal(db.estates.find(e => e.id === A).branding_logo, `${URL}${A}/legacy__logos__a.png`)
    // Ny kjøring: ingenting igjen å flytte
    const again = await call(client, {})
    assert.equal(again.body.references, 0)
  })

  test('feiler en kopi, pekes ikke raden om (bildet er fortsatt synlig via gammel sti)', async () => {
    const { client, db } = setup({ failCopy: (_b, from) => from === 'items/delt.jpg' })
    const { body: { confirm } } = await call(client, {})
    const r = await call(client, { mode: 'copy', confirm })
    assert.equal(r.status, 207)
    assert.equal(r.body.failed, 1)
    assert.equal(db.items.find(i => i.id === 'i3').image_url, `${URL}items/delt.jpg`)
    assert.equal(r.body.references_left, 1)
  })

  test('delete_old sletter bare gamle filer med kopi og uten referanser; foreldreløse røres ikke', async () => {
    const { client, buckets } = setup()
    const { body: { confirm } } = await call(client, {})
    await call(client, { mode: 'copy', confirm })
    const pre = await call(client, { mode: 'delete_old' })
    assert.equal(pre.status, 409)
    assert.equal(pre.body.to_delete, 4)
    const del = await call(client, { mode: 'delete_old', confirm: pre.body.confirm })
    assert.equal(del.body.deleted, 4)
    const files = buckets['item-images']
    assert.ok(!files.has('items/stol.jpg'))
    assert.ok(files.has(`${A}/legacy__items__stol.jpg`))
    assert.ok(files.has('items/foreldrelos.jpg'), 'filer uten kopi skal ikke slettes her')
  })
})
