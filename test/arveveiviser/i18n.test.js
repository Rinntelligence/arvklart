// Språk i arveveiviseren (public/arveveiviser/i18n.js): norsk er standard; engelsk bare når det er bedt om,
// og mangler en engelsk tekst, vises den norske.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { tr, field, getLang, setLang, isEn, dateLocale } from '../../public/arveveiviser/i18n.js'

afterEach(() => setLang('no'))

test('norsk er standard (ingen ?lang=en i Node)', () => {
  assert.equal(getLang(), 'no')
  assert.equal(tr('Neste', 'Next'), 'Neste')
  assert.equal(dateLocale(), 'nb-NO')
})

test('engelsk når det er valgt; norsk når engelsk tekst mangler', () => {
  setLang('en')
  assert.equal(isEn(), true)
  assert.equal(tr('Neste', 'Next'), 'Next')
  assert.equal(tr('Neste'), 'Neste')
  assert.equal(dateLocale(), 'en-GB')
})

test('field() leser *_en fra innholdet på engelsk, ellers den norske', () => {
  const q = { title: 'Hvem er du?', title_en: 'Who are you?', why: 'Fordi' }
  assert.equal(field(q, 'title'), 'Hvem er du?')
  setLang('en')
  assert.equal(field(q, 'title'), 'Who are you?')
  assert.equal(field(q, 'why'), 'Fordi')
  assert.equal(field(null, 'title'), undefined)
  setLang('de')
  assert.equal(getLang(), 'no', 'ukjent språk gir norsk')
})

// ── Innholdet på engelsk (E2) ─────────────────────────────────────────────────────────────────────────
import { buildReport, toEstatePayload } from '../../public/arveveiviser/report.js'
import { QUESTIONS } from '../../public/arveveiviser/questions.js'
import { NOTICES, NEXT_STEPS } from '../../public/arveveiviser/rules.js'
import { SOURCES } from '../../public/arveveiviser/sources.js'
import { TERMS } from '../../public/arveveiviser/glossary.js'
import { child, married } from './helpers.js'

const scenario = married({ role: 'survivor', hasChildren: 'yes', children: [child({ common: 'yes' })], assets: { bank: '3000000' } })

test('alt innhold har engelsk: spørsmål, svaralternativer, varsler, steg, kilder og ordliste', () => {
  const missing = []
  for (const q of QUESTIONS) {
    for (const k of ['title', 'titleSurvivor', 'titleMarried', 'why']) if (q[k] && q[`${k}_en`] == null) missing.push(`${q.id}.${k}`)
    for (const o of q.options || []) for (const k of ['label', 'hint', 'hintSurvivor']) if (o[k] && o[`${k}_en`] == null) missing.push(`${q.id}.${o.value}.${k}`)
    for (const k of ['title', 'text']) if (q.learnMore?.[k] && q.learnMore[`${k}_en`] == null) missing.push(`${q.id}.learnMore.${k}`)
  }
  for (const r of [...NOTICES, ...NEXT_STEPS]) for (const k of ['title', 'text', 'more']) if (r[k] && r[`${k}_en`] == null) missing.push(`${r.id}.${k}`)
  for (const [id, s] of Object.entries(SOURCES)) if (s.title_en == null) missing.push(`kilde ${id}`)
  for (const [id, t] of Object.entries(TERMS)) if (t.def_en == null) missing.push(`ordliste ${id}`)
  assert.deepEqual(missing, [])
})

test('PDF-rapporten er på engelsk med ?lang=en, med merknad om at norsk gjelder', () => {
  setLang('en')
  const rep = buildReport(scenario, { date: new Date('2026-10-09') })
  assert.equal(rep.title, 'Inheritance settlement – overview')
  assert.equal(rep.sections[0].heading, 'In brief')
  assert.match(rep.disclaimer, /Norwegian version is the authoritative one/)
})

test('det som lagres i boet er alltid norsk (delt innhold), også når veiviseren er på engelsk', () => {
  setLang('en')
  const p = toEstatePayload(scenario)
  assert.equal(getLang(), 'en', 'språket settes tilbake etterpå')
  assert.ok(p.tasks.length > 0)
  assert.ok(p.tasks.every(t => /Fra arveveiviseren/.test(t.description)))
  assert.ok(p.tasks.some(t => /tingretten|skifte|testament/i.test(t.title + t.description)), 'oppgavene skal være på norsk')
  assert.ok(!p.tasks.some(t => /\b(the|district court)\b/.test(t.title)), 'oppgavene ble lagret på engelsk')
  assert.equal(p.heirs.find(h => h.key === 'partner')?.name, 'Meg (gjenlevende)')
})
