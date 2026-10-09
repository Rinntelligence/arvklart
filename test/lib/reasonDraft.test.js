import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { readReasonDraft, writeReasonDraft, clearReasonDraft, clearAllReasonDrafts } from '../../src/lib/reasonDraft.js'

// Enkel sessionStorage for testene
const fakeStorage = () => {
  const m = new Map()
  return {
    get length() { return m.size },
    key: i => [...m.keys()][i] ?? null,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  }
}
const setStorage = s => Object.defineProperty(globalThis, 'sessionStorage', { value: s, configurable: true, writable: true })

beforeEach(() => setStorage(fakeStorage()))

test('utkast lagres og leses per bruker og gjenstand', () => {
  writeReasonDraft('u1', 'i1', 'Husker den fra hytta')
  assert.equal(readReasonDraft('u1', 'i1'), 'Husker den fra hytta')
  assert.equal(readReasonDraft('u1', 'i2'), null)
  assert.equal(readReasonDraft('u2', 'i1'), null)
})

test('tom tekst eller bare mellomrom fjerner utkastet', () => {
  writeReasonDraft('u1', 'i1', 'tekst')
  writeReasonDraft('u1', 'i1', '   ')
  assert.equal(readReasonDraft('u1', 'i1'), null)
  writeReasonDraft('u1', 'i1', 'tekst')
  clearReasonDraft('u1', 'i1')
  assert.equal(readReasonDraft('u1', 'i1'), null)
})

test('utlogging fjerner alle utkast, men ikke annen lagring i fanen', () => {
  writeReasonDraft('u1', 'i1', 'a')
  writeReasonDraft('u1', 'i2', 'b')
  sessionStorage.setItem('noe-annet', 'x')
  clearAllReasonDrafts()
  assert.equal(readReasonDraft('u1', 'i1'), null)
  assert.equal(readReasonDraft('u1', 'i2'), null)
  assert.equal(sessionStorage.getItem('noe-annet'), 'x')
})

test('tåler at lagringen mangler eller kaster (privat vindu)', () => {
  setStorage(undefined)
  assert.doesNotThrow(() => writeReasonDraft('u1', 'i1', 'a'))
  assert.equal(readReasonDraft('u1', 'i1'), null)
  const broken = { getItem() { throw new Error('blokkert') }, setItem() { throw new Error('blokkert') }, removeItem() { throw new Error('blokkert') }, key() { throw new Error('blokkert') }, get length() { throw new Error('blokkert') } }
  setStorage(broken)
  assert.doesNotThrow(() => writeReasonDraft('u1', 'i1', 'a'))
  assert.doesNotThrow(() => clearAllReasonDrafts())
  assert.equal(readReasonDraft('u1', 'i1'), null)
})
