// Automatisk sletting av bo som har vært avsluttet i over 12 måneder (personvernerklæringen).
// Logikken ligger her (ikke i index.ts) så den kan testes uten Deno: test/functions/closedEstates.test.js.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { countEstateFiles, deleteEstate } from './estateFiles.ts'
import { finishRun, hasValidCronSecret, httpStatus, readDryRun, runStatus, safeError, startRun } from './cleanup.ts'

export const RETENTION_MONTHS = 12
const JOB = 'cleanup-closed-estates'

export function cutoffDate(now: Date) {
  const d = new Date(now)
  d.setUTCMonth(d.getUTCMonth() - RETENTION_MONTHS)
  return d
}

export async function findExpiredEstates(admin: SupabaseClient, now: Date): Promise<string[]> {
  const { data, error } = await admin.from('estates')
    .select('id').eq('status', 'closed').lt('closed_at', cutoffDate(now).toISOString()).order('closed_at')
  if (error) throw error
  return (data || []).map(e => e.id)
}

// Bare lesing: antall rader og filer per bo som ville blitt slettet. Ingen navn, titler eller filstier.
async function describe(admin: SupabaseClient, estateId: string) {
  const count = async (table: string, column = 'estate_id') => {
    const { count, error } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, estateId)
    if (error) throw error
    return count ?? 0
  }
  return {
    id: estateId,
    items: await count('items'),
    documents: await count('documents'),
    feedback: await count('feedback'),
    files: await countEstateFiles(admin, estateId),
  }
}

type Deps = { secret: string | undefined; admin: () => SupabaseClient; now?: Date; log?: (line: string) => void }

export async function handleCleanupClosedEstates(req: Request, deps: Deps): Promise<{ status: number; body: unknown }> {
  if (!hasValidCronSecret(req.headers.get('x-cron-secret'), deps.secret)) return { status: 401, body: { error: 'Unauthorized' } }
  if (req.method !== 'POST') return { status: 405, body: { error: 'Bruk POST' } }

  const log = deps.log ?? console.log
  const now = deps.now ?? new Date()
  const { dryRun } = await readDryRun(req)
  const admin = deps.admin()
  const estates = await findExpiredEstates(admin, now)

  if (dryRun) {
    const plan = []
    for (const id of estates) plan.push(await describe(admin, id))
    log(JSON.stringify({ job: JOB, dry_run: true, estates: plan.length }))
    return { status: 200, body: { dry_run: true, cutoff: cutoffDate(now).toISOString(), estates: plan } }
  }

  const runId = await startRun(admin, JOB)
  const deleted: string[] = []
  const failed: { id: string; error: string }[] = []
  let files = 0
  for (const id of estates) {
    try {
      files += (await deleteEstate(admin, id)).removed
      deleted.push(id)
    } catch (e) {
      failed.push({ id, error: safeError(e) })
    }
  }
  const status = runStatus(deleted.length, failed.length)
  await finishRun(admin, runId, status, deleted.length, failed.length, { deleted, failed, files })
  log(JSON.stringify({ job: JOB, run_id: runId, status, deleted: deleted.length, failed: failed.length, files }))
  return { status: httpStatus(status), body: { run_id: runId, status, deleted, failed } }
}
