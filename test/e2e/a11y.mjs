// Automatisk tilgjengelighetssjekk (axe-core, WCAG 2.2 A/AA) av nøkkelsidene, i Chromium med simulert Supabase.
// Feiler ved brudd med alvorlighet «serious» eller «critical». Kjøres av test/e2e/run.sh.
import { BASE, EST, ITEM, setup, launch, checker, assert } from './fixtures.mjs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const AXE = require.resolve('axe-core/axe.min.js')
async function audit(page, path, ready) {
  await page.goto(`${BASE}${path}`)
  await page.getByText(ready).first().waitFor({ timeout: 15000 })
  await page.addScriptTag({ path: AXE })
  return page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.filter(v => ['serious', 'critical'].includes(v.impact))
      .map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)
  })
}

const PAGES = [
  { path: '/logg-inn', ready: /Logg inn/, loggedIn: false },
  { path: '/', ready: 'Testbo' },
  { path: `/estate/${EST}`, ready: 'Gyngestol' },
  { path: `/estate/${EST}/item/${ITEM}`, ready: 'Gyngestol' },
  { path: `/estate/${EST}/swipe`, ready: 'Gyngestol' },
  { path: `/estate/${EST}/heirs`, ready: 'Kari' },
  { path: `/estate/${EST}/admin`, ready: 'ABC123' },
  { path: `/estate/${EST}/status`, ready: /Hva gjenstår/ },
  { path: '/konto', ready: /Min konto/ },
]

const browser = await launch()
const results = []
for (const p of PAGES) {
  const { ctx, page } = await setup(browser, { loggedIn: p.loggedIn !== false })
  try {
    const v = await audit(page, p.path, p.ready)
    results.push(v.length ? `FAIL axe ${p.path}:\n  ${v.join('\n  ')}` : `OK   axe ${p.path}`)
  } catch (e) {
    results.push(`FAIL axe ${p.path}: ${e.message.split('\n')[0]}`)
  }
  await ctx.close()
}
const check = checker(browser, results)

await check('Tastatur: bokortet åpnes med Enter', async page => {
  await page.goto(`${BASE}/`)
  const card = page.getByRole('link', { name: 'Åpne Testbo' })
  await card.focus()
  await page.keyboard.press('Enter')
  await page.waitForURL(`**/estate/${EST}`)
})

await check('Dialog: fokus på «Avbryt», Esc lukker, fokus tilbake til «Slett»', async page => {
  await page.goto(`${BASE}/estate/${EST}`)
  const del = page.getByRole('button', { name: 'Slett «Gyngestol»' })
  await del.click()
  await page.getByRole('dialog', { name: 'Slett gjenstand' }).waitFor()
  assert(await page.evaluate(() => document.activeElement?.textContent) === 'Avbryt', 'fokus er ikke på Avbryt')
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    assert(await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'fokus forlot dialogen')
  }
  await page.keyboard.press('Escape')
  assert(await page.getByRole('dialog').count() === 0, 'dialogen ble ikke lukket')
  assert(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Slett «Gyngestol»', 'fokus kom ikke tilbake')
})

await check('Feilmelding blir stående til den lukkes (role=alert)', async page => {
  await page.goto(`${BASE}/estate/${EST}/heirs`)
  await page.getByRole('button', { name: '+ Legg til arving' }).click()
  await page.getByLabel('Fullt navn *').fill('Lars')
  await page.getByLabel('E-post (den arvingen logger inn med)').fill('ikke-en-epost')
  await page.getByRole('button', { name: 'Legg til arving', exact: true }).click()
  const alert = page.getByRole('alert').filter({ hasText: 'Ugyldig e-postadresse' })
  await alert.waitFor()
  await page.waitForTimeout(5000)
  assert(await alert.count() === 1, 'feilmeldingen forsvant av seg selv')
  await page.getByRole('button', { name: 'Lukk feilmeldingen' }).click()
  assert(await alert.count() === 0, 'feilmeldingen ble ikke lukket')
})

// Ekstra stor tekst (135 %) på liten skjerm: ingen horisontal rulling, og ingen tekst som kuttes
for (const p of PAGES) {
  const { ctx, page } = await setup(browser, { loggedIn: p.loggedIn !== false, viewport: { width: 360, height: 740 }, textSize: 'xlarge' })
  try {
    await page.goto(`${BASE}${p.path}`)
    await page.getByText(p.ready).first().waitFor({ timeout: 15000 })
    const r = await page.evaluate(() => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize)
      const wide = document.documentElement.scrollWidth > window.innerWidth + 1
      const cut = [...document.querySelectorAll('button, a, label, p, span, h1, h2, h3, li')]
        .filter(el => el.offsetParent && el.textContent.trim() && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2
          && !['auto', 'scroll'].includes(getComputedStyle(el).overflowX))
        .slice(0, 3).map(el => el.textContent.trim().slice(0, 30))
      return { root, wide, cut }
    })
    if (r.root < 21) throw new Error(`grunnstørrelsen er ${r.root}px, ventet ca. 21,6px`)
    if (r.wide) throw new Error('horisontal rulling')
    if (r.cut.length) throw new Error(`kuttet tekst: ${r.cut.join(' | ')}`)
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/xl${p.path.replace(/[^a-z]+/gi, '-')}.png`, fullPage: true })
    results.push(`OK   135 % ${p.path}`)
  } catch (e) {
    results.push(`FAIL 135 % ${p.path}: ${e.message.split('\n')[0]}`)
  }
  await ctx.close()
}

await check('Tekststørrelse: «Ekstra stor» i profilmenyen gjør teksten større og huskes', async page => {
  await page.goto(`${BASE}/`)
  await page.getByText('Testbo').first().waitFor()
  const before = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  await page.getByRole('button', { name: /Meny for/ }).click()
  await page.getByRole('button', { name: 'Ekstra stor', exact: true }).click()
  const after = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  assert(Math.abs(after / before - 1.35) < 0.02, `skala ${after / before}`)
  await page.reload()
  await page.getByText('Testbo').first().waitFor()
  const reloaded = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  assert(Math.abs(reloaded - after) < 0.1, 'valget ble ikke husket')
})

await browser.close()
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
