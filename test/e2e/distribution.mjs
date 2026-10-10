// Akseptansetester for fordelingsfasen (F1–F6) i Chromium med simulert Supabase. Databasen håndhever
// reglene (test/db/rls.sql); her sjekkes at appen bruker de sikre databasefunksjonene og viser det riktige.
// Kjøres av test/e2e/run.sh.
import { createRequire } from 'node:module'
import { BASE, EST, UID, ITEM, FIXTURES, now, category, launch, checker, assert } from './fixtures.mjs'
const AXE = createRequire(import.meta.url).resolve('axe-core/axe.min.js')
const axe = async page => {
  await page.addScriptTag({ path: AXE })
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`)
  })
}

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

// ── F2: «Snakk sammen først» og «Trekk ønsket mitt» ───────────────────────────
const asMember = fx => ({ ...fx, estate_members: [{ ...members[0], role: 'member' }, { ...members[1], role: 'admin' }] })
const withReasons = {
  ...contested,
  interests: contested.interests.map(x => ({ ...x, reason: x.user_id === UID ? 'Husker den fra hytta' : 'Mamma satt alltid i den' })),
}
const requests = page => {
  const seen = []
  page.on('request', r => { if (r.url().includes('/rest/v1/interests')) seen.push({ method: r.method(), url: r.url(), body: r.postData() }) })
  return seen
}

await check('F2 Gjenstandssiden: «Flere ønsker denne» med begrunnelser, «Trekk ønsket mitt» og angre', async page => {
  const seen = requests(page)
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByText(/^Flere ønsker denne \(2\)$/).waitFor()
  await page.getByText(/Snakk sammen først: se hvorfor hver enkelt ønsker den/).waitFor()
  await page.getByText('"Mamma satt alltid i den"').waitFor()
  await page.getByRole('button', { name: 'Trekk ønsket mitt' }).click()
  await page.getByText('Du har trukket ønsket ditt, så de andre kan få den.').waitFor()
  assert(seen.some(r => r.method === 'DELETE' && r.url.includes(`item_id=eq.${ITEM}`) && r.url.includes(`user_id=eq.${UID}`)), 'eget ønske ble ikke slettet')
  await page.getByRole('button', { name: 'Angre', exact: true }).click()
  await page.getByText('Ønsket ditt er lagt inn igjen').waitFor()
  const re = seen.find(r => r.method === 'POST')
  assert(re && JSON.parse(re.body).reason === 'Husker den fra hytta', `angringen la ikke inn begrunnelsen igjen: ${re?.body}`)
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: asMember(withReasons) })

await check('F2 Løsningsmetoder for arving: begrunnelsene side om side, bare eget ønske kan trekkes', async page => {
  const seen = requests(page)
  await page.goto(`${BASE}/estate/${EST}/conflicts`)
  await page.getByRole('heading', { name: 'Snakk sammen først' }).waitFor()
  await page.getByText('«Mamma satt alltid i den»').first().waitFor()
  assert(await page.getByRole('button', { name: 'Trekk ønsket mitt' }).count() === 2, 'forventet én knapp per gjenstand jeg ønsker')
  await page.getByRole('button', { name: 'Trekk ønsket mitt' }).first().click()
  await page.getByText('Du har trukket ønsket ditt').waitFor()
  assert(seen.filter(r => r.method === 'DELETE').every(r => r.url.includes(`user_id=eq.${UID}`)), 'et annet ønske enn mitt ble forsøkt slettet')
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: asMember(withReasons) })

await check('F2 «Dine valg» viser hvor mange av mine ønsker andre også har', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  await page.getByRole('button', { name: '2 ønskes også av andre – snakk sammen' }).click()
  await page.waitForFunction(() => document.activeElement?.dataset?.tab === 'contested', null, { timeout: 5000 })
}, { fixtures: asMember(withReasons) })

// ── F3: fordelingsverdi adskilt fra AI-anslaget, og bekreftede arveandeler ─────
await check('F3 Gjenstandssiden: fordelingsverdi adskilt fra anslaget; «Bruk AI-anslaget» går til set_agreed_values', async page => {
  const { rpc, patches } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByRole('heading', { name: 'Fordelingsverdi (foreslått)' }).waitFor()
  await page.getByText(/Ingen fordelingsverdi ennå/).waitFor()
  await page.getByText('Verdiestimat (veiledende)').waitFor()
  await page.getByRole('button', { name: /^Bruk AI-anslaget/ }).click()
  await page.getByText('Fordelingsverdien er lagret').waitFor()
  const c = rpc.find(x => x.name === 'set_agreed_values')
  assert(c?.body.p_estate === EST && c.body.p_values[0].value === 1500 && c.body.p_values[0].source === 'ai', `feil kall: ${JSON.stringify(c?.body)}`)
  assert(!patches.some(b => 'agreed_value' in b), 'fordelingsverdien ble skrevet direkte')
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: contested, rpc: { set_agreed_values: { body: { updated: 1 } } } })

await check('F3 Arving ser fordelingsverdien, men kan ikke sette den', async page => {
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByRole('heading', { name: 'Fordelingsverdi (foreslått)' }).waitFor()
  assert(await page.getByRole('button', { name: /Bruk AI-anslaget|Sett fordelingsverdi|^Endre$/ }).count() === 0, 'arving fikk knapper for å sette verdien')
}, { fixtures: asMember({ ...contested, items: contested.items.map(i => (i.id === ITEM ? { ...i, agreed_value: 1200, agreed_value_source: 'manual' } : i)) }) })

await check('F3 Jevn fordeling: «Bruk AI-anslaget som fordelingsverdi» for gjenstandene som mangler', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/conflicts`)
  await page.getByRole('button', { name: /Jevn verdifordeling|Lik verdi/ }).first().click()
  await page.getByRole('button', { name: 'Bruk AI-anslaget som fordelingsverdi (2)' }).click()
  await page.getByText('AI-anslagene er brukt som foreslått fordelingsverdi').waitFor()
  const c = rpc.find(x => x.name === 'set_agreed_values')
  assert(c?.body.p_values.length === 2 && c.body.p_values.every(v => v.source === 'ai' && v.value === 1500), `feil kall: ${JSON.stringify(c?.body)}`)
  await page.getByText(/beslutningsstøtte, ikke en fasit/).waitFor()
}, { fixtures: contested, rpc: { set_agreed_values: { body: { updated: 2 } } } })

