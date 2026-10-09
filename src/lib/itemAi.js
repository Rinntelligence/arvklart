// AI-hjelp for å legge til gjenstander: kall til edge-funksjonene, bilder til AI og kategorimatching.
import { supabase } from './supabase'
import { downscaleImage, fileToBase64 } from './images'
import { isEn, L } from './lang'

export { addCapturedPhotos, estimateApplies, matchCategory, mergeSelectedPhotos, removePhotoAt, restoreRemoved, runPool, splitDraft } from './itemAiHelpers.js'

// Kalles med brukerens innlogging; edge-funksjonene avviser anonyme kall og teller AI-bruken.
// Feil får med koden fra funksjonen (demo_limit, rate_limit, ai_busy, ai_refused, ai_timeout, ai_invalid, ai_unavailable …).
export async function callEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return data
  let details = null
  try { details = await error.context?.json() } catch { /* ikke JSON */ }
  const err = new Error(details?.error || error.message)
  err.code = details?.code
  throw err
}

// Forståelig melding på brukerens språk ut fra feilkoden fra edge-funksjonene (serverens tekst er norsk)
export function aiErrorMessage(code) {
  switch (code) {
    case 'rate_limit': return L('Du har brukt AI-hjelpen mye den siste tiden. Prøv igjen om en stund – du kan fylle inn selv i mellomtiden.', 'You have used the AI help a lot recently. Try again in a while – you can fill in the details yourself meanwhile.')
    case 'ai_busy': return L('AI-tjenesten er opptatt akkurat nå. Prøv igjen om litt.', 'The AI service is busy right now. Please try again shortly.')
    case 'demo_limit': return L('Du har brukt opp AI-forsøkene i demoen.', 'You have used up the AI attempts in the demo.')
    case 'ai_refused': return L('AI-en kunne ikke vurdere dette. Fyll inn selv.', 'The AI could not assess this. Please fill in the details yourself.')
    case 'ai_timeout': return L('AI-en brukte for lang tid. Prøv igjen.', 'The AI took too long. Please try again.')
    case 'ai_invalid': return L('AI-en ga et svar vi ikke kunne bruke. Prøv igjen, eller fyll inn selv.', 'The AI gave an answer we could not use. Try again, or fill in the details yourself.')
    case 'ai_unavailable': return L('AI-hjelpen er ikke tilgjengelig akkurat nå. Du kan fylle inn selv.', 'The AI help is not available right now. You can fill in the details yourself.')
    default: return L('AI-en klarte ikke dette nå. Prøv igjen, eller fyll inn selv.', 'The AI could not do this right now. Try again, or fill in the details yourself.')
  }
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

// Grovt verdianslag ut fra teksten (navn, beskrivelse, kategori, tilstand): ett AI-kall, ingen bilder.
// Markedet er alltid Norge (NOK). Brukes når brukeren selv ber om det.
export async function requestValueEstimate({ title, description = '', category = '', condition = '' }) {
  const res = await callEdgeFunction('estimate-value', { title, description, category, condition, lang: isEn() ? 'en' : 'no' })
  const d = res?.data || res || {}
  const s = d.summary || d
  const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null)
  return {
    estimate: {
      likely: num(s.likely_nok), low: num(s.low_nok), high: num(s.high_nok),
      reasoning: d.market?.reasoning ?? d.reasoning ?? null,
      confidence: d.market?.confidence ?? d.confidence ?? null,
    },
    quota: res?.quota,
  }
}
