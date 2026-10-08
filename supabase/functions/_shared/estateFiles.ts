// Finner og sletter alle filer som hører til et bo: dokumenter, gjenstandsbilder og logo.
// Brukes før et bo slettes (kontosletting og automatisk sletting av avsluttede bo).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PUBLIC_IMAGES = '/storage/v1/object/public/item-images/'

export const imagePathFromUrl = (url?: string | null) => {
  if (!url) return null
  const i = url.indexOf(PUBLIC_IMAGES)
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_IMAGES.length).split('?')[0])
}

const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}

async function listFolder(admin: SupabaseClient, bucket: string, folder: string) {
  const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
  if (error) throw error
  return (data || []).filter(f => f.id).map(f => `${folder}/${f.name}`)
}

async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

export async function removeEstateFiles(admin: SupabaseClient, estateId: string) {
  const [docs, items, estate] = await Promise.all([
    admin.from('documents').select('file_path').eq('estate_id', estateId),
    admin.from('items').select('image_url, extra_images').eq('estate_id', estateId),
    admin.from('estates').select('branding_logo').eq('id', estateId).maybeSingle(),
  ])
  if (docs.error) throw docs.error
  if (items.error) throw items.error
  if (estate.error) throw estate.error

  const docPaths = new Set<string>((docs.data || []).map(d => d.file_path).filter(Boolean))
  for (const p of await listFolder(admin, 'estate-docs', `documents/${estateId}`)) docPaths.add(p)

  const imagePaths = new Set<string>()
  for (const it of items.data || []) {
    for (const url of [it.image_url, ...asArray(it.extra_images)]) {
      const p = imagePathFromUrl(url)
      if (p) imagePaths.add(p)
    }
  }
  const logo = imagePathFromUrl(estate.data?.branding_logo)
  if (logo) imagePaths.add(logo)
  for (const p of await listFolder(admin, 'item-images', estateId)) imagePaths.add(p)

  await removeAll(admin, 'estate-docs', [...docPaths])
  await removeAll(admin, 'item-images', [...imagePaths])
}
