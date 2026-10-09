// Sletter kontoen til den innloggede brukeren og personopplysningene om hen (GDPR art. 17).
// Selve slettingen og hva som beholdes, er beskrevet i _shared/deleteAccount.ts.
import { adminClient, getUser, isDemoEmail, json, preflight } from '../_shared/http.ts'
import { deleteAccountData } from '../_shared/deleteAccount.ts'
import { safeError } from '../_shared/cleanup.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, code: 'unauthorized', error: 'Du må være logget inn' }, 401)
    if (isDemoEmail(user.email)) return json({ success: false, code: 'demo', error: 'Demokontoen kan ikke slettes' }, 403)

    const result = await deleteAccountData(adminClient(), user.id)
    console.log(JSON.stringify({ fn: 'delete-account', ...result }))
    return json({ success: true })
  } catch (e) {
    // Detaljene logges uten persondata; appen får en fast kode (slettingen kan prøves på nytt)
    console.error(JSON.stringify({ fn: 'delete-account', error: safeError(e) }))
    return json({ success: false, code: 'delete_failed', error: 'Kontoen kunne ikke slettes helt. Prøv igjen, eller kontakt oss.' }, 500)
  }
})
