// Guidene (content/guider/*.md, malen src/pages/ArticlePage.jsx) i nettleseren, mot det bygde nettstedet med
// testinnholdet (test/fixtures/content) og reglene fra vercel.json. Kjøres av test/e2e/run.sh.
import { createRequire } from 'node:module'
import { BASE, launch, checker, assert } from './fixtures.mjs'
import { SITE_URL } from '../../src/seo/pages.js'

const browser = await launch()
const results = []
const check = checker(browser, results)
const PATH = '/guider/testguide-fordeling'
const TITLE = 'Testguide for fordeling av innbo'

async function watch(page) {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource|WebSocket connection to 'wss:\/\/test\.supabase\.co/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort())
  await page.addInitScript(() => {
    window.__g = { removed: 0 }
    document.addEventListener('securitypolicyviolation', e => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`))
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      const root = document.getElementById('root')
      window.__g.h1 = root.querySelector('h1')
      window.__g.visibility = getComputedStyle(root).visibility
      new MutationObserver(ms => { for (const m of ms) window.__g.removed += m.removedNodes.length }).observe(root, { childList: true, subtree: true })
    })
  })
  return async () => ({ ...(await page.evaluate(() => ({ removed: window.__g.removed, visibility: window.__g.visibility, sameH1: window.__g.h1 === document.querySelector('#root h1') }))), errors })
}
const canonicals = page => page.evaluate(() => [...document.querySelectorAll('link[rel=canonical]')].map(l => l.href))

await check('Uten JavaScript: H1, tekst, forfatter og datoer, kilder, «Les også» og brødsmulesti', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  const res = await page.goto(BASE + PATH)
  assert(res.status() === 200, `status ${res.status()}`)
  assert(await page.locator('h1').count() === 1 && (await page.locator('h1').textContent()) === TITLE, 'H1')
  assert(await page.getByRole('heading', { level: 2, name: 'Hva testguiden viser' }).isVisible(), 'mangler H2')
  for (const text of ['testinnhold', 'Første steg', 'Et sitat med <ikke-html> som skal kodes.', 'Publisert 1. oktober 2026', 'Oppdatert 15. oktober 2026', 'Lov om arv og dødsboskifte (arveloven)'])
    assert(await page.getByText(text, { exact: false }).first().isVisible(), `mangler «${text}»`)
  assert(await page.locator('nav[aria-label="Brødsmulesti"] a[href="/"]').count() === 1, 'brødsmulestien mangler')
  assert(await page.locator('nav[aria-label="Brødsmulesti"] [aria-current="page"]').textContent() === TITLE, 'siste ledd i brødsmulestien')
  assert(await page.locator('aside a[href="/veiviser"]').textContent() === 'Veiviser — Arvklart', '«Les også» bruker sidens tittel')
  assert(await page.locator('a[href="https://lovdata.no/dokument/NL/lov/2019-06-14-21"]').count() === 1, 'kilden mangler')
  await ctx.close()
}, { loggedIn: false })

await check('Norsk, ikke innlogget: hydrering uten at noe byttes ut, én canonical, riktig tittel, ingen feil', async page => {
  const state = await watch(page)
  await page.goto(BASE + PATH)
  await page.waitForTimeout(1000)
  const s = await state()
  assert(s.visibility === 'visible' && s.sameH1 && s.removed === 0, `byttet ut: ${JSON.stringify(s)}`)
  assert(s.errors.length === 0, `feil: ${s.errors.join(' | ')}`)
  assert(JSON.stringify(await canonicals(page)) === JSON.stringify([`${SITE_URL}${PATH}`]), `canonical: ${await canonicals(page)}`)
  assert(await page.title() === TITLE, `tittel: ${await page.title()}`)
}, { loggedIn: false })

await check('Innholdsfortegnelse og demo-boksen står i HTML-en; lenkene i innholdsfortegnelsen virker', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto(BASE + PATH)
  const toc = page.locator('nav[aria-label="Innhold på siden"] a')
  assert(JSON.stringify(await toc.allTextContents()) === JSON.stringify(['Hva testguiden viser', 'Andre del med kursiv', 'Tredje del']), `innholdsfortegnelse: ${await toc.allTextContents()}`)
  assert(JSON.stringify(await toc.evaluateAll(a => a.map(x => x.getAttribute('href')))) === JSON.stringify(['#hva-testguiden-viser', '#andre-del-med-kursiv', '#tredje-del']), 'adressene i innholdsfortegnelsen')
  assert(await page.getByRole('button', { name: 'Åpne demoen' }).count() === 1, 'demo-knappen mangler i HTML-en')
  assert(await page.getByText('Det er ikke juridisk rådgivning eller takst', { exact: false }).isVisible(), 'forbeholdet mangler')
  await ctx.close()
}, { loggedIn: false })

await check('Innholdsfortegnelsen: et klikk går til overskriften uten å laste siden på nytt', async page => {
  await page.goto(BASE + PATH)
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
  await page.evaluate(() => { window.__same = true })
  const toc = page.locator('nav[aria-label="Innhold på siden"]')
  assert(!(await toc.locator('a').first().isVisible()), 'innholdsfortegnelsen skal være lukket til den åpnes')
  await toc.getByText('Innhold på siden (3 deler)').click()
  await toc.locator('a[href="#tredje-del"]').click()
  await page.waitForURL(`${BASE}${PATH}#tredje-del`)
  assert(await page.evaluate(() => window.__same === true), 'siden ble lastet på nytt')
  assert(await page.locator('#tredje-del').isVisible() && await page.evaluate(() => Math.abs(document.getElementById('tredje-del').getBoundingClientRect().top) < 80), 'overskriften er ikke i bildet')
}, { loggedIn: false })

await check('Demoen kan ikke åpnes: melding, ingen tom side', async page => {
  await page.route('https://test.supabase.co/functions/v1/demo-login', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }))
  await page.goto(BASE + PATH)
  await page.getByRole('button', { name: 'Åpne demoen' }).click()
  await page.getByRole('alert').filter({ hasText: 'Demoen er ikke tilgjengelig' }).waitFor()
  assert(page.url() === BASE + PATH, `byttet side: ${page.url()}`)
}, { loggedIn: false })

