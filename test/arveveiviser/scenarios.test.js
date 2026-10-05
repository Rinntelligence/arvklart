// Juridiske scenarioer. Forventede tall er regnet ut for hånd etter arveloven 2019
// med G = 136 549 kr (gjelder fra 1. mai 2026).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { G, child, sibling, married, single, base, run, amountOf, byRelation, sumPeople } from './helpers.js'

const sixMillion = { home: '5000000', bank: '1000000', mortgage: '1000000' }

describe('1–2: Gift + tre felles barn, uten testament', () => {
  const kids = [child({ common: 'yes' }), child({ common: 'yes' }), child({ common: 'yes' })]
  const r = run(married({ role: 'survivor', hasChildren: 'yes', children: kids, assets: sixMillion }))

  test('dødsboet er avdødes halvdel av netto felleseie', () => {
    assert.equal(r.blockers.length, 0)
    assert.equal(r.skifte.estate.commonNet, 5000000)
    assert.equal(r.skifte.E, 2500000)
  })
  test('skifte nå: ektefellen arver 1/4, barna deler resten likt', () => {
    assert.equal(amountOf(r, 'partner'), 625000)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, 625000)
    assert.equal(sumPeople(r), 2500000)
  })
  test('uskifte er mulig uten samtykke, og gjelder hele felleseiet', () => {
    assert.ok(r.uskifte)
    assert.equal(r.uskifte.status, 'free')
    assert.equal(r.uskifte.rows[0].amount, 5000000)
    assert.ok(r.nextSteps.some(s => s.id === 'uskifteNotice'))
    assert.ok(r.nextSteps.some(s => s.id === 'privateSkifte'))
  })
  test('oppsummeringen svarer på hvem, hvor mye og hva nå', () => {
    assert.equal(r.who, 'Du og dine tre barn er arvingene.')
    assert.match(r.howMuchShort.replace(/\s/g, ' '), /Du får 625 000 kr og hvert av barna får 625 000 kr/)
    assert.ok(r.firstStep.length > 10)
    assert.ok(r.situation.some(s => s.includes('alle er også dine barn')))
  })
})

describe('Minstearv: ektefellen får minst 4 G', () => {
  test('når 1/4 er mindre enn 4 G, får ektefellen 4 G', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' }), child({ common: 'yes' })], assets: { bank: '3000000' } }))
    assert.equal(r.skifte.E, 1500000)
    assert.equal(amountOf(r, 'partner'), 4 * G)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, (1500000 - 4 * G) / 2)
    assert.ok(r.notices.some(n => n.id === 'spouseMin4G'))
  })
  test('når boet er mindre enn 4 G, arver ektefellen alt og uskifte er unødvendig', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '800000' } }))
    assert.equal(r.skifte.E, 400000)
    assert.equal(amountOf(r, 'partner'), 400000)
    assert.equal(byRelation(r, 'Barn')[0].amount, 0)
    assert.equal(r.skifte.partnerTakesAll, true)
    assert.equal(r.uskifte, null)
    assert.ok(r.nextSteps.some(s => s.id === 'soleHeir'))
    assert.ok(!r.nextSteps.some(s => s.id === 'privateSkifte'))
  })
})

