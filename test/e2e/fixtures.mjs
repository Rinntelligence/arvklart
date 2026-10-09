// Felles oppsett for e2e-testene av sidene: simulert Supabase med et lite testbo, innlogget bruker.
import { chromium } from 'playwright-core'

export const BASE = process.env.BASE_URL || 'http://localhost:5179'
export const EST = '22222222-0000-0000-0000-000000000001'
export const UID = '11111111-0000-0000-0000-000000000001'
export const ITEM = '33333333-0000-0000-0000-000000000001'
export const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
export const exp = Math.floor(Date.now() / 1000) + 3600
export const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, email: 'test@test.no', role: 'authenticated', exp, session_id: 's1' })}.sig`
export const session = { access_token: token, refresh_token: 'r', expires_at: exp, expires_in: 3600, token_type: 'bearer',
  user: { id: UID, email: 'test@test.no', aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: 'Test' } } }

export const now = new Date().toISOString()
export const profile = { user_id: UID, display_name: 'Test', avatar_color: '#5F6E52', email: 'test@test.no' }
export const estate = { id: EST, name: 'Testbo', description: 'Etter bestemor', owner_id: UID, invite_code: 'ABC123', status: 'active', created_at: now }
export const category = { id: 'c1', label: 'Møbler', emoji: '🪑', estate_id: EST }
export const FIXTURES = {
  profiles: [profile],
  estates: [estate],
  estate_members: [{ estate_id: EST, user_id: UID, role: 'admin', joined_at: now, estates: estate, profiles: profile }],
  items: [{ id: ITEM, estate_id: EST, title: 'Gyngestol', description: 'Eik, 1950-tallet', status: 'active', condition: 'good', image_url: null, extra_images: [],
    estimated_value: '1500', added_by: UID, added_by_name: 'Test', created_at: now, category_id: 'c1', categories: category, interests: [], comments: [] }],
  categories: [category],
  heirs: [{ id: 'h1', estate_id: EST, name: 'Kari', email: 'kari@test.no', relationship: 'Barn', percentage: 0, created_at: now }],
}

export async function setup(browser, { loggedIn = true, viewport = { width: 390, height: 844 }, textSize = null, fixtures = {}, rpc = {} } = {}) {
  const data = { ...FIXTURES, ...fixtures }
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  const calls = [] // { method, table } for alle kall mot databasen, så testene kan sjekke hva som ble gjort
  await page.route('https://test.supabase.co/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    calls.push({ method: req.method(), path: url.pathname, table: url.pathname.match(/\/rest\/v1\/([a-z_]+)/)?.[1] })
    if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' })
    const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)/)?.[1]
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    // Enkle filtre som kolonne=eq.verdi brukes, så .eq(...).maybeSingle() får riktig rad
    let rows = (table && data[table]) || []
    for (const [key, val] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key) || key.includes('.') || !val.startsWith('eq.')) continue
      rows = rows.filter(r => !(key in r) || String(r[key]) === val.slice(3))
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const r = rpc[url.pathname.split('/').pop()]
      return route.fulfill({ status: r?.status || 200, contentType: 'application/json', body: JSON.stringify(r?.body ?? []) })
    }
    const body = single ? (rows[0] ?? null) : rows
    return route.fulfill({ status: single && !rows.length ? 406 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.addInitScript(([s, on, ts]) => {
    localStorage.removeItem('hs_lang')
    if (ts) localStorage.setItem('hs_text_size', ts)
    if (on) localStorage.setItem('sb-test-auth-token', JSON.stringify(s)); else localStorage.removeItem('sb-test-auth-token')
  }, [session, loggedIn, textSize])
  return { ctx, page, calls }
}


export const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })

// Kjører én sjekk i en ny nettleserkontekst og legger resultatet i results
export function checker(browser, results) {
  return async (name, fn, opts) => {
    const { ctx, page, calls } = await setup(browser, opts)
    try { await fn(page, calls); results.push(`OK   ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`) }
    await ctx.close()
  }
}
export const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
