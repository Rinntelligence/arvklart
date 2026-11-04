// Arveveiviseren på /veiviser mot det bygde nettstedet (test/e2e/staticServer.mjs, reglene fra vercel.json).
// Veiviseren står direkte i siden (src/seo/veiviserHost.js) i stedet for i en iframe, så søkemotorer leser
// innholdet uten JavaScript. Testene viser at
//  - all tekst, alle lenker og alle forklaringer (title/aria-label) er de samme som før ombyggingen: fasiten
//    test/fixtures/veiviser-tekst.json er tatt fra main (iframen) før endringen, og siden og rammen sammenlignes
//    med den, både uten og med JavaScript;
//  - metadata, overskrifter, /veiviser.html (308) og rammen (noindex) er riktige;
//  - veiviseren virker som før: spørsmål, fram og tilbake, faser, ordliste, gravferdssjekken, lenker, «Tilbake»,
//    lagring (innlogging, ny bruker, eksisterende bo), demo, innlogget, engelsk og fra et bo (iframen).
// Kjøres av test/e2e/run.sh med det ekte innholdet i veiviseren (public/arveveiviser).
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { BASE, EST, UID, launch, checker, assert, session, sessionFor, FIXTURES } from './fixtures.mjs'
import { SITE_URL } from '../../src/seo/pages.js'

const FASIT = JSON.parse(readFileSync(new URL('../fixtures/veiviser-tekst.json', import.meta.url), 'utf8'))
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const browser = await launch()
const results = []
const check = checker(browser, results)
const STORE = 'arvklart-arveveiviser-v2:anonym:veiviser'
// Et komplett sett svar (som test/arveveiviser/helpers.js), så resultatet og «Ta vare på resultatet» vises
const ANSWERS = { role: 'relative', deathDate: '2026-06-01', residence: 'yes', testament: 'no', debtOverview: 'yes', circumstances: ['none'], maritalStatus: 'none', previousUskifte: 'no', advancements: 'no', children: [{ id: 'c1', alive: 'yes', name: 'Kari' }] }
const withResult = (page, key = STORE) => page.addInitScript(([k, a]) => {
  if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ answers: a, view: 'result', current: null, acks: {} }))
}, [key, ANSWERS])

// Alle tekstnoder, lenker og forklaringer i veiviseren, slik fasiten ble laget
const snapshot = (page, selector) => page.evaluate(sel => {
  const root = document.querySelector(sel)
  const texts = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode());) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) texts.push(t) }
  const links = [...root.querySelectorAll('a[href]')].map(a => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }))
  const attrs = [...root.querySelectorAll('[title], [aria-label]')].map(e => e.getAttribute('title') || e.getAttribute('aria-label'))
  return { texts, links, attrs }
}, selector)
const same = (a, b, what) => {
  const i = a.findIndex((x, k) => JSON.stringify(x) !== JSON.stringify(b[k]))
  assert(a.length === b.length && i === -1, `${what}: ${a.length} mot ${b.length} i fasiten; første forskjell (${i}): «${JSON.stringify(a[i])}» / fasit «${JSON.stringify(b[i])}»`)
}
const errorsOf = page => {
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|WebSocket connection/.test(m.text())) errors.push(m.text().slice(0, 200)) })
  return errors
}
const ready = page => page.locator('#arvWizard:not([data-prerendered]) .aw-card').first().waitFor()

