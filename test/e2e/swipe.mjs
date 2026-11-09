// Sveipesiden på mobil, hele sekvensen: første kort → «Vil ha» → neste kort med angrelinjen («Du vil ha …», «Angre»,
// «+ Si hvorfor») → begrunnelsesfeltet → «Nei takk» → tredje kort. Kjøres av test/e2e/run.sh.
//
// Krav:
//  - Ingenting (angrelinjen, begrunnelsesfeltet, knappene) ligger noen gang over beskrivelsen: den kan alltid scrolles
//    fram og leses i sin helhet.
//  - På vanlige mobiler (fra 390 px bredde og 664 px synlig høyde, eller fra 800 px høyde; vanlig tekststørrelse) synes
//    tittelen, hele den korte beskrivelsen og begge knappene uten scrolling, også på kortet etter «Vil ha» (med
//    angrelinjen) og med begrunnelsesfeltet åpent (knappene).
//  - På små skjermer (375 px bredde med adresselinjen, «Ekstra stor») kan beskrivelsen kreve scrolling i kortområdet.
//  - «Nei takk» og «Vil ha» synes uten scrolling fra 635 px høyde (unntatt med begrunnelsesfeltet åpent på små skjermer
//    eller med «Ekstra stor»; tastaturet dekker dem uansett mens man skriver). På 548 px må de kunne scrolles fram.
//  - Bildet er minst 96 px, og 320 px når det er plass (høye skjermer, desktop).
//
// Chromium etterligner ikke adresselinjen i Safari. Derfor testes også den synlige høyden med adresselinjen (VISIBLE);
// på en ekte telefon må det likevel sjekkes for hånd.
import { BASE, EST, UID, ITEM, now, category, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const OTHER = '11111111-0000-0000-0000-0000000000aa'
const ITEM2 = '33333333-0000-0000-0000-000000000002'
const ITEM3 = '33333333-0000-0000-0000-000000000003'
// Beskrivelser på rundt 100 tegn (kortet viser høyst 100) og titler på én og to linjer, som i demoen
const CARDS = [
  { id: ITEM, title: 'Julemiddagsservise fra Porsgrund, 24 deler', description: 'Middagsservise i hvitt porselen med blå kant. Brukt hver jul siden 1970. Noen tallerkener er litt slitt.' },
  { id: ITEM2, title: 'Bokhylle i mørkt tre', description: 'Stor bokhylle i mørkbeiset bjørk med fem hyller. Sto i stua i Bærum. Bøkene er tatt ut og pakket i esker.' },
  { id: ITEM3, title: 'Kinesisk porselensvase, Qing-dynastiet', description: 'Blå og hvit porselensvase, antagelig fra Qing-dynastiet (1800-tall). Trolig kopi, men av høy kvalitet.' },
]
const item = c => ({ ...c, estate_id: EST, status: 'active', condition: 'good', image_url: null, extra_images: [], estimated_value: '6500',
  added_by: UID, added_by_name: 'Test', created_at: now, category_id: 'c1', categories: category, interests: [], comments: [] })
const fixtures = { items: CARDS.map(item) }

// Ønsker og «nei takk» lagres i minnet. Kortene har ønsker fra en annen, så linjen «N personer er interessert» er med.
async function decisionsTables(page) {
  const rows = CARDS.map((c, i) => ({ id: `other-${i}`, item_id: c.id, user_id: OTHER, reason: null, created_at: now }))
  await page.route('https://test.supabase.co/rest/v1/interests**', async route => {
    const req = route.request()
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'POST') { const row = { id: `int-${rows.length + 1}`, created_at: now, ...JSON.parse(req.postData() || '{}') }; rows.push(row); return json(row, 201) }
    if (req.method() === 'DELETE') return route.fulfill({ status: 204, body: '' })
    if (req.method() === 'PATCH') return json(rows.filter(r => r.user_id === UID).map(r => ({ id: r.id })))
    return json(rows)
  })
  await page.route('https://test.supabase.co/rest/v1/item_passes**', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      : route.fulfill({ status: 201, contentType: 'application/json', body: '[]' }))
}

const scrollToTop = page => page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('*').forEach(el => { if (el.scrollTop) el.scrollTop = 0 }) })
const pageScrolled = page => page.evaluate(() => window.scrollY > 0 || [...document.querySelectorAll('*')].some(el => el.scrollTop > 0))

