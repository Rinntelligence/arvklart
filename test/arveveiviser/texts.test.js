// Tekstene skal passe den som bruker veiviseren, og begrunnelsene skal stemme med beregningen.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plain } from '../../public/arveveiviser/text.js'
import { child, married, single, base, run } from './helpers.js'

const all = r => plain([r.who, r.howMuchShort, ...r.situation, ...[...r.notices, ...r.skifteNotices, ...r.uskifteNotices].flatMap(n => [n.title, n.text]), ...r.nextSteps.flatMap(s => [s.title, s.text]), ...(r.uskifte ? [r.uskifte.lead, r.uskifte.consequencesTitle, ...r.uskifte.rows.map(x => x.label), ...r.uskifte.later] : [])].join(' '), r.facts)

test('ektefellen arver alt fordi det ikke finnes andre arvinger – ikke fordi boet er lite', () => {
  const r = run(married({ hasChildren: 'no', parents: 'none', hasSiblings: 'no', assets: { bank: '20000000' } }))
  assert.match(r.who, /ikke etterlot seg barn, foreldre, søsken/)
  assert.doesNotMatch(r.who, /minstearven/)
})

test('når brukeren ikke er gjenlevende, sier ikke tekstene «du» om gjenlevende', () => {
  const r = run(base({ role: 'child', maritalStatus: 'cohabitant', cohabitantChildren: 'yes', previousUskifte: 'no', advancements: 'no', children: [child({ common: 'yes' }), child({ common: 'yes' })], assets: { home: '2000000', bank: '800000' } }))
  const t = all(r)
  assert.doesNotMatch(t, /\b(du|deg)\b|\bdere har eller har hatt\b/)
  assert.match(t, /Hvis samboeren velger uskifte/)
  assert.match(t, /avdøde og samboeren har eller har hatt barn sammen/)
})

test('dødsfall før 2021: ber om veiledning, ikke om å fordele eller svare på spørsmål', () => {
  const r = run(single({ deathDate: '2019-03-01', hasChildren: 'yes', children: [child()], assets: { bank: '1' } }))
  assert.equal(r.nextSteps[0].title, 'Kontakt tingretten for veiledning')
  assert.ok(!r.nextSteps.some(s => ['divide', 'privateSkifte', 'register'].includes(s.id)))
})

test('ingen arvinger: forteller hvor arven går, og ber ikke om å fordele eiendelene', () => {
  const r = run(single({ hasChildren: 'no', parents: 'none', hasSiblings: 'no', hasGrandparentLine: 'no', assets: { bank: '400000' } }))
  assert.match(r.howMuchShort, /frivillig arbeid for barn og unge/)
  assert.ok(r.nextSteps.some(s => s.id === 'noHeirs'))
  assert.ok(!r.nextSteps.some(s => s.id === 'divide'))
})

test('testament til samboer: grensen tar med de 4 G samboeren kan få etter fem år', () => {
  const r = run(base({ role: 'survivor', maritalStatus: 'cohabitant', cohabitantChildren: 'no', hasChildren: 'yes', children: [child({ common: 'no' })], previousUskifte: 'no', advancements: 'no', testament: 'yes', testamentContent: ['toCohabitant'], testamentCohabitantAmount: '2000000', cohabitantFiveYears: 'yes', assets: { bank: '3000000' } }))
  const n = r.notices.find(x => x.id === 'testamentExceeds')
  const got = r.skifte.people.find(p => p.id === 'testament-cohabitant').amount
  assert.ok(plain(n.text, r.facts).replace(/\s/g, '').includes(String(got)), `${n.text} skal nevne ${got}`)
  assert.match(r.who, /^Du \(etter testamentet\)/)
  assert.match(r.howMuchShort, /etter testamentet/)
})

test('gjeld større enn eiendelene: uskifte vises ikke som et valg', () => {
  const r = run(married({ role: 'survivor', hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '100000', otherDebt: '900000' } }))
  assert.equal(r.uskifte, null)
  assert.ok(!r.nextSteps.some(s => s.id === 'decideUskifte'))
  assert.ok(r.situation.some(t => /Gjelden er .* større enn det dere eide sammen/.test(t)))
})

test('ett dødt barn uten navn er «dødt», og to felles barn er «begge»', () => {
  const r = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' }), child({ common: 'yes', alive: 'no', grandchildren: 1 })], assets: { bank: '1000000' } }))
  assert.ok(r.situation.some(t => /Ett av barna er dødt/.test(t)))
  const r2 = run(married({ hasChildren: 'yes', children: [child({ common: 'yes' }), child({ common: 'yes' })], assets: { bank: '1000000' } }))
  assert.ok(r2.situation.some(t => /begge er felles barn/.test(t)))
})

test('enke eller enkemann som giftet seg på nytt, får ikke spørsmål om tidligere uskifte', () => {
  for (const m of ['married', 'separated', 'unknown']) assert.equal(run(base({ maritalStatus: m })).facts.askPreviousUskifte, false)
  for (const m of ['none', 'cohabitant']) assert.equal(run(base({ maritalStatus: m })).facts.askPreviousUskifte, true)
})
