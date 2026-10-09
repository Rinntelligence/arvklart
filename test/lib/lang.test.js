// Språk per konto (src/lib/lang.js): kontoens språk vinner over nettleserens, uten å laste siden på nytt i ring.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { adoptProfileLang, initialProfileLang, getLang, setLang } from '../../src/lib/lang.js'

const fakeStorage = () => {
  const m = new Map()
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}
const set = (name, v) => Object.defineProperty(globalThis, name, { value: v, configurable: true, writable: true })
beforeEach(() => { set('localStorage', fakeStorage()); set('sessionStorage', fakeStorage()) })

test('norsk er standard, og «ikke valgt» (null) endrer ingenting', () => {
  assert.equal(getLang(), 'no')
  assert.equal(adoptProfileLang(null), false)
  assert.equal(adoptProfileLang('de'), false, 'ukjent språk ignoreres')
  assert.equal(getLang(), 'no')
})

test('kontoens språk tas i bruk én gang, og siden lastes på nytt bare når det er et annet språk', () => {
  assert.equal(adoptProfileLang('en'), true)
  assert.equal(getLang(), 'en')
  assert.equal(adoptProfileLang('en'), false, 'samme språk: ingen ny lasting')
})

test('ingen løkke: samme bytte forsøkes ikke to ganger i samme fane', () => {
  assert.equal(adoptProfileLang('en'), true)
  setLang('no') // f.eks. en annen fane har byttet tilbake
  assert.equal(adoptProfileLang('en'), false)
})

test('ingen løkke når nettleseren ikke kan lagre språket (blokkert lagring)', () => {
  const broken = { getItem() { throw new Error('blokkert') }, setItem() { throw new Error('blokkert') }, removeItem() {} }
  set('localStorage', broken)
  set('sessionStorage', broken)
  assert.equal(adoptProfileLang('en'), false)
})

test('ny profil får engelsk bare hvis brukeren valgte det før innlogging', () => {
  assert.equal(initialProfileLang(), null)
  setLang('en')
  assert.equal(initialProfileLang(), 'en')
})
