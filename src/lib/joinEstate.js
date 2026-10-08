// Bli med i et bo via invitasjonskode. Databasen (join_estate) sjekker at koden er gyldig
// og at brukerens e-post er lagt inn på en arving i boet under «Arvinger».
import { supabase } from './supabase'
import { L } from './lang'

export async function joinEstateByCode(code, email) {
  const { data, error } = await supabase.rpc('join_estate', { p_code: code.trim().toUpperCase() })
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    return { estate: { id: row.estate_id, name: row.estate_name } }
  }
  const msg = error.message || ''
  if (msg.includes('invalid_code')) return { reason: 'invalid', error: L('Ugyldig invitasjonskode', 'Invalid invite code') }
  if (msg.includes('not_invited')) {
    return {
      reason: 'not_invited',
      error: L(
        `E-posten ${email || 'din'} er ikke lagt til som arving i dette boet. Be den som administrerer boet legge deg til under «Arvinger» med denne e-postadressen.`,
        `${email ? `The email ${email}` : 'Your email'} has not been added as an heir in this estate. Ask the estate administrator to add you under «Heirs» with this email address.`,
      ),
    }
  }
  return { reason: 'error', error: L('Kunne ikke bli med i boet: ', 'Could not join the estate: ') + msg }
}
