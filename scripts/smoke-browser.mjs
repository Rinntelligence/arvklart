// Røyktest i ekte nettleser mot en utrulling (forhåndsvisning eller produksjon): de viktigste brukerflytene
// virker med ekte Supabase, CSP og Vercel. Bruker aldri ekte kontoer.
//  - Offentlige sider og innlogging vises; feil passord gir feilmelding (et mislykket innloggingsforsøk med en
//    adresse som ikke finnes, ...@example.invalid).
//  - Passordtilbakestilling og invitasjonslenker uten innlogging havner der de skal.
//  - Demoen: «Test ut demo nå» åpner demo-boet, og navigering i boet (gjenstand, sveip, arvinger, løsninger,
//    fordeling, status) virker, også sidene som lastes ved behov. demo-login nullstiller demo-boet, som ved
//    hvert demobesøk.
//  - Ingen JavaScript-feil, React-feil eller brudd på innholdsreglene (CSP).
//
//   node scripts/smoke-browser.mjs https://www.arvklart.no
//   VERCEL_AUTOMATION_BYPASS_SECRET=… node scripts/smoke-browser.mjs https://<forhåndsvisning>.vercel.app
//
// Krever Chromium (CHROMIUM_PATH, standard /opt/pw-browsers/chromium). Skriptet rapporterer bare.
import { chromium } from 'playwright-core'

const [base] = process.argv.slice(2)
if (!base || !/^https?:\/\//.test(base)) { console.error('Bruk: node scripts/smoke-browser.mjs <https://adresse>'); process.exit(2) }
const BASE = base.replace(/\/$/, '')
const origin = new URL(BASE).origin
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const results = []
const notes = [] // ting som ikke kunne sjekkes, rapporteres som SKIP
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })

// consent: valget om statistikk som settes før siden lastes (standard «Avslå», så spørsmålet ikke dekker knappene)
async function newPage({ consent = 'denied' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nb-NO' })
  const page = await ctx.newPage()
  if (consent) await page.addInitScript(c => { if (!localStorage.getItem('hs_analytics_consent')) localStorage.setItem('hs_analytics_consent', JSON.stringify({ v: 1, choice: c, at: new Date().toISOString() })) }, consent)
  // Bypass-hodet bare mot vår egen adresse (ikke mot Supabase, der et ukjent hode ville stoppet CORS)
  if (secret) await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret } }))
  const problems = []
  page.on('pageerror', e => problems.push(`JS-feil: ${e.message.slice(0, 160)}`))
  page.on('console', m => { if (m.type() === 'error' && /Minified React error|Content Security Policy|Refused to/i.test(m.text())) problems.push(`konsoll: ${m.text().slice(0, 160)}`) })
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`)))
  return { ctx, page, problems }
}

async function check(name, fn, opts) {
  const { ctx, page, problems } = await newPage(opts)
  try {
    await fn(page)
    if (problems.length) throw new Error(problems.join(' | '))
    results.push(`OK   ${name}`)
    for (const n of notes.splice(0)) results.push(n.startsWith('INFO ') ? n : `SKIP ${name}: ${n}`)
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split('\n')[0]} (adresse: ${page.url()})`)
    for (const n of notes.splice(0)) if (n.startsWith('INFO ')) results.push(n)
  }
  await ctx.close()
}
const assert = (c, m) => { if (!c) throw new Error(m) }
const notBroken = async page => assert(await page.getByText('Siden kunne ikke lastes').count() === 0, '«Siden kunne ikke lastes» vises')

await check('Forsiden «/»: overskrift, demo-knapp og lenker', async page => {
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { level: 1 }).waitFor()
  await page.getByRole('button', { name: /Test ut demo/ }).waitFor()
  for (const href of ['/veiviser', '/kontakt', '/personvern', '/logg-inn']) assert(await page.locator(`a[href="${href}"]`).count() > 0, `lenken til ${href} mangler`)
})

await check('Uten innlogging: /home, /app og app-sider ender på forsiden «/»', async page => {
  for (const path of ['/home', '/app', '/estate/00000000-0000-0000-0000-000000000000']) {
    await page.goto(BASE + path)
    await page.waitForURL(`${BASE}/`, { timeout: 15000 })
  }
})

