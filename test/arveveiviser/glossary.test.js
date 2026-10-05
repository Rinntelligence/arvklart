// Fagord får forklaring automatisk der de står i tekst.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkTerms, termsIn, TERMS } from '../../public/arveveiviser/glossary.js'
import { QUESTIONS } from '../../public/arveveiviser/questions.js'
import { NOTICES } from '../../public/arveveiviser/rules.js'

test('første forekomst av et fagord markeres, med bøyning og stor forbokstav', () => {
  assert.equal(linkTerms('Samtykker særkullsbarna til uskifte? Særkullsbarna må svare.'), 'Samtykker [[saerkullsbarn|særkullsbarna]] til [[uskifte|uskifte]]? Særkullsbarna må svare.')
  assert.equal(linkTerms('Særeie og felleseiet'), '[[saereie|Særeie]] og [[felleseie|felleseiet]]')
})
test('lengre ord vinner over kortere, og markerte ord røres ikke', () => {
  assert.equal(linkTerms('Uskifteboet deles.'), '[[uskiftebo|Uskifteboet]] deles.')
  assert.equal(linkTerms('Se [[uskifteattest]] og [[privatSkifte|privat skifte]].'), 'Se [[uskifteattest]] og [[privatSkifte|privat skifte]].')
})
test('ord som bare ligner, markeres ikke', () => {
  assert.equal(linkTerms('Ektepaktregisteret'), 'Ektepaktregisteret')
})
test('alle fagord i spørsmål og forklaringer har en definisjon', () => {
  const texts = [...QUESTIONS.flatMap(q => [q.title, typeof q.why === 'function' ? q.why({ hasPartner: true, previousUskifte: true }) : q.why, q.learnMore?.text]), ...NOTICES.flatMap(n => [n.text, n.more])].filter(Boolean)
  for (const t of texts) for (const k of termsIn(t)) assert.ok(TERMS[k], `${k} mangler i TERMS`)
  for (const m of texts.join(' ').matchAll(/\[\[([^\]|]+)/g)) assert.ok(TERMS[m[1]], `ukjent fagord ${m[1]}`)
})
