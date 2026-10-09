// Flytting av eldre bilder i item-images inn i boets mappe, så bøtten kan gjøres privat (S3).
// Eldre opplastinger ligger under items/ og logos/, og tilgangsreglene i Storage krever <bo-id>/… for å
// kunne lage signerte URL-er. Flyttingen skjer i tre steg, hvert med bekreftelsestoken fra forrige liste:
//   1. dry_run    – teller hva som skal kopieres; ingen endringer
//   2. copy       – kopierer til <bo-id>/legacy__<gammel sti med / som __>, kontrollerer kopien og
//                   oppdaterer URL-ene i items (image_url, extra_images) og estates (branding_logo).
//                   Kan kjøres på nytt: kopier som finnes, brukes som de er.
//   3. delete_old – sletter bare gamle filer som har en kontrollert kopi og som ingenting peker på lenger.
// Ingenting slettes i copy-steget, så ingen bilder kan gå tapt før kopiene er kontrollert.
// Testes i test/functions/legacyImages.test.js.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asArray, imagePathFromUrl, listEntries, listFiles, removeAll } from './estateFiles.ts'
import { hasValidCronSecret, readDryRun, safeError } from './cleanup.ts'

const BUCKET = 'item-images'
const PUBLIC_IMAGES = '/storage/v1/object/public/item-images/'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PREFIX = 'legacy__'

export type LegacyRef = { kind: 'item' | 'logo'; id: string; estateId: string; oldUrl: string; oldPath: string; newPath: string }

// Ny sti i boets mappe. Reversibel: legacy__items__a.jpg ↔ items/a.jpg
export const newPathFor = (estateId: string, oldPath: string) => `${estateId}/${PREFIX}${oldPath.split('/').join('__')}`
export const oldPathFromCopy = (copyPath: string) => {
  const name = copyPath.split('/').slice(1).join('/')
  return name.startsWith(PREFIX) ? name.slice(PREFIX.length).split('__').join('/') : null
}
// Samme adresseformat som før, med ny sti (databasen lagrer offentlig URL som identifikator)
export const newUrlFor = (oldUrl: string, newPath: string) => {
  const i = oldUrl.indexOf(PUBLIC_IMAGES)
  return oldUrl.slice(0, i + PUBLIC_IMAGES.length) + newPath.split('/').map(encodeURIComponent).join('/')
}
const isLegacy = (path: string, estateId: string) => !path.startsWith(`${estateId}/`)

async function selectAll(admin: SupabaseClient, table: string, columns: string) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...((data || []) as unknown as Record<string, unknown>[]))
    if (!data || data.length < 1000) return rows
  }
}

// Alle bildereferanser som peker utenfor boets egen mappe
export async function findLegacyRefs(admin: SupabaseClient): Promise<LegacyRef[]> {
  const refs: LegacyRef[] = []
  for (const it of await selectAll(admin, 'items', 'id, estate_id, image_url, extra_images')) {
    const estateId = String(it.estate_id)
    for (const url of [it.image_url as string, ...asArray(it.extra_images)]) {
      const oldPath = imagePathFromUrl(url)
      if (oldPath && isLegacy(oldPath, estateId)) refs.push({ kind: 'item', id: String(it.id), estateId, oldUrl: url, oldPath, newPath: newPathFor(estateId, oldPath) })
    }
  }
  for (const e of await selectAll(admin, 'estates', 'id, branding_logo')) {
    const url = e.branding_logo as string
    const oldPath = imagePathFromUrl(url)
    if (oldPath && isLegacy(oldPath, String(e.id))) refs.push({ kind: 'logo', id: String(e.id), estateId: String(e.id), oldUrl: url, oldPath, newPath: newPathFor(String(e.id), oldPath) })
  }
  return refs
}

// Én kopi per (gammel sti, bo)
export const copiesOf = (refs: LegacyRef[]) =>
  [...new Map(refs.map(r => [`${r.oldPath}→${r.newPath}`, { oldPath: r.oldPath, newPath: r.newPath }])).values()]
    .sort((a, b) => a.newPath.localeCompare(b.newPath))

async function exists(admin: SupabaseClient, path: string) {
  const folder = path.split('/').slice(0, -1).join('/')
  const name = path.split('/').pop()!
  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 100, search: name })
  if (error) throw error
  return (data || []).some(f => f.name === name && f.id)
}

