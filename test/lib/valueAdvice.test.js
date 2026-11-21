// Når et verdianslag vises som spenn, med merknad om takst, eller ikke vises i det hele tatt (src/lib/valueAdvice.js).
// Tilfellene for sølv og gull er det bildeanalysen faktisk svarte i kalibreringen (eval/, 2026-11-19).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { valueAdvice, appraiseText, suggestText, formatRange, preciousMetal, APPRAISE_ABOVE_NOK } from '../../src/lib/valueAdvice.js'

// Svar fra estimate-value v3 (også formen til valuationRecord)
const est = ({ likely = 500, method = 'model', key = 'furniture', specificity = 'generic', confidence = 'medium', status = 'ok' } = {}) => ({
  status, method, confidence, estimate: { low: Math.round(likely * 0.6), likely, high: Math.round(likely * 1.6) },
  basis: { category_key: key, specificity },
})

// ai_analysis med AI-ens identifikasjon og stempler, og eventuelt familiens rettelser
const field = value => (value ? { value, basis: 'probable', evidence: '' } : null)
const rec = ({ material = null, brand = null, marks = [], corrections } = {}) => ({
  v: 2, ai: { identification: { material: field(material), brand: field(brand) }, marks }, ...(corrections ? { corrections } : {}),
})
const fam = value => ({ material: { value, by: 'u1', at: '2026-11-21T00:00:00Z' } })

// Fra kalibreringen
const silverCutlery = rec({ material: 'Forsølvet metall', brand: 'Anitra', marks: [{ kind: 'label', text: 'ANITRA PAISPADE AG 25,0cm 510254', where: 'Prislapp' }, { kind: 'label', text: 'ARTE GULLSMED MJELVA', where: 'Lokk på eske' }] })
const brooch = rec({ material: 'Sølv, oksidert', brand: 'Sylvsmidja' })
const goldRing = rec({ material: 'Gull', marks: [{ kind: 'hallmark', text: '21K', where: 'Innvendig' }] })

describe('valueAdvice', () => {
  test('vanlig innbo med AI-anslag: spennet vises', () => {
    assert.equal(valueAdvice(est()), 'none')
    assert.equal(valueAdvice(est({ key: 'kitchen_porcelain', likely: 300 }), rec({ material: 'Porselen' })), 'none')
  })

  test('kunst, smykker og samleobjekter som AI-gjetning: ikke noe beløp', () => {
    for (const key of ['art', 'jewelry_watches', 'collectibles']) assert.equal(valueAdvice(est({ key })), 'instead', key)
  })

  test('kjent merke er ikke nok: sølja og Omega-uret bommet 3–4 ganger med kjent merke', () => {
    assert.equal(valueAdvice(est({ key: 'jewelry_watches', specificity: 'precise', confidence: 'high' })), 'instead')
    assert.equal(valueAdvice(est({ key: 'art', specificity: 'broad', confidence: 'high' })), 'instead')
  })

  test('over 10 000 kr som AI-gjetning: ikke noe beløp, uansett kategori', () => {
    assert.equal(valueAdvice(est({ likely: APPRAISE_ABOVE_NOK + 1 })), 'instead')
    assert.equal(valueAdvice(est({ likely: 25000, key: 'electronics', specificity: 'precise', confidence: 'high' })), 'instead')
    assert.equal(valueAdvice(est({ likely: APPRAISE_ABOVE_NOK })), 'none', 'grensen er «over», ikke «fra»')
  })

  test('kan være sølv eller gull: ikke noe beløp, uansett kategori (sølvbestikket ble anslått 12 ganger for lavt)', () => {
    assert.equal(valueAdvice(est({ key: 'kitchen_porcelain', likely: 300 }), silverCutlery), 'instead')
    assert.equal(valueAdvice(est({ key: 'kitchen_porcelain', likely: 300 }), brooch), 'instead')
  })

  test('bygger på familiens sammenligninger: beløpet vises, med merknad når det er dyrt, usikker kategori eller metall', () => {
    assert.equal(valueAdvice(est({ method: 'market_sold', key: 'art' })), 'suggest')
    assert.equal(valueAdvice(est({ method: 'market_asking', likely: 30000 })), 'suggest')
    assert.equal(valueAdvice(est({ method: 'market_sold' }), silverCutlery), 'suggest')
    assert.equal(valueAdvice(est({ method: 'market_sold' })), 'none')
  })

  test('eldre svar uten method regnes som AI-anslag', () => {
    const old = est({ key: 'art' })
    delete old.method
    assert.equal(valueAdvice(old), 'instead')
  })

  test('uten anslag: ingenting å vurdere', () => {
    assert.equal(valueAdvice(null), 'none')
    assert.equal(valueAdvice(est({ status: 'insufficient' })), 'none')
    assert.equal(valueAdvice({ status: 'ok', estimate: { likely: 0 } }), 'none')
  })
})

