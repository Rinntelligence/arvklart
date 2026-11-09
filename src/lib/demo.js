// Demokontoen som «Test ut demo» logger inn på. Passordet ligger ikke i appen; edge-funksjonen
// demo-login nullstiller demo-boet og returnerer en økt.
import { supabase } from './supabase'
import { L } from './lang'

// Hvem som er demokonto (merket i app_metadata), i en egen modul uten avhengigheter (test/lib/demoIdentity.test.js)
export { demoRole, isDemoUser, isDemoSession } from './demoIdentity'

// Alle besøkende deler demokontoen. Utlogging fra demoen gjelder derfor bare denne nettleseren (scope: local);
// global utlogging (standard i supabase-js) ville logget ut alle andre som prøver demoen samtidig.
export const signOutDemo = () => supabase.auth.signOut({ scope: 'local' })

// Vises når demoen prøver noe som krever et eget arveoppgjør (lagring, eller AI etter 5 forsøk)
export const demoFeatureMessage = () => L(
  'Dette er en demo. Du må opprette et arveoppgjør i Arvklart for å bruke denne funksjonen.',
  'This is a demo. You need to create an estate settlement in Arvklart to use this feature.',
)

export async function startDemoSession() {
  const { data, error } = await supabase.functions.invoke('demo-login', { method: 'POST' })
  if (error || !data?.access_token) return { error: error || new Error('Ingen økt fra demo-login') }
  return supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
}