await check('Ukjente adresser og guider som ikke er publisert: HTTP 404 med 404-siden', async page => {
  for (const path of ['/finnes-ikke', '/guider/finnes-ikke', '/guider/mal-for-guide']) {
    const res = await page.goto(BASE + path)
    assert(res.status() === 404, `${path}: ${res.status()}`)
    await page.getByRole('heading', { name: 'Fant ikke siden' }).waitFor()
  }
})

await check('Innlogging: skjemaet vises, og feil passord gir feilmelding', async page => {
  await page.goto(`${BASE}/logg-inn`)
  await page.locator('input[type=email]').fill('arvklart-smoke@example.invalid')
  await page.locator('input[type=password]').fill('feil-passord-123')
  await page.locator('input[type=password]').press('Enter')
  await page.getByRole('alert').filter({ hasText: /Feil e-post eller passord|Invalid|ugyldig|for mange/i }).first().waitFor({ timeout: 15000 })
  assert(page.url().startsWith(`${BASE}/logg-inn`), 'ble sendt videre uten innlogging')
})

await check('Nytt passord uten lenke: siden vises uten feil', async page => {
  await page.goto(`${BASE}/nytt-passord`)
  await page.locator('body').getByText(/passord/i).first().waitFor({ timeout: 15000 })
  await notBroken(page)
})

await check('Invitasjonslenke uten innlogging: til innlogging, med beskjed om invitasjonen', async page => {
  await page.goto(`${BASE}/join/SMOKETEST`)
  await page.waitForURL(`${BASE}/logg-inn`, { timeout: 15000 })
  await page.getByText(/Du er invitert til et bo/).waitFor()
})

await check('Veiviseren (i siden, uten iframe) virker, og personvern vises', async page => {
  await page.goto(`${BASE}/veiviser`)
  await page.locator('#veiviser h1').waitFor({ timeout: 20000 })
  assert(await page.locator('iframe').count() === 0, 'veiviseren ligger i en iframe')
  await page.locator('#arvWizard:not([data-prerendered]) .aw-card').first().waitFor({ timeout: 20000 }) // ui.js har tatt over
  const phase = page.locator('#veiviser .phase-head').first()
  await phase.click()
  assert(await phase.getAttribute('aria-expanded') === 'true', 'fasen åpnes ikke')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await page.getByRole('heading', { name: 'Hvem er du i dette arveoppgjøret?' }).waitFor()
  const old = await page.request.get(`${BASE}/veiviser.html`, { maxRedirects: 0, headers: secret ? { 'x-vercel-protection-bypass': secret } : {} })
  assert([301, 308].includes(old.status()), `/veiviser.html: ${old.status()}`)
  await page.goto(`${BASE}/personvern`)
  await page.getByRole('heading', { level: 1 }).waitFor()
})