describe('3–4: Gift + særkullsbarn', () => {
  const kids = () => [child({ common: 'yes' }), child({ common: 'no', name: 'Kari' })]
  test('3: alle særkullsbarn samtykker – uskifte med hele boet', () => {
    const r = run(married({ hasChildren: 'yes', children: kids(), separateChildrenConsent: 'yes', assets: sixMillion }))
    assert.equal(r.uskifte.status, 'consent')
    assert.equal(r.uskifte.rows.length, 1)
    assert.equal(r.uskifte.rows[0].amount, 5000000)
    assert.ok(r.nextSteps.some(s => s.id === 'consent'))
  })
  test('4: særkullsbarnet samtykker ikke – får arven sin nå, resten i uskifte', () => {
    const r = run(married({ hasChildren: 'yes', children: kids(), separateChildrenConsent: 'no', assets: sixMillion }))
    assert.equal(r.uskifte.status, 'partial')
    const kari = r.skifte.people.find(p => p.label === 'Kari')
    assert.equal(kari.amount, 937500) // (2 500 000 − 625 000) / 2
    assert.deepEqual(r.uskifte.rows.find(x => x.label.startsWith('Kari')).amount, 937500)
    assert.equal(r.uskifte.rows[0].amount, 5000000 - 937500)
  })
  test('samtykke ikke avklart – viser hva som skjer hvis de ikke samtykker', () => {
    const r = run(married({ hasChildren: 'yes', children: kids(), separateChildrenConsent: 'unknown', assets: sixMillion }))
    assert.equal(r.uskifte.status, 'unknown')
    assert.ok(r.uskifte.rows.some(x => x.label.startsWith('Hvis Kari ikke samtykker')))
  })
  test('særkullsbarn under 18 år gir egen merknad om verge og statsforvalter', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' }), child({ common: 'no', minor: true })], separateChildrenConsent: 'unknown', assets: sixMillion }))
    assert.ok(r.uskifteNotices.some(n => n.id === 'uskifteMinorConsent'))
    assert.ok(r.notices.some(n => n.id === 'minorHeir'))
  })
  test('ektefelle arver alt med særkullsbarn – advarsel om at særkullsbarna kan bli uten arv', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'no' })], assets: { bank: '600000' } }))
    assert.equal(r.skifte.partnerTakesAll, true)
    assert.ok(r.notices.some(n => n.id === 'spouseTakesAllSeparateChildren'))
  })
})

describe('5: Gift uten barn', () => {
  test('med foreldre i live: ektefellen arver halvparten', () => {
    const r = run(married({ hasChildren: 'no', parents: 'both', assets: sixMillion }))
    assert.equal(amountOf(r, 'partner'), 1250000)
    assert.equal(amountOf(r, 'parent-father'), 625000)
    assert.equal(amountOf(r, 'parent-mother'), 625000)
    assert.equal(r.uskifte.status, 'free')
  })
  test('med foreldre og lite bo: minstearv 6 G tar alt', () => {
    const r = run(married({ hasChildren: 'no', parents: 'both', assets: { bank: '1400000' } }))
    assert.equal(amountOf(r, 'partner'), 700000)
    assert.equal(r.skifte.partnerTakesAll, true)
  })
  test('uten foreldre og søsken: ektefellen arver alt og vi spør ikke om besteforeldre', () => {
    const r = run(married({ hasChildren: 'no', parents: 'none', hasSiblings: 'no', assets: sixMillion }))
    assert.equal(r.skifte.order, 0)
    assert.equal(amountOf(r, 'partner'), 2500000)
    assert.equal(r.facts.needsGrandparents, false)
    assert.equal(r.uskifte, null)
  })
})

