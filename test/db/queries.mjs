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

test('tildeling bare når ledig, og antall rader kommer tilbake (ConflictPage.apply)', async () => {
  const db = as('mona')
  const item = 'face0005-0000-0000-0000-000000000005'
  const first = await db.from('items').update({ assigned_to: USERS.mona[0], status: 'assigned' }).eq('id', item).neq('status', 'assigned').select('id')
  assert.equal(first.error, null); assert.equal(first.data.length, 1)
  const second = await db.from('items').update({ assigned_to: USERS.owner[0], status: 'assigned' }).eq('id', item).neq('status', 'assigned').select('id')
  assert.equal(second.error, null); assert.equal(second.data.length, 0)
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

test('stemme med optimistisk låsing (ItemDetailPage.handleEstimateVote)', async () => {
  const db = as('owner')
  const item = 'face0003-0000-0000-0000-000000000003'
  const vote = (before) => {
    let q = db.from('items').update({ value_agree_count: (before ?? 0) + 1 }).eq('id', item)
    q = before == null ? q.is('value_agree_count', null) : q.eq('value_agree_count', before)
    return q.select('id')
  }
  const { data: before } = await db.from('items').select('value_agree_count').eq('id', item).single()
  const start = before.value_agree_count
  assert.equal((await vote(start)).data.length, 1)
  assert.equal((await vote(start)).data.length, 0) // utdatert lesing → ingen overskriving
  assert.equal((await vote((start ?? 0) + 1)).data.length, 1)
})
