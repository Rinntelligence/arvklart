// Svar som gjør situasjonen for sammensatt til en sikker beregning: hvilket spørsmål
// som utløser varselet, og at det forklares i resultatet og rapporten.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { answerFlags, flagsForQuestion } from '../../public/arveveiviser/engine.js'
import { buildReport } from '../../public/arveveiviser/report.js'
import { child, married, single, base, run } from './helpers.js'

const kids = () => [child(), child()]
const ok = (o = {}) => single({ hasChildren: 'yes', children: kids(), assets: { bank: '1000000' }, ...o })
const reasonIds = r => r.complexReasons.map(x => x.id)

describe('Årsaker til at situasjonen er sammensatt', () => {
  test('et vanlig tilfelle har ingen årsaker', () => {
    const r = run(ok())
    assert.equal(r.complex, false)
    assert.deepEqual(r.complexReasons, [])
    assert.deepEqual(answerFlags(ok()), [])
  })

  const cases = [
    ['bosted utenfor Norge', ok({ residence: 'no' }), 'livedAbroad', 'residence'],
    ['vet ikke om bosted', ok({ residence: 'unknown' }), 'livedAbroad', 'residence'],
    ['skjevdeling', married({ skjevdeling: 'yes', hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '1000000' } }), 'skjevdeling', 'skjevdeling'],
    ['gjeld større enn felleseiet', married({ hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '100000', otherDebt: '500000' } }), 'commonNegative', 'assets'],
    ['testament med skjev fordeling', ok({ testament: 'yes', testamentContent: ['uneven'] }), 'testamentUneven', 'testamentContent'],
    ['testament om noe annet', ok({ testament: 'yes', testamentContent: ['other'] }), 'testamentOther', 'testamentContent'],
    ['testament gir bort for mye', ok({ testament: 'yes', testamentContent: ['giveaway'], testamentAmount: '900000' }), 'testamentExceeds', 'testamentAmount'],
    ['tidligere uskifte der den første ikke etterlot seg barn', single({ previousUskifte: 'yes', previousUskifteType: 'married', hasChildren: 'no', parents: 'none', hasSiblings: 'no', previousSpouseChildren: 'no', assets: { bank: '1000000' } }), 'previousUskifteRelatives', 'previousSpouseChildren'],
    ['gjeld større enn eiendeler', ok({ assets: { bank: '100000', otherDebt: '300000' } }), 'insolvent', 'assets'],
    ['uenige arvinger', ok({ circumstances: ['disagreement'] }), 'disagreement', 'circumstances'],
    ['arving som ikke kan nås', ok({ circumstances: ['unreachable'] }), 'unreachable', 'circumstances'],
  ]
  for (const [name, answers, id, questionId] of cases) {
    test(`${name} → ${id} på spørsmålet ${questionId}`, () => {
      const r = run(answers)
      assert.equal(r.complex, true)
      const reason = r.complexReasons.find(x => x.id === id)
      assert.ok(reason, `mangler årsak ${id}: ${reasonIds(r)}`)
      assert.equal(reason.questionId, questionId)
      assert.ok(reason.title && reason.text)
      assert.ok(flagsForQuestion(answers, questionId).some(f => f.id === id && f.kind === 'complex'))
    })
  }

  test('tidligere uskifte med barn er ikke sammensatt – det beregnes', () => {
    const r = run(ok({ previousUskifte: 'yes', previousUskifteType: 'married', children: [child({ firstCommon: 'yes' }), child({ firstCommon: 'yes' })], previousSpouseChildren: 'yes', previousSpouseChildrenList: [child()] }))
    assert.deepEqual(r.complexReasons, [])
  })
  test('testament som gir bort for mye varsles ikke før formuen er lagt inn – og da også på formue-spørsmålet', () => {
    const before = single({ hasChildren: 'yes', children: kids(), testament: 'yes', testamentContent: ['giveaway'], testamentAmount: '900000' })
    delete before.assets
    assert.deepEqual(flagsForQuestion(before, 'testamentAmount'), [])
    const after = { ...before, assets: { bank: '1000000' } }
    assert.ok(flagsForQuestion(after, 'testamentAmount').some(f => f.id === 'testamentExceeds'))
    assert.ok(flagsForQuestion(after, 'assets').some(f => f.id === 'testamentExceeds'))
  })
  test('flere årsaker på samme spørsmål vises samlet', () => {
    const answers = ok({ circumstances: ['disagreement', 'unreachable'] })
    assert.deepEqual(flagsForQuestion(answers, 'circumstances').map(f => f.id), ['disagreement', 'unreachable'])
  })
})

describe('Svar som stopper beregningen', () => {
  test('dødsfall før 2021 varsles på datospørsmålet, ikke som sammensatt', () => {
    const answers = ok({ deathDate: '2019-03-01' })
    const r = run(answers)
    assert.equal(r.complex, true)
    assert.deepEqual(r.complexReasons, [])
    assert.ok(flagsForQuestion(answers, 'deathDate').some(f => f.id === 'oldLaw' && f.kind === 'blocker'))
  })
  test('«vet ikke» om sivilstand, barn og foreldre varsles på spørsmålet', () => {
    assert.ok(flagsForQuestion(base({ maritalStatus: 'unknown' }), 'maritalStatus').some(f => f.kind === 'blocker'))
    assert.ok(flagsForQuestion(single({ hasChildren: 'unknown' }), 'hasChildren').some(f => f.kind === 'blocker'))
    assert.ok(flagsForQuestion(single({ hasChildren: 'no', parents: 'unknown' }), 'parents').some(f => f.kind === 'blocker'))
  })
  test('ubesvarte spørsmål og barn som ikke er lagt inn ennå, gir ikke varsel', () => {
    assert.deepEqual(flagsForQuestion(single({ hasChildren: 'no' }), 'parents'), [])
    assert.deepEqual(flagsForQuestion(single({ hasChildren: 'yes' }), 'children'), [])
    assert.deepEqual(flagsForQuestion(single({ hasChildren: 'yes', children: kids() }), 'assets'), [])
  })
})

test('PDF-rapporten forklarer hvorfor fordelingen kan bli annerledes', () => {
  const report = buildReport(ok({ circumstances: ['disagreement'] }))
  const section = report.sections.find(s => s.heading === 'Derfor kan fordelingen bli annerledes')
  assert.ok(section)
  assert.ok(section.blocks.some(b => b.title === 'Arvingene er uenige'))
  assert.ok(!buildReport(ok()).sections.some(s => s.heading === 'Derfor kan fordelingen bli annerledes'))
})
