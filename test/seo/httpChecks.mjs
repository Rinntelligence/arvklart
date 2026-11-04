// HTTP-sjekkene for teknisk SEO: det søkemotorene får før JavaScript. Kjøres både mot den lokale etterligningen
// av Vercel (test/e2e/seo.mjs) og mot en ekte utrulling (scripts/check-seo.mjs), siden etterligningen ikke er
// bevis for hvordan Vercel tolker omskrivinger og hoder.
//
// preview: Vercel legger selv X-Robots-Tag: noindex på forhåndsvisninger (ikke-produksjonsdomener). Der kan
// fraværet av noindex på offentlige sider ikke bevises; sjekken rapporteres som SKIP og må gjøres mot produksjon.
import { gzipSync } from 'node:zlib'
import { PUBLIC_PAGES, SITE_URL, organizationJsonLd, websiteJsonLd } from '../../src/seo/pages.js'

// JavaScript som lastes før en offentlig side er interaktiv (gzip). Før code splitting: 371 kB. Se test/e2e/chunks.mjs.
export const JS_BUDGET_GZIP = 175 * 1024

export const H1_NO = 'Arvefordeling gjort enklere og inkluderende'
const PRIVATE = ['/app', '/logg-inn', '/nytt-passord', '/join/ABC123', '/estate/22222222-0000-0000-0000-000000000001',
  '/estate/22222222-0000-0000-0000-000000000001/fordeling', '/konto', '/founder', '/setup',
  '/kontakt.html', '/index.html', '/shell.html']
// Ukjente adresser, utkast (mal-for-guide er et utkast i content/guider) og interne filnavn: ekte 404
export const NOT_FOUND = ['/finnes-ikke', '/guider/finnes-ikke', '/guider/mal-for-guide', '/guider', '/a/b', '/index', '/shell', '/home.html']

// Stiene som alltid vises i rapporten (status og hoder), så reglene kan leses av ekte svar
export const REPORT_PATHS = ['/', '/home', '/kontakt', '/personvern', '/veiviser', '/veiviser.html', '/arveveiviser/ramme.html', '/robots.txt', '/sitemap.xml',
  '/app', '/logg-inn', '/nytt-passord', '/join/ABC123', '/estate/x', '/konto', '/finnes-ikke', '/guider/finnes-ikke', '/a/b', '/home.html', '/shell.html']

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }
const PERMANENT = [301, 308]

// Vercel Deployment Protection (innlogging hos Vercel) svarer 401, eller sender videre til vercel.com / _vercel_sso.
export function isVercelProtection(status, location) {
  if (status === 401) return true
  return status >= 300 && status < 400 && /vercel\.com|_vercel_sso|\/sso-api/i.test(location || '')
}

