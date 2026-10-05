import { supabase, addInterest, getEstateMembers } from './supabase'

// Lagring av «nei takk» (item_passes). Reglene for hva som gjenstår ligger i estateProgress.js.

export const getPasses = async (itemIds) => {
  if (!itemIds.length) return []
  const { data } = await supabase.from('item_passes').select('item_id, user_id').in('item_id', itemIds)
  return data || []
}

export const addPass = async (item_id, user_id) => {
  await supabase.from('interests').delete().eq('item_id', item_id).eq('user_id', user_id)
  return supabase.from('item_passes').upsert({ item_id, user_id }, { onConflict: 'item_id,user_id', ignoreDuplicates: true })
}

export const removePass = (item_id, user_id) =>
  supabase.from('item_passes').delete().eq('item_id', item_id).eq('user_id', user_id)

// Interesse og nei takk utelukker hverandre.
export const addInterestClearingPass = async (item_id, user_id, reason) => {
  await removePass(item_id, user_id)
  return addInterest(item_id, user_id, reason)
}

// Henter det som trengs utover gjenstandene for å vite hva som gjenstår i boet.
export const loadStatusExtras = async (estateId, items) => {
  const [{ data: members }, passes, { data: heirs }, { data: tasks }] = await Promise.all([
    getEstateMembers(estateId),
    getPasses(items.map(i => i.id)),
    supabase.from('heirs').select('id, name, email').eq('estate_id', estateId),
    supabase.from('tasks').select('id, completed').eq('estate_id', estateId),
  ])
  return { members: members || [], passes, heirs: heirs || [], tasks: tasks || [] }
}
