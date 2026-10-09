// Bildeanalyse v2 (supabase/functions/_shared/analysis.ts): skjemaet, normalisering av svaret og feltene appen
// har brukt hittil. Edge-koden er TypeScript; Node 22.18+ kjører den direkte. Eldre Node hopper over testene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const an = TS ? await import('../../supabase/functions/_shared/analysis.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const F = (value, basis, evidence = '') => ({ value, basis, evidence })
const U = F('', 'unknown')
const reply = (over = {}) => ({
  suggestion: { title: 'Tallerken', description: 'Hvit med blått mønster.', category: 'Kjøkken og porselen', category_key: 'kitchen_porcelain', confidence: 'medium' },
  identification: {
    object_type: F('Tallerken', 'observed', 'Synlig form'), brand: F('Figgjo', 'observed', 'Stempel under: «Figgjo Flint Norway»'),
    manufacturer: U, model: F('Lotte', 'probable', 'Mønsteret ligner Lotte'), variant: U, material: F('Flint', 'probable', 'Stempelet'),
    colour: F('Hvit og blå', 'observed'), period: F('1960–70-tallet', 'probable', 'Stil og stempel'), designer_or_artist: U, model_number: U,
  },
  marks: [{ kind: 'stamp', text: 'Figgjo Flint Norway', where: 'Undersiden' }, { kind: 'other', text: '', where: '' }],
  size_class: 'small',
  condition_suggestion: 'good', condition_observations: ['Liten slitasje i glasuren'], condition_not_visible: ['Baksiden av kanten'], condition_confidence: 'medium',
  multiple_items: { detected: false, count: 0, note: '' },
  photo_suggestions: [{ kind: 'underside', reason: 'Stempelet tydeligere' }],
  search_query: 'Figgjo Lotte tallerken',
  ...over,
})
const CATS = ['Møbler', 'Kjøkken og porselen']

describe('skjema', { skip }, () => {
  test('alle objekter har additionalProperties: false og alle felt påkrevd; ingen null-unioner', () => {
    const walk = (node, path) => {
      if (!node || typeof node !== 'object') return
      if (node.type === 'object') {
        assert.equal(node.additionalProperties, false, `${path}: additionalProperties`)
        assert.deepEqual([...node.required].sort(), Object.keys(node.properties).sort(), `${path}: required`)
      }
      assert.ok(!('anyOf' in node) && !Array.isArray(node.type), `${path}: union`)
      for (const [k, v] of Object.entries(node.properties || {})) walk(v, `${path}.${k}`)
      if (node.items) walk(node.items, `${path}[]`)
    }
    walk(an.ANALYSIS_SCHEMA, 'analysis')
  })
})

describe('normalisering', { skip }, () => {
  test('identifikasjon skiller sett, sannsynlig og ukjent; ukjent blir null og listes', () => {
    const r = an.normalizeAnalysis(CATS)(reply())
    assert.equal(r.ok, true)
    const a = r.value
    assert.deepEqual(a.identification.brand, { value: 'Figgjo', basis: 'observed', evidence: 'Stempel under: «Figgjo Flint Norway»' })
    assert.equal(a.identification.model.basis, 'probable')
    assert.equal(a.identification.designer_or_artist, null)
    assert.deepEqual(a.unknown, ['manufacturer', 'variant', 'designer_or_artist', 'model_number'])
    assert.equal(a.suggestion.category, 'Kjøkken og porselen')
  })

  test('tomme merker fjernes, og antall og lengder begrenses', () => {
    const long = 'x'.repeat(400)
    const r = an.normalizeAnalysis(CATS)(reply({
      marks: Array.from({ length: 9 }, () => ({ kind: 'label', text: long, where: 'bak' })),
      condition_observations: Array.from({ length: 10 }, (_, i) => `obs ${i}`),
      photo_suggestions: Array.from({ length: 6 }, () => ({ kind: 'back', reason: 'mer' })),
    }))
    assert.equal(r.value.marks.length, 5)
    assert.equal(r.value.marks[0].text.length, 120)
    assert.equal(r.value.condition_observations.length, 6)
    assert.equal(r.value.photo_suggestions.length, 2)
    assert.equal(an.normalizeAnalysis(CATS)(reply()).value.marks.length, 1, 'merke uten tekst og sted fjernes')
  })

  test('flere gjenstander: antall bare når det er oppdaget og rimelig', () => {
    const yes = an.normalizeAnalysis(CATS)(reply({ multiple_items: { detected: true, count: 4, note: 'Fire kopper' } })).value.multiple_items
    assert.deepEqual(yes, { detected: true, count: 4, note: 'Fire kopper' })
    const unsure = an.normalizeAnalysis(CATS)(reply({ multiple_items: { detected: true, count: 0, note: '' } })).value.multiple_items
    assert.deepEqual(unsure, { detected: true, count: null, note: null })
    const no = an.normalizeAnalysis(CATS)(reply({ multiple_items: { detected: false, count: 7, note: 'x' } })).value.multiple_items
    assert.deepEqual(no, { detected: false, count: null, note: null })
  })

  test('ugyldige verdier får trygge standarder; kategori utenfor boet blir null; tom tittel avvises', () => {
    const r = an.normalizeAnalysis(CATS)(reply({
      suggestion: { title: 'Ting', description: '', category: 'Våpen', category_key: 'weapons', confidence: 'sure' },
      condition_suggestion: 'mint', size_class: 'huge', condition_confidence: 'x',
    }))
    assert.equal(r.value.suggestion.category, null)
    assert.equal(r.value.suggestion.category_key, 'other')
    assert.equal(r.value.suggestion.confidence, 'low')
    assert.equal(r.value.condition_suggestion, 'unknown')
    assert.equal(r.value.size_class, 'unknown')
    assert.equal(an.normalizeAnalysis(CATS)(reply({ suggestion: { title: ' ' } })).ok, false)
    assert.equal(an.normalizeAnalysis(CATS)({}).ok, false)
  })
})

describe('felter for eldre klienter', { skip }, () => {
  test('legacyFields gir dagens felter; ukjent tilstand sendes ikke', () => {
    const a = an.normalizeAnalysis(CATS)(reply()).value
    assert.deepEqual(an.legacyFields(a), { title: 'Tallerken', description: 'Hvit med blått mønster.', category: 'Kjøkken og porselen', condition: 'good', confidence: 'medium' })
    const unknown = an.normalizeAnalysis(CATS)(reply({ condition_suggestion: 'unknown' })).value
    assert.ok(!('condition' in an.legacyFields(unknown)))
  })
})
