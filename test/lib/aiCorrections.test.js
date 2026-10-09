// Familiens rettelser av AI-ens identifikasjon (src/lib/aiCorrections.js) og visningen av dem (analysisView.js).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { currentValues, effectiveIdentification, withCorrections } from '../../src/lib/aiCorrections.js'
import { identificationSummary, splitIdentification } from '../../src/lib/analysisView.js'

const F = (value, basis, evidence = '') => ({ value, basis, evidence })
const record = (corrections = {}) => ({
  v: 2, meta: {}, review: {}, valuation: null, corrections,
  ai: { identification: { object_type: F('Tallerken', 'observed'), brand: F('Figgjo', 'observed', 'Stempel'), model: F('Lotte', 'probable', 'Mønster'), manufacturer: null, period: null } },
})
const AT = '2026-10-09T12:00:00.000Z'

describe('rettelser', () => {
  test('skjemaet starter med det som gjelder: rettelse foran AI-forslag, tomt for ukjent', () => {
    const v = currentValues(record({ model: { value: null, by: 'u1', at: AT }, period: { value: '1960-tallet', by: 'u1', at: AT } }))
    assert.equal(v.brand, 'Figgjo')
    assert.equal(v.model, '')
    assert.equal(v.period, '1960-tallet')
    assert.equal(v.material, '')
  })

  test('bare endrede felt lagres, med hvem og når; tomt felt lagres som null; AI-forslaget røres ikke', () => {
    const before = record()
    const next = withCorrections(before, { ...currentValues(before), brand: ' Porsgrund ', model: '' }, 'u1', AT)
    assert.deepEqual(next.corrections, { brand: { value: 'Porsgrund', by: 'u1', at: AT }, model: { value: null, by: 'u1', at: AT } })
    assert.equal(next.ai, before.ai)
    assert.deepEqual(before.corrections, {})
  })

  test('ingen endring gir null; tidligere rettelser beholdes; lange verdier kortes ned', () => {
    const before = record({ period: { value: '1960-tallet', by: 'u2', at: AT } })
    assert.equal(withCorrections(before, currentValues(before), 'u1', AT), null)
    const next = withCorrections(before, { material: 'x'.repeat(300) }, 'u1', AT)
    assert.equal(next.corrections.period.by, 'u2')
    assert.equal(next.corrections.material.value.length, 120)
  })

  test('virker også på en analyse uten corrections (kort i «Legg til flere»)', () => {
    const { corrections, ...draftAnalysis } = record()
    const next = withCorrections(draftAnalysis, { brand: 'Porsgrund' }, 'u1', AT)
    assert.equal(next.corrections.brand.value, 'Porsgrund')
  })
})

describe('visning', () => {
  const r = record({ brand: { value: 'Porsgrund', by: 'u1', at: AT }, model: { value: null, by: 'u1', at: AT } })
  test('effektiv identifikasjon har basis «family» for rettede felt og ingen verdi for fjernede', () => {
    const id = effectiveIdentification(r.ai, r.corrections)
    assert.deepEqual(id.brand, F('Porsgrund', 'family'))
    assert.equal(id.model, null)
    assert.equal(id.object_type.value, 'Tallerken')
  })
  test('rettede felt vises for seg og ikke som AI-forslag eller ukjent', () => {
    const s = splitIdentification(r.ai, r.corrections)
    assert.deepEqual(s.corrected.map(x => [x.field, x.value]), [['brand', 'Porsgrund'], ['model', null]])
    assert.ok(!s.observed.some(x => x.field === 'brand') && !s.probable.some(x => x.field === 'model'))
    assert.ok(!s.unknown.some(l => /^(Merke|Modell|Brand|Model)$/.test(l)))
  })
  test('oppsummeringen bruker rettelsene', () => {
    assert.equal(identificationSummary(r.ai, r.corrections), 'Porsgrund')
    assert.match(identificationSummary(r.ai), /^Figgjo · Lotte/)
  })
})