export async function token(lines: string[]) {
  const bytes = new TextEncoder().encode([...lines].sort().join('\n'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Kopier, kontroller og pek om. Gamle filer røres ikke.
export async function copyAndRepoint(admin: SupabaseClient, refs: LegacyRef[]) {
  const ok = new Set<string>()
  let copied = 0, already = 0
  const failures: string[] = []
  for (const c of copiesOf(refs)) {
    try {
      if (await exists(admin, c.newPath)) { already++; ok.add(c.newPath); continue }
      if (!(await exists(admin, c.oldPath))) { failures.push('gammel fil mangler'); continue }
      const { error } = await admin.storage.from(BUCKET).copy(c.oldPath, c.newPath)
      if (error && !/exist/i.test(error.message)) throw error
      if (!(await exists(admin, c.newPath))) throw new Error('kopien finnes ikke etter kopiering')
      copied++
      ok.add(c.newPath)
    } catch (e) {
      failures.push(safeError(e))
    }
  }
  // Pek om radene. Leser raden på nytt og bytter bare URL-er som fortsatt er de gamle.
  let items = 0, logos = 0
  const byRow = new Map<string, LegacyRef[]>()
  for (const r of refs) if (ok.has(r.newPath)) byRow.set(`${r.kind}:${r.id}`, [...(byRow.get(`${r.kind}:${r.id}`) || []), r])
  for (const [key, rs] of byRow) {
    const swap = (url: unknown) => {
      const hit = rs.find(r => r.oldUrl === url)
      return hit ? newUrlFor(hit.oldUrl, hit.newPath) : url
    }
    if (key.startsWith('item:')) {
      const id = key.slice(5)
      const { data: row, error } = await admin.from('items').select('id, image_url, extra_images').eq('id', id).maybeSingle()
      if (error) throw error
      if (!row) continue
      const patch = { image_url: swap(row.image_url), extra_images: asArray(row.extra_images).map(swap) }
      const upd = await admin.from('items').update(patch).eq('id', id)
      if (upd.error) throw upd.error
      items++
    } else {
      const id = key.slice(5)
      const { data: row, error } = await admin.from('estates').select('id, branding_logo').eq('id', id).maybeSingle()
      if (error) throw error
      if (!row) continue
      const upd = await admin.from('estates').update({ branding_logo: swap(row.branding_logo) }).eq('id', id)
      if (upd.error) throw upd.error
      logos++
    }
  }
  return { copied, already, failed: failures.length, failures: failures.slice(0, 10), items_updated: items, logos_updated: logos }
}

// Gamle filer som trygt kan slettes: det finnes en kopi i et bos mappe, og ingenting peker på den gamle stien
export async function deletableOldFiles(admin: SupabaseClient) {
  const refs = new Set<string>()
  for (const it of await selectAll(admin, 'items', 'id, image_url, extra_images')) {
    for (const url of [it.image_url as string, ...asArray(it.extra_images)]) { const p = imagePathFromUrl(url); if (p) refs.add(p) }
  }
  for (const e of await selectAll(admin, 'estates', 'id, branding_logo')) { const p = imagePathFromUrl(e.branding_logo as string); if (p) refs.add(p) }
  const top = await listEntries(admin, BUCKET, '')
  const originals = new Set<string>()
  for (const folder of top.folders.filter(f => UUID.test(f))) {
    for (const f of await listFiles(admin, BUCKET, folder)) {
      const old = oldPathFromCopy(f.path)
      if (old) originals.add(old)
    }
  }
  const out: string[] = []
  for (const old of originals) if (!refs.has(old) && await exists(admin, old)) out.push(old)
  return out.sort()
}

type Deps = { secret: string | undefined; admin: () => SupabaseClient; log?: (line: string) => void }

// { "mode": "dry_run" } (standard) → { "mode": "copy", "confirm": "<token>" } → { "mode": "delete_old", "confirm": "<token>" }
export async function handleMigrateLegacyImages(req: Request, deps: Deps): Promise<{ status: number; body: unknown }> {
  if (!hasValidCronSecret(req.headers.get('x-cron-secret'), deps.secret)) return { status: 401, body: { error: 'Unauthorized' } }
  if (req.method !== 'POST') return { status: 405, body: { error: 'Bruk POST' } }
  const log = deps.log ?? console.log
  const { body } = await readDryRun(req)
  const mode = body?.mode === 'copy' || body?.mode === 'delete_old' ? body.mode : 'dry_run'
  const admin = deps.admin()

  if (mode === 'delete_old') {
    const files = await deletableOldFiles(admin)
    const t = await token(files)
    if (body?.confirm !== t) return { status: files.length ? 409 : 200, body: { mode, to_delete: files.length, confirm: t, done: !files.length } }
    await removeAll(admin, BUCKET, files)
    log(JSON.stringify({ job: 'migrate-legacy-images', mode, deleted: files.length }))
    return { status: 200, body: { mode, deleted: files.length } }
  }

  const refs = await findLegacyRefs(admin)
  const copies = copiesOf(refs)
  const t = await token(copies.map(c => `${c.oldPath}→${c.newPath}`))
  const summary = {
    references: refs.length, files_to_copy: copies.length,
    items: new Set(refs.filter(r => r.kind === 'item').map(r => r.id)).size,
    logos: refs.filter(r => r.kind === 'logo').length,
    estates: new Set(refs.map(r => r.estateId)).size,
  }
  if (mode === 'dry_run' || body?.confirm !== t) {
    log(JSON.stringify({ job: 'migrate-legacy-images', mode: 'dry_run', ...summary }))
    return { status: mode === 'dry_run' ? 200 : 409, body: { mode: 'dry_run', ...summary, confirm: t } }
  }
  const result = await copyAndRepoint(admin, refs)
  const left = (await findLegacyRefs(admin)).length
  log(JSON.stringify({ job: 'migrate-legacy-images', mode, ...result, references_left: left }))
  return { status: result.failed ? 207 : 200, body: { mode, ...summary, ...result, references_left: left } }
}
