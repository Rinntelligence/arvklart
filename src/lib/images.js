// Bilder av gjenstander: forminsking før opplasting/AI og opprydding når bilder fjernes.
import { supabase } from './supabase'

const BUCKET = 'item-images'
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`

// Mobilbilder er ofte 5–15 MB (og noen ganger HEIC). Lagres som JPEG med lengste side 2000 px,
// som holder godt for visning og er under grensen for AI-analysen.
export async function downscaleImage(file, maxSide = 2000, quality = 0.85) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file // nettleseren kan ikke lese formatet; last opp originalen
  }
}

export const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = ev => resolve(ev.target.result.split(',')[1])
  reader.onerror = reject
  reader.readAsDataURL(file)
})

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = ev => resolve(ev.target.result)
  reader.onerror = reject
  reader.readAsDataURL(file)
})

// Laster opp under boets mappe (kreves av tilgangsreglene i Storage) og returnerer offentlig URL.
export async function uploadEstateImage(file, estateId, prefix = 'item') {
  const scaled = await downscaleImage(file)
  const ext = scaled.type === 'image/jpeg' ? 'jpg' : (scaled.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${estateId}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, scaled, { contentType: scaled.type })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

const pathFromUrl = (url) => {
  const i = url?.indexOf(PUBLIC_MARKER) ?? -1
  return i === -1 ? null : decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split('?')[0])
}

// Sletter bildefilene bak URL-ene. Eldre filer utenfor boets mappe kan bare slettes av
// tjenesten selv; de hoppes over stille.
export async function removeImages(urls) {
  const paths = urls.map(pathFromUrl).filter(Boolean)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

// extra_images kan komme som JSON-tekst fra eldre rader.
export const parseImageList = (value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
  }
  return []
}

export const itemImageUrls = (item) => [item?.image_url, ...parseImageList(item?.extra_images)].filter(Boolean)
