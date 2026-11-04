// /veiviser med veiviseren direkte i siden (src/seo/veiviserHost.js): HTML-en byggesteget lager, har all teksten fra
// fasiten (test/fixtures/veiviser-tekst.json, tatt fra main før ombyggingen), og CSS-en fra rammen gjelder bare inne i
// #veiviser med samme innbyrdes rangering som før. Nettleseren testes i test/e2e/veiviser.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { scopeCss, veiviserHostParts, injectVeiviser } from '../../src/seo/veiviserHost.js'

const FASIT = JSON.parse(readFileSync('test/fixtures/veiviser-tekst.json', 'utf8'))
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' }
const textNodes = (html) => html
  .replace(/<noscript>[\s\S]*?<\/noscript>/g, ' ')
  .split(/<[^>]+>/)
  .map(t => t.replace(/&[a-z#0-9]+;/g, e => ENTITIES[e] ?? e).replace(/\s+/g, ' ').trim())
  .filter(Boolean)

test('byggesteget: alle tekstene fra fasiten står i /veiviser-HTML-en, i samme rekkefølge, uten noe ekstra', async () => {
  const { body } = await veiviserHostParts()
  const page = body.slice(body.indexOf('<div class="page">'), body.lastIndexOf('</main>'))
  assert.deepEqual(textNodes(page), FASIT.texts)
  for (const l of FASIT.links) assert.ok(page.includes(`href="${l.href}"`), `lenken ${l.href} mangler`)
  assert.equal((page.match(/<h1[\s>]/g) || []).length, 1)
  assert.match(body, /^<main id="veiviser" data-veiviser-host>/)
  assert.match(page, /<div id="arvWizard" data-prerendered>/, 'startkortet er merket, så ui.js ikke viser «Laster …»')
  assert.doesNotMatch(body, /<iframe|<script(?! type="module" src="\/arveveiviser\/(page|ui)\.js"><\/script>)/, 'bare veiviserens egne skript, ingen iframe')
})

test('byggesteget: settes inn én gang i <head> og <body>, og feiler tydelig på en uventet mal', async () => {
  const parts = await veiviserHostParts()
  const html = injectVeiviser('<html><head></head><body><div id="root"></div></body></html>', parts)
  assert.equal(html.split('<style id="veiviser-css">').length, 2)
  assert.ok(html.indexOf('<main id="veiviser"') > html.indexOf('<div id="root">'), 'veiviseren kommer etter appen')
  assert.throws(() => injectVeiviser('<html><body></body></html>', parts), /uventet HTML-mal/)
})

test('CSS-en fra rammen gjelder bare i #veiviser, og reglene rangeres innbyrdes som før', () => {
  const css = `
    :root{ --bg: #fff; }
    *{ box-sizing: border-box; }
    html,body{ margin:0; }
    .intro h1{ font-weight: 600; }
    :root h1, :root h2{ font-weight: 500; }
    a:not(.x, .y), b{ color: red; }
    @media (max-width: 640px){ .a{ x: 1; } body{ y: 2; } }
    @keyframes k{ from{ opacity:0; } to{ opacity:1; } }`
  const out = scopeCss(css)
  for (const sel of ['#veiviser[data-veiviser-host]{', '#veiviser *{', 'main#veiviser, main#veiviser{', '#veiviser .intro h1{',
    '#veiviser[data-veiviser-host] h1, #veiviser[data-veiviser-host] h2{', '#veiviser a:not(.x, .y), #veiviser b{', '#veiviser .a{', 'main#veiviser{y: 2;}'])
    assert.ok(out.includes(sel), `mangler ${sel}\n${out}`)
  assert.match(out, /@keyframes k\{ from\{ opacity:0; \} to\{ opacity:1; \} \}/, '@keyframes er uendret')
  // :root h1 (0,1,1) og .intro h1 (0,1,1) er like sterke; den siste vinner, som i rammen
  assert.ok(out.indexOf('#veiviser[data-veiviser-host] h1') > out.indexOf('#veiviser .intro h1'))
  assert.throws(() => scopeCss('@import url(x.css); a{}'), /ukjent regel|uventet/)
  assert.throws(() => scopeCss('a{ b{ c: d; } }'), /nøstet/)
})

test('rammen og byggesteget bruker de samme innholdsmodulene (ingen kopi av teksten)', () => {
  const page = readFileSync('public/arveveiviser/page.js', 'utf8')
  const host = readFileSync('src/seo/veiviserHost.js', 'utf8')
  assert.match(page, /import \{ pageSections \} from '\.\/sections\.js'/)
  assert.match(host, /mod\('sections\.js'\)/)
  assert.match(readFileSync('public/arveveiviser/ui.js', 'utf8'), /import \{ introHtml \} from '\.\/intro\.js'/)
  // Ingen tekst fra fasiten står i page.js lenger (bare i sections.js og intro.js)
  assert.ok(!page.includes('Rett etter dødsfallet') && !page.includes('Pliktdelsarv'))
})
