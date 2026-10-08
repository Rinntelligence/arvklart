// Finner og sletter alle filer som hører til et bo: dokumenter, gjenstandsbilder og logo.
// Brukes før et bo slettes (kontosletting og automatisk sletting av avsluttede bo).
// Testes i test/functions/estateFiles.test.js.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PUBLIC_IMAGES = '/storage/v1/object/public/item-images/'
const PAGE_SIZE = 1000
// Antall runder med «list → slett → list igjen» før vi gir opp og lar boet stå til neste kjøring
const MAX_PASSES = 3

export type StoredFile = { path: string; createdAt: string | null; size: number | null }

export const imagePathFromUrl = (url?: string | null) => {
  if (!url) return null
  const i = url.indexOf(PUBLIC_IMAGES)
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_IMAGES.length).split('?')[0])
}

export const asArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}

// Alt som ligger direkte i mappen (filer og undermapper), side for side sortert på navn (Storage gir
// maks én side per kall). Endres mappen underveis kan en fil hoppes over; derfor sjekker
// removeEstateFiles mappen på nytt etter slettingen.
export async function listEntries(admin: SupabaseClient, bucket: string, folder: string) {
  const files = new Map<string, StoredFile>()
  const folders = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.storage.from(bucket)
      .list(folder, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw error
    const page = data || []
    for (const f of page) {
      const path = folder ? `${folder}/${f.name}` : f.name
      if (!f.id) folders.add(path)
      else files.set(path, { path, createdAt: f.created_at ?? null, size: (f.metadata?.size as number | undefined) ?? null })
    }
    if (page.length < PAGE_SIZE) return { files: [...files.values()], folders: [...folders] }
  }
}

export const listFiles = async (admin: SupabaseClient, bucket: string, folder: string) =>
  (await listEntries(admin, bucket, folder)).files

export const listFolder = async (admin: SupabaseClient, bucket: string, folder: string) =>
  (await listFiles(admin, bucket, folder)).map(f => f.path)

export async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100))
    if (error) throw error
  }
}

// Filene boet har i databasen: dokumentrader, gjenstandsbilder (også eldre filer under items/) og logo
async function referencedFiles(admin: SupabaseClient, estateId: string) {
  const [docs, items, estate] = await Promise.all([
    admin.from('documents').select('file_path').eq('estate_id', estateId),
    admin.from('items').select('image_url, extra_images').eq('estate_id', estateId),
    admin.from('estates').select('branding_logo').eq('id', estateId).maybeSingle(),
  ])
  if (docs.error) throw docs.error
  if (items.error) throw items.error
  if (estate.error) throw estate.error

  const docPaths = new Set<string>((docs.data || []).map(d => d.file_path).filter(Boolean))
  const imagePaths = new Set<string>()
  for (const it of items.data || []) {
    for (const url of [it.image_url, ...asArray(it.extra_images)]) {
      const p = imagePathFromUrl(url)
      if (p) imagePaths.add(p)
    }
  }
  const logo = imagePathFromUrl(estate.data?.branding_logo)
  if (logo) imagePaths.add(logo)
  return { docPaths, imagePaths }
}

const docsFolder = (estateId: string) => `documents/${estateId}`

// Hva som ville blitt slettet (for dry_run): bare lesing, ingen endringer
export async function countEstateFiles(admin: SupabaseClient, estateId: string) {
  const { docPaths, imagePaths } = await referencedFiles(admin, estateId)
  for (const p of await listFolder(admin, 'estate-docs', docsFolder(estateId))) docPaths.add(p)
  for (const p of await listFolder(admin, 'item-images', estateId)) imagePaths.add(p)
  return { documents: docPaths.size, images: imagePaths.size }
}

// Sletter filene og kontrollerer etterpå at boets mapper er tomme. Kaster feil hvis noe står igjen,
// slik at boet ikke slettes og kan prøves igjen neste gang.
export async function removeEstateFiles(admin: SupabaseClient, estateId: string) {
  const { docPaths, imagePaths } = await referencedFiles(admin, estateId)
  let removed = 0
  for (let pass = 1; ; pass++) {
    const docs = new Set([...docPaths, ...await listFolder(admin, 'estate-docs', docsFolder(estateId))])
    const images = new Set([...imagePaths, ...await listFolder(admin, 'item-images', estateId)])
    // Refererte filer utenfor boets mapper (eldre bilder under items/) slettes bare første runde
    docPaths.clear()
    imagePaths.clear()
    if (!docs.size && !images.size) return { removed }
    if (pass > MAX_PASSES) throw new Error(`${docs.size + images.size} filer står igjen etter ${MAX_PASSES} forsøk`)
    await removeAll(admin, 'estate-docs', [...docs])
    await removeAll(admin, 'item-images', [...images])
    removed += docs.size + images.size
  }
}

// Sletter et bo helt: filer først, så tilbakemeldinger knyttet til boet, så boet (resten går med via
// on delete cascade). Feiler et steg, står boet igjen og kan slettes ved neste kjøring.
export async function deleteEstate(admin: SupabaseClient, estateId: string) {
  const files = await removeEstateFiles(admin, estateId)
  const fb = await admin.from('feedback').delete().eq('estate_id', estateId)
  if (fb.error) throw fb.error
  const del = await admin.from('estates').delete().eq('id', estateId)
  if (del.error) throw del.error
  return files
}
