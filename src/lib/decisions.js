import { supabase, addInterest, getEstateMembers, fetchAll } from './supabase'

// Lagring av «nei takk» (item_passes). Reglene for hva som gjenstår ligger i estateProgress.js.

export const getPasses = async (itemIds) => {
  if (!itemIds.length) return []
  const { data } = await supabase.from('item_passes').select('item_id, user_id').in('item_id', itemIds)
  return data || []
}

// Alle «nei takk» i et bo, uansett hvor mange gjenstander boet har.
export const getEstatePasses = async (estateId) => {
  const { data } = await fetchAll(() => supabase
    .from('item_passes')
    .select('item_id, user_id, items!inner(estate_id)')
    .eq('items.estate_id', estateId)
    .order('id'))
  return (data || []).map(({ item_id, user_id }) => ({ item_id, user_id }))
}

// Returnerer { error } fra det første kallet som feiler.
export const addPass = async (item_id, user_id) => {
  const { error } = await supabase.from('interests').delete().eq('item_id', item_id).eq('user_id', user_id)
  if (error) return { error }
  return supabase.from('item_passes').upsert({ item_id, user_id }, { onConflict: 'item_id,user_id', ignoreDuplicates: true })
}

export const removePass = (item_id, user_id) =>
  supabase.from('item_passes').delete().eq('item_id', item_id).eq('user_id', user_id)

// Interesse og nei takk utelukker hverandre.
export const addInterestClearingPass = async (item_id, user_id, reason) => {
  const { error } = await removePass(item_id, user_id)
  if (error) return { error }
  return addInterest(item_id, user_id, reason?.trim() || null)
}

// Begrunnelsen på eget ønske (tom tekst fjerner den). Databasen lar bare eieren av ønsket endre den;
// en oppdatering som ikke treffer noen rad gir ingen feil derfra, så det meldes som feil her.
export const setInterestReason = async (item_id, user_id, reason) => {
  const { data, error } = await supabase.from('interests')
    .update({ reason: reason?.trim() || null })
    .eq('item_id', item_id).eq('user_id', user_id)
    .select('id')
  if (error) return { error }
  if (!data?.length) return { error: new Error('not_updated') }
  return { error: null }
}

// Henter det som trengs utover gjenstandene for å vite hva som gjenstår i boet.
export const loadStatusExtras = async (estateId) => {
  const [{ data: members }, passes, { data: heirs }, { data: tasks }] = await Promise.all([
    getEstateMembers(estateId),
    getEstatePasses(estateId),
    supabase.from('heirs').select('id, name, email, relationship, percentage, user_id').eq('estate_id', estateId),
    supabase.from('tasks').select('id, completed').eq('estate_id', estateId),
  ])
  return { members: members || [], passes, heirs: heirs || [], tasks: tasks || [] }
}
