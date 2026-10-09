// Identifiserer en gjenstand fra ett til tre bilder. Ett AI-kall per gjenstand, med strukturert svar
// (JSON-skjema, _shared/analysis.ts) som valideres før det sendes videre. Svaret har feltene appen har brukt
// hittil (title, description, category, condition, confidence) og hele vurderingen i «analysis»
// (identifikasjon sett/sannsynlig/ukjent, merker, tilstand, flere gjenstander, bildeforslag), som appen
// lagrer i items.ai_analysis. AI-en lagrer aldri noe selv.
// Krever innlogget bruker og teller mot AI-kvoten (demoen: 5 forsøk per besøk). Modell: se _shared/ai.ts.
import { getUser, json, preflight } from '../_shared/http.ts'
import { aiConfigured, aiErrorJson, aiErrorResponse, callStructured, claimAiCall, currentModel } from '../_shared/ai.ts'
import { ANALYSIS_SCHEMA, ANALYSIS_VERSION, PROMPT_VERSION, analysisSystem, legacyFields, normalizeAnalysis } from '../_shared/analysis.ts'
import { analyzeEffort, readEstateId } from '../_shared/aiCore.ts'

const CATEGORIES = [
  'Møbler', 'Kunst og bilder', 'Bøker', 'Kjøkken',
  'Dekorasjoner', 'Elektronikk', 'Klær og tekstiler',
  'Smykker', 'Verktøy', 'Sportsutstyr', 'Samleobjekter', 'Kjøretøy', 'Dokumenter', 'Annet'
]

// Anthropic tar imot bilder opp til 5 MB; base64 er ca. 4/3 av filstørrelsen.
const MAX_BASE64_LENGTH = 6_900_000
const MAX_IMAGES = 3
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

type ImageInput = { data: string; mediaType: string }

// images: [{ data, mimeType }]; eldre klienter sender ett bilde som imageBase64/mimeType
function readImages(body: Record<string, unknown>): ImageInput[] | string {
  const raw = Array.isArray(body.images) && body.images.length
    ? body.images.slice(0, MAX_IMAGES)
    : [{ data: body.imageBase64, mimeType: body.mimeType }]
  const images: ImageInput[] = []
  for (const img of raw as { data?: unknown; mimeType?: unknown }[]) {
    if (typeof img?.data !== 'string' || !img.data) return 'Mangler bilde'
    if (img.data.length > MAX_BASE64_LENGTH) return 'Bildet er for stort'
    images.push({ data: img.data, mediaType: MEDIA_TYPES.includes(img.mimeType as string) ? img.mimeType as string : 'image/jpeg' })
  }
  return images
}

// Boets egne kategorier (kan være omdøpt eller lagt til); ellers standardlisten
function readCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return CATEGORIES
  const labels = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 60).slice(0, 40)
  return labels.length ? labels : CATEGORIES
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)
    if (!aiConfigured()) return aiErrorJson('ai_unavailable')

    const body = await req.json()
    // Tekstene skrives på brukerens språk; kategorien er alltid et av boets kategorinavn (lagres i databasen)
    const english = body.lang === 'en'
    const images = readImages(body)
    if (typeof images === 'string') return json({ success: false, error: images }, images === 'Mangler bilde' ? 400 : 413)
    const categories = readCategories(body.categories)

    const { denied, quota, usageId } = await claimAiCall(req, user, 'analyze-item', readEstateId(body.estate_id))
    if (denied) return denied

    const ai = await callStructured({
      fn: 'analyze-item', usageId, effort: analyzeEffort(Deno.env.get('ANALYZE_EFFORT')), cacheSystem: true, maxTokens: 6000, imageCount: images.length, schemaVersion: ANALYSIS_VERSION,
      system: analysisSystem(english),
      schema: ANALYSIS_SCHEMA,
      validate: normalizeAnalysis(categories),
      content: [
        ...images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.data },
        })),
        {
          type: 'text' as const,
          text: `${images.length > 1 ? `De ${images.length} bildene viser samme gjenstand fra ulike vinkler.` : 'Se på bildet.'}

- suggestion.title: kort tittel, f.eks. ${english ? "'Oak rocking chair' eller 'Figgjo Lotte plate'" : "'Gyngestol i eik' eller 'Figgjo Lotte tallerken'"}
- suggestion.description: 1–2 setninger: materiale, farge, stand og alder hvis det synes. Enkelt språk.
- suggestion.category: én av disse, skrevet nøyaktig som i listen, eller tom tekst hvis ingen passer: ${categories.join(', ')}
- suggestion.category_key: den generelle typen gjenstand
- suggestion.confidence: hvor sikker du er på hva gjenstanden er`,
        },
      ],
    })

    const analysis = {
      v: ANALYSIS_VERSION,
      meta: { model: currentModel(), prompt_version: PROMPT_VERSION, analyzed_at: new Date().toISOString(), image_count: images.length, lang: english ? 'en' : 'no' },
      ai,
    }
    return json({ success: true, data: { ...legacyFields(ai), analysis }, quota })
  } catch (error) {
    return aiErrorResponse(error, 'analyze-item')
  }
})
