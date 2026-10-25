// Laster opp bildene til demoboet (supabase/seed/demo-images/<gjenstand>.jpg) til den private bøtten item-images,
// under boets mappe: <demo-bo-id>/demo__<gjenstand>.jpg. Bildene vises da med signerte URL-er som alle andre.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/seed/upload_demo_images.mjs [--apply] [face0001 …]
//
// Uten --apply vises bare hva som ville blitt lastet opp (tørrkjøring). Uten gjenstander tas alle filene i mappen.
// Overskriver aldri en eksisterende fil og sletter ingenting. Etter opplasting lastes hver fil ned igjen og
// sammenlignes (SHA-256). Skriver ut URL-en som skal stå i items.image_url. Nøkkelen skrives aldri ut.
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

const DEMO = 'deed0001-0000-0000-0000-000000000001'
const BUCKET = 'item-images'
const DIR = new URL('./demo-images/', import.meta.url)
const apply = process.argv.includes('--apply')
const only = process.argv.slice(2).filter(a => !a.startsWith('--'))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må være satt'); process.exit(1) }
const admin = createClient(url, key, { auth: { persistSession: false } })

const sha = buf => createHash('sha256').update(buf).digest('hex')
const files = (await readdir(DIR)).filter(f => /^face\d{4}\.jpg$/.test(f)).map(f => f.slice(0, -4))
const ids = only.length ? only : files
const missing = ids.filter(id => !files.includes(id))
if (missing.length) { console.error('Finnes ikke i demo-images:', missing.join(', ')); process.exit(1) }

const { data: existing, error: listError } = await admin.storage.from(BUCKET).list(DEMO, { limit: 1000 })
if (listError) { console.error('Kunne ikke liste bøtten:', listError.message); process.exit(1) }
const names = new Set((existing || []).map(o => o.name))

let failed = 0
for (const id of ids) {
  const name = `demo__${id}.jpg`
  const path = `${DEMO}/${name}`
  const body = await readFile(new URL(`${id}.jpg`, DIR))
  const row = { id, path, bytes: body.length, sha256: sha(body), image_url: `${url}/storage/v1/object/public/${BUCKET}/${path}` }
  if (names.has(name)) { console.log(JSON.stringify({ ...row, status: 'finnes allerede (ikke endret)' })); continue }
  if (!apply) { console.log(JSON.stringify({ ...row, status: 'ville blitt lastet opp' })); continue }
  const { error } = await admin.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) { failed++; console.log(JSON.stringify({ ...row, status: 'feil: ' + error.message })); continue }
  const { data: back, error: dlError } = await admin.storage.from(BUCKET).download(path)
  const same = !dlError && sha(Buffer.from(await back.arrayBuffer())) === row.sha256
  if (!same) failed++
  console.log(JSON.stringify({ ...row, status: same ? 'lastet opp og kontrollert' : 'lastet opp, men kontrollen feilet' }))
}
process.exit(failed ? 1 : 0)
