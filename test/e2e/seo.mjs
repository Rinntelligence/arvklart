// Akseptansetester for teknisk SEO mot det bygde nettstedet med hodene og omskrivingene fra vercel.json
// (test/e2e/staticServer.mjs): forhåndsrendret HTML uten JavaScript, robots.txt og sitemap.xml som filer,
// noindex på alt som ikke er offentlige sider, én canonical, og at hydreringen ikke endrer noe for brukerne
// (norsk/engelsk, innlogget/ikke innlogget, demo, innlogging og direkte lenker). Kjøres av test/e2e/run.sh.
import { BASE, EST, launch, checker, assert, sessionFor } from './fixtures.mjs'
import { PUBLIC_PAGES, SITE_URL } from '../../src/seo/pages.js'
import { runHttpChecks } from '../seo/httpChecks.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)
const H1_NO = 'Arvefordeling gjort enklere og inkluderende'
const H1_EN = 'Inheritance distribution made simpler and more inclusive'

// ── HTTP: det søkemotorene får før JavaScript (samme sjekker som scripts/check-seo.mjs kjører mot Vercel) ─────
for (const line of await runHttpChecks(BASE)) results.push(line)

// ── Nettleseren ────────────────────────────────────────────────────────────────────────────────────────
// Følger siden fra første byte: synligheten av den forhåndsrendrede teksten før appens skript kjører, om noe i
// #root fjernes (hydreringen skal ikke bytte ut DOM-en), layoutskift, konsollfeil og brudd på innholdsreglene.
async function observe(page, { lang } = {}) {
  const errors = []
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => errors.push(e.message.slice(0, 200)))
  // Skrifttypene stenges, så bytte av skrift ikke gir layoutskift i målingen
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort())
  if (lang) await page.addInitScript(l => localStorage.setItem('hs_lang', l), lang)
  await page.addInitScript(() => {
    window.__seo = { removed: 0, visibility: null, h1: null, shift: 0, csp: [] }
    document.addEventListener('securitypolicyviolation', e => window.__seo.csp.push(`${e.violatedDirective} ${e.blockedURI}`))
    new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__seo.shift += e.value }).observe({ type: 'layout-shift', buffered: true })
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return // HTML-en er lest, appens skript har ikke kjørt
      const root = document.getElementById('root')
      window.__seo.visibility = getComputedStyle(root).visibility
      window.__seo.h1 = root.querySelector('h1')
      window.__seo.prerendered = root.hasAttribute('data-prerendered')
      new MutationObserver(ms => { for (const m of ms) window.__seo.removed += m.removedNodes.length }).observe(root, { childList: true, subtree: true })
    })
  })
  return async () => page.evaluate(() => ({ ...window.__seo, sameH1: window.__seo.h1 === document.querySelector('#root h1'), h1: undefined }))
    .then(s => ({ ...s, errors }))
}
const settle = page => page.waitForTimeout(800)
const noErrors = s => assert(s.errors.length === 0 && s.csp.length === 0, `feil: ${[...s.errors, ...s.csp].join(' | ')}`)
const canonicals = page => page.evaluate(() => [...document.querySelectorAll('link[rel=canonical]')].map(l => l.href))

await check('Uten JavaScript: forsiden viser overskrift, tekst og lenker', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/home`)
  assert((await page.locator('h1').textContent()) === H1_NO, 'overskriften vises ikke')
  assert(await page.getByText('Én rolig, tydelig vei gjennom en vanskelig prosess.').isVisible(), 'teksten vises ikke')
  assert(await page.getByRole('link', { name: 'Kontakt' }).count() === 1, 'lenken til Kontakt mangler')
  await page.goto(`${BASE}/kontakt`)
  assert((await page.locator('h1').textContent()) === 'Ta kontakt med oss', 'kontaktsiden er ikke forhåndsrendret')
  await ctx.close()
}, { loggedIn: false })

await check('Norsk, ikke innlogget: hydrering uten at noe byttes ut, uten layoutskift og uten feil', async page => {
  const state = await observe(page)
  await page.goto(`${BASE}/home`)
  await page.getByRole('button', { name: 'Test ut demo nå' }).waitFor()
  await settle(page)
  const s = await state()
  assert(s.prerendered && s.visibility === 'visible', `forhåndsrendret ${s.prerendered}, synlighet ${s.visibility}`)
  assert(s.sameH1, 'overskriften ble byttet ut')
  assert(s.removed === 0, `${s.removed} noder ble fjernet fra #root`)
  assert(s.shift < 0.01, `layoutskift ${s.shift}`)
  noErrors(s)
  assert(JSON.stringify(await canonicals(page)) === JSON.stringify([`${SITE_URL}/home`]), `canonical: ${await canonicals(page)}`)
  // Siden er interaktiv: menyen på mobil åpnes
  await page.getByRole('button', { name: 'Meny' }).click()
  assert(await page.getByRole('button', { name: 'Meny' }).getAttribute('aria-expanded') === 'true', 'menyen reagerer ikke')
}, { loggedIn: false })

