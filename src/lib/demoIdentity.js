// Alle demokontoene (mona, kari, lars) er skrivebeskyttet, også i databasen (is_demo_user()). De kjennes igjen på
// merket app_metadata.arvklart_demo, som bare serveren kan sette (aldri brukeren selv, i motsetning til user_metadata),
// og som følger kontoen selv om e-posten endres. Samme regel som is_demo_user() og edge-funksjonene. E-postdomenet
// brukes ikke (Arvklart eier ikke heirsplit.no).
const DEMO_ROLES = ['mona', 'kari', 'lars']
export const demoRole = (user) => {
  const role = user?.app_metadata?.arvklart_demo
  return DEMO_ROLES.includes(role) ? role : null
}
export const isDemoUser = (user) => !!demoRole(user)
export const isDemoSession = (session) => isDemoUser(session?.user)
