// Beslutningstreet, «vet ikke»-svar, validering, kilder og datakvalitet.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { child, married, single, base, run } from './helpers.js'
import { visibleQuestions, pruneAnswers, validationError } from '../../public/arveveiviser/flow.js'
import { QUESTIONS, QUESTION_BY_ID } from '../../public/arveveiviser/questions.js'
import { NOTICES, NEXT_STEPS } from '../../public/arveveiviser/rules.js'
import { SOURCES } from '../../public/arveveiviser/sources.js'
import { grunnbelop } from '../../public/arveveiviser/grunnbelop.js'
import { evaluate } from '../../public/arveveiviser/conditions.js'

const ids = answers => visibleQuestions(answers).map(q => q.id)

describe('Beslutningstreet viser bare relevante spørsmål', () => {
  test('starter med rolle, dato og bosted', () => {
    assert.deepEqual(ids({}).slice(0, 4), ['role', 'deathDate', 'residence', 'maritalStatus'])
  })
  test('gift med felles barn: ingen spørsmål om foreldre, søsken eller samtykke', () => {
    const v = ids(married({ hasChildren: 'yes', children: [child({ common: 'yes' })] }))
    for (const q of ['parents', 'hasSiblings', 'separateChildrenConsent', 'cohabitantChildren', 'previousUskifte']) assert.ok(!v.includes(q), q)
    for (const q of ['separateProperty', 'skjevdeling', 'testament', 'advancements', 'assets']) assert.ok(v.includes(q), q)
  })
  test('særkullsbarn utløser spørsmål om samtykke til uskifte', () => {
    assert.ok(ids(married({ hasChildren: 'yes', children: [child({ common: 'no' })] })).includes('separateChildrenConsent'))
  })
  test('samboer uten felles barn får ikke spørsmål om samtykke, men om barn generelt', () => {
    const v = ids(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'no', hasChildren: 'yes', children: [child({ common: 'no' })] }))
    assert.ok(v.includes('hasChildren'))
    assert.ok(!v.includes('separateChildrenConsent'))
  })
  test('samboer med felles barn hopper over «Hadde avdøde barn?»', () => {
    assert.ok(!ids(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes' })).includes('hasChildren'))
  })
  test('uten barn: foreldre, så søsken bare når en forelder er død', () => {
    assert.ok(ids(single({ hasChildren: 'no' })).includes('parents'))
    assert.ok(!ids(single({ hasChildren: 'no', parents: 'both' })).includes('hasSiblings'))
    assert.ok(ids(single({ hasChildren: 'no', parents: 'mother' })).includes('hasSiblings'))
  })
  test('besteforeldre spørres bare når ingen nærmere arvinger finnes og det ikke er ektefelle', () => {
    assert.ok(ids(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'no' })).includes('hasGrandparentLine'))
    assert.ok(!ids(married({ hasChildren: 'no', parents: 'none', hasSiblings: 'no' })).includes('hasGrandparentLine'))
  })
  test('testamentdetaljer bare når det finnes testament', () => {
    assert.ok(!ids(single({ testament: 'no' })).includes('testamentContent'))
    assert.ok(ids(single({ testament: 'yes' })).includes('testamentContent'))
    assert.ok(ids(single({ testament: 'yes', testamentContent: ['giveaway'] })).includes('testamentAmount'))
  })
  test('testamentalternativer filtreres etter situasjon', () => {
    const q = QUESTION_BY_ID.testamentContent
    const ctxSingle = { answers: {}, facts: { partnerInherits: false, uskifteRelevant: false, cohabitantNoChildren: false } }
    const shown = q.options.filter(o => evaluate(o.showIf, ctxSingle)).map(o => o.value)
    assert.ok(!shown.includes('limitsPartner'))
    assert.ok(!shown.includes('uskifte'))
  })
  test('ektepakt-spørsmål kun for gifte', () => {
    assert.ok(!ids(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes' })).includes('separateProperty'))
  })
})

