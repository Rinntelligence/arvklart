import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const signUp = (email, password) => supabase.auth.signUp({ email, password })
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
export const signOut = () => supabase.auth.signOut()

export const getProfile = (user_id) =>
  supabase.from('profiles').select('*').eq('user_id', user_id).single()

export const upsertProfile = (data) =>
  supabase.from('profiles').upsert(data, { onConflict: 'user_id' }).select().single()

export const getMyEstates = (user_id) =>
  supabase.from('estate_members')
    .select('estate_id, role, estates(id, name, description, created_at, owner_id, branding_color, branding_logo, status)')
    .eq('user_id', user_id)

export const getEstate = (id) =>
  supabase.from('estates').select('*').eq('id', id).single()

export const createEstate = (data) =>
  supabase.from('estates').insert(data).select().single()

export const updateEstate = (id, data) =>
  supabase.from('estates').update(data).eq('id', id).select().single()

export const getEstateMembers = async (estate_id) => {
  const { data: members, error } = await supabase
    .from('estate_members')
    .select('*')
    .eq('estate_id', estate_id)
  if (error || !members) return { data: [], error }
  const userIds = members.map(m => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, display_name, avatar_color, email')
    .in('user_id', userIds)
  const data = members.map(m => ({
    ...m,
    profiles: (profiles || []).find(p => p.user_id === m.user_id) || null
  }))
  return { data, error: null }
}

// SIMPLE getItems - no complex joins that can fail
export const getItems = async (estate_id) => {
  const { data: items, error } = await supabase
    .from('items')
    .select('*, categories(label, emoji), extra_images')
    .eq('estate_id', estate_id)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error }

  // Fetch interests without profiles join
  const { data: interests } = await supabase
    .from('interests')
    .select('id, item_id, user_id, reason, created_at')
    .in('item_id', items.map(i => i.id))

  // Fetch profiles for those users
  const userIds = [...new Set((interests || []).map(x => x.user_id))]
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('user_id, display_name, avatar_color').in('user_id', userIds)
    : { data: [] }

  // Attach interests + profiles to items
  const itemsWithInterests = items.map(item => ({
    ...item,
    interests: (interests || [])
      .filter(x => x.item_id === item.id)
      .map(x => ({
        ...x,
        profiles: (profiles || []).find(p => p.user_id === x.user_id) || null
      }))
  }))

  return { data: itemsWithInterests, error: null }
}

export const getItem = async (id) => {
  const { data: item, error } = await supabase
    .from('items')
    .select('*, categories(label, emoji), extra_images')
    .eq('id', id).single()

  if (error) return { data: null, error }

  const { data: interests } = await supabase
    .from('interests')
    .select('*, profiles(display_name, avatar_color)')
    .eq('item_id', id)

  // Parse extra_images if it's a string
  const extraImages = typeof item.extra_images === 'string' 
    ? JSON.parse(item.extra_images) 
    : (item.extra_images || [])
  
  return { data: { ...item, extra_images: extraImages, interests: interests || [] }, error: null }
}

export const createItem = async (data) => {
  const safe = {
    estate_id: data.estate_id,
    title: data.title,
    description: data.description || null,
    category_id: data.category_id || null,
    image_url: data.image_url || null,
    added_by: data.added_by || null,
    added_by_name: data.added_by_name || null,
    status: data.status || 'active',
    estimated_value: data.estimated_value || null,
    condition: data.condition || 'good',
    purchase_price: data.purchase_price || null,
    purchase_year: data.purchase_year || null,
  }
  return supabase.from('items').insert(safe).select().single()
}

export const updateItem = (id, data) =>
  supabase.from('items').update(data).eq('id', id).select().single()

export const deleteItem = (id) =>
  supabase.from('items').delete().eq('id', id)

export const assignItem = (id, user_id) =>
  supabase.from('items').update({ assigned_to: user_id, status: 'assigned' }).eq('id', id)

export const addInterest = (item_id, user_id, reason) =>
  supabase.from('interests').insert({ item_id, user_id, reason }).select().single()

export const removeInterest = (item_id, user_id) =>
  supabase.from('interests').delete().eq('item_id', item_id).eq('user_id', user_id)

export const getComments = (item_id) =>
  supabase.from('comments')
    .select('*, profiles!comments_user_id_fkey(display_name, avatar_color)')
    .eq('item_id', item_id)
    .order('created_at', { ascending: true })

export const addComment = (item_id, user_id, content) =>
  supabase.from('comments').insert({ item_id, user_id, content })
    .select('*, profiles!comments_user_id_fkey(display_name, avatar_color)').single()

export const deleteComment = (id) =>
  supabase.from('comments').delete().eq('id', id)

// Same set as the demo estate (supabase_demo.sql)
export const DEFAULT_CATEGORIES = [
  'Møbler', 'Kunst og bilder', 'Smykker og ur',
  'Elektronikk', 'Kjøkken og porselen', 'Minner og arvestykker',
]

const seeding = {}

// Inserts the default categories if the estate has none; reuses an in-flight insert
export const ensureDefaultCategories = (estate_id) => {
  if (!seeding[estate_id]) {
    seeding[estate_id] = supabase.from('categories')
      .insert(DEFAULT_CATEGORIES.map(label => ({ label, emoji: '', estate_id })))
      .select()
      .then(res => { delete seeding[estate_id]; return res })
  }
  return seeding[estate_id]
}

export const getCategories = async (estate_id) => {
  const res = await supabase.from('categories').select('*').eq('estate_id', estate_id).order('label')
  if (res.error || res.data.length) return res
  const seeded = await ensureDefaultCategories(estate_id)
  if (seeded.error) return seeded
  return { ...seeded, data: [...seeded.data].sort((a, b) => a.label.localeCompare(b.label, 'nb')) }
}

export const submitFeedback = (user_id, estate_id, type, content, nps_score) =>
  supabase.from('feedback').insert({ user_id, estate_id, type, content, nps_score })

export const getAllFeedback = () =>
  supabase.from('feedback').select('*')
    .order('created_at', { ascending: false })

export const uploadImage = async (file, itemId) => {
  const ext = file.name.split('.').pop()
  const path = `items/${itemId}-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('item-images').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl
}

export const uploadLogo = async (file, estateId) => {
  const ext = file.name.split('.').pop()
  const path = `logos/${estateId}.${ext}`
  const { error } = await supabase.storage.from('item-images').upload(path, file, { upsert: true })
  if (error) throw error
  return supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl
}

export const getAllEstates = () =>
  supabase.from('estates').select('*, profiles!estates_owner_id_fkey(display_name, email)')
    .order('created_at', { ascending: false })

export const getAllProfiles = () =>
  supabase.from('profiles').select('*').order('created_at', { ascending: false })
