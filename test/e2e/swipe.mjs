// Sveipesiden på mobil: kortet og knappene «Nei takk» og «Vil ha» skal kunne brukes uten å scrolle, også med lang
// tittel og beskrivelse, med demobanneret, med tekststørrelsen «Ekstra stor» og når angrelinjen og begrunnelsesfeltet
// er åpne. Kjøres av test/e2e/run.sh.
//
// Normale beskrivelser (de første ca. 100 tegnene, som kortet viser) skal også synes uten scrolling der skjermen tillater
// det, og bildet skal være minst 140 px (320 px når det er plass, som på desktop).
//
// Merk: Chromium i testen etterligner ikke adresselinjen i Safari eller Chrome på mobil. Derfor testes også vinduer med
// høyden som er synlig når adresselinjen vises (VISIBLE). På en ekte telefon må det likevel sjekkes for hånd.
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

// Hele skjermen, og det som er synlig med adresselinjen: iPhone SE, mini/X/11 Pro, 12–16, Plus/Pro Max og en vanlig Android
const FULL = [{ width: 375, height: 667 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
const VISIBLE = [{ width: 375, height: 548 }, { width: 375, height: 635 }, { width: 390, height: 664 }, { width: 430, height: 746 }, { width: 412, height: 780 }]
const VIEWPORTS = [...FULL, ...VISIBLE]
// iPhone SE med adresselinjen har ikke plass til bilde, tittel, tre linjer og knappene; der kreves bare knappene og tittelen
const DESCRIPTION_FITS = vp => vp.height >= 635
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

        // Begrunnelsesfeltet åpnes i blokken nederst; knappene kan fortsatt brukes. Unntak: iPhone SE med adresselinjen og
        // «Ekstra stor», der feltet og knappene til sammen er høyere enn plassen (mens man skriver, dekker tastaturet dem uansett).
        if (vp.height < 635 && textSize) return
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

// En vanlig beskrivelse (kortet viser høyst 100 tegn), med tittel på én og to linjer
const DESC = 'Middagsservise i hvitt porselen med blå kant. Brukt hver jul siden 1970. Noen tallerkener er litt slitt.'
const TITLES = ['Lampe i messing', 'Julemiddagsservise fra Porsgrund, 24 deler']

// Hele beskrivelsen ligger i vinduet over knappeblokken, og ingenting dekker siste linje
async function descriptionVisible(page, label) {
  const r = await page.getByText(DESC.slice(0, 40)).evaluate(p => {
    const box = p.getBoundingClientRect()
    const sticky = [...document.querySelectorAll('div')].find(d => d.style.position === 'sticky' && d.style.bottom === '0px')
    const lastLine = document.elementFromPoint(box.left + 20, box.bottom - 4)
    return { top: box.top, bottom: box.bottom, stickyTop: sticky.getBoundingClientRect().top, covered: !(lastLine && (p === lastLine || p.contains(lastLine))) }
  })
  assert(r.top >= 0 && r.bottom <= r.stickyTop + 0.5, `${label}: beskrivelsen (${Math.round(r.top)}–${Math.round(r.bottom)}) går under knappeblokken (${Math.round(r.stickyTop)})`)
  assert(!r.covered, `${label}: siste linje i beskrivelsen er dekket`)
}
const imageHeight = page => page.locator('.swipe-img').last().evaluate(el => el.getBoundingClientRect().height)

for (const vp of VIEWPORTS.filter(DESCRIPTION_FITS)) {
  for (const { who, email } of SESSIONS) {
    for (const title of TITLES) {
      await check(`Sveip ${vp.width}×${vp.height}, ${who}, «${title}»: beskrivelsen synes uten scrolling, bildet er minst 140 px`, async page => {
        await decisionsTables(page)
        await page.goto(`${BASE}/estate/${EST}/swipe`)
        await page.getByRole('heading', { name: title }).waitFor()
        if (email) await page.getByText(/Du ser på en/).waitFor()
        await page.evaluate(() => document.fonts.ready)
        await assertUsable(page, 'kortet')
        await descriptionVisible(page, 'kortet')
        const h = await imageHeight(page)
        assert(h >= 139.5, `bildet er bare ${Math.round(h)} px`)
        if (vp.height >= 844) assert(Math.round(h) === 320, `bildet er ${Math.round(h)} px på en høy skjerm, ventet 320 som før`)
      }, { viewport: vp, email, fixtures: { items: [item(ITEM, title, DESC), item(ITEM2, 'Lampe', 'Bordlampe i messing')] } })
    }
  }
}

await check('Sveip 375×548 (iPhone SE med adresselinjen), demo: bildet er minst 140 px', async page => {
  await decisionsTables(page)
  await page.goto(`${BASE}/estate/${EST}/swipe`)
  await page.getByRole('heading', { name: LONG_TITLE }).waitFor()
  const h = await imageHeight(page)
  assert(h >= 139.5, `bildet er bare ${Math.round(h)} px`)
}, { viewport: { width: 375, height: 548 }, email: 'mona.demo@heirsplit.no', fixtures })

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
  assert(Math.round(await imageHeight(page)) === 320, 'bildet er ikke 320 px på desktop som før')
}, { viewport: { width: 1280, height: 900 }, fixtures })

await browser.close()
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} sveipesjekker OK`)
process.exit(failed.length ? 1 : 0)
