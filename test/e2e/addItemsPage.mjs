// Akseptansetester A–G for «Legg til flere» (fase 1), og justeringene før release (T1–T6),
// i ekte Chromium med falskt kamera og simulert Supabase.
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

async function setup(browser, { lang = 'no', failCall = null, failEstimate = null, viewport = { width: 390, height: 844 }, v2 = null, estimateReply = null, hold = null } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera'] })
  const page = await ctx.newPage()
  const calls = { analyze: 0, itemInserts: 0, uploads: 0, analyzeLangs: [], analyzeEstimate: [], estimate: 0, insertBodies: [], estimateBodies: [] }
  await page.route('https://test.supabase.co/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.startsWith('/functions/v1/analyze-item')) {
      calls.analyze++
      const body = JSON.parse(req.postData() || '{}')
      calls.analyzeLangs.push(body.lang)
      calls.analyzeEstimate.push(Boolean(body.estimate))
      // hold: testen bestemmer når svaret kommer (for å sjekke siden mens AI-en analyserer)
      if (hold) await hold(calls.analyze)
      // failCall kan gi en feilkode (f.eks. 'ai_refused'); true betyr ai_error
      const fail = failCall && failCall(calls.analyze)
      if (fail) {
        const code = typeof fail === 'string' ? fail : 'ai_error'
        const status = { ai_refused: 422, ai_unavailable: 503, ai_busy: 503, ai_timeout: 504 }[code] || 502
        return json({ success: false, code, error: 'Norsk servertekst som ikke skal vises' }, status)
      }
      const en = body.lang === 'en'
      // v2: svar med hele AI-vurderingen (bildeanalyse versjon 2), slik analyze-item svarer etter PR B
      if (v2) return json({ success: true, data: v2(calls.analyze), quota: { ok: true } })
      return json({ success: true, data: {
        title: en ? `Oak chair ${calls.analyze}` : `Eikestol ${calls.analyze}`,
        description: en ? 'Solid oak chair with light wear.' : 'Solid stol i eik med lett slitasje.',
        category: 'Møbler', condition: 'good', confidence: 'medium', low_nok: 300, likely_nok: 500, high_nok: 800,
      }, quota: { ok: true } })
    }
    if (url.pathname.startsWith('/functions/v1/estimate-value')) {
      calls.estimate++
      calls.estimateBodies.push(JSON.parse(req.postData() || '{}'))
      if (estimateReply) return json({ success: true, data: estimateReply(calls.estimate), quota: { ok: true } })
      if (failEstimate && failEstimate(calls.estimate)) return json({ success: false, code: 'rate_limit', error: 'For mange forespørsler' }, 429)
      const m = { likely_nok: 500, low_nok: 300, high_nok: 800, reasoning: 'Brukt eikestol, vanlig modell', confidence: 'medium' }
      return json({ success: true, data: { market: m, summary: { likely_nok: 500, low_nok: 300, high_nok: 800 } }, quota: { ok: true } })
    }
    if (url.pathname.startsWith('/storage/v1/object/')) { calls.uploads++; return json({ Key: 'x' }) }
    if (url.pathname.startsWith('/rest/v1/profiles')) return json({ user_id: UID, display_name: 'Test', avatar_color: '#8c7b6b', email: 'test@test.no' })
    if (url.pathname.startsWith('/rest/v1/estate_members')) return json({ role: 'admin' })
    if (url.pathname.startsWith('/rest/v1/categories')) return json([{ id: 'c1', label: 'Møbler', emoji: '🪑', estate_id: EST }, { id: 'c2', label: 'Kunst og bilder', emoji: '🖼', estate_id: EST }])
    if (url.pathname.startsWith('/rest/v1/items') && req.method() === 'POST') { calls.itemInserts++; calls.insertBodies.push(JSON.parse(req.postData() || '{}')); return route.fulfill({ status: 201, body: '' }) }
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
  // T5: samme-modus synes med ramme og tekst i selve søkeren, ikke bare farge
  assert.equal(await page.locator('[data-same-item="true"]').count(), 1)
  await page.getByText('▣ Samme gjenstand (1) · bilde 2 av 5').waitFor()
  await shot(page, 'B0-flere-bilder-modus.png')
  await shoot(page); await shoot(page)
  await page.getByText('Flere bilder av gjenstand 1 · 3 av 5').waitFor()
  await page.getByRole('button', { name: 'Neste gjenstand →' }).click()
  await page.getByText('Hvert bilde blir en ny gjenstand').waitFor()
  assert.equal(await page.locator('[data-same-item="true"]').count(), 0)
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
  // I kameraet forsvinner angre-knappen når neste bilde er tatt (den står fortsatt nederst på siden)
  assert.equal(await page.getByRole('button', { name: /Bilde slettet · Angre/ }).count(), 0)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByText(/^Gjenstand 2$/).waitFor()
  // Slett bilde på kortet etter at kameraet er lukket
  await page.getByRole('button', { name: 'Slett bilde 1' }).nth(1).click()
  assert.equal(await page.getByText(/^Gjenstand 2/).count(), 0)
  // T1: angre uten tidsfrist (tidligere 6 s)
  await page.waitForTimeout(8000)
  await page.getByRole('button', { name: 'Angre' }).click()
  await page.getByText(/^Gjenstand 2$/).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Angre' }).count(), 0)
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
  // T2: ingen verdiestimat i bulk, og verdifeltet er tomt
  assert.deepEqual(calls.analyzeEstimate, Array(7).fill(false))
  assert.equal(await page.getByText(/AI-estimat/).count(), 0)
  await page.getByText('Mer · beskrivelse').first().click()
  assert.equal(await page.getByRole('textbox', { name: 'Verdi i NOK (valgfri)' }).first().inputValue(), '')
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
  // T3: oppsummeringen blir stående, og lenken går til riktig kort
  const summary = page.getByText(/AI klarte ikke 1 gjenstand\./)
  await summary.waitFor()
  await page.waitForTimeout(5000)
  assert.equal(await summary.count(), 1, 'oppsummeringen står fortsatt')
  // Hvilken som feiler avhenger av rekkefølgen i den parallelle analysen
  await page.getByRole('button', { name: /^Gå til gjenstand \d$/ }).click()
  const focusedId = await page.evaluate(() => document.activeElement?.id || '')
  assert.match(focusedId, /^draft-title-/)
  assert.equal(await page.evaluate(() => document.activeElement.value), '')
  await shot(page, 'F0-en-feilet.png', true)
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (6)' }).click()
  await page.getByText(/6 lagt til\. 1 mangler navn\./).waitFor()
  assert.equal(calls.itemInserts, 6)
  assert.equal(await summary.count(), 1, 'oppsummeringen står etter lagring av de andre')
  failing = false
  await page.getByRole('button', { name: 'Prøv AI igjen' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).waitFor()
  assert.equal(await summary.count(), 0, 'oppsummeringen forsvinner når alt er rettet')
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  assert.equal(calls.itemInserts, 7)
  await ctx.close()
})

