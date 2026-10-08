// Manuell opprydding av foreldreløse bilder i item-images (eldre enn 30 dager, ingen gjenstand eller logo
// peker på dem, utenfor et eksisterende bos mappe). Kjøres aldri av cron.
//   1. POST (uten body)                                → dry_run: antall, størrelse, datoer og et bekreftelsestoken
//   2. POST { "dry_run": false, "confirm": "<token>" } → sletter akkurat de filene, eller 409 hvis listen er endret
// Krever headeren x-cron-secret (CRON_SECRET), som cleanup-closed-estates.
import { adminClient, json, preflight } from '../_shared/http.ts'
import { handleCleanupOrphanImages } from '../_shared/orphanImages.ts'
import { safeError } from '../_shared/cleanup.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  try {
    const { status, body } = await handleCleanupOrphanImages(req, { secret: Deno.env.get('CRON_SECRET'), admin: adminClient })
    return json(body, status)
  } catch (e) {
    console.error(JSON.stringify({ job: 'cleanup-orphan-images', error: safeError(e) }))
    return json({ error: safeError(e) }, 500)
  }
})
