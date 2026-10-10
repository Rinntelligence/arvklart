// Disponering av gjenstander ingen vil ha (items.disposition): null = uavklart. Foreløpig til fordelingen
// er godkjent av alle. Settes av administrator via set_dispositions() (20261019_item_disposition.sql).
import { supabase } from './supabase'

export { DISPOSITIONS, dispositionLabel, dispositionAction } from './dispositionLabels.js'

// Gjenstander ingen ønsker og som ikke er tildelt
export const unwantedItems = items => items.filter(i => i.status !== 'assigned' && !i.interests?.length)

// values: [{ item_id, disposition: 'sell' | 'donate' | 'discard' | null }]
export const setDispositions = (estateId, values) => supabase.rpc('set_dispositions', { p_estate: estateId, p_values: values })
