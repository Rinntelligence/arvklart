// Akseptansetester for valgfri begrunnelse etter «Vil ha» (D2), i Chromium med simulert Supabase.
// Databasen sørger for at bare egen begrunnelse kan endres (test/db/rls.sql); her sjekkes flyten:
// «+ Si hvorfor» i sveipingen uten dialog, at sveipingen fortsetter, at påbegynt tekst ikke går tapt,
// og at begrunnelsen kan endres og fjernes fra gjenstanden og fra «Mine». Kjøres av test/e2e/run.sh.
import { BASE, EST, UID, ITEM, FIXTURES, now, category, launch, checker, assert } from './fixtures.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE = require.resolve('axe-core/axe.min.js')
const browser = await launch()
const results = []
const check = checker(browser, results)

const ITEM2 = '33333333-0000-0000-0000-000000000002'
const item = (id, title) => ({ id, estate_id: EST, title, description: '', status: 'active', condition: 'good', image_url: null, extra_images: [],
  estimated_value: null, added_by: UID, added_by_name: 'Test', created_at: now, category_id: 'c1', categories: category, interests: [], comments: [] })
const twoItems = { fixtures: { items: [item(ITEM, 'Gyngestol'), item(ITEM2, 'Lampe')] } }

// Simulerer interests-tabellen: ønsker lagres i minnet, og PATCH treffer bare egen rad (som RLS).
// failPatch: oppdateringen treffer ingen rad (slik databasen svarer når den ikke tillater endringen).
async function interestsTable(page, { rows = [], failPatch = false } = {}) {
  const state = { rows: rows.map(r => ({ ...r })), patches: [], failPatch }
  await page.route('https://test.supabase.co/rest/v1/interests**', async route => {
    const req = route.request(), url = new URL(req.url())
    const eq = k => url.searchParams.get(k)?.replace(/^eq\./, '')
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'POST') {
      const b = JSON.parse(req.postData() || '{}')
      const row = { id: `int-${state.rows.length + 1}`, created_at: now, ...b }
      state.rows.push(row)
      return json(row, 201)
    }
    if (req.method() === 'PATCH') {
      const b = JSON.parse(req.postData() || '{}')
      state.patches.push(b)
      const hit = state.rows.filter(r => r.item_id === eq('item_id') && r.user_id === eq('user_id'))
      if (state.failPatch || !hit.length) return json([])
      hit.forEach(r => Object.assign(r, b))
      return json(hit.map(r => ({ id: r.id })))
    }
    if (req.method() === 'DELETE') {
      state.rows = state.rows.filter(r => !(r.item_id === eq('item_id') && r.user_id === eq('user_id')))
      return route.fulfill({ status: 204, body: '' })
    }
    const itemId = eq('item_id')
    return json(state.rows.filter(r => !itemId || r.item_id === itemId))
  })
  return state
}

await check('Sveip: «Vil ha» gir «+ Si hvorfor», som åpner et felt på stedet (ingen dialog) og lagrer bare begrunnelsen', async page => {
  const db = await interestsTable(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByText('Du vil ha «Gyngestol»').waitFor()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  assert(await page.getByRole('dialog').count() === 0, 'begrunnelsen åpnet en dialog')
  const field = page.getByLabel('Hvorfor vil du ha «Gyngestol»? (valgfritt)')
  assert(await field.evaluate(el => el === document.activeElement), 'fokus er ikke i feltet')
  await page.getByText('De andre i boet kan se dette.').waitFor()
  // Sveipingen virker fortsatt mens feltet er åpent
  assert(await page.getByRole('button', { name: 'Nei takk' }).isEnabled(), '«Nei takk» er ikke tilgjengelig mens feltet er åpent')
  await field.fill('Husker den fra hytta')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText('Din begrunnelse:').waitFor()
  assert(db.patches.length === 1, `forventet én lagring, fikk ${db.patches.length}`)
  assert(JSON.stringify(db.patches[0]) === JSON.stringify({ reason: 'Husker den fra hytta' }), `sendte mer enn begrunnelsen: ${JSON.stringify(db.patches[0])}`)
  assert(db.rows[0].reason === 'Husker den fra hytta', 'begrunnelsen ble ikke lagret')
  // Fokus tilbake til knappen som endrer begrunnelsen, ikke tapt på siden
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Endre begrunnelsen', 'fokus kom ikke tilbake')
}, twoItems)

await check('Sveip: helt valgfritt; man kan sveipe videre uten å svare, og «Vil ha» lagrer ingen tom begrunnelse', async page => {
  const db = await interestsTable(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByText('Du vil ha «Gyngestol»').waitFor()
  await page.getByRole('button', { name: 'Nei takk' }).click()
  await page.getByText('Nei takk til «Lampe»').waitFor()
  assert(db.patches.length === 0, 'en begrunnelse ble lagret uten at noe var skrevet')
  assert(db.rows[0].reason === null, `ønsket fikk begrunnelse ${JSON.stringify(db.rows[0].reason)}, ventet null`)
}, twoItems)

await check('Sveip: påbegynt begrunnelse lagres når man sveiper videre', async page => {
  const db = await interestsTable(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.getByLabel(/Hvorfor vil du ha «Gyngestol»/).fill('Til barnebarna')
  await page.getByRole('button', { name: 'Nei takk' }).click()
  await page.getByText('Begrunnelse lagret for «Gyngestol»').waitFor()
  assert(db.patches.length === 1 && db.patches[0].reason === 'Til barnebarna', 'begrunnelsen ble ikke lagret ved sveip videre')
}, twoItems)

await check('Sveip: feiler lagringen, tas teksten vare på og kan fullføres fra gjenstanden', async page => {
  const db = await interestsTable(page, { failPatch: true })
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.getByLabel(/Hvorfor vil du ha «Gyngestol»/).fill('Mormors favoritt')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText('Kunne ikke lagre begrunnelsen. Teksten er tatt vare på, prøv igjen.').waitFor()
  // Teksten står fortsatt i feltet
  assert(await page.getByLabel(/Hvorfor vil du ha «Gyngestol»/).inputValue() === 'Mormors favoritt', 'teksten forsvant etter feil')
  // Gå til gjenstanden (samme fane): utkastet tilbys
  db.failPatch = false
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByText('Du har en begrunnelse som ikke er lagret.').waitFor()
  await page.getByRole('button', { name: 'Fortsett' }).click()
  assert(await page.getByLabel(/Hvorfor vil du ha den/).inputValue() === 'Mormors favoritt', 'utkastet ble ikke hentet fram')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText('Din begrunnelse:').waitFor()
  assert(db.rows[0].reason === 'Mormors favoritt', 'utkastet ble ikke lagret')
  assert(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('arvklart:reasonDraft:')).length) === 0, 'utkastet ble liggende etter lagring')
}, twoItems)

await check('Sveip: «Angre» fjerner ønsket og en påbegynt begrunnelse', async page => {
  const db = await interestsTable(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.getByLabel(/Hvorfor vil du ha «Gyngestol»/).fill('Ombestemt meg')
  await page.getByRole('button', { name: 'Angre' }).click()
  // «Vil ha» finnes også på neste kort, så vent til angrelinjen er borte
  await page.getByText('Du vil ha «Gyngestol»').waitFor({ state: 'detached' })
  assert(db.rows.length === 0, 'ønsket ble ikke fjernet')
  assert(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('arvklart:reasonDraft:')).length) === 0, 'utkastet ble liggende etter angre')
}, twoItems)