await check('Ny lasting av guiden virker (oppdatering i nettleseren)', async page => {
  await page.goto(BASE + PATH)
  await page.reload()
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
}, { loggedIn: false })

await check('Innlogget: guiden vises i appen (toppmeny), uten feil', async page => {
  const state = await watch(page)
  await page.goto(BASE + PATH)
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
  await page.locator('.tb-logo').waitFor()
  const s = await state()
  assert(s.visibility === 'hidden', 'den forhåndsrendrede teksten skal være skjult til appen tar over')
  assert(s.errors.length === 0, `feil: ${s.errors.join(' | ')}`)
  assert(await page.getByRole('heading', { level: 2, name: 'Hva testguiden viser' }).isVisible(), 'teksten vises ikke')
  assert(await page.getByRole('button', { name: 'Åpne demoen' }).count() === 0, 'demo-boksen vises for innloggede')
  assert(JSON.stringify(await canonicals(page)) === JSON.stringify([`${SITE_URL}${PATH}`]), 'canonical')
})

await check('Engelsk: menytekstene på engelsk, guiden på norsk, uten feil', async page => {
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  const state = await watch(page)
  await page.goto(BASE + PATH)
  await page.getByRole('link', { name: 'To the home page' }).waitFor()
  assert(await page.getByRole('heading', { level: 1, name: TITLE }).isVisible(), 'guiden vises ikke')
  assert((await state()).errors.length === 0, 'feil')
}, { loggedIn: false })

await check('«Les også» og brødsmulestien er vanlige lenker som virker', async page => {
  await page.goto(BASE + PATH)
  await page.locator('aside a[href="/veiviser"]').click()
  await page.waitForURL(`${BASE}/veiviser`)
  await page.goBack()
  await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
  await page.locator('nav[aria-label="Brødsmulesti"] a[href="/"]').click()
  await page.waitForURL(`${BASE}/`)
}, { loggedIn: false })

await check('Tilgjengelighet (axe, WCAG 2.2 AA) på mobil og PC', async () => {
  const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    // Egen kontekst uten CSP: innholdsreglene stopper (riktig nok) axe-skriptet testen legger inn
    const ctx = await browser.newContext({ viewport, bypassCSP: true })
    const page = await ctx.newPage()
    await page.goto(BASE + PATH)
    await page.getByRole('heading', { level: 1, name: TITLE }).waitFor()
    await page.addScriptTag({ path: AXE })
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
      .violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => `${x.id}: ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`))
    assert(v.length === 0, `${viewport.width}px: ${v.join('; ')}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.width}px: vannrett rulling`)
    await ctx.close()
  }
}, { loggedIn: false })

await check('Utkast og ukjente guider: HTTP 404', async page => {
  for (const path of ['/guider/testutkast', '/guider/finnes-ikke']) {
    const res = await page.goto(BASE + path)
    assert(res.status() === 404, `${path}: ${res.status()}`)
    await page.getByRole('heading', { name: 'Fant ikke siden' }).waitFor()
  }
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
  assert(sitemap.includes(`<loc>${SITE_URL}${PATH}</loc><lastmod>2026-10-15</lastmod>`), 'guiden mangler i sitemap')
  assert(!sitemap.includes('testutkast'), 'utkastet står i sitemap')
}, { loggedIn: false })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
