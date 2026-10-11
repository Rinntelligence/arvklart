// Tildeling av gjenstander går bare via databasefunksjonene (20261017, 20261021_heir_assignment.sql):
// én transaksjon, bare ledige gjenstander, mottakeren er en person på listen med «Kan få gjenstander»
// (også uten konto), og alt logges i estate_events. Loddtrekningen gjøres av databasen blant mottakerne
// som ønsker gjenstanden; tildelingen etter trekning må være lik siste trekning.
import { supabase } from './supabase'

// assignments: [{ item_id, heir_id }], method: manual | lottery | snake | equal → { assigned, skipped }
export async function assignItems(estateId, assignments, method = 'manual') {
  const { data, error } = await supabase.rpc('assign_items', { p_estate: estateId, p_assignments: assignments, p_method: method })
  return { data, error }
}

export const unassignItem = itemId => supabase.rpc('unassign_item', { p_item: itemId })

// → { winner_heir, winner (konto), candidate_heirs, candidates, draw_no }
export const drawLot = itemId => supabase.rpc('draw_lot', { p_item: itemId })
