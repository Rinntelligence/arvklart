// Identifiserer en gjenstand fra et bilde (tittel, beskrivelse, kategori, tilstand).
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
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)

    const { imageBase64, mimeType, lang } = await req.json()
    // Tekstene skrives på brukerens språk; kategorien er alltid et av de norske navnene (lagres i databasen)
    const english = lang === 'en'
    if (typeof imageBase64 !== 'string' || !imageBase64) return json({ success: false, error: 'Mangler bilde' }, 400)
    if (imageBase64.length > MAX_BASE64_LENGTH) return json({ success: false, error: 'Bildet er for stort' }, 413)
    const mediaType = MEDIA_TYPES.includes(mimeType) ? mimeType : 'image/jpeg'

    const { denied, quota } = await claimAiCall(req, user, 'analyze-item')
    if (denied) return denied

    const message = await anthropic().messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType as 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `Du er en arveboassistent. Se på bildet og svar KUN med gyldig JSON, ingen annen tekst.

Gi en kort, enkel beskrivelse av gjenstanden på ${english ? 'engelsk' : 'norsk'}. Vær konkret og presis, ikke bruk fluff.

Kategorier å velge fra: ${CATEGORIES.join(', ')}

Svar KUN med denne JSON-strukturen:
{
  "title": "${english ? "Kort engelsk tittel, f.eks. 'Oak rocking chair' eller 'Samsung 55-inch TV'" : "Kort norsk tittel, f.eks. 'Gyngestol i eik' eller 'Samsung TV 55-tommer'"}",
  "description": "1-2 setninger på ${english ? 'engelsk' : 'norsk'}: materiale, farge, stand, alder hvis synlig. Enkelt språk.",
  "category": "En av kategoriene over, skrevet nøyaktig som i listen (på norsk)",
  "condition": "excellent, good, fair eller poor",
  "confidence": "high, medium eller low"
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
