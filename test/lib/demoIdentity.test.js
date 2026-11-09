// Hvem som er demokonto i appen (src/lib/demoIdentity.js): merket app_metadata.arvklart_demo, som bare serveren kan
// sette, og i overgangen det gamle e-postmønsteret. Samme regel som is_demo_user() og edge-funksjonene.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoRole, isDemoUser, isDemoSession } from '../../src/lib/demoIdentity.js'

const session = user => ({ user })

test('vanlige brukere er ikke demo', () => {
  assert.equal(isDemoSession(session({ email: 'eva@test.no', app_metadata: { provider: 'email' } })), false)
  assert.equal(isDemoSession(session({ email: 'eva@test.no' })), false)
  assert.equal(isDemoSession(null), false)
  assert.equal(isDemoSession({}), false)
})

test('et merke i user_metadata (som brukeren selv styrer) gjør ingen til demo', () => {
  assert.equal(isDemoSession(session({ email: 'eva@test.no', user_metadata: { arvklart_demo: 'mona' } })), false)
})

test('ukjente verdier i merket gjør ingen til demo', () => {
  for (const v of ['admin', 'Mona', '', true, 1]) assert.equal(isDemoUser({ email: 'eva@test.no', app_metadata: { arvklart_demo: v } }), false, String(v))
})

test('merkede demokontoer er demo uansett e-post', () => {
  for (const role of ['mona', 'kari', 'lars']) {
    assert.equal(demoRole({ app_metadata: { arvklart_demo: role } }), role)
    assert.equal(isDemoSession(session({ email: `${role}.demo@arvklart.no`, app_metadata: { arvklart_demo: role } })), true)
    assert.equal(isDemoSession(session({ email: 'endret@et-annet-domene.no', app_metadata: { arvklart_demo: role } })), true)
  }
})

test('overgang: de gamle e-postene uten merke er fortsatt demo', () => {
  assert.equal(isDemoSession(session({ email: 'mona.demo@heirsplit.no' })), true)
  assert.equal(isDemoSession(session({ email: 'Kari.Demo@HeirSplit.no' })), true)
})
