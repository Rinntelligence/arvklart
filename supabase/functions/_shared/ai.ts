// Felles for AI-funksjonene: kallet mot Claude (Haiku 5.5 som standard), bruksgrensen i claim_ai_call(),
// måling av hvert kall og faste feilkoder. Logikken som kan testes uten nettverk ligger i aiCore.ts.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import type { User } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, isDemoEmail, json } from './http.ts'
import {
  AiError, ERROR_STATUS, ERROR_TEXT, OUTCOME, buildParams, estimateCostUsd, interpretReply, nextAttempt, resolveModel,
  type AiErrorCode, type Effort, type Model, type Schema, type Usage, type Validation,
} from './aiCore.ts'

const TIMEOUT_MS = 45_000

let client: Anthropic | null = null
// SDK-en prøver 429/5xx/529 og tidsavbrudd én gang til med pause, ikke mer
const anthropic = () => (client ??= new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY'), timeout: TIMEOUT_MS, maxRetries: 1 }))

export const aiConfigured = () => !!Deno.env.get('ANTHROPIC_API_KEY')

export function currentModel(): Model {
  const { model, warning } = resolveModel(Deno.env.get('AI_MODEL'))
  if (warning) console.warn(warning)
  return model
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

type Quota = { ok: boolean; reason?: 'demo_limit' | 'rate_limit' | 'estate_limit' | 'not_member'; remaining?: number }

// Registrerer ett AI-kall. Returnerer et ferdig 429-svar når grensen er nådd, ellers kvoten (til klienten)
// og usage_id (raden målingene skrives til; mangler før 20261011_ai_usage_metrics.sql er kjørt).
const DENIED: Record<string, { status: number; message: string }> = {
  demo_limit: { status: 429, message: 'Dette er en demo. Du må opprette et arveoppgjør i Arvklart for å bruke denne funksjonen.' },
  rate_limit: { status: 429, message: 'Du har brukt AI-funksjonene mye den siste tiden. Prøv igjen senere.' },
  estate_limit: { status: 429, message: 'Dette boet har brukt opp AI-kvoten for de siste 30 dagene.' },
  not_member: { status: 403, message: 'Du er ikke medlem av dette boet.' },
}

// estateId: boet kallet gjelder (teller mot boets grense; brukeren må være medlem). null for eldre klienter.
export async function claimAiCall(req: Request, user: User, fn: string, estateId: string | null = null): Promise<{ denied: Response | null; quota: Quota; usageId: number | null }> {
  const isDemo = isDemoEmail(user.email)
  const { data, error } = await adminClient().rpc('claim_ai_call', {
    p_user_id: user.id, p_session_id: sessionId(req), p_fn: fn, p_is_demo: isDemo, ...(estateId ? { p_estate_id: estateId } : {}),
  })
  if (error) throw error
  const { usage_id, ...quota } = data as Quota & { usage_id?: number }
  if (quota.ok) return { denied: null, quota, usageId: usage_id ?? null }
  const d = DENIED[quota.reason || ''] || DENIED.rate_limit
  return { denied: json({ success: false, code: quota.reason, error: d.message }, d.status), quota, usageId: null }
}

// Feil fra SDK-en gjøres om til faste koder
function toAiError(error: unknown): AiError | null {
  if (error instanceof AiError) return error
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new AiError('ai_timeout')
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return new AiError('ai_busy', String(error.status))
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new AiError('ai_unavailable', String(error.status))
  if (error instanceof Anthropic.APIConnectionError) return new AiError('ai_busy', 'connection')
  if (error instanceof Anthropic.APIError) return new AiError(error.status === 529 ? 'ai_busy' : 'ai_error', String(error.status))
  return null
}

type Metrics = {
  fn: string; model: Model; attempts: number; latency_ms: number; outcome: string; image_count: number; schema_version: number | null
  input_tokens: number; output_tokens: number; cache_read_tokens: number; cost_usd: number; detail?: string
}

// Målingene logges alltid (uten innhold) og lagres på ai_usage-raden når den finnes.
async function finishAiCall(usageId: number | null, m: Metrics) {
  console.log(JSON.stringify({ ai_call: m }))
  if (usageId == null) return
  const { detail: _detail, fn: _fn, ...row } = m
  const { error } = await adminClient().from('ai_usage').update(row).eq('id', usageId)
  if (error) console.warn('ai_usage: kunne ikke lagre målingene', error.message)
}

// Ett strukturert kall: JSON etter skjemaet, validert. Høyst ett nytt forsøk (avkuttet eller ugyldig svar);
// avslag gir ai_refused uten nytt forsøk.
export async function callStructured<T>(p: {
  fn: string; usageId: number | null; system: string; content: Anthropic.ContentBlockParam[] | string; schema: Schema
  validate: (v: unknown) => Validation<T>; maxTokens: number; effort: Effort; imageCount?: number; schemaVersion?: number; cacheSystem?: boolean
}): Promise<T> {
  const model = currentModel()
  const started = Date.now()
  const usage: Required<{ [K in keyof Usage]: number }> = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  let attempts = 0, maxTokens = p.maxTokens, outcome = 'error', detail = ''
  try {
    while (true) {
      attempts++
      const message = await anthropic().messages.create(
        buildParams({ model, system: p.system, content: p.content, schema: p.schema, maxTokens, effort: p.effort, cacheSystem: p.cacheSystem }) as unknown as Anthropic.MessageCreateParamsNonStreaming,
      )
      for (const k of Object.keys(usage) as (keyof typeof usage)[]) usage[k] += (message.usage as Usage)?.[k] || 0
      const reply = interpretReply(message as unknown as Parameters<typeof interpretReply>[0], p.validate)
      if (reply.kind === 'ok') { outcome = 'ok'; return reply.value }
      if (reply.kind === 'refused') throw new AiError('ai_refused', reply.category || '')
      detail = reply.kind === 'invalid' ? reply.reason : 'avkuttet svar'
      const next = nextAttempt(reply, attempts, maxTokens)
      if (!next.retry) throw new AiError('ai_invalid', detail)
      maxTokens = next.maxTokens
    }
  } catch (error) {
    const e = toAiError(error)
    outcome = e ? OUTCOME[e.code] : 'error'
    if (e) detail = e.message
    throw e ?? error
  } finally {
    await finishAiCall(p.usageId, {
      fn: p.fn, model, attempts, latency_ms: Date.now() - started, outcome, image_count: p.imageCount ?? 0, schema_version: p.schemaVersion ?? null,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cache_read_tokens: usage.cache_read_input_tokens,
      cost_usd: estimateCostUsd(model, usage), detail: outcome === 'ok' ? undefined : detail,
    })
  }
}

export const aiErrorJson = (code: AiErrorCode | 'error') =>
  json({ success: false, code, error: ERROR_TEXT[code] }, ERROR_STATUS[code])

// Alle feil får en fast kode og en generisk tekst; detaljene står bare i loggen
export function aiErrorResponse(error: unknown, fn: string) {
  const e = toAiError(error)
  console.error(`${fn}:`, e?.message ?? error)
  return aiErrorJson(e?.code ?? 'error')
}
