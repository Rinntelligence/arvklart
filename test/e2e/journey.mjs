// Akseptansetester for kundereisen (bølge 1B), i Chromium med simulert Supabase. Kjøres av test/e2e/run.sh.
import { BASE, EST, UID, ITEM, FIXTURES, now, category, launch, checker, assert } from './fixtures.mjs'

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
  // Vent på at kortet faktisk er tilbake (teksten «Gyngestol» står også i angrelinjen, så den beviser ingenting)
  await page.getByRole('button', { name: 'Nei takk' }).waitFor({ timeout: 5000 }).catch(() => {})
  assert(calls.some(c => c.method === 'DELETE' && c.table === 'item_passes'), '«nei takk» ble ikke fjernet')
  await page.getByRole('button', { name: 'Nei takk' }).waitFor({ timeout: 5000 }).catch(() => { throw new Error('kortet vises ikke igjen') })
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

// ── Bølge 2A ──────────────────────────────────────────────────────────────────
const U2 = '11111111-0000-0000-0000-000000000002'
const kari = { user_id: U2, display_name: 'Kari', avatar_color: '#A97C3F', email: 'kari@test.no' }
const bothWant = [{ user_id: UID }, { user_id: U2 }]
const contested = {
  estate_members: [
    { estate_id: EST, user_id: UID, role: 'admin', joined_at: now, profiles: FIXTURES.profiles[0] },
    { estate_id: EST, user_id: U2, role: 'member', joined_at: now, profiles: kari },
  ],
  profiles: [FIXTURES.profiles[0], kari],
  items: [
    { id: ITEM, estate_id: EST, title: 'Gyngestol', status: 'active', estimated_value: '1500', added_by: UID, created_at: now, category_id: 'c1', categories: category, interests: bothWant },
    { id: 'it-2', estate_id: EST, title: 'Maleri', status: 'active', estimated_value: null, added_by: UID, created_at: now, category_id: 'c1', categories: category, interests: bothWant },
  ],
  heirs: [],
  // getItems henter interessene fra egen tabell
  interests: [ITEM, 'it-2'].flatMap(item_id => [UID, U2].map(user_id => ({ id: `${item_id}-${user_id}`, item_id, user_id, created_at: now }))),
}

await check('Jevn verdifordeling: ukjent verdi teller ikke som 0, og gjenstanden listes med «Sett verdi»', async page => {
  await page.goto(`${BASE}/estate/${EST}/conflicts`)
  await page.getByRole('button', { name: /Jevn verdifordeling|Lik verdi/ }).first().click()
  await page.getByText('Jevn verdifordeling trenger en verdi på alle gjenstandene').waitFor()
  await page.getByRole('button', { name: 'Sett verdi på Maleri' }).waitFor()
  assert(await page.getByRole('button', { name: /Bekreft og tildel/ }).count() === 0, 'tildeling kan bekreftes selv om verdi mangler')
}, { fixtures: contested })

await check('Invitasjon i ett skjermbilde: kortet vises etter «Legg til arving», med melding, SMS og e-post', async page => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('button', { name: '+ Legg til arving' }).click()
  await page.getByLabel('Fullt navn *').fill('Lars')
  await page.getByLabel('E-post (den arvingen logger inn med)').fill('lars@test.no')
  await page.getByRole('button', { name: 'Legg til arving', exact: true }).click()
  await page.getByRole('heading', { name: 'Send invitasjonen til Lars' }).waitFor()
  await page.getByText(/Hei Lars! Jeg har invitert deg til «Testbo».*lars@test\.no.*\/join\/ABC123/).waitFor()
  const mail = await page.getByRole('link', { name: 'Send e-post' }).getAttribute('href')
  assert(mail.startsWith('mailto:lars@test.no?subject='), mail)
  assert((await page.getByRole('link', { name: 'Send SMS' }).getAttribute('href')).startsWith('sms:'), 'SMS-lenke mangler')
  await page.getByRole('button', { name: 'English' }).click()
  await page.getByText(/^Hi Lars! I have invited you/).waitFor()
  await page.getByRole('button', { name: 'Ferdig' }).click()
  assert(await page.getByRole('heading', { name: 'Send invitasjonen til Lars' }).count() === 0, 'kortet ble ikke lukket')
  // Fra «Inviter arvingene»: én tydelig knapp per arving som ikke har blitt med; kode og lenke er lagt bort
  assert(!(await page.getByRole('button', { name: 'Kopier kode' }).isVisible()), 'koden er fortsatt hovedvalget')
  await page.getByRole('button', { name: 'Send invitasjon til Kari' }).click()
  await page.getByRole('heading', { name: 'Send invitasjonen til Kari' }).waitFor()
})