await run('F2: AI avslår én gjenstand (ai_refused): de andre analyseres, og kortet kan fylles inn selv', async () => {
  const { ctx, page, calls } = await setup(browser, { failCall: n => n === 2 && 'ai_refused' })
  await openCamera(page)
  for (let i = 0; i < 3; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (3)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (2)' }).waitFor()
  assert.equal(calls.analyze, 3, 'analysen skal fortsette etter et avslag')
  await page.getByText('AI klarte ikke denne').waitFor()
  assert.equal(await page.getByText('Norsk servertekst som ikke skal vises').count(), 0)
  await ctx.close()
})

await run('F3: AI utilgjengelig (ai_unavailable): analysen stopper og sier at man kan fylle inn selv', async () => {
  const { ctx, page, calls } = await setup(browser, { failCall: () => 'ai_unavailable' })
  await openCamera(page)
  for (let i = 0; i < 5; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (5)' }).click()
  await page.getByText(/AI-hjelpen er ikke tilgjengelig akkurat nå\. Du kan fylle inn selv\./).waitFor()
  assert.ok(calls.analyze <= 4, `forventet at analysen stoppet (høyst fire samtidige), men ${calls.analyze} kall ble gjort`)
  assert.equal(await page.getByText('Norsk servertekst som ikke skal vises').count(), 0)
  await ctx.close()
})

// Svar fra analyze-item v2: identifikasjon (sett/sannsynlig/ukjent), merker, tilstand, flere gjenstander, bildetips
const F = (value, basis, evidence = '') => ({ value, basis, evidence })
const v2Reply = (n, over = {}) => {
  const ai = {
    suggestion: { title: `Figgjo-tallerken ${n}`, description: 'Hvit med blått mønster.', category: 'Møbler', category_key: 'kitchen_porcelain', confidence: 'medium' },
    identification: { object_type: F('Tallerken', 'observed'), brand: F('Figgjo', 'observed', 'Stempel under'), manufacturer: null, model: F('Lotte', 'probable', 'Mønsteret'),
      variant: null, material: F('Flint', 'probable'), colour: F('Hvit og blå', 'observed'), period: F('1960-tallet', 'probable', 'Stilen'), designer_or_artist: null, model_number: null },
    unknown: ['manufacturer', 'variant', 'designer_or_artist', 'model_number'],
    marks: [{ kind: 'stamp', text: 'Figgjo Flint Norway', where: 'Undersiden' }],
    size_class: 'small', condition_suggestion: 'fair', condition_observations: ['Små riper i glasuren'], condition_not_visible: ['Baksiden'], condition_confidence: 'medium',
    multiple_items: n === 2 ? { detected: true, count: 4, note: 'Fire tallerkener' } : { detected: false, count: null, note: null },
    photo_suggestions: [{ kind: 'underside', reason: 'Et bilde av stempelet under kan gi sikrere vurdering.' }],
    search_query: 'Figgjo Lotte tallerken', ...over,
  }
  return { title: ai.suggestion.title, description: ai.suggestion.description, category: 'Møbler', condition: 'fair', confidence: 'medium',
    analysis: { v: 2, meta: { model: 'claude-haiku-5-5', prompt_version: 'analyze-2026-10a', analyzed_at: '2026-10-09T12:00:00Z', image_count: 1, lang: 'no' }, ai } }
}

await run('H: bildeanalyse v2: oppsummering, flere gjenstander, bildetips og «Hva AI-en så», uten ekstra klikk; lagres i ai_analysis', async () => {
  const { ctx, page, calls } = await setup(browser, { v2: n => v2Reply(n) })
  await openCamera(page)
  for (let i = 0; i < 2; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  // Brukeren skriver eget navn på gjenstand 1 før analysen: det skal ikke overskrives
  await page.getByLabel('Navn').first().fill('Mormors tallerken')
  await page.getByRole('button', { name: 'Analyser med AI (2)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (2)' }).waitFor()
  assert.equal(await page.getByLabel('Navn').first().inputValue(), 'Mormors tallerken', 'brukerens navn ble overskrevet')
  await page.getByText('AI: Figgjo · Lotte (sannsynlig) · 1960-tallet (sannsynlig).').first().waitFor()
  await page.getByText(/Bildet ser ut til å vise flere gjenstander \(ca\. 4\)/).waitFor()
  assert.equal(await page.getByText(/Bildet ser ut til å vise flere gjenstander/).count(), 1, 'advarselen skal bare stå på kortet det gjelder')
  await page.getByText('Tips: Et bilde av stempelet under kan gi sikrere vurdering.').first().waitFor()
  // Tilstand fra AI (middels sikker), og «Hva AI-en så» under «Mer»
  assert.equal(await page.getByLabel('Tilstand').first().inputValue(), 'fair')
  await page.locator('summary', { hasText: 'Mer' }).first().click()
  await page.getByRole('heading', { name: 'Hva AI-en så' }).first().waitFor()
  await page.getByText('Sett på bildet').first().waitFor()
  await page.getByText(/Ukjent:.*produsent/).first().waitFor()
  await page.getByText('«Figgjo Flint Norway» – Undersiden').first().waitFor()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (2)' }).click()
  await page.getByText('✓ 2 gjenstander lagt til i boet').waitFor()
  const own = calls.insertBodies.find(b => b.title === 'Mormors tallerken')
  assert.ok(own, 'gjenstanden med eget navn ble ikke lagret')
  assert.equal(own.ai_analysis.v, 2)
  assert.equal(own.ai_analysis.ai.identification.brand.value, 'Figgjo')
  assert.equal(own.ai_analysis.review.title, 'not_suggested', 'navnet var brukerens eget')
  assert.equal(own.ai_analysis.review.condition, 'accepted')
  assert.equal(own.condition, 'fair')
  const other = calls.insertBodies.find(b => b !== own)
  assert.equal(other.ai_analysis.review.title, 'accepted')
  await ctx.close()
})

await run('H3: «Rett opplysningene» på kortet: rettelsen vises, går inn i oppsummeringen og lagres i ai_analysis.corrections', async () => {
  const { ctx, page, calls } = await setup(browser, { v2: n => v2Reply(n) })
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (1)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).waitFor()
  await page.locator('summary', { hasText: 'Mer' }).first().click()
  await page.getByRole('button', { name: 'Rett opplysningene' }).click()
  await page.getByLabel('Merke', { exact: true }).fill('Porsgrund')
  await page.getByLabel('Periode', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Lagre rettelsene' }).click()
  await page.getByText('Rettet av familien').waitFor()
  await page.getByText('AI: Porsgrund · Lotte (sannsynlig).').waitFor()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText(/1 gjenstand lagt til i boet/).waitFor()
  const c = calls.insertBodies[0].ai_analysis.corrections
  assert.equal(c.brand.value, 'Porsgrund')
  assert.equal(c.period.value, null)
  assert.ok(c.brand.by && c.brand.at, 'mangler hvem og når')
  assert.equal(Object.keys(c).length, 2, 'uendrede felt ble lagret')
  assert.equal(calls.insertBodies[0].ai_analysis.ai.identification.brand.value, 'Figgjo', 'AI-forslaget ble endret')
  await ctx.close()
})

await run('H2: uten AI-analyse lagres ingen ai_analysis, og tilstanden er «ikke vurdert» til noen velger', async () => {
  const { ctx, page, calls } = await setup(browser)
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByLabel('Navn').first().fill('Lampe')
  assert.equal(await page.getByLabel('Tilstand').first().inputValue(), 'unknown')
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  assert.ok(!('ai_analysis' in calls.insertBodies[0]), 'ai_analysis ble sendt uten analyse')
  assert.equal(calls.insertBodies[0].condition, 'unknown')
  await ctx.close()
})

// Svar fra estimate-value v2 (bygger på bildeanalysen)
const estimateV2 = { v: 2, status: 'ok', price_type: 'estimated_price', market_area: 'NO', currency: 'NOK', estimate: { low: 160, likely: 300, high: 540 },
  confidence: 'medium', uncertainty: { widened: true, reasons: ['condition_unknown'] }, basis: { used_analysis: true, identified: ['brand'], category_key: 'kitchen_porcelain' },
  reasoning: 'Figgjo-servise selges jevnlig brukt.', missing: [], sources: [], model: 'claude-haiku-5-5',
  market: { low_nok: 160, likely_nok: 300, high_nok: 540, reasoning: 'Figgjo-servise selges jevnlig brukt.', confidence: 'medium' }, summary: { low_nok: 160, likely_nok: 300, high_nok: 540 } }

await run('E3: verdianslaget bruker bildeanalysen (ingen bilder sendes), og AI-ens anslag lagres for seg', async () => {
  const { ctx, page, calls } = await setup(browser, { v2: n => v2Reply(n), estimateReply: () => estimateV2 })
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (1)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).waitFor()
  await page.getByRole('button', { name: 'Anslå verdi for alle (1)' }).click()
  await page.getByText('Veiledende AI-anslag, ikke en dokumentert markedsverdi', { exact: false }).waitFor()
  const sent = calls.estimateBodies[0]
  assert.equal(sent.analysis?.v, 2, 'analysen ble ikke sendt med')
  assert.ok(!('images' in sent) && !('imageBase64' in sent), 'bilder ble sendt til verdianslaget')
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  const body = calls.insertBodies[0]
  assert.equal(body.estimated_value, 300)
  assert.equal(body.ai_analysis.valuation.price_type, 'estimated_price')
  assert.deepEqual(body.ai_analysis.valuation.estimate, { low: 160, likely: 300, high: 540 })
  await ctx.close()
})

await run('E4: for lite informasjon gir ingen verdi (aldri 0 kr), men tips; «Anslå verdi for alle» hopper over kortet etterpå', async () => {
  const { ctx, page, calls } = await setup(browser, { estimateReply: () => ({ v: 2, status: 'insufficient', estimate: null, missing: ['Et mer presist navn', 'Et bilde av stempelet'], reasoning: '' }) })
  await openCamera(page)
  await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByLabel('Navn').first().fill('Ting')
  await page.getByRole('button', { name: 'Analyser med AI (1)' }).click()
  await page.getByRole('button', { name: 'Anslå verdi for alle (1)' }).waitFor()
  await page.getByRole('button', { name: 'Anslå verdi (AI)' }).click()
  await page.getByText('For lite informasjon til å anslå verdi. Dette kan hjelpe: Et mer presist navn; Et bilde av stempelet.').waitFor()
  assert.equal(await page.getByText(/Verdien ble ikke anslått/).count(), 0, 'for lite informasjon er ikke en feil')
  assert.equal(await page.getByRole('button', { name: /Anslå verdi for alle/ }).count(), 0)
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  assert.equal(calls.insertBodies[0].estimated_value, null, 'ukjent verdi skal lagres som tom, ikke 0')
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
  // Tab blir i dialogen
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), `fokus forlot kameraet etter ${i + 1} Tab`)
  }
  await page.keyboard.press('Escape')
  await page.getByText(/^Gjenstand 1$/).waitFor()
  // T4: fokus tilbake til knappen som åpnet kameraet
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Ta bilderEtt bilde = én gjenstand')
  // … også når kameraet åpnes fra et kort
  await page.getByRole('button', { name: '+ Ta bilde' }).click()
  await page.getByRole('button', { name: 'Ta bilde', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByText(/^Gjenstand 1$/).waitFor()
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), '+ Ta bilde')
  await ctx.close()
})

