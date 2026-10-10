// M2-A: leverandøruavhengig adapter (supabase/functions/_shared/marketProviders.ts) med en simulert leverandør
// og simulerte markedsdata. Ingen ekte kilder. Node 22.18+ kjører TypeScript direkte; eldre Node hopper over.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const mp = TS ? await import('../../supabase/functions/_shared/marketProviders.ts') : null
const m = TS ? await import('../../supabase/functions/_shared/market.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

// Simulerte avsluttede annonser for «Figgjo Lotte tallerken»
const LISTINGS = [
  { title: 'Figgjo Lotte tallerken', price: 250, price_type: 'sold_price', date: '2026-09-02', url: 'https://kilde.test/1' },
  { title: 'Figgjo Lotte tallerken flat', price: 300, price_type: 'sold_price', date: '2026-09-10', url: 'https://kilde.test/2' },
  { title: 'Figgjo Lotte tallerken', price: 280, price_type: 'sold_price', date: '2026-09-21', url: 'https://kilde.test/3' },
  { title: 'Figgjo Lotte tallerken', price: 280, price_type: 'sold_price', date: '2026-09-21', url: 'https://kilde.test/3?ref=x' }, // duplikat
  { title: 'Figgjo Lotte tallerken – deler', price: 20, price_type: 'sold_price', date: '2026-09-22', url: 'https://kilde.test/4' }, // deler
  { title: 'Figgjo Lotte tallerken 6 stk', price: 1500, price_type: 'sold_price', date: '2026-09-23', url: 'https://kilde.test/5' }, // flere i én
  { title: 'Figgjo Lotte tallerken', price: 2400, price_type: 'sold_price', date: '2026-09-30', url: 'https://kilde.test/6' }, // avvik
  { title: '', price: 100, price_type: 'sold_price' }, // ugyldig
]
const fake = (over = {}) => ({ id: 'simulert', label: 'Simulert kilde', attribution: 'Data fra simulert kilde', canStore: false, soldPricesVerified: true,
  search: async () => LISTINGS, ...over })

describe('adapteren', { skip }, () => {
  test('ingen kilder er koblet på: ingen kall, ingen referanser', async () => {
    assert.deepEqual(mp.configuredProviders(), [])
    assert.deepEqual(await mp.fetchReferences(mp.configuredProviders(), ['Figgjo Lotte']), { references: [], errors: [], calls: 0 })
  })
  test('referansene merkes med leverandøren; ugyldige forkastes; høyst maxCalls kall', async () => {
    let n = 0
    const r = await mp.fetchReferences([fake({ search: async () => { n++; return LISTINGS } })], ['a', 'b', 'c'], { maxCalls: 2 })
    assert.equal(n, 2)
    assert.equal(r.calls, 2)
    assert.ok(r.references.every(x => x.provider === 'simulert' && x.title))
    assert.equal(r.references.length, 14)
  })
  test('«verified» bare når kilden bekrefter salgspriser', async () => {
    const yes = await mp.fetchReferences([fake()], ['q'])
    const no = await mp.fetchReferences([fake({ soldPricesVerified: false })], ['q'])
    assert.ok(yes.references.every(x => x.verified))
    assert.ok(no.references.every(x => !x.verified))
  })
  test('en kilde som feiler eller er treg, stopper ikke de andre', async () => {
    const broken = fake({ id: 'feil', search: async () => { throw new Error('503') } })
    const slow = fake({ id: 'treg', search: () => new Promise(res => setTimeout(() => res(LISTINGS), 500)) })
    const r = await mp.fetchReferences([broken, slow, fake()], ['q'], { timeoutMs: 50, maxCalls: 3 })
    assert.deepEqual(r.errors.map(e => e.provider), ['feil', 'treg'])
    assert.ok(r.references.length > 0 && r.references.every(x => x.provider === 'simulert'))
  })
})

describe('simulerte markedsdata gjennom markedsmotoren', { skip }, () => {
  const identity = () => ({ maker: 'Figgjo', model: 'Lotte', type: 'Tallerken', material: null, period: null, makerReliable: true, modelReliable: true })
  test('deler, flere i én og duplikater utelukkes; avvik markeres; bekreftede salgspriser går foran familiens', async () => {
    const { references } = await mp.fetchReferences([fake()], ['Figgjo Lotte tallerken'], { maxCalls: 1 })
    const family = [{ provider: 'user', url: null, title: 'Fra familien', price: 900, currency: 'NOK', price_type: 'sold_price', date: null, verified: false },
      { provider: 'user', url: null, title: 'Fra familien 2', price: 950, currency: 'NOK', price_type: 'sold_price', date: null, verified: false },
      { provider: 'user', url: null, title: 'Fra familien 3', price: 1000, currency: 'NOK', price_type: 'sold_price', date: null, verified: false }]
    const scored = m.matchAndFilter([...family, ...references], identity())
    const result = m.compute(scored, 'precise')
    assert.equal(result.group, 'sold_verified', 'salgspriser bekreftet av kilden brukes først')
    assert.deepEqual(scored.filter(r => r.excluded_reason).map(r => r.excluded_reason).sort(), ['duplicate', 'multiple_items', 'not_comparable'])
    assert.ok(result.references.find(r => r.price === 2400).flags.includes('deviates'), 'avviket markeres, ikke fjernes')
    assert.ok(result.references.filter(r => r.provider === 'user').every(r => !r.used), 'familiens priser blandes ikke inn')
    assert.match(m.explain(result), /solgte, sammenlignbare gjenstander/)
    assert.equal(result.confidence, 'low', 'avvik gir lav sikkerhet')
  })
})
