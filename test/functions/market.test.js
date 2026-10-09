// Markedsmotoren (supabase/functions/_shared/market.ts): søk, matching og filtrering, beregning og forklaring,
// med faste testdata. Edge-koden er TypeScript; Node 22.18+ kjører den direkte. Eldre Node hopper over testene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const m = TS ? await import('../../supabase/functions/_shared/market.ts') : null
const an = TS ? await import('../../supabase/functions/_shared/analysis.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const F = (value, basis) => ({ value, basis, evidence: '' })
const analysis = (identification) => an.normalizeAnalysis([])({
  suggestion: { title: 'x', description: '', category: '', category_key: 'other', confidence: 'medium' },
  identification, marks: [], size_class: 'small', condition_suggestion: 'good', condition_observations: [], condition_not_visible: [],
  condition_confidence: 'medium', multiple_items: { detected: false, count: 0, note: '' }, photo_suggestions: [], search_query: 'Figgjo Lotte tallerken',
}).value
const figgjo = () => analysis({ object_type: F('Tallerken', 'observed'), brand: F('Figgjo', 'observed'), model: F('Lotte', 'probable'), material: F('Flint', 'probable') })
const ref = (title, price, over = {}) => ({ provider: 'tradera', url: null, title, price, currency: 'NOK', price_type: 'sold_price', date: '2026-09-14', verified: true, ...over })

describe('søk', { skip }, () => {
  test('presist søk bare når merke og modell er lest eller bekreftet; ellers bredt', () => {
    const probable = m.identityOf(figgjo())
    assert.equal(m.specificityOf(probable), 'broad')
    assert.deepEqual(m.buildQueries(probable, 'Figgjo Lotte tallerken'), ['Figgjo Tallerken Flint', 'Figgjo Lotte tallerken'])
    const confirmed = m.identityOf(an.applyCorrections(figgjo(), { model: { value: 'Lotte' } }).analysis)
    assert.equal(m.specificityOf(confirmed), 'precise')
    assert.deepEqual(m.buildQueries(confirmed), ['Figgjo Lotte Tallerken', 'Figgjo Tallerken'])
  })
  test('uten merke og modell: generisk søk på type, materiale og periode', () => {
    const i = m.identityOf(analysis({ object_type: F('Gyngestol', 'observed'), material: F('Eik', 'probable'), period: F('1950-tallet', 'probable') }))
    assert.equal(m.specificityOf(i), 'generic')
    assert.equal(m.buildQueries(i)[0], 'Gyngestol Eik 1950-tallet')
  })
  test('uten analyse brukes navnet; søkelenkene går til FINN og Tradera', () => {
    assert.deepEqual(m.buildQueries(m.identityOf(null, 'Gammel symaskin')), ['Gammel symaskin'])
    const links = m.searchLinks('Figgjo Lotte')
    assert.equal(links[0].url, 'https://www.finn.no/recommerce/forsale/search?q=Figgjo%20Lotte')
    assert.equal(links[1].provider, 'tradera')
  })
})

describe('matching og filtrering', { skip }, () => {
  const i = () => m.identityOf(figgjo())
  test('samsvar: merke og type teller mest; bøyde former godtas', () => {
    const s = m.scoreMatch('Figgjo Lotte tallerkener', i())
    assert.deepEqual(s.reasons, ['maker', 'model', 'type'])
    assert.equal(s.match, 0.89)
    assert.equal(m.scoreMatch('Porsgrund tallerken', i()).makerMatched, false)
  })
  test('deler, defekt, ønskes kjøpt, leie, bytte og flere i én annonse utelukkes', () => {
    for (const t of ['Figgjo Lotte tallerken - deler', 'Defekt Figgjo tallerken', 'Figgjo Lotte ønskes kjøpt', 'Figgjo tallerken byttes', 'Samling Figgjo tallerkener', 'Figgjo Lotte tallerken 6 stk', 'Figgjo tallerken leie'])
      assert.ok(m.exclusionReason(t), `ikke utelukket: ${t}`)
    for (const t of ['Figgjo Lotte tallerken', 'Figgjo Lotte tallerken 1 stk']) assert.equal(m.exclusionReason(t), null, t)
  })
  test('duplikater (samme lenke eller samme tittel og pris), feil valuta, svakt samsvar og annet merke tas ikke med', () => {
    const out = m.matchAndFilter([
      ref('Figgjo Lotte tallerken', 300, { url: 'https://x.no/1?ref=a' }),
      ref('Figgjo Lotte tallerken stor', 320, { url: 'https://x.no/1' }),
      ref('Figgjo Lotte tallerken', 300),
      ref('Figgjo Lotte tallerken', 300, { currency: 'SEK', title: 'Figgjo Lotte tallerken blå' }),
      ref('Kaffekopp', 100),
      ref('Porsgrund tallerken flint', 200),
    ], i())
    assert.deepEqual(out.map(r => r.excluded_reason), [null, 'duplicate', 'duplicate', 'currency', 'weak_match', 'weak_match'])
  })
  test('familiens egne sammenligninger regnes som gode og vurderes ikke mot ordlisten', () => {
    const out = m.matchAndFilter([ref('Samling Figgjo', 900, { provider: 'user', verified: false }), ref('Noe helt annet', 50, { provider: 'user', verified: false })], i())
    assert.deepEqual(out.map(r => r.excluded_reason), [null, null])
  })
})

describe('beregning', { skip }, () => {
  const i = () => m.identityOf(figgjo())
  const run = (refs, spec = 'broad') => m.compute(m.matchAndFilter(refs, i()), spec)
  const sold = (prices, over = {}) => prices.map((p, n) => ref(`Figgjo Lotte tallerken ${n}`, p, { url: `https://t.se/${n}`, ...over }))

  test('3–7 treff: spenn i treffene (lavest–høyest) og median, ikke et statistisk intervall', () => {
    const r = run(sold([200, 300, 450, 500]))
    assert.equal(r.status, 'ok')
    assert.equal(r.range_kind, 'hits')
    assert.deepEqual(r.estimate, { low: 200, likely: 380, high: 500 })
    assert.equal(r.stats.p25, null)
    assert.equal(r.confidence, 'medium')
  })
  test('8 treff eller flere: 25.–75. persentil', () => {
    const r = run(sold([300, 400, 500, 600, 700, 800, 900, 1000]))
    assert.equal(r.range_kind, 'p25_p75')
    assert.deepEqual(r.estimate, { low: 480, likely: 650, high: 830 })
    assert.equal(r.confidence, 'high')
  })
  test('under 3 gode treff: ingen markedsverdi, treffene er eksempler', () => {
    const r = run(sold([300, 400]))
    assert.equal(r.status, 'insufficient')
    assert.equal(r.estimate, null)
    assert.equal(r.references.length, 2)
  })
  test('solgte priser går foran annonsepriser; nypris er aldri en verdi', () => {
    const r = run([...sold([300, 350, 400]), ...sold([900, 950, 1000], { price_type: 'asking_price', url: null, title: 'Figgjo Lotte tallerken annonse' }).map((x, n) => ({ ...x, title: `${x.title} ${n}` })),
      ref('Figgjo Lotte tallerken ny', 2000, { price_type: 'new_price' })])
    assert.equal(r.method, 'market_sold')
    assert.equal(r.price_type, 'sold_price')
    assert.deepEqual(r.references.filter(x => x.used).map(x => x.price), [300, 350, 400])
    assert.ok(r.reasons.includes('sold_asking_spread'), 'stort sprik skal gi lav sikkerhet')
    assert.equal(r.confidence, 'low')
    const onlyNew = run([1, 2, 3].map(n => ref(`Figgjo Lotte tallerken ${n}`, 2000 + n, { price_type: 'new_price' })))
    assert.equal(onlyNew.status, 'insufficient')
  })
  test('bare annonsepriser: merket, og sikkerheten høyst middels', () => {
    const r = run(sold([300, 400, 500, 600, 700, 800, 900, 1000], { price_type: 'asking_price', verified: false }))
    assert.equal(r.method, 'market_asking')
    assert.equal(r.confidence, 'medium')
    assert.match(m.explain(r), /Annonsepriser – faktisk salgspris er ofte lavere/)
  })
  test('salgspriser bekreftet av en kilde holdes atskilt fra dem familien oppgir', () => {
    const r = run([...sold([300, 320, 340]), ...sold([5000, 6000, 7000], { provider: 'user', verified: false }).map((x, n) => ({ ...x, url: `https://u/${n}` }))])
    assert.equal(r.group, 'sold_verified')
    assert.deepEqual(r.references.filter(x => x.used).map(x => x.provider), ['tradera', 'tradera', 'tradera'])
    const fam = run(sold([5000, 6000, 7000], { provider: 'user', verified: false }))
    assert.equal(fam.group, 'sold_reported')
    assert.match(m.explain(fam), /3 salgspriser oppgitt av familien/)
    assert.ok(fam.reasons.includes('family_reported'))
  })
  test('treff som skiller seg ut markeres og beholdes, og gir lav sikkerhet', () => {
    const r = run(sold([300, 320, 340, 360, 5000]))
    assert.equal(r.stats.n_used, 5)
    assert.deepEqual(r.references.filter(x => x.flags.includes('deviates')).map(x => x.price), [5000])
    assert.equal(r.confidence, 'low')
    assert.match(m.explain(r), /1 av treffene skiller seg mye ut/)
  })
  test('generisk samsvar gir høyst middels sikkerhet og sies i forklaringen', () => {
    const r = run(sold([300, 400, 500, 600, 700, 800, 900, 1000]), 'generic')
    assert.equal(r.confidence, 'medium')
    assert.match(m.explain(r, true), /not identified by brand/)
  })
  test('forklaringen: periode, spenn og median på brukerens språk', () => {
    const r = run(sold([200, 300, 450, 500]).map((x, n) => ({ ...x, date: ['2026-09-01', '2026-09-20', '2026-10-02', '2026-10-05'][n] })))
    assert.match(m.explain(r), /^Basert på 4 solgte, sammenlignbare gjenstander \(sep\.? 2026 – okt\.? 2026\)\. Spenn i 4 treff: 200 kr–500 kr, median 375 kr\./)
    assert.match(m.explain(r, true), /^Based on 4 sold, comparable items/)
  })
})

describe('familiens sammenligninger fra lagringen', { skip }, () => {
  test('gyldige felt leses; ugyldig pris, type eller lenke forkastes; høyst ti', () => {
    const refs = m.readUserReferences([
      { title: ' Figgjo Lotte, FINN ', price: '450', price_type: 'sold_price', url: 'https://www.finn.no/1', date: '2026-09-01', by: 'u1' },
      { title: 'Uten pris', price: 0, price_type: 'sold_price' },
      { title: 'Feil type', price: 10, price_type: 'estimate' },
      { title: 'Rar lenke', price: 10, price_type: 'asking_price', url: 'javascript:alert(1)', date: '1. sept' },
    ])
    assert.equal(refs.length, 2)
    assert.deepEqual(refs[0], { provider: 'user', url: 'https://www.finn.no/1', title: 'Figgjo Lotte, FINN', price: 450, currency: 'NOK', price_type: 'sold_price', date: '2026-09-01', verified: false })
    assert.equal(refs[1].url, null)
    assert.equal(refs[1].date, null)
    assert.equal(m.readUserReferences(Array.from({ length: 15 }, (_, n) => ({ title: `t${n}`, price: 1, price_type: 'asking_price' }))).length, 10)
    assert.deepEqual(m.readUserReferences('tull'), [])
  })
})
