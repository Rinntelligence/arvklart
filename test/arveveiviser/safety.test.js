// Sikkerhetskontroller (F11 og F14): veiviseren skal heller stoppe enn å vise et arveresultat som kan være feil.
// F11: arvinger i flere ledd enn motoren regner (barnebarn eller nevø/niese som er død og har egne barn).
// F14: forskudd på arv, der reglene avhenger av gavetidspunktet (arveloven § 180 sjette ledd, HR-2025-1182-A):
//      gaver fra 2021 etter § 75, gaver før 2021 etter arveloven 1972 § 38.
// Manglende svar, også i eldre lagrede svar uten de nye spørsmålene, behandles som uavklart – aldri som «Nei».
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { child, sibling, single, married, base, run, byRelation } from './helpers.js'
import { visibleQuestions, firstUnanswered } from '../../public/arveveiviser/flow.js'

const ids = a => visibleQuestions(a).map(q => q.id)
const blocker = (r, id) => r.blockers.find(b => b.id === id)
// Et svar lagret før de nye spørsmålene fantes: feltet mangler helt
const withoutKeys = (a, ...keys) => { const c = { ...a }; for (const k of keys) delete c[k]; return c }

describe('F11: flere ledd under et barn som er dødt', () => {
  const kids = () => [child({ name: 'Anna' }), child({ name: 'Bjørn', alive: 'no', grandchildren: '2' })]
  const answers = (extra = {}) => single({ hasChildren: 'yes', children: kids(), assets: { bank: '1000000' }, ...extra })

  test('«Nei» gir samme fordeling som før', () => {
    const r = run(answers({ deeperDescendants: 'no' }))
    assert.equal(blocker(r, 'deeperDescendants'), undefined)
    assert.equal(byRelation(r, 'Barnebarn').length, 2)
  })
  for (const [label, a] of [
    ['eldre lagret svar uten spørsmålet', withoutKeys(answers(), 'deeperDescendants')],
    ['«Vet ikke»', answers({ deeperDescendants: 'unknown' })],
    ['«Ja»', answers({ deeperDescendants: 'yes' })],
  ]) {
    test(`${label}: ingen beregning, og blokkeringen peker på spørsmålet`, () => {
      const r = run(a)
      const b = blocker(r, 'deeperDescendants')
      assert.ok(b?.hard)
      assert.equal(b.questionId, 'deeperDescendants')
      assert.equal(r.skifte, null)
      assert.deepEqual(r.notices, [])
    })
  }
  test('«Ja» sier at situasjonen ikke kan beregnes pålitelig', () => {
    assert.match(blocker(run(answers({ deeperDescendants: 'yes' })), 'deeperDescendants').title, /flere ledd/)
  })
  test('spørsmålet vises også når ingen barnebarn lever, og arven går ikke videre til foreldrene', () => {
    const onlyDead = single({ hasChildren: 'yes', children: [child({ alive: 'no', grandchildren: '0' })], parents: 'both', assets: { bank: '500000' } })
    const old = withoutKeys(onlyDead, 'deeperDescendants')
    assert.ok(ids(old).includes('deeperDescendants'))
    assert.equal(firstUnanswered(old)?.id, 'deeperDescendants')
    const r = run(old)
    assert.ok(blocker(r, 'deeperDescendants'))
    assert.equal(r.skifte, null)
    // Med «Nei» er det avklart at barnet ikke har etterkommere, og foreldrene arver som før
    const r2 = run({ ...onlyDead, deeperDescendants: 'no' })
    assert.equal(r2.skifte.order, 2)
  })
  test('spørsmålet vises ikke når alle barna lever', () => {
    assert.ok(!ids(single({ hasChildren: 'yes', children: [child(), child()] })).includes('deeperDescendants'))
  })
})

describe('F11: flere ledd under et søsken som er dødt', () => {
  const answers = (extra = {}) => single({
    hasChildren: 'no', parents: 'none', hasSiblings: 'yes',
    siblings: [sibling({ name: 'Kari' }), sibling({ name: 'Ola', alive: 'no', children: '0' })],
    assets: { bank: '800000' }, ...extra,
  })
  test('spørsmålet vises også når søskenet ikke har barn som lever', () => {
    assert.ok(ids(answers()).includes('deeperSiblingDescendants'))
  })
  test('eldre lagret svar og «Vet ikke» blokkerer; hele arven går ikke til søskenet som lever', () => {
    for (const a of [withoutKeys(answers(), 'deeperSiblingDescendants'), answers({ deeperSiblingDescendants: 'unknown' }), answers({ deeperSiblingDescendants: 'yes' })]) {
      const r = run(a)
      assert.ok(blocker(r, 'deeperSiblingDescendants')?.hard)
      assert.equal(r.skifte, null)
    }
  })
  test('«Nei» gir samme fordeling som før', () => {
    const r = run(answers({ deeperSiblingDescendants: 'no' }))
    assert.equal(r.blockers.length, 0)
    assert.equal(r.skifte.order, 2)
  })
})

