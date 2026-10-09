// Akseptansetester for språk per konto (profiles.preferred_lang), i Chromium med simulert Supabase.
// Kontoens språk følger brukeren, norsk er standard, og delt innhold i boet skrives ikke om av ett språkvalg.
// Kjøres av test/e2e/run.sh.
import { BASE, EST, FIXTURES, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)
const withLang = lang => ({ fixtures: { profiles: [{ ...FIXTURES.profiles[0], preferred_lang: lang }] } })

// fixtures.mjs tømmer hs_lang ved hver sidelasting (så testene starter likt). Her må språket overleve
// omlastingen appen gjør ved språkbytte, slik det gjør i en ekte nettleser: hent det fra fanens sessionStorage.
const keepLangOnReload = page => page.addInitScript(() => {
  const synced = sessionStorage.getItem('hs_lang_synced')
  if (synced) localStorage.setItem('hs_lang', synced)
})

// Fanger skrivinger mot profiler, innloggingen og oppgaver
const writes = page => {
  const w = { profiles: [], authUser: [], tasks: [] }
  page.on('request', r => {
    const body = () => { try { return JSON.parse(r.postData() || 'null') } catch { return null } }
    if (r.method() === 'PATCH' && r.url().includes('/rest/v1/profiles')) w.profiles.push(body())
    if (r.method() === 'PUT' && r.url().includes('/auth/v1/user')) w.authUser.push(body())
    if (r.method() === 'POST' && r.url().includes('/rest/v1/tasks')) w.tasks.push(body())
  })
  return w
}

await check('Konto på engelsk: appen bytter til engelsk etter innlogging, også på en ny enhet', async page => {
  await keepLangOnReload(page)
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: /Welcome back/ }).waitFor({ timeout: 15000 })
}, withLang('en'))

await check('Konto uten valgt språk (null): norsk, også for eksisterende brukere', async page => {
  await page.goto(`${BASE}/`)
  await page.getByRole('heading', { name: /Velkommen tilbake/ }).waitFor()
  await page.waitForTimeout(500)
  assert(await page.getByRole('heading', { name: /Welcome back/ }).count() === 0, 'byttet til engelsk uten at brukeren har valgt det')
}, withLang(null))

await check('Min konto: språkvalget lagres på profilen og innloggingen, og siden bytter språk', async page => {
  const w = writes(page)
  await keepLangOnReload(page)
  await page.goto(`${BASE}/konto`)
  await page.getByRole('group', { name: 'Språk' }).waitFor()
  assert(await page.getByRole('radio', { name: 'Norsk' }).isChecked(), 'norsk er ikke valgt')
  await page.getByRole('radio', { name: 'English' }).click() // siden lastes på nytt med en gang
  await page.getByRole('heading', { name: 'My account' }).waitFor({ timeout: 15000 })
  assert(w.profiles.some(b => b?.preferred_lang === 'en'), 'språket ble ikke lagret på profilen')
  assert(w.authUser.some(b => b?.data?.lang === 'en'), 'språket ble ikke lagret på innloggingen (e-postmalene)')
}, withLang(null))

await check('Delt innhold: standard sjekkliste lagres på norsk selv om brukeren har engelsk, og vises på engelsk', async page => {
  const w = writes(page)
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  await page.goto(`${BASE}/estate/${EST}/tasks`)
  await page.getByRole('button', { name: 'Load standard checklist' }).first().click()
  for (let i = 0; i < 50 && !w.tasks.length; i++) await page.waitForTimeout(100)
  const rows = w.tasks.flat()
  assert(rows.length === 16, `forventet 16 oppgaver, fikk ${rows.length}`)
  assert(rows[0].title === 'Registrer dødsfallet', `lagret «${rows[0].title}», ventet norsk`)
}, { fixtures: { profiles: [{ ...FIXTURES.profiles[0], preferred_lang: 'en' }], tasks: [] } })

await check('Delt innhold: standardoppgaver lagret på norsk vises på engelsk, og egne oppgaver vises som skrevet', async page => {
  await page.addInitScript(() => localStorage.setItem('hs_lang', 'en'))
  await page.goto(`${BASE}/estate/${EST}/tasks`)
  await page.getByText('Register the death').waitFor()
  await page.getByText('Ringe tante Gerd').waitFor()
}, { fixtures: { profiles: [{ ...FIXTURES.profiles[0], preferred_lang: 'en' }], tasks: [
  { id: 't1', estate_id: EST, title: 'Registrer dødsfallet', description: 'Innhent dødsattest fra sykehus eller lege', category: 'Umiddelbart', priority: 1, completed: false },
  { id: 't2', estate_id: EST, title: 'Ringe tante Gerd', description: null, category: 'Umiddelbart', priority: 2, completed: false },
] } })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
