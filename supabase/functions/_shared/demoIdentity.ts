// Demokontoene skal ikke kunne endre noe varig, slette kontoen eller bruke AI utover demokvoten.
// De kjennes igjen på merket app_metadata.arvklart_demo ('mona' | 'kari' | 'lars'), som bare service role kan sette
// (scripts/demo-identity.mjs), og som følger kontoen selv om e-posten endres. Samme regel som is_demo_user() i
// databasen (20261109190000_demo_identity.sql). E-postdomenet brukes ikke: Arvklart eier ikke heirsplit.no, og en e-post kan
// endres av den som har tilgang til innboksen.
export const DEMO_ROLES = ['mona', 'kari', 'lars'] as const
export type DemoUser = { email?: string | null; app_metadata?: Record<string, unknown> | null }
export const demoRole = (user?: DemoUser | null): string | null => {
  const role = user?.app_metadata?.arvklart_demo
  return typeof role === 'string' && (DEMO_ROLES as readonly string[]).includes(role) ? role : null
}
export const isDemoUser = (user?: DemoUser | null) => !!demoRole(user)
