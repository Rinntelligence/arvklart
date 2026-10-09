// Akseptansetester for kast i sveipingen, hvem som kan endre verdi og hvem som kan slette (PR #13, guard_item_update), i Chromium med
// simulert Supabase. Databasen håndhever reglene (test/db/rls.sql); her sjekkes at grensesnittet følger dem,
// og at «Nei takk» og «Angre» fra kundereisen er beholdt. Kjøres av test/e2e/run.sh.
import { BASE, EST, UID, FIXTURES, now, category, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const U2 = '11111111-0000-0000-0000-000000000002'
const kari = { user_id: U2, display_name: 'Kari', avatar_color: '#5F6E52', email: 'kari@test.no' }
const OTHERS = '33333333-0000-0000-0000-0000000000a1' // lagt inn av Kari
const MINE = '33333333-0000-0000-0000-0000000000a2' // lagt inn av meg, ikke tildelt
const MINE_ASSIGNED = '33333333-0000-0000-0000-0000000000a3' // lagt inn av meg, tildelt Kari
const item = (id, title, added_by, extra = {}) => ({ id, estate_id: EST, title, description: '', status: 'active', condition: 'good',
  image_url: null, extra_images: [], estimated_value: '1500', added_by, added_by_name: added_by === UID ? 'Test' : 'Kari',
  created_at: now, category_id: 'c1', categories: category, interests: [], comments: [], ...extra })
const items = [
  item(OTHERS, 'Gyngestol', U2),
  item(MINE, 'Lampe', UID),
  item(MINE_ASSIGNED, 'Klokke', UID, { status: 'assigned', assigned_to: U2 }),
]
const asMember = { fixtures: { items, estate_members: [
  { estate_id: EST, user_id: UID, role: 'member', joined_at: now, estates: FIXTURES.estates[0], profiles: FIXTURES.profiles[0] },
  { estate_id: EST, user_id: U2, role: 'admin', joined_at: now, profiles: kari },
] } }
const asAdmin = { fixtures: { items, estate_members: [
  { estate_id: EST, user_id: UID, role: 'admin', joined_at: now, estates: FIXTURES.estates[0], profiles: FIXTURES.profiles[0] },
  { estate_id: EST, user_id: U2, role: 'member', joined_at: now, profiles: kari },
] } }

// Fanger innholdet i PATCH-kall mot items, så testene kan se nøyaktig hvilke felt som sendes
const patches = page => {
  const bodies = []
  page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/items')) bodies.push(JSON.parse(r.postData() || '{}')) })
  return bodies
}

// Sveipingen er bare for ønsker. Hva som skjer med det ingen vil ha, bestemmes etter at alle har tatt stilling.
const noDiscardInSwipe = async page => {
  const sent = patches(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('button', { name: 'Nei takk' }).waitFor()
  await page.waitForTimeout(500)
  assert(await page.getByRole('button', { name: 'Kast' }).count() === 0, '«Kast» vises i sveipingen')
  assert(!/kast/i.test(await page.getByText('Du kan også sveipe').textContent()), 'hintet nevner kast')
  // Sveip opp med mus: skal ikke merke noe for kast
  const box = await page.getByRole('button', { name: 'Nei takk' }).boundingBox()
  const x = box.x + 120, y = box.y - 200
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x, y - 60); await page.mouse.move(x, y - 160); await page.mouse.up()
  await page.waitForTimeout(800)
  assert(!sent.some(b => 'marked_for_disposal' in b), 'sveip opp sendte kastmerking')
  await page.getByRole('button', { name: 'Nei takk' }).click()
  await page.getByRole('button', { name: 'Angre' }).waitFor()
}
await check('Sveip, arving: ingen «Kast» (knapp, sveip opp eller hint), men «Nei takk» og «Angre» finnes', noDiscardInSwipe, asMember)
await check('Sveip, administrator: heller ingen «Kast» underveis', noDiscardInSwipe, asAdmin)

await check('Rediger, arving: verdien på andres gjenstand er låst, forklart og sendes ikke ved lagring', async page => {
  const sent = patches(page)
  await page.goto(`${BASE}/estate/${EST}/item/${OTHERS}/edit`)
  const value = page.getByLabel('Estimert verdi i kroner (valgfri)')
  await value.waitFor()
  await page.waitForFunction(() => document.querySelector('#edititem-f4')?.readOnly === true)
  await page.getByText('Bare administrator eller den som la inn gjenstanden kan endre den.').waitFor()
  await page.getByLabel('Navn *').fill('Gyngestol i eik')
  await page.getByRole('button', { name: 'Lagre endringer' }).click()
  await page.waitForFunction(() => !location.pathname.endsWith('/edit'))
  assert(sent.length === 1, `forventet én lagring, fikk ${sent.length}`)
  assert(sent[0].title === 'Gyngestol i eik', 'tittelen ble ikke lagret')
  assert(!('estimated_value' in sent[0]), 'verdien ble sendt selv om arvingen ikke kan endre den')
}, asMember)

await check('Rediger, arving: verdien på egen gjenstand kan endres', async page => {
  const sent = patches(page)
  await page.goto(`${BASE}/estate/${EST}/item/${MINE}/edit`)
  const value = page.getByLabel('Estimert verdi i kroner (valgfri)')
  await value.waitFor()
  assert(!(await value.evaluate(el => el.readOnly)), 'verdifeltet er låst på egen gjenstand')
  await value.fill('2500')
  await page.getByRole('button', { name: 'Lagre endringer' }).click()
  await page.waitForFunction(() => !location.pathname.endsWith('/edit'))
  assert(sent[0]?.estimated_value === 2500, `forventet verdi 2500, fikk ${sent[0]?.estimated_value}`)
}, asMember)

await check('Rediger, administrator: verdien på andres gjenstand kan endres', async page => {
  await page.goto(`${BASE}/estate/${EST}/item/${OTHERS}/edit`)
  await page.getByText('Bare administrator eller den som la inn gjenstanden kan endre den.').waitFor({ state: 'detached', timeout: 5000 })
  await page.waitForFunction(() => document.querySelector('#edititem-f4')?.readOnly === false)
}, { fixtures: { ...asAdmin.fixtures } })

await check('Slett, arving: egen gjenstand kan slettes før tildeling, ikke etter', async page => {
  await page.goto(`${BASE}/estate/${EST}/item/${MINE}`)
  await page.getByRole('button', { name: 'Slett gjenstand…' }).waitFor()
  await page.goto(`${BASE}/estate/${EST}/item/${MINE_ASSIGNED}`)
  await page.getByRole('heading', { name: 'Klokke' }).first().waitFor()
  await page.waitForTimeout(500)
  assert(await page.getByRole('button', { name: 'Slett gjenstand…' }).count() === 0, 'kan slette egen gjenstand etter tildeling')
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('button', { name: 'Slett «Lampe»' }).waitFor()
  assert(await page.getByRole('button', { name: 'Slett «Klokke»' }).count() === 0, 'kortet viser «Slett» på tildelt gjenstand')
  assert(await page.getByRole('button', { name: 'Slett «Gyngestol»' }).count() === 0, 'kortet viser «Slett» på andres gjenstand')
}, asMember)

// U1: AI-ens identifikasjon kan rettes av administrator og den som la inn gjenstanden (guard_item_update håndhever det)
const AI = { v: 2, meta: {}, review: {}, corrections: {}, valuation: null, ai: {
  suggestion: { title: 'Lampe', description: '', category: null, category_key: 'other', confidence: 'medium' },
  identification: { brand: { value: 'Luxo', basis: 'probable', evidence: 'Formen' }, model: null }, unknown: [], marks: [], size_class: 'small',
  condition_suggestion: 'good', condition_observations: [], condition_not_visible: [], condition_confidence: 'medium',
  multiple_items: { detected: false, count: null, note: null }, photo_suggestions: [], search_query: null } }
const withAi = f => ({ fixtures: { ...f.fixtures, items: f.fixtures.items.map(i => ({ ...i, ai_analysis: AI })) } })
const openAi = async (page, itemId) => {
  await page.goto(`${BASE}/estate/${EST}/item/${itemId}`)
  await page.getByText('Hva AI-en så').click()
  await page.getByText('Luxo').first().waitFor()
}

await check('Rett AI-opplysninger, arving: ikke på andres gjenstand', async page => {
  await openAi(page, OTHERS)
  assert(await page.getByRole('button', { name: 'Rett opplysningene' }).count() === 0, '«Rett opplysningene» vises på andres gjenstand')
}, withAi(asMember))

await check('Rett AI-opplysninger, arving: egen gjenstand lagrer rettelsen i ai_analysis.corrections uten å endre AI-forslaget', async page => {
  const sent = patches(page)
  await openAi(page, MINE)
  await page.getByRole('button', { name: 'Rett opplysningene' }).click()
  const brand = page.getByLabel('Merke', { exact: true })
  assert(await brand.inputValue() === 'Luxo', 'merket starter ikke med AI-forslaget')
  await brand.fill('Le Klint')
  await page.getByLabel('Modell', { exact: true }).fill('Model 101')
  await page.getByRole('button', { name: 'Lagre rettelsene' }).click()
  await page.getByText('Rettelsene er lagret').waitFor()
  assert(sent.length === 1, `forventet én lagring, fikk ${sent.length}`)
  const a = sent[0].ai_analysis
  assert(Object.keys(sent[0]).join() === 'ai_analysis', `sendte andre felt: ${Object.keys(sent[0])}`)
  assert(a.corrections.brand.value === 'Le Klint' && a.corrections.brand.by === UID && a.corrections.brand.at, 'merket ble ikke lagret med hvem og når')
  assert(a.corrections.model.value === 'Model 101', 'modellen ble ikke lagret')
  assert(!('period' in a.corrections), 'uendrede felt ble lagret')
  assert(a.ai.identification.brand.value === 'Luxo', 'AI-forslaget ble endret')
}, withAi(asMember))

await check('Rett AI-opplysninger, administrator: også på andres gjenstand', async page => {
  await openAi(page, OTHERS)
  await page.getByRole('button', { name: 'Rett opplysningene' }).waitFor()
}, withAi(asAdmin))

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
