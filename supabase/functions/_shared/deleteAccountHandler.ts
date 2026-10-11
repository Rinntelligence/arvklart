// Forespørselen til delete-account: bare POST (og CORS-preflight), bare innlogget bruker, aldri demokontoene,
// og bare kontoen som eier innloggingen – ingenting i forespørselen kan peke på en annen bruker.
// Avhengighetene sendes inn, så dette kan testes uten nettverk (test/functions/deleteAccountHandler.test.js).
type User = { id: string; email?: string | null }
export type DeleteAccountDeps = {
  preflight: (req: Request) => Response | null
  getUser: (req: Request) => Promise<User | null>
  isDemoEmail: (email?: string | null) => boolean
  deleteData: (userId: string) => Promise<Record<string, unknown>>
  json: (body: unknown, status?: number) => Response
  log?: (line: string) => void
  safeError?: (e: unknown) => unknown
}

export async function handleDeleteAccount(req: Request, d: DeleteAccountDeps): Promise<Response> {
  const pre = d.preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return d.json({ success: false, code: 'method_not_allowed', error: 'Bare POST er tillatt' }, 405)
  try {
    const user = await d.getUser(req)
    if (!user?.id) return d.json({ success: false, code: 'unauthorized', error: 'Du må være logget inn' }, 401)
    if (d.isDemoEmail(user.email)) return d.json({ success: false, code: 'demo', error: 'Demokontoen kan ikke slettes' }, 403)
    const result = await d.deleteData(user.id)
    d.log?.(JSON.stringify({ fn: 'delete-account', ...result }))
    return d.json({ success: true })
  } catch (e) {
    // Detaljene logges uten persondata; appen får en fast kode (slettingen kan prøves på nytt)
    d.log?.(JSON.stringify({ fn: 'delete-account', error: d.safeError ? d.safeError(e) : 'error' }))
    return d.json({ success: false, code: 'delete_failed', error: 'Kontoen kunne ikke slettes helt. Prøv igjen, eller kontakt oss.' }, 500)
  }
}
