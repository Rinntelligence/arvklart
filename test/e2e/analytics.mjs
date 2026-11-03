// Statistikk (GA4 via GTM) bare med samtykke (src/lib/analytics.js, src/components/AnalyticsConsent.jsx), mot det
// bygde nettstedet med hodene fra vercel.json (CSP-en gjelder). Google simuleres: gtm.js er et lite skript som sender
// til google-analytics.com, så testen viser at innholdsreglene slipper gjennom det GA4 trenger. Kjøres av run.sh.
import { createRequire } from 'node:module'
import { BASE, EST, launch, checker, assert, session, sessionFor } from './fixtures.mjs'

const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const browser = await launch()
const results = []
const check = checker(browser, results)
const GTM = /^https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-KQWKCWBC$/
const STUB = `window.__gtmStub = true;
fetch('https://region1.google-analytics.com/g/collect?v=2&tid=G-TEST', { method: 'POST', keepalive: true });
new Image().src = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST';`

// Alle kall til Google (simulert), CSP-brudd og feil
async function watch(page) {
  const google = []
  const errors = []
  page.on('request', r => { if (/google(tagmanager|-analytics)\.com|analytics\.google\.com/.test(r.url())) google.push(r.url()) })
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && /Minified React error|Content Security Policy/.test(m.text())) errors.push(m.text()) })
  await page.route(GTM, route => route.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }))
  await page.route(/google-analytics\.com|analytics\.google\.com/, route => route.fulfill({ status: 204, body: '' }))
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`)))
  return { google, errors, gtm: () => google.filter(u => GTM.test(u)) }
}
const banner = page => page.getByRole('region', { name: 'Informasjonskapsler' })
const accept = page => banner(page).getByRole('button', { name: 'Godta' }).click()
const noErrors = w => assert(w.errors.length === 0, `feil: ${w.errors.join(' | ')}`)

await check('Ny besøkende: spørsmålet vises på forsiden, og ingenting hentes fra Google før valget', async page => {
  const w = await watch(page)
  await page.goto(`${BASE}/`)
  await banner(page).waitFor()
  await page.waitForTimeout(1000)
  assert(w.google.length === 0, `hentet fra Google før valget: ${w.google}`)
  assert(await page.evaluate(() => !window.dataLayer && !window.__arvklartGtm), 'GTM ble satt opp før valget')
  const godta = await banner(page).getByRole('button', { name: 'Godta' }).boundingBox()
  const avsla = await banner(page).getByRole('button', { name: 'Avslå' }).boundingBox()
  assert(Math.abs(godta.height - avsla.height) < 1 && Math.abs(godta.width - avsla.width) < 2, 'Godta og Avslå er ikke like store')
  noErrors(w)
}, { loggedIn: false, consent: null })

await check('Uten JavaScript og i den forhåndsrendrede HTML-en: ingen spørsmål og ingen GTM', async () => {
  const html = await (await fetch(`${BASE}/`)).text()
  assert(!/googletagmanager|GTM-|Informasjonskapsler<\/h2>|Tillater du statistikk/.test(html), 'GTM eller spørsmålet står i HTML-en')
}, { loggedIn: false, consent: null })

await check('Spørsmålet er tilgjengelig (axe, WCAG 2.2 AA) og kan brukes med tastatur', async () => {
  // Egen kontekst uten CSP: innholdsreglene stopper (riktig nok) axe-skriptet testen legger inn
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`)
  await banner(page).waitFor()
  await page.addScriptTag({ path: AXE })
  const v = await page.evaluate(async () => (await window.axe.run(document.querySelector('section[aria-label="Informasjonskapsler"]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
    .violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => x.id))
  assert(v.length === 0, `axe: ${v}`)
  await banner(page).getByRole('button', { name: 'Avslå' }).focus()
  await page.keyboard.press('Enter')
  await banner(page).waitFor({ state: 'detached' })
  await ctx.close()
}, { loggedIn: false, consent: null })

