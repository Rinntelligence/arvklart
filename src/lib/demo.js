// Demokontoen som «Test ut demo» logger inn på. Passordet ligger ikke i appen; edge-funksjonen
// demo-login nullstiller demo-boet og returnerer en økt.
import { supabase } from './supabase'
import { L } from './lang'

// Alle demokontoene (mona, kari, lars) er skrivebeskyttet, også i databasen (is_demo_user()).
export const isDemoEmail = (email) => /\.demo@heirsplit\.no$/i.test(email || '')
export const isDemoSession = (session) => isDemoEmail(session?.user?.email)

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
