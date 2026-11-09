// Demoen i appen: hvem som er demo (bare merket app_metadata.arvklart_demo; e-posten avgjør ingenting),
// banneret, og at utlogging fra demoen bare gjelder denne nettleseren. Alle besøkende deler demokontoen, så global
// utlogging ville kastet ut alle andre. Vanlige brukere logges ut globalt som før. Kjøres av test/e2e/run.sh.
import { readFileSync } from 'node:fs'
import { BASE, EST, UID, FIXTURES, launch, checker, assert, DEMO } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const MONA = DEMO
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

await check('Den gamle demoe-posten uten merke er ikke demo (ingen demobanner)', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('heading', { level: 1 }).first().waitFor()
  await page.waitForTimeout(300)
  assert(await page.getByText(/Du ser på en/).count() === 0, 'demobanneret vises for en konto uten merke')
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

// ── Brukerreisen i demoen på mobil, med eksempelsvarene fra nullstillingen ─────────────────────────────────────
// Tekstene hentes fra den siste migreringen med reset_demo_estate(), så testen viser det besøkende faktisk ser:
// oversikten over boet, en gjenstand som alle tre ønsker med begrunnelsene side om side, og «Snakk sammen først».
const MIG = readFileSync(new URL('../../supabase/migrations/20261109210000_demo_content_fixes.sql', import.meta.url), 'utf8')
const wish = (item, who) => MIG.match(new RegExp(`\\('${item}-[0-9a-f-]+'::uuid, '${who}'\\s*,\\s+'([^']+)'\\)`))[1]
const KARI = '11111111-0000-0000-0000-00000000000b', LARS = '11111111-0000-0000-0000-00000000000c'
const hansen = { ...FIXTURES.estates[0], name: 'Fam. Hansen sitt bo', description: 'Boet etter Astrid og Per Hansen.' }
const people = [
  { user_id: UID, display_name: 'Mona Hansen-Dahl', avatar_color: '#7aaa7a', email: DEMO.email },
  { user_id: KARI, display_name: 'Kari Hansen', avatar_color: '#c4855a', email: 'kari.demo@arvklart.no' },
  { user_id: LARS, display_name: 'Lars Hansen', avatar_color: '#6b8fa8', email: 'lars.demo@arvklart.no' },
]
const ids = { mona: UID, kari: KARI, lars: LARS }
const demoItems = [
  ['f1', 'Bestemors gyngestol', 'face0001', ['lars', 'kari']],
  ['f2', 'Grønn 3-seters sofa', 'face0002', ['lars', 'mona']],
  ['f4', 'Oljemaleri av blomster', 'face0004', ['kari', 'lars', 'mona']],
  ['f9', 'Middagsservise', 'face0009', ['mona']],
]
const interests = demoItems.flatMap(([id, , key, who]) => who.map(w => ({ id: `${id}-${w}`, item_id: id, user_id: ids[w], reason: wish(key, w), created_at: FIXTURES.items[0].created_at })))
const demoFixtures = {
  estates: [hansen], profiles: people,
  estate_members: people.map((p, i) => ({ estate_id: EST, user_id: p.user_id, role: i === 0 ? 'admin' : 'member', joined_at: FIXTURES.items[0].created_at, estates: hansen, profiles: p })),
  heirs: people.map(p => ({ id: `h-${p.user_id}`, estate_id: EST, name: p.display_name, email: p.email, relationship: 'Barn', percentage: 33.3, user_id: p.user_id, created_at: FIXTURES.items[0].created_at })),
  items: demoItems.map(([id, title, , who]) => ({ ...FIXTURES.items[0], id, title, description: null, interests: who.map(w => ({ user_id: ids[w] })) })),
  interests,
}
const noSideScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)

await check('Mobil (390×664): oversikt over boet, gjenstanden alle ønsker med begrunnelsene, og «Snakk sammen først»', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(BANNER).waitFor()
  await page.getByRole('heading', { name: 'Fam. Hansen sitt bo' }).first().waitFor()
  for (const t of ['Bestemors gyngestol', 'Grønn 3-seters sofa', 'Middagsservise']) assert(await page.getByText(t).count() > 0, `oversikten viser ikke ${t}`)
  assert(await noSideScroll(page), 'oversikten kan rulles sidelengs på mobil')

  await page.goto(`${BASE}/estate/${EST}/item/f4`)
  await page.getByText(/^Flere ønsker denne \(3\)$/).waitFor()
  await page.getByText(/Snakk sammen først: se hvorfor hver enkelt ønsker den/).waitFor()
  for (const w of ['kari', 'lars']) await page.getByText(`"${wish('face0004', w)}"`).waitFor()
  assert(await noSideScroll(page), 'gjenstandssiden kan rulles sidelengs på mobil')

  await page.goto(`${BASE}/estate/${EST}/conflicts`)
  await page.getByRole('heading', { name: 'Snakk sammen først' }).waitFor()
  await page.getByText(`«${wish('face0001', 'kari')}»`).first().waitFor()
  assert(await noSideScroll(page), '«Løsningsmetoder» kan rulles sidelengs på mobil')
}, { ...MONA, viewport: { width: 390, height: 664 }, fixtures: demoFixtures })

await browser.close()
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} demosjekker OK`)
process.exit(failed.length ? 1 : 0)