await check('Hydreringen av forsiden er uendret med spørsmålet (ingen DOM byttet ut, ingen feil)', async page => {
  const w = await watch(page)
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState !== 'interactive') return
    window.__h1 = document.querySelector('#root h1'); window.__removed = 0
    new MutationObserver(ms => { for (const m of ms) window.__removed += m.removedNodes.length }).observe(document.getElementById('root'), { childList: true, subtree: true })
  }))
  await page.goto(`${BASE}/`)
  await banner(page).waitFor()
  assert(await page.evaluate(() => window.__h1 === document.querySelector('#root h1') && window.__removed === 0), 'den forhåndsrendrede forsiden ble byttet ut')
  noErrors(w)
}, { loggedIn: false, consent: null })

await check('«Godta»: GTM lastes med samtykkemodus (bare statistikk), uten CSP-brudd, og huskes', async page => {
  const w = await watch(page)
  await page.goto(`${BASE}/`)
  await accept(page)
  await banner(page).waitFor({ state: 'detached' })
  await page.waitForFunction(() => window.__gtmStub === true)
  await page.waitForTimeout(500)
  assert(w.gtm().length === 1, `gtm.js: ${w.gtm().length}`)
  assert(w.google.some(u => u.includes('region1.google-analytics.com/g/collect')) && w.google.some(u => u.includes('www.google-analytics.com/g/collect')), 'GA4-kallene ble ikke sendt (CSP?)')
  const layer = await page.evaluate(() => window.dataLayer.map(e => (e && typeof e.length === 'number' && !Array.isArray(e)) ? Array.from(e) : e))
  assert(JSON.stringify(layer[0]) === JSON.stringify(['consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]), `samtykkemodus: ${JSON.stringify(layer[0])}`)
  assert(layer[1]?.event === 'gtm.js' && typeof layer[1]['gtm.start'] === 'number', `oppstart: ${JSON.stringify(layer[1])}`)
  noErrors(w)
  await page.reload()
  await page.waitForFunction(() => window.__gtmStub === true)
  assert(await banner(page).count() === 0, 'spørsmålet vises igjen etter «Godta»')
  for (const path of ['/kontakt', '/personvern', '/veiviser']) {
    await page.goto(BASE + path)
    await page.waitForFunction(() => window.__gtmStub === true)
  }
}, { loggedIn: false, consent: null })

await check('«Avslå»: ingenting fra Google, heller ikke etter ny lasting', async page => {
  const w = await watch(page)
  await page.goto(`${BASE}/`)
  await banner(page).getByRole('button', { name: 'Avslå' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Test ut demo nå' }).waitFor()
  await page.waitForTimeout(800)
  assert(await banner(page).count() === 0, 'spørsmålet vises igjen etter «Avslå»')
  assert(w.google.length === 0, `hentet fra Google: ${w.google}`)
}, { loggedIn: false, consent: null })

await check('Med samtykke: sider som ikke er offentlige, laster aldri GTM', async page => {
  const w = await watch(page)
  for (const path of ['/logg-inn', '/nytt-passord', '/join/ABC123', '/finnes-ikke']) {
    await page.goto(BASE + path)
    await page.waitForTimeout(600)
  }
  // /finnes-ikke ender på forsiden (offentlig): der er GTM tillatt
  const beforeHome = w.gtm().length
  assert(await page.evaluate(() => location.pathname) === '/', 'ukjent adresse endte ikke på forsiden')
  assert(beforeHome <= 1, `GTM lastet ${beforeHome} ganger`)
  const w2 = await watch(await page.context().newPage())
  const p2 = page.context().pages()[1]
  for (const path of ['/logg-inn', '/nytt-passord', '/join/ABC123']) { await p2.goto(BASE + path); await p2.waitForTimeout(600) }
  assert(w2.gtm().length === 0, `GTM på sider som ikke er offentlige: ${w2.gtm().length}`)
}, { loggedIn: false, consent: 'granted' })

await check('Med samtykke, innlogget: /app, et bo og forsiden fra appen laster aldri GTM', async page => {
  const w = await watch(page)
  await page.goto(`${BASE}/`) // bokmerke: videre til /app
  await page.waitForURL(`${BASE}/app`)
  await page.getByText('Testbo').first().waitFor()
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText('Testbo').first().waitFor()
  await page.locator('.tb-logo').click()
  await page.getByRole('menuitem', { name: /Tilbake til hjemmesiden/ }).click()
  await page.locator('.lp.logged-in').waitFor()
  await page.waitForTimeout(800)
  assert(w.gtm().length === 0, `GTM for innlogget: ${w.gtm()}`)
  assert(await page.evaluate(() => !window.__arvklartGtm), 'GTM satt opp for innlogget')
}, { consent: 'granted' })

await check('Med samtykke: demoen fra forsiden laster siden på nytt uten GTM, så demo-boet aldri måles', async page => {
  const demo = sessionFor('mona.demo@heirsplit.no')
  await page.route('https://test.supabase.co/functions/v1/demo-login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: demo.access_token, refresh_token: 'r' }) }))
  await page.route('https://test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demo.user) }))
  const w = await watch(page)
  await page.goto(`${BASE}/`)
  await page.waitForFunction(() => window.__gtmStub === true)
  await page.getByRole('button', { name: 'Test ut demo nå' }).click()
  await page.waitForURL(`${BASE}/estate/${EST}`, { timeout: 15000 })
  await page.getByText(/Du ser på en/).waitFor()
  await page.waitForTimeout(800)
  assert(await page.evaluate(() => !window.__arvklartGtm && !window.__gtmStub), 'GTM er fortsatt lastet i demo-boet')
  assert(w.gtm().length === 1, `gtm.js hentet ${w.gtm().length} ganger (bare på forsiden)`)
  noErrors(w)
}, { loggedIn: null, consent: 'granted' })

await check('Med samtykke: e-postlenke med økten i adressen laster ikke GTM', async page => {
  await page.route('https://test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }))
  const w = await watch(page)
  await page.goto(`${BASE}/#access_token=${session.access_token}&refresh_token=r&expires_in=3600&token_type=bearer&type=signup`)
  await page.waitForURL(`${BASE}/app`)
  await page.getByText('Testbo').first().waitFor()
  assert(w.gtm().length === 0, 'GTM lastet med økten i adressen')
}, { loggedIn: false, consent: 'granted' })

await check('Trekk tilbake på /personvern: informasjonskapslene slettes, og GTM lastes ikke lenger', async page => {
  const w = await watch(page)
  await page.goto(`${BASE}/personvern#informasjonskapsler`)
  await page.waitForFunction(() => window.__gtmStub === true)
  await page.evaluate(() => { document.cookie = '_ga=GA1.1.123.456; path=/'; document.cookie = '_ga_TEST=GS1.1.x; path=/' })
  await page.getByRole('button', { name: 'Trekk tilbake samtykket' }).click()
  await page.getByText('Du har avslått statistikk i denne nettleseren.').waitFor()
  assert(await page.evaluate(() => !/(^|; )_ga/.test(document.cookie)), `informasjonskapslene står igjen: ${await page.evaluate(() => document.cookie)}`)
  assert(await page.evaluate(() => !window.__arvklartGtm), 'GTM er fortsatt lastet')
  const loads = w.gtm().length
  await page.goto(`${BASE}/`)
  await page.getByRole('button', { name: 'Test ut demo nå' }).waitFor()
  await page.waitForTimeout(600)
  assert(w.gtm().length === loads, 'GTM lastet etter at samtykket ble trukket tilbake')
  await page.goto(`${BASE}/personvern#informasjonskapsler`)
  await page.getByRole('button', { name: 'Godta statistikk' }).click()
  await page.waitForFunction(() => window.__gtmStub === true)
}, { loggedIn: false, consent: 'granted' })

await check('Engelsk: spørsmålet på engelsk', async page => {
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  await page.goto(`${BASE}/`)
  await page.getByRole('region', { name: 'Cookies' }).getByRole('button', { name: 'Accept' }).waitFor()
}, { loggedIn: false, consent: null })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
