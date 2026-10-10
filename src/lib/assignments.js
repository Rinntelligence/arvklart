// Tildeling av gjenstander går bare via databasefunksjonene (20261017_estate_events_and_assignment.sql):
// én transaksjon, bare ledige gjenstander, mottakeren må være medlem, og alt logges i estate_events.
// Loddtrekningen gjøres av databasen; tildelingen etter trekning må være lik siste trekning.
import { supabase } from './supabase'

// assignments: [{ item_id, user_id }], method: manual | lottery | snake | equal → { assigned, skipped }
export async function assignItems(estateId, assignments, method = 'manual') {
  const { data, error } = await supabase.rpc('assign_items', { p_estate: estateId, p_assignments: assignments, p_method: method })
  return { data, error }
}

export const unassignItem = itemId => supabase.rpc('unassign_item', { p_item: itemId })

// → { winner, candidates, draw_no }
export const drawLot = itemId => supabase.rpc('draw_lot', { p_item: itemId })
