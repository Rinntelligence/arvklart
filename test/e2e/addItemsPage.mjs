// Akseptansetester A–G for «Legg til flere» (fase 1) i ekte Chromium med falskt kamera og simulert Supabase.
// Kjøres med npm run test:e2e (test/e2e/run.sh starter Vite). Skjermbilder havner i $SHOTS hvis den er satt.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'

const BASE = process.env.BASE_URL || 'http://localhost:5179'
const EST = '22222222-0000-0000-0000-000000000001'
const UID = '11111111-0000-0000-0000-000000000001'
const SHOTS = process.env.SHOTS || null
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, email: 'test@test.no', role: 'authenticated', exp, session_id: 's1' })}.sig`
const session = { access_token: token, refresh_token: 'r', expires_at: exp, expires_in: 3600, token_type: 'bearer',
  user: { id: UID, email: 'test@test.no', aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: 'Test' } } }

const shot = (page, name, fullPage = false) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}`, fullPage }) : null)
const results = []
const run = async (name, fn) => {
  try { await fn(); results.push(`OK   ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n').slice(0,6).join(' | ')}`) }
}

async function setup(browser, { lang = 'no', failCall = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera'] })
  const page = await ctx.newPage()
  const calls = { analyze: 0, itemInserts: 0, uploads: 0, analyzeLangs: [] }
  await page.route('https://test.supabase.co/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.startsWith('/functions/v1/analyze-item')) {
      calls.analyze++
      const body = JSON.parse(req.postData() || '{}')
      calls.analyzeLangs.push(body.lang)
      if (failCall && failCall(calls.analyze)) return json({ success: false, code: 'ai_error', error: 'AI-tjenesten svarte med feil (500)' }, 502)
      const en = body.lang === 'en'
      return json({ success: true, data: {
        title: en ? `Oak chair ${calls.analyze}` : `Eikestol ${calls.analyze}`,
        description: en ? 'Solid oak chair with light wear.' : 'Solid stol i eik med lett slitasje.',
        category: 'Møbler', condition: 'good', confidence: 'medium', low_nok: 300, likely_nok: 500, high_nok: 800,
      }, quota: { ok: true } })
    }
    if (url.pathname.startsWith('/storage/v1/object/')) { calls.uploads++; return json({ Key: 'x' }) }
    if (url.pathname.startsWith('/rest/v1/profiles')) return json({ user_id: UID, display_name: 'Test', avatar_color: '#8c7b6b', email: 'test@test.no' })
    if (url.pathname.startsWith('/rest/v1/estate_members')) return json({ role: 'admin' })
    if (url.pathname.startsWith('/rest/v1/categories')) return json([{ id: 'c1', label: 'Møbler', emoji: '🪑', estate_id: EST }, { id: 'c2', label: 'Kunst og bilder', emoji: '🖼', estate_id: EST }])
    if (url.pathname.startsWith('/rest/v1/items') && req.method() === 'POST') { calls.itemInserts++; return route.fulfill({ status: 201, body: '' }) }
    return json([])
  })
  await page.addInitScript(([s, l]) => {
    localStorage.setItem('sb-test-auth-token', JSON.stringify(s))
    localStorage.setItem('aiConsented', 'true')
    if (l === 'en') localStorage.setItem('hs_lang', 'en'); else localStorage.removeItem('hs_lang')
  }, [session, lang])
  await page.goto(`${BASE}/estate/${EST}/add-many`)
  await page.getByRole('heading', { name: lang === 'en' ? 'Add several items' : 'Legg til flere gjenstander' }).waitFor()
  return { ctx, page, calls }
}

const T = (lang, no, en) => (lang === 'en' ? en : no)
async function openCamera(page, lang = 'no') {
  await page.getByRole('button', { name: T(lang, 'Ta bilder', 'Take photos') }).first().click()
  await page.getByRole('button', { name: T(lang, 'Ta bilde', 'Take photo'), exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0)
}
async function shoot(page, lang = 'no') {
  const before = await page.locator('[role=dialog] img').count()
  const total = await photoTotal(page)
  await page.getByRole('button', { name: T(lang, 'Ta bilde', 'Take photo'), exact: true }).click()
  await page.waitForFunction(t => {
    const m = document.querySelector('[role=dialog] span[aria-live]')?.textContent.match(/(\d+) (bilde|bilder|photo|photos)/)
    return m && Number(m[1]) > t
  }, total)
  return before
}
const photoTotal = async (page) => {
  const t = await page.locator('[role=dialog] span[aria-live]').first().textContent()
  const m = t.match(/(\d+) (bilde|bilder|photo|photos)/)
  return m ? Number(m[1]) : 0
}
const header = (page) => page.locator('[role=dialog] span[aria-live]').first().textContent()
const cards = (page) => page.locator('text=/^(Gjenstand|Item) \\d+/')

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
})

