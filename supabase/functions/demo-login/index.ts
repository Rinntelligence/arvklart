// Logger inn på demokontoen uten at passordet ligger i nettleseren, og nullstiller demo-boet
// først, slik at hver besøkende starter likt.
//
// Hemmeligheter (supabase secrets set …):
//   DEMO_PASSWORD  – passordet til mona.demo@heirsplit.no. Settes på nytt ved behov, så demoen
//                    virker selv om noen har endret passordet fra en demo-økt.
//   DEMO_USER_ID   – valgfri: bruker-ID til demokontoen, brukes hvis e-posten er endret.
import { adminClient, anonClient, json, preflight } from '../_shared/http.ts'

const DEMO_EMAIL = 'mona.demo@heirsplit.no'

async function findDemoUserId(admin: ReturnType<typeof adminClient>) {
  const fixed = Deno.env.get('DEMO_USER_ID')
  if (fixed) return fixed
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const user = data.users.find(u => u.email?.toLowerCase() === DEMO_EMAIL)
    if (user) return user.id
    if (data.users.length < 1000) break
  }
  return null
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return json({ error: 'Bruk POST' }, 405)

  try {
    const password = Deno.env.get('DEMO_PASSWORD')
    if (!password) throw new Error('DEMO_PASSWORD mangler i miljøet til edge-funksjonen')

    const admin = adminClient()
    const { error: resetError } = await admin.rpc('reset_demo_estate')
    if (resetError) console.error('reset_demo_estate:', resetError.message)

    const anon = anonClient()
    let { data, error } = await anon.auth.signInWithPassword({ email: DEMO_EMAIL, password })
    if (error) {
      const userId = await findDemoUserId(admin)
      if (!userId) throw new Error('Fant ikke demokontoen')
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, { email: DEMO_EMAIL, password, email_confirm: true })
      if (updateError) throw updateError
      ;({ data, error } = await anon.auth.signInWithPassword({ email: DEMO_EMAIL, password }))
      if (error) throw error
    }

    return json({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token })
  } catch (e) {
    console.error('demo-login:', e)
    return json({ error: 'Demoen er ikke tilgjengelig akkurat nå' }, 500)
  }
})
