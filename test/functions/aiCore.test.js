// Kjernen i AI-kallene (supabase/functions/_shared/aiCore.ts): modellvalg, parametre for Haiku 5.5/4.5,
// tolking av svar (thinking, avslag, avkuttet, ugyldig JSON), validering, kategori, verdifall og kostnad.
// Edge-koden er TypeScript; Node 22.18+ kjører den direkte. Eldre Node hopper over testene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const ai = TS ? await import('../../supabase/functions/_shared/aiCore.ts') : null
// Bildeanalysen (analysis.ts) brukes som eksempel på validering
const an = TS ? await import('../../supabase/functions/_shared/analysis.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const msg = (text, extra = {}) => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn', ...extra })
const unknownField = { value: '', basis: 'unknown', evidence: '' }
const okAnalysis = {
  suggestion: { title: 'Gyngestol i eik', description: 'Brun, slitt sete.', category: 'møbler', category_key: 'furniture', confidence: 'medium' },
  identification: Object.fromEntries(['object_type', 'brand', 'manufacturer', 'model', 'variant', 'material', 'colour', 'period', 'designer_or_artist', 'model_number'].map(f => [f, unknownField])),
  marks: [], size_class: 'large', condition_suggestion: 'fair', condition_observations: [], condition_not_visible: [], condition_confidence: 'medium',
  multiple_items: { detected: false, count: 0, note: '' }, photo_suggestions: [], search_query: 'gyngestol eik',
}
const withSuggestion = s => ({ ...okAnalysis, suggestion: { ...okAnalysis.suggestion, ...s } })

describe('modell og parametre', { skip }, () => {
  test('Haiku 5.5 er standard; 4.5 bare når AI_MODEL sier det; ukjent verdi gir standard med varsel', () => {
    assert.deepEqual(ai.resolveModel(undefined), { model: 'claude-haiku-5-5', warning: null })
    assert.deepEqual(ai.resolveModel(' claude-haiku-4-5 '), { model: 'claude-haiku-4-5', warning: null })
    const r = ai.resolveModel('claude-opus-5-5')
    assert.equal(r.model, 'claude-haiku-5-5')
    assert.match(r.warning, /Ukjent AI_MODEL/)
  })

  test('5.5: strukturert output og effort, uten temperature, thinking-budsjett eller prefill', () => {
    const p = ai.buildParams({ model: 'claude-haiku-5-5', system: 's', content: 'c', schema: { type: 'object' }, maxTokens: 4000, effort: 'medium' })
    assert.deepEqual(p.output_config, { format: { type: 'json_schema', schema: { type: 'object' } }, effort: 'medium' })
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in p), `${k} skal ikke sendes`)
    assert.equal(p.messages.length, 1)
    assert.equal(p.messages[0].role, 'user', 'siste melding må være fra brukeren (ingen prefill)')
  })

  test('4.5 (tilbakerulling): samme skjema, men uten effort (gir feil på 4.5)', () => {
    const p = ai.buildParams({ model: 'claude-haiku-4-5', system: 's', content: 'c', schema: { type: 'object' }, maxTokens: 1000, effort: 'low' })
    assert.deepEqual(p.output_config, { format: { type: 'json_schema', schema: { type: 'object' } } })
  })
})

describe('tolking av svaret', { skip }, () => {
  const validate = TS ? an.normalizeAnalysis(['Møbler', 'Kunst']) : null

  test('thinking-blokker før teksten hoppes over', () => {
    const m = { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(okAnalysis) }], stop_reason: 'end_turn' }
    const r = ai.interpretReply(m, validate)
    assert.equal(r.kind, 'ok')
    assert.equal(r.value.suggestion.category, 'Møbler', 'kategorien skal skrives som i boets liste')
  })

  test('avslag gir refused med kategori, og prøves ikke på nytt', () => {
    const r = ai.interpretReply({ content: [], stop_reason: 'refusal', stop_details: { category: 'general_harms' } }, validate)
    assert.deepEqual(r, { kind: 'refused', category: 'general_harms' })
    assert.equal(ai.nextAttempt(r, 1, 4000).retry, false)
  })

  test('avkuttet svar prøves én gang til med dobbel max_tokens', () => {
    const r = ai.interpretReply(msg('{"suggestion":{"title":"Gyng', { stop_reason: 'max_tokens' }), validate)
    assert.equal(r.kind, 'truncated')
    assert.deepEqual(ai.nextAttempt(r, 1, 4000), { retry: true, maxTokens: 8000 })
    assert.equal(ai.nextAttempt(r, 2, 8000).retry, false, 'høyst ett nytt forsøk')
  })

  test('ugyldig JSON eller feil form gir invalid og ett nytt forsøk', () => {
    assert.equal(ai.interpretReply(msg('Her er svaret: {"title": ...'), validate).kind, 'invalid')
    const r = ai.interpretReply(msg(JSON.stringify({ ...okAnalysis, suggestion: 'x' })), validate)
    assert.equal(r.kind, 'invalid')
    assert.deepEqual(ai.nextAttempt(r, 1, 4000), { retry: true, maxTokens: 4000 })
  })

  test('kategori som ikke finnes i boet blir null; lange tekster kuttes', () => {
    const r = ai.interpretReply(msg(JSON.stringify(withSuggestion({ category: 'Våpen', title: 'x'.repeat(500), description: 'y'.repeat(900) }))), validate)
    assert.equal(r.kind, 'ok')
    assert.equal(r.value.suggestion.category, null)
    assert.equal(r.value.suggestion.title.length, 120)
    assert.equal(r.value.suggestion.description.length, 600)
  })

  test('tom tittel godtas ikke', () => {
    assert.equal(ai.interpretReply(msg(JSON.stringify(withSuggestion({ title: '  ' }))), validate).kind, 'invalid')
  })
})