await run('A: sju bilder etter hverandre gir sju gjenstander', async () => {
  const { ctx, page } = await setup(browser)
  await openCamera(page)
  await shot(page, 'A0-kamera-start.png')
  for (let i = 0; i < 7; i++) await shoot(page)
  assert.match(await header(page), /7 gjenstander · 7 bilder/)
  await shot(page, 'A1-kamera-etter-7.png')
  await page.getByRole('button', { name: 'Ferdig' }).click()
  for (let i = 1; i <= 7; i++) await page.getByText(new RegExp(`^Gjenstand ${i}$`)).waitFor()
  assert.equal(await page.getByText(/^Gjenstand 8/).count(), 0)
  await shot(page, 'A2-kort.png', true)
  await ctx.close()
})

await run('B: tre bilder av samme gjenstand grupperes, «Neste gjenstand» starter ny', async () => {
  const { ctx, page } = await setup(browser)
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: /Flere bilder av gjenstand 1/ }).click()
  await page.getByText('Flere bilder av gjenstand 1 · 1 av 5').waitFor()
  await shot(page, 'B0-flere-bilder-modus.png')
  await shoot(page); await shoot(page)
  await page.getByText('Flere bilder av gjenstand 1 · 3 av 5').waitFor()
  await page.getByRole('button', { name: 'Neste gjenstand →' }).click()
  await page.getByText('Hvert bilde blir en ny gjenstand').waitFor()
  await shoot(page)
  assert.match(await header(page), /2 gjenstander · 4 bilder/)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByText('Gjenstand 1 · 3 bilder').waitFor()
  await page.getByText(/^Gjenstand 2$/).waitFor()
  await ctx.close()
})

await run('C: feil bilde slettes rett etter, og kan angres', async () => {
  const { ctx, page } = await setup(browser)
  await openCamera(page)
  await shoot(page); await shoot(page)
  assert.match(await header(page), /2 gjenstander · 2 bilder/)
  await page.getByRole('button', { name: 'Slett siste bilde' }).click()
  assert.match(await header(page), /1 gjenstand · 1 bilde/)
  await shot(page, 'C0-slettet-med-angre.png')
  await page.getByRole('button', { name: /Bilde slettet · Angre/ }).click()
  assert.match(await header(page), /2 gjenstander · 2 bilder/)
  await page.getByRole('button', { name: 'Slett siste bilde' }).click()
  await shoot(page)   // «ta på nytt»
  assert.match(await header(page), /2 gjenstander · 2 bilder/)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByText(/^Gjenstand 2$/).waitFor()
  // Slett bilde på kortet etter at kameraet er lukket
  await page.getByRole('button', { name: 'Slett bilde 1' }).nth(1).click()
  assert.equal(await page.getByText(/^Gjenstand 2/).count(), 0)
  await page.getByRole('button', { name: 'Angre' }).click()
  await page.getByText(/^Gjenstand 2$/).waitFor()
  await ctx.close()
})

await run('D: fem gjenstander gruppert feil på én kan deles opp før analyse', async () => {
  const { ctx, page } = await setup(browser)
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: /Flere bilder av gjenstand 1/ }).click()
  for (let i = 0; i < 4; i++) await shoot(page)
  await page.getByText(/Maks 5 bilder per gjenstand/).waitFor()
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByText('Gjenstand 1 · 5 bilder').waitFor()
  await page.getByRole('button', { name: 'Del opp: ett bilde per gjenstand' }).click()
  for (let i = 1; i <= 5; i++) await page.getByText(new RegExp(`^Gjenstand ${i}$`)).waitFor()
  await page.getByRole('button', { name: 'Analyser med AI (5)' }).waitFor()
  await ctx.close()
})

