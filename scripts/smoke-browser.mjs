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

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'nb-NO' })
  const page = await ctx.newPage()
  // Bypass-hodet bare mot vår egen adresse (ikke mot Supabase, der et ukjent hode ville stoppet CORS)
  if (secret) await page.route(url => url.origin === origin, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret } }))
  const problems = []
  page.on('pageerror', e => problems.push(`JS-feil: ${e.message.slice(0, 160)}`))
  page.on('console', m => { if (m.type() === 'error' && /Minified React error|Content Security Policy|Refused to/i.test(m.text())) problems.push(`konsoll: ${m.text().slice(0, 160)}`) })
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy: ${e.violatedDirective} ${e.blockedURI}`)))
  return { ctx, page, problems }
}

async function check(name, fn) {
  const { ctx, page, problems } = await newPage()
  try {
    await fn(page)
    if (problems.length) throw new Error(problems.join(' | '))
    results.push(`OK   ${name}`)
    for (const n of notes.splice(0)) results.push(`SKIP ${name}: ${n}`)
  } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]} (adresse: ${page.url()})`) }
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

await check('Uten innlogging: /home, /app, ukjente adresser og app-sider ender på forsiden «/»', async page => {
  for (const path of ['/home', '/app', '/finnes-ikke', '/estate/00000000-0000-0000-0000-000000000000']) {
    await page.goto(BASE + path)
    await page.waitForURL(`${BASE}/`, { timeout: 15000 })
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

await check('Veiviseren og personvern vises', async page => {
  await page.goto(`${BASE}/veiviser`)
  await page.frameLocator('iframe').locator('h1').first().waitFor({ timeout: 20000 })
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

await browser.close()
console.log([`Røyktest mot ${BASE}${secret ? ' (med bypass-hemmelighet)' : ''}`, ...results].join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
