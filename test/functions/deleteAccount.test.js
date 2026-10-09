// Kontosletting (supabase/functions/_shared/deleteAccount.ts): eget bo slettes, delte bo beholdes med ny
// administrator og eier, brukeren fjernes fra gjenstander (navn, verdiforslag, stemmer, AI-rettelser), og
// brukeren slettes til slutt.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fakeSupabase } from './fakeSupabase.js'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/deleteAccount.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'
const ME = 'u-me', KARI = 'u-kari', LARS = 'u-lars'
const OWN = 'e-own', SHARED = 'e-shared'

const setup = (opts = {}) => fakeSupabase({
  tables: {
    estates: [{ id: OWN, owner_id: ME }, { id: SHARED, owner_id: ME }],
    estate_members: [
      { estate_id: OWN, user_id: ME, role: 'admin', joined_at: '2026-01-01' },
      { estate_id: SHARED, user_id: ME, role: 'admin', joined_at: '2026-01-01' },
      { estate_id: SHARED, user_id: KARI, role: 'member', joined_at: '2026-02-01' },
      { estate_id: SHARED, user_id: LARS, role: 'member', joined_at: '2026-03-01' },
    ],
    items: [
      { id: 'i-own', estate_id: OWN, added_by: ME, added_by_name: 'Meg', image_url: null, extra_images: [] },
      { id: 'i1', estate_id: SHARED, added_by: ME, added_by_name: 'Meg', image_url: null, extra_images: [],
        value_suggestions: [{ user_id: ME, name: 'Meg', value: 500 }, { user_id: KARI, name: 'Kari', value: 700 }],
        value_voter_ids: [ME, KARI], ai_analysis: { v: 2, corrections: { brand: { value: 'Figgjo', by: ME, at: 'x' }, model: { value: 'Lotte', by: KARI, at: 'y' } } } },
      { id: 'i2', estate_id: SHARED, added_by: KARI, added_by_name: 'Kari', image_url: null, extra_images: [], value_suggestions: null, value_voter_ids: [KARI], ai_analysis: null },
    ],
    interests: [{ id: 1, user_id: ME, item_id: 'i2', reason: 'Min grunn' }, { id: 2, user_id: KARI, item_id: 'i1', reason: 'Hennes' }],
    item_passes: [{ id: 1, user_id: ME, item_id: 'i1' }],
    comments: [{ id: 1, user_id: ME, item_id: 'i2', content: 'Hei' }],
    feedback: [{ id: 1, user_id: ME, estate_id: null, content: 'Fint' }],
    profiles: [{ user_id: ME, display_name: 'Meg' }, { user_id: KARI, display_name: 'Kari' }],
    documents: [], categories: [], tasks: [], heirs: [],
  },
  storage: { 'item-images': {}, 'estate-docs': {} },
  ...opts,
})

describe('kontosletting', { skip }, () => {
  test('eget bo slettes; delt bo beholdes med ny administrator og eier', async () => {
    const { client, db, deletedUsers } = setup()
    const r = await mod.deleteAccountData(client, ME)
    assert.deepEqual(r, { deleted_estates: 1, shared_estates: 1, items_scrubbed: 1 })
    assert.ok(!db.estates.some(e => e.id === OWN), 'eget bo skal være slettet')
    const shared = db.estates.find(e => e.id === SHARED)
    assert.equal(shared.owner_id, KARI, 'eldste medlem blir eier')
    assert.equal(db.estate_members.find(m => m.user_id === KARI).role, 'admin', 'eldste medlem blir administrator')
    assert.deepEqual(deletedUsers, [ME])
  })

  test('brukeren fjernes fra gjenstander i delte bo; andres data er urørt', async () => {
    const { client, db } = setup()
    await mod.deleteAccountData(client, ME)
    const i1 = db.items.find(i => i.id === 'i1')
    assert.equal(i1.added_by_name, null)
    assert.deepEqual(i1.value_suggestions, [{ user_id: null, name: 'Slettet bruker', value: 500 }, { user_id: KARI, name: 'Kari', value: 700 }])
    assert.deepEqual(i1.value_voter_ids, [KARI])
    assert.deepEqual(i1.ai_analysis.corrections, { brand: { value: 'Figgjo', by: null, at: 'x' }, model: { value: 'Lotte', by: KARI, at: 'y' } })
    assert.deepEqual(db.items.find(i => i.id === 'i2').value_voter_ids, [KARI])
  })

  test('ønsker, nei takk, kommentarer, tilbakemeldinger, medlemskap og profil slettes – andres beholdes', async () => {
    const { client, db } = setup()
    await mod.deleteAccountData(client, ME)
    for (const t of ['interests', 'item_passes', 'comments', 'feedback', 'estate_members', 'profiles']) {
      assert.ok(!db[t].some(r => r.user_id === ME), `${t} har fortsatt brukerens rader`)
    }
    assert.equal(db.interests.length, 1)
    assert.equal(db.profiles.length, 1)
  })

  test('feiler slettingen av brukeren, kastes feilen (kan prøves på nytt), og en ny kjøring fullfører', async () => {
    const first = setup({ failDeleteUser: true })
    await assert.rejects(() => mod.deleteAccountData(first.client, ME))
    const { client, db, deletedUsers } = setup()
    await mod.deleteAccountData(client, ME)
    await mod.deleteAccountData(client, ME) // andre kjøring: ingenting igjen, ingen feil
    assert.deepEqual(deletedUsers, [ME, ME])
    assert.ok(!db.estate_members.some(m => m.user_id === ME))
  })

  test('scrubItem: ingen endring når gjenstanden ikke gjelder brukeren', () => {
    assert.equal(mod.scrubItem({ value_suggestions: [{ user_id: KARI }], value_voter_ids: [KARI], ai_analysis: null }, ME), null)
  })
})
