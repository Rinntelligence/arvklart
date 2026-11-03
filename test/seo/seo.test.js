// Teknisk SEO: src/seo/pages.js er eneste liste over offentlige sider. Sitemap, robots.txt og vercel.json
// (omskrivinger, noindex, sikkerhetshoder) må stemme med den. Se også test/e2e/seo.mjs (det bygde nettstedet).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PUBLIC_PAGES, SITE_URL, headTags, defaultHeadTags, organizationJsonLd } from '../../src/seo/pages.js'
import { injectHead, injectRoot, unescapeStyles } from '../../src/seo/vitePlugin.js'
import { runHttpChecks, httpReport, domainChecks, isVercelProtection, REPORT_PATHS } from './httpChecks.mjs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const vercel = JSON.parse(read('vercel.json'))
const matches = (source, path) => new RegExp(`^${source}$`).test(path)
const NOINDEX = vercel.headers.find(h => h.headers.some(x => x.key === 'X-Robots-Tag' && x.value === 'noindex'))
const noindexed = (path) => vercel.headers.some(h => matches(h.source, path) && h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)))

// Stier som aldri skal kunne indekseres (eksempler fra App.jsx); ukjente adresser og «/» (appen) hører med
const PRIVATE = ['/', '/logg-inn', '/nytt-passord', '/join/ABC123', '/setup', '/konto', '/founder',
  '/estate/22222222-0000-0000-0000-000000000001', '/estate/x/item/y', '/estate/x/fordeling', '/estate/x/guide',
  '/finnes-ikke', '/home/', '/home.html', '/kontakt.html', '/homepage', '/veiviserx', '/index.html']

test('pages.js: unike stier og titler, beskrivelse på begge språk, og canonical på hoveddomenet', () => {
  assert.equal(SITE_URL, 'https://www.arvklart.no')
  assert.equal(new Set(PUBLIC_PAGES.map(p => p.path)).size, PUBLIC_PAGES.length)
  assert.equal(new Set(PUBLIC_PAGES.map(p => p.title)).size, PUBLIC_PAGES.length, 'titlene må være unike')
  for (const p of PUBLIC_PAGES) {
    assert.match(p.path, /^\/[a-z0-9-]+$/, `${p.path}: enkel sti uten skråstrek til slutt`)
    for (const key of ['title', 'title_en', 'description', 'description_en']) assert.ok(p[key]?.trim(), `${p.path}: ${key} mangler`)
    assert.ok(p.description.length <= 200, `${p.path}: beskrivelsen er for lang`)
  }
})

test('pages.js: hver offentlig side finnes som rute for besøkende uten innlogging (App.jsx)', () => {
  const app = read('src/App.jsx')
  const loggedOut = app.slice(app.indexOf('if (!session)'), app.indexOf('const p = { session'))
  for (const p of PUBLIC_PAGES) assert.ok(loggedOut.includes(`path="${p.path}"`), `${p.path} mangler i App.jsx`)
})

test('head-taggene: én canonical og og:url på siden, ingen i skallet, ingen noindex', () => {
  for (const p of PUBLIC_PAGES) {
    const tags = headTags(p)
    assert.equal(tags.match(/rel="canonical"/g).length, 1)
    assert.ok(tags.includes(`<link rel="canonical" href="${SITE_URL}${p.path}" />`))
    assert.ok(tags.includes(`<meta property="og:url" content="${SITE_URL}${p.path}" />`))
    for (const t of ['og:title', 'og:description', 'og:image', 'twitter:card']) assert.ok(tags.includes(t), `${p.path}: ${t} mangler`)
    assert.doesNotMatch(tags, /noindex/)
  }
  const shell = defaultHeadTags()
  assert.doesNotMatch(shell, /canonical|og:url|ld\+json/, 'skallet serveres på alle stier og skal ikke peke på én side')
})

test('strukturerte data: bare Organization med opplysninger fra nettstedet, ikke WebSite', () => {
  assert.deepEqual(organizationJsonLd(), { '@context': 'https://schema.org', '@type': 'Organization', name: 'Arvklart', url: SITE_URL, email: 'admin@arvklart.no' })
  const home = headTags(PUBLIC_PAGES.find(p => p.path === '/home'))
  assert.equal(home.match(/application\/ld\+json/g).length, 1)
  const ld = home.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]
  assert.deepEqual(JSON.parse(ld), organizationJsonLd())
  assert.doesNotMatch(ld, /WebSite|aggregateRating|review|offers|logo/i)
})

test('forhåndsrenderingen setter inn taggene og innholdet, og feiler høyt hvis malen er endret', () => {
  const tpl = '<head><!--seo:start-->\n<title>x</title>\n<!--seo:end--></head><body><div id="root"></div></body>'
  const html = injectRoot(injectHead(tpl, headTags(PUBLIC_PAGES[0])), '<h1>$& $1</h1>')
  assert.ok(html.includes('<div id="root" data-prerendered><h1>$& $1</h1></div>'), 'innholdet settes inn ordrett')
  assert.equal(html.match(/<title>/g).length, 1)
  assert.throws(() => injectHead('<head></head>', ''), /seo:start/)
  assert.throws(() => injectRoot('<div id="root">x</div>', ''), /root/)
})

