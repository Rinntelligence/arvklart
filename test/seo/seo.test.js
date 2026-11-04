// Teknisk SEO: registeret over offentlige sider (pages.js og guidene i content/, src/seo/content.js) styrer
// metadata, forhåndsrendering og sitemap; vercel.json har bare generelle regler, og testene her simulerer rutingen.
// Se også test/seo/content.test.js (guidene) og test/e2e/seo.mjs (det bygde nettstedet).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PUBLIC_PAGES, SITE_URL, SHELL_FILE, headTags, defaultHeadTags, organizationJsonLd, websiteJsonLd, prerenderFile } from '../../src/seo/pages.js'
import { injectHead, injectRoot, unescapeStyles } from '../../src/seo/vitePlugin.js'
import { publicRegistry } from '../../src/seo/content.js'
import { runHttpChecks, httpReport, domainChecks, isVercelProtection, REPORT_PATHS } from './httpChecks.mjs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const vercel = JSON.parse(read('vercel.json'))
const matches = (source, path) => new RegExp(`^${source}$`).test(path)

// Stier som aldri skal kunne indekseres (eksempler fra App.jsx og filnavn); ukjente adresser gir dessuten 404
const PRIVATE = ['/app', '/app/', '/logg-inn', '/nytt-passord', '/join/ABC123', '/setup', '/konto', '/founder', '/shell.html',
  '/estate/22222222-0000-0000-0000-000000000001', '/estate/x/item/y', '/estate/x/fordeling', '/estate/x/guide',
  '/home/', '/home.html', '/kontakt.html', '/index.html', '/a/b', '/guider/x/y', '/guider/testguide-fordeling.html']

test('pages.js: unike stier og titler, beskrivelse på begge språk, og canonical på hoveddomenet', () => {
  assert.equal(SITE_URL, 'https://www.arvklart.no')
  assert.equal(new Set(PUBLIC_PAGES.map(p => p.path)).size, PUBLIC_PAGES.length)
  assert.equal(new Set(PUBLIC_PAGES.map(p => p.title)).size, PUBLIC_PAGES.length, 'titlene må være unike')
  for (const p of PUBLIC_PAGES) {
    assert.match(p.path, /^\/([a-z0-9-]+)?$/, `${p.path}: «/» eller enkel sti uten skråstrek til slutt`)
    for (const key of ['title', 'title_en', 'description', 'description_en']) assert.ok(p[key]?.trim(), `${p.path}: ${key} mangler`)
    assert.ok(p.description.length <= 200, `${p.path}: beskrivelsen er for lang`)
  }
})

