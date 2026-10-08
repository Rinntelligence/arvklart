// Identifiserer en gjenstand fra ett til tre bilder (tittel, beskrivelse, kategori, tilstand).
// Med estimate: true anslås også verdien i samme kall, så «Legg til flere» bruker ett AI-kall per gjenstand.
// Krever innlogget bruker og teller mot AI-kvoten (demoen: 5 forsøk per besøk). Bruker Claude Haiku.
import { getUser, json, preflight } from '../_shared/http.ts'
import { MODEL, aiErrorResponse, anthropic, claimAiCall, parseJsonReply } from '../_shared/ai.ts'

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

    const body = await req.json()
    // Tekstene skrives på brukerens språk; kategorien er alltid et av boets kategorinavn (lagres i databasen)
    const english = body.lang === 'en'
    const estimate = body.estimate === true
    const images = readImages(body)
    if (typeof images === 'string') return json({ success: false, error: images }, images === 'Mangler bilde' ? 400 : 413)
    const categories = readCategories(body.categories)

    const { denied, quota } = await claimAiCall(req, user, 'analyze-item')
    if (denied) return denied

    const message = await anthropic().messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            ...images.map(img => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.data }
            })),
            {
              type: 'text',
              text: `Du er en arveboassistent. ${images.length > 1 ? 'Bildene viser samme gjenstand fra ulike vinkler.' : 'Se på bildet.'} Svar KUN med gyldig JSON, ingen annen tekst.

Gi en kort, enkel beskrivelse av gjenstanden på ${english ? 'engelsk' : 'norsk'}. Vær konkret og presis, ikke bruk fluff.

Kategorier å velge fra: ${categories.join(', ')}

Svar KUN med denne JSON-strukturen:
{
  "title": "${english ? "Kort engelsk tittel, f.eks. 'Oak rocking chair' eller 'Samsung 55-inch TV'" : "Kort norsk tittel, f.eks. 'Gyngestol i eik' eller 'Samsung TV 55-tommer'"}",
  "description": "1-2 setninger på ${english ? 'engelsk' : 'norsk'}: materiale, farge, stand, alder hvis synlig. Enkelt språk.",
  "category": "En av kategoriene over, skrevet nøyaktig som i listen (på norsk)",
  "condition": "excellent, good, fair eller poor",
  "confidence": "high, medium eller low"${estimate ? `,
  "low_nok": <tall: lav markedsverdi i NOK brukt i Norge i dag, f.eks. på finn.no>,
  "likely_nok": <tall: mest sannsynlig markedsverdi i NOK>,
  "high_nok": <tall: høy markedsverdi i NOK>,
  "value_reasoning": "1 setning på ${english ? 'engelsk' : 'norsk'} om hva verdien bygger på"` : ''}
}`
            }
          ]
        }]
    })

    return json({ success: true, data: parseJsonReply(message), quota })
  } catch (error) {
    return aiErrorResponse(error, 'analyze-item')
  }
})
