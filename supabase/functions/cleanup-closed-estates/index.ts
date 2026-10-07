// Sletter bo som har vært avsluttet i mer enn 12 måneder, med alle filer (personvernerklæringen).
// Kjøres månedlig av Supabase Cron (se supabase/README.md) med headeren x-cron-secret.
//
// Hemmelighet: CRON_SECRET – en lang tilfeldig streng som også legges inn i cron-jobben.
import { adminClient, json, preflight } from '../_shared/http.ts'
import { removeEstateFiles } from '../_shared/estateFiles.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401)

  const admin = adminClient()
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - 1)

  const { data: estates, error } = await admin.from('estates')
    .select('id').eq('status', 'closed').lt('closed_at', cutoff.toISOString())
  if (error) return json({ error: error.message }, 500)

  const deleted: string[] = []
  const failed: { id: string; error: string }[] = []
  for (const { id } of estates || []) {
    try {
      await removeEstateFiles(admin, id)
      const { error: delError } = await admin.from('estates').delete().eq('id', id)
      if (delError) throw delError
      deleted.push(id)
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  console.log(`cleanup-closed-estates: slettet ${deleted.length}, feilet ${failed.length}`)
  return json({ deleted, failed }, failed.length ? 207 : 200)
})
