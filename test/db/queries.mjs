// Kjører appens spørringer mot PostgREST + testdatabasen med samme klient som supabase-js bruker.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters'
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = claims => {
  const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`
}
const USERS = {
  mona: ['00000000-0000-0000-0000-00000000000d', 'mona.demo@heirsplit.no'],
  owner: ['00000000-0000-0000-0000-00000000000a', 'owner@test.no'],
  eva: ['00000000-0000-0000-0000-0000000000e1', 'eva@test.no'],
  outsider: ['00000000-0000-0000-0000-0000000000a9', 'outsider@test.no'],
}
const as = name => new PostgrestClient('http://localhost:54330', {
  headers: { Authorization: `Bearer ${jwt({ sub: USERS[name][0], email: USERS[name][1], role: 'authenticated' })}` },
})
const DEMO = 'deed0001-0000-0000-0000-000000000001'

// Samme som fetchAll i src/lib/supabase.js
async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

test('interesser per bo med inner join og sideinndeling (getEstateInterests)', async () => {
  const db = as('mona')
  const build = () => db.from('interests').select('id, item_id, user_id, reason, created_at, items!inner(estate_id)').eq('items.estate_id', DEMO).order('id')
  const all = await fetchAll(build)
  assert.equal(all.error, null)
  const paged = await fetchAll(build, 5)
  assert.equal(paged.data.length, all.data.length)
  assert.deepEqual(new Set(paged.data.map(r => r.id)).size, all.data.length)
  assert.ok(all.data.length >= 17)
})

test('begrunnelse på eget ønske via PostgREST (setInterestReason), ikke på andres', async () => {
  const db = as('mona')
  const mine = await db.from('interests').select('item_id, reason').eq('user_id', USERS.mona[0]).limit(1).single()
  assert.equal(mine.error, null)
  const upd = await db.from('interests').update({ reason: 'Til hytta' }).eq('item_id', mine.data.item_id).eq('user_id', USERS.mona[0]).select('id')
  assert.equal(upd.error, null)
  assert.equal(upd.data.length, 1)
  const others = await db.from('interests').update({ reason: 'Hacket' }).neq('user_id', USERS.mona[0]).select('id')
  assert.equal(others.error, null)
  assert.equal(others.data.length, 0)
  await db.from('interests').update({ reason: mine.data.reason }).eq('item_id', mine.data.item_id).eq('user_id', USERS.mona[0])
})

test('nei takk per bo (getEstatePasses)', async () => {
  const { data, error } = await fetchAll(() => as('owner').from('item_passes').select('item_id, user_id, items!inner(estate_id)').eq('items.estate_id', DEMO).order('id'), 7)
  assert.equal(error, null)
  assert.ok(data.length > 0)
})

test('gjenstander med kategorier (getItems) og utenforstående ser ingenting', async () => {
  const { data, error } = await as('mona').from('items').select('*, categories(label, emoji)').eq('estate_id', DEMO).order('created_at', { ascending: false }).order('id').range(0, 999)
  assert.equal(error, null)
  assert.equal(data.length, 12)
  const outside = await as('outsider').from('items').select('id').eq('estate_id', DEMO)
  assert.deepEqual(outside.data, [])
})

test('tildeling via assign_items: bare ledige gjenstander, direkte oppdatering avvises (ConflictPage.apply)', async () => {
  const db = as('mona')
  const item = 'face0005-0000-0000-0000-000000000005'
  const direct = await db.from('items').update({ assigned_to: USERS.mona[0], status: 'assigned' }).eq('id', item).select('id')
  assert.equal(direct.error?.code, '42501')
  const first = await db.rpc('assign_items', { p_estate: DEMO, p_assignments: [{ item_id: item, user_id: USERS.mona[0] }], p_method: 'manual' })
  assert.equal(first.error, null); assert.equal(first.data.assigned, 1)
  const second = await db.rpc('assign_items', { p_estate: DEMO, p_assignments: [{ item_id: item, user_id: USERS.owner[0] }], p_method: 'manual' })
  assert.equal(second.error, null); assert.equal(second.data.assigned, 0); assert.deepEqual(second.data.skipped, [item])
  const events = await db.from('estate_events').select('kind, data').eq('item_id', item)
  assert.ok(events.data.some(e => e.kind === 'assigned' && e.data.method === 'manual'))
  const undo = await db.rpc('unassign_item', { p_item: item })
  assert.equal(undo.data.ok, true)
})

test('loddtrekning via draw_lot gir en av dem som ønsker gjenstanden', async () => {
  const db = as('mona')
  const item = 'face0004-0000-0000-0000-000000000004'
  const { data, error } = await db.rpc('draw_lot', { p_item: item })
  assert.equal(error, null)
  const wanters = await db.from('interests').select('user_id').eq('item_id', item)
  assert.ok(wanters.data.map(w => w.user_id).includes(data.winner))
})

test('sletting gir tom liste når man ikke har lov (EstatePage.confirmDelete)', async () => {
  const { data, error } = await as('mona').from('items').delete().eq('id', 'face0001-0000-0000-0000-000000000001').select('id')
  assert.equal(error, null)
  assert.deepEqual(data, [])
})

test('RPC-feil for ikke-admin (remove_estate_member)', async () => {
  const { error } = await as('outsider').rpc('remove_estate_member', { p_estate_id: DEMO, p_user_id: USERS.mona[0] })
  assert.equal(error.code, '42501')
})

test('nytt bo kan leses tilbake før medlemskapet finnes (createEstate)', async () => {
  const db = as('outsider')
  const { data, error } = await db.from('estates').insert({ name: 'Nytt', owner_id: USERS.outsider[0], invite_code: 'NEW001' }).select().single()
  assert.equal(error, null)
  const member = await db.from('estate_members').insert({ estate_id: data.id, user_id: USERS.outsider[0], role: 'admin' })
  assert.equal(member.error, null)
  const cats = await db.from('categories').insert([{ label: 'Møbler', emoji: '', estate_id: data.id }]).select()
  assert.equal(cats.error, null)
})

test('profil-upsert kan ikke sette founder (upsertProfile)', async () => {
  const { data, error } = await as('outsider').from('profiles').upsert({ user_id: USERS.outsider[0], display_name: 'Ute', is_founder: true, plan: 'enterprise' }, { onConflict: 'user_id' }).select().single()
  assert.equal(error, null)
  assert.equal(data.is_founder, false)
  assert.equal(data.plan, 'free')
  assert.equal(data.email, 'outsider@test.no')
})

// F0 (20261016): kolonnerettigheter på items. Vanlige endringer virker som før; stemmer går via RPC.
test('admin kan fortsatt rette tittel og verdi via PostgREST (kolonnerettigheter)', async () => {
  const db = as('owner')
  const item = 'face0003-0000-0000-0000-000000000003'
  const before = await db.from('items').select('title, estimated_value').eq('id', item).single()
  const upd = await db.from('items').update({ title: 'Mahognibokhylle', estimated_value: '5000' }).eq('id', item).select('id')
  assert.equal(upd.error, null)
  assert.equal(upd.data.length, 1)
  await db.from('items').update({ title: before.data.title, estimated_value: before.data.estimated_value }).eq('id', item)
})

test('stemmetelleren kan ikke skrives direkte, men stemmen lagres via vote_item_value', async () => {
  const db = as('owner')
  const item = 'face0004-0000-0000-0000-000000000004'
  const direct = await db.from('items').update({ value_agree_count: 50 }).eq('id', item).select('id')
  assert.equal(direct.error?.code, '42501')
  const vote = await db.rpc('vote_item_value', { p_item: item, p_vote: 'agree', p_value: null })
  assert.equal(vote.error, null)
  assert.equal(vote.data.ok, true)
  const again = await db.rpc('vote_item_value', { p_item: item, p_vote: 'agree', p_value: null })
  assert.equal(again.data.reason, 'already_voted')
})

// F3 (20261018): fordelingsverdi bare via set_agreed_values; AI-anslaget er urørt
test('fordelingsverdi via set_agreed_values; direkte skriving avvises og AI-anslaget endres ikke', async () => {
  const db = as('owner')
  const item = 'face0003-0000-0000-0000-000000000003'
  const before = await db.from('items').select('estimated_value, agreed_value').eq('id', item).single()
  const direct = await db.from('items').update({ agreed_value: 1 }).eq('id', item).select('id')
  assert.equal(direct.error?.code, '42501')
  const set = await db.rpc('set_agreed_values', { p_estate: DEMO, p_values: [{ item_id: item, value: 4200, source: 'manual' }] })
  assert.equal(set.error, null)
  const after = await db.from('items').select('estimated_value, agreed_value, agreed_value_source').eq('id', item).single()
  assert.equal(Number(after.data.agreed_value), 4200)
  assert.equal(after.data.estimated_value, before.data.estimated_value)
  await db.rpc('set_agreed_values', { p_estate: DEMO, p_values: [{ item_id: item, value: before.data.agreed_value === null ? null : Number(before.data.agreed_value), source: 'ai' }] })
})

// F6 (20261020): forslag og svar via RPC; svar kan ikke skrives direkte
test('forslag og svar via RPC (propose_distribution, respond_distribution, distribution_status)', async () => {
  const db = as('mona')
  const p = await db.rpc('propose_distribution', { p_estate: DEMO })
  assert.equal(p.error, null)
  const heir = await db.from('heirs').select('id').eq('estate_id', DEMO).eq('user_id', USERS.mona[0]).single()
  const direct = await db.from('distribution_responses').insert({ version_id: p.data.id, heir_id: heir.data.id, heir_name: 'x', decision: 'approve' })
  assert.equal(direct.error?.code, '42501')
  const r = await db.rpc('respond_distribution', { p_version: p.data.id, p_heir: heir.data.id, p_decision: 'approve', p_reason: null, p_item: null })
  assert.equal(r.error, null)
  assert.equal(r.data.approved, 1)
  assert.notEqual(r.data.state, 'approved', 'demoen legger ikke inn svar for de andre')
  const st = await db.rpc('distribution_status', { p_version: p.data.id })
  assert.equal(st.data.heirs.find(h => h.heir_id === heir.data.id).responder_email, 'mona.demo@heirsplit.no')
})
