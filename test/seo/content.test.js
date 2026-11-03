// Guidene (content/guider/*.md, src/seo/content.js og src/seo/markdown.js): metadata kontrolleres strengt, utkast
// publiseres aldri, teksten er trygg HTML, og sitemap lages fra registeret med lastmod bare fra faktiske datoer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseGuide, loadGuides, publicRegistry, clientMeta, parseFrontmatter } from '../../src/seo/content.js'
import { renderMarkdown } from '../../src/seo/markdown.js'
import { PUBLIC_PAGES, SITE_URL, headTags, sitemapXml, articleJsonLd, breadcrumbJsonLd } from '../../src/seo/pages.js'
import { guideData } from '../../src/seo/vitePlugin.js'

const FX = 'test/fixtures/content'
const guide = (meta, body = 'Tekst.') => `---\n${Object.entries(meta).map(([k, v]) => Array.isArray(v) ? `${k}:\n${v.map(x => `  - ${x}`).join('\n')}` : `${k}: ${v}`).join('\n')}\n---\n${body}\n`
const OK = { title: 'Tittel', description: 'Beskrivelse.', status: 'published', author: 'Arvklart', published: '2026-10-01' }

test('en publisert guide blir en side under /guider/<slug> med canonical, datoer og lastmod', () => {
  const g = parseGuide(guide({ ...OK, updated: '2026-10-20' }), 'content/guider/fordeling-av-innbo.md')
  assert.equal(g.path, '/guider/fordeling-av-innbo')
  assert.equal(g.canonical, `${SITE_URL}/guider/fordeling-av-innbo`)
  assert.equal(g.lastmod, '2026-10-20', 'lastmod er siste innholdsendring')
  assert.equal(parseGuide(guide(OK), 'x/a.md').lastmod, '2026-10-01', 'uten updated: publiseringsdatoen')
  assert.equal(g.prerender, true)
  assert.equal(g.sitemap, true)
})

test('metadata kontrolleres: manglende felt, ukjente felt, feil status, datoer og slug stopper bygget', () => {
  const bad = (meta, file = 'x/guide.md', body) => assert.throws(() => parseGuide(guide(meta, body), file))
  for (const k of ['title', 'description', 'status', 'author']) { const m = { ...OK }; delete m[k]; bad(m) }
  bad({ ...OK, status: 'publisert' })
  bad({ ...OK, published: undefined })
  bad({ ...OK, published: '2026-13-01' })
  bad({ ...OK, published: '2026-02-30' })
  bad({ ...OK, updated: '2026-09-01' }) // før published
  bad({ ...OK, ukjent: 'x' })
  bad({ ...OK, description: 'x'.repeat(201) })
  bad({ ...OK, canonical: 'https://example.com/guide' })
  bad({ ...OK, og_image: 'https://example.com/bilde.jpg' })
  bad({ ...OK, schema: 'faq' })
  bad({ ...OK, sources: ['Uten adresse'] })
  bad({ ...OK, sources: ['Usikker | http://lovdata.no'] })
  bad(OK, 'x/Store-Bokstaver.md')
  bad(OK, 'x/med_understrek.md')
  bad(OK, 'x/guide.md', '   ')
  bad(OK, 'x/guide.md', '# Egen H1')
  assert.throws(() => parseFrontmatter('Ingen metadata'), /metadata/)
  assert.doesNotThrow(() => parseGuide(guide({ ...OK, status: 'draft', published: undefined }).replace('published: undefined\n', ''), 'x/utkast.md'), 'utkast trenger ikke dato')
})

test('Markdown: tekst og «rå» HTML kodes, bare interne og https-lenker, overskrifter får id', () => {
  const { html, links, headings } = renderMarkdown('Hei <script>alert(1)</script> & "x"\n\n## Fordeling av innbo\n\n- **Fet** og *kursiv*\n- [Veiviser](/veiviser)\n\n1. En\n2. To\n\n> Sitat <b>\n')
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'))
  assert.doesNotMatch(html, /<script|<b>/)
  assert.ok(html.includes('<h2 id="fordeling-av-innbo">Fordeling av innbo</h2>'))
  assert.ok(html.includes('<ul><li><strong>Fet</strong> og <em>kursiv</em></li><li><a href="/veiviser">Veiviser</a></li></ul>'))
  assert.ok(html.includes('<ol><li>En</li><li>To</li></ol>'))
  assert.ok(html.includes('<blockquote><p>Sitat &lt;b&gt;</p></blockquote>'))
  assert.deepEqual(links, ['/veiviser'])
  assert.deepEqual(headings, [{ level: 2, text: 'Fordeling av innbo', id: 'fordeling-av-innbo' }])
  for (const href of ['javascript:alert(1)', 'http://x.no', '//evil.example', 'data:text/html,x'])
    assert.throws(() => renderMarkdown(`[x](${href})`), /intern|https/, href)
  assert.ok(renderMarkdown('[x](https://lovdata.no/a?b=1&c=2)').html.includes('href="https://lovdata.no/a?b=1&amp;c=2"'))
})

