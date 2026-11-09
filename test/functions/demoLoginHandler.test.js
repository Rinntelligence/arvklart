// demo-login: bare demokontoen Mona, nullstilling før innlogging, og bare passordet settes tilbake (aldri e-posten).
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const TS = !!process.features?.typescript
const mod = TS ? await import('../../supabase/functions/_shared/demoLoginHandler.ts') : null
const skip = !TS && 'Node uten TypeScript-støtte'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const preflight = req => (req.method === 'OPTIONS' ? new Response('ok') : null)
const req = (method = 'POST') => new Request('https://x/functions/v1/demo-login', { method })

const MONA = { id: 'u-mona', email: 'mona.demo@arvklart.no', app_metadata: { arvklart_demo: 'mona' } }
const LEGACY = { id: 'u-mona', email: 'mona.demo@heirsplit.no', app_metadata: {} }

// Simulert Auth: kontoer per id, gjeldende passord, og alt som gjøres logges i calls
function setup({ users = { 'u-mona': MONA }, password = 'riktig', current = 'riktig', resetError = null, demoUserId = 'u-mona', findMona } = {}) {
  const calls = []
  const state = { current }
  const deps = {
    preflight, json, password, demoUserId,
    getUserById: async id => { calls.push(['getUserById', id]); return users[id] || null },
    findMona: findMona || (async () => { calls.push(['findMona']); return users['u-mona'] || null }),
    resetDemo: async () => { calls.push(['reset']); return { error: resetError } },
    signIn: async (email, pw) => { calls.push(['signIn', email]); return pw === state.current ? { access_token: 'a', refresh_token: 'r' } : null },
    setPassword: async (id, pw) => { calls.push(['setPassword', id]); state.current = pw; return { error: null } },
    log: () => {},
  }
  return { deps, calls, state }
}

describe('demo-login', { skip }, () => {
  test('logger inn på merket Mona med kontoens nåværende e-post, etter nullstilling', async () => {
    const { deps, calls } = setup()
    const res = await mod.handleDemoLogin(req(), deps)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { access_token: 'a', refresh_token: 'r' })
    assert.deepEqual(calls.map(c => c[0]), ['getUserById', 'reset', 'signIn'])
    assert.equal(calls.find(c => c[0] === 'signIn')[1], 'mona.demo@arvklart.no')
  })
  test('overgang: den gamle e-posten uten merke godtas', async () => {
    const { deps } = setup({ users: { 'u-mona': LEGACY } })
    assert.equal((await mod.handleDemoLogin(req(), deps)).status, 200)
  })
  test('uten DEMO_USER_ID letes Mona opp etter merket', async () => {
    const { deps, calls } = setup({ demoUserId: null })
    assert.equal((await mod.handleDemoLogin(req(), deps)).status, 200)
    assert.equal(calls[0][0], 'findMona')
  })
  test('nullstillingen feiler: ingen slippes inn (503), og det logges ikke inn', async () => {
    const { deps, calls } = setup({ resetError: { message: 'demoen er ikke satt opp' } })
    const res = await mod.handleDemoLogin(req(), deps)
    assert.equal(res.status, 503)
    assert.ok(!('access_token' in await res.json()))
    assert.ok(!calls.some(c => c[0] === 'signIn' || c[0] === 'setPassword'))
  })
  test('DEMO_USER_ID peker på en vanlig konto: den røres ikke, og demoen nullstilles ikke', async () => {
    const { deps, calls } = setup({ users: { 'u-mona': { id: 'u-mona', email: 'eva@test.no', app_metadata: {} } } })
    assert.equal((await mod.handleDemoLogin(req(), deps)).status, 503)
    assert.deepEqual(calls.map(c => c[0]), ['getUserById'])
  })
  test('en konto merket som Kari er ikke Mona', async () => {
    const { deps, calls } = setup({ users: { 'u-mona': { id: 'u-mona', email: 'kari.demo@arvklart.no', app_metadata: { arvklart_demo: 'kari' } } } })
    assert.equal((await mod.handleDemoLogin(req(), deps)).status, 503)
    assert.ok(!calls.some(c => ['reset', 'signIn', 'setPassword'].includes(c[0])))
  })
  test('den gamle e-posten med et annet merke er ikke Mona', async () => {
    const { deps } = setup({ users: { 'u-mona': { id: 'u-mona', email: 'mona.demo@heirsplit.no', app_metadata: { arvklart_demo: 'lars' } } } })
    assert.equal((await mod.handleDemoLogin(req(), deps)).status, 503)
  })
  test('passordet er endret fra en demoøkt: bare passordet settes tilbake, e-posten aldri', async () => {
    const { deps, calls, state } = setup({ current: 'endret-av-besokende' })
    const res = await mod.handleDemoLogin(req(), deps)
    assert.equal(res.status, 200)
    assert.equal(state.current, 'riktig')
    assert.deepEqual(calls.map(c => c[0]), ['getUserById', 'reset', 'signIn', 'setPassword', 'signIn'])
    // setPassword-avhengigheten tar bare id og passord; ingen e-post sendes videre
    assert.equal(deps.setPassword.length, 2)
  })
  test('ingen konto eller manglende DEMO_PASSWORD gir 503 uten endringer', async () => {
    for (const opts of [{ users: {} }, { password: '' }, { demoUserId: null, findMona: async () => null }]) {
      const { deps, calls } = setup(opts)
      assert.equal((await mod.handleDemoLogin(req(), deps)).status, 503)
      assert.ok(!calls.some(c => ['reset', 'signIn', 'setPassword'].includes(c[0])))
    }
  })
  test('bare POST; feil gir fast svar uten detaljer', async () => {
    const { deps } = setup()
    assert.equal((await mod.handleDemoLogin(req('GET'), deps)).status, 405)
    assert.equal((await mod.handleDemoLogin(req('OPTIONS'), deps)).status, 200)
    deps.getUserById = async () => { throw new Error('hemmelig detalj') }
    const res = await mod.handleDemoLogin(req(), deps)
    assert.equal(res.status, 503)
    assert.deepEqual(await res.json(), { error: 'Demoen er ikke tilgjengelig akkurat nå' })
  })
})
