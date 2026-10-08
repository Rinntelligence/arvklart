// Felles for AI-funksjonene: Claude Haiku via Anthropics SDK, og bruksgrensen i claim_ai_call().
import Anthropic from 'npm:@anthropic-ai/sdk@^0.131.0'
import type { User } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, isDemoEmail, json } from './http.ts'

export const MODEL = 'claude-haiku-4-5'

let client: Anthropic | null = null
export const anthropic = () => (client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') }))

// All tekst i svaret (Haiku svarer med tekstblokker; ingen thinking er slått på)
export const textOf = (message: Anthropic.Message) =>
  message.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')

// Henter det første JSON-objektet i et tekstsvar
export function parseJsonReply(message: Anthropic.Message) {
  const match = textOf(message).match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI-en svarte ikke med JSON')
  return JSON.parse(match[0])
}

// session_id fra innloggingen (JWT). Demoen teller per økt, så hver besøkende får sine egne forsøk.
function sessionId(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || ''
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch {
    return null
  }
}

type Quota = { ok: boolean; reason?: 'demo_limit' | 'rate_limit'; remaining?: number }

// Registrerer ett AI-kall. Returnerer et ferdig 429-svar når grensen er nådd, ellers info om kvoten.
export async function claimAiCall(req: Request, user: User, fn: string): Promise<{ denied: Response | null; quota: Quota }> {
  const isDemo = isDemoEmail(user.email)
  const { data, error } = await adminClient().rpc('claim_ai_call', {
    p_user_id: user.id, p_session_id: sessionId(req), p_fn: fn, p_is_demo: isDemo,
  })
  if (error) throw error
  const quota = data as Quota
  if (quota.ok) return { denied: null, quota }
  const message = quota.reason === 'demo_limit'
    ? 'Dette er en demo. Du må opprette et arveoppgjør i Arvklart for å bruke denne funksjonen.'
    : 'Du har brukt AI-funksjonene mye den siste tiden. Prøv igjen senere.'
  return { denied: json({ success: false, code: quota.reason, error: message }, 429), quota }
}

// Feil fra Anthropic gjøres om til et svar appen kan vise
export function aiErrorResponse(error: unknown, fn: string) {
  console.error(`${fn}:`, error)
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return json({ success: false, code: 'ai_busy', error: 'AI-tjenesten er opptatt akkurat nå. Prøv igjen om litt.' }, 503)
  }
  if (error instanceof Anthropic.APIError) {
    return json({ success: false, code: 'ai_error', error: `AI-tjenesten svarte med feil (${error.status})` }, 502)
  }
  return json({ success: false, code: 'error', error: error instanceof Error ? error.message : String(error) }, 500)
}