test('forhåndsrenderingen: CSS i <style> står som ren tekst, slik nettleseren og hydreringen leser den', () => {
  const out = unescapeStyles(`<style>.a &gt; b { font-family: &#x27;Karla&#x27;; content: &quot;&amp;&quot; }</style><p>a &gt; b</p>`)
  assert.equal(out, `<style>.a > b { font-family: 'Karla'; content: "&" }</style><p>a &gt; b</p>`, 'bare innholdet i <style> endres')
  assert.throws(() => unescapeStyles('<style>&lt;/style&gt;</style>'), /style/)
})

test('robots.txt: alt tillatt (noindex styres av hodene), og sitemap oppgitt', () => {
  const robots = read('public/robots.txt')
  const lines = robots.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  assert.deepEqual(lines, ['User-agent: *', 'Allow: /', `Sitemap: ${SITE_URL}/sitemap.xml`])
})

test('sitemap.xml: gyldig form, nøyaktig de offentlige sidene, ingen private stier og ingen lastmod', () => {
  const raw = read('public/sitemap.xml')
  const xml = raw.replace(/<!--[\s\S]*?-->/g, '')
  assert.ok(raw.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">[\s\S]*<\/urlset>\s*$/)
  assert.equal((xml.match(/<url>/g) || []).length, (xml.match(/<\/url>/g) || []).length)
  assert.doesNotMatch(xml, /lastmod|&(?!amp;)/)
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  assert.deepEqual(locs, PUBLIC_PAGES.filter(p => p.sitemap).map(p => SITE_URL + p.path))
  for (const loc of locs) assert.ok(!noindexed(new URL(loc).pathname), `${loc} står i sitemap men har noindex`)
  assert.doesNotMatch(xml, /\/estate|\/join|\/logg-inn|\/konto|\/founder|\/setup|\/nytt-passord/)
})

test('vercel.json: ingen offentlig side får noindex, og unntakene i regelen er nøyaktig pages.js', () => {
  assert.ok(NOINDEX, 'noindex-regelen mangler')
  for (const p of PUBLIC_PAGES) assert.ok(!noindexed(p.path), `${p.path} har noindex`)
  const alternatives = NOINDEX.source.match(/^\/\(\(\?!\(\?:([^)]*)\)\$\)/)?.[1]?.split('|').map(s => s.replace(/\\\./g, '.'))
  assert.ok(alternatives, 'fant ikke listen over unntak i noindex-regelen')
  const infra = ['robots.txt', 'sitemap.xml', 'veiviser.html']
  assert.deepEqual(new Set(alternatives), new Set([...PUBLIC_PAGES.map(p => p.path.slice(1)), ...infra]),
    'unntakene i noindex-regelen må være de offentlige sidene i pages.js (pluss robots.txt, sitemap.xml og veiviser.html)')
})

test('vercel.json: appen, innlogging, invitasjoner, ukjente adresser og «/» får noindex', () => {
  for (const path of PRIVATE) assert.ok(noindexed(path), `${path} mangler noindex`)
  const embed = vercel.headers.find(h => h.source === '/veiviser.html')
  assert.deepEqual(embed?.headers, [{ key: 'X-Robots-Tag', value: 'noindex, indexifembedded' }, { key: 'X-Arvklart-Robots', value: 'noindex, indexifembedded' }])
  // X-Arvklart-Robots speiler regelen: Vercel setter selv noindex på forhåndsvisninger, men aldri dette hodet,
  // så scripts/check-seo.mjs kan se hvilke stier våre regler faktisk treffer hos Vercel.
  for (const h of vercel.headers.filter(h => h.headers.some(x => x.key === 'X-Robots-Tag')))
    assert.equal(h.headers.find(x => x.key === 'X-Arvklart-Robots')?.value, h.headers.find(x => x.key === 'X-Robots-Tag').value, `${h.source}: X-Arvklart-Robots må være lik X-Robots-Tag`)
  for (const path of ['/robots.txt', '/sitemap.xml', '/assets/index-abc.js', '/hero-bg.jpg', '/ARVKLART Horizontal Negative.svg', '/seo-early.js', '/arveveiviser/ui.js'])
    assert.ok(!vercel.headers.some(h => matches(h.source, path) && h.headers.some(x => x.value === 'noindex')), `${path} skal ikke ha noindex`)
})

test('vercel.json: forhåndsrendrede sider omskrives før «/(.*)», og kildene er regulære uttrykk uten :param', () => {
  const sources = [...vercel.rewrites, ...vercel.headers].map(r => r.source)
  for (const s of sources) { assert.doesNotMatch(s, /(^|\/):[a-z]/i, `${s}: :param tolkes ikke likt av testserveren`); new RegExp(s) }
  const catchAll = vercel.rewrites.findIndex(r => r.source === '/(.*)')
  assert.equal(vercel.rewrites[catchAll].destination, '/index.html')
  assert.equal(catchAll, vercel.rewrites.length - 1, '«/(.*)» må stå sist')
  for (const p of PUBLIC_PAGES.filter(p => p.prerender)) {
    const i = vercel.rewrites.findIndex(r => r.source === p.path && r.destination === `${p.path}.html`)
    assert.ok(i >= 0 && i < catchAll, `${p.path} → ${p.path}.html mangler før «/(.*)»`)
  }
  assert.ok(!('cleanUrls' in vercel), 'cleanUrls ville sendt /veiviser.html videre til /veiviser')
})

test('vercel.json: sikkerhetshodene er uendret og gjelder alle stier', () => {
  const security = vercel.headers.find(h => h.source === '/(.*)')
  assert.deepEqual(security.headers, [
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://swmuztsejghweqmaogol.supabase.co; connect-src 'self' https://swmuztsejghweqmaogol.supabase.co wss://swmuztsejghweqmaogol.supabase.co; media-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
  ])
  assert.equal(vercel.headers[0], security, 'sikkerhetshodene står først')
})

test('index.html: plassholder for SEO-taggene, ingen fast tittel eller canonical, ingen global noindex', () => {
  const html = read('index.html')
  assert.equal(html.match(/<!--seo-->/g)?.length, 1)
  assert.doesNotMatch(html, /<title>|rel="canonical"|name="robots"|noindex/)
  assert.match(html, /<html lang="no">/)
  assert.match(html, /<script src="\/seo-early\.js"><\/script>/)
})

// ── scripts/check-seo.mjs: sjekkene mot ekte utrullinger (fetch simuleres, ingen nettverk) ──────────────────
const fakeFetch = (routes) => async (url) => {
  const r = routes(url)
  return { status: r.status, headers: new Headers(r.headers || {}), text: async () => r.body || '' }
}

test('check-seo: en beskyttet forhåndsvisning gir én tydelig feil, aldri godkjent', async () => {
  assert.equal(isVercelProtection(401, null), true)
  assert.equal(isVercelProtection(302, 'https://vercel.com/sso-api?url=x'), true)
  assert.equal(isVercelProtection(307, 'https://x.vercel.app/_vercel_sso?nonce=1'), true)
  assert.equal(isVercelProtection(308, 'https://www.arvklart.no/home'), false)
  assert.equal(isVercelProtection(200, null), false)
  const sso = fakeFetch(() => ({ status: 302, headers: { location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fx' } }))
  const results = await runHttpChecks('https://x.vercel.app', { fetchImpl: sso })
  assert.equal(results.length, 1)
  assert.match(results[0], /^FAIL .*Deployment Protection.*VERCEL_AUTOMATION_BYPASS_SECRET/)
  const rejected = await runHttpChecks('https://x.vercel.app', { fetchImpl: sso, headers: { 'x-vercel-protection-bypass': 'feil' } })
  assert.match(rejected[0], /^FAIL .*ble avvist/)
})

test('check-seo: kanonisk domene krever permanent videresending til https://www med samme sti', async () => {
  const run = (status, location) => domainChecks({ fetchImpl: fakeFetch(() => ({ status, headers: location ? { location } : {} })) })
  assert.deepEqual((await run(308, 'https://www.arvklart.no/home')).map(r => r.slice(0, 4)), ['OK  ', 'OK  '])
  assert.deepEqual((await run(301, '/home')).map(r => r.slice(0, 4)), ['FAIL', 'FAIL'], 'relativ location blir på samme vert og protokoll')
  const temporary = await run(307, 'https://www.arvklart.no/home')
  assert.ok(temporary.every(r => r.startsWith('FAIL') && /midlertidig/.test(r)))
  assert.ok((await run(200)).every(r => /ingen videresending/.test(r)))
  assert.ok((await run(308, 'https://www.arvklart.no/')).every(r => r.startsWith('FAIL')), 'stien må beholdes')
})

test('check-seo: rapporten viser status og hoder per sti, også private og ukjente', async () => {
  const rows = await httpReport('https://x', { fetchImpl: fakeFetch(url => ({ status: 200, headers: { 'x-robots-tag': url.endsWith('/home') ? undefined : 'noindex', 'content-type': 'text/html' } })) })
  assert.equal(rows.length, REPORT_PATHS.length)
  for (const p of ['/', '/home', '/personvern', '/veiviser', '/veiviser.html', '/finnes-ikke', '/robots.txt']) assert.ok(REPORT_PATHS.includes(p))
  assert.ok(rows.every(r => r.startsWith('INFO ')))
})
