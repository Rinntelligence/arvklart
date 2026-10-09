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
