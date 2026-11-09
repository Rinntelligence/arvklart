// Alle demokontoene (mona, kari, lars) er skrivebeskyttet, også i databasen (is_demo_user()). De kjennes igjen på
// merket app_metadata.arvklart_demo, som bare serveren kan sette (aldri brukeren selv, i motsetning til user_metadata),
// og som følger kontoen selv om e-posten endres. Samme regel som is_demo_user() og edge-funksjonene.
// Overgang: også det gamle e-postmønsteret (heirsplit.no) til e-postene er byttet til @arvklart.no.
const DEMO_ROLES = ['mona', 'kari', 'lars']
export const demoRole = (user) => {
  const role = user?.app_metadata?.arvklart_demo
  return DEMO_ROLES.includes(role) ? role : null
}
export const isDemoEmail = (email) => /\.demo@heirsplit\.no$/i.test(email || '')
export const isDemoUser = (user) => !!demoRole(user) || isDemoEmail(user?.email)
export const isDemoSession = (session) => isDemoUser(session?.user)