// Med flere arvinger er siden lang; skjemaet må åpnes der brukeren ser det (feil funnet i manuell test på mobil)
const manyHeirs = ['Kari', 'Lars', 'Mona', 'Per', 'Eva', 'Ola'].map((name, i) => ({ id: `h${i}`, estate_id: EST, name, email: `${name.toLowerCase()}@test.no`,
  relationship: 'Barn', percentage: 0, created_at: now }))
await check('Legg til arving: skjemaet åpnes synlig med fokus i navnefeltet, også når siden er lang', async page => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('button', { name: 'Send invitasjon til Ola' }).waitFor()
  await page.getByRole('button', { name: '+ Legg til arving' }).click()
  await page.waitForFunction(() => document.activeElement?.id === 'heirs-f2', null, { timeout: 3000 })
  await page.waitForTimeout(600) // myk rulling
  const inView = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  assert(inView, 'navnefeltet er utenfor skjermen')
  assert(await page.getByRole('button', { name: '+ Legg til arving' }).getAttribute('aria-expanded') === 'true', 'knappen sier ikke at skjemaet er åpent')
}, { fixtures: { heirs: manyHeirs } })

await check('Administrer: «Send invitasjoner» går til arvingene, lenken er en reserve', async page => {
  await page.goto(`${BASE}/estate/${EST}/admin`)
  assert(!(await page.getByRole('button', { name: 'Kopier lenke' }).isVisible()), 'lenken er fortsatt hovedvalget')
  await page.getByRole('button', { name: 'Send invitasjoner' }).click()
  await page.waitForURL(`**/estate/${EST}/heirs`)
})

await check('Invitasjon som ikke stemmer: viser innlogget e-post, kopier, prøv igjen og bytt konto', async page => {
  await page.goto(`${BASE}/join/ABC123`)
  await page.getByText('Du er ikke lagt til i dette boet ennå').waitFor()
  await page.getByText('test@test.no').waitFor()
  await page.getByRole('button', { name: 'Kopier e-postadressen min' }).waitFor()
  await page.getByRole('button', { name: 'Prøv igjen' }).waitFor()
  await page.getByRole('button', { name: 'Logg inn med en annen e-post' }).waitFor()
}, { rpc: { join_estate: { status: 400, body: { code: 'P0001', message: 'not_invited' } } } })

await check('Arving: ser egne ønsker ett trykk unna, ikke admin-verktøyene', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('heading', { name: 'Dine valg' }).waitFor()
  await page.getByText('gjenstander du ønsker').waitFor()
  await page.getByRole('button', { name: 'Se mine ønsker' }).click()
  await page.waitForFunction(() => document.activeElement?.dataset.tab === 'mine')
  assert(await page.locator('[data-tab="mine"]').getAttribute('aria-pressed') === 'true', '«Mine» er ikke valgt')
  assert(await page.getByRole('button', { name: /Arvinger\s*Fordelingskalkulator/ }).count() === 0, 'arvingen ser fordelingskalkulatoren')
  assert(await page.getByRole('button', { name: 'Administrer' }).count() === 0, 'arvingen ser «Administrer»')
}, { fixtures: { ...contested, estate_members: [
  { estate_id: EST, user_id: UID, role: 'member', joined_at: now, profiles: FIXTURES.profiles[0] },
  { estate_id: EST, user_id: U2, role: 'admin', joined_at: now, profiles: kari },
] } })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