await check('Uten JavaScript: all tekst, alle lenker og forklaringer står i HTML-en for /veiviser, i samme rekkefølge', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}/veiviser`)
  assert(res.status() === 200, `status ${res.status()}`)
  const s = await snapshot(page, '#veiviser .page')
  // Uten JavaScript vises i tillegg <noscript>-teksten i veiviseren (som før i rammen)
  const noscript = 'Arveveiviseren krever JavaScript. / The inheritance guide requires JavaScript.'
  same(s.texts.filter(t => t !== noscript), FASIT.texts, 'tekstene')
  same(s.links, FASIT.links, 'lenkene')
  same(s.attrs, FASIT.attrs, 'forklaringene (title/aria-label)')
  assert(await page.locator('iframe').count() === 0, 'iframe i siden')
  await ctx.close()
}, { loggedIn: false })

await check('Med JavaScript: siden og rammen har nøyaktig samme tekst, lenker og forklaringer som fasiten', async page => {
  const errors = errorsOf(page)
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  const s = await snapshot(page, '#veiviser .page')
  same(s.texts, FASIT.texts, '/veiviser: tekstene')
  same(s.links, FASIT.links, '/veiviser: lenkene')
  same(s.attrs, FASIT.attrs, '/veiviser: forklaringene')
  await page.goto(`${BASE}/arveveiviser/ramme.html?back=home`)
  await page.locator('#arvWizard .aw-intro').waitFor()
  const f = await snapshot(page, '.page')
  same(f.texts, FASIT.texts, 'rammen: tekstene')
  same(f.links, FASIT.links, 'rammen: lenkene')
  same(f.attrs, FASIT.attrs, 'rammen: forklaringene')
  assert(errors.length === 0, `feil: ${errors.join(' | ')}`)
}, { loggedIn: false })

await check('Metadata, overskrifter og indeksering: tittel, beskrivelse, canonical, én H1, H2/H3, ingen noindex', async () => {
  const res = await fetch(`${BASE}/veiviser`)
  const html = await res.text()
  assert(!res.headers.get('x-robots-tag'), `X-Robots-Tag på /veiviser: ${res.headers.get('x-robots-tag')}`)
  assert(!/name="robots"/.test(html), 'robots-meta i HTML-en')
  assert(html.includes('<title>Arveveiviser: Hvem arver – og hvor mye? — Arvklart</title>'), 'tittelen')
  assert(html.includes('<meta name="description" content="Fra dødsfall til fordelt bo — steg for steg. Finn ut hvem som arver og hvor mye, basert på din situasjon." />'), 'beskrivelsen')
  assert((html.match(/<link rel="canonical"/g) || []).length === 1 && html.includes(`<link rel="canonical" href="${SITE_URL}/veiviser" />`), 'canonical')
  assert((html.match(/<h1[\s>]/g) || []).length === 1, 'skal ha én H1')
  const h2 = [...html.matchAll(/<h2[^>]*>([^<]+)/g)].map(m => m[1])
  assert(JSON.stringify(h2) === JSON.stringify(['Hvem arver – og hvor mye?', 'Prosessen i fem faser', 'Ordliste', 'Ressurser', 'Klar for å fordele eiendelene?']), `H2: ${h2}`)
  assert((html.match(/<h3 class="phase-h">/g) || []).length === 5 && (html.match(/<h3 class="resource-cat-title">/g) || []).length === 3, 'H3 for fasene og ressursgruppene')
  assert(/<main id="veiviser" data-veiviser-host>/.test(html) && !/<iframe/.test(html), 'veiviseren skal stå i <main>, uten iframe')
  const old = await fetch(`${BASE}/veiviser.html`, { redirect: 'manual' })
  assert(old.status === 308 && new URL(old.headers.get('location'), BASE).pathname === '/veiviser', `/veiviser.html: ${old.status} ${old.headers.get('location')}`)
  const frame = await fetch(`${BASE}/arveveiviser/ramme.html`)
  assert(frame.status === 200 && frame.headers.get('x-robots-tag') === 'noindex', `rammen: ${frame.status} ${frame.headers.get('x-robots-tag')}`)
  assert((await (await fetch(`${BASE}/sitemap.xml`)).text()).includes(`<loc>${SITE_URL}/veiviser</loc>`), '/veiviser mangler i sitemap')
  assert((await fetch(`${BASE}/veiviser/noe`)).status === 404, '/veiviser/noe skal gi 404')
}, { loggedIn: false })

await check('Norsk, ikke innlogget: hydrering uten feil, startkortet blinker ikke («Laster …»), og ingen iframe', async page => {
  const errors = errorsOf(page)
  await page.addInitScript(() => {
    window.__loading = false
    new MutationObserver(() => { if (document.getElementById('arvWizard')?.textContent.includes('Laster veiviseren')) window.__loading = true })
      .observe(document, { childList: true, subtree: true, characterData: true })
  })
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  assert(await page.evaluate(() => window.__loading) === false, '«Laster veiviseren …» ble vist')
  assert(await page.locator('iframe').count() === 0, 'iframe')
  assert(await page.locator('#root').getByRole('button', { name: '← Tilbake til hjemmesiden' }).isVisible(), 'linjen øverst')
  assert(await page.title() === 'Arveveiviser: Hvem arver – og hvor mye? — Arvklart', `tittel: ${await page.title()}`)
  assert(errors.length === 0, `feil: ${errors.join(' | ')}`)
}, { loggedIn: false })

await check('Spørsmålene: start, svar, neste og tilbake, varsel uten svar, og tilbake til start', async page => {
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('heading', { name: 'Hvem er du i dette arveoppgjøret?' }).waitFor()
  // Veiviseren ruller fram til spørsmålet: det skal stå under linjen øverst, ikke bak den
  await page.waitForTimeout(800)
  const below = await page.evaluate(() => document.getElementById('arvWizard').getBoundingClientRect().top >= document.getElementById('root').getBoundingClientRect().bottom - 1)
  assert(below, 'spørsmålet havnet bak linjen øverst')
  await page.getByRole('button', { name: 'Neste' }).click()
  await page.locator('#arvWizard [role="alert"], #arvWizard .aw-error').first().waitFor()
  await page.getByRole('button', { name: /Gjenlevende ektefelle eller samboer/ }).click()
  await page.getByRole('heading', { name: 'Når døde avdøde?' }).waitFor()
  await page.getByRole('button', { name: 'Tilbake', exact: true }).click()
  await page.getByRole('heading', { name: 'Hvem er du i dette arveoppgjøret?' }).waitFor()
  await page.getByRole('button', { name: 'Tilbake', exact: true }).click()
  await page.getByRole('heading', { name: 'Hvem arver – og hvor mye?' }).waitFor()
  assert(await page.getByRole('button', { name: /Fortsett der du slapp/ }).isVisible(), 'svarene ble ikke tatt vare på')
  // Svarene lagres i nettleseren som før (ikke innlogget: veiviserens egen nøkkel)
  assert(await page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null')?.answers?.role, STORE) === 'survivor', 'svaret ble ikke lagret')
}, { loggedIn: false })

await check('Fasene, ordlisten, gravferdssjekken, lenkene og «Tilbake til hjemmesiden»; tilbake i nettleseren viser veiviseren igjen', async page => {
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  const head = page.locator('#veiviser .phase-head').first()
  await head.click()
  assert(await head.getAttribute('aria-expanded') === 'true', 'fasen åpnes ikke')
  await page.locator('#veiviser .item-info-btn').first().click()
  assert(await page.locator('#veiviser li.info-open').count() === 1, 'forklaringen åpnes ikke')
  await head.click()
  assert(await head.getAttribute('aria-expanded') === 'false', 'fasen lukkes ikke')
  await page.locator('#veiviser .term-btn').first().click()
  assert(await page.locator('#veiviser .term.open').count() === 1, 'ordet åpnes ikke')
  await page.locator('#veiviser h1').click()
  assert(await page.locator('#veiviser .term.open').count() === 0, 'ordet lukkes ikke ved klikk utenfor')
  await head.click()
  await page.getByRole('button', { name: 'Start sjekk' }).click()
  await page.getByRole('button', { name: 'Nei', exact: true }).click()
  await page.getByRole('button', { name: 'Ja', exact: true }).click()
  await page.getByRole('button', { name: 'Nei', exact: true }).click()
  await page.getByText('Trolig rett på et redusert beløp').waitFor()
  for (const a of await page.locator('#veiviser .resource-card').all()) assert(await a.getAttribute('target') === '_blank' && (await a.getAttribute('rel')).includes('noopener'), 'ressurslenke')
  await page.locator('#ctaBtn').click()
  await page.waitForURL(`${BASE}/`)
  await page.locator('#root h1').waitFor()
  assert(await page.evaluate(() => document.getElementById('veiviser').hidden), 'veiviseren vises under forsiden')
  await page.goBack()
  await page.waitForURL(`${BASE}/veiviser`)
  assert(await page.evaluate(() => !document.getElementById('veiviser').hidden), 'veiviseren vises ikke igjen')
  await page.getByText('Trolig rett på et redusert beløp').waitFor()
  await page.locator('#root').getByRole('button', { name: '← Tilbake til hjemmesiden' }).click()
  await page.waitForURL(`${BASE}/`)
}, { loggedIn: false })

await check('Linjen øverst blir stående når man blar (som over iframen), på mobil', async page => {
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(200)
  const top = await page.locator('#root').getByRole('button', { name: '← Tilbake til hjemmesiden' }).boundingBox()
  assert(top && top.y >= 0 && top.y < 60, `linjen er ikke synlig øverst: ${JSON.stringify(top)}`)
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'vannrett rulling')
}, { loggedIn: false })

await check('Lagre uten innlogging: dialog for ny bruker og innlogging; Escape avbryter uten feilmelding', async page => {
  await withResult(page)
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  await page.getByRole('button', { name: 'Opprett bruker og lagre' }).click()
  const dialog = page.getByRole('dialog', { name: 'Opprett bruker og lagre' })
  await dialog.waitFor()
  assert(await page.evaluate(() => document.activeElement?.id) === 'wz-name', 'fokus er ikke i dialogen')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert(!(await page.locator('#arvWizard').innerText()).includes('Noe gikk galt'), 'feilmelding etter avbrudd')
  await page.getByRole('button', { name: 'Har du allerede bruker? Logg inn' }).click()
  await page.getByRole('dialog', { name: 'Logg inn og lagre' }).waitFor()
}, { loggedIn: false })

await check('Ny bruker fra veiviseren: boet opprettes, svarene lagres, og man kommer til boets veiviser (iframen)', async (page, calls) => {
  await withResult(page)
  await page.route('https://test.supabase.co/auth/v1/signup**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
  await page.route('https://test.supabase.co/auth/v1/user', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }))
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  await page.getByRole('button', { name: 'Opprett bruker og lagre' }).click()
  await page.locator('#wz-name').fill('Kari')
  await page.locator('#wz-email').fill('test@test.no')
  await page.locator('#wz-password').fill('hemmelig123')
  await page.getByRole('dialog').getByRole('button', { name: 'Opprett bruker og lagre' }).click()
  await page.waitForURL(`${BASE}/estate/${EST}/guide`, { timeout: 15000 })
  await page.frameLocator('iframe').locator('#arvWizard .aw-card').first().waitFor()
  assert(await page.evaluate(() => document.getElementById('veiviser').hidden), 'veiviseren i siden vises under boet')
  assert(calls.some(c => c.method === 'POST' && c.table === 'estates'), 'boet ble ikke opprettet')
  assert(calls.some(c => c.method === 'PATCH' && c.table === 'estates'), 'svarene ble ikke lagret i boet')
}, { loggedIn: false })

await check('Innlogget på /veiviser: toppmenyen, veiviseren i siden, og «Lagre i et bo» med boene der man er administrator', async (page, calls) => {
  await withResult(page, `arvklart-arveveiviser-v2:${UID}:veiviser`)
  await page.goto(`${BASE}/veiviser`)
  await page.locator('.tb-logo').first().waitFor()
  await ready(page)
  assert(await page.locator('iframe').count() === 0, 'iframe')
  await page.getByRole('button', { name: /Lagre i et bo|Lagre i boet|Lagre resultatet/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Lagre i et bo' })
  await dialog.waitFor()
  await dialog.getByRole('button', { name: 'Testbo' }).click()
  await page.waitForURL(`${BASE}/estate/${EST}/guide`, { timeout: 15000 })
  assert(calls.some(c => c.method === 'PATCH' && c.table === 'estates'), 'svarene ble ikke lagret i boet')
})

await check('Fra et bo (/estate/:id/guide): veiviseren i iframen som før, med boets navn og lagring', async (page, calls) => {
  await page.goto(`${BASE}/estate/${EST}/guide`)
  const frame = page.frameLocator('iframe')
  await frame.locator('#arvWizard .aw-card').first().waitFor()
  assert(await page.locator('iframe').getAttribute('src') === `/arveveiviser/ramme.html?bo=${EST}`, 'rammen')
  assert(await page.evaluate(() => !document.getElementById('veiviser')), 'veiviseren i siden finnes i appen')
  await frame.locator('#ctaBtn').click()
  await page.waitForURL(`${BASE}/estate/${EST}`)
})

await check('Demo: kan ikke lagre, og får forklaringen', async page => {
  await withResult(page, `arvklart-arveveiviser-v2:${UID}:veiviser`)
  await page.goto(`${BASE}/veiviser`)
  await ready(page)
  await page.getByRole('button', { name: /Lagre i et bo|Lagre i boet|Lagre resultatet/ }).first().click()
  await page.getByText('Demo-kontoen kan ikke lagre', { exact: false }).waitFor()
}, { email: 'mona.demo@heirsplit.no' })

await check('Engelsk (uten engelsk veiviser): norsk veiviser i siden med forklaring, uten feil', async page => {
  const errors = errorsOf(page)
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  await page.goto(`${BASE}/veiviser`)
  await page.getByText('The inheritance guide follows Norwegian law and is only available in Norwegian.').waitFor()
  await ready(page)
  assert(await page.locator('iframe').count() === 0, 'iframe')
  assert(await page.getByRole('heading', { name: 'Hvem arver – og hvor mye?' }).isVisible(), 'veiviseren vises ikke')
  assert(errors.length === 0, `feil: ${errors.join(' | ')}`)
}, { loggedIn: false })

await check('Navigering i appen til /veiviser (uten ny lasting) bruker iframen, som før', async page => {
  await page.goto(`${BASE}/`)
  await page.locator('.tb-logo').first().waitFor()
  await page.evaluate(() => { history.pushState({}, '', '/veiviser'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.frameLocator('iframe').locator('#arvWizard .aw-card').first().waitFor()
  assert(await page.locator('iframe').getAttribute('src') === '/arveveiviser/ramme.html?back=home', 'rammen')
})

await check('Tilgjengelighet (axe, WCAG 2.2 AA) og tastatur på mobil og PC', async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    const ctx = await browser.newContext({ viewport, bypassCSP: true })
    const page = await ctx.newPage()
    await page.addInitScript(() => localStorage.setItem('hs_analytics_consent', JSON.stringify({ v: 1, choice: 'denied' })))
    await page.goto(`${BASE}/veiviser`)
    await ready(page)
    await page.locator('#veiviser .phase-head').first().click()
    await page.waitForTimeout(600) // fasen åpnes med en animasjon; elementene overlapper til den er ferdig
    await page.evaluate(() => window.scrollTo(0, 0)) // axe regner ellers linjen øverst som et hinder over knappene
    await page.addScriptTag({ path: AXE })
    const v = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }))
      .violations.filter(x => ['serious', 'critical'].includes(x.impact)).map(x => `${x.id}: ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`))
    assert(v.length === 0, `${viewport.width}px: ${v.join('; ')}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${viewport.width}px: vannrett rulling`)
    // Tastatur: fasen åpnes med Enter, og fokus er synlig
    await page.locator('#veiviser .phase-head').nth(1).focus()
    await page.keyboard.press('Enter')
    assert(await page.locator('#veiviser .phase-head').nth(1).getAttribute('aria-expanded') === 'true', 'Enter åpner ikke fasen')
    assert(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'), 'fokus er ikke synlig')
    await ctx.close()
  }
}, { loggedIn: false })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
