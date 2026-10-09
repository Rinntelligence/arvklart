// Engangsjobb (S2): flytter eldre bilder (items/, logos/) inn i boets mappe i item-images, så bøtten kan
// gjøres privat. Se _shared/legacyImages.ts for stegene (dry_run → copy → delete_old, hvert med token).
// Krever headeren x-cron-secret med verdien av LEGACY_IMAGES_SECRET (egen engangshemmelighet, så CRON_SECRET for
// cron-jobbene ikke røres). Deployes med --no-verify-jwt, kjøres manuelt, og funksjonen og hemmeligheten
// fjernes etterpå.
import { adminClient, json, preflight } from '../_shared/http.ts'
import { handleMigrateLegacyImages } from '../_shared/legacyImages.ts'
import { safeError } from '../_shared/cleanup.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  try {
    const { status, body } = await handleMigrateLegacyImages(req, { secret: Deno.env.get('LEGACY_IMAGES_SECRET'), admin: adminClient })
    return json(body, status)
  } catch (e) {
    console.error(JSON.stringify({ job: 'migrate-legacy-images', error: safeError(e) }))
    return json({ error: safeError(e) }, 500)
  }
})