describe('6–8: Samboere', () => {
  test('6: samboer + felles barn arver 4 G, barna resten', () => {
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes', previousUskifte: 'no', advancements: 'no', children: [child({ common: 'yes' }), child({ common: 'yes' })], assets: { home: '3000000', mortgage: '1500000', bank: '500000' } }))
    assert.equal(r.skifte.E, 2000000)
    assert.equal(amountOf(r, 'partner'), 4 * G)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, (2000000 - 4 * G) / 2)
    assert.equal(r.uskifte.kind, 'cohabitant')
    assert.equal(r.uskifte.rows[0].amount, 1500000) // bolig minus boliglån
    assert.equal(r.uskifte.rows[1].amount, 500000)  // bankinnskudd skiftes nå
    assert.ok(r.uskifteNotices.some(n => n.id === 'uskifteCohabitantRest'))
  })
  test('7: samboer uten felles barn arver ikke etter loven', () => {
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'no', hasChildren: 'no', parents: 'mother', hasSiblings: 'no', previousUskifte: 'no', assets: { bank: '1000000' } }))
    assert.equal(r.skifte.people.some(p => p.isPartner), false)
    assert.equal(amountOf(r, 'parent-mother'), 1000000)
    assert.equal(r.uskifte, null)
    assert.ok(r.notices.some(n => n.id === 'cohabitantNoChildren'))
  })
  test('8: samboer + felles barn + særkullsbarn krever samtykke til uskifte', () => {
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes', previousUskifte: 'no', advancements: 'no', children: [child({ common: 'yes' }), child({ common: 'no' })], separateChildrenConsent: 'no', assets: { home: '2000000', bank: '1000000' } }))
    assert.equal(amountOf(r, 'partner'), 4 * G)
    assert.equal(r.uskifte.status, 'partial')
    assert.ok(r.uskifte.rows.some(x => x.label.includes('får nå')))
  })
  test('felles barn uoppgitt i barnelisten gir valideringsfeil', async () => {
    const { validationError } = await import('../../public/arveveiviser/flow.js')
    const { QUESTION_BY_ID } = await import('../../public/arveveiviser/questions.js')
    const err = validationError(QUESTION_BY_ID.children, { maritalStatus: 'cohabitant', cohabitantChildren: 'yes', children: [child({ common: 'no' })] })
    assert.match(err, /felles barn/)
  })
})

describe('9–10: Uten ektefelle eller samboer, med barn', () => {
  test('9: ett barn arver alt', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], assets: { bank: '800000', funeral: '50000' } }))
    assert.equal(r.skifte.E, 750000)
    assert.equal(byRelation(r, 'Barn')[0].amount, 750000)
    assert.equal(r.who, 'Barnet til avdøde er eneste arving.')
  })
  test('10: flere barn, ett dødt med to barn som trer inn', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child(), child({ alive: 'no', grandchildren: 2 })], assets: { bank: '900000' } }))
    assert.deepEqual(byRelation(r, 'Barn').map(p => p.amount), [300000, 300000])
    assert.deepEqual(byRelation(r, 'Barnebarn').map(p => p.amount), [150000, 150000])
    assert.ok(r.notices.some(n => n.id === 'representation'))
  })
  test('dødt barn uten egne barn regnes ikke med', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child({ alive: 'no', grandchildren: 0 })], assets: { bank: '500000' } }))
    assert.equal(byRelation(r, 'Barn')[0].amount, 500000)
  })
  test('ujevn avrunding gir likevel riktig sum', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child(), child()], assets: { bank: '1000000' } }))
    assert.equal(sumPeople(r), 1000000)
  })
})