await run('E2: verdianslag bare når brukeren ber om det, synlig og merket, og lagres med begrunnelse', async () => {
  const { ctx, page, calls } = await setup(browser)
  await openCamera(page)
  for (let i = 0; i < 3; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (3)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (3)' }).waitFor()
  if (calls.estimate !== 0) throw new Error('verdianslag uten klikk')
  await page.getByRole('button', { name: 'Anslå verdi for alle (3)' }).click()
  await page.getByText('Veiledende AI-anslag, ikke en dokumentert markedsverdi', { exact: false }).first().waitFor()
  assert.equal(calls.estimate, 3)
  const values = page.getByRole('textbox', { name: 'Verdi i kroner (valgfri)' })
  assert.equal(await values.count(), 3, 'verdifeltet er synlig (ikke under «Mer»)')
  assert.equal(await values.first().inputValue(), '500')
  await shot(page, 'E2-verdianslag.png', true)
  // Endret verdi er brukerens egen: lagres uten AI-begrunnelse
  await values.nth(1).fill('750')
  assert.equal(await page.getByText('Veiledende AI-anslag, ikke en dokumentert markedsverdi', { exact: false }).count(), 2)
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (3)' }).click()
  await page.getByText('✓ 3 gjenstander lagt til i boet').waitFor()
  const byValue = Object.fromEntries(calls.insertBodies.map(b => [String(b.estimated_value), b]))
  assert.equal(byValue['500'].estimate_reasoning, 'Brukt eikestol, vanlig modell')
  assert.equal(byValue['750'].estimate_reasoning, undefined)
  await ctx.close()
})

await run('E2b: verdianslag stopper ved grense, og meldingen blir stående', async () => {
  const { ctx, page, calls } = await setup(browser, { failEstimate: n => n === 2 })
  await openCamera(page)
  for (let i = 0; i < 2; i++) await shoot(page)
  await page.getByRole('button', { name: 'Ferdig' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (2)' }).click()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (2)' }).waitFor()
  await page.getByRole('button', { name: 'Anslå verdi for alle (2)' }).click()
  const msg = page.getByText(/Verdien ble ikke anslått for 1 gjenstand/)
  await msg.waitFor()
  await page.waitForTimeout(4000)
  assert.equal(await msg.count(), 1, 'meldingen står fortsatt')
  await page.getByRole('button', { name: 'Anslå verdi (AI)' }).waitFor()
  assert.ok(calls.estimate >= 2)
  await ctx.close()
})

// Et lite, gyldig PNG-bilde (1×1) for filvelgeren
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

await run('T6: 20 gjenstander på liten skjerm (360×640): lagreknappen er alltid synlig, og siste kort kan leses', async () => {
  const { ctx, page } = await setup(browser, { viewport: { width: 360, height: 640 } })
  const files = Array.from({ length: 20 }, (_, i) => ({ name: `bilde-${i + 1}.png`, mimeType: 'image/png', buffer: PNG }))
  await page.locator('input[type=file][multiple]').first().setInputFiles(files)
  await page.getByRole('button', { name: '20 ulike gjenstander' }).click()
  await page.getByText(/^Gjenstand 20$/).waitFor()
  await page.getByRole('button', { name: 'Analyser med AI (20)' }).click()
  const save = page.getByRole('button', { name: 'Godkjenn og lagre alle (20)' })
  await save.waitFor()
  // Meldingen etter analysen ligger over bunnlinjen, ikke oppå lagreknappen
  const toast = page.getByText(/AI har fylt inn gjenstandene/)
  await toast.waitFor()
  const barTop0 = await page.locator('.bottom-bar').evaluate(el => el.getBoundingClientRect().top)
  const toastBox = await toast.boundingBox()
  assert.ok(toastBox.y + toastBox.height <= barTop0, 'meldingen dekker bunnlinjen')
  for (const y of [0, 2000, 100000]) {
    await page.evaluate(top => window.scrollTo(0, top), y)
    const box = await save.boundingBox()
    assert.ok(box && box.y >= 0 && box.y + box.height <= 640, `lagreknappen er utenfor skjermen ved scroll ${y}`)
  }
  // Nederst på siden ligger siste kort over bunnlinjen, ikke bak den
  const barTop = await page.locator('.bottom-bar').evaluate(el => el.getBoundingClientRect().top)
  const lastBottom = await page.locator('[id^="draft-"]:not([id^="draft-title"])').last().evaluate(el => el.getBoundingClientRect().bottom)
  assert.ok(lastBottom <= barTop, `siste kort (${lastBottom}) skjules av bunnlinjen (${barTop})`)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'ingen horisontal rulling')
  await shot(page, 'T6-20-gjenstander-liten-skjerm.png')
  await ctx.close()
})

