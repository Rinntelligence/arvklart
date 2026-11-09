// Sveipesiden på mobil: kortet og knappene «Nei takk» og «Vil ha» skal kunne brukes uten å scrolle, også med lang
// tittel og beskrivelse, med demobanneret, med tekststørrelsen «Ekstra stor» og når angrelinjen og begrunnelsesfeltet
// er åpne. Kjøres av test/e2e/run.sh.
//
// Merk: Chromium i testen etterligner ikke adresselinjen i Safari eller Chrome på mobil. Det må sjekkes på en ekte
// telefon; denne testen viser bare at layouten passer i vinduet den får.
import { BASE, EST, UID, ITEM, now, category, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const ITEM2 = '33333333-0000-0000-0000-000000000002'
const LONG_TITLE = 'Gammelt chatol i bjørk med innfelt speil, tre skuffer og originale messingbeslag fra bestefars verksted'
const LONG_DESC = 'Chatolet har stått i gangen siden 1960-tallet. Skuffene er fulle av brev, bilder og papirer som må gås gjennom før noe deles. Ett av beslagene er løst, men alt er komplett.'
const item = (id, title, description) => ({ id, estate_id: EST, title, description, status: 'active', condition: 'good', image_url: null,
  extra_images: [], estimated_value: '4500', added_by: UID, added_by_name: 'Test', created_at: now, category_id: 'c1', categories: category,
  interests: [], comments: [] })
const fixtures = { items: [item(ITEM, LONG_TITLE, LONG_DESC), item(ITEM2, 'Lampe', 'Bordlampe i messing')] }

// Ønsker og «nei takk» lagres i minnet, som i reason.mjs
async function decisionsTables(page) {
  const rows = []
  await page.route('https://test.supabase.co/rest/v1/interests**', async route => {
    const req = route.request()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'POST') { const row = { id: `int-${rows.length + 1}`, created_at: now, ...JSON.parse(req.postData() || '{}') }; rows.push(row); return json(row, 201) }
    if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' })
    if (req.method() === 'PATCH') return json(rows.map(r => ({ id: r.id })))
    return json(rows)
  })
  await page.route('https://test.supabase.co/rest/v1/item_passes**', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }))
}

// Hele elementet ligger innenfor vinduet, og punktet midt i det treffer elementet selv (ingenting ligger over)
async function fullyVisible(locator, name) {
  const page = locator.page()
  const box = await locator.boundingBox()
  const vp = page.viewportSize()
  assert(box, `${name} finnes ikke`)
  assert(box.y >= 0 && box.y + box.height <= vp.height + 0.5 && box.x >= 0 && box.x + box.width <= vp.width + 0.5,
    `${name} er utenfor vinduet (y ${Math.round(box.y)}–${Math.round(box.y + box.height)}, vindu ${vp.height})`)
  const hit = await locator.evaluate(el => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 10))
    return !!top && (el === top || el.contains(top))
  })
  assert(hit, `${name} er dekket av noe annet`)
}

const scrollY = page => page.evaluate(() => window.scrollY)

async function assertUsable(page, label) {
  assert(await scrollY(page) === 0, `${label}: siden er scrollet (${await scrollY(page)})`)
  await fullyVisible(page.getByRole('button', { name: 'Nei takk' }), `${label}: «Nei takk»`)
  await fullyVisible(page.getByRole('button', { name: 'Vil ha' }), `${label}: «Vil ha»`)
}

const VIEWPORTS = [{ width: 375, height: 667 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
const SESSIONS = [{ who: 'vanlig bruker', email: null }, { who: 'demo', email: 'mona.demo@heirsplit.no' }]

for (const vp of VIEWPORTS) {
  for (const textSize of [null, 'xlarge']) {
    for (const { who, email } of SESSIONS) {
      const label = `${vp.width}×${vp.height}${textSize ? ', Ekstra stor' : ''}, ${who}`
      await check(`Sveip ${label}: kortets tittel og begge knappene synes uten scrolling, også med angrelinjen og begrunnelsesfeltet åpent`, async page => {
        await decisionsTables(page)
        await page.goto(`${BASE}/estate/${EST}/swipe`)
        const title = page.getByRole('heading', { name: LONG_TITLE })
        await title.waitFor()
        if (email) await page.getByText(/Du ser på en/).waitFor() // demobanneret er med i høyden
        await assertUsable(page, 'første kort')
        await fullyVisible(title, 'tittelen på kortet')

        // Klikk uten at siden scroller: knappene står allerede i vinduet
        await page.getByRole('button', { name: 'Vil ha' }).click()
        await page.getByText(`Du vil ha «${LONG_TITLE}»`).waitFor()
        await page.getByRole('heading', { name: 'Lampe' }).waitFor()
        await assertUsable(page, 'med angrelinjen')
        await fullyVisible(page.getByRole('button', { name: 'Angre' }), 'med angrelinjen: «Angre»')

        // Begrunnelsesfeltet åpnes i blokken nederst; knappene kan fortsatt brukes
        await page.getByRole('button', { name: '+ Si hvorfor' }).click()
        const field = page.getByLabel(/Hvorfor vil du ha/)
        await field.waitFor()
        await fullyVisible(page.getByRole('button', { name: 'Nei takk' }), 'med begrunnelsesfeltet: «Nei takk»')
        await fullyVisible(page.getByRole('button', { name: 'Vil ha' }), 'med begrunnelsesfeltet: «Vil ha»')
        await fullyVisible(field, 'begrunnelsesfeltet')
      }, { viewport: vp, textSize, email, fixtures })
    }
  }
}

await check('Sveip på mobil: hele kortet kan scrolles fram, og knappene dekker ikke slutten av det', async page => {
  await decisionsTables(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('heading', { name: LONG_TITLE }).waitFor()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await fullyVisible(page.getByText(LONG_DESC.slice(0, 40)), 'beskrivelsen nederst på kortet')
  await fullyVisible(page.getByRole('button', { name: 'Vil ha' }), '«Vil ha» etter scrolling')
}, { viewport: { width: 375, height: 667 }, textSize: 'xlarge', email: 'mona.demo@heirsplit.no', fixtures })

await check('Sveip på desktop: knappene står rett under kortet, uten scrolling', async page => {
  await decisionsTables(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('heading', { name: LONG_TITLE }).waitFor()
  await assertUsable(page, 'desktop')
}, { viewport: { width: 1280, height: 900 }, fixtures })

await browser.close()
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} sveipesjekker OK`)
process.exit(failed.length ? 1 : 0)
