// Demokontoenes identitet (se supabase/migrations/20261109_demo_identity.sql). Kjøres bare med godkjenning.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/demo-identity.mjs [--apply-mark | --apply-email | --apply-lock]
//
// Uten flagg: tørrkjøring. Viser de tre demokontoene (id, e-post, merke) og hva som ville blitt gjort. Endrer ingenting.
//
//   --apply-mark   Steg 1: setter app_metadata.arvklart_demo = 'mona' | 'kari' | 'lars' med Auth Admin API
//                  (updateUserById). Eksisterende app_metadata beholdes (provider osv.). Kontrolleres etterpå med
//                  getUserById. Kjøres FØR migreringen; ingenting leser merket før den er kjørt.
//   --apply-email  Steg 5: bytter e-posten til <rolle>.demo@arvklart.no med email_confirm: true (ingen e-post sendes,
//                  ingen innboks trengs), og oppdaterer profiles.email og demoboets heirs.email. Krever at alle tre er
//                  merket og at migreringen og den nye demo-login er ute. Byttes aldri tilbake til heirsplit.no.
//   --apply-lock   Valgfritt: stenger innlogging for Kari og Lars (ban, ingen innlogging og ingen fornyelse av
//                  økter). De logger aldri inn; nullstillingen og visningen av dem påvirkes ikke. Mona stenges aldri.
//
// Finner kontoene etter merket, ellers etter de gamle eller nye e-postene. Stopper hvis noe er tvetydig (to kontoer
// for samme rolle, eller en konto merket med en annen rolle). Skriver aldri ut nøkkelen.
import { createClient } from '@supabase/supabase-js'

const DEMO_ESTATE = 'deed0001-0000-0000-0000-000000000001'
const ROLES = ['mona', 'kari', 'lars']
const OLD = role => `${role}.demo@heirsplit.no`
const NEW = role => `${role}.demo@arvklart.no`
const mode = ['--apply-mark', '--apply-email', '--apply-lock'].find(f => process.argv.includes(f)) || null

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må være satt'); process.exit(1) }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const stop = msg => { console.error(`STOPP: ${msg}`); process.exit(1) }

// Alle kontoer som kan være en demokonto: merket, eller med en av de gamle/nye e-postene
const candidates = []
for (let page = 1; page <= 50; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) stop(`kunne ikke liste brukerne: ${error.message}`)
  for (const u of data.users) {
    const email = (u.email || '').toLowerCase()
    if (u.app_metadata?.arvklart_demo || ROLES.some(r => email === OLD(r) || email === NEW(r))) candidates.push(u)
  }
  if (data.users.length < 1000) break
}

const accounts = {}
for (const role of ROLES) {
  const marked = candidates.filter(u => u.app_metadata?.arvklart_demo === role)
  const byEmail = candidates.filter(u => [OLD(role), NEW(role)].includes((u.email || '').toLowerCase()))
  if (marked.length > 1) stop(`${marked.length} kontoer er merket som ${role}`)
  if (byEmail.length > 1) stop(`${byEmail.length} kontoer har e-posten til ${role} (gammel og ny?)`)
  const user = marked[0] || byEmail[0]
  if (!user) stop(`fant ikke demokontoen ${role}`)
  if (user.app_metadata?.arvklart_demo && user.app_metadata.arvklart_demo !== role) stop(`kontoen med e-posten til ${role} er merket ${user.app_metadata.arvklart_demo}`)
  if (marked[0] && byEmail[0] && marked[0].id !== byEmail[0].id) stop(`merket ${role} og e-posten til ${role} er to forskjellige kontoer`)
  accounts[role] = user
}
const others = candidates.filter(u => u.app_metadata?.arvklart_demo && !ROLES.includes(u.app_metadata.arvklart_demo))
if (others.length) stop(`${others.length} konto(er) har et ukjent demomerke`)

const show = () => ROLES.map(r => ({ rolle: r, id: accounts[r].id, epost: accounts[r].email, merke: accounts[r].app_metadata?.arvklart_demo || null, stengt: !!accounts[r].banned_until }))
console.log(JSON.stringify({ modus: mode || 'tørrkjøring', kontoer: show() }, null, 2))

async function verify(role, check, what) {
  const { data, error } = await admin.auth.admin.getUserById(accounts[role].id)
  if (error || !check(data.user)) stop(`kontrollen etter ${what} feilet for ${role}`)
  accounts[role] = data.user
}

if (!mode) {
  for (const r of ROLES) {
    const u = accounts[r]
    console.log(`${r}: ${u.app_metadata?.arvklart_demo ? 'merket' : 'ville blitt merket'}; e-post ${u.email} ${u.email?.toLowerCase() === NEW(r) ? '(ny)' : `→ ville blitt ${NEW(r)} i steg 5`}`)
  }
  console.log('Ingenting er endret. Bruk --apply-mark, --apply-email eller --apply-lock (hver krever godkjenning).')
  process.exit(0)
}

if (mode === '--apply-mark') {
  for (const r of ROLES) {
    const u = accounts[r]
    if (u.app_metadata?.arvklart_demo === r) { console.log(`${r}: allerede merket`); continue }
    const { error } = await admin.auth.admin.updateUserById(u.id, { app_metadata: { ...(u.app_metadata || {}), arvklart_demo: r } })
    if (error) stop(`kunne ikke merke ${r}: ${error.message}`)
    const before = { ...(u.app_metadata || {}) }
    await verify(r, x => x.app_metadata?.arvklart_demo === r && Object.entries(before).every(([k, v]) => JSON.stringify(x.app_metadata[k]) === JSON.stringify(v)), 'merkingen')
    console.log(`${r}: merket (øvrig app_metadata uendret)`)
  }
}

if (mode === '--apply-email') {
  for (const r of ROLES) if (accounts[r].app_metadata?.arvklart_demo !== r) stop(`${r} er ikke merket; kjør --apply-mark og migreringen først`)
  for (const r of ROLES) {
    const u = accounts[r]
    const target = NEW(r)
    if ((u.email || '').toLowerCase() !== target) {
      const { error } = await admin.auth.admin.updateUserById(u.id, { email: target, email_confirm: true })
      if (error) stop(`kunne ikke bytte e-posten til ${r}: ${error.message}`)
      await verify(r, x => (x.email || '').toLowerCase() === target && !!x.email_confirmed_at, 'e-postbyttet')
    }
    const p = await admin.from('profiles').update({ email: target }).eq('user_id', u.id).select('user_id')
    if (p.error) stop(`kunne ikke oppdatere profilen til ${r}: ${p.error.message}`)
    const h = await admin.from('heirs').update({ email: target }).eq('estate_id', DEMO_ESTATE).eq('user_id', u.id).select('id')
    if (h.error) stop(`kunne ikke oppdatere ${r} på demoboets liste: ${h.error.message}`)
    if (h.data.length !== 1) stop(`${r} står ${h.data.length} ganger på demoboets liste, ventet 1`)
    console.log(`${r}: e-post ${target}, profil og person på listen oppdatert`)
  }
}

if (mode === '--apply-lock') {
  for (const r of ['kari', 'lars']) {
    const { error } = await admin.auth.admin.updateUserById(accounts[r].id, { ban_duration: '876000h' })
    if (error) stop(`kunne ikke stenge innloggingen til ${r}: ${error.message}`)
    await verify(r, x => !!x.banned_until, 'stengingen')
    console.log(`${r}: innlogging stengt`)
  }
}

console.log(JSON.stringify({ etter: show() }, null, 2))
