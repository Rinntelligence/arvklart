import { createClient } from '@supabase/supabase-js'
import { getLang } from './lang'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Navnet lagres på brukeren, slik at profilen kan opprettes ved første innlogging også når
// e-posten må bekreftes først (da finnes det ingen økt rett etter registrering).
export const signUp = (email, password, displayName) => supabase.auth.signUp({
  email, password,
  // lang: e-postmalene (supabase/templates) skriver engelsk når brukeren registrerte seg på engelsk
  options: { data: { display_name: displayName, lang: getLang() }, emailRedirectTo: window.location.origin },
})
export const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })
export const signOut = () => supabase.auth.signOut()

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

// PostgREST gir maks 1000 rader per kall; hent alle sidene.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
}

const parseImages = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [] } catch { return [] } }
  return []
}

// Profilene hentes for seg, siden interests.user_id peker på auth.users og ikke på profiles.
const attachProfiles = async (rows) => {
  const userIds = [...new Set(rows.map(x => x.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('user_id, display_name, avatar_color').in('user_id', userIds)
    : { data: [] }
  return rows.map(x => ({ ...x, profiles: (profiles || []).find(p => p.user_id === x.user_id) || null }))
}

export const getEstateInterests = async (estate_id) => {
  const { data, error } = await fetchAll(() => supabase
    .from('interests')
    .select('id, item_id, user_id, reason, created_at, items!inner(estate_id)')
    .eq('items.estate_id', estate_id)
    .order('id'))
  return { data: (data || []).map(({ items, ...x }) => x), error }
}

export const getItems = async (estate_id) => {
  const { data: items, error } = await fetchAll(() => supabase
    .from('items')
    .select('*, categories(label, emoji)')
    .eq('estate_id', estate_id)
    .order('created_at', { ascending: false })
    .order('id'))

  if (error) return { data: [], error }

  const { data: interests } = await getEstateInterests(estate_id)
  const withProfiles = await attachProfiles(interests || [])

  const itemsWithInterests = items.map(item => ({
    ...item,
    extra_images: parseImages(item.extra_images),
    interests: withProfiles.filter(x => x.item_id === item.id),
  }))

  return { data: itemsWithInterests, error: null }
}

export const getItem = async (id) => {
  const { data: item, error } = await supabase
    .from('items')
    .select('*, categories(label, emoji)')
    .eq('id', id).maybeSingle()

  if (error || !item) return { data: null, error }

  const { data: interests } = await supabase
    .from('interests')
    .select('id, item_id, user_id, reason, created_at')
    .eq('item_id', id)

  return { data: { ...item, extra_images: parseImages(item.extra_images), interests: await attachProfiles(interests || []) }, error: null }
}

export const addInterest = (item_id, user_id, reason) =>
  supabase.from('interests').insert({ item_id, user_id, reason }).select().single()

export const removeInterest = (item_id, user_id) =>
  supabase.from('interests').delete().eq('item_id', item_id).eq('user_id', user_id)

// Profilene kobles på i koden, så det ikke trengs en fremmednøkkel mellom comments og profiles
export const getComments = async (item_id) => {
  const { data, error } = await supabase.from('comments')
    .select('*')
    .eq('item_id', item_id)
    .order('created_at', { ascending: true })
  return { data: error ? [] : await attachProfiles(data || []), error }
}

export const addComment = (item_id, user_id, content) =>
  supabase.from('comments').insert({ item_id, user_id, content }).select('id').single()

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
