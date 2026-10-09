// Akseptansetester for «Sammenlign med markedet» på gjenstandssiden (M1): søkelenker, familiens egne
// sammenligninger og verdianslaget fra estimate-value, i Chromium med simulert Supabase. Kjøres av test/e2e/run.sh.
import { BASE, EST, UID, ITEM, FIXTURES, launch, checker, assert } from './fixtures.mjs'

const browser = await launch()
const results = []
const check = checker(browser, results)

const ref = (n, price) => ({ id: `r${n}`, title: `Gyngestol eik ${n}`, price, price_type: 'sold_price', url: `https://www.finn.no/${n}`, date: '2026-09-1' + n, by: UID, at: '2026-10-01T00:00:00Z' })
const withRefs = refs => ({ fixtures: { items: [{ ...FIXTURES.items[0], ai_analysis: { v: 2, meta: {}, ai: null, review: {}, corrections: { references: refs }, valuation: null } }] } })
const patches = page => {
  const bodies = []
  page.on('request', r => { if (r.method() === 'PATCH' && r.url().includes('/rest/v1/items')) bodies.push(JSON.parse(r.postData() || '{}')) })
  return bodies
}
const open = async page => {
  await page.goto(`${BASE}/estate/${EST}/item/${ITEM}`)
  await page.getByText('Sammenlign med markedet').click()
}

await check('Søkelenker til FINN og Tradera ut fra navnet, åpnes i ny fane', async page => {
  await open(page)
  const finn = page.getByRole('link', { name: /Søk på FINN/ })
  assert(await finn.getAttribute('href') === 'https://www.finn.no/recommerce/forsale/search?q=Gyngestol', `feil FINN-lenke: ${await finn.getAttribute('href')}`)
  assert(await finn.getAttribute('target') === '_blank', 'åpnes ikke i ny fane')
  await page.getByRole('link', { name: /Søk på Tradera/ }).waitFor()
})

await check('Legg til en sammenligning: lagres i ai_analysis.corrections.references, også uten AI-analyse; ugyldig pris gir melding', async page => {
  const sent = patches(page)
  await open(page)
  await page.getByRole('button', { name: 'Legg til en sammenligning' }).click()
  await page.getByLabel('Hva er det?').fill('Gyngestol i eik, FINN')
  await page.getByLabel('Pris i kroner').fill('null')
  await page.getByRole('button', { name: 'Lagre sammenligningen' }).click()
  await page.getByRole('alert').getByText(/Skriv prisen i kroner/).waitFor()
  assert(sent.length === 0, 'lagret med ugyldig pris')
  await page.getByLabel('Pris i kroner').fill('1 200')
  await page.getByLabel('Lenke (valgfri)').fill('https://www.finn.no/recommerce/forsale/item/1')
  await page.getByRole('button', { name: 'Lagre sammenligningen' }).click()
  await page.getByText('Sammenligningen er lagt til').waitFor()
  const refs = sent[0]?.ai_analysis?.corrections?.references
  assert(refs?.length === 1, 'sammenligningen ble ikke sendt')
  assert(refs[0].price === 1200 && refs[0].price_type === 'sold_price' && refs[0].by === UID && refs[0].url.endsWith('/item/1'), `feil innhold: ${JSON.stringify(refs[0])}`)
  assert(sent[0].ai_analysis.ai === null, 'gjenstanden uten analyse fikk et AI-forslag')
})

await check('Anslå verdi med tre sammenligninger: markedsbasert, spenn i treff, og «Bruk som verdi» lagrer verdi og anslag', async page => {
  const sent = patches(page)
  await page.route('https://test.supabase.co/functions/v1/estimate-value', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {
    v: 3, status: 'ok', method: 'market_sold', price_type: 'sold_price', range_kind: 'hits', market_area: 'NO', currency: 'NOK',
    estimate: { low: 900, likely: 1200, high: 1500 }, confidence: 'medium', uncertainty: { widened: false, reasons: ['family_reported'] },
    stats: { n_used: 3 }, explanation: 'Basert på 3 salgspriser oppgitt av familien. Spenn i 3 treff: 900 kr–1 500 kr, median 1 200 kr.',
    references: [], queries: ['Gyngestol'], links: [], summary: { low_nok: 900, likely_nok: 1200, high_nok: 1500 },
  } }) }))
  await page.addInitScript(() => localStorage.setItem('aiConsented', 'true'))
  await open(page)
  await page.getByText('Gyngestol eik 1').waitFor()
  await page.getByRole('button', { name: 'Anslå verdi' }).click()
  await page.getByText('Anslag ut fra sammenligningene').waitFor()
  await page.getByText(/Spenn i 3 treff/).first().waitFor()
  await page.getByText(/Basert på 3 salgspriser oppgitt av familien/).waitFor()
  await page.getByRole('button', { name: /^Bruk .*1\s?200.* som verdi$/ }).click()
  await page.getByText('Verdien er lagret').waitFor()
  const b = sent[0]
  assert(b.estimated_value === 1200 && b.estimate_confidence === 'medium', `feil verdi: ${JSON.stringify(b)}`)
  assert(b.ai_analysis.valuation.method === 'market_sold' && b.ai_analysis.valuation.range_kind === 'hits', 'anslaget ble ikke lagret i ai_analysis.valuation')
  assert(b.ai_analysis.corrections.references.length === 3, 'sammenligningene forsvant')
}, withRefs([ref(1, 900), ref(2, 1200), ref(3, 1500)]))

await check('Arving på andres gjenstand: ser sammenligningene og søkelenkene, men kan ikke endre eller anslå', async page => {
  await open(page)
  await page.getByText('Gyngestol eik 1').waitFor()
  for (const name of ['Legg til en sammenligning', 'Anslå verdi', 'Fjern «Gyngestol eik 1»']) assert(await page.getByRole('button', { name }).count() === 0, `«${name}» vises`)
}, { fixtures: { ...withRefs([ref(1, 900)]).fixtures, items: [{ ...withRefs([ref(1, 900)]).fixtures.items[0], added_by: 'annen' }],
  estate_members: [{ ...FIXTURES.estate_members[0], role: 'member' }] } })

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
