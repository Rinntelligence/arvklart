// «Sist oppdatert» i personvernerklæringen: én dato (src/lib/privacy.js), aldri en fast tekst i siden.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PRIVACY_UPDATED } from '../../src/lib/privacy.js'

test('datoen er gyldig og ikke i fremtiden', () => {
  assert.match(PRIVACY_UPDATED, /^\d{4}-\d{2}-\d{2}$/)
  const d = new Date(`${PRIVACY_UPDATED}T00:00:00Z`)
  assert.ok(!Number.isNaN(d.getTime()))
  assert.ok(d.getTime() <= Date.now(), 'datoen er i fremtiden')
})

test('personvernsiden viser datoen fra privacy.js, ikke en fast tekst', () => {
  const src = readFileSync(new URL('../../src/pages/OtherPages.jsx', import.meta.url), 'utf8')
  assert.match(src, /PRIVACY_UPDATED/)
  assert.doesNotMatch(src, /Sist oppdatert: [a-zæøå]+ \d{4}/i)
})