const withMyInterest = reason => ({ rows: [{ id: 'int-1', item_id: ITEM, user_id: UID, reason, created_at: now }] })

await check('Gjenstand: egen begrunnelse kan endres og fjernes, og «Trekk» er uendret', async page => {
  const db = await interestsTable(page, withMyInterest('Gammel tekst'))
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByText('Din begrunnelse:').waitFor()
  await page.getByRole('button', { name: 'Du er interessert — klikk for å angre' }).waitFor()
  await page.getByRole('button', { name: 'Endre begrunnelsen' }).click()
  const field = page.getByLabel(/Hvorfor vil du ha den/)
  assert(await field.inputValue() === 'Gammel tekst', 'feltet viser ikke lagret begrunnelse')
  await field.fill('Ny tekst')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText('«Ny tekst»').first().waitFor()
  await page.getByRole('button', { name: 'Fjern begrunnelsen' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).waitFor()
  assert(JSON.stringify(db.patches) === JSON.stringify([{ reason: 'Ny tekst' }, { reason: null }]), `feil lagringer: ${JSON.stringify(db.patches)}`)
})

await check('Gjenstand: Esc lukker feltet uten å miste teksten', async page => {
  await interestsTable(page, withMyInterest(null))
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.getByLabel(/Hvorfor vil du ha den/).fill('Halvferdig')
  await page.keyboard.press('Escape')
  await page.getByText('Du har en begrunnelse som ikke er lagret.').waitFor()
  assert(await page.evaluate(() => document.activeElement?.textContent) === 'Fortsett', 'fokus kom ikke tilbake til knappen')
  await page.reload()
  await page.getByText('Du har en begrunnelse som ikke er lagret.').waitFor()
  await page.getByRole('button', { name: 'Forkast' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).waitFor()
})

await check('Mine ønsker: begrunnelse kan legges til fra kortet uten å åpne gjenstanden', async page => {
  const db = await interestsTable(page, withMyInterest(null))
  await page.goto(`${BASE}/estate/${EST}`)
  await page.locator('[data-tab="mine"]').click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.getByLabel('Hvorfor vil du ha «Gyngestol»? (valgfritt)').fill('Til hytta')
  await page.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText('Din begrunnelse:').waitFor()
  assert(page.url().endsWith(`/estate/${EST}`), 'kortet åpnet gjenstanden')
  assert(db.patches.length === 1 && db.patches[0].reason === 'Til hytta', 'begrunnelsen ble ikke lagret')
})

await check('Engelsk: «+ Say why» og hjelpeteksten er oversatt', async page => {
  await interestsTable(page)
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Want' }).click()
  await page.getByRole('button', { name: '+ Say why' }).click()
  await page.getByText('Others in the estate can see this.').waitFor()
}, twoItems)

await check('Tilgjengelighet (axe): sveipesiden med åpent begrunnelsesfelt', async page => {
  await interestsTable(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Vil ha' }).click()
  await page.getByRole('button', { name: '+ Si hvorfor' }).click()
  await page.addScriptTag({ path: AXE })
  const v = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`)
  })
  assert(!v.length, v.join('; '))
}, twoItems)

await browser.close()
console.log(results.join('\n'))
if (results.some(r => r.startsWith('FAIL'))) process.exit(1)
