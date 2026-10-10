// Akseptansetester for fordelingsfasen (F1–F6) i Chromium med simulert Supabase. Databasen håndhever
// reglene (test/db/rls.sql); her sjekkes at appen bruker de sikre databasefunksjonene og viser det riktige.
// Kjøres av test/e2e/run.sh.
import { BASE, EST, UID, ITEM, FIXTURES, now, category, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const U2 = '11111111-0000-0000-0000-000000000002'
const kari = { user_id: U2, display_name: 'Kari', avatar_color: '#A97C3F', email: 'kari@test.no' }
const me = FIXTURES.profiles[0]
const bothWant = [{ user_id: UID }, { user_id: U2 }]
const members = [
  { estate_id: EST, user_id: UID, role: 'admin', joined_at: now, estates: FIXTURES.estates[0], profiles: me },
  { estate_id: EST, user_id: U2, role: 'member', joined_at: now, profiles: kari },
]
const item = (id, title, extra = {}) => ({ id, estate_id: EST, title, status: 'active', estimated_value: '1500', added_by: UID, added_by_name: 'Test',
  created_at: now, category_id: 'c1', categories: category, interests: bothWant, comments: [], image_url: null, extra_images: [], ...extra })
const contested = {
  estate_members: members, profiles: [me, kari], heirs: [],
  items: [item(ITEM, 'Gyngestol'), item('it-2', 'Maleri')],
  interests: [ITEM, 'it-2'].flatMap(item_id => [UID, U2].map(user_id => ({ id: `${item_id}-${user_id}`, item_id, user_id, created_at: now }))),
}
// Fanger kall til databasefunksjoner og direkte oppdateringer av gjenstander
const watch = page => {
  const rpc = [], patches = []
  page.on('request', r => {
    const u = r.url()
    if (u.includes('/rest/v1/rpc/')) rpc.push({ name: u.split('/rpc/')[1].split('?')[0], body: JSON.parse(r.postData() || '{}') })
    if (r.method() === 'PATCH' && u.includes('/rest/v1/items')) patches.push(JSON.parse(r.postData() || '{}'))
  })
  return { rpc, patches }
}

// ── F1: tildeling og loddtrekning via databasen, med historikk ─────────────────
await check('F1 Loddtrekning: databasen trekker (draw_lot), og «Bekreft og tildel» sender trekningen til assign_items', async page => {
  const { rpc, patches } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/conflicts`)
  await page.getByRole('button', { name: 'Trekk vinner' }).first().click()
  await page.getByText('Vinner').first().waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: /Bekreft og tildel \(1\)/ }).click()
  await page.waitForURL(`**/estate/${EST}`)
  const draw = rpc.find(c => c.name === 'draw_lot'), assign = rpc.find(c => c.name === 'assign_items')
  assert(draw?.body.p_item === ITEM, 'loddet ble ikke trukket av databasen')
  assert(assign?.body.p_method === 'lottery' && assign.body.p_assignments[0].user_id === U2 && assign.body.p_estate === EST, `feil tildeling: ${JSON.stringify(assign?.body)}`)
  assert(!patches.some(b => 'assigned_to' in b || 'status' in b), 'tildelingen ble skrevet direkte på gjenstanden')
}, { fixtures: contested, rpc: { draw_lot: { body: { winner: U2, candidates: [UID, U2], draw_no: 1 } }, assign_items: { body: { assigned: 1, skipped: [] } } } })

await check('F1 Tildeling fra gjenstandssiden går via assign_items (manuelt), angring via unassign_item', async page => {
  const { rpc, patches } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByRole('button', { name: /^Tildel/ }).first().click()
  await page.getByRole('button', { name: /Kari/ }).first().click()
  await page.getByText('Gjenstand tildelt').waitFor()
  const assign = rpc.find(c => c.name === 'assign_items')
  assert(assign?.body.p_method === 'manual' && assign.body.p_assignments[0].item_id === ITEM && assign.body.p_assignments[0].user_id === U2, `feil kall: ${JSON.stringify(assign?.body)}`)
  assert(!patches.some(b => 'assigned_to' in b), 'tildelingen ble skrevet direkte')
}, { fixtures: contested, rpc: { assign_items: { body: { assigned: 1, skipped: [] } } } })

await check('F1 Historikk på gjenstandssiden viser loggen med navn og metode', async page => {
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByText(/^Historikk · 3$/).click()
  await page.getByText('Test tildelte gjenstanden til Kari (etter loddtrekning)').waitFor()
  await page.getByText('Loddtrekning nr. 1 blant Test, Kari: Kari ble trukket').waitFor()
  await page.getByText('Kari ønsker denne').waitFor()
}, { fixtures: { ...contested, estate_events: [
  { id: 3, estate_id: EST, item_id: ITEM, actor: UID, kind: 'assigned', data: { to: U2, method: 'lottery' }, created_at: now },
  { id: 2, estate_id: EST, item_id: ITEM, actor: UID, kind: 'lottery_draw', data: { candidates: [UID, U2], winner: U2, draw_no: 1 }, created_at: now },
  { id: 1, estate_id: EST, item_id: ITEM, actor: U2, kind: 'wish_added', data: { user_id: U2 }, created_at: now },
] } })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
