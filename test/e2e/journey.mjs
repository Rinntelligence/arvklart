// Akseptansetester for kundereisen (bølge 1B), i Chromium med simulert Supabase. Kjøres av test/e2e/run.sh.
import { BASE, EST, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

await check('Nytt bo åpnes direkte etter opprettelse', async page => {
  await page.goto(`${BASE}/`)
  await page.getByText('Testbo').first().waitFor()
  await page.getByRole('button', { name: '+ Nytt bo' }).click()
  await page.getByLabel('Navn på boet *').fill('Boet etter mormor')
  await page.getByRole('button', { name: /^Opprett/ }).last().click()
  await page.waitForURL(`**/estate/${EST}`)
})

await check('«+ Legg til gjenstander» går til «Legg til flere»', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('button', { name: '+ Legg til gjenstander' }).click()
  await page.waitForURL(`**/estate/${EST}/add-many`)
})

await check('Søk i boet finner gjenstanden, og sier fra når ingenting passer', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  const search = page.getByRole('searchbox', { name: 'Søk i boet' })
  await search.fill('gyng')
  await page.getByRole('button', { name: 'Gyngestol', exact: true }).waitFor()
  await search.fill('eik')
  await page.getByRole('button', { name: 'Gyngestol', exact: true }).waitFor()
  await search.fill('piano')
  await page.getByText('Ingen gjenstander passer «piano».').waitFor()
  await page.getByRole('button', { name: 'Tøm søket' }).click()
  await page.getByRole('button', { name: 'Gyngestol', exact: true }).waitFor()
})

await check('Sveip: «Nei takk» kan angres uten tidsfrist', async (page, calls) => {
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Nei takk' }).click()
  await page.getByText('Nei takk til «Gyngestol»').waitFor()
  await page.waitForTimeout(3000)
  await page.getByRole('button', { name: 'Angre' }).click()
  await page.getByText('Gyngestol').first().waitFor()
  assert(calls.some(c => c.method === 'DELETE' && c.table === 'item_passes'), '«nei takk» ble ikke fjernet')
  assert(await page.getByRole('button', { name: 'Nei takk' }).count() === 1, 'kortet vises ikke igjen')
})

await check('Arvinger: fjerning krever bekreftelse', async (page, calls) => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('button', { name: 'Fjern Kari' }).click()
  await page.getByRole('dialog', { name: 'Fjerne Kari?' }).waitFor()
  await page.getByRole('button', { name: 'Avbryt' }).click()
  assert(!calls.some(c => c.method === 'DELETE' && c.table === 'heirs'), 'arvingen ble slettet uten bekreftelse')
  await page.getByRole('button', { name: 'Fjern Kari' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Fjern' }).click()
  await page.waitForTimeout(300)
  assert(calls.some(c => c.method === 'DELETE' && c.table === 'heirs'), 'arvingen ble ikke slettet etter bekreftelse')
})

await check('Verdi på kortet er merket som anslag («ca.»)', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByText(/^ca\. kr\s?1\s?500$|^ca\. 1\s?500\s?kr$/).first().waitFor()
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