describe('Bytte av svar underveis', () => {
  test('svar som ikke lenger er relevante, ryddes bort i analysen', () => {
    const answers = married({ separateProperty: 'yes', separatePropertyWho: 'deceased', separatePropertyAtDeath: 'no', hasChildren: 'yes', children: [child({ common: 'yes' })] })
    const changed = { ...answers, maritalStatus: 'none' }
    const pruned = pruneAnswers(changed)
    assert.equal(pruned.separateProperty, undefined)
    assert.equal(pruned.separatePropertyWho, undefined)
    assert.equal(run({ ...changed, previousUskifte: 'no', assets: { bank: '100' } }).facts.separateProperty, false)
  })
  test('å gå fra «ingen barn» til «barn» fjerner svar om foreldre', () => {
    const a = single({ hasChildren: 'no', parents: 'both' })
    const pruned = pruneAnswers({ ...a, hasChildren: 'yes', children: [child()] })
    assert.equal(pruned.parents, undefined)
  })
})

describe('«Vet ikke» gir aldri et resultat bygget på en antakelse om familien', () => {
  test('vet ikke om barn → blokkert, ingen tall', () => {
    const r = run(single({ hasChildren: 'unknown', assets: { bank: '100000' } }))
    assert.ok(r.blocked)
    assert.equal(r.skifte, null)
    assert.ok(r.blockers.some(b => b.id === 'hasChildren' && b.questionId === 'hasChildren'))
    assert.equal(r.nextSteps[0].id, 'clarify')
  })
  test('vet ikke om sivilstand → blokkert', () => {
    const r = run(base({ maritalStatus: 'unknown' }))
    assert.ok(r.blockers.some(b => b.id === 'marital'))
    assert.equal(r.skifte, null)
  })
  test('vet ikke om felles barn med samboer → blokkert', () => {
    assert.ok(run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'unknown' })).blockers.some(b => b.id === 'cohabitantChildren'))
  })
  test('vet ikke om foreldre → blokkert', () => {
    const r = run(married({ hasChildren: 'no', parents: 'unknown', assets: { bank: '100000' } }))
    assert.ok(r.blockers.some(b => b.id === 'parents'))
    assert.equal(r.skifte, null)
  })
  test('vet ikke om søsken → blokkert', () => {
    assert.ok(run(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'unknown' })).blockers.some(b => b.id === 'siblings'))
  })
  test('vet ikke om besteforeldre → blokkert', () => {
    assert.ok(run(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'no', hasGrandparentLine: 'unknown' })).blockers.some(b => b.id === 'grandparents'))
  })
  test('dødsfall før 2021 → gammel arvelov, ingen tall', () => {
    const r = run(single({ deathDate: '2019-03-01', hasChildren: 'yes', children: [child()], assets: { bank: '100000' } }))
    assert.ok(r.blockers.some(b => b.id === 'oldLaw'))
    assert.equal(r.skifte, null)
  })
  test('ingen beløp lagt inn → viser hvem som arver, men ikke beløp', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], assets: {} }))
    assert.ok(r.blockers.some(b => b.id === 'noValues'))
    assert.equal(r.skifte, null)
    assert.match(r.who, /eneste arving/)
  })
  test('«vet ikke» om forhold som bare justerer beregningen vises som forutsetninger', () => {
    const r = run(married({ testament: 'unknown', separateProperty: 'unknown', advancements: 'unknown', residence: 'unknown', hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '1000000' } }))
    const qs = r.assumptions.map(a => a.questionId)
    for (const q of ['testament', 'separateProperty', 'advancements', 'residence']) assert.ok(qs.includes(q), q)
  })
})