await run('E: AI-analyse av sju lagrer ingenting; kortene kan redigeres; «Godkjenn og lagre alle» lagrer sju', async () => {
  const { ctx, page, calls } = await setup(browser)
  await openCamera(page)
  for (let i = 0; i < 7; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (7)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (7)' }).waitFor()
  assert.equal(calls.analyze, 7)
  assert.equal(calls.itemInserts, 0, 'ingenting lagret etter analyse')
  assert.equal(calls.uploads, 0, 'ingen bilder lastet opp etter analyse')
  assert.equal(await page.getByText('✓ Fylt inn av AI – se over').count(), 7)
  const title = page.getByRole('textbox', { name: 'Navn' }).first()
  await title.fill('Bestemors gyngestol')
  await shot(page, 'E0-etter-analyse.png', true)
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (7)' }).click()
  await page.getByText('✓ 7 gjenstander lagt til i boet').waitFor()
  assert.equal(calls.itemInserts, 7)
  await page.getByRole('button', { name: 'Inviter arvingene' }).waitFor()
  await shot(page, 'E1-ferdig-neste-steg.png')
  await ctx.close()
})

await run('F: AI feiler på én av sju: seks kan lagres, den siste kan prøves igjen', async () => {
  let failing = true
  const { ctx, page, calls } = await setup(browser, { failCall: n => failing && n === 3 })
  await openCamera(page)
  for (let i = 0; i < 7; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (7)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (6)' }).waitFor()
  await page.getByText('AI klarte ikke denne').waitFor()
  assert.equal(await page.getByText('✓ Fylt inn av AI – se over').count(), 6)
  assert.equal(calls.itemInserts, 0)
  await shot(page, 'F0-en-feilet.png', true)
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (6)' }).click()
  await page.getByText(/6 lagt til\. 1 mangler navn\./).waitFor()
  assert.equal(calls.itemInserts, 6)
  failing = false
  await page.getByRole('button', { name: 'Prøv AI igjen' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).waitFor()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  assert.equal(calls.itemInserts, 7)
  await ctx.close()
})

await run('G: hele flyten på engelsk, også AI-teksten', async () => {
  const { ctx, page, calls } = await setup(browser, { lang: 'en' })
  await openCamera(page, 'en')
  await page.getByText('Each photo becomes a new item').waitFor()
  await shoot(page, 'en'); await shoot(page, 'en')
  assert.match(await header(page), /2 items · 2 photos/)
  await page.getByRole('button', { name: /More photos of item 2/ }).waitFor()
  await page.getByRole('button', { name: 'Delete the last photo' }).waitFor()
  await shot(page, 'G0-kamera-engelsk.png')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Analyse with AI (2)' }).click()
  await page.getByRole('button', { name: 'Approve and save all (2)' }).waitFor()
  assert.deepEqual(calls.analyzeLangs, ['en', 'en'])
  await page.getByText('✓ Filled in by AI – review').first().waitFor()
  assert.equal(await page.locator('input[value^="Oak chair"]').count(), 2)
  const body = await page.locator('body').innerText()
  for (const no of ['Gjenstand', 'Analyser', 'Lagre', 'Ferdig', 'bilder']) assert.ok(!body.includes(no), `norsk tekst funnet: ${no} i «${body.slice(Math.max(0, body.indexOf(no) - 80), body.indexOf(no) + 40).replace(/\n/g, ' ')}»`)
  await page.getByRole('button', { name: 'Approve and save all (2)' }).click()
  await page.getByText('✓ 2 items added to the estate').waitFor()
  await page.getByRole('button', { name: 'Invite the heirs' }).waitFor()
  await ctx.close()
})

await run('Tastatur: kameraet kan brukes uten mus (utløser i fokus, Esc lukker)', async () => {
  const { ctx, page } = await setup(browser)
  await openCamera(page)
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  assert.equal(focused, 'Ta bilde')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => /1 gjenstand · 1 bilde/.test(document.querySelector('[role=dialog] span[aria-live]')?.textContent || ''))
  await page.keyboard.press('Escape')
  await page.getByText(/^Gjenstand 1$/).waitFor()
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
