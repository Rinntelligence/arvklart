// Demokontoene skal ikke kunne endre noe varig, slette kontoen eller bruke AI utover demokvoten.
// De kjennes igjen på merket app_metadata.arvklart_demo ('mona' | 'kari' | 'lars'), som bare service role kan sette
// (scripts/demo-identity.mjs), og som følger kontoen selv om e-posten endres. Samme regel som is_demo_user() i
// databasen (20261109_demo_identity.sql). Overgang: også det gamle e-postmønsteret (heirsplit.no, som Arvklart ikke
// eier) til e-postene er byttet; det fjernes sammen med mønsteret i databasen.
export const DEMO_ROLES = ['mona', 'kari', 'lars'] as const
export type DemoUser = { email?: string | null; app_metadata?: Record<string, unknown> | null }
export const demoRole = (user?: DemoUser | null): string | null => {
  const role = user?.app_metadata?.arvklart_demo
  return typeof role === 'string' && (DEMO_ROLES as readonly string[]).includes(role) ? role : null
}
export const isDemoEmail = (email?: string | null) => /\.demo@heirsplit\.no$/i.test(email || '')
export const isDemoUser = (user?: DemoUser | null) => !!demoRole(user) || isDemoEmail(user?.email)
