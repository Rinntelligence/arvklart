// Verdianslag v2 (supabase/functions/_shared/valuation.ts): validering av svaret, for lite grunnlag uten
// AI-kall, grunnlaget modellen får, og at koden bare justerer for usikkerhet (ingen faste tilstandsfradrag).
// Edge-koden er TypeScript; Node 22.18+ kjører den direkte. Eldre Node hopper over testene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const val = TS ? await import('../../supabase/functions/_shared/valuation.ts') : null
const an = TS ? await import('../../supabase/functions/_shared/analysis.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const F = (value, basis, evidence = '') => ({ value, basis, evidence })
const analysis = (over = {}) => an.normalizeAnalysis([])({
  suggestion: { title: 'Tallerken', description: '', category: '', category_key: 'kitchen_porcelain', confidence: 'medium' },
  identification: { object_type: F('Tallerken', 'observed'), brand: F('Figgjo', 'observed', 'Stempel'), manufacturer: null, model: F('Lotte', 'probable', 'Mønster'),
    variant: null, material: null, colour: null, period: null, designer_or_artist: null, model_number: null },
  marks: [{ kind: 'stamp', text: 'Figgjo Flint Norway', where: 'Undersiden' }], size_class: 'small',
  condition_suggestion: 'good', condition_observations: ['Små riper'], condition_not_visible: ['Baksiden'], condition_confidence: 'medium',
  multiple_items: { detected: false, count: 0, note: '' }, photo_suggestions: [], search_query: 'Figgjo Lotte',
  ...over,
}).value
const ok = { status: 'ok', low_nok: 200, likely_nok: 300, high_nok: 450, reasoning: 'Vanlig servise.', confidence: 'high', missing: [] }

describe('svaret fra modellen', { skip }, () => {
  test('gyldig anslag godtas; intervall som ikke henger sammen, 0 kr og ugyldig sikkerhet avvises', () => {
    assert.equal(val.validateEstimateV2(ok).ok, true)
    assert.equal(val.validateEstimateV2({ ...ok, low_nok: 500 }).ok, false)
    assert.equal(val.validateEstimateV2({ ...ok, low_nok: 0 }).ok, false)
    assert.equal(val.validateEstimateV2({ ...ok, confidence: 'sure' }).ok, false)
    assert.equal(val.validateEstimateV2({ ...ok, status: 'maybe' }).ok, false)
  })

  test('«for lite grunnlag» godtas uten beløp (aldri 0 kr), med høyst fire tips', () => {
    const r = val.validateEstimateV2({ ...ok, status: 'insufficient', low_nok: 0, likely_nok: 0, high_nok: 0, missing: ['a', 'b', 'c', 'd', 'e'] })
    assert.equal(r.ok, true)
    assert.equal(r.value.status, 'insufficient')
    assert.ok(!('likely' in r.value))
    assert.equal(r.value.missing.length, 4)
  })
})

describe('for lite grunnlag uten AI-kall', { skip }, () => {
  test('samleord eller for kort navn uten beskrivelse og analyse gir tips på riktig språk', () => {
    assert.equal(val.insufficientWithoutCall('Ting', '', null).length, 3)
    assert.match(val.insufficientWithoutCall('ab', '', null, true)[0], /specific name/)
  })
  test('nok grunnlag: konkret navn, beskrivelse eller analyse', () => {
    assert.equal(val.insufficientWithoutCall('Gyngestol i eik', '', null), null)
    assert.equal(val.insufficientWithoutCall('Ting', 'Liten messinglysestake fra 1950-tallet', null), null)
    assert.equal(val.insufficientWithoutCall('Ting', '', analysis()), null)
  })
})

describe('grunnlaget modellen får', { skip }, () => {
  test('brukerens registrering først, så analysen merket sett/sannsynlig; ukjent tilstand sies rett ut', () => {
    const text = val.describeItem({ title: 'Mormors tallerken', description: '', category: 'Kjøkken', condition: null, purchasePrice: null, purchaseYear: null, identifiedModel: '' }, analysis(), null)
    assert.match(text, /^Item \(as registered by the family\): Mormors tallerken/)
    assert.match(text, /Condition \(as registered\): unknown \(not assessed\)/)
    assert.match(text, /Brand: Figgjo \(read directly from the item\)/)
    assert.match(text, /Model: Lotte \(probable, inferred\)/)
    assert.match(text, /Mark \(stamp\): Figgjo Flint Norway, Undersiden/)
    assert.ok(!/Manufacturer:/.test(text), 'ukjente felt skal ikke med')
  })
  test('kjøpspris gir et holdepunkt, ikke et tak', () => {
    const text = val.describeItem({ title: 'TV', description: '', category: '', condition: 'good', purchasePrice: 8000, purchaseYear: 2018, identifiedModel: '' }, null, 1200)
    assert.match(text, /about 1200 NOK; a rough reference point only, not a cap/)
  })
  test('veiledning om tilstand avhenger av typen gjenstand, uten prosentsatser', () => {
    assert.match(val.conditionGuidance('furniture'), /condition and function usually matter a lot/)
    assert.match(val.conditionGuidance('art'), /matter more than light wear/)
    for (const k of ['furniture', 'art', 'documents_memorabilia', 'other']) assert.ok(!/%/.test(val.conditionGuidance(k)), k)
  })
})

describe('usikkerhet, ikke fradrag', { skip }, () => {
  const e = { low: 200, likely: 300, high: 450, confidence: 'high' }

  test('kjent tilstand og identifisert gjenstand: anslaget står urørt', () => {
    const r = val.finalizeEstimate(e, { condition: 'good', analysis: analysis(), hasDescription: false })
    assert.deepEqual([r.low, r.likely, r.high, r.confidence], [200, 300, 450, 'high'])
    assert.deepEqual(r.identified, ['brand', 'model'])
    assert.equal(r.uncertainty.widened, false)
  })

  test('ukjent tilstand: bredere intervall og høyst middels sikkerhet, men sannsynlig verdi er den samme', () => {
    const r = val.finalizeEstimate(e, { condition: null, analysis: analysis(), hasDescription: false })
    assert.deepEqual([r.low, r.likely, r.high], [160, 300, 540])
    assert.equal(r.confidence, 'medium')
    assert.ok(r.uncertainty.reasons.includes('condition_unknown'))
  })

  test('ikke identifisert: høyst middels; flere gjenstander eller lite informasjon: lav', () => {
    const plain = analysis({ identification: {} })
    assert.equal(val.finalizeEstimate(e, { condition: 'good', analysis: plain, hasDescription: true }).confidence, 'medium')
    const many = analysis({ multiple_items: { detected: true, count: 4, note: '' } })
    assert.equal(val.finalizeEstimate(e, { condition: 'good', analysis: many, hasDescription: true }).confidence, 'low')
    assert.equal(val.finalizeEstimate(e, { condition: 'good', analysis: null, hasDescription: false }).confidence, 'low')
  })

  test('svært bredt intervall gir lav sikkerhet', () => {
    const r = val.finalizeEstimate({ low: 100, likely: 300, high: 900, confidence: 'high' }, { condition: 'good', analysis: analysis(), hasDescription: true })
    assert.equal(r.confidence, 'low')
    assert.ok(r.uncertainty.reasons.includes('wide_range'))
  })
})

describe('skjema', { skip }, () => {
  test('alle felt påkrevd og additionalProperties: false', () => {
    const s = val.ESTIMATE_SCHEMA_V2
    assert.equal(s.additionalProperties, false)
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort())
  })
})

