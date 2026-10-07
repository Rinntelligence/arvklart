// Kronebeløp og datoer slik brukerne skriver dem.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseNOK, formatNOK, localDateString, isOverdue } from '../../src/lib/format.js'

describe('parseNOK', () => {
  test('vanlige skrivemåter', () => {
    assert.equal(parseNOK(4500), 4500)
    assert.equal(parseNOK('4500'), 4500)
    assert.equal(parseNOK('1 500 kr'), 1500)
    assert.equal(parseNOK('kr 2000'), 2000)
    assert.equal(parseNOK('1.500'), 1500)
    assert.equal(parseNOK('1.500,-'), 1500)
    assert.equal(parseNOK('1500,50'), 1500.5)
    assert.equal(parseNOK('12 000 NOK'), 12000)
  })

  test('intervall gir midtpunktet', () => {
    assert.equal(parseNOK('1000-2000 kr'), 1500)
    assert.equal(parseNOK('1 000 – 2 000'), 1500)
  })

  test('tekst som ikke er et beløp', () => {
    assert.equal(parseNOK(''), null)
    assert.equal(parseNOK(null), null)
    assert.equal(parseNOK('ukjent'), null)
    assert.equal(parseNOK('ca. 500'), null)
  })
})

describe('formatNOK', () => {
  test('viser beløp i kroner og ukjent tekst som den er', () => {
    assert.match(formatNOK('1 500 kr'), /1\s500/)
    assert.equal(formatNOK('ukjent'), 'ukjent')
    assert.equal(formatNOK(null), '—')
  })
})

describe('datoer', () => {
  test('lokal dato, ikke UTC', () => {
    assert.equal(localDateString(new Date(2026, 9, 7, 0, 30)), '2026-10-07')
  })

  test('frist i dag er ikke forfalt', () => {
    assert.equal(isOverdue('2026-10-07', '2026-10-07'), false)
    assert.equal(isOverdue('2026-10-06', '2026-10-07'), true)
    assert.equal(isOverdue(null, '2026-10-07'), false)
  })
})
