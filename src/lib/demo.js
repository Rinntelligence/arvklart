// Demokontoen som «Test ut demo» logger inn på. Passordet ligger ikke i appen; edge-funksjonen
// demo-login nullstiller demo-boet og returnerer en økt.
import { supabase } from './supabase'

// Alle demokontoene (mona, kari, lars) er skrivebeskyttet, også i databasen (is_demo_user()).
export const isDemoEmail = (email) => /\.demo@heirsplit\.no$/i.test(email || '')
export const isDemoSession = (session) => isDemoEmail(session?.user?.email)

export async function startDemoSession() {
  const { data, error } = await supabase.functions.invoke('demo-login', { method: 'POST' })
  if (error || !data?.access_token) return { error: error || new Error('Ingen økt fra demo-login') }
  return supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
}