describe('11–12: Foreldre og søsken', () => {
  test('11: begge foreldre lever – halvparten hver', () => {
    const r = run(single({ hasChildren: 'no', parents: 'both', assets: { bank: '1000000' } }))
    assert.equal(amountOf(r, 'parent-father'), 500000)
    assert.equal(amountOf(r, 'parent-mother'), 500000)
  })
  test('12: foreldre døde – helsøsken arver fra begge sider, halvsøsken fra én', () => {
    const A = sibling({ name: 'A' })
    const B = sibling({ name: 'B', type: 'halfMother' })
    const C = sibling({ name: 'C', alive: 'no', children: 2 })
    const r = run(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'yes', siblings: [A, B, C], assets: { bank: '1200000' } }))
    assert.equal(amountOf(r, `sibling-${A.id}`), 500000)
    assert.equal(amountOf(r, `sibling-${B.id}`), 200000)
    assert.equal(amountOf(r, `sibling-child-${C.id}-0`), 250000)
    assert.equal(amountOf(r, `sibling-child-${C.id}-1`), 250000)
    assert.equal(sumPeople(r), 1200000)
  })
  test('bare mor lever, halvsøsken på farssiden tar fars halvdel', () => {
    const r = run(single({ hasChildren: 'no', parents: 'mother', hasSiblings: 'yes', siblings: [sibling({ type: 'halfFather' })], assets: { bank: '1000000' } }))
    assert.equal(amountOf(r, 'parent-mother'), 500000)
    assert.equal(byRelation(r, 'Halvsøsken')[0].amount, 500000)
  })
  test('bare mor lever og ingen på farssiden – mor arver alt', () => {
    const r = run(single({ hasChildren: 'no', parents: 'mother', hasSiblings: 'yes', siblings: [sibling({ type: 'halfMother' })], assets: { bank: '1000000' } }))
    assert.equal(amountOf(r, 'parent-mother'), 1000000)
    assert.equal(byRelation(r, 'Halvsøsken')[0], undefined)
  })
  test('besteforeldre: farfar og en halvtante på farssiden, ingen på morssiden', () => {
    const r = run(single({
      hasChildren: 'no', parents: 'none', hasSiblings: 'no', hasGrandparentLine: 'yes',
      grandparents: {
        father: { gp1: 'yes', gp2: 'no', relatives: [{ id: 't1', type: 'half2', alive: 'yes' }] },
        mother: { gp1: 'no', gp2: 'no', relatives: [] },
      },
      assets: { bank: '800000' },
    }))
    assert.equal(r.skifte.order, 3)
    assert.equal(amountOf(r, 'parent-father-gp1'), 400000)
    assert.equal(byRelation(r, 'Tante/onkel (halv)')[0].amount, 400000)
  })
  test('søskenbarn arver i stedet for en død tante', () => {
    const r = run(single({
      hasChildren: 'no', parents: 'none', hasSiblings: 'no', hasGrandparentLine: 'yes',
      grandparents: {
        father: { gp1: 'no', gp2: 'no', relatives: [{ id: 't', type: 'full', alive: 'no', children: 2 }] },
        mother: { gp1: 'yes', gp2: 'yes' },
      },
      assets: { bank: '800000' },
    }))
    assert.deepEqual(byRelation(r, 'Søskenbarn').map(p => p.amount), [200000, 200000])
    assert.equal(byRelation(r, 'Besteforelder').length, 2)
  })
  test('ingen arvinger – arven går til frivillig arbeid for barn og unge', () => {
    const r = run(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'no', hasGrandparentLine: 'no', assets: { bank: '500000' } }))
    assert.equal(r.skifte.toCharity, 500000)
    assert.ok(r.notices.some(n => n.id === 'toCharity'))
    assert.match(r.who, /frivillig arbeid for barn og unge/)
  })
})

describe('13: Testament', () => {
  test('testament som gir bort for mye, begrenses av pliktdelsarven', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child()], testament: 'yes', testamentContent: ['giveaway'], testamentAmount: '2000000', assets: { bank: '3000000' } }))
    assert.equal(r.skifte.compulsory.perLine, 1000000)
    assert.equal(r.skifte.freePart, 1000000)
    assert.equal(amountOf(r, 'testament'), 1000000)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, 1000000)
    assert.ok(r.notices.some(n => n.id === 'testamentExceeds'))
    assert.ok(r.notices.some(n => n.id === 'testamentNotify'))
  })
  test('pliktdelsarven er begrenset til 15 G per barn', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], testament: 'yes', testamentContent: ['giveaway'], testamentAmount: '9000000', assets: { bank: '9000000' } }))
    assert.equal(r.skifte.compulsory.perLine, 15 * G)
    assert.equal(r.skifte.compulsory.capped, true)
    assert.equal(byRelation(r, 'Barn')[0].amount, 15 * G)
  })
  test('testament som begrenser ektefellen – kjent for ektefellen: bare minstearv', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' })], testament: 'yes', testamentContent: ['limitsPartner'], testamentPartnerKnew: 'yes', assets: sixMillion }))
    assert.equal(amountOf(r, 'partner'), 4 * G)
    assert.equal(byRelation(r, 'Barn')[0].amount, 2500000 - 4 * G)
  })
  test('testament som begrenser ektefellen – ukjent for ektefellen: full arv', () => {
    const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' })], testament: 'yes', testamentContent: ['limitsPartner'], testamentPartnerKnew: 'no', assets: sixMillion }))
    assert.equal(amountOf(r, 'partner'), 625000)
    assert.ok(r.notices.some(n => n.id === 'testamentLimitsPartnerNotKnew'))
  })
  test('testament til samboer etter fem år: 4 G går foran pliktdelsarven', () => {
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'no', hasChildren: 'yes', children: [child({ common: 'no' })], previousUskifte: 'no', advancements: 'no', testament: 'yes', testamentContent: ['toCohabitant'], testamentCohabitantAmount: '2000000', cohabitantFiveYears: 'yes', assets: { bank: '3000000' } }))
    // 4 G foran; pliktdel 2/3 av resten; samboeren får i tillegg den frie delen
    const rest = 3000000 - 4 * G
    const plikt = (2 / 3) * rest
    assert.equal(amountOf(r, 'testament-cohabitant'), Math.round(4 * G + (rest - plikt)))
    assert.equal(byRelation(r, 'Barn')[0].amount, Math.round(plikt))
  })
  test('testament til samboer uten fem år: bare den frie tredjedelen', () => {
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'no', hasChildren: 'yes', children: [child({ common: 'no' })], previousUskifte: 'no', advancements: 'no', testament: 'yes', testamentContent: ['toCohabitant'], testamentCohabitantAmount: '2000000', cohabitantFiveYears: 'no', assets: { bank: '3000000' } }))
    assert.equal(amountOf(r, 'testament-cohabitant'), 1000000)
  })
  test('testament – vet ikke: tydelig forutsetning og eget neste steg', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], testament: 'unknown', assets: { bank: '100000' } }))
    assert.ok(r.assumptions.some(a => a.questionId === 'testament'))
    assert.equal(r.nextSteps[0].id, 'findTestament')
  })
})