// Hele elementet ligger i vinduet, og punktet midt i det treffer elementet selv (ingenting ligger over)
async function fullyVisible(locator, name) {
  const r = await locator.evaluate(el => {
    const b = el.getBoundingClientRect()
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + Math.min(b.height / 2, 10))
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, vh: innerHeight, vw: innerWidth, hit: !!hit && (el === hit || el.contains(hit)) }
  })
  assert(r.top >= -0.5 && r.bottom <= r.vh + 0.5 && r.left >= -0.5 && r.right <= r.vw + 0.5, `${name} er utenfor vinduet (${Math.round(r.top)}–${Math.round(r.bottom)}, vindu ${r.vh})`)
  assert(r.hit, `${name} er dekket av noe annet`)
}

// Hver linje i beskrivelsen: er den i vinduet, og ligger noe over den?
const descriptionLines = (page, text) => page.getByText(text.slice(0, 40)).evaluate(p => {
  const b = p.getBoundingClientRect(), lh = parseFloat(getComputedStyle(p).lineHeight)
  const lines = Math.round(b.height / lh)
  return Array.from({ length: lines }, (_, i) => {
    const y = b.top + lh * (i + 0.5)
    if (y < 0 || y > innerHeight) return 'utenfor'
    const hit = document.elementFromPoint(b.left + 12, y)
    if (!hit || !(p === hit || p.contains(hit))) return `dekket av «${(hit?.innerText || hit?.tagName || '').trim().slice(0, 40)}»`
    return 'synlig'
  })
})

// visible: hele beskrivelsen synes uten scrolling. Ellers: den kan scrolles fram, og da ligger ingenting over den.
async function checkDescription(page, card, label, { visible }) {
  if (visible) {
    const lines = await descriptionLines(page, card.description)
    const bad = lines.map((s, i) => [i + 1, s]).filter(([, s]) => s !== 'synlig')
    assert(!bad.length, `${label}: beskrivelsen av «${card.title}» synes ikke uten scrolling: ${bad.map(([i, s]) => `linje ${i} ${s}`).join(', ')}`)
  }
  await page.getByText(card.description.slice(0, 40)).evaluate(p => p.scrollIntoView({ block: 'nearest' }))
  const lines = await descriptionLines(page, card.description)
  const bad = lines.map((s, i) => [i + 1, s]).filter(([, s]) => s !== 'synlig')
  assert(!bad.length, `${label}: beskrivelsen av «${card.title}» kan ikke leses selv etter scrolling: ${bad.map(([i, s]) => `linje ${i} ${s}`).join(', ')}`)
  await scrollToTop(page)
}

async function checkButtons(page, label, { visible = true } = {}) {
  if (!visible) { // må kunne scrolles fram, og da ligger ingenting over dem
    await page.getByRole('button', { name: 'Vil ha' }).evaluate(el => el.scrollIntoView({ block: 'nearest' }))
    await fullyVisible(page.getByRole('button', { name: 'Nei takk' }), `${label}: «Nei takk» etter scrolling`)
    await fullyVisible(page.getByRole('button', { name: 'Vil ha' }), `${label}: «Vil ha» etter scrolling`)
    await scrollToTop(page)
    return
  }
  await fullyVisible(page.getByRole('button', { name: 'Nei takk' }), `${label}: «Nei takk»`)
  await fullyVisible(page.getByRole('button', { name: 'Vil ha' }), `${label}: «Vil ha»`)
}

