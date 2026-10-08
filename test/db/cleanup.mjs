// Automatisk sletting av avsluttede bo mot ekte Postgres + PostgREST (som service_role, slik edge-funksjonen
// kjører): spørringene i supabase/functions/_shared/closedEstates.ts, on delete cascade og kjøreloggen.
// Storage simuleres. Kjøres av test/db/run.sh. Krever Node 22.18+ (TypeScript).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PostgrestClient } from '@supabase/postgrest-js'
import { fakeSupabase, manyFiles } from '../functions/fakeSupabase.js'

const TS = !!process.features?.typescript
const { handleCleanupClosedEstates } = TS ? await import('../../supabase/functions/_shared/closedEstates.ts') : {}

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters'
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = claims => {
  const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`
}
const db = new PostgrestClient('http://localhost:54330', { headers: { Authorization: `Bearer ${jwt({ role: 'service_role' })}` } })
const CRON = 'c'.repeat(40)
const OWNER = '00000000-0000-0000-0000-00000000000a'
const OLD = '55555555-0000-0000-0000-000000000001'
const RECENT = '55555555-0000-0000-0000-000000000002'
const month = n => new Date(Date.now() - n * 30.5 * 24 * 3600 * 1000).toISOString()
const must = async q => { const r = await q; assert.equal(r.error, null, r.error?.message); return r.data }

test('sletter bo avsluttet for over 12 måneder med alt innhold, og logger kjøringen', { skip: !TS && 'Node uten TypeScript-støtte' }, async () => {
  await must(db.from('estates').insert([
    { id: OLD, name: 'Gammelt bo', owner_id: OWNER, invite_code: 'CLN001', status: 'closed' },
    { id: RECENT, name: 'Nylig avsluttet', owner_id: OWNER, invite_code: 'CLN002', status: 'closed' },
  ]))
  // closed_at settes etter status (som i prod, der en trigger setter closed_at når status endres)
  await must(db.from('estates').update({ closed_at: month(13) }).eq('id', OLD))
  await must(db.from('estates').update({ closed_at: month(11) }).eq('id', RECENT))
  await must(db.from('estate_members').insert({ estate_id: OLD, user_id: OWNER, role: 'admin' }))
  const [item] = await must(db.from('items').insert({ estate_id: OLD, title: 'Stol', added_by: OWNER }).select('id'))
  await must(db.from('interests').insert({ item_id: item.id, user_id: OWNER }))
  await must(db.from('comments').insert({ item_id: item.id, user_id: OWNER, content: 'hei' }))
  await must(db.from('documents').insert({ estate_id: OLD, name: 't.pdf', file_url: 'x', file_path: `documents/${OLD}/t.pdf` }))
  await must(db.from('heirs').insert({ estate_id: OLD, name: 'Arving', email: 'arving@test.no' }))
  await must(db.from('feedback').insert([{ user_id: OWNER, estate_id: OLD, content: 'om boet' }, { user_id: OWNER, estate_id: null, content: 'generell' }]))

  const storage = fakeSupabase({ storage: { 'item-images': { ...manyFiles(OLD, 1200), ...manyFiles(RECENT, 2) }, 'estate-docs': { [`documents/${OLD}/t.pdf`]: {} } } })
  const admin = { from: t => db.from(t), storage: storage.client.storage }
  const run = (query = '') => handleCleanupClosedEstates(
    new Request(`https://x/cleanup${query}`, { method: 'POST', headers: { 'x-cron-secret': CRON } }),
    { secret: CRON, admin: () => admin, log: () => {} })

  // dry_run: viser boet, endrer ingenting
  const dry = await run('?dry_run=1')
  assert.equal(dry.status, 200)
  const plan = dry.body.estates.find(e => e.id === OLD)
  assert.deepEqual(plan, { id: OLD, items: 1, documents: 1, feedback: 1, files: { documents: 1, images: 1200 } })
  assert.ok(!dry.body.estates.some(e => e.id === RECENT))
  assert.equal((await must(db.from('estates').select('id').eq('id', OLD))).length, 1)
  assert.equal((await must(db.from('cleanup_runs').select('id'))).length, 0, 'dry_run logges ikke')

  // ekte kjøring
  const real = await run()
  assert.equal(real.status, 200, JSON.stringify(real.body))
  assert.deepEqual(real.body.deleted, [OLD])
  for (const [table, col] of [['estates', 'id'], ['estate_members', 'estate_id'], ['items', 'estate_id'], ['documents', 'estate_id'], ['heirs', 'estate_id']]) {
    assert.equal((await must(db.from(table).select('*').eq(col, OLD))).length, 0, `${table} er tom`)
  }
  assert.equal((await must(db.from('interests').select('id').eq('item_id', item.id))).length, 0)
  assert.equal((await must(db.from('comments').select('id').eq('item_id', item.id))).length, 0)
  assert.deepEqual((await must(db.from('feedback').select('content').eq('user_id', OWNER))).map(f => f.content), ['generell'])
  assert.equal((await must(db.from('estates').select('id').eq('id', RECENT))).length, 1, 'nylig avsluttet bo står')
  assert.deepEqual([...storage.buckets['item-images'].keys()].sort(), Object.keys(manyFiles(RECENT, 2)).sort())
  const [log] = await must(db.from('cleanup_runs').select('*'))
  assert.equal(log.status, 'ok')
  assert.equal(log.deleted_count, 1)
  assert.ok(log.finished_at)

  await must(db.from('estates').delete().eq('id', RECENT))
  await must(db.from('cleanup_runs').delete().gt('id', 0))
})
