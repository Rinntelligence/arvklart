// Rapport (PDF-innhold), svaroversikt og data som lagres i boet.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { child, married, single, base } from './helpers.js'
import { buildReport, toEstatePayload, answerSummary, WIZARD_TAG } from '../../public/arveveiviser/report.js'
import { deriveFacts } from '../../public/arveveiviser/facts.js'
import { plain } from '../../public/arveveiviser/text.js'

const familyAnswers = married({
  role: 'survivor', hasChildren: 'yes',
  children: [child({ common: 'yes', name: 'Ola' }), child({ common: 'yes' }), child({ common: 'no', name: 'Kari' })],
  separateChildrenConsent: 'no', assets: { home: '5000000', bank: '1000000', mortgage: '1000000' },
})

const strings = v => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [])
const allText = report => strings(report.sections).join('\n')

describe('PDF-rapporten', () => {
  const report = buildReport(familyAnswers, { date: new Date('2026-10-05') })
  const headings = report.sections.map(s => s.heading)

  test('har alle hoveddelene i riktig rekkefølge', () => {
    assert.deepEqual(headings, ['Kort fortalt', 'Din situasjon', 'Hvis dere skifter nå', 'Hvis du velger uskifte', 'Hva betyr dette for dere?', 'Dette bør dere gjøre nå', 'Slik har vi kommet frem til dette', 'Dine svar', 'Kilder'])
  })
  test('fordelingstabellen viser hver arving, beløp, andel og sum', () => {
    const table = report.sections[2].blocks.find(b => b.type === 'table' && b.columns[0] === 'Arving')
    const names = table.rows.map(r => r.cells[0])
    assert.deepEqual(names, ['Gjenlevende ektefelle', 'Ola', 'Barn 2', 'Kari', 'Sum'])
    assert.equal(table.rows.at(-1).cells[2], '2 500 000 kr')
    assert.ok(table.rows.find(r => r.cells[0] === 'Kari').cells[1].includes('særkullsbarn'))
  })
  test('tar med uskifte-tallene og særkullsbarnets utbetaling', () => {
    const u = report.sections.find(s => s.heading === 'Hvis du velger uskifte')
    const rows = u.blocks.find(b => b.type === 'table').rows.map(r => r.cells[0])
    assert.ok(rows.some(r => r.startsWith('Kari får nå')))
  })
  test('inneholder ingen skjermmarkering eller plassholdere', () => {
    const text = allText(report)
    assert.doesNotMatch(text, /\[\[|\]\]|\*\*|\{partner/)
  })
  test('har dato, ansvarsfraskrivelse og kilder med lenker', () => {
    assert.match(report.subtitle, /5\. oktober 2026/)
    assert.match(report.disclaimer, /ikke juridisk rådgivning/)
    const sources = report.sections.at(-1).blocks[0].items
    assert.ok(sources.length > 5)
    assert.ok(sources.every(s => /https:\/\//.test(s)))
  })
  test('blokkerte resultater forklarer hva som må avklares, uten tall', () => {
    const r = buildReport(single({ hasChildren: 'unknown' }))
    assert.equal(r.sections[1].heading, 'Dette må avklares først')
    assert.ok(!r.sections.some(s => s.heading === 'Slik fordeles boet'))
  })
})

describe('Svaroversikten', () => {
  test('lister alle synlige spørsmål med lesbare svar og del', () => {
    const rows = answerSummary(familyAnswers, deriveFacts(familyAnswers))
    const children = rows.find(r => r.id === 'children')
    assert.equal(children.section, 'Familie')
    assert.equal(children.answer, 'Ola (felles barn); Barn 2 (felles barn); Kari (fra et annet forhold)')
    assert.match(rows.find(r => r.id === 'assets').answer, /Eiendeler 6 000 000 kr, gjeld 1 000 000 kr/)
    assert.equal(rows.find(r => r.id === 'maritalStatus').question, 'Var du gift eller samboer med avdøde?')
  })
})

describe('Data som lagres i boet', () => {
  const p = toEstatePayload(familyAnswers)
  test('arvinger med prosent som summerer til 100 og merket fra veiviseren', () => {
    assert.equal(p.totalValue, 2500000)
    assert.equal(p.heirs.length, 4)
    const sum = p.heirs.reduce((s, h) => s + h.percentage, 0)
    assert.ok(Math.abs(sum - 100) < 0.1, String(sum))
    assert.ok(p.heirs.every(h => h.notes.startsWith(WIZARD_TAG)))
    assert.equal(p.heirs[0].name, 'Meg (gjenlevende)')
    assert.equal(p.heirs[0].relationship, 'Ektefelle / Partner')
    assert.equal(p.heirs[0].percentage, 25)
    assert.ok(p.heirs.find(h => h.name === 'Kari').notes.includes('Særkullsbarn'))
  })
  test('neste steg blir oppgaver med kategori fra oppgavesiden', () => {
    assert.ok(p.tasks.length >= 4)
    for (const t of p.tasks) {
      assert.ok(['Umiddelbart', 'Uke 1', 'Måned 1', 'Fordeling'].includes(t.category), t.category)
      assert.ok(t.description.endsWith(`· ${WIZARD_TAG}`))
      assert.doesNotMatch(t.title + t.description, /\[\[|\{partner/)
    }
  })
  test('uten tall lagres bare oppgaver', () => {
    const q = toEstatePayload(base({ maritalStatus: 'unknown' }))
    assert.equal(q.totalValue, null)
    assert.equal(q.heirs.length, 0)
    assert.equal(q.tasks[0].category, 'Umiddelbart')
  })
  test('slektsarvinger får riktig relasjon', () => {
    const q = toEstatePayload(single({ hasChildren: 'no', parents: 'both', assets: { bank: '100000' } }))
    assert.deepEqual(q.heirs.map(h => h.relationship), ['Forelder', 'Forelder'])
  })
})

describe('Tekst', () => {
  test('plain fjerner fagord-markering og fyller inn partner', () => {
    assert.equal(plain('Et [[saerkullsbarn]] og [[uskifte|uskiftet]] hos {partner}', { married: true }), 'Et særkullsbarn og uskiftet hos ektefellen')
  })
})
