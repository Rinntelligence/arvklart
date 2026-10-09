// Felles for alle edge-funksjonene: CORS, JSON-svar og innlogget bruker.
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

export const preflight = (req: Request) => (req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null)

const env = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name} mangler i miljøet til edge-funksjonen`)
  return value
}

// Demokontoene (mona/kari/lars.demo@heirsplit.no) skal ikke kunne endre noe varig eller bruke AI.
export const isDemoEmail = (email?: string | null) => /\.demo@heirsplit\.no$/i.test(email || '')

// Brukeren som eier JWT-en i Authorization-headeren, eller null. Anon-nøkkelen gir null.
export async function getUser(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return null
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await client.auth.getUser()
  return error ? null : data.user
}

export const adminClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

export const anonClient = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } })

// Klient med brukerens egen innlogging: RLS gjelder, så brukeren ser bare data i bo hen er medlem av
export const userClient = (req: Request): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false },
  })
