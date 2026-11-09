// scripts/demo-identity.mjs mot en simulert Supabase (Auth Admin API og PostgREST-telling), uten nettverk ut.
// Skriptet endrer demokontoene i produksjonens Auth, så det må: endre ingenting uten flagg, kreve bekreftede id-er,
// aldri merke en konto som er i andre bo, beholde øvrig app_metadata, og kunne rulles tilbake.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../../scripts/demo-identity.mjs', import.meta.url))
const DEMO = 'deed0001-0000-0000-0000-000000000001'

function fakeSupabase({ users, otherEstates = {} }) {
  const writes = []
  const byId = id => users.find(u => u.id === id)
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(body === undefined ? '' : JSON.stringify(body)) }
    let raw = ''
    req.on('data', c => { raw += c })
    req.on('end', () => {
      if (url.pathname === '/auth/v1/admin/users' && req.method === 'GET') return send(200, { users, aud: 'authenticated' })
      const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/)
      if (m) {
        const u = byId(m[1])
        if (!u) return send(404, { msg: 'not found' })
        if (req.method === 'PUT') {
          const body = JSON.parse(raw || '{}')
          writes.push({ id: u.id, body })
          if (body.app_metadata) for (const [k, v] of Object.entries(body.app_metadata)) { if (v === null) delete u.app_metadata[k]; else u.app_metadata[k] = v }
          if (body.email) { u.email = body.email; u.email_confirmed_at = new Date().toISOString() }
          if (body.ban_duration) u.banned_until = body.ban_duration === 'none' ? null : '2126-01-01T00:00:00Z'
        }
        return send(200, u)
      }
      const t = url.pathname.match(/^\/rest\/v1\/(estate_members|estates)$/)
      if (t) {
        const id = (url.searchParams.get('user_id') || url.searchParams.get('owner_id') || '').replace('eq.', '')
        const n = t[1] === 'estate_members' ? (otherEstates[id]?.members || 0) : (otherEstates[id]?.owner || 0)
        return send(200, [], { 'content-range': `*/${n}` })
      }
      send(404, {})
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, writes, url: `http://127.0.0.1:${server.address().port}` })))
}

const run = (url, args) => new Promise(resolve => execFile(process.execPath, [SCRIPT, ...args], {
  env: { ...process.env, SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'test-nokkel-som-aldri-skrives-ut' },
}, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, out: stdout + stderr })))

const demoUsers = () => [
  { id: '00000000-0000-4000-8000-00000000000b', email: 'kari.demo@heirsplit.no', app_metadata: { provider: 'email', providers: ['email'] } },
  { id: '00000000-0000-4000-8000-00000000000c', email: 'lars.demo@heirsplit.no', app_metadata: { provider: 'email', providers: ['email'] } },
  { id: '00000000-0000-4000-8000-00000000000d', email: 'mona.demo@heirsplit.no', app_metadata: { provider: 'email', providers: ['email'] } },
  { id: '00000000-0000-4000-8000-0000000000e1', email: 'eva@test.no', app_metadata: { provider: 'email' } },
]
const IDS = '--expect-ids=kari:00000000-0000-4000-8000-00000000000b,lars:00000000-0000-4000-8000-00000000000c,mona:00000000-0000-4000-8000-00000000000d'

