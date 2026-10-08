// Sletter bo som har vært avsluttet i mer enn 12 måneder, med alle filer og tilbakemeldinger knyttet
// til boet (personvernerklæringen). Kjøres daglig av Supabase Cron med headeren x-cron-secret
// (se supabase/README.md). POST ?dry_run=1 viser hva som ville blitt slettet, uten å endre noe.
//
// Hemmelighet: CRON_SECRET – minst 32 tilfeldige tegn, samme verdi som i Vault for cron-jobben.
import { adminClient, json, preflight } from '../_shared/http.ts'
import { handleCleanupClosedEstates } from '../_shared/closedEstates.ts'
import { safeError } from '../_shared/cleanup.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  try {
    const { status, body } = await handleCleanupClosedEstates(req, { secret: Deno.env.get('CRON_SECRET'), admin: adminClient })
    return json(body, status)
  } catch (e) {
    console.error(JSON.stringify({ job: 'cleanup-closed-estates', error: safeError(e) }))
    return json({ error: safeError(e) }, 500)
  }
})
