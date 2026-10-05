// Bli med i et bo via invitasjonskode. Databasen (join_estate) sjekker at koden er gyldig
// og at brukerens e-post er lagt inn på en arving i boet under «Arvinger».
import { supabase } from './supabase'

export async function joinEstateByCode(code, email) {
  const { data, error } = await supabase.rpc('join_estate', { p_code: code.trim().toUpperCase() })
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    return { estate: { id: row.estate_id, name: row.estate_name } }
  }
  const msg = error.message || ''
  if (msg.includes('invalid_code')) return { reason: 'invalid', error: 'Ugyldig invitasjonskode' }
  if (msg.includes('not_invited')) {
    return {
      reason: 'not_invited',
      error: `E-posten ${email || 'din'} er ikke lagt til som arving i dette boet. Be den som administrerer boet legge deg til under «Arvinger» med denne e-postadressen.`,
    }
  }
  return { reason: 'error', error: 'Kunne ikke bli med i boet: ' + msg }
}