// U2: analysen låser bare kortene den gjelder, og nye bilder analyseres av seg selv etter første trykk
const gate = () => { let open; const p = new Promise(r => { open = r }); return { wait: () => p, open } }

await run('U2a: mens AI analyserer kan man legge til bilder, rette andre kort og lagre ferdige; bare kortene som analyseres er låst', async () => {
  const g = gate()
  const { ctx, page, calls } = await setup(browser, { hold: () => g.wait() })
  await page.locator('input[type=file][multiple]').first().setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }])
  await page.getByRole('button', { name: '+ Legg til gjenstand uten bilde' }).click()
  await page.getByRole('button', { name: 'Analyser med AI (1)' }).click()
  await page.getByText(/AI analyserer… 0 av 1 ferdig/).waitFor()
  assert.equal(await page.getByRole('textbox', { name: 'Navn' }).first().isDisabled(), true, 'kortet som analyseres er ikke låst')
  const other = page.getByRole('textbox', { name: 'Navn' }).nth(1)
  assert.equal(await other.isDisabled(), false, 'de andre kortene er låst')
  for (const name of ['Ta bilder', 'Velg bilder']) assert.equal(await page.getByRole('button', { name }).first().isDisabled(), false, `«${name}» er låst under analysen`)
  await other.fill('Kommode')
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText(/1 lagt til\..*1 analyseres fortsatt av AI/).waitFor()
  assert.equal(calls.insertBodies.length, 1)
  assert.equal(calls.insertBodies[0].title, 'Kommode')
  g.open()
  await page.getByText('✓ Fylt inn av AI – se over').waitFor()
  await page.getByRole('button', { name: 'Godkjenn og lagre alle (1)' }).click()
  await page.getByText('✓ 1 gjenstand lagt til i boet').waitFor()
  assert.equal(calls.insertBodies.length, 2)
  await ctx.close()
})

