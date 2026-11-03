// HTTP-sjekkene for teknisk SEO: det søkemotorene får før JavaScript. Kjøres både mot den lokale etterligningen
// av Vercel (test/e2e/seo.mjs) og mot en ekte utrulling (scripts/check-seo.mjs), siden etterligningen ikke er
// bevis for hvordan Vercel tolker omskrivinger og hoder.
//
// preview: Vercel legger selv X-Robots-Tag: noindex på forhåndsvisninger (ikke-produksjonsdomener). Der kan
// fraværet av noindex på offentlige sider ikke bevises; sjekken rapporteres som SKIP og må gjøres mot produksjon.
import { PUBLIC_PAGES, SITE_URL, organizationJsonLd } from '../../src/seo/pages.js'

export const H1_NO = 'Arvefordeling gjort enklere og inkluderende'
const PRIVATE = ['/', '/logg-inn', '/nytt-passord', '/join/ABC123', '/estate/22222222-0000-0000-0000-000000000001',
  '/estate/22222222-0000-0000-0000-000000000001/fordeling', '/konto', '/founder', '/setup', '/finnes-ikke',
  '/home.html', '/kontakt.html', '/index.html']

const assert = (cond, msg) => { if (!cond) throw new Error(msg) }

export async function runHttpChecks(base, { headers = {}, preview = false } = {}) {
  const results = []
  const get = async (path) => {
    const r = await fetch(base + path, { headers, redirect: 'manual' })
    return { status: r.status, headers: r.headers, body: await r.text() }
  }
  const robotsTag = (r) => r.headers.get('x-robots-tag')
  const check = async (name, fn) => {
    try { const note = await fn(); results.push(note ? `SKIP ${name}: ${note}` : `OK   ${name}`) } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`) }
  }
  // Offentlige sider: ingen noindex fra oss. På en forhåndsvisning kommer noindex fra Vercel og kan ikke skilles fra vår.
  const notNoindexed = (path, r) => {
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
    const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
    assert(JSON.stringify(locs) === JSON.stringify(PUBLIC_PAGES.filter(p => p.sitemap).map(p => SITE_URL + p.path)), `uventede URL-er: ${locs}`)
  })

  for (const page of PUBLIC_PAGES.filter(p => p.prerender)) {
    await check(`${page.path} uten JavaScript: forhåndsrendret, én canonical, metadata og ingen noindex`, async () => {
      const r = await get(page.path)
      assert(r.status === 200, `status ${r.status}`)
      assert(!/name="robots"|noindex/.test(r.body), 'noindex i HTML-en')
      const canon = [...r.body.matchAll(/<link rel="canonical" href="([^"]+)"/g)].map(m => m[1])
      assert(canon.length === 1 && canon[0] === SITE_URL + page.path, `canonical: ${canon}`)
      assert(r.body.includes(`<title>${page.title}</title>`) && (r.body.match(/<title>/g) || []).length === 1, 'tittelen mangler eller står flere ganger')
      for (const t of ['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card']) assert(r.body.includes(t), `${t} mangler`)
      assert(/<div id="root" data-prerendered><.+<h1[\s>]/s.test(r.body), 'innholdet er ikke forhåndsrendret')
      assert(/<script type="module" crossorigin src="\/assets\/index-[^"]+\.js">/.test(r.body), 'appens skript mangler')
      return notNoindexed(page.path, r)
    })
  }

  await check('/home uten JavaScript: forsidens tekst, lenkene til de offentlige sidene og Organization', async () => {
    const { body } = await get('/home')
    for (const text of [H1_NO, 'Én rolig, tydelig vei gjennom en vanskelig prosess.', 'Rettferdig, ikke bare likt', 'Test ut demo nå'])
      assert(body.includes(text), `mangler «${text}»`)
    for (const href of ['/veiviser', '/kontakt', '/personvern', '/logg-inn']) assert(body.includes(`href="${href}"`), `lenken til ${href} mangler`)
    assert(!/&gt;|&#x27;/.test(body.match(/<div id="root"[\s\S]*?<\/style>/)?.[0] || ''), 'CSS-en i <style> er HTML-kodet')
    const ld = [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]))
    assert(ld.length === 1 && JSON.stringify(ld[0]) === JSON.stringify(organizationJsonLd()), `JSON-LD: ${JSON.stringify(ld)}`)
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

  await check('Appen, innlogging, invitasjoner, ukjente adresser og «/» får X-Robots-Tag: noindex', async () => {
    for (const path of PRIVATE) {
      const r = await get(path)
      assert(r.status === 200, `${path}: status ${r.status}`)
      assert(/(^|,\s*)noindex(\s*,|$)/.test(robotsTag(r) || ''), `${path}: X-Robots-Tag er ${robotsTag(r)}`)
      assert(!r.body.includes('rel="canonical"') || path.endsWith('.html'), `${path}: skallet har canonical`)
    }
    const guide = await get('/veiviser.html')
    assert((robotsTag(guide) || '').includes('indexifembedded'), `/veiviser.html: ${robotsTag(guide)}`)
  })

  await check('Sikkerhetshodene sendes på sidene, appen og robots.txt', async () => {
    for (const path of ['/', '/home', '/kontakt', '/estate/x', '/veiviser.html', '/robots.txt', '/sitemap.xml']) {
      const h = (await get(path)).headers
      assert(h.get('content-security-policy')?.startsWith("default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com;"), `CSP mangler på ${path}`)
      assert(h.get('content-security-policy')?.includes("frame-ancestors 'self'"), `frame-ancestors mangler på ${path}`)
      assert(h.get('x-frame-options') === 'SAMEORIGIN' && h.get('x-content-type-options') === 'nosniff', `hodene mangler på ${path}`)
      assert(h.get('permissions-policy')?.includes('camera=(self)'), `Permissions-Policy mangler på ${path}`)
    }
  })

  return results
}
