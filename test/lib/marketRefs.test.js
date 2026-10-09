// Familiens egne sammenligninger (src/lib/marketRefs.js): validering, lagring i ai_analysis og søkefrasen.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { emptyRecord, familyReferences, marketQuery, searchLinks, withReference, withoutReference, MAX_REFERENCES } from '../../src/lib/marketRefs.js'

const AT = '2026-10-09T12:00:00.000Z'
const ok = { title: ' Figgjo Lotte, FINN ', price: '1 200 kr', price_type: 'sold_price', url: 'https://www.finn.no/1', date: '2026-09-14' }

describe('sammenligninger', () => {
  test('gyldig sammenligning legges til med hvem og når, også på en gjenstand uten analyse', () => {
    const { record } = withReference(null, ok, 'u1', { at: AT, id: 'r1' })
    assert.equal(record.ai, null)
    assert.deepEqual(familyReferences(record), [{ id: 'r1', title: 'Figgjo Lotte, FINN', price: 1200, price_type: 'sold_price', url: 'https://www.finn.no/1', date: '2026-09-14', by: 'u1', at: AT }])
  })
  test('rettelser og AI-forslag beholdes; lenke og dato er valgfrie', () => {
    const before = { ...emptyRecord(), ai: { identification: {} }, corrections: { brand: { value: 'Figgjo' } } }
    const { record } = withReference(before, { ...ok, url: '', date: '' }, 'u1', { at: AT, id: 'r2' })
    assert.equal(record.corrections.brand.value, 'Figgjo')
    assert.equal(record.ai, before.ai)
    assert.equal(familyReferences(record)[0].url, null)
    assert.equal(familyReferences(record)[0].date, null)
  })
  test('manglende tittel, pris 0 eller tekst, ukjent type, rar lenke og for mange gir en melding', () => {
    for (const bad of [{ title: '' }, { price: '0' }, { price: 'mye' }, { price_type: 'estimate' }, { url: 'javascript:alert(1)' }, { date: '14.09.2026' }])
      assert.ok(withReference(null, { ...ok, ...bad }, 'u1').error, JSON.stringify(bad))
    let rec = null
    for (let i = 0; i < MAX_REFERENCES; i++) rec = withReference(rec, ok, 'u1', { id: `r${i}` }).record
    assert.ok(withReference(rec, ok, 'u1').error)
  })
  test('fjerning tar bare den ene', () => {
    let rec = withReference(null, ok, 'u1', { id: 'a' }).record
    rec = withReference(rec, ok, 'u1', { id: 'b' }).record
    assert.deepEqual(familyReferences(withoutReference(rec, 'a')).map(r => r.id), ['b'])
  })
})

describe('søkefrase og lenker', () => {
  const F = (value, basis = 'observed') => ({ value, basis, evidence: '' })
  test('merke og modell (med familiens rettelser) og type; ellers AI-ens søkefrase; ellers navnet', () => {
    const rec = { ai: { search_query: 'blå tallerken', identification: { brand: F('Figgjo'), model: F('Lotte', 'probable'), object_type: F('Tallerken') } }, corrections: { model: { value: 'Market' } } }
    assert.equal(marketQuery(rec), 'Figgjo Market Tallerken')
    assert.equal(marketQuery({ ai: { search_query: 'blå tallerken', identification: {} } }, 'Tallerken'), 'blå tallerken')
    assert.equal(marketQuery(null, 'Gyngestol'), 'Gyngestol')
  })
  test('lenkene går til søk på FINN og Tradera', () => {
    assert.deepEqual(searchLinks('Figgjo Lotte').map(l => l.url), ['https://www.finn.no/recommerce/forsale/search?q=Figgjo%20Lotte', 'https://www.tradera.com/search?q=Figgjo%20Lotte'])
    assert.deepEqual(searchLinks(''), [])
  })
})