test('utkast publiseres aldri: ikke i registeret, ikke i sitemap og ikke i nettleserens metadata', () => {
  const all = loadGuides(FX, { includeDrafts: true })
  assert.deepEqual(all.map(g => [g.slug, g.status]), [['testguide-fordeling', 'published'], ['testutkast', 'draft']])
  const registry = publicRegistry(FX)
  assert.ok(!registry.some(p => p.path === '/guider/testutkast'))
  assert.doesNotMatch(sitemapXml(registry), /testutkast/)
  assert.doesNotMatch(JSON.stringify(registry.filter(p => p.kind === 'guide').map(clientMeta)), /testutkast|Hemmelig/)
})

test('sitemap: alle publiserte sider på hoveddomenet, lastmod bare med faktisk dato, gyldig XML', () => {
  const xml = sitemapXml(publicRegistry(FX))
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  assert.ok(xml.trimEnd().endsWith('</urlset>'))
  const urls = [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map(m => [m[1], m[2] || null])
  assert.deepEqual(urls, [
    ...PUBLIC_PAGES.filter(p => p.sitemap).map(p => [SITE_URL + p.path, null]),
    [`${SITE_URL}/guider/testguide-fordeling`, '2026-10-15'],
  ])
  assert.equal((xml.match(/<url>/g) || []).length, urls.length, 'alle <url> er på riktig form')
  assert.doesNotMatch(xml, /\/estate|\/join|\/logg-inn|\/konto|\/founder|\/setup|\/nytt-passord|\/app/)
  const today = new Date().toISOString().slice(0, 10)
  assert.ok(!xml.includes(`<lastmod>${today}</lastmod>`) || urls.some(([, d]) => d === today), 'lastmod er aldri byggedatoen')
})

test('produksjonsinnholdet (content/) publiserer ingen guide ennå; malen er et utkast', () => {
  assert.deepEqual(loadGuides('content'), [])
  assert.deepEqual(loadGuides('content', { includeDrafts: true }).map(g => [g.slug, g.status]), [['mal-for-guide', 'draft']])
  assert.deepEqual(publicRegistry('content').map(p => p.path), PUBLIC_PAGES.map(p => p.path))
})

test('interne lenker i en guide må gå til publiserte sider, ellers stopper bygget', () => {
  assert.throws(() => publicRegistry('test/fixtures/content-broken'), /peker ikke til en publisert side/)
})

test('guidens head: canonical, og:type article, datoer, Article og BreadcrumbList; ingen tekst i nettleserens metadata', () => {
  const g = publicRegistry(FX).find(p => p.kind === 'guide')
  const tags = headTags(g)
  assert.equal(tags.match(/rel="canonical"/g).length, 1)
  assert.ok(tags.includes(`<link rel="canonical" href="${SITE_URL}/guider/testguide-fordeling" />`))
  assert.ok(tags.includes('<meta property="og:type" content="article" />'))
  assert.ok(tags.includes('<meta property="article:published_time" content="2026-10-01" />'))
  assert.ok(tags.includes('<meta property="article:modified_time" content="2026-10-15" />'))
  const ld = [...tags.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(m => JSON.parse(m[1]))
  assert.deepEqual(ld, [articleJsonLd(g), breadcrumbJsonLd(g)])
  assert.equal(ld[0].author['@type'], 'Organization')
  assert.equal(ld[0].dateModified, '2026-10-15')
  assert.deepEqual(ld[1].itemListElement.map(i => i.item), [`${SITE_URL}/`, `${SITE_URL}/guider/testguide-fordeling`])
  assert.doesNotMatch(headTags({ ...g, schema: 'none' }), /ld\+json/)
  assert.ok(!('html' in clientMeta(g)), 'teksten skal ikke i JavaScript-filene')
  const data = guideData(g)
  assert.deepEqual(Object.keys(data).sort(), ['author', 'description', 'html', 'kind', 'path', 'published', 'related', 'sources', 'title', 'updated'])
})

test('README for guidene beskriver alle feltene loaderen godtar', () => {
  const readme = readFileSync(new URL('../../content/guider/README.md', import.meta.url), 'utf8')
  for (const k of ['title', 'description', 'status', 'author', 'published', 'updated', 'canonical', 'og_image', 'schema', 'sources', 'related'])
    assert.ok(readme.includes(`\`${k}\``), `${k} mangler i README`)
})