await check('F3 Arvinger: administrator bekrefter at andelene gjelder innbo og løsøre (confirm_shares)', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('button', { name: 'Bekreft at andelene gjelder innbo og løsøre' }).click()
  await page.getByText('Andelene brukes når innbo og løsøre fordeles').waitFor()
  const c = rpc.find(x => x.name === 'confirm_shares')
  assert(c?.body.p_estate === EST && c.body.p_confirmed === true, `feil kall: ${JSON.stringify(c?.body)}`)
}, { fixtures: { ...contested, estates: [{ ...FIXTURES.estates[0], split_mode: 'custom', shares_confirmed: false }],
  heirs: [{ id: 'h1', estate_id: EST, name: 'Test', email: 'test@test.no', relationship: 'Barn', percentage: 60, user_id: UID, created_at: now },
    { id: 'h2', estate_id: EST, name: 'Kari', email: 'kari@test.no', relationship: 'Barn', percentage: 40, user_id: U2, created_at: now }] },
  rpc: { confirm_shares: { body: { ok: true } } } })

// ── F4: gjenstander ingen vil ha ────────────────────────────────────────────────
const unwanted = {
  ...contested, interests: [],
  items: [item('u-1', 'Symaskin', { interests: [], marked_for_disposal: true }), item('u-2', 'Kristallglass', { interests: [] }), item('u-3', 'Lampe', { interests: [], disposition: 'sell' })],
}
await check('F4 Ingen vil ha: administrator velger per gjenstand og for alle; gammelt kastemerke er uavklart', async page => {
  const { rpc, patches } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/ingen-vil-ha`)
  await page.getByRole('heading', { name: 'Ingen vil ha' }).waitFor()
  await page.getByText('Tidligere merket for kast. Det er ikke et vedtak; velg sammen.').waitFor()
  await page.getByText('Selges (foreløpig)').waitFor()
  await page.getByRole('group', { name: 'Hva skal skje med Symaskin?' }).getByRole('button', { name: 'Gi bort' }).click()
  await page.getByText('Valget er registrert', { exact: true }).waitFor()
  const one = rpc.find(c => c.name === 'set_dispositions')
  assert(one?.body.p_values.length === 1 && one.body.p_values[0].item_id === 'u-1' && one.body.p_values[0].disposition === 'donate', `feil kall: ${JSON.stringify(one?.body)}`)
  await page.getByRole('group', { name: /Samme valg for alle/ }).getByRole('button', { name: 'Selg' }).click()
  await page.getByText('Valget er registrert for alle').waitFor()
  const all = rpc.filter(c => c.name === 'set_dispositions')[1]
  assert(all?.body.p_values.map(v => v.item_id).join() === 'u-1,u-2' && all.body.p_values.every(v => v.disposition === 'sell'), `feil bulk: ${JSON.stringify(all?.body)}`)
  assert(!patches.some(b => 'disposition' in b || 'marked_for_disposal' in b), 'disponeringen ble skrevet direkte')
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: unwanted, rpc: { set_dispositions: { body: { updated: 1 } } } })

await check('F4 Arving ser valgene, men kan ikke endre dem', async page => {
  await page.goto(`${BASE}/estate/${EST}/ingen-vil-ha`)
  await page.getByText('Selges (foreløpig)').waitFor()
  await page.getByText(/Administratoren registrerer valgene/).waitFor()
  assert(await page.getByRole('button', { name: /^(Selg|Gi bort|Kast)$/ }).count() === 0, 'arving fikk valgknapper')
}, { fixtures: asMember(unwanted) })

// ── F5: oversikten over fordelingen og utkast som PDF ──────────────────────────
const overview = {
  ...contested, interests: contested.interests.filter(x => x.item_id === 'it-2'),
  items: [
    item(ITEM, 'Gyngestol', { status: 'assigned', assigned_to: UID, agreed_value: 3000, interests: [] }),
    item('it-3', 'Klokke', { status: 'assigned', assigned_to: U2, agreed_value: 1000, interests: [] }),
    item('it-2', 'Maleri', { interests: bothWant }),
    item('u-2', 'Kristallglass', { interests: [], disposition: 'donate' }),
  ],
}
await check('F5 Fordelingen: per arving med sum og avvik fra lik andel, det som ikke er avklart, og utkast som PDF', async page => {
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByRole('heading', { name: 'Fordelingen', exact: true }).waitFor()
  await page.getByText('1 gjenstand er ikke avklart ennå').waitFor()
  await page.getByRole('region', { name: 'Kari' }).getByText(/ca\. .*1.?000.* mindre enn en lik andel/).waitFor()
  await page.getByRole('region', { name: 'Test' }).getByText(/mer enn en lik andel/).waitFor()
  await page.getByText('Gis bort: 1').waitFor()
  await page.getByText('Maleri – ønskes av 2').waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Last ned utkast (PDF)' }).click()])
  assert(/^fordeling-utkast-\d{4}-\d{2}-\d{2}\.pdf$/.test(download.suggestedFilename()), `filnavn: ${download.suggestedFilename()}`)
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: overview })

await check('F5 Avslutt boet: påminnelse om å se fordelingen og laste ned protokollen', async page => {
  await page.goto(`${BASE}/estate/${EST}/admin`)
  await page.getByRole('button', { name: 'Avslutt boet…' }).click()
  await page.getByText(/Før dere avslutter: se over fordelingen og last ned protokollen/).waitFor()
  await page.getByRole('button', { name: 'Se fordelingen' }).click()
  await page.waitForURL(`**/estate/${EST}/fordeling`)
}, { fixtures: overview })

// ── F6: forslag og godkjenning ──────────────────────────────────────────────────
const H1 = 'heir-me', H2 = 'heir-kari'
const heirsF6 = [
  { id: H1, estate_id: EST, name: 'Test', email: 'test@test.no', relationship: 'Barn', percentage: 50, user_id: UID, must_approve: true, created_at: now },
  { id: H2, estate_id: EST, name: 'Kari', email: 'kari@test.no', relationship: 'Barn', percentage: 50, user_id: U2, must_approve: true, created_at: now },
]
const version = { id: 'v-1', estate_id: EST, version_no: 1, created_at: now, approved_at: null, required: [{ heir_id: H1 }, { heir_id: H2 }],
  snapshot: { items: [{ id: ITEM, title: 'Gyngestol', status: 'assigned', assigned_to: UID, agreed_value: 3000 }, { id: 'it-2', title: 'Maleri', status: 'active', wanted_by: 2 }], member_names: { [UID]: 'Test', [U2]: 'Kari' } } }
const st = (state, heirs, extra = {}) => ({ body: { id: 'v-1', version_no: 1, state, outdated: false, approved_at: null, created_at: now, required: 2, approved: heirs.filter(h => h.decision === 'approve').length, objections: 0, heirs, ...extra } })
const hMe = (extra = {}) => ({ heir_id: H1, name: 'Test', user_id: UID, representative: null, decision: null, ...extra })
const hKari = (extra = {}) => ({ heir_id: H2, name: 'Kari', user_id: U2, representative: null, decision: 'approve', at: now, responder: U2, responder_email: 'kari@test.no', via_representative: false, ...extra })
const f6 = (extra = {}) => ({ ...overview, heirs: heirsF6, ...extra })

await check('F6 Admin legger frem forslag (propose_distribution) når ingen forslag finnes', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByRole('heading', { name: 'Godkjenning' }).waitFor()
  await page.getByText(/ikke en juridisk verifisert elektronisk signatur/).waitFor()
  await page.getByRole('button', { name: 'Legg frem forslag' }).click()
  await page.getByText(/Forslaget er lagt frem/).waitFor()
  assert(rpc.some(c => c.name === 'propose_distribution' && c.body.p_estate === EST), 'propose_distribution ble ikke kalt')
}, { fixtures: f6({ distribution_versions: [] }), rpc: { propose_distribution: { body: { id: 'v-1', version_no: 1 } } } })

await check('F6 Beslutningstaker godkjenner for seg selv; delvis fordeling sies tydelig', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByText('Venter på svar').waitFor()
  await page.getByText(/Delvis fordeling: 1 gjenstand er ikke avklart og omfattes ikke av godkjenningen/).waitFor()
  await page.getByText(/Kari.*Godkjent/).first().waitFor()
  await page.getByRole('button', { name: 'Godkjenn fordelingen' }).click()
  await page.getByText('Godkjenningen din er registrert').waitFor()
  const c = rpc.find(x => x.name === 'respond_distribution')
  assert(c?.body.p_version === 'v-1' && c.body.p_heir === H1 && c.body.p_decision === 'approve', `feil svar: ${JSON.stringify(c?.body)}`)
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: f6({ distribution_versions: [version] }), rpc: { distribution_status: st('pending', [hMe(), hKari()]), respond_distribution: st('pending', [hMe({ decision: 'approve' }), hKari()]) } })

await check('F6 «Jeg er ikke enig» krever begrunnelse og kan knyttes til en gjenstand', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByRole('button', { name: 'Jeg er ikke enig' }).click()
  assert(await page.getByRole('button', { name: 'Send innsigelsen' }).isDisabled(), 'kunne sende uten begrunnelse')
  await page.getByLabel('Hva er du ikke enig i?').fill('Maleriet bør vurderes på nytt')
  await page.getByLabel(/Gjelder det en bestemt gjenstand/).selectOption({ label: 'Maleri' })
  await page.getByRole('button', { name: 'Send innsigelsen' }).click()
  await page.getByText('Innsigelsen din er registrert').waitFor()
  const c = rpc.find(x => x.name === 'respond_distribution')
  assert(c?.body.p_decision === 'object' && c.body.p_reason === 'Maleriet bør vurderes på nytt' && c.body.p_item === 'it-2', `feil innsigelse: ${JSON.stringify(c?.body)}`)
}, { fixtures: f6({ distribution_versions: [version] }), rpc: { distribution_status: st('pending', [hMe(), hKari()]), respond_distribution: st('objected', [hMe({ decision: 'object', reason: 'x' }), hKari()]) } })

await check('F6 Godkjent av alle: endelig protokoll fra det godkjente forslaget', async page => {
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByText('Godkjent av alle').waitFor()
  assert(await page.getByRole('button', { name: 'Godkjenn fordelingen' }).count() === 0, 'kunne svare på et godkjent forslag')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Last ned godkjent protokoll (PDF)' }).click()])
  assert(/^fordeling-godkjent-/.test(download.suggestedFilename()), download.suggestedFilename())
}, { fixtures: f6({ distribution_versions: [{ ...version, approved_at: now }] }), rpc: { distribution_status: st('approved', [hMe({ decision: 'approve', at: now }), hKari()], { approved_at: now }) } })

await check('F6 Arving uten konto: kan ikke godkjennes digitalt, protokoll for signering på papir', async page => {
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByText('Kan ikke godkjennes digitalt ennå').first().waitFor()
  await page.getByText(/Har ikke konto i Arvklart og ingen bekreftet representant/).waitFor()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Last ned protokoll for signering på papir (PDF)' }).click()])
  assert(/^fordeling-til-signering-/.test(download.suggestedFilename()), download.suggestedFilename())
}, { fixtures: f6({ distribution_versions: [version] }), rpc: { distribution_status: st('not_digitally_approvable', [hMe(), hKari({ user_id: null, decision: null })]) } })

await check('F6 Utdatert forslag: kan ikke svares på, admin kan legge frem ny versjon', async page => {
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByText(/Fordelingen er endret etter at forslaget ble lagt frem. Alle må godkjenne en ny versjon./).waitFor()
  assert(await page.getByRole('button', { name: 'Godkjenn fordelingen' }).count() === 0, 'kunne svare på et utdatert forslag')
  await page.getByRole('button', { name: 'Legg frem ny versjon' }).waitFor()
}, { fixtures: f6({ distribution_versions: [version] }), rpc: { distribution_status: st('outdated', [hMe(), hKari()], { outdated: true }) } })

await check('F6 Arvinger: admin kan bare be om at en beslutningstaker tas ut, og registrere (ubekreftet) representant', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('heading', { name: 'Hvem godkjenner fordelingen' }).waitFor()
  const kariRow = page.locator('li', { hasText: 'Kari' }).filter({ hasText: 'Skal godkjenne' })
  await kariRow.getByRole('button', { name: 'Be om at arvingen ikke skal godkjenne' }).click()
  await kariRow.getByLabel('Begrunnelse (vises for alle)').fill('Kari har gitt avkall på arv')
  await kariRow.getByRole('button', { name: 'Lagre' }).click()
  await page.getByText(/En annen beslutningstaker må bekrefte/).waitFor()
  const c = rpc.find(x => x.name === 'set_must_approve')
  assert(c?.body.p_heir === H2 && c.body.p_value === false && c.body.p_reason === 'Kari har gitt avkall på arv', `feil kall: ${JSON.stringify(c?.body)}`)
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: f6(), rpc: { set_must_approve: { body: { ok: true, pending: true } } } })

await check('F6 Arvinger: en annen beslutningstaker kan bekrefte en representasjon admin har registrert', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByText(/Ubekreftet – kan ikke svare før en annen beslutningstaker bekrefter/).waitFor()
  await page.getByRole('button', { name: 'Bekreft representasjonen' }).click()
  await page.getByText('Representasjonen er bekreftet').waitFor()
  assert(rpc.some(x => x.name === 'verify_representative' && x.body.p_rep === 'rep-1'), 'verify_representative ble ikke kalt')
}, { fixtures: asMember(f6({ heirs: [...heirsF6, { id: 'heir-gunn', estate_id: EST, name: 'Gunn', email: null, relationship: 'Barn', percentage: 0, user_id: null, must_approve: true, created_at: now }],
  heir_representatives: [{ id: 'rep-1', estate_id: EST, heir_id: 'heir-gunn', user_id: U2, kind: 'fullmakt', basis: 'Skriftlig fullmakt datert 1. oktober', created_by: U2, verified_at: null, revoked_at: null }] })),
  rpc: { verify_representative: { body: { ok: true } } } })

await check('F6 Bekreftet fullmakt vises som registrert og bekreftet av familien, ikke juridisk kontrollert', async page => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByText('Bekreftet av en annen beslutningstaker i Arvklart.').waitFor()
  await page.getByText(/Arvklart har ikke kontrollert fullmakten eller vergemålet juridisk/).waitFor()
  assert(!(await page.getByText(/juridisk (verifisert|godkjent|gyldig)/i).count()), 'fullmakten framstilles som juridisk verifisert')
}, { fixtures: f6({ heirs: [...heirsF6, { id: 'heir-gunn', estate_id: EST, name: 'Gunn', email: null, relationship: 'Barn', percentage: 0, user_id: null, must_approve: true, created_at: now }], heir_representatives: [{ id: 'rep-1', estate_id: EST, heir_id: 'heir-gunn', user_id: UID, kind: 'fullmakt', basis: 'Skriftlig fullmakt datert 1. oktober', created_by: U2, verified_at: now, verified_by: U2, revoked_at: null }] }) })

await check('F6 Representant svarer «som registrert representant»', async page => {
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  await page.getByText('Svar for Gunn (som registrert representant)').waitFor()
  assert(!(await page.getByText(/bekreftet representant\)/).count()), 'gammel tekst «som bekreftet representant» vises')
}, { fixtures: f6({ distribution_versions: [version], heirs: [...heirsF6, { id: 'heir-gunn', estate_id: EST, name: 'Gunn', email: null, relationship: 'Barn', percentage: 0, user_id: null, must_approve: true, created_at: now }], heir_representatives: [{ id: 'rep-1', estate_id: EST, heir_id: 'heir-gunn', user_id: UID, kind: 'fullmakt', basis: 'Skriftlig fullmakt datert 1. oktober', created_by: U2, verified_at: now, verified_by: U2, revoked_at: null }] }),
  rpc: { distribution_status: st('pending', [hMe(), hKari(), { heir_id: 'heir-gunn', name: 'Gunn', user_id: null, representative: { id: 'rep-1', user_id: UID, kind: 'fullmakt' }, decision: null }]) } })
await check('F6 Arvinger: administrator som selv er arving kobler kontoen sin («Dette er meg») via join_estate', async page => {
  const { rpc } = watch(page)
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByText(/E-posten din står på denne arvingen/).waitFor()
  await page.getByRole('button', { name: 'Dette er meg – koble kontoen min' }).click()
  await page.getByText('Kontoen din er koblet til arvingen').waitFor()
  assert(rpc.some(x => x.name === 'join_estate' && x.body.p_code === 'ABC123'), 'join_estate ble ikke kalt med boets kode')
  const v = await axe(page)
  assert(!v.length, v.join('; '))
}, { fixtures: f6({ heirs: [{ ...heirsF6[0], user_id: null }, heirsF6[1]] }), rpc: { join_estate: { body: [{ estate_id: EST, estate_name: 'Testbo' }] } } })

await check('F6 Arvinger: e-post på flere arvinger kan ikke kobles, og det forklares', async page => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByText(/E-posten din står på flere arvinger/).first().waitFor()
  assert(!(await page.getByRole('button', { name: 'Dette er meg – koble kontoen min' }).count()), 'knappen vises selv om e-posten er tvetydig')
}, { fixtures: f6({ heirs: [{ ...heirsF6[0], user_id: null }, heirsF6[1], { ...heirsF6[0], id: 'h-dup', name: 'Test 2', user_id: null }] }) })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
