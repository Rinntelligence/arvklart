// Filsletting for bo (supabase/functions/_shared/estateFiles.ts): paginering, endringer underveis og feil.
// Edge-koden er TypeScript; Node 22.18+ kjører den direkte. Eldre Node hopper over testene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase, manyFiles } from './fakeSupabase.js'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/estateFiles.ts') : null
const EST = '32222222-0000-0000-0000-000000000001'
const OTHER = '32222222-0000-0000-0000-000000000002'
const URL = 'https://p.supabase.co/storage/v1/object/public/item-images/'

const estateTables = (extra = {}) => ({
  estates: [{ id: EST, status: 'closed' }, { id: OTHER, status: 'active' }],
  items: [], documents: [], feedback: [], ...extra,
})
const left = (fake, bucket, prefix) => [...fake.buckets[bucket].keys()].filter(p => p.startsWith(prefix))

describe('removeEstateFiles', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  for (const n of [1500, 2500]) {
    test(`sletter alle ${n} filer i boets mappe`, async () => {
      const fake = fakeSupabase({ tables: estateTables(), storage: { 'item-images': { ...manyFiles(EST, n), ...manyFiles(OTHER, 5) }, 'estate-docs': manyFiles(`documents/${EST}`, 3) } })
      await mod.removeEstateFiles(fake.client, EST)
      assert.equal(left(fake, 'item-images', EST).length, 0)
      assert.equal(left(fake, 'estate-docs', `documents/${EST}`).length, 0)
      assert.equal(left(fake, 'item-images', OTHER).length, 5, 'andre bo røres ikke')
    })
  }

  test('ingen filer hoppes over når mappen endres under listingen', async () => {
    let changed = false
    const fake = fakeSupabase({
      tables: estateTables(),
      storage: { 'item-images': manyFiles(EST, 2500), 'estate-docs': {} },
      // Etter første side: én tidligere fil forsvinner (alt forskyves én plass) og en ny kommer til
      onList: ({ bucket, folder, offset, files }) => {
        if (bucket === 'item-images' && folder === EST && offset === 1000 && !changed) {
          changed = true
          files.delete(`${EST}/f00010.jpg`)
          files.set(`${EST}/ny-under-kjoring.jpg`, {})
        }
      },
    })
    await mod.removeEstateFiles(fake.client, EST)
    assert.ok(changed)
    assert.deepEqual(left(fake, 'item-images', EST), [])
  })

  test('refererte eldre bilder (items/) og logo slettes, urefererte eldre bilder blir liggende', async () => {
    const fake = fakeSupabase({
      tables: estateTables({
        items: [{ id: 1, estate_id: EST, image_url: URL + 'items/a.jpg', extra_images: JSON.stringify([URL + `${EST}/b.jpg`]) },
          { id: 2, estate_id: EST, image_url: 'https://images.unsplash.com/x.jpg', extra_images: [] }],
      }),
      storage: { 'item-images': { 'items/a.jpg': {}, 'items/annen-eier.jpg': {}, [`${EST}/b.jpg`]: {}, 'logos/l.png': {} }, 'estate-docs': {} },
    })
    fake.db.estates[0].branding_logo = URL + 'logos/l.png'
    await mod.removeEstateFiles(fake.client, EST)
    assert.deepEqual([...fake.buckets['item-images'].keys()], ['items/annen-eier.jpg'])
  })

  test('kaster feil når filer ikke lar seg slette, etter et begrenset antall forsøk', async () => {
    const fake = fakeSupabase({
      tables: estateTables(), storage: { 'item-images': manyFiles(EST, 10), 'estate-docs': {} },
      failRemove: (_b, p) => (p.endsWith('f00003.jpg') ? 'silent' : false),
    })
    await assert.rejects(() => mod.removeEstateFiles(fake.client, EST), /1 filer står igjen/)
    assert.equal(fake.mutations.filter(m => m.op === 'remove').length, 3, 'tre runder, så gir den opp')
  })
})

describe('deleteEstate', { skip: !TS && 'Node uten TypeScript-støtte' }, () => {
  test('sletter filer, tilbakemeldinger knyttet til boet og boet – ikke andres tilbakemeldinger', async () => {
    const fake = fakeSupabase({
      tables: estateTables({
        items: [{ id: 1, estate_id: EST, image_url: null, extra_images: [] }],
        feedback: [{ id: 1, estate_id: EST, content: 'om boet' }, { id: 2, estate_id: OTHER, content: 'annet bo' }, { id: 3, estate_id: null, content: 'generell' }],
      }),
      storage: { 'item-images': manyFiles(EST, 3), 'estate-docs': {} },
    })
    await mod.deleteEstate(fake.client, EST)
    assert.deepEqual(fake.db.estates.map(e => e.id), [OTHER])
    assert.deepEqual(fake.db.feedback.map(f => f.id), [2, 3])
    assert.equal(fake.db.items.length, 0)
    assert.equal(left(fake, 'item-images', EST).length, 0)
  })

  test('feiler filslettingen, står boet og tilbakemeldingene igjen', async () => {
    const fake = fakeSupabase({
      tables: estateTables({ feedback: [{ id: 1, estate_id: EST, content: 'x' }] }),
      storage: { 'item-images': manyFiles(EST, 3), 'estate-docs': {} },
      failRemove: () => 'error',
    })
    await assert.rejects(() => mod.deleteEstate(fake.client, EST))
    assert.equal(fake.db.estates.length, 2)
    assert.equal(fake.db.feedback.length, 1)
  })
})
