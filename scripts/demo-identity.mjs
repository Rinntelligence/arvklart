// Demokontoenes identitet (se supabase/migrations/20261109_demo_identity.sql). Kjøres bare med godkjenning.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/demo-identity.mjs --project=<ref> [flagg]
//
// --project=<ref> er påkrevd: skriptet stopper hvis SUPABASE_URL ikke er https://<ref>.supabase.co, så det aldri
// kjøres mot et annet prosjekt enn det du har bestemt (produksjon: swmuztsejghweqmaogol).
//
// Uten flagg: tørrkjøring. Viser de tre demokontoene (id, e-post, merke, stengt) og hva som ville blitt gjort.
// Endrer ingenting. Id-ene herfra brukes i --expect-ids etter at du har kontrollert dem.
//
//   --apply-mark --expect-ids=kari:<id>,lars:<id>,mona:<id>
//                  Fase 1: setter app_metadata.arvklart_demo = 'mona' | 'kari' | 'lars' med Auth Admin API
//                  (updateUserById). Eksisterende app_metadata beholdes (provider osv.). Merker bare id-ene du har
//                  bekreftet, bare kontoer med en kjent demoadresse, og bare kontoer som ikke er medlem eller eier i
//                  noe annet bo enn demoboet. Kontrolleres etterpå med getUserById. Kjøres FØR migreringen.
//   --remove-mark  Tilbakerulling av fase 1: fjerner merket og beholder resten av app_metadata. Bare før migreringen
//                  (etter den stopper nullstillingen, og demoen er utilgjengelig, til merket settes igjen).
//   --apply-email  Fase 5: bytter e-posten til <rolle>.demo@arvklart.no med email_confirm: true (ingen e-post sendes,
//                  ingen innboks trengs), og oppdaterer profiles.email og demoboets heirs.email. Krever at alle tre er
//                  merket og at migreringen, edge-funksjonene og frontend er ute. Byttes aldri tilbake til heirsplit.no.
//   --apply-lock   Fase 1: stenger innlogging for Kari og Lars (ban): ingen ny innlogging og ingen fornyelse av
//                  eksisterende økter. Allerede utstedte tilgangstoken gjelder til de utløper (vanligvis 1 t). De logger
//                  aldri inn; nullstillingen og visningen av dem påvirkes ikke. Mona stenges aldri.
//   --remove-lock  Tilbakerulling: opphever stengingen for Kari og Lars.
//
// Finner kontoene etter merket, ellers etter de gamle eller nye e-postene. Stopper hvis noe er tvetydig (to kontoer
// for samme rolle, eller en konto merket med en annen rolle). Skriver aldri ut nøkkelen.
import { createClient } from '@supabase/supabase-js'

const DEMO_ESTATE = 'deed0001-0000-0000-0000-000000000001'
const ROLES = ['mona', 'kari', 'lars']
const OLD = role => `${role}.demo@heirsplit.no`
const NEW = role => `${role}.demo@arvklart.no`
const MODES = ['--apply-mark', '--remove-mark', '--apply-email', '--apply-lock', '--remove-lock']
const modes = MODES.filter(f => process.argv.includes(f))
if (modes.length > 1) { console.error(`Bare ett flagg om gangen: ${modes.join(', ')}`); process.exit(1) }
const mode = modes[0] || null
// --expect-ids=kari:<id>,lars:<id>,mona:<id>: id-ene du har kontrollert i tørrkjøringen
const expectArg = (process.argv.find(a => a.startsWith('--expect-ids=')) || '').slice('--expect-ids='.length)
const expected = Object.fromEntries(expectArg.split(',').filter(Boolean).map(p => p.split(':').map(x => x.trim())))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må være satt'); process.exit(1) }
const projectArg = (process.argv.find(a => a.startsWith('--project=')) || '').slice('--project='.length)
const host = (() => { try { return new URL(url).hostname } catch { return '' } })()
if (!projectArg) { console.error('STOPP: --project=<ref> mangler (produksjon: --project=swmuztsejghweqmaogol)'); process.exit(1) }
if (host.split('.')[0] !== projectArg) { console.error(`STOPP: SUPABASE_URL peker på ${host}, ikke prosjektet ${projectArg}`); process.exit(1) }
console.log(`Prosjekt: ${host}`)
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

