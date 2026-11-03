// Code splitting (src/appPages.js, src/lib/lazyPage.js) mot det bygde nettstedet (test/e2e/staticServer.mjs):
// offentlige sider laster bare hovedfilen og holder seg innenfor budsjettet, innloggede får resten i bakgrunnen,
// en åpen fane etter en ny utrulling lastes på nytt én gang, og en side som ikke kan lastes gir en melding, ikke en
// tom side. Kjøres av test/e2e/run.sh med DIST satt til byggemappen.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { BASE, EST, launch, checker, assert } from './fixtures.mjs'
import { prerenderFile } from '../../src/seo/pages.js'
import { publicRegistry } from '../../src/seo/content.js'
import { JS_BUDGET_GZIP } from '../seo/httpChecks.mjs'

// Budsjett for JavaScript som lastes før en offentlig side er interaktiv (felles med scripts/check-seo.mjs).
// Før code splitting: 1 352 kB / 371 kB gzip.
const BUDGET_GZIP = JS_BUDGET_GZIP
const DIST = process.env.DIST
const browser = await launch()
const results = []
const check = checker(browser, results)
const assetsOf = html => [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]))]
// Antall ganger selve siden (HTML-dokumentet) er hentet: 2 = én ny lasting. Lastingen skjer før «load», så den telles slik.
const documentLoads = page => { let n = 0; page.on('request', r => { if (r.resourceType() === 'document' && r.frame() === page.mainFrame()) n++ }); return () => n }
const APP_CHUNK = /\/assets\/(EstatesPage|EstatePage|ItemDetailPage|AddItemsPage|HeirsPage|ConflictPage|DistributionPage|FounderPage)-[\w-]+\.js$/

await check('Offentlige sider: bare hovedfilen, innenfor budsjettet og uten diagrambiblioteket', async () => {
  assert(DIST, 'DIST (byggemappen) er ikke satt')
  // Alle forhåndsrendrede sider i bygget, også guidene (testinnholdet, ARVKLART_CONTENT_DIR)
  for (const page of publicRegistry(process.env.ARVKLART_CONTENT_DIR || 'test/fixtures/content').filter(p => p.prerender)) {
    const html = readFileSync(join(DIST, prerenderFile(page.path)), 'utf8')
    const files = assetsOf(html)
    const code = files.map(f => readFileSync(join(DIST, f)))
    const gz = code.reduce((n, b) => n + gzipSync(b).length, 0)
    assert(gz <= BUDGET_GZIP, `${page.path}: ${Math.round(gz / 1024)} kB gzip er over budsjettet på ${BUDGET_GZIP / 1024} kB`)
    assert(!code.some(b => b.includes('recharts-wrapper')), `${page.path}: diagrambiblioteket er med i første lasting`)
    assert(!files.some(f => APP_CHUNK.test(f)), `${page.path}: app-sider lastes på forhånd: ${files}`)
  }
  const chunks = readdirSync(join(DIST, 'assets'))
  for (const name of ['EstatesPage', 'EstatePage', 'ItemDetailPage', 'AddItemsPage', 'DistributionPage', 'FounderPage'])
    assert(chunks.some(f => f.startsWith(`${name}-`)), `${name} er ikke en egen fil`)
}, { loggedIn: false })

await check('Ikke innlogget: forsiden henter ingen app-sider', async page => {
  const requested = []
  page.on('request', r => requested.push(new URL(r.url()).pathname))
  await page.goto(`${BASE}/`)
  await page.getByRole('button', { name: 'Test ut demo nå' }).waitFor()
  await page.waitForTimeout(2500)
  assert(!requested.some(p => APP_CHUNK.test(p)), `app-sider ble hentet: ${requested.filter(p => APP_CHUNK.test(p))}`)
}, { loggedIn: false })

await check('Innlogget: resten av appen hentes i bakgrunnen, og navigering virker', async page => {
  const requested = new Set()
  page.on('request', r => requested.add(new URL(r.url()).pathname))
  await page.goto(`${BASE}/`)
  await page.getByText('Testbo').first().waitFor()
  await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => /\/assets\/DistributionPage-/.test(e.name)), null, { timeout: 8000 })
  assert([...requested].some(p => /\/assets\/HeirsPage-/.test(p)), 'app-sidene ble ikke forhåndslastet')
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText('Testbo').first().waitFor()
})

await check('Ny utrulling: mangler en fil, lastes siden på nytt én gang og virker', async page => {
  let failures = 0
  await page.route(/\/assets\/EstatesPage-[\w-]+\.js$/, route => {
    if (failures++ === 0) return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>borte</title>' })
    return route.fallback()
  })
  const loads = documentLoads(page)
  await page.goto(`${BASE}/`)
  await page.getByText('Testbo').first().waitFor({ timeout: 10000 })
  assert(loads() === 2, `forventet én ny lasting, fikk ${loads() - 1}`)
  assert(await page.evaluate(() => sessionStorage.getItem('hs_chunk_reload')) === null, 'merket for ny lasting ble ikke fjernet')
})

await check('Kan ikke lastes: melding og knapp i stedet for tom side, og ingen løkke', async page => {
  await page.route(/\/assets\/EstatesPage-[\w-]+\.js$/, route => route.abort())
  const loads = documentLoads(page)
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: 'Siden kunne ikke lastes' }).waitFor({ timeout: 10000 })
  await page.waitForTimeout(1500)
  assert(loads() === 2, `forventet nøyaktig én ny lasting, fikk ${loads() - 1}`)
  assert(await page.getByRole('button', { name: 'Last inn på nytt' }).isVisible(), 'knappen mangler')
  assert(await page.locator('.tb-logo').first().isVisible(), 'toppmenyen forsvant')
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
