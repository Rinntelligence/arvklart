// Sletter kontoen til den innloggede brukeren og personopplysningene om hen (GDPR art. 17).
// Selve slettingen og hva som beholdes, er beskrevet i _shared/deleteAccount.ts; forespørselen (bare POST,
// innlogget, ikke demo, bare egen konto) i _shared/deleteAccountHandler.ts.
// Deployes med --no-verify-jwt: innloggingen sjekkes her med getUser() mot Supabase Auth (signatur, utløp og
// at brukeren finnes), som er strengere enn gatewayens JWT-sjekk.
import { adminClient, getUser, isDemoEmail, json, preflight } from '../_shared/http.ts'
import { deleteAccountData } from '../_shared/deleteAccount.ts'
import { handleDeleteAccount } from '../_shared/deleteAccountHandler.ts'
import { safeError } from '../_shared/cleanup.ts'

Deno.serve(req => handleDeleteAccount(req, {
  preflight, getUser, isDemoEmail, json, safeError,
  deleteData: userId => deleteAccountData(adminClient(), userId),
  log: line => console.log(line),
}))