describe('F11: barna til den som døde først (avdøde satt i uskifte)', () => {
  const answers = (extra = {}) => single({
    previousUskifte: 'yes', previousUskifteType: 'married', previousUskifteShare: '50',
    hasChildren: 'yes', children: [child({ firstCommon: 'yes' })],
    previousSpouseChildren: 'yes', previousSpouseChildrenList: [child({ alive: 'no', grandchildren: '1' })],
    assets: { bank: '1000000' }, ...extra,
  })
  test('eldre lagret svar uten spørsmålet blokkerer', () => {
    const a = withoutKeys(answers(), 'deeperFirstSpouseDescendants')
    assert.ok(ids(a).includes('deeperFirstSpouseDescendants'))
    assert.ok(blocker(run(a), 'deeperFirstSpouseDescendants')?.hard)
  })
})

describe('F14: forskudd på arv og gavetidspunkt', () => {
  const kids = [child({ name: 'A' }), child({ name: 'B' })]
  const two = (extra = {}) => single({ hasChildren: 'yes', children: kids, assets: { bank: '900000' }, advancementAmounts: { [kids[0].id]: '300000' }, ...extra })
  const childAmounts = r => byRelation(r, 'Barn').map(p => p.amount)
  const equal = r => { const [x, y] = childAmounts(r); return x === y }
  const unresolved = (a, q) => {
    const r = run(a)
    const b = blocker(r, 'advancementsUnresolved')
    assert.ok(b?.hard, 'skal blokkere')
    assert.equal(b.questionId, q)
    assert.equal(r.skifte, null)
    return b
  }

  test('eldre lagret «Ja» uten gavetidspunkt: blokkeres og spør om tidspunktet', () => {
    const old = two({ advancements: 'yes' })
    unresolved(old, 'advancementTiming')
    assert.equal(firstUnanswered(old)?.id, 'advancementTiming')
  })
  test('eldre lagret «Gaver uten beskjed» uten gavetidspunkt: blokkeres', () => {
    unresolved(two({ advancements: 'gift' }), 'advancementTiming')
  })
  test('gavetidspunkt «Vet ikke» blokkerer', () => {
    unresolved(two({ advancements: 'yes', advancementTiming: 'unknown' }), 'advancementTiming')
  })

  describe('gaver før 2021 (arveloven 1972 § 38)', () => {
    test('«Ja» + betydelig gave: trekkes fra', () => {
      const r = run(two({ advancements: 'yes', advancementTiming: 'before2021', advancementSubstantial: 'yes' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(!equal(r))
    })
    test('«Ja» + ikke betydelig (eller de andre fikk tilsvarende): trekkes ikke fra, og det forklares', () => {
      const r = run(two({ advancements: 'yes', advancementTiming: 'before2021', advancementSubstantial: 'no' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(equal(r))
      assert.ok(r.notices.some(n => n.id === 'advancementGifts'))
    })
    test('«Ja» + «Vet ikke» om gaven var betydelig: blokkeres', () => {
      unresolved(two({ advancements: 'yes', advancementTiming: 'before2021', advancementSubstantial: 'unknown' }), 'advancementSubstantial')
    })
    test('«Ja» uten svar om gaven var betydelig (eldre lagret): blokkeres', () => {
      unresolved(two({ advancements: 'yes', advancementTiming: 'before2021' }), 'advancementSubstantial')
    })
    test('ingen beskjed + betydelig gave: kan være avdødes forutsetning – skjønn, blokkeres', () => {
      const b = unresolved(two({ advancements: 'gift', advancementTiming: 'before2021', advancementSubstantial: 'yes' }), 'advancementSubstantial')
      assert.match(b.text, /forutsetning/)
    })
    test('ingen beskjed + ikke betydelig: trekkes ikke fra', () => {
      const r = run(two({ advancements: 'gift', advancementTiming: 'before2021', advancementSubstantial: 'no' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(equal(r))
    })
  })

  describe('gaver fra 2021 (§ 75)', () => {
    test('«Ja» + sagt da gaven ble gitt (også muntlig): trekkes fra', () => {
      const r = run(two({ advancements: 'yes', advancementTiming: 'from2021', advancementConditionAtGift: 'yes' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(!equal(r))
    })
    test('«Ja», men sagt senere: blokkeres med forklaring', () => {
      const b = unresolved(two({ advancements: 'yes', advancementTiming: 'from2021', advancementConditionAtGift: 'no' }), 'advancementConditionAtGift')
      assert.match(b.text, /senest da gaven ble gitt/)
    })
    test('«Ja» + «Vet ikke» om når det ble sagt: blokkeres', () => {
      unresolved(two({ advancements: 'yes', advancementTiming: 'from2021', advancementConditionAtGift: 'unknown' }), 'advancementConditionAtGift')
    })
    test('ingen beskjed: trekkes ikke fra', () => {
      const r = run(two({ advancements: 'gift', advancementTiming: 'from2021' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(equal(r))
      assert.ok(r.notices.some(n => n.id === 'advancementGifts'))
    })
  })

  describe('gaver både før og etter 2021', () => {
    test('«Ja», sagt da gaven ble gitt og betydelig: trekkes fra', () => {
      const r = run(two({ advancements: 'yes', advancementTiming: 'both', advancementConditionAtGift: 'yes', advancementSubstantial: 'yes' }))
      assert.equal(r.blockers.length, 0)
      assert.ok(!equal(r))
    })
    test('«Ja», sagt da gaven ble gitt, men ikke betydelig: blandet, blokkeres', () => {
      unresolved(two({ advancements: 'yes', advancementTiming: 'both', advancementConditionAtGift: 'yes', advancementSubstantial: 'no' }), 'advancementSubstantial')
    })
    test('ingen beskjed + ikke betydelig: trekkes ikke fra', () => {
      const r = run(two({ advancements: 'gift', advancementTiming: 'both', advancementSubstantial: 'no' }))
      assert.equal(r.blockers.length, 0)
    })
  })

  test('«Vet ikke» om forskudd blokkerer når det finnes flere barnelinjer', () => {
    unresolved(two({ advancements: 'unknown' }), 'advancements')
  })
  test('med én barnelinje påvirker forskudd ikke fordelingen: ingen nye spørsmål, ingen blokkering', () => {
    const one = [child()]
    const a = single({ hasChildren: 'yes', children: one, assets: { bank: '900000' }, advancements: 'yes', advancementAmounts: { [one[0].id]: '300000' } })
    assert.ok(!ids(a).includes('advancementTiming'))
    assert.equal(run(a).blockers.length, 0)
    const u = run({ ...a, advancements: 'unknown' })
    assert.equal(u.blockers.length, 0)
    assert.ok(u.assumptions.some(x => x.questionId === 'advancements'))
  })
  test('oppfølgingsspørsmålene vises bare når de er relevante', () => {
    assert.deepEqual(ids(two({ advancements: 'no' })).filter(i => i.startsWith('advancement')), ['advancements'])
    assert.ok(ids(two({ advancements: 'gift', advancementTiming: 'from2021' })).every(i => !['advancementConditionAtGift', 'advancementSubstantial'].includes(i)))
    assert.ok(ids(two({ advancements: 'yes', advancementTiming: 'from2021' })).includes('advancementConditionAtGift'))
    assert.ok(!ids(two({ advancements: 'yes', advancementTiming: 'from2021' })).includes('advancementSubstantial'))
    assert.ok(ids(two({ advancements: 'gift', advancementTiming: 'before2021' })).includes('advancementSubstantial'))
  })
  test('forskudd påvirker fortsatt ikke ektefellens arv når vilkårene er oppfylt', () => {
    const k = [child({ common: 'yes' }), child({ common: 'yes' })]
    const ok = run(married({ hasChildren: 'yes', children: k, assets: { bank: '6000000' }, advancements: 'yes', advancementTiming: 'before2021', advancementSubstantial: 'yes', advancementAmounts: { [k[0].id]: '200000' } }))
    const none = run(married({ hasChildren: 'yes', children: k, assets: { bank: '6000000' }, advancements: 'no' }))
    assert.equal(ok.skifte.partner.amount, none.skifte.partner.amount)
  })
  test('base-svarene er nøytrale', () => {
    assert.equal(base().advancements, undefined)
  })
})
