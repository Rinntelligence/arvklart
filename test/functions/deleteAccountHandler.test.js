// delete-account: bare POST, bare innlogget bruker, aldri demokontoene, og bare kontoen som eier innloggingen.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/deleteAccountHandler.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const preflight = req => (req.method === 'OPTIONS' ? new Response('ok') : null)
// Simulert Supabase Auth: bare «gyldig» gir en bruker; mangler, er ugyldig eller utløpt → null
const users = { 'Bearer gyldig': { id: 'u-me', email: 'meg@test.no' }, 'Bearer demo': { id: 'u-mona', email: 'mona.demo@heirsplit.no' } }
const getUser = async req => users[req.headers.get('Authorization')] || null
const setup = () => {
  const deleted = []
  const deps = { preflight, getUser, json, isDemoEmail: e => /\.demo@heirsplit\.no$/i.test(e || ''), deleteData: async id => { deleted.push(id); return { ok: true } } }
  return { deleted, deps }
}
const req = (method, auth, body) => new Request('https://x/functions/v1/delete-account', { method, headers: auth ? { Authorization: auth } : {}, body })

describe('delete-account', { skip }, () => {
  test('CORS-preflight svarer uten å slette', async () => {
    const { deleted, deps } = setup()
    assert.equal((await mod.handleDeleteAccount(req('OPTIONS'), deps)).status, 200)
    assert.deepEqual(deleted, [])
  })
  test('andre metoder enn POST avvises med 405, også med gyldig innlogging', async () => {
    const { deleted, deps } = setup()
    for (const m of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
      const res = await mod.handleDeleteAccount(req(m, 'Bearer gyldig'), deps)
      assert.equal(res.status, 405, m)
    }
    assert.deepEqual(deleted, [])
  })
  test('manglende, ugyldig eller utløpt innlogging avvises med 401', async () => {
    const { deleted, deps } = setup()
    for (const auth of [null, 'Bearer ugyldig', 'Bearer utlopt', 'Bearer anon-nokkel']) {
      const res = await mod.handleDeleteAccount(req('POST', auth), deps)
      assert.equal(res.status, 401, String(auth))
      assert.equal((await res.json()).code, 'unauthorized')
    }
    assert.deepEqual(deleted, [])
  })
  test('demokontoene kan ikke slettes', async () => {
    const { deleted, deps } = setup()
    const res = await mod.handleDeleteAccount(req('POST', 'Bearer demo'), deps)
    assert.equal(res.status, 403)
    assert.deepEqual(deleted, [])
  })
  test('sletter bare kontoen som eier innloggingen, uansett hva forespørselen inneholder', async () => {
    const { deleted, deps } = setup()
    const res = await mod.handleDeleteAccount(req('POST', 'Bearer gyldig', JSON.stringify({ user_id: 'u-kari', userId: 'u-kari' })), deps)
    assert.equal(res.status, 200)
    assert.deepEqual(deleted, ['u-me'])
  })
  test('feil under slettingen gir fast kode uten detaljer', async () => {
    const { deps } = setup()
    deps.deleteData = async () => { throw new Error('hemmelig detalj') }
    const res = await mod.handleDeleteAccount(req('POST', 'Bearer gyldig'), deps)
    const body = await res.json()
    assert.equal(res.status, 500)
    assert.equal(body.code, 'delete_failed')
    assert.ok(!JSON.stringify(body).includes('hemmelig'))
  })
})
