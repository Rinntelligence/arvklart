import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scaleFor, getTextSize, TEXT_SIZES } from '../../src/lib/textSize.js'

test('tekststørrelse: kjente valg gir riktig skala, ukjente gir normal', () => {
  assert.equal(scaleFor('normal'), 1)
  assert.equal(scaleFor('large'), 1.18)
  assert.equal(scaleFor('xlarge'), 1.35)
  assert.equal(scaleFor('huge'), 1)
  assert.deepEqual(TEXT_SIZES.map(s => s.key), ['normal', 'large', 'xlarge'])
})

test('tekststørrelse: uten lagring (Node/privat modus) er standard normal', () => {
  assert.equal(getTextSize(), 'normal')
})