await run('U2b: etter første «Analyser med AI» analyseres nye bilder uten nytt trykk, høyst fire om gangen', async () => {
  let inFlight = 0, maxInFlight = 0
  const { ctx, page, calls } = await setup(browser, { hold: async () => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise(r => setTimeout(r, 300)); inFlight-- } })
  await page.locator('input[type=file][multiple]').first().setInputFiles([{ name: 'a.png', mimeType: 'image/png', buffer: PNG }])
  await page.getByRole('button', { name: 'Analyser med AI (1)' }).click()
  await page.getByText('✓ Fylt inn av AI – se over').waitFor()
  const files = Array.from({ length: 6 }, (_, i) => ({ name: `b${i}.png`, mimeType: 'image/png', buffer: PNG }))
  await page.locator('input[type=file][multiple]').first().setInputFiles(files)
  await page.getByRole('button', { name: '6 ulike gjenstander' }).click()
  await page.waitForFunction(() => document.body.innerText.split('✓ Fylt inn av AI – se over').length - 1 === 7, null, { timeout: 15000 })
  assert.equal(calls.analyze, 7)
  assert.ok(maxInFlight <= 4, `for mange samtidige analyser: ${maxInFlight}`)
  assert.equal(await page.getByRole('button', { name: /Analyser med AI/ }).count(), 0)
  await ctx.close()
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
