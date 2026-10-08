// Når brukeren endrer et tidligere svar: svar og valg som ikke lenger vises, skal verken styre
// veiviseren eller beregningen. Også særkullsbarn uten partner, dagens dato og sammenligning av svar.
import { test, describe, mock } from 'node:test'
import assert from 'node:assert/strict'
import { child, married, single, base, run } from './helpers.js'
import { visibleQuestions, pruneAnswers, validationError, firstUnanswered, localToday, sameAnswers } from '../../public/arveveiviser/flow.js'
import { QUESTION_BY_ID } from '../../public/arveveiviser/questions.js'
import { toEstatePayload, buildReport } from '../../public/arveveiviser/report.js'

const ids = answers => visibleQuestions(answers).map(q => q.id)

describe('Veiviseren bruker svarene slik motoren ser dem', () => {
  const cohabitant = base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes', previousUskifte: 'no', children: [child({ common: 'yes' })], advancements: 'no', assets: { bank: '1000000' } })
  const nowMarried = { ...cohabitant, maritalStatus: 'married', separateProperty: 'no', skjevdeling: 'no' }

  test('samboer med felles barn → gift: «Hadde avdøde barn?» vises og er neste spørsmål', () => {
    // Det gamle svaret om felles barn skjuler spørsmålet hvis man ser på svarene uten opprydding …
    assert.ok(!ids(nowMarried).includes('hasChildren'))
    // … men motoren rydder det bort, og da må veiviseren også spørre
    const a = pruneAnswers(nowMarried)
    assert.equal(a.cohabitantChildren, undefined)
    assert.ok(ids(a).includes('hasChildren'))
    assert.equal(firstUnanswered(nowMarried)?.id, 'hasChildren')
  })
  test('blokkeringen peker på et spørsmål som faktisk vises', () => {
    const r = run(nowMarried)
    const b = r.blockers.find(x => x.id === 'hasChildren')
    assert.ok(b)
    assert.ok(ids(pruneAnswers(nowMarried)).includes(b.questionId))
  })
  test('når spørsmålet er besvart, beholdes barna som allerede var lagt inn, og resultatet beregnes', () => {
    const answered = { ...nowMarried, hasChildren: 'yes' }
    assert.equal(firstUnanswered(answered), null)
    const r = run(answered)
    assert.equal(r.blockers.length, 0)
    assert.equal(r.skifte.people.filter(p => p.relation === 'Barn').length, 1)
  })
  test('et skjult svar som blir relevant igjen, kommer tilbake (gift → samboer med felles barn → gift)', () => {
    const raw = married({ hasChildren: 'yes', children: [child({ common: 'yes' })], cohabitantChildren: 'yes' })
    const a = pruneAnswers(raw)
    assert.equal(a.cohabitantChildren, undefined)
    assert.equal(a.hasChildren, 'yes')
    assert.equal(a.children.length, 1)
  })
  test('gift → verken gift eller samboer: spørsmål om ektepakt forsvinner', () => {
    const m = married({ separateProperty: 'yes', separatePropertyWho: 'deceased', separatePropertyAtDeath: 'no', hasChildren: 'yes', children: [child({ common: 'no' })], separateChildrenConsent: 'yes' })
    const changed = { ...m, maritalStatus: 'none' }
    assert.ok(ids(changed).includes('separatePropertyWho')) // uten opprydding
    const v = ids(pruneAnswers(changed))
    for (const q of ['separateProperty', 'separatePropertyWho', 'separatePropertyAtDeath', 'skjevdeling', 'separateChildrenConsent']) assert.ok(!v.includes(q), q)
    assert.ok(v.includes('previousUskifte'))
  })
  test('validering av barna bruker svarene etter opprydding', () => {
    const raw = { ...cohabitant, maritalStatus: 'none', hasChildren: 'yes', children: [child()] }
    // Det gamle svaret om felles barn krever at et barn er markert som felles – uten partner gir det ingen mening
    assert.ok(validationError(QUESTION_BY_ID.children, raw))
    assert.equal(validationError(QUESTION_BY_ID.children, pruneAnswers(raw)), null)
  })
})