describe('preciousMetal', () => {
  test('tilfellene fra kalibreringen', () => {
    assert.deepEqual(preciousMetal(silverCutlery), { kind: 'silver', answered: false }, 'AI-ens «forsølvet» er mulig sølv')
    assert.deepEqual(preciousMetal(brooch), { kind: 'silver', answered: false })
    assert.deepEqual(preciousMetal(goldRing), { kind: 'gold', answered: false })
  })

  test('gullsmed på etiketten er mulig edelmetall, men ikke «gull»', () => {
    const r = rec({ material: 'Metall', marks: [{ kind: 'label', text: 'ARTE GULLSMED MJELVA' }] })
    assert.deepEqual(preciousMetal(r), { kind: 'precious', answered: false })
  })

  test('stempler: tall teller i stempler, ikke på prislapper', () => {
    assert.equal(preciousMetal(rec({ marks: [{ kind: 'hallmark', text: '830S' }] }))?.kind, 'silver')
    assert.equal(preciousMetal(rec({ marks: [{ kind: 'stamp', text: '585' }] }))?.kind, 'gold')
    assert.equal(preciousMetal(rec({ marks: [{ kind: 'label', text: 'Kr 750,-' }] })), null)
    assert.equal(preciousMetal(rec({ marks: [{ kind: 'hallmark', text: 'uleselig' }] }))?.kind, 'precious')
  })

  test('ikke edelmetall: nysølv, alpakka, farge og vanlige materialer', () => {
    for (const material of ['Nysølv', 'Alpakka', 'Sølvfarget metall', 'Rustfritt stål', 'Gullfarget messing', 'Silver-coloured plastic',
      'Porselen med sølvkant', 'Porselen med gullkant og blomsterdekor', 'Glass med gulldekor', 'Porcelain with gold rim']) {
      assert.equal(preciousMetal(rec({ material })), null, material)
    }
  })

  test('familiens svar går foran AI-en', () => {
    assert.equal(preciousMetal(rec({ material: 'Sølv', corrections: fam('Forsølvet') })), null, 'familien: forsølvet')
    assert.equal(preciousMetal(rec({ material: 'Sølv', corrections: fam('Plett') })), null, 'familien: plett')
    assert.equal(preciousMetal(rec({ material: 'Sølv', corrections: fam('Tinn') })), null, 'familien: annet materiale')
    assert.deepEqual(preciousMetal(rec({ material: 'Forsølvet metall', corrections: fam('Sølv 830S, 166 g') })), { kind: 'silver', answered: true })
    assert.deepEqual(preciousMetal(rec({ material: 'Forsølvet metall', corrections: fam('Usikkert: sølv eller forsølvet') })), { kind: 'silver', answered: true })
    assert.deepEqual(preciousMetal(rec({ material: 'Stål', corrections: fam('18K gull') })), { kind: 'gold', answered: true })
  })

  test('uten vurdering: ingenting', () => {
    assert.equal(preciousMetal(null), null)
    assert.equal(preciousMetal({ v: 2, ai: null }), null)
  })
})

describe('tekstene', () => {
  test('egen begrunnelse for metall, usikker kategori og høyt beløp', () => {
    assert.match(appraiseText(est(), silverCutlery).title, /Sølv eller forsølvet/)
    assert.match(appraiseText(est(), silverCutlery).body, /830S/)
    assert.match(appraiseText(est(), goldRing).title, /Gull eller forgylt/)
    assert.match(appraiseText(est({ key: 'art' })).body, /signatur/)
    assert.match(appraiseText(est({ likely: 20000 })).body, /10 000 kr/)
    assert.match(suggestText(est({ key: 'jewelry_watches' })), /takst/)
    assert.match(suggestText(est(), brooch), /stempelet/)
  })

  test('spennet skrives med begge beløp, eller ett hvis de er like', () => {
    assert.match(formatRange(300, 800), /300.*–.*800/)
    assert.doesNotMatch(formatRange(500, 500), /–/)
    assert.equal(formatRange(null, 800), '')
  })
})
