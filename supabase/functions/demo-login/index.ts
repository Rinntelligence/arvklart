// «Test ut demo»: nullstiller demoboet og logger inn på demokontoen Mona uten at passordet ligger i nettleseren.
// Reglene (hvilken konto, nullstilling før innlogging, bare passordet settes tilbake) står i _shared/demoLoginHandler.ts.
//
// Hemmeligheter (supabase secrets set …):
//   DEMO_PASSWORD  – passordet til demokontoen Mona. Settes på nytt ved behov, så demoen virker selv om noen har
//                    endret passordet fra en demoøkt.
//   DEMO_USER_ID   – bruker-ID-en til Mona (anbefalt). Uten den letes det etter kontoen med merket
//                    app_metadata.arvklart_demo = 'mona', og i overgangen etter den gamle e-posten.
import { adminClient, anonClient, json, preflight } from '../_shared/http.ts'
import { handleDemoLogin, LEGACY_MONA_EMAIL, type AuthUser } from '../_shared/demoLoginHandler.ts'

async function findMona(): Promise<AuthUser | null> {
  const admin = adminClient()
  const marked: AuthUser[] = []
  let legacy: AuthUser | null = null
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      if (u.app_metadata?.arvklart_demo === 'mona') marked.push(u)
      else if (u.email?.toLowerCase() === LEGACY_MONA_EMAIL) legacy = u
    }
    if (data.users.length < 1000) break
  }
  if (marked.length > 1) return null // to kontoer merket som Mona: ingen av dem brukes
  return marked[0] || legacy
}

Deno.serve(req => handleDemoLogin(req, {
  preflight,
  json,
  password: Deno.env.get('DEMO_PASSWORD'),
  demoUserId: Deno.env.get('DEMO_USER_ID'),
  getUserById: async id => {
    const { data, error } = await adminClient().auth.admin.getUserById(id)
    if (error) return null
    return data.user
  },
  findMona,
  resetDemo: async () => {
    const { error } = await adminClient().rpc('reset_demo_estate')
    return { error }
  },
  signIn: async (email, password) => {
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password })
    return error || !data.session ? null : { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
  },
  setPassword: async (userId, password) => {
    const { error } = await adminClient().auth.admin.updateUserById(userId, { password })
    return { error }
  },
  log: line => console.error(line),
}))
