// demo-login: nullstiller demoboet og logger inn på demokontoen Mona uten at passordet finnes i nettleseren.
// Avhengighetene sendes inn, så dette kan testes uten nettverk (test/functions/demoLoginHandler.test.js).
//
// Regler:
//  - Kontoen må være Mona: merket app_metadata.arvklart_demo = 'mona' (settes bare med service role), eller i
//    overgangen den gamle e-posten mona.demo@heirsplit.no uten noe merke. En annen konto røres aldri, selv om
//    DEMO_USER_ID skulle peke feil.
//  - Nullstillingen må lykkes før noen slippes inn; ellers kunne besøkende havne i forrige besøkendes demo.
//  - Det logges inn med e-posten kontoen har nå. Feiler innloggingen (passordet kan være endret fra en demoøkt),
//    settes bare passordet tilbake; e-posten endres aldri herfra.
import { demoRole } from './demoIdentity.ts'

export type AuthUser = { id: string; email?: string | null; app_metadata?: Record<string, unknown> | null }
export type Tokens = { access_token: string; refresh_token: string }
export type DemoLoginDeps = {
  preflight: (req: Request) => Response | null
  json: (body: unknown, status?: number) => Response
  password?: string | null
  demoUserId?: string | null
  getUserById: (id: string) => Promise<AuthUser | null>
  // Når DEMO_USER_ID ikke er satt: kontoen med merket 'mona', ellers (overgang) den gamle e-posten. null hvis
  // ingen eller flere passer.
  findMona: () => Promise<AuthUser | null>
  resetDemo: () => Promise<{ error?: unknown }>
  signIn: (email: string, password: string) => Promise<Tokens | null>
  setPassword: (userId: string, password: string) => Promise<{ error?: unknown }>
  log?: (line: string) => void
}

export const LEGACY_MONA_EMAIL = 'mona.demo@heirsplit.no'
const UNAVAILABLE = { error: 'Demoen er ikke tilgjengelig akkurat nå' }

export const isMona = (user?: AuthUser | null): boolean => {
  if (!user) return false
  if (demoRole(user) === 'mona') return true
  const marked = user.app_metadata?.arvklart_demo
  return (marked === undefined || marked === null || marked === '') && (user.email || '').toLowerCase() === LEGACY_MONA_EMAIL
}

export async function handleDemoLogin(req: Request, d: DemoLoginDeps): Promise<Response> {
  const pre = d.preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return d.json({ error: 'Bruk POST' }, 405)
  const fail = (why: string) => { d.log?.(`demo-login: ${why}`); return d.json(UNAVAILABLE, 503) }
  try {
    if (!d.password) return fail('DEMO_PASSWORD mangler')
    const user = d.demoUserId ? await d.getUserById(d.demoUserId) : await d.findMona()
    if (!user?.email) return fail(d.demoUserId ? 'fant ikke kontoen i DEMO_USER_ID' : 'fant ikke demokontoen Mona')
    if (!isMona(user)) return fail('kontoen er ikke demokontoen Mona; ingenting er endret')

    const { error: resetError } = await d.resetDemo()
    if (resetError) return fail('nullstillingen feilet; ingen slippes inn i en demo som ikke er nullstilt')

    let tokens = await d.signIn(user.email, d.password)
    if (!tokens) {
      const { error } = await d.setPassword(user.id, d.password)
      if (error) return fail('kunne ikke sette passordet tilbake')
      tokens = await d.signIn(user.email, d.password)
      if (!tokens) return fail('innloggingen feilet etter at passordet ble satt tilbake')
    }
    return d.json({ access_token: tokens.access_token, refresh_token: tokens.refresh_token })
  } catch {
    return fail('uventet feil')
  }
}