describe('Validering av svar', () => {
  test('enkeltvalg må være besvart', () => {
    assert.ok(validationError(QUESTION_BY_ID.maritalStatus, {}))
    assert.equal(validationError(QUESTION_BY_ID.maritalStatus, { maritalStatus: 'none' }), null)
  })
  test('dato kan ikke være i fremtiden eller ugyldig', () => {
    assert.ok(validationError(QUESTION_BY_ID.deathDate, { deathDate: '2999-01-01' }))
    assert.ok(validationError(QUESTION_BY_ID.deathDate, { deathDate: 'i går' }))
    assert.equal(validationError(QUESTION_BY_ID.deathDate, { deathDate: '2026-06-01' }), null)
  })
  test('barn må ha svar på lever/felles', () => {
    const q = QUESTION_BY_ID.children
    assert.ok(validationError(q, { maritalStatus: 'married', children: [{ id: 'x', alive: 'yes' }] }))
    assert.equal(validationError(q, { maritalStatus: 'married', children: [{ id: 'x', alive: 'yes', common: 'yes' }] }), null)
    assert.ok(validationError(q, { maritalStatus: 'none', children: [{ id: 'x', alive: 'no' }] }))
    assert.equal(validationError(q, { maritalStatus: 'none', children: [{ id: 'x', alive: 'no', grandchildren: '0' }] }), null)
  })
  test('beløp må være tall, men kan stå tomme', () => {
    assert.equal(validationError(QUESTION_BY_ID.assets, { assets: { bank: '' } }), null)
    assert.equal(validationError(QUESTION_BY_ID.assets, { assets: { bank: '1 000 000' } }), null)
    assert.ok(validationError(QUESTION_BY_ID.assets, { assets: { bank: 'mye' } }))
    assert.ok(validationError(QUESTION_BY_ID.assets, { assets: { bank: '-5' } }))
  })
  test('negative og ugyldige beløp regnes som 0 i beregningen', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], assets: { bank: '500000', other: '-300', car: 'abc' } }))
    assert.equal(r.skifte.E, 500000)
  })
  test('beløp med mellomrom og komma tolkes riktig', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], assets: { bank: '1 250 000,50' } }))
    assert.equal(r.skifte.E, 1250001)
  })
})

describe('Grunnbeløp', () => {
  test('G velges etter dødsdato', () => {
    assert.equal(grunnbelop('2026-04-30').value, 130160)
    assert.equal(grunnbelop('2026-05-01').value, 136549)
    assert.equal(grunnbelop('2021-06-01').value, 106399)
  })
})

describe('Kilder og datakvalitet', () => {
  const referenced = new Set()
  for (const q of QUESTIONS) for (const s of q.learnMore?.sources || []) referenced.add(s)
  for (const r of [...NOTICES, ...NEXT_STEPS]) for (const s of r.sources || []) referenced.add(s)
  const engineSrc = readFileSync(new URL('../../public/arveveiviser/engine.js', import.meta.url), 'utf8')
  for (const m of engineSrc.matchAll(/'((?:arveloven|ekteskapsloven|domstol|skjema|skifteloven|nav)_[a-z_0-9]+)'/g)) referenced.add(m[1])

  test('alle kilder som brukes, finnes i kildeoversikten', () => {
    for (const id of referenced) assert.ok(SOURCES[id], `Mangler kilde: ${id}`)
  })
  test('alle kilder har tittel og https-lenke til Lovdata, domstol.no eller annen offentlig side', () => {
    for (const [id, s] of Object.entries(SOURCES)) {
      assert.ok(s.title, id)
      assert.match(s.url, /^https:\/\/(lovdata\.no|www\.domstol\.no|www\.nav\.no|www\.brreg\.no)\//, id)
    }
  })
  test('alle regler og neste steg har kilde (unntatt rene praktiske steg)', () => {
    for (const n of NOTICES) assert.ok(n.sources?.length, n.id)
    for (const s of NEXT_STEPS.filter(x => x.id !== 'register')) assert.ok(s.sources?.length, s.id)
  })
  test('id-er er unike', () => {
    for (const list of [QUESTIONS, NOTICES, NEXT_STEPS]) assert.equal(new Set(list.map(x => x.id)).size, list.length)
  })
  test('ingen uerstattede plassholdere i resultattekster', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' }), child({ common: 'no' })], testament: 'yes', testamentContent: ['giveaway', 'limitsPartner'], testamentAmount: '100000', testamentPartnerKnew: 'unknown', skjevdeling: 'yes', skjevdelingAmounts: { deceased: '100000' }, debtOverview: 'no', assets: { bank: '3000000' } }))
    const texts = [...r.notices, ...r.skifteNotices, ...r.uskifteNotices, ...r.nextSteps].flatMap(n => [n.title, n.text, n.more || ''])
    for (const t of texts) assert.doesNotMatch(t.replace(/\{partner(Du|Deg)?\}/g, ''), /\{\w+\}/, t)
  })
})