describe('14–15: Særeie', () => {
  const sep = { separateProperty: 'yes', separatePropertyWho: 'both', separatePropertyAtDeath: 'no' }
  const assets = { bank: '2000000', sepDeceasedAssets: '1000000', sepSurvivor: '500000' }
  test('14: avdødes særeie inngår helt, gjenlevendes særeie holdes utenfor', () => {
    const r = run(married({ ...sep, hasChildren: 'yes', children: [child({ common: 'yes' })], assets }))
    assert.equal(r.skifte.E, 2000000) // 1 000 000 (halvdel) + 1 000 000 (særeie)
    assert.equal(r.skifte.estate.survivorKeeps, 1500000)
    assert.ok(r.notices.some(n => n.id === 'separateProperty'))
  })
  test('15: særeie + uskifte – særeiet er bare med ved samtykke', () => {
    const r = run(married({ ...sep, hasChildren: 'yes', children: [child({ common: 'yes' })], assets }))
    assert.equal(r.uskifte.rows[0].amount, 2000000)
    assert.ok(r.uskifte.rows.some(x => x.amount === 250000)) // ektefellens 1/4 av særeiet
    assert.ok(r.uskifteNotices.some(n => n.id === 'uskifteSeparateProperty'))
  })
  test('særeie som faller bort ved død regnes som felleseie', () => {
    const r = run(married({ ...sep, separatePropertyAtDeath: 'yes', hasChildren: 'yes', children: [child({ common: 'yes' })], assets }))
    assert.equal(r.skifte.E, 1750000) // (2 000 000 + 1 000 000 + 500 000) / 2
  })
  test('vet ikke om ektepakt: regnes som felleseie, med tydelig forutsetning', () => {
    const r = run(married({ separateProperty: 'unknown', hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '2000000' } }))
    assert.equal(r.skifte.E, 1000000)
    assert.ok(r.assumptions.some(a => a.questionId === 'separateProperty'))
  })
  test('skjevdeling vises som alternativ beregning', () => {
    const r = run(married({ skjevdeling: 'yes', skjevdelingAmounts: { deceased: '1000000' }, hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '3000000' } }))
    assert.equal(r.skifte.E, 1500000)
    assert.equal(r.skifte.estate.skjevdeling.deceasedEstate, 2000000)
    assert.ok(r.notices.some(n => n.id === 'skjevdeling'))
    assert.equal(r.complex, true)
  })
})