const FULL = [{ width: 375, height: 667 }, { width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]
// Synlig høyde med adresselinjen: iPhone SE, mini/X/11 Pro, 12–16, Plus/Pro Max og en vanlig Android
const VISIBLE = [{ width: 375, height: 548 }, { width: 375, height: 635 }, { width: 390, height: 664 }, { width: 430, height: 746 }, { width: 412, height: 780 }]
const SESSIONS = [{ who: 'vanlig bruker', email: null }, { who: 'demo', email: 'mona.demo@heirsplit.no' }]

for (const vp of [...FULL, ...VISIBLE]) {
  for (const textSize of [null, 'xlarge']) {
    for (const { who, email } of SESSIONS) {
      // «Vanlig mobil»: alt skal synes uten scrolling. Ellers kan beskrivelsen kreve scrolling, men aldri ligge under noe.
      const normal = !textSize && (vp.height >= 800 || (vp.width >= 390 && vp.height >= 664))
      const buttonsAlways = vp.height >= 635
      const label = `${vp.width}×${vp.height}${textSize ? ', Ekstra stor' : ''}, ${who}`
      await check(`Sveip ${label}: første kort, «Vil ha», neste kort med angrelinjen, «Si hvorfor», «Nei takk», tredje kort`, async page => {
        await decisionsTables(page)
        await page.goto(`${BASE}/estate/${EST}/swipe`)
        await page.getByRole('heading', { name: CARDS[0].title }).waitFor()
        if (email) await page.getByText(/Du ser på en/).waitFor() // demobanneret er med i høyden
        await page.evaluate(() => document.fonts.ready)

        // 1. Første kort
        assert(!(await pageScrolled(page)), 'siden er scrollet fra start')
        await checkButtons(page, 'første kort', { visible: buttonsAlways })
        if (buttonsAlways) await fullyVisible(page.getByRole('heading', { name: CARDS[0].title }), 'første kort: tittelen')
        await checkDescription(page, CARDS[0], 'første kort', { visible: normal })

        // 2. «Vil ha» → neste kort, med «Du vil ha …», «Angre» og «+ Si hvorfor» under
        await page.getByRole('button', { name: 'Vil ha' }).click()
        await page.getByText(`Du vil ha «${CARDS[0].title}»`).waitFor()
        await page.getByRole('heading', { name: CARDS[1].title }).waitFor()
        await checkButtons(page, 'etter «Vil ha»', { visible: buttonsAlways })
        if (buttonsAlways) await fullyVisible(page.getByRole('button', { name: 'Angre' }), 'etter «Vil ha»: «Angre»')
        if (normal) await fullyVisible(page.getByRole('heading', { name: CARDS[1].title }), 'etter «Vil ha»: tittelen på neste kort')
        await checkDescription(page, CARDS[1], 'etter «Vil ha»', { visible: normal })

        // 3. «+ Si hvorfor»: feltet åpnes under kortet; beskrivelsen skal fortsatt kunne leses
        await page.getByRole('button', { name: '+ Si hvorfor' }).click()
        const field = page.getByLabel(/Hvorfor vil du ha/)
        await field.waitFor()
        await checkDescription(page, CARDS[1], 'med begrunnelsesfeltet', { visible: false })
        await field.evaluate(el => el.scrollIntoView({ block: 'nearest' }))
        await fullyVisible(field, 'begrunnelsesfeltet')
        await checkButtons(page, 'med begrunnelsesfeltet', { visible: normal })
        await scrollToTop(page)

        // 4. «Nei takk» → tredje kort, med «Nei takk til …» og «Angre»
        await page.getByRole('button', { name: 'Nei takk' }).click()
        await page.getByText(`Nei takk til «${CARDS[1].title}»`).waitFor()
        await page.getByRole('heading', { name: CARDS[2].title }).waitFor()
        await checkButtons(page, 'etter «Nei takk»', { visible: buttonsAlways })
        if (normal) await fullyVisible(page.getByRole('heading', { name: CARDS[2].title }), 'etter «Nei takk»: tittelen på tredje kort')
        await checkDescription(page, CARDS[2], 'etter «Nei takk»', { visible: normal })
      }, { viewport: vp, textSize, email, fixtures })
    }
  }
}

const imageHeight = page => page.getByRole('heading', { name: CARDS[0].title }).evaluate(h => h.parentElement.previousElementSibling.getBoundingClientRect().height)
for (const [vp, email, expect] of [
  [{ width: 375, height: 548 }, 'mona.demo@heirsplit.no', 'min'], [{ width: 390, height: 664 }, 'mona.demo@heirsplit.no', 'min'],
  [{ width: 390, height: 844 }, null, 320], [{ width: 430, height: 932 }, 'mona.demo@heirsplit.no', 320], [{ width: 1280, height: 900 }, null, 320],
]) {
  await check(`Sveip ${vp.width}×${vp.height}${email ? ', demo' : ''}: bildet er ${expect === 'min' ? 'minst 96 px' : '320 px som før'}`, async page => {
    await decisionsTables(page)
    await page.goto(`${BASE}/estate/${EST}/swipe`)
    await page.getByRole('heading', { name: CARDS[0].title }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    const h = await imageHeight(page)
    if (expect === 'min') assert(h >= 95.5, `bildet er bare ${Math.round(h)} px`)
    else assert(Math.round(h) === expect, `bildet er ${Math.round(h)} px, ventet ${expect}`)
    if (vp.width >= 1000) await checkButtons(page, 'desktop')
  }, { viewport: vp, email, fixtures })
}

await browser.close()
console.log(results.join('\n'))
const failed = results.filter(r => r.startsWith('FAIL'))
console.log(`\n${results.length - failed.length}/${results.length} sveipesjekker OK`)
process.exit(failed.length ? 1 : 0)