test('pages.js: hver offentlig side finnes som rute for besøkende uten innlogging (App.jsx)', () => {
  const app = read('src/App.jsx')
  const loggedOut = app.slice(app.indexOf('if (!session)'), app.indexOf('const p = { session'))
  for (const p of PUBLIC_PAGES) assert.ok(loggedOut.includes(p.path === '/' ? 'path={HOME}' : `path="${p.path}"`), `${p.path} mangler i App.jsx`)
  assert.match(read('src/lib/routes.js'), /export const HOME = '\/'/)
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

test('strukturerte data: WebSite og Organization bare på forsiden «/», med opplysninger fra nettstedet', () => {
  assert.deepEqual(organizationJsonLd(), { '@context': 'https://schema.org', '@type': 'Organization', name: 'Arvklart', url: SITE_URL, email: 'admin@arvklart.no' })
  assert.deepEqual(websiteJsonLd(), { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Arvklart', url: `${SITE_URL}/` })
  const home = headTags(PUBLIC_PAGES.find(p => p.path === '/'))
  const ld = [...home.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]))
  assert.deepEqual(ld, [websiteJsonLd(), organizationJsonLd()])
  assert.doesNotMatch(JSON.stringify(ld), /aggregateRating|review|offers|logo/i)
  for (const p of PUBLIC_PAGES.filter(p => p.path !== '/')) assert.doesNotMatch(headTags(p), /ld\+json/, `${p.path}: strukturerte data bare på forsiden`)
  assert.equal(headTags(PUBLIC_PAGES.find(p => p.path === '/')).match(/rel="canonical" href="([^"]+)"/)[1], `${SITE_URL}/`)
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

// ── Ruting slik Vercel gjør det: videresending, så fil, så første omskriving (med $1), ellers 404 ──────────────
// FILES er filene bygget lager (registeret med testinnhold) pluss public/. Utkast og ukjente sider har ingen fil.
const FIXTURES = 'test/fixtures/content'
const registryFx = publicRegistry(FIXTURES)
const PUBLIC_FILES = ['robots.txt', 'seo-early.js', 'arveveiviser/ramme.html', '404.html', 'hero-bg.jpg', 'favicon.svg']
const FILES = new Set([SHELL_FILE, 'sitemap.xml', ...PUBLIC_FILES, ...registryFx.filter(p => p.prerender).map(p => prerenderFile(p.path))])
function route(path, files = FILES) {
  const redirect = vercel.redirects.find(r => matches(r.source, path))
  if (redirect) return { status: redirect.permanent ? 308 : 307, location: redirect.destination }
  const direct = path === '/' ? 'index.html' : path.slice(1)
  if (files.has(direct)) return { status: 200, file: direct }
  const rw = vercel.rewrites.find(r => matches(r.source, path))
  if (!rw) return { status: 404 }
  const groups = path.match(new RegExp(`^${rw.source}$`))
  const file = rw.destination.replace(/\$(\d)/g, (_, n) => groups[n] ?? '').slice(1)
  return files.has(file) ? { status: 200, file } : { status: 404, missing: file }
}
const robotsRule = (path) => vercel.headers.filter(h => matches(h.source, path)).flatMap(h => h.headers).filter(x => x.key === 'X-Robots-Tag').map(x => x.value)

// Rutene i App.jsx (med eksempelverdier for :param), så en ny rute ikke kan glemmes i vercel.json
const ROUTE_CONSTS = { HOME: '/', APP_HOME: '/app', RESET_PATH: '/nytt-passord' }
const appRoutes = [...new Set([...read('src/App.jsx').matchAll(/<Route path=(?:"([^"]+)"|\{(\w+)\})/g)]
  .map(m => m[1] ?? ROUTE_CONSTS[m[2]]).filter(p => p && p !== '*'))]
const sample = (p) => p.replace(/:slug/g, 'testguide-fordeling').replace(/:\w+/g, 'x')

test('App.jsx: alle ruter er kjent (konstantene løses opp), og guide-ruten finnes i begge trærne', () => {
  for (const c of Object.keys(ROUTE_CONSTS)) assert.ok(read('src/App.jsx').includes(`path={${c}}`) || c === 'RESET_PATH', `${c} brukes ikke`)
  assert.match(read('src/App.jsx'), /const RESET_PATH = '\/nytt-passord'/)
  assert.ok(appRoutes.length > 25, `fant bare ${appRoutes.length} ruter`)
  assert.equal(read('src/App.jsx').match(/<Route path="\/guider\/:slug"/g)?.length, 2, 'guidene må finnes både uten og med innlogging')
})

test('ruting: hver offentlig rute serveres og kan indekseres; hver privat rute får skallet og noindex', () => {
  const publicPaths = new Set(registryFx.map(p => p.path))
  for (const r of appRoutes) {
    const path = sample(r)
    const res = route(path)
    if (path === '/home') { assert.equal(res.status, 308, '/home'); continue }
    if (publicPaths.has(path)) {
      assert.equal(res.status, 200, `${path} (offentlig) gir ${res.status}`)
      assert.deepEqual(robotsRule(path), [], `${path} (offentlig) har noindex`)
    } else {
      assert.equal(res.file, SHELL_FILE, `${r} (privat) serveres ikke av appens skall: ${JSON.stringify(res)}`)
      assert.ok(robotsRule(path).includes('noindex'), `${r} (privat) mangler noindex`)
    }
  }
})

test('ruting: ukjente adresser, utkast og interne filnavn gir 404', () => {
  for (const path of ['/finnes-ikke', '/guider/finnes-ikke', '/guider/testutkast', '/guider', '/guider/a/b', '/index', '/shell', '/404',
    '/a/b', '/home.html', '/kontakt/x', '/Kontakt', '/veiviserx', '/homepage', '/assets/finnes-ikke.js'])
    assert.equal(route(path).status, 404, `${path}: ${JSON.stringify(route(path))}`)
})

test('ruting: forhåndsrendrede sider og guider uten egne regler; «/» og /home som før', () => {
  for (const p of registryFx.filter(p => p.prerender)) assert.deepEqual(route(p.path), { status: 200, file: prerenderFile(p.path) }, p.path)
  assert.deepEqual(route('/'), { status: 200, file: 'index.html' })
  assert.deepEqual(route('/home'), { status: 308, location: '/' })
  assert.equal(route('/personvern').file, SHELL_FILE, '/personvern rendres i nettleseren')
  // /veiviser er forhåndsrendret med hele veiviseren (src/seo/veiviserHost.js); den gamle filen sendes dit
  assert.deepEqual(route('/veiviser'), { status: 200, file: 'veiviser.html' })
  assert.deepEqual(route('/veiviser.html'), { status: 308, location: '/veiviser' })
  assert.deepEqual(route('/arveveiviser/ramme.html'), { status: 200, file: 'arveveiviser/ramme.html' })
  assert.equal(route('/veiviser/noe').status, 404)
  assert.ok(!vercel.rewrites.some(r => r.source === '/(.*)'), 'ingen omskriving av alt: ukjente adresser skal gi 404')
  assert.ok(!vercel.rewrites.some(r => registryFx.some(p => p.path !== '/' && r.source === p.path)), 'ingen omskriving per side')
  assert.ok(!('cleanUrls' in vercel), 'cleanUrls ville gitt hver fil to adresser (/side og /side.html)')
  for (const s of [...vercel.rewrites, ...vercel.headers, ...vercel.redirects].map(r => r.source)) {
    assert.doesNotMatch(s, /(^|\/):[a-z]/i, `${s}: :param tolkes ikke likt av testserveren`); new RegExp(s)
  }
})

test('noindex: private stier og alt utenfor de offentlige mønstrene; aldri offentlige sider eller filer de trenger', () => {
  for (const path of PRIVATE) assert.ok(robotsRule(path).some(v => /noindex/.test(v)), `${path} mangler noindex`)
  for (const p of registryFx) assert.deepEqual(robotsRule(p.path), [], `${p.path} har noindex`)
  for (const path of ['/robots.txt', '/sitemap.xml', '/assets/index-abc.js', '/hero-bg.jpg', '/ARVKLART Horizontal Negative.svg', '/seo-early.js', '/arveveiviser/ui.js'])
    assert.deepEqual(robotsRule(path), [], `${path} skal ikke ha noindex`)
  // Rammen (iframen fra et bo) er ikke en egen side: noindex, og ikke indexifembedded, siden innholdet står på /veiviser
  assert.deepEqual(robotsRule('/arveveiviser/ramme.html'), ['noindex'])
  // X-Arvklart-Robots speiler reglene (Vercel setter selv noindex på forhåndsvisninger, men aldri dette hodet)
  for (const h of vercel.headers.filter(h => h.headers.some(x => x.key === 'X-Robots-Tag')))
    assert.equal(h.headers.find(x => x.key === 'X-Arvklart-Robots')?.value, h.headers.find(x => x.key === 'X-Robots-Tag').value, `${h.source}: X-Arvklart-Robots må være lik X-Robots-Tag`)
})

test('vercel.json: gamle /home sendes permanent til forsiden «/», /veiviser.html til /veiviser, og ingenting annet videresendes', () => {
  assert.deepEqual(vercel.redirects, [{ source: '/home', destination: '/', permanent: true }, { source: '/veiviser.html', destination: '/veiviser', permanent: true }])
  assert.ok(!vercel.rewrites.some(r => r.source === '/home'), '/home skal ikke lenger omskrives')
  assert.ok(PUBLIC_PAGES.some(p => p.path === '/') && !PUBLIC_PAGES.some(p => p.path === '/home'))
  for (const p of ['/estate/x', '/estate/x/item/y', '/join/ABC', '/nytt-passord', '/logg-inn'])
    assert.ok(!vercel.redirects.some(r => matches(r.source, p)), `${p} skal ikke videresendes (lenker i e-post og bokmerker)`)
})

test('vercel.json: sikkerhetshodene er uendret og gjelder alle stier', () => {
  const security = vercel.headers.find(h => h.source === '/(.*)')
  assert.deepEqual(security.headers, [
    { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com https://*.googletagmanager.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://swmuztsejghweqmaogol.supabase.co https://*.google-analytics.com https://*.googletagmanager.com; connect-src 'self' https://swmuztsejghweqmaogol.supabase.co wss://swmuztsejghweqmaogol.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; media-src 'self' blob:; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
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
  const byPath = (status) => fakeFetch(url => ({ status, headers: { location: `https://www.arvklart.no${new URL(url).pathname}` } }))
  const ok = await domainChecks({ fetchImpl: byPath(308) })
  assert.equal(ok.length, 4, 'apex og http for både «/» og /kontakt')
  assert.ok(ok.every(r => r.startsWith('OK  ')), ok.join('\n'))
  assert.ok((await domainChecks({ fetchImpl: byPath(307) })).every(r => r.startsWith('FAIL') && /midlertidig/.test(r)))
  assert.ok((await run(301, '/kontakt')).every(r => r.startsWith('FAIL')), 'relativ location blir på samme vert og protokoll')
  assert.ok((await run(200)).every(r => /ingen videresending/.test(r)))
  assert.ok((await run(308, 'https://www.arvklart.no/')).some(r => r.startsWith('FAIL')), 'stien må beholdes')
})

test('check-seo: rapporten viser status og hoder per sti, også private og ukjente', async () => {
  const rows = await httpReport('https://x', { fetchImpl: fakeFetch(url => ({ status: 200, headers: { 'x-robots-tag': url.endsWith('/home') ? undefined : 'noindex', 'content-type': 'text/html' } })) })
  assert.equal(rows.length, REPORT_PATHS.length)
  for (const p of ['/', '/home', '/personvern', '/veiviser', '/veiviser.html', '/finnes-ikke', '/robots.txt']) assert.ok(REPORT_PATHS.includes(p))
  assert.ok(rows.every(r => r.startsWith('INFO ')))
})

test('e-postlenker med økten i adressen: forsiden hydreres ikke som for en ny besøkende', async () => {
  const { hasAuthInUrl } = await import('../../src/seo/clientState.js')
  const at = (search, hash) => hasAuthInUrl({ search, hash })
  assert.equal(at('', '#access_token=a&refresh_token=b&type=signup'), true, 'bekreftelse (implicit)')
  assert.equal(at('?code=abc', ''), true, 'bekreftelse (PKCE)')
  assert.equal(at('', '#error=access_denied&error_description=expired'), true, 'utløpt lenke')
  assert.equal(at('', ''), false)
  assert.equal(at('?utm_source=x', '#slik-fungerer'), false, 'vanlige lenker og ankre')
  assert.equal(at('?promo_code=x', ''), false, 'bare parameteren code, ikke ord som slutter på code')
  const early = read('public/seo-early.js')
  assert.ok(early.includes('(access_token|refresh_token|error_description|code)='), 'seo-early.js må bruke samme mønster som clientState.js')
})

// ── Statistikk (GA4 via GTM) bare med samtykke, bare på offentlige sider (src/lib/analytics.js) ─────────────
test('statistikk: lastes bare med samtykke, på offentlige sider (også publiserte guider), uten innlogging og uten økt i adressen', async () => {
  const { canLoadAnalytics } = await import('../../src/lib/analytics.js')
  const { clientMeta } = await import('../../src/seo/content.js')
  // Samme register som nettleseren får (src/seo/registry.js): markedssidene og bare publiserte guider, som metadata
  const browserRegistry = [...PUBLIC_PAGES, ...registryFx.filter(p => p.kind === 'guide').map(clientMeta)]
  const pageFor = (path) => browserRegistry.find(p => p.path === path) || null
  const ok = { consent: 'granted', page: pageFor('/'), loggedIn: false, authInUrl: false }
  assert.equal(canLoadAnalytics(ok), true)
  for (const p of browserRegistry) assert.equal(canLoadAnalytics({ ...ok, page: pageFor(p.path) }), true, p.path)
  assert.ok(browserRegistry.some(p => p.path === '/guider/testguide-fordeling'), 'den publiserte testguiden er med')
  assert.equal(canLoadAnalytics({ ...ok, consent: null }), false, 'ikke valgt')
  assert.equal(canLoadAnalytics({ ...ok, consent: 'denied' }), false, 'avslått')
  assert.equal(canLoadAnalytics({ ...ok, loggedIn: true }), false, 'innlogget (også demoen)')
  assert.equal(canLoadAnalytics({ ...ok, authInUrl: true }), false, 'e-postlenke med økten i adressen')
  for (const pathname of ['/app', '/estate/x', '/estate/x/fordeling', '/logg-inn', '/nytt-passord', '/join/ABC', '/konto', '/founder', '/finnes-ikke', '/guider/testutkast', '/guider/finnes-ikke', '/guider'])
    assert.equal(canLoadAnalytics({ ...ok, page: pageFor(pathname) }), false, pathname)
  assert.equal(canLoadAnalytics({ ...ok, page: { path: '/x', kind: 'app' } }), false, 'bare sider og guider')
})

test('statistikk: komponenten slår opp i registeret (src/seo/registry.js), ikke bare i markedssidene', () => {
  const src = read('src/components/AnalyticsConsent.jsx')
  assert.match(src, /import \{ pageFor \} from '\.\.\/seo\/registry'/)
  assert.doesNotMatch(src, /from '\.\.\/seo\/pages'/)
  assert.doesNotMatch(read('src/lib/analytics.js'), /from '[^']*seo\/(pages|registry)/, 'regelen får siden fra komponenten (ingen import av registeret)')
})

test('statistikk: samtykket lagres med versjon, og ukjent eller gammel versjon regnes som ikke valgt', async () => {
  const store = new Map()
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
  const { getConsent, CONSENT_KEY, CONSENT_VERSION } = await import('../../src/lib/analytics.js')
  assert.equal(getConsent(), null)
  store.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, choice: 'granted' })); assert.equal(getConsent(), 'granted')
  store.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, choice: 'denied' })); assert.equal(getConsent(), 'denied')
  store.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION - 1, choice: 'granted' })); assert.equal(getConsent(), null, 'gammel versjon')
  store.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, choice: 'ja' })); assert.equal(getConsent(), null)
  store.set(CONSENT_KEY, '{ikke json'); assert.equal(getConsent(), null)
  delete globalThis.localStorage
})

test('CSP: bare Googles domener for GTM og GA4 er lagt til; ingen eval og ingen skript i HTML-en', () => {
  const csp = Object.fromEntries(vercel.headers[0].headers.find(h => h.key === 'Content-Security-Policy').value.split(';').map(d => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]))
  assert.deepEqual(csp['script-src'], ["'self'", 'https://cdnjs.cloudflare.com', 'https://*.googletagmanager.com'])
  assert.deepEqual(csp['connect-src'].filter(s => /google/.test(s)), ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'])
  assert.deepEqual(csp['img-src'].filter(s => /google/.test(s)), ['https://*.google-analytics.com', 'https://*.googletagmanager.com'])
  assert.ok(!JSON.stringify(csp).includes('unsafe-eval'))
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"))
  assert.deepEqual(csp['frame-src'], ["'self'"], 'ingen rammer fra Google')
})

test('statistikk: GTM-ID-en står bare i src/lib/analytics.js, ikke i HTML-en', () => {
  assert.doesNotMatch(read('index.html'), /googletagmanager|GTM-/)
  assert.match(read('src/lib/analytics.js'), /GTM_ID = 'GTM-KQWKCWBC'/)
})
