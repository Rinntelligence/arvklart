// Identifiserer en gjenstand fra et bilde (tittel, beskrivelse, kategori, tilstand).
// Krever innlogget bruker, slik at funksjonen ikke kan brukes som gratis AI-proxy.
import { getUser, isDemoEmail, json, preflight } from '../_shared/http.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

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
    if (isDemoEmail(user.email)) return json({ success: false, error: 'Ikke tilgjengelig i demoen' }, 403)

    const { imageBase64, mimeType } = await req.json()
    if (typeof imageBase64 !== 'string' || !imageBase64) return json({ success: false, error: 'Mangler bilde' }, 400)
    if (imageBase64.length > MAX_BASE64_LENGTH) return json({ success: false, error: 'Bildet er for stort' }, 413)
    const mediaType = MEDIA_TYPES.includes(mimeType) ? mimeType : 'image/jpeg'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 }
            },
            {
              type: 'text',
              text: `Du er en arveboassistent. Se på bildet og svar KUN med gyldig JSON, ingen annen tekst.

Gi en kort, enkel norsk beskrivelse av gjenstanden. Vær konkret og presis, ikke bruk fluff.

Kategorier å velge fra: ${CATEGORIES.join(', ')}

Svar KUN med denne JSON-strukturen:
{
  "title": "Kort norsk tittel, f.eks. 'Gyngestol i eik' eller 'Samsung TV 55-tommer'",
  "description": "1-2 setninger på norsk: materiale, farge, stand, alder hvis synlig. Enkelt språk.",
  "category": "En av kategoriene over",
  "condition": "excellent, good, fair eller poor",
  "confidence": "high, medium eller low"
}`
            }
          ]
        }]
      })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data?.error?.message || `Anthropic svarte ${response.status}`)
    const text = data.content?.find((c: { type: string }) => c.type === 'text')?.text || ''

    // Parse JSON from Claude's response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const result = JSON.parse(jsonMatch[0])

    return json({ success: true, data: result })
  } catch (error) {
    console.error('analyze-item:', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