describe('familiens rettelser i anslaget', { skip }, () => {
  const facts = { title: 'Tallerken', description: '', category: '', condition: 'good', purchasePrice: null, purchaseYear: null, identifiedModel: '' }
  test('rettede felt sendes som bekreftet av familien, og fjernede AI-forslag sendes ikke', () => {
    const { analysis: a } = an.applyCorrections(analysis(), { brand: { value: 'Porsgrund' }, model: { value: null } })
    const text = val.describeItem(facts, a, null)
    assert.match(text, /Brand: Porsgrund \(confirmed by the family\)/)
    assert.doesNotMatch(text, /Figgjo \(read|Lotte/)
  })
  test('rettede felt regnes som identifisert; fjernet merke uten annen identifikasjon gir «ikke identifisert»', () => {
    const e = { low: 200, likely: 300, high: 450, confidence: 'high' }
    const plain = analysis({ identification: {} })
    const fixed = an.applyCorrections(plain, { designer_or_artist: { value: 'Arne Jacobsen' } }).analysis
    assert.deepEqual(val.finalizeEstimate(e, { condition: 'good', analysis: fixed, hasDescription: true }).identified, ['designer_or_artist'])
    const removed = an.applyCorrections(analysis(), { brand: { value: null }, model: { value: null } }).analysis
    assert.ok(val.finalizeEstimate(e, { condition: 'good', analysis: removed, hasDescription: true }).uncertainty.reasons.includes('not_identified'))
  })
})
