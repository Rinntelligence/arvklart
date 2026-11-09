// Demoen i appen: hvem som er demo (merket app_metadata.arvklart_demo, eller i overgangen den gamle e-posten),
// banneret, og at utlogging fra demoen bare gjelder denne nettleseren. Alle besøkende deler demokontoen, så global
// utlogging ville kastet ut alle andre. Vanlige brukere logges ut globalt som før. Kjøres av test/e2e/run.sh.
import { BASE, EST, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const MONA = { email: 'mona.demo@arvklart.no', meta: { app_metadata: { provider: 'email', arvklart_demo: 'mona' } } }
const BANNER = /Dette er et offentlig eksempelbo\. Ikke skriv personopplysninger\. Endringer kan bli nullstilt når andre prøver demoen\./

// Fanger utloggingskallet til Supabase Auth (POST /auth/v1/logout?scope=…)
const logoutScopes = page => {
  const scopes = []
  page.on('request', r => { const u = new URL(r.url()); if (u.pathname === '/auth/v1/logout') scopes.push(u.searchParams.get('scope') || 'global') })
  return scopes
}

await check('Merket demokonto (ny e-post): demobanneret med teksten om offentlig eksempelbo, ingen tilbakemeldingsknapp', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(/Du ser på en/).waitFor()
  await page.getByText(BANNER).waitFor()
  assert(await page.getByText(/Fam\. Hansen sitt bo/).count() > 0, 'banneret nevner ikke Fam. Hansen sitt bo')
  assert(await page.getByRole('button', { name: /tilbakemelding/i }).count() === 0, 'tilbakemeldingsknappen vises i demoen')
}, MONA)

await check('Overgang: den gamle demoe-posten uten merke er fortsatt demo', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(BANNER).waitFor()
}, { email: 'mona.demo@heirsplit.no' })

await check('Vanlig bruker med «merke» i user_metadata er ikke demo (ingen demobanner)', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.waitForTimeout(300)
  assert(await page.getByText(/Du ser på en/).count() === 0, 'demobanneret vises for en vanlig bruker')
}, { email: 'eva@test.no', meta: { user_metadata: { arvklart_demo: 'mona' } } })

await check('Demo: «Avslutt demo og gå til hjemmesiden» logger bare ut denne nettleseren (scope=local)', async page => {
  const scopes = logoutScopes(page)
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(BANNER).waitFor()
  await page.getByRole('button', { name: 'Arvklart-meny' }).click()
  await page.getByRole('menuitem', { name: 'Avslutt demo og gå til hjemmesiden' }).click()
  await page.waitForURL(`${BASE}/`)
  assert(scopes.length === 1 && scopes[0] === 'local', `utlogging med scope ${JSON.stringify(scopes)}, ventet ["local"]`)
}, MONA)

await check('Demo: «Avslutt demo» i kontomenyen logger bare ut denne nettleseren (scope=local)', async page => {
  const scopes = logoutScopes(page)
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(BANNER).waitFor()
  await page.getByRole('button', { name: /^Meny for/ }).click()
  await page.getByRole('button', { name: 'Avslutt demo', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  assert(scopes.length === 1 && scopes[0] === 'local', `utlogging med scope ${JSON.stringify(scopes)}, ventet ["local"]`)
}, MONA)

await check('Vanlig bruker: «Logg ut» logger ut overalt som før (scope=global)', async page => {
  const scopes = logoutScopes(page)
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('button', { name: /^Meny for/ }).click()
  await page.getByRole('button', { name: 'Logg ut', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  assert(scopes.length === 1 && scopes[0] === 'global', `utlogging med scope ${JSON.stringify(scopes)}, ventet ["global"]`)
})

await browser.close()
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} demosjekker OK`)
process.exit(failed.length ? 1 : 0)
