// Disponering av gjenstander ingen vil ha (items.disposition): null = uavklart. Foreløpig til fordelingen
// er godkjent av alle. Settes av administrator via set_dispositions() (20261019_item_disposition.sql).
import { L } from './lang.js'
import { supabase } from './supabase'

export const DISPOSITIONS = ['sell', 'donate', 'discard']
export const dispositionLabel = d => ({
  sell: L('Selges', 'To be sold'),
  donate: L('Gis bort', 'To be given away'),
  discard: L('Kastes', 'To be discarded'),
}[d] || L('Ikke bestemt', 'Not decided'))
export const dispositionAction = d => ({ sell: L('Selg', 'Sell'), donate: L('Gi bort', 'Give away'), discard: L('Kast', 'Discard') }[d] || L('Bestem senere', 'Decide later'))

// Gjenstander ingen ønsker og som ikke er tildelt
export const unwantedItems = items => items.filter(i => i.status !== 'assigned' && !i.interests?.length)

// values: [{ item_id, disposition: 'sell' | 'donate' | 'discard' | null }]
export const setDispositions = (estateId, values) => supabase.rpc('set_dispositions', { p_estate: estateId, p_values: values })