describe('16–17: Gjeld og uenighet', () => {
  test('16: gjeld større enn eiendeler – advarsel og offentlig skifte, ikke privat skifte', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], assets: { bank: '100000', otherDebt: '300000' } }))
    assert.equal(r.skifte.estate.insolvent, true)
    assert.equal(r.skifte.E, 0)
    assert.ok(r.skifteNotices.some(n => n.id === 'insolvent' && n.level === 'critical'))
    assert.ok(r.nextSteps.some(s => s.id === 'publicSkifte'))
    assert.ok(!r.nextSteps.some(s => s.id === 'privateSkifte'))
    assert.match(r.howMuchShort, /ingenting igjen/)
  })
  test('lite bo: forslag om bo av liten verdi', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child()], assets: { bank: '120000', funeral: '40000' } }))
    assert.equal(r.facts.smallEstate, true)
    assert.ok(r.nextSteps.some(s => s.id === 'smallEstate'))
  })
  test('usikker gjeld: proklama med seks ukers frist', () => {
    const r = run(single({ hasChildren: 'yes', children: [child()], debtOverview: 'no', assets: { bank: '1000000' } }))
    const n = r.skifteNotices.find(x => x.id === 'debtUncertain')
    assert.match(n.text, /seks uker/)
    assert.ok(r.nextSteps.some(s => s.id === 'proklama'))
  })
  test('17: uenige arvinger – offentlig skifte og bostyrer forklares', () => {
    const r = run(single({ hasChildren: 'yes', children: [child(), child()], circumstances: ['disagreement'], assets: { bank: '1000000' } }))
    assert.ok(r.skifteNotices.some(n => n.id === 'disagreement'))
    assert.ok(r.nextSteps.some(s => s.id === 'publicSkifte'))
    assert.equal(r.complex, true)
  })
})

describe('18: Avdøde satt i uskifte', () => {
  test('samme felles barn får begge halvdelene', () => {
    const r = run(single({ previousUskifte: 'yes', previousUskifteHeirs: 'same', hasChildren: 'yes', children: [child(), child()], assets: { bank: '2000000' } }))
    assert.equal(r.skifte.previous.amount, 1000000)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, 1000000)
    assert.equal(sumPeople(r), 2000000)
  })
  test('andre arvinger etter førstavdøde – halvparten vises separat', () => {
    const r = run(single({ previousUskifte: 'yes', previousUskifteHeirs: 'different', hasChildren: 'yes', children: [child(), child()], assets: { bank: '2000000' } }))
    assert.equal(amountOf(r, 'firstDeceased'), 1000000)
    for (const p of byRelation(r, 'Barn')) assert.equal(p.amount, 500000)
    assert.ok(r.assumptions.some(a => a.questionId === 'previousUskifteHeirs'))
  })
})

describe('19: Forskudd på arv', () => {
  test('forskudd trekkes fra hos mottakeren', () => {
    const kids = [child(), child(), child()]
    const r = run(single({ hasChildren: 'yes', children: kids, advancements: 'yes', advancementAmounts: { [kids[0].id]: '300000' }, assets: { bank: '900000' } }))
    assert.deepEqual(byRelation(r, 'Barn').map(p => p.amount), [100000, 400000, 400000])
  })
  test('forskudd større enn andelen – ingen tilbakebetaling', () => {
    const kids = [child(), child(), child()]
    const r = run(single({ hasChildren: 'yes', children: kids, advancements: 'yes', advancementAmounts: { [kids[0].id]: '1000000' }, assets: { bank: '900000' } }))
    assert.deepEqual(byRelation(r, 'Barn').map(p => p.amount), [0, 450000, 450000])
  })
  test('forskudd påvirker ikke ektefellens arv', () => {
    const kids = [child({ common: 'yes' }), child({ common: 'yes' })]
    const r = run(married({ hasChildren: 'yes', children: kids, advancements: 'yes', advancementAmounts: { [kids[0].id]: '200000' }, assets: sixMillion }))
    assert.equal(amountOf(r, 'partner'), 625000)
    assert.deepEqual(byRelation(r, 'Barn').map(p => p.amount), [837500, 1037500])
  })
})

