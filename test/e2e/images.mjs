// Akseptansetester for private bilder (S1): gjenstandsbilder vises med tidsbegrensede (signerte) URL-er,
// ikke med den offentlige URL-en som ligger lagret. Simulert Supabase. Kjøres av test/e2e/run.sh.
import { BASE, EST, ITEM, FIXTURES, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const PUB = `https://test.supabase.co/storage/v1/object/public/item-images/${EST}/`
const withImages = { fixtures: { items: [{ ...FIXTURES.items[0], image_url: `${PUB}stol.jpg`, extra_images: [`${PUB}stol-2.jpg`] }] } }

// Signeringen i Storage: POST /object/sign/item-images med { paths } gir relative signedURL per sti
async function signing(page) {
  const asked = []
  await page.route('https://test.supabase.co/storage/v1/object/sign/item-images', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    asked.push(...(body.paths || []))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify((body.paths || []).map(p => ({ path: p, signedURL: `/object/sign/item-images/${p}?token=test`, error: null }))) })
  })
  // Selve bildefilene (både signert og offentlig adresse) svarer med et lite bilde
  await page.route('https://test.supabase.co/storage/v1/object/**', route => route.request().method() === 'GET'
    ? route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') })
    : route.fallback())
  return asked
}

const srcs = page => page.locator('img').evaluateAll(els => els.map(e => e.getAttribute('src')))

await check('Oversikten: bildet på kortet vises med signert URL, ikke den offentlige', async page => {
  const asked = await signing(page)
  await page.goto(`${BASE}/estate/${EST}`)
  await page.locator(`img[alt="Gyngestol"]`).first().waitFor()
  const all = await srcs(page)
  assert(all.some(s => s.includes('/object/sign/item-images/') && s.includes('token=')), `ingen signert URL: ${all.join(', ')}`)
  assert(!all.some(s => s.includes('/object/public/item-images/')), 'en offentlig bilde-URL vises fortsatt')
  assert(asked.includes(`${EST}/stol.jpg`), 'stien ble ikke signert')
}, withImages)

await check('Gjenstandssiden: alle bildene i karusellen signeres', async page => {
  const asked = await signing(page)
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.locator(`img[alt="Gyngestol"]`).first().waitFor()
  assert(!(await srcs(page)).some(s => s.includes('/object/public/item-images/')), 'offentlig URL i karusellen')
  assert(asked.includes(`${EST}/stol.jpg`), 'hovedbildet ble ikke signert')
}, withImages)

await check('Sveiping: bildet signeres', async page => {
  await signing(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.locator(`img[alt="Gyngestol"]`).first().waitFor()
  assert(!(await srcs(page)).some(s => s.includes('/object/public/item-images/')), 'offentlig URL i sveipingen')
}, withImages)

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