await check('Norsk, ikke innlogget: kontaktsiden hydreres uten feil', async page => {
  const state = await observe(page)
  await page.goto(`${BASE}/kontakt`)
  await settle(page)
  const s = await state()
  assert(s.prerendered && s.sameH1 && s.removed === 0, `byttet ut: ${s.removed}`)
  noErrors(s)
  assert(await page.title() === 'Kontakt — Arvklart', `tittel: ${await page.title()}`)
}, { loggedIn: false })

await check('Engelsk, ikke innlogget: den norske teksten er skjult til appen viser engelsk, uten feil', async page => {
  const state = await observe(page, { lang: 'en' })
  await page.goto(`${BASE}/home`)
  await page.getByRole('heading', { level: 1, name: H1_EN }).waitFor()
  await settle(page)
  const s = await state()
  assert(s.prerendered && s.visibility === 'hidden', `synlighet før appen: ${s.visibility}`)
  assert(await page.locator('#root').evaluate(r => getComputedStyle(r).visibility) === 'visible', 'siden er fortsatt skjult')
  assert(await page.getByText(H1_NO).count() === 0, 'norsk tekst står igjen')
  noErrors(s)
  assert(await page.title() === 'Arvklart — Inheritance distribution made simpler', `tittel: ${await page.title()}`)
  assert(JSON.stringify(await canonicals(page)) === JSON.stringify([`${SITE_URL}/home`]), 'én canonical')
}, { loggedIn: false })

for (const lang of ['no', 'en']) {
  await check(`Innlogget (${lang}): forhåndsrendret tekst skjult, appen som før (meny øverst, «${lang === 'no' ? 'Gå til mine bo' : 'Go to my estates'}»)`, async page => {
    const state = await observe(page, { lang })
    await page.goto(`${BASE}/home`)
    await page.getByRole('button', { name: lang === 'no' ? 'Gå til mine bo' : 'Go to my estates' }).first().waitFor()
    await settle(page)
    const s = await state()
    assert(s.prerendered && s.visibility === 'hidden', `synlighet før appen: ${s.visibility}`)
    assert(await page.locator('.lp header').count() === 0, 'menyen for besøkende vises for en innlogget')
    assert(await page.locator('.lp.logged-in').count() === 1, 'innlogget forside vises ikke')
    noErrors(s)
    await page.getByRole('button', { name: lang === 'no' ? 'Gå til mine bo' : 'Go to my estates' }).first().click()
    await page.waitForURL(`${BASE}/`)
    await page.getByText('Testbo').first().waitFor()
  })
}

await check('Demo: «Test ut demo nå» fra den forhåndsrendrede forsiden åpner demo-boet', async page => {
  const demo = sessionFor('mona.demo@heirsplit.no')
  await page.route('https://test.supabase.co/functions/v1/demo-login', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: demo.access_token, refresh_token: 'r' }) }))
  await page.route('https://test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(demo.user) }))
  const state = await observe(page)
  await page.goto(`${BASE}/home`)
  await page.getByRole('button', { name: 'Test ut demo nå' }).click()
  await page.waitForURL(`${BASE}/estate/${EST}`)
  await page.getByText(/Du ser på en/).waitFor()
  noErrors(await state())
}, { loggedIn: false })

await check('Innlogging virker som før fra den forhåndsrendrede forsiden', async page => {
  await page.goto(`${BASE}/home`)
  await page.locator('a.nav-login').first().click()
  await page.waitForURL(`${BASE}/logg-inn`)
  await page.locator('input[type=email]').waitFor()
  assert((await canonicals(page)).length === 0, 'innloggingssiden har canonical')
}, { loggedIn: false })

await check('Direkte lenke til en app-side med økt virker', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText('Testbo').first().waitFor()
  assert((await canonicals(page)).length === 0, 'app-siden har canonical')
  assert(await page.title() === 'Arvklart — Arvefordeling gjort enklere', `tittel: ${await page.title()}`)
})

await check('«/» uten innlogging ender på forsiden med én canonical; ukjente adresser likeså', async page => {
  for (const path of ['/', '/finnes-ikke']) {
    await page.goto(BASE + path)
    await page.waitForURL(`${BASE}/home`)
    await page.locator('h1').waitFor()
    assert(JSON.stringify(await canonicals(page)) === JSON.stringify([`${SITE_URL}/home`]), `${path}: ${await canonicals(page)}`)
  }
}, { loggedIn: false })

await check('Personvern og veiviser får sin canonical og tittel fra pages.js i nettleseren', async page => {
  for (const p of PUBLIC_PAGES.filter(p => !p.prerender)) {
    await page.goto(BASE + p.path)
    await page.waitForFunction(t => document.title === t, p.title)
    assert(JSON.stringify(await canonicals(page)) === JSON.stringify([SITE_URL + p.path]), `${p.path}: ${await canonicals(page)}`)
  }
}, { loggedIn: false })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