describe('20: Kombinasjoner', () => {
  test('gift + særkullsbarn + særeie + testament + usikker gjeld', () => {
    const kids = [child({ common: 'yes' }), child({ common: 'no', minor: true })]
    const r = run(married({
      hasChildren: 'yes', children: kids, separateChildrenConsent: 'no',
      separateProperty: 'yes', separatePropertyWho: 'deceased', separatePropertyAtDeath: 'no',
      testament: 'yes', testamentContent: ['giveaway', 'uskifte'], testamentAmount: '300000',
      debtOverview: 'no', assets: { home: '4000000', mortgage: '2000000', sepDeceasedAssets: '1000000' },
    }))
    // E = 1 000 000 + 1 000 000 = 2 000 000; ektefelle max(500 000, 4G) = 546 196
    assert.equal(r.skifte.E, 2000000)
    assert.equal(amountOf(r, 'partner'), 4 * G)
    assert.equal(amountOf(r, 'testament'), 300000)
    assert.equal(sumPeople(r), 2000000)
    for (const id of ['spouseMin4G', 'separateChildren', 'compulsoryShare', 'separateProperty', 'minorHeir']) assert.ok(r.notices.some(n => n.id === id), id)
    assert.ok(r.uskifteNotices.some(n => n.id === 'uskifteMinorConsent'))
    assert.ok(r.uskifteNotices.some(n => n.id === 'uskifteTestament'))
    assert.ok(r.skifteNotices.some(n => n.id === 'debtUncertain'))
    assert.equal(r.uskifte.status, 'partial')
    assert.ok(r.uskifte.rows.some(x => x.label.startsWith('Mottakere i testamentet')))
  })
  test('samboer med felles barn + dødt barn med barnebarn + forskudd', () => {
    const kids = [child({ common: 'yes' }), child({ common: 'yes', alive: 'no', grandchildren: 2 })]
    const r = run(base({ maritalStatus: 'cohabitant', cohabitantChildren: 'yes', previousUskifte: 'no', children: kids, advancements: 'yes', advancementAmounts: { [kids[0].id]: '100000' }, assets: { bank: String(4 * G + 1000000) } }))
    assert.equal(amountOf(r, 'partner'), 4 * G)
    // pool 1 000 000 + forskudd 100 000 = 1 100 000 / 2 = 550 000
    assert.equal(byRelation(r, 'Barn')[0].amount, 450000)
    assert.deepEqual(byRelation(r, 'Barnebarn').map(p => p.amount), [275000, 275000])
  })
  test('gift uten barn + søsken og en død forelder', () => {
    const r = run(married({ hasChildren: 'no', parents: 'father', hasSiblings: 'yes', siblings: [sibling(), sibling()], assets: { bank: '4000000' } }))
    assert.equal(amountOf(r, 'partner'), 1000000)
    assert.equal(amountOf(r, 'parent-father'), 500000)
    for (const p of byRelation(r, 'Søsken')) assert.equal(p.amount, 250000)
  })
  test('bodde i utlandet: kritisk merknad om at annet lands lov kan gjelde', () => {
    const r = run(single({ residence: 'no', hasChildren: 'yes', children: [child()], assets: { bank: '100000' } }))
    assert.ok(r.notices.some(n => n.id === 'livedAbroad' && n.level === 'critical'))
  })
  test('separert: ingen arv til ektefellen', () => {
    const r = run(base({ maritalStatus: 'separated', hasChildren: 'yes', children: [child()], previousUskifte: 'no', advancements: 'no', assets: { bank: '1000000' } }))
    assert.equal(r.skifte.people.some(p => p.isPartner), false)
    assert.equal(byRelation(r, 'Barn')[0].amount, 1000000)
    assert.ok(r.notices.some(n => n.id === 'separated'))
  })
})