describe('scripts/demo-identity.mjs', () => {
  test('tørrkjøring endrer ingenting, viser id-ene og skriver aldri ut nøkkelen', async () => {
    const f = await fakeSupabase({ users: demoUsers() })
    const r = await run(f.url, [])
    f.server.close()
    assert.equal(r.code, 0, r.out)
    assert.deepEqual(f.writes, [])
    const line = r.out.split('\n').find(l => l.includes('--apply-mark --expect-ids=')) || ''
    for (const p of ['kari:00000000-0000-4000-8000-00000000000b', 'lars:00000000-0000-4000-8000-00000000000c', 'mona:00000000-0000-4000-8000-00000000000d']) assert.ok(line.includes(p), `mangler ${p} i: ${line}`)
    assert.ok(!r.out.includes('test-nokkel-som-aldri-skrives-ut'))
  })
  test('--apply-mark uten eller med feil --expect-ids endrer ingenting', async () => {
    for (const args of [['--apply-mark'], ['--apply-mark', '--expect-ids=kari:00000000-0000-4000-8000-00000000000b,lars:00000000-0000-4000-8000-00000000000c,mona:00000000-0000-4000-8000-0000000000e1']]) {
      const f = await fakeSupabase({ users: demoUsers() })
      const r = await run(f.url, args)
      f.server.close()
      assert.notEqual(r.code, 0)
      assert.match(r.out, /STOPP/)
      assert.deepEqual(f.writes, [], args.join(' '))
    }
  })
  test('--apply-mark merker ingenting hvis en av kontoene er medlem eller eier i et annet bo', async () => {
    const f = await fakeSupabase({ users: demoUsers(), otherEstates: { '00000000-0000-4000-8000-00000000000c': { members: 2 } } })
    const r = await run(f.url, ['--apply-mark', IDS])
    f.server.close()
    assert.notEqual(r.code, 0)
    assert.match(r.out, /lars er medlem eller eier i 2 andre bo/)
    assert.deepEqual(f.writes, [])
  })
  test('--apply-mark merker de tre og beholder øvrig app_metadata; --remove-mark fjerner bare merket', async () => {
    const users = demoUsers()
    const f = await fakeSupabase({ users })
    const r = await run(f.url, ['--apply-mark', IDS])
    assert.equal(r.code, 0, r.out)
    for (const role of ['kari', 'lars', 'mona']) {
      const u = users.find(x => x.email.startsWith(`${role}.`))
      assert.deepEqual(u.app_metadata, { provider: 'email', providers: ['email'], arvklart_demo: role })
    }
    assert.deepEqual(users.find(x => x.id === '00000000-0000-4000-8000-0000000000e1').app_metadata, { provider: 'email' }, 'en annen konto ble endret')
    const back = await run(f.url, ['--remove-mark'])
    f.server.close()
    assert.equal(back.code, 0, back.out)
    for (const role of ['kari', 'lars', 'mona']) assert.deepEqual(users.find(x => x.email.startsWith(`${role}.`)).app_metadata, { provider: 'email', providers: ['email'] })
  })
  test('--apply-lock stenger bare Kari og Lars, aldri Mona; --remove-lock åpner dem igjen', async () => {
    const users = demoUsers()
    const f = await fakeSupabase({ users })
    assert.equal((await run(f.url, ['--apply-lock'])).code, 0)
    assert.ok(users.find(u => u.id === '00000000-0000-4000-8000-00000000000b').banned_until && users.find(u => u.id === '00000000-0000-4000-8000-00000000000c').banned_until)
    assert.ok(!users.find(u => u.id === '00000000-0000-4000-8000-00000000000d').banned_until, 'Mona ble stengt')
    assert.equal((await run(f.url, ['--remove-lock'])).code, 0)
    f.server.close()
    assert.ok(!users.find(u => u.id === '00000000-0000-4000-8000-00000000000b').banned_until && !users.find(u => u.id === '00000000-0000-4000-8000-00000000000c').banned_until)
  })
  test('--apply-email nekter før kontoene er merket', async () => {
    const f = await fakeSupabase({ users: demoUsers() })
    const r = await run(f.url, ['--apply-email'])
    f.server.close()
    assert.notEqual(r.code, 0)
    assert.match(r.out, /ikke merket/)
    assert.deepEqual(f.writes, [])
  })
  test('to kontoer med samme rolle (gammel og ny adresse) stopper alt', async () => {
    const users = [...demoUsers(), { id: '00000000-0000-4000-8000-00000000000d2', email: 'mona.demo@arvklart.no', app_metadata: {} }]
    const f = await fakeSupabase({ users })
    const r = await run(f.url, ['--apply-mark', IDS])
    f.server.close()
    assert.notEqual(r.code, 0)
    assert.match(r.out, /STOPP/)
    assert.deepEqual(f.writes, [])
  })
})
