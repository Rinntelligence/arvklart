// Felles for vedlikeholdsjobbene (cleanup-closed-estates, cleanup-orphan-images): tilgangssjekk med
// x-cron-secret, kjørelogg i tabellen cleanup_runs og logging uten persondata.
// Testes i test/functions/*.test.js.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Hemmeligheten må være lang nok; mangler den eller er den for kort, avvises alle kall
const MIN_SECRET_LENGTH = 32

// Sammenligner uten å avsløre hvor mange tegn som stemte (konstant tid for samme lengde)
export function hasValidCronSecret(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !header) return false
  const a = new TextEncoder().encode(header)
  const b = new TextEncoder().encode(secret)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}

// Feilmeldinger lagres og logges forkortet, uten filstier eller e-postadresser
export const safeError = (e: unknown) =>
  (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e))
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<e-post>')
    .replace(/\S*\/\S*\.(jpe?g|png|gif|webp|heic|pdf|docx?)\b/gi, '<fil>')
    .slice(0, 200)

export type RunStatus = 'ok' | 'partial' | 'failed'

// Én rad per ekte kjøring (ikke dry_run). En rad som blir stående som «running» betyr at kjøringen krasjet.
export async function startRun(admin: SupabaseClient, job: string) {
  const { data, error } = await admin.from('cleanup_runs').insert({ job }).select('id').single()
  if (error) throw error
  return data.id as number
}

export async function finishRun(admin: SupabaseClient, id: number, status: RunStatus, deleted: number, failed: number, details: Record<string, unknown>) {
  const { error } = await admin.from('cleanup_runs')
    .update({ status, finished_at: new Date().toISOString(), deleted_count: deleted, failed_count: failed, details })
    .eq('id', id)
  if (error) throw error
}

export const runStatus = (deleted: number, failed: number): RunStatus =>
  failed === 0 ? 'ok' : deleted === 0 ? 'failed' : 'partial'

export const httpStatus = (status: RunStatus) => (status === 'ok' ? 200 : status === 'partial' ? 207 : 500)

// dry_run kan settes i URL-en (?dry_run=1) eller i body ({ "dry_run": true })
export async function readDryRun(req: Request) {
  if (new URL(req.url).searchParams.get('dry_run') === '1') return { dryRun: true, body: {} as Record<string, unknown> }
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* tom body */ }
  return { dryRun: body?.dry_run === true, body }
}