// Kanonisk domene: apex og http skal sende permanent (301/308) til https://www.… med samme sti (forsiden og en underside).
export async function domainChecks({ fetchImpl = fetch, site = SITE_URL, paths = ['/', '/kontakt'] } = {}) {
  const results = []
  const host = new URL(site).host
  const apex = host.replace(/^www\./, '')
  for (const path of paths) for (const from of [`https://${apex}${path}`, `http://${host}${path}`]) {
    const target = `${site}${path}`
    const name = `${from} sendes permanent til ${target}`
    try {
      const r = await fetchImpl(from, { redirect: 'manual' })
      const location = r.headers.get('location') || ''
      const resolved = location ? new URL(location, from).href : ''
      assert(r.status >= 300 && r.status < 400, `status ${r.status}, ingen videresending`)
      assert(resolved === target, `${r.status} til ${resolved || '(ingen location)'}`)
      assert(PERMANENT.includes(r.status), `${r.status} er midlertidig; bør være 301 eller 308 (Vercel → Domains)`)
      results.push(`OK   ${name} (${r.status})`)
    } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`) }
  }
  return results
}

// Rapport: faktisk status og hoder per sti (det som ble svart, uten tolkning)
export async function httpReport(base, { headers = {}, fetchImpl = fetch } = {}) {
  const rows = []
  for (const path of REPORT_PATHS) {
    try {
      const r = await fetchImpl(base + path, { headers, redirect: 'manual' })
      const h = (k) => r.headers.get(k) ?? '–'
      rows.push(`INFO ${path.padEnd(16)} ${String(r.status).padEnd(4)} x-robots-tag=${h('x-robots-tag')}  regel=${h('x-arvklart-robots')}  content-type=${h('content-type')}${r.headers.get('location') ? `  location=${r.headers.get('location').split('?')[0]}` : ''}`)
    } catch (e) { rows.push(`INFO ${path.padEnd(16)} feil: ${e.message}`) }
  }
  return rows
}

export async function runHttpChecks(base, { headers = {}, preview = false, fetchImpl = fetch } = {}) {
  const results = []
  const sitemapEntries = [] // fra den utrullede sitemap.xml
  const seen = new Map()
  const get = async (path) => {
    if (!seen.has(path)) {
      seen.set(path, (async () => {
        const r = await fetchImpl(base + path, { headers, redirect: 'manual' })
        return { status: r.status, headers: r.headers, body: await r.text() }
      })())
    }
    return seen.get(path)
  }
  const robotsTag = (r) => r.headers.get('x-robots-tag')
  // Speilet av våre noindex-regler (vercel.json). Vercel setter det aldri selv, så det viser også på en
  // forhåndsvisning (der Vercel legger noindex på alt) hvilke stier reglene våre treffer.
  const ruleTag = (r) => r.headers.get('x-arvklart-robots')
  const noRule = (path, r) => assert(!ruleTag(r), `${path} treffes av noindex-regelen (X-Arvklart-Robots: ${ruleTag(r)})`)
  const check = async (name, fn) => {
    try { const note = await fn(); results.push(note ? `SKIP ${name}: ${note}` : `OK   ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`) }
  }
  // Beskyttet utrulling: alt ville gitt misvisende feil. Én tydelig feil i stedet, aldri godkjent.
  const probe = await get('/robots.txt')
  if (isVercelProtection(probe.status, probe.headers.get('location'))) {
    results.push(`FAIL Utrullingen er beskyttet (Vercel Deployment Protection, ${probe.status}${probe.headers.get('location') ? ` til ${probe.headers.get('location').split('?')[0]}` : ''}): `
      + (headers['x-vercel-protection-bypass'] ? 'hemmeligheten VERCEL_AUTOMATION_BYPASS_SECRET ble avvist' : 'sett VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Settings → Deployment Protection → Protection Bypass for Automation)')
      + '. Ingenting er sjekket.')
    return results
  }
  // Offentlige sider: ingen noindex fra oss. På en forhåndsvisning kommer noindex fra Vercel og kan ikke skilles fra vår.
  const notNoindexed = (path, r) => {
    noRule(path, r)
    if (!robotsTag(r)) return null
    if (preview) return `X-Robots-Tag «${robotsTag(r)}» på ${path}: Vercel setter noindex på forhåndsvisninger, sjekk mot produksjon`
    throw new Error(`${path} har X-Robots-Tag: ${robotsTag(r)}`)
  }

  await check('robots.txt og sitemap.xml serveres som filer, ikke som appen', async () => {
    const robots = await get('/robots.txt')
    assert(robots.status === 200 && robots.headers.get('content-type')?.startsWith('text/plain'), `robots.txt: ${robots.status} ${robots.headers.get('content-type')}`)
    assert(robots.body.includes(`Sitemap: ${SITE_URL}/sitemap.xml`) && !robots.body.includes('<html'), 'robots.txt har feil innhold')
    const sitemap = await get('/sitemap.xml')
    assert(sitemap.status === 200 && /xml/.test(sitemap.headers.get('content-type') || ''), `sitemap.xml: ${sitemap.status} ${sitemap.headers.get('content-type')}`)
    assert(sitemap.body.startsWith('<?xml') && sitemap.body.includes('<urlset'), 'sitemap.xml er ikke XML')
    const entries = [...sitemap.body.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map(m => ({ loc: m[1], lastmod: m[2] || null }))
    assert(entries.length === (sitemap.body.match(/<url>/g) || []).length, 'sitemap.xml har <url> på ukjent form')
    const locs = entries.map(e => e.loc)
    for (const p of PUBLIC_PAGES.filter(p => p.sitemap)) assert(locs.includes(SITE_URL + p.path), `${p.path} mangler i sitemap`)
    for (const loc of locs) {
      assert(loc.startsWith(`${SITE_URL}/`), `${loc} er ikke på ${SITE_URL}`)
      const path = new URL(loc).pathname
      assert(PUBLIC_PAGES.some(p => p.path === path) || /^\/guider\/[a-z0-9-]+$/.test(path), `uventet adresse i sitemap: ${loc}`)
    }
    assert(new Set(locs).size === locs.length, 'en adresse står flere ganger i sitemap')
    for (const e of entries) if (e.lastmod) assert(/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod), `lastmod ${e.lastmod}`)
    sitemapEntries.push(...entries)
    noRule('/robots.txt', robots)
    noRule('/sitemap.xml', sitemap)
  })

  // Hver adresse i den utrullede sitemap.xml (også nye guider, uten endring her): forhåndsrendret, riktig canonical
  for (const { loc, lastmod } of sitemapEntries) {
    const path = new URL(loc).pathname
    const known = PUBLIC_PAGES.find(p => p.path === path)
    if (known && !known.prerender) continue // rendres i nettleseren; sjekkes under
    await check(`${path} uten JavaScript: forhåndsrendret, én canonical, metadata og ingen noindex`, async () => {
      const r = await get(path)
      assert(r.status === 200, `status ${r.status}`)
      assert(!/name="robots"|noindex/.test(r.body), 'noindex i HTML-en')
      const canon = [...r.body.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1])
      assert(canon.length === 1 && canon[0] === loc, `canonical: ${canon} (sitemap: ${loc})`)
      assert((r.body.match(/<title>/g) || []).length === 1 && (!known || r.body.includes(`<title>${known.title}</title>`)), 'tittelen mangler eller står flere ganger')
      for (const t of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) assert(r.body.includes(t), `${t} mangler`)
      assert(/<div id="root" data-prerendered><.+<h1[\s>]/s.test(r.body), 'innholdet er ikke forhåndsrendret')
      assert((r.body.match(/<h1[\s>]/g) || []).length === 1, 'skal ha nøyaktig én <h1>')
      assert(/<script type="module" crossorigin src="\/assets\/index-[^"]+\.js">/.test(r.body), 'appens skript mangler')
      if (path.startsWith('/guider/')) {
        const ld = [...r.body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]))
        const article = ld.find(x => x['@type'] === 'Article')
        const crumbs = ld.find(x => x['@type'] === 'BreadcrumbList')
        assert(r.body.includes('<meta property="og:type" content="article" />'), 'og:type er ikke article')
        if (article) {
          assert(article.mainEntityOfPage === loc && article.headline && article.datePublished, 'Article mangler felt')
          assert(crumbs?.itemListElement?.at(-1)?.item === loc, 'BreadcrumbList peker ikke på guiden')
          if (lastmod) assert(lastmod === (article.dateModified || article.datePublished), `lastmod ${lastmod} er ikke guidens dato`)
        }
        assert(/<script type="application\/json" id="page-data">/.test(r.body), 'guidens innhold mangler for nettleseren')
      }
      return notNoindexed(path, r)
    })
  }

  await check('/home sendes permanent til forsiden «/»', async () => {
    const r = await get('/home')
    const location = r.headers.get('location') || ''
    assert([301, 308].includes(r.status), `/home: status ${r.status} (forventet 301/308)`)
    assert(new URL(location, `${base}/home`).pathname === '/', `/home sendes til ${location}`)
  })

  await check('Forsiden «/» uten JavaScript: tekst, lenkene til de offentlige sidene, WebSite og Organization', async () => {
    const { body } = await get('/')
    for (const text of [H1_NO, 'Én rolig, tydelig vei gjennom en vanskelig prosess.', 'Rettferdig, ikke bare likt', 'Test ut demo nå'])
      assert(body.includes(text), `mangler «${text}»`)
    for (const href of ['/veiviser', '/kontakt', '/personvern', '/logg-inn']) assert(body.includes(`href="${href}"`), `lenken til ${href} mangler`)
    assert(!/&gt;|&#x27;/.test(body.match(/<div id="root"[\s\S]*?<\/style>/)?.[0] || ''), 'CSS-en i <style> er HTML-kodet')
    const ld = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]))
    assert(JSON.stringify(ld) === JSON.stringify([websiteJsonLd(), organizationJsonLd()]), `JSON-LD: ${JSON.stringify(ld)}`)
  })

  await check('Offentlige sider uten forhåndsrendering: appens skall uten canonical, og ingen noindex', async () => {
    const notes = []
    for (const page of PUBLIC_PAGES.filter(p => !p.prerender)) {
      const r = await get(page.path)
      assert(r.status === 200, `${page.path}: status ${r.status}`)
      assert(!/rel="canonical"|noindex|ld\+json/.test(r.body), `${page.path}: skallet skal ikke ha canonical, noindex eller JSON-LD`)
      const note = notNoindexed(page.path, r)
      if (note) notes.push(note)
    }
    return notes.join('; ') || null
  })

  await check('Ukjente adresser, utkast og interne filnavn gir HTTP 404 med 404-siden', async () => {
    for (const path of NOT_FOUND) {
      const r = await get(path)
      assert(r.status === 404, `${path}: status ${r.status} (forventet 404)`)
      assert(r.body.includes('Fant ikke siden'), `${path}: 404-siden vises ikke`)
      assert(r.headers.get('content-security-policy')?.includes("frame-ancestors 'self'"), `${path}: sikkerhetshodene mangler`)
    }
  })

  await check('Appen (/app, /estate/…), innlogging og invitasjoner får X-Robots-Tag: noindex', async () => {
    for (const path of PRIVATE) {
      const r = await get(path)
      assert(r.status === 200, `${path}: status ${r.status}`)
      assert(/(^|,\s*)noindex(\s*,|$)/.test(robotsTag(r) || ''), `${path}: X-Robots-Tag er ${robotsTag(r)}`)
      assert(ruleTag(r) === 'noindex', `${path}: treffes ikke av noindex-regelen i vercel.json (X-Arvklart-Robots: ${ruleTag(r)})`)
      assert(!r.body.includes('rel="canonical"') || path.endsWith('.html'), `${path}: skallet har canonical`)
    }
    // Rammen (iframen fra et bo) er ikke en egen side: noindex, uten indexifembedded (innholdet står på /veiviser)
    const frame = await get('/arveveiviser/ramme.html')
    assert(frame.status === 200 && ruleTag(frame) === 'noindex', `/arveveiviser/ramme.html: ${frame.status} ${ruleTag(frame)}`)
  })

  await check('/veiviser uten JavaScript: hele veiviseren står i HTML-en (ingen iframe); /veiviser.html sendes permanent dit', async () => {
    const r = await get('/veiviser')
    assert(r.status === 200, `status ${r.status}`)
    assert(/<main id="veiviser" data-veiviser-host>/.test(r.body) && !/<iframe/.test(r.body), 'veiviseren står ikke i siden')
    for (const text of ['Arveveiviser: fra dødsfall til fordelt bo, steg for steg', 'Hvem arver – og hvor mye?', 'Hvem arver etter loven?', 'Prosessen i fem faser', 'Rett etter dødsfallet',
      'Søke <strong>skifteattest</strong> hos tingretten', 'Pliktdelsarv', 'Jussformidlingen i Bergen', 'Klar for å fordele eiendelene?'])
      assert(r.body.includes(text), `mangler «${text}»`)
    const old = await get('/veiviser.html')
    assert(PERMANENT.includes(old.status) && new URL(old.headers.get('location') || '', base + '/').pathname === '/veiviser', `/veiviser.html: ${old.status} ${old.headers.get('location')}`)
  })

  await check(`Offentlige sider: første JavaScript er innenfor budsjettet (${JS_BUDGET_GZIP / 1024} kB gzip)`, async () => {
    const sizes = []
    const prerendered = [...new Set(['/', ...sitemapEntries.map(e => new URL(e.loc).pathname)])].filter(p => !PUBLIC_PAGES.some(x => x.path === p && !x.prerender))
    for (const page of prerendered.map(path => ({ path }))) {
      const files = [...new Set([...(await get(page.path)).body.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]))]
      assert(files.length > 0, `${page.path}: fant ingen skript`)
      let gz = 0
      for (const f of files) {
        const r = await get(f)
        assert(r.status === 200 && /javascript/.test(r.headers.get('content-type') || ''), `${f}: ${r.status} ${r.headers.get('content-type')}`)
        gz += gzipSync(Buffer.from(r.body)).length
      }
      assert(gz <= JS_BUDGET_GZIP, `${page.path}: ${Math.round(gz / 1024)} kB gzip er over budsjettet`)
      sizes.push(`${page.path} ${Math.round(gz / 1024)} kB`)
    }
    results.push(`INFO JavaScript før interaktiv (gzip): ${sizes.join(', ')}`)
  })

  await check('Sikkerhetshodene sendes på sidene, appen og robots.txt', async () => {
    for (const path of ['/', '/app', '/kontakt', '/estate/x', '/veiviser', '/arveveiviser/ramme.html', '/robots.txt', '/sitemap.xml', '/finnes-ikke']) {
      const h = (await get(path)).headers
      assert(h.get('content-security-policy')?.startsWith("default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com"), `CSP mangler på ${path}`)
      assert(!/unsafe-eval/.test(h.get('content-security-policy')) && !/script-src[^;]*'unsafe-inline'/.test(h.get('content-security-policy')), `CSP tillater eval eller skript i HTML-en på ${path}`)
      assert(h.get('content-security-policy')?.includes("frame-ancestors 'self'"), `frame-ancestors mangler på ${path}`)
      assert(h.get('x-frame-options') === 'SAMEORIGIN' && h.get('x-content-type-options') === 'nosniff', `hodene mangler på ${path}`)
      assert(h.get('permissions-policy')?.includes('camera=(self)'), `Permissions-Policy mangler på ${path}`)
    }
  })

  return results
}