describe('verdianslag', { skip }, () => {
  const good = { low_nok: 300, likely_nok: 500, high_nok: 800, reasoning: 'Vanlig modell.', confidence: 'medium' }

  test('gyldig intervall godtas og rundes til hele kroner', () => {
    const r = ai.validateEstimate({ ...good, likely_nok: 500.4 })
    assert.equal(r.ok, true)
    assert.equal(r.value.likely_nok, 500)
  })

  test('intervall som ikke henger sammen, 0 kr, negative eller manglende beløp avvises', () => {
    assert.equal(ai.validateEstimate({ ...good, low_nok: 900 }).ok, false)
    assert.equal(ai.validateEstimate({ ...good, low_nok: 0 }).ok, false)
    assert.equal(ai.validateEstimate({ ...good, high_nok: -1 }).ok, false)
    assert.equal(ai.validateEstimate({ ...good, likely_nok: null }).ok, false)
    assert.equal(ai.validateEstimate({ ...good, confidence: 'sure' }).ok, false)
  })

  test('inndata: grenser, ukjent tilstand forblir ukjent, ugyldig kjøpsår/-pris ignoreres', () => {
    const now = new Date('2026-10-09')
    assert.equal(ai.readEstimateInput({ title: '  ' }, now), 'Mangler navn på gjenstanden')
    const i = ai.readEstimateInput({ title: 't'.repeat(300), description: 'd'.repeat(3000), condition: 'meh', purchase_price: 'abc', purchase_year: 2031 }, now)
    assert.equal(i.title.length, 200)
    assert.equal(i.description.length, 2000)
    assert.equal(i.condition, null, 'ukjent tilstand skal ikke bli «good»')
    assert.equal(i.purchasePrice, null)
    assert.equal(i.purchaseYear, null, 'kjøpsår i fremtiden skal ignoreres')
    const ok = ai.readEstimateInput({ title: 'Stol', purchase_price: '2500', purchase_year: 2015, condition: 'good' }, now)
    assert.deepEqual([ok.purchasePrice, ok.purchaseYear, ok.condition], [2500, 2015, 'good'])
  })

  test('verdifall: bare med gyldige data, aldri over kjøpsprisen for samleobjekter, gulv for alle', () => {
    const now = new Date('2026-10-09')
    assert.equal(ai.depreciatedValue('furniture', null, 2000, now), null)
    assert.equal(ai.depreciatedValue('collectibles', 1000, 1990, now).value, 1000)
    const el = ai.depreciatedValue('electronics', 10000, 1990, now)
    assert.equal(el.value, 500, 'gulvet (5 %) gjelder')
    assert.equal(ai.depreciatedValue('books', 1000, 2026, now).value, 1000)
  })
})

describe('kategorinøkkel', { skip }, () => {
  test('kjente kategorier på norsk og engelsk, og ordstammer uten falske treff', () => {
    const cases = {
      'Verktøy': 'tools', 'Kjøretøy': 'vehicles', 'Leketøy': 'other', 'Bordservise': 'kitchen_porcelain', 'Armbåndsur': 'jewelry_watches',
      'Smykker og ur': 'jewelry_watches', 'Tools': 'tools', 'Furniture': 'furniture', 'Dokumenter': 'documents_memorabilia',
      'Minner og arvestykker': 'documents_memorabilia', 'Kjøkkenutstyr': 'kitchen_porcelain', 'Gamle stoler': 'furniture', '': 'other', 'Diverse': 'other',
    }
    for (const [label, key] of Object.entries(cases)) assert.equal(ai.categoryKeyFor(label), key, label)
  })
})

describe('kostnad', { skip }, () => {
  test('Haiku 5.5: $0,10/$0,50 per million tokens, dyrere over 100K; 4.5: $1/$5', () => {
    assert.equal(ai.estimateCostUsd('claude-haiku-5-5', { input_tokens: 8000, output_tokens: 1500 }), 0.00155)
    assert.equal(ai.estimateCostUsd('claude-haiku-5-5', { input_tokens: 200_000, output_tokens: 1000 }), 0.1025)
    assert.equal(ai.estimateCostUsd('claude-haiku-4-5', { input_tokens: 8000, output_tokens: 1500 }), 0.0155)
    assert.equal(ai.estimateCostUsd('claude-haiku-5-5', {}), 0)
  })

  test('feilkoder har HTTP-status og en generisk tekst (ingen råtekst til klienten)', () => {
    for (const code of ['ai_refused', 'ai_invalid', 'ai_timeout', 'ai_busy', 'ai_error', 'ai_unavailable', 'error']) {
      assert.ok(ai.ERROR_STATUS[code] >= 400, code)
      assert.ok(ai.ERROR_TEXT[code], code)
    }
    const e = new ai.AiError('ai_refused', 'general_harms')
    assert.equal(e.code, 'ai_refused')
  })
})