describe('Valg i flervalg som ikke lenger vises, fjernes', () => {
  const cohabitant = base({
    maritalStatus: 'cohabitant', cohabitantChildren: 'no', previousUskifte: 'no', hasChildren: 'no', parents: 'both',
    testament: 'yes', testamentContent: ['toCohabitant'], testamentCohabitantAmount: '500000', cohabitantFiveYears: 'yes',
    assets: { bank: '2000000' },
  })

  test('samboer uten barn: testamentet gir samboeren 500 000 kr', () => {
    const r = run(cohabitant)
    assert.equal(r.skifte.people.find(p => p.id === 'testament-cohabitant')?.amount, 500000)
  })
  test('endres til gift: ingen «samboer etter testament» ved siden av ektefellen', () => {
    const nowMarried = { ...cohabitant, maritalStatus: 'married', separateProperty: 'no', skjevdeling: 'no' }
    const a = pruneAnswers(nowMarried)
    assert.equal(a.testamentContent, undefined)
    assert.equal(a.testamentCohabitantAmount, undefined)
    assert.equal(a.cohabitantFiveYears, undefined)
    const r = run(nowMarried)
    assert.ok(!r.skifte.people.some(p => p.id === 'testament-cohabitant'))
    assert.ok(r.skifte.people.some(p => p.isPartner))
    assert.equal(r.facts.testamentToCohabitant, false)
    // Ingen valg igjen: brukeren må svare på hva testamentet sier på nytt
    assert.equal(firstUnanswered(nowMarried)?.id, 'testamentContent')
  })
  test('andre valg i samme spørsmål beholdes', () => {
    const nowMarried = { ...cohabitant, maritalStatus: 'married', testamentContent: ['toCohabitant', 'giveaway'], testamentAmount: '100000' }
    const a = pruneAnswers(nowMarried)
    assert.deepEqual(a.testamentContent, ['giveaway'])
    assert.equal(a.testamentAmount, '100000')
  })
  test('gift → ugift: «gir ektefellen mindre» og «sier noe om uskifte» fjernes', () => {
    const m = married({ hasChildren: 'yes', children: [child({ common: 'yes' })], testament: 'yes', testamentContent: ['limitsPartner', 'uskifte', 'uneven'], testamentPartnerKnew: 'yes' })
    const a = pruneAnswers({ ...m, maritalStatus: 'none' })
    assert.deepEqual(a.testamentContent, ['uneven'])
    assert.equal(a.testamentPartnerKnew, undefined)
  })
})

describe('Særkullsbarn bare når det finnes ektefelle eller samboer', () => {
  // Barnet ble markert «fra et annet forhold» da avdøde var gift; så ble sivilstand endret
  const answers = single({ hasChildren: 'yes', children: [child({ common: 'no', name: 'Kari' })], assets: { bank: '1000000' } })

  test('beregningen merker ikke barnet som særkullsbarn', () => {
    const r = run(answers)
    assert.ok(r.skifte.people.every(p => p.common === undefined))
  })
  test('verken arvingen i boet eller PDF-en kaller barnet særkullsbarn', () => {
    assert.ok(!toEstatePayload(answers).heirs[0].notes.includes('Særkullsbarn'))
    const text = JSON.stringify(buildReport(answers, { date: new Date('2026-10-05') }).sections)
    assert.doesNotMatch(text, /særkullsbarn/i)
  })
  test('med ektefelle er barnet fortsatt særkullsbarn', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'no' })], assets: { bank: '1000000' } }))
    assert.ok(r.skifte.people.some(p => p.common === 'no'))
  })
})

describe('Dagens dato i norsk tid', () => {
  test('localToday bruker lokal dato, ikke UTC', () => {
    assert.equal(localToday(new Date(2026, 9, 7, 0, 30)), '2026-10-07')
    assert.equal(localToday(new Date(2026, 0, 1, 23, 59)), '2026-01-01')
  })
  test('et dødsfall i dag godtas også rett etter midnatt', () => {
    const tz = process.env.TZ
    process.env.TZ = 'Europe/Oslo'
    // 00:30 norsk tid 7. oktober er fortsatt 6. oktober i UTC
    mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-06T22:30:00Z') })
    try {
      assert.equal(new Date().toISOString().slice(0, 10), '2026-10-06')
      assert.equal(validationError(QUESTION_BY_ID.deathDate, { deathDate: '2026-10-07' }), null)
      assert.ok(validationError(QUESTION_BY_ID.deathDate, { deathDate: '2026-10-08' }))
    } finally {
      mock.timers.reset()
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })
})

describe('Sammenligning av lagrede svar', () => {
  test('rekkefølgen på nøklene spiller ingen rolle (jsonb sorterer dem om)', () => {
    const a = { maritalStatus: 'married', children: [{ id: 'x', alive: 'yes', common: 'yes' }], assets: { bank: '1', home: '2' } }
    const b = { assets: { home: '2', bank: '1' }, children: [{ common: 'yes', alive: 'yes', id: 'x' }], maritalStatus: 'married' }
    assert.ok(sameAnswers(a, b))
  })
  test('ulike svar er ulike', () => {
    assert.ok(!sameAnswers({ a: '1' }, { a: '2' }))
    assert.ok(!sameAnswers({ list: [1, 2] }, { list: [2, 1] }))
    assert.ok(!sameAnswers({ a: '1' }, null))
  })
  test('nøkler uten verdi ignoreres', () => {
    assert.ok(sameAnswers({ a: '1', b: undefined }, { a: '1' }))
  })
})
