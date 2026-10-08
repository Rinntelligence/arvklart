// AI-hjelp for å legge til gjenstander: kall til edge-funksjonene, bilder til AI og kategorimatching.
import { supabase } from './supabase'
import { downscaleImage, fileToBase64 } from './images'
import { isEn } from './lang'

export { matchCategory, runPool } from './itemAiHelpers.js'

// Kalles med brukerens innlogging; edge-funksjonene avviser anonyme kall og teller AI-bruken.
// Feil får med koden fra funksjonen (demo_limit, rate_limit, ai_busy …).
export async function callEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  let details = null
  try { details = await error.context?.json() } catch { /* ikke JSON */ }
  const err = new Error(details?.error || error.message)
  err.code = details?.code
  throw err
}

export const MAX_AI_IMAGES = 3

// Identifiserer gjenstanden fra opptil tre bilder. Med estimate: true kommer også verdiestimat i samme kall
// (ett AI-kall per gjenstand). Forminsket JPEG: mobilbilder er ofte over grensen på 5 MB, og HEIC støttes ikke.
export async function analyzeItemPhotos(files, { categories = [], estimate = false } = {}) {
  const images = await Promise.all(files.slice(0, MAX_AI_IMAGES).map(async (file) => {
    const image = await downscaleImage(file, 1568)
    return { data: await fileToBase64(image), mimeType: image.type || 'image/jpeg' }
  }))
  const res = await callEdgeFunction('analyze-item', {
    images,
    // Eldre versjoner av funksjonen leser bare ett bilde
    imageBase64: images[0].data,
    mimeType: images[0].mimeType,
    categories: categories.map(c => c.label),
    estimate,
    lang: isEn() ? 'en' : 'no',
  })
  return { result: res?.data || res, quota: res?.quota }
}
