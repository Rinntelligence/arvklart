// Foreldreløse bilder i item-images: filer som ingen gjenstand eller logo peker på, som ligger utenfor
// et eksisterende bos mappe (eldre opplastinger under items/ og logos/, eller mapper for bo som er slettet),
// og som er eldre enn MIN_AGE_DAYS. Slettes aldri automatisk: først dry_run, så sletting med
// bekreftelsestokenet fra dry_run, som bare virker hvis listen er nøyaktig den samme.
// Testes i test/functions/orphanImages.test.js.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { asArray, imagePathFromUrl, listEntries, listFiles, removeAll, type StoredFile } from './estateFiles.ts'
import { finishRun, hasValidCronSecret, httpStatus, readDryRun, runStatus, safeError, startRun } from './cleanup.ts'

export const MIN_AGE_DAYS = 30
const BUCKET = 'item-images'
const JOB = 'cleanup-orphan-images'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Alle rader, side for side
async function selectAll(admin: SupabaseClient, table: string, columns: string) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from(table).select(columns).order('id').range(from, from + 999)
    if (error) throw error
    rows.push(...((data || []) as unknown as Record<string, unknown>[]))
    if (!data || data.length < 1000) return rows
  }
}

async function referencedPaths(admin: SupabaseClient) {
  const refs = new Set<string>()
  for (const it of await selectAll(admin, 'items', 'id, image_url, extra_images')) {
    for (const url of [it.image_url as string, ...asArray(it.extra_images)]) {
      const p = imagePathFromUrl(url)
      if (p) refs.add(p)
    }
  }
  const estates = await selectAll(admin, 'estates', 'id, branding_logo')
  for (const e of estates) {
    const p = imagePathFromUrl(e.branding_logo as string)
    if (p) refs.add(p)
  }
  return { refs, estateIds: new Set(estates.map(e => String(e.id))) }
}

export async function findOrphanImages(admin: SupabaseClient, now: Date, minAgeDays = MIN_AGE_DAYS): Promise<StoredFile[]> {
  const cutoff = now.getTime() - minAgeDays * 24 * 3600 * 1000
  const { refs, estateIds } = await referencedPaths(admin)
  // Toppnivået: mapper (bo-id, items, logos …) og eventuelle løse filer
  const top = await listEntries(admin, BUCKET, '')
  // Mapper for eksisterende bo hører til boet og slettes sammen med det
  const folders = top.folders.filter(name => !(UUID.test(name) && estateIds.has(name)))
  const files = [...top.files]
  for (const folder of folders) files.push(...await listFiles(admin, BUCKET, folder))
  return files
    .filter(f => !refs.has(f.path))
    .filter(f => f.createdAt !== null && new Date(f.createdAt).getTime() < cutoff)
    .sort((a, b) => a.path.localeCompare(b.path))
}

// Token for akkurat denne listen: sletting krever at listen ikke har endret seg siden dry_run
export async function confirmToken(files: StoredFile[]) {
  const bytes = new TextEncoder().encode(files.map(f => f.path).sort().join('\n'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Oppsummering uten filstier (stiene gir offentlige bilde-URL-er)
export function summarize(files: StoredFile[]) {
  const byFolder: Record<string, number> = {}
  for (const f of files) {
    const top = f.path.includes('/') ? f.path.split('/')[0] : '(rot)'
    const key = UUID.test(top) ? '<slettet bo>' : top
    byFolder[key] = (byFolder[key] || 0) + 1
  }
  const dates = files.map(f => f.createdAt!).sort()
  return {
    count: files.length,
    total_bytes: files.reduce((s, f) => s + (f.size || 0), 0),
    oldest: dates[0] ?? null,
    newest: dates[dates.length - 1] ?? null,
    by_folder: byFolder,
  }
}

type Deps = { secret: string | undefined; admin: () => SupabaseClient; now?: Date; log?: (line: string) => void }

// Standard er dry_run. Sletting krever { "dry_run": false, "confirm": "<token fra dry_run>" }.
export async function handleCleanupOrphanImages(req: Request, deps: Deps): Promise<{ status: number; body: unknown }> {
  if (!hasValidCronSecret(req.headers.get('x-cron-secret'), deps.secret)) return { status: 401, body: { error: 'Unauthorized' } }
  if (req.method !== 'POST') return { status: 405, body: { error: 'Bruk POST' } }

  const log = deps.log ?? console.log
  const { body } = await readDryRun(req)
  const execute = body?.dry_run === false
  const admin = deps.admin()
  const files = await findOrphanImages(admin, deps.now ?? new Date())
  const token = await confirmToken(files)
  const summary = summarize(files)

  if (!execute) {
    log(JSON.stringify({ job: JOB, dry_run: true, count: summary.count }))
    return { status: 200, body: { dry_run: true, min_age_days: MIN_AGE_DAYS, ...summary, confirm: token } }
  }
  if (typeof body.confirm !== 'string' || body.confirm !== token) {
    return { status: 409, body: { error: 'Listen har endret seg eller bekreftelsen mangler. Kjør dry_run på nytt.' } }
  }
  if (!files.length) return { status: 200, body: { deleted: 0 } }

  const runId = await startRun(admin, JOB)
  let deleted = 0
  let error: string | null = null
  try {
    const paths = files.map(f => f.path)
    for (let i = 0; i < paths.length; i += 100) {
      await removeAll(admin, BUCKET, paths.slice(i, i + 100))
      deleted += Math.min(100, paths.length - i)
    }
  } catch (e) {
    error = safeError(e)
  }
  const failed = files.length - deleted
  const status = runStatus(deleted, failed)
  await finishRun(admin, runId, status, deleted, failed, { ...summary, error })
  log(JSON.stringify({ job: JOB, run_id: runId, status, deleted, failed }))
  return { status: httpStatus(status), body: { run_id: runId, status, deleted, failed, error } }
}
