// Akseptansetester for sikkerhetshodene i vercel.json (innholdsregler/CSP, rammer, kamera): sidene virker
// med hodene slik Vercel sender dem, og ingenting appen trenger blokkeres. Kjøres mot det bygde nettstedet
// (test/e2e/staticServer.mjs), ikke Vite-utviklingsserveren, som legger inn skript direkte i HTML-en.
// Simulert Supabase. Kjøres av test/e2e/run.sh.
import { createRequire } from 'node:module'
import { BASE, EST, ITEM, FIXTURES, launch, checker, assert } from './fixtures.mjs'
const JSPDF = createRequire(import.meta.url).resolve('jspdf/dist/jspdf.umd.min.js')

const browser = await launch()
const results = []
const check = checker(browser, results)

// Brudd på innholdsreglene i siden og i rammer (veiviseren) samles i window.__csp og fra konsollen
async function violations(page) {
  const seen = []
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) seen.push(m.text().slice(0, 200)) })
  await page.addInitScript(() => {
    window.__csp = []
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  return async () => {
    const inFrames = await Promise.all(page.frames().map(f => f.evaluate(() => window.__csp || []).catch(() => [])))
    return [...new Set([...seen, ...inFrames.flat()])]
  }
}
const none = async get => { const v = await get(); assert(v.length === 0, `blokkert: ${v.join(' | ')}`) }

const GIF = 'R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=' // gyldig 1×1-bilde
const PUB = `https://test.supabase.co/storage/v1/object/public/item-images/${EST}/`
const withImages = { fixtures: { items: [{ ...FIXTURES.items[0], image_url: `${PUB}stol.jpg`, extra_images: [] }] } }
async function signedImages(page) {
  await page.route('https://test.supabase.co/storage/v1/object/sign/item-images', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify((body.paths || []).map(p => ({ path: p, signedURL: `/object/sign/item-images/${p}?token=test`, error: null }))) })
  })
  await page.route('https://test.supabase.co/storage/v1/object/**', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from(GIF, 'base64') })
    : route.fallback())
}

await check('Hodene sendes på appen og på veiviseren', async () => {
  for (const path of ['/', '/estate/x', '/veiviser.html']) {
    const h = (await fetch(BASE + path)).headers
    assert(h.get('content-security-policy')?.includes("frame-ancestors 'self'"), `CSP mangler på ${path}`)
    assert(h.get('x-content-type-options') === 'nosniff', `nosniff mangler på ${path}`)
    assert(h.get('x-frame-options') === 'SAMEORIGIN', `X-Frame-Options mangler på ${path}`)
    assert(h.get('permissions-policy')?.includes('camera=(self)'), `kameraet må være tillatt for siden selv (${path})`)
  }
}, { loggedIn: false })

await check('Innholdsreglene blokkerer skript fra andre steder (kontroll av testen)', async page => {
  const get = await violations(page)
  await page.goto(`${BASE}/home`)
  await page.evaluate(() => new Promise(r => { const s = document.createElement('script'); s.src = 'https://evil.example/x.js'; s.onerror = r; document.head.appendChild(s) }))
  assert((await get()).some(v => v.includes('evil.example')), 'skriptet ble ikke blokkert')
}, { loggedIn: false })

for (const [name, path] of [['Forsiden', '/home'], ['Innlogging', '/logg-inn'], ['Personvern', '/personvern']]) {
  await check(`${name} uten innlogging: ingenting blokkeres`, async page => {
    const get = await violations(page)
    await page.goto(BASE + path)
    await page.locator('#root h1, #root h2').first().waitFor()
    await page.waitForTimeout(300)
    await none(get)
  }, { loggedIn: false })
}

await check('Veiviseren i rammen: skriptene kjører, og PDF-biblioteket fra cdnjs kan lastes', async page => {
  const get = await violations(page)
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ path: JSPDF, contentType: 'text/javascript' }))
  await page.goto(`${BASE}/veiviser`)
  const frame = page.frameLocator('iframe')
  await frame.locator('#timelineWrap > *').first().waitFor()   // page.js (tidslinjen)
  await frame.locator('#arvWizard .aw-card').first().waitFor()  // ui.js (veiviseren)
  const guide = page.frames().find(f => f.url().includes('/veiviser.html'))
  const loaded = await guide.evaluate(() => new Promise(r => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = () => r(!!window.jspdf?.jsPDF); s.onerror = () => r(false)
    document.head.appendChild(s)
  }))
  assert(loaded, 'jsPDF fra cdnjs ble ikke lastet')
  await none(get)
}, { loggedIn: false })

await check('Engelsk veiviser (?lang=en): språkskriptet kjører før siden vises', async page => {
  const get = await violations(page)
  await page.goto(`${BASE}/veiviser.html?lang=en`)
  await page.locator('#timelineWrap > *').first().waitFor()
  assert(await page.evaluate(() => document.documentElement.lang) === 'en', 'språket ble ikke satt')
  assert((await page.locator('h1').first().textContent()).startsWith('From death'), 'den engelske teksten vises ikke')
  await none(get)
}, { loggedIn: false })

await check('Bo-oversikten: signerte bilder og sanntid blokkeres ikke', async page => {
  const get = await violations(page)
  await signedImages(page)
  await page.goto(`${BASE}/estate/${EST}`)
  await page.locator('img[alt="Gyngestol"]').first().waitFor()
  await page.waitForFunction(() => [...document.images].some(i => i.alt === 'Gyngestol' && i.complete && i.naturalWidth > 0))
  await page.waitForTimeout(500) // sanntidskanalen (wss://) åpnes
  await none(get)
}, withImages)

await check('Gjenstandssiden: ingenting blokkeres', async page => {
  const get = await violations(page)
  await signedImages(page)
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.locator('img[alt="Gyngestol"]').first().waitFor()
  await page.waitForTimeout(300)
  await none(get)
}, withImages)

await check('Fordelingen: protokollen lastes ned som PDF', async page => {
  const get = await violations(page)
  await page.goto(`${BASE}/estate/${EST}/fordeling`)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Last ned utkast \(PDF\)/ }).click()
  assert((await download).suggestedFilename().endsWith('.pdf'), 'ingen PDF')
  await none(get)
})

await check('Legg til flere: bildet fra filvelgeren vises (blob:)', async page => {
  const get = await violations(page)
  await page.goto(`${BASE}/estate/${EST}/add-many`)
  const gif = Buffer.from(GIF, 'base64')
  await page.locator('input[type=file]').first().setInputFiles({ name: 'stol.gif', mimeType: 'image/gif', buffer: gif })
  await page.waitForFunction(() => [...document.images].some(i => i.src.startsWith('blob:') && i.complete))
  await none(get)
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