await check('Demo: åpner demo-boet, og navigering i boet virker', async page => {
  await page.goto(`${BASE}/`)
  await page.getByRole('button', { name: /Test ut demo/ }).first().click()
  await page.waitForURL(/\/estate\/[0-9a-f-]{36}$/, { timeout: 30000 })
  await page.getByText(/Du ser på en/).waitFor()
  const estate = new URL(page.url()).pathname
  await page.waitForLoadState('networkidle').catch(() => {})
  await notBroken(page)
  // Gjenstandssiden: kortene i listen er klikkbare; bildet på første kort åpner gjenstanden
  const card = page.locator('img[alt]:not([alt="Arvklart"])').first()
  if (await card.count()) {
    await card.click()
    await page.waitForURL(/\/item\/[0-9a-f-]{36}$/, { timeout: 15000 })
    await page.waitForLoadState('networkidle').catch(() => {})
    await notBroken(page)
  } else notes.push('ingen gjenstand med bilde i demo-boet; gjenstandssiden ble ikke åpnet')
  for (const sub of ['swipe', 'heirs', 'conflicts', 'fordeling', 'status']) {
    await page.goto(`${BASE}${estate}/${sub}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    assert(new URL(page.url()).pathname.startsWith(estate), `${sub}: sendt bort fra boet (${page.url()})`)
    await notBroken(page)
    await page.getByText(/Du ser på en/).waitFor({ timeout: 15000 })
  }
})

// Demoinnholdet på mobil (20261109210000_demo_content_fixes): hvem den besøkende er, gitaren med bilde, tekstene
// som var feil, begrunnelsene til Kari og Lars, «Vil ha» med sveip, «Løsningsmetoder», og at en ny demoinnlogging
// nullstiller ønsket uten å ta rettelsene tilbake. Endrer bare demoboet, som hvert demobesøk gjør.
const DEMO_EST = 'deed0001-0000-0000-0000-000000000001'
const openDemo = async page => {
  await page.goto(`${BASE}/`)
  await page.getByRole('button', { name: /Test ut demo/ }).first().click()
  await page.waitForURL(/\/estate\/[0-9a-f-]{36}$/, { timeout: 30000 })
  await page.getByRole('heading', { name: 'Fam. Hansen sitt bo' }).first().waitFor({ timeout: 20000 })
}
await check('Demo på mobil: rollen, gitarbildet, tekstene, begrunnelsene, «Vil ha», løsningsmetoder og nullstilling', async page => {
  await openDemo(page)
  await page.getByText(/Du er Mona, en av tre arvinger og administrator; Kari og Lars har allerede svart\./).waitFor({ timeout: 15000 })
  await page.getByText(/Du har 10 gjenstander du ikke har tatt stilling til/).first().waitFor({ timeout: 15000 })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'oversikten kan rulles sidelengs')

  await page.goto(`${BASE}/estate/${DEMO_EST}/item/db1836d7-4b59-4036-b95b-37443affed62`)
  const img = page.locator('img[src*="demo__db1836d7"]').first()
  await img.waitFor({ timeout: 20000 })
  await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle(), { timeout: 20000 })
  notes.push(`INFO gitarbildet vises (${await img.evaluate(el => `${el.naturalWidth}×${el.naturalHeight}`)})`)

  await page.goto(`${BASE}/estate/${DEMO_EST}/item/face0002-0000-0000-0000-000000000002`)
  await page.getByText(/Tre-seters sofa i mørkegrønn velur/).waitFor({ timeout: 20000 })
  assert(await page.getByText(/spisebord/i).count() === 0, 'sofaen omtaler et spisebord')
  await page.goto(`${BASE}/estate/${DEMO_EST}/item/face0009-0000-0000-0000-000000000009`)
  await page.getByText(/Antall deler og produsent er ikke registrert/).waitFor({ timeout: 20000 })
  assert(await page.getByText(/Stavangerflint|\d+ deler/i).count() === 0, 'serviset har antall deler eller merke')

  await page.goto(`${BASE}/estate/${DEMO_EST}/item/face0004-0000-0000-0000-000000000004`)
  await page.getByText(/Ønsker flere det, tar vi en prat først/).first().waitFor({ timeout: 20000 })
  await page.getByText(/Det hørte alltid til i stua/).first().waitFor()

  await page.goto(`${BASE}/estate/${DEMO_EST}/swipe`)
  const want = page.getByRole('button', { name: /^Vil ha/ }).first()
  await want.waitFor({ timeout: 20000 })
  const box = await want.boundingBox()
  assert(box && box.y + box.height <= page.viewportSize().height, '«Vil ha» krever scrolling på mobil')
  await want.click()
  await page.getByRole('button', { name: 'Angre', exact: true }).waitFor({ timeout: 15000 })
  // Valget er lagret: oversikten teller én gjenstand færre
  await page.goto(`${BASE}/estate/${DEMO_EST}`)
  await page.getByText(/Du har 9 gjenstander du ikke har tatt stilling til/).first().waitFor({ timeout: 20000 })

  await page.goto(`${BASE}/estate/${DEMO_EST}/conflicts`)
  await page.getByRole('heading', { name: 'Løsningsmetoder' }).waitFor({ timeout: 20000 })
  // Administratoren ser enten hva som mangler, eller (når «Vil ha» over gjorde en omstridt gjenstand avklart) metodene
  await page.waitForLoadState('networkidle').catch(() => {})
  const pendingList = await page.getByText(/mangler å vise interesse eller si nei takk til \d+ gjenstand/).count()
  const methods = await page.getByText(/Snakk sammen først|Trekk vinner|Loddtrekning/).count()
  assert(pendingList || methods, '«Løsningsmetoder» viser verken hva som mangler eller metodene')
  notes.push(`INFO løsningsmetoder: ${methods ? 'metodene vises for den avklarte gjenstanden' : 'viser hva som mangler'}`)

  // Ny demoinnlogging som en ny besøkende (uten økten over): ønsket er nullstilt, rettelsene står
  await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb-')) localStorage.removeItem(k) })
  await openDemo(page)
  await page.getByText(/Du har 10 gjenstander du ikke har tatt stilling til/).first().waitFor({ timeout: 15000 })
  assert(await page.getByText('Grønn 3-seters sofa', { exact: true }).count() > 0, 'sofaen mangler etter nullstilling')
})

// ── Statistikk mot den ekte GTM-containeren (GTM-KQWKCWBC) og GA4-taggen ──────────────────────────────────────
// gtm.js og GA4-taggen hentes fra Google. GA4s målinger (…/g/collect) fanges i nettleseren og besvares lokalt, så
// testen ser nøyaktig hva som ville blitt sendt, uten at røyktesten havner i statistikken.
async function watchGoogle(page) {
  const requests = [] // alt mot Google, også det som stoppes
  const hits = []     // GA4-målinger: parametrene fra adressen og hver linje i innholdet
  page.on('request', r => { if (/googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net/.test(r.url())) requests.push(r.url()) })
  await page.route(/google-analytics\.com|analytics\.google\.com/, route => {
    const req = route.request()
    const base = Object.fromEntries(new URL(req.url()).searchParams)
    const lines = (req.postData() || '').split('\n').filter(Boolean)
    for (const line of lines.length ? lines : ['']) hits.push({ ...base, ...Object.fromEntries(new URLSearchParams(line)) })
    return route.fulfill({ status: 204, body: '' })
  })
  return { requests, hits }
}
const region = page => page.getByRole('region', { name: 'Informasjonskapsler' })

await check('Statistikk: ingenting til Google før valget; etter «Godta» sendes page_view til GA4 med samtykke bare for statistikk', async page => {
  const g = await watchGoogle(page)
  await page.goto(`${BASE}/`)
  await region(page).waitFor({ timeout: 15000 })
  await page.waitForTimeout(2000)
  assert(g.requests.length === 0, `hentet fra Google før valget: ${g.requests.slice(0, 3)}`)
  const gtm = page.waitForResponse(r => r.url().startsWith('https://www.googletagmanager.com/gtm.js?id=GTM-KQWKCWBC'), { timeout: 15000 })
  await region(page).getByRole('button', { name: 'Godta' }).click()
  const gtmRes = await gtm
  assert(gtmRes.status() === 200, 'gtm.js')
  // Hva den publiserte containeren inneholder (målings-ID-er og versjon er ikke hemmelige), for feilsøking
  const container = await gtmRes.text()
  const ids = [...new Set(container.match(/G-[A-Z0-9]{6,}/g) || [])]
  const version = container.match(/"version":"(\d+)"/)?.[1] || '?'
  const hosts = [...new Set((container.match(/arvklart[a-z0-9.-]*/gi) || []))]
  notes.push(`INFO GTM-KQWKCWBC versjon ${version}: GA4-ID-er i containeren: ${ids.join(', ') || 'ingen'}${hosts.length ? `; vertsnavn i reglene: ${hosts.join(', ')}` : ''}`)
  // Venter på selve målingen (page_view til GA4). Kallene logges fra siden åpnes (watchGoogle).
  for (let i = 0; i < 40 && !g.hits.some(h => h.en === 'page_view'); i++) await page.waitForTimeout(500)
  if (!g.hits.some(h => h.en === 'page_view')) {
    const state = await page.evaluate(() => ({
      layer: (window.dataLayer || []).map(e => (e && typeof e.length === 'number' && !Array.isArray(e)) ? Array.from(e)[0] + ':' + (Array.from(e)[1] ?? '') : (e?.event || Object.keys(e || {}).join('+'))),
      gtm: Object.keys(window.google_tag_manager || {}),
    })).catch(() => ({ layer: [], gtm: [] }))
    const calls = [...new Set(g.requests.map(u => { const x = new URL(u); return x.host + x.pathname })) ]
    throw new Error(`ingen page_view sendt etter «Godta». GTM versjon ${version}, GA4-ID i containeren: ${ids.join(', ') || 'ingen'}. `
      + `Kall til Google: ${calls.join(', ') || 'ingen'}. dataLayer: ${state.layer.join(', ')}. Registrert i GTM: ${state.gtm.join(', ') || 'ingenting'}. Målinger: ${g.hits.map(h => h.en).join(',') || 'ingen'}`)
  }
  if (!g.requests.some(u => /googletagmanager\.com\/gtag\/js\?id=G-/.test(u))) notes.push('INFO GA4 ble lastet uten eget gtag/js-kall (innebygd i containeren)')
  const pv = g.hits.find(h => h.en === 'page_view')
  assert(pv, `ingen page_view sendt etter «Godta» (målinger: ${g.hits.map(h => h.en).join(',') || 'ingen'})`)
  assert(/^G-[A-Z0-9]+$/.test(pv.tid || ''), `målings-ID: ${pv.tid}`)
  // gcs = G1<annonser><statistikk>: G101 er statistikk tillatt, annonser avslått
  if (pv.gcs) assert(pv.gcs === 'G101', `samtykkemodus: gcs=${pv.gcs} (forventet G101)`)
  const dl = new URL(pv.dl)
  assert(dl.origin === new URL(BASE).origin && dl.pathname === '/', `sideadresse i målingen: ${pv.dl}`)
  assert(!g.requests.some(u => /doubleclick\.net|googleadservices|\/ads\//.test(u)), `annonsekall: ${g.requests.filter(u => /doubleclick|ads/.test(u))}`)
  notes.push(`INFO GA4 ${pv.tid}: ${g.hits.length} måling(er) (${[...new Set(g.hits.map(h => h.en))].join(', ')}), gcs=${pv.gcs || '–'}`)
}, { consent: null })

await check('Statistikk: etter «Avslå» sendes ingenting til Google, heller ikke etter ny lasting og på andre offentlige sider', async page => {
  const g = await watchGoogle(page)
  await page.goto(`${BASE}/`)
  await region(page).getByRole('button', { name: 'Avslå' }).click({ timeout: 15000 })
  for (const path of ['/', '/kontakt', '/veiviser']) { await page.goto(BASE + path); await page.waitForTimeout(1500) }
  assert(await region(page).count() === 0, 'spørsmålet vises igjen etter «Avslå»')
  assert(g.requests.length === 0, `sendt til Google etter avslag: ${g.requests.slice(0, 3)}`)
}, { consent: null })

await check('Statistikk: etter tilbaketrekking på /personvern sendes ingenting, og informasjonskapslene er borte', async page => {
  const g = await watchGoogle(page)
  await page.goto(`${BASE}/`)
  await region(page).getByRole('button', { name: 'Godta' }).click({ timeout: 15000 })
  for (let i = 0; i < 30 && !g.hits.length; i++) await page.waitForTimeout(500)
  await page.goto(`${BASE}/personvern#informasjonskapsler`)
  await page.getByRole('button', { name: 'Trekk tilbake samtykket' }).click({ timeout: 15000 })
  await page.getByText('Du har avslått statistikk i denne nettleseren.').waitFor({ timeout: 15000 })
  const before = g.requests.length
  for (const path of ['/', '/kontakt']) { await page.goto(BASE + path); await page.waitForTimeout(1500) }
  assert(g.requests.length === before, `sendt til Google etter tilbaketrekking: ${g.requests.slice(before, before + 3)}`)
  const cookies = (await page.context().cookies()).filter(c => /^_ga/.test(c.name)).map(c => c.name)
  assert(cookies.length === 0, `informasjonskapsler igjen: ${cookies}`)
}, { consent: null })

await check('Statistikk: demoen fra forsiden med samtykke laster siden på nytt uten GTM; ingen måling fra demo-boet', async page => {
  const g = await watchGoogle(page)
  await page.goto(`${BASE}/`)
  await region(page).getByRole('button', { name: 'Godta' }).click({ timeout: 15000 })
  await page.waitForResponse(r => r.url().startsWith('https://www.googletagmanager.com/gtm.js'), { timeout: 15000 })
  await page.getByRole('button', { name: /Test ut demo/ }).first().click()
  await page.waitForURL(/\/estate\/[0-9a-f-]{36}$/, { timeout: 30000 })
  await page.getByText(/Du ser på en/).waitFor()
  const estate = new URL(page.url()).pathname
  await page.waitForTimeout(3000)
  assert(await page.evaluate(() => !window.__arvklartGtm), 'GTM er lastet i demo-boet')
  const leaked = g.hits.filter(h => /\/estate\/|\/app/.test(h.dl || '') || (h.dl || '').includes(estate))
  assert(leaked.length === 0, `måling med app-adresse: ${leaked.map(h => h.dl)}`)
}, { consent: null })

await browser.close()
console.log([`Røyktest mot ${BASE}${secret ? ' (med bypass-hemmelighet)' : ''}`, ...results].join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