// Er kontoen medlem eller eier i et annet bo enn demoboet? Da er den ikke en demokonto, og den skal aldri merkes.
async function otherEstates(id) {
  const m = await admin.from('estate_members').select('estate_id', { count: 'exact', head: true }).eq('user_id', id).neq('estate_id', DEMO_ESTATE)
  const o = await admin.from('estates').select('id', { count: 'exact', head: true }).eq('owner_id', id).neq('id', DEMO_ESTATE)
  if (m.error || o.error) stop(`kunne ikke kontrollere boene til ${id}: ${(m.error || o.error).message}`)
  return (m.count || 0) + (o.count || 0)
}
console.log(JSON.stringify({ modus: mode || 'tørrkjøring', kontoer: show() }, null, 2))

async function verify(role, check, what) {
  const { data, error } = await admin.auth.admin.getUserById(accounts[role].id)
  if (error || !check(data.user)) stop(`kontrollen etter ${what} feilet for ${role}`)
  accounts[role] = data.user
}

if (!mode) {
  for (const r of ROLES) {
    const u = accounts[r]
    const others = await otherEstates(u.id)
    console.log(`${r}: ${u.app_metadata?.arvklart_demo ? 'merket' : 'ville blitt merket'}; ${others ? `ADVARSEL: medlem/eier i ${others} andre bo, blir ikke merket` : 'bare i demoboet'}; e-post ${u.email} ${u.email?.toLowerCase() === NEW(r) ? '(ny)' : `→ ${NEW(r)} i fase 5`}; ${u.banned_until ? 'stengt' : r === 'mona' ? 'åpen (skal være åpen)' : 'åpen → stenges med --apply-lock'}`)
  }
  console.log(`Ingenting er endret. Kontroller id-ene over, og bruk dem i: --project=${projectArg} --apply-mark --expect-ids=${ROLES.map(r => `${r}:${accounts[r].id}`).join(',')}`)
  process.exit(0)
}

if (mode === '--apply-mark') {
  for (const r of ROLES) {
    if (!expected[r]) stop(`--expect-ids mangler ${r}; kjør tørrkjøringen og bekreft id-ene først`)
    if (expected[r] !== accounts[r].id) stop(`id-en til ${r} er ${accounts[r].id}, ikke ${expected[r]} som du bekreftet`)
    if (![OLD(r), NEW(r)].includes((accounts[r].email || '').toLowerCase())) stop(`${r} har ikke en kjent demoadresse`)
    const others = await otherEstates(accounts[r].id)
    if (others) stop(`${r} er medlem eller eier i ${others} andre bo; en ekte konto skal aldri merkes`)
  }
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

if (mode === '--remove-mark') {
  for (const r of ROLES) {
    const u = accounts[r]
    if (!u.app_metadata?.arvklart_demo) { console.log(`${r}: ikke merket`); continue }
    const rest = { ...u.app_metadata }
    delete rest.arvklart_demo
    // Supabase slår sammen app_metadata; en nøkkel fjernes ved å sette den til null
    const { error } = await admin.auth.admin.updateUserById(u.id, { app_metadata: { ...rest, arvklart_demo: null } })
    if (error) stop(`kunne ikke fjerne merket på ${r}: ${error.message}`)
    await verify(r, x => !x.app_metadata?.arvklart_demo && Object.entries(rest).every(([k, v]) => JSON.stringify(x.app_metadata[k]) === JSON.stringify(v)), 'fjerningen av merket')
    console.log(`${r}: merket fjernet (øvrig app_metadata uendret)`)
  }
}

if (mode === '--apply-lock' || mode === '--remove-lock') {
  const lock = mode === '--apply-lock'
  for (const r of ['kari', 'lars']) {
    const { error } = await admin.auth.admin.updateUserById(accounts[r].id, { ban_duration: lock ? '876000h' : 'none' })
    if (error) stop(`kunne ikke ${lock ? 'stenge' : 'åpne'} innloggingen til ${r}: ${error.message}`)
    await verify(r, x => lock ? !!x.banned_until && new Date(x.banned_until) > new Date() : !x.banned_until || new Date(x.banned_until) <= new Date(), lock ? 'stengingen' : 'åpningen')
    console.log(`${r}: innlogging ${lock ? 'stengt (også fornyelse av eksisterende økter)' : 'åpnet'}`)
  }
}

console.log(JSON.stringify({ etter: show() }, null, 2))
