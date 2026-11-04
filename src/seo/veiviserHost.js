// /veiviser med hele veiviseren direkte i siden (ikke i en iframe), så søkemotorer leser innholdet uten JavaScript.
// Brukes av byggesteget (src/seo/vitePlugin.js), bare i Node.
//
// Kilden er rammen /arveveiviser/ramme.html (samme markering og CSS som brukerne har sett i iframen) og
// innholdsmodulene i public/arveveiviser: sections.js (de fem fasene, ordlisten og ressursene) og intro.js
// (startkortet i veiviseren). Byggesteget fyller dem inn i HTML-en; teksten skrives ikke om. I nettleseren kobler
// page.js og ui.js på knappene og tar over veiviseren, og GuidePage (appen) snakker med den i samme vindu
// (data-veiviser-host) i stedet for gjennom iframen.
//
// CSS-en fra rammen gjelder bare inne i #veiviser (scopeCss), så den ikke påvirker resten av appen, og appens
// nullstilling av marger i index.html oppheves der (revert), så veiviseren ser ut som i rammen.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const VEIVISER_PATH = '/veiviser'
export const FRAME_FILE = 'public/arveveiviser/ramme.html'
export const SCOPE = '#veiviser'

// Velgerlister deles på komma utenfor parenteser (f.eks. :not(a, b))
function splitSelectors(list) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim()).filter(Boolean)
}

// Hver velger får samme tillegg i spesifisitet (én id), så reglene vinner over hverandre som i rammen:
// :root (en pseudoklasse) blir #veiviser[data-veiviser-host] (attributt veier som klasse), html og body (typer)
// blir main#veiviser, og alt annet får «#veiviser » foran.
function scopeSelector(sel, scope) {
  const m = sel.match(/^(:root|html|body)(?=$|[\s.:#[>+~])(.*)$/)
  if (m) return `${m[1] === ':root' ? `${scope}[data-veiviser-host]` : `main${scope}`}${m[2]}`
  return `${scope} ${sel}`
}

// Leser en blokk fra { til matchende }, returnerer [innhold, indeks etter }]
function readBlock(css, open) {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') { depth--; if (depth === 0) return [css.slice(open + 1, i), i + 1] }
  }
  throw new Error('veiviser-CSS: mangler }')
}

// Gir hver regel prefikset scope: «.phase» blir «#veiviser .phase», og :root/html/body blir #veiviser selv.
// @media og @supports behandles innenfor; @keyframes og @font-face kopieres som de er.
export function scopeCss(css, scope = SCOPE) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  while (i < css.length) {
    const brace = css.indexOf('{', i)
    if (brace === -1) {
      if (css.slice(i).trim()) throw new Error(`veiviser-CSS: uventet tekst «${css.slice(i).trim().slice(0, 40)}»`)
      break
    }
    const prelude = css.slice(i, brace).trim()
    const [body, next] = readBlock(css, brace)
    if (/^@(media|supports)\b/.test(prelude)) out += `${prelude}{${scopeCss(body, scope)}}\n`
    else if (/^@(-webkit-)?keyframes\b|^@font-face\b/.test(prelude)) out += `${prelude}{${body}}\n`
    else if (prelude.startsWith('@')) throw new Error(`veiviser-CSS: ukjent regel ${prelude}`)
    else {
      if (body.includes('{')) throw new Error(`veiviser-CSS: nøstet blokk i ${prelude}`)
      out += `${splitSelectors(prelude).map(s => scopeSelector(s, scope)).join(', ')}{${body.trim()}}\n`
    }
    i = next
  }
  return out
}

const between = (text, start, end, what) => {
  const a = text.indexOf(start)
  const b = a === -1 ? -1 : text.indexOf(end, a + start.length)
  if (a === -1 || b === -1) throw new Error(`veiviser: fant ikke ${what} i ${FRAME_FILE}`)
  return [a, b]
}

// Fyller én tom beholder i markeringen (<div id="x"…></div>) med HTML
function fill(markup, open, html) {
  const tag = `${open}</div>`
  if (markup.split(tag).length !== 2) throw new Error(`veiviser: fant ikke nøyaktig én ${tag}`)
  return markup.replace(tag, () => `${open}${html}</div>`)
}

// Delene byggesteget setter inn i /veiviser: head (skrift og CSS) og body (veiviseren og skriptene)
export async function veiviserHostParts(root = process.cwd()) {
  const frame = readFileSync(resolve(root, FRAME_FILE), 'utf8')
  const fonts = frame.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]+" rel="stylesheet">/)?.[0]
  if (!fonts) throw new Error(`veiviser: fant ikke skriften i ${FRAME_FILE}`)
  const [cssStart, cssEnd] = between(frame, '<style>', '</style>', '<style>')
  const css = frame.slice(cssStart + '<style>'.length, cssEnd)
  const [pageStart, pageEnd] = between(frame, '<div class="page">', '<script type="module" src="/arveveiviser/page.js">', 'veiviserens innhold')
  let markup = frame.slice(pageStart, pageEnd).trim()
  if (!markup.endsWith('</div>')) throw new Error('veiviser: innholdet slutter ikke med </div>')

  const mod = (f) => import(pathToFileURL(resolve(root, 'public/arveveiviser', f)).href)
  const [{ pageSections }, { introHtml }, { setLang }] = await Promise.all([mod('sections.js'), mod('intro.js'), mod('i18n.js')])
  setLang('no') // /veiviser er på norsk (den gjeldende versjonen); engelsk vises bare i rammen med ?lang=en
  const s = pageSections(false)
  const noscript = markup.match(/<div id="arvWizard">(<noscript>[\s\S]*?<\/noscript>)<\/div>/)
  if (!noscript) throw new Error('veiviser: fant ikke #arvWizard')
  markup = markup.replace(noscript[0], () => `<div id="arvWizard" data-prerendered>${noscript[1]}${introHtml(false)}</div>`)
  markup = fill(markup, '<div class="timeline" id="timelineWrap">', s.timelineHtml())
  markup = fill(markup, '<div class="glossary-grid" id="glossaryWrap">', s.glossaryHtml())
  markup = fill(markup, '<div id="resourcesWrap">', s.resourcesHtml())
  // Knappen nederst: samme tekst som rammen får fra /veiviser (page.js med ?back=home)
  const cta = '<span id="ctaLabel" data-en="Back to the estate">Tilbake til boet</span>'
  if (!markup.includes(cta)) throw new Error('veiviser: fant ikke #ctaLabel')
  markup = markup.replace(cta, '<span id="ctaLabel" data-en="Back to the home page">Tilbake til hjemmesiden</span>')

  const hostCss = [
    // Appens nullstilling (index.html: * { margin: 0; padding: 0 }) gjelder ikke i veiviseren, som i rammen
    `${SCOPE} *, ${SCOPE} *::before, ${SCOPE} *::after { margin: revert; padding: revert; }`,
    scopeCss(css),
    // Appens topplinje og «Tilbake»-linjen blir stående øverst mens man blar, slik de gjorde over iframen
    'html:not(.vv-off) #root { position: sticky; top: 0; z-index: 60; }',
    // Innlogget: appens ramme (App.jsx) fyller ellers hele skjermen og ville dekket veiviseren
    'html:not(.vv-off) #root .app-shell { min-height: 0 !important; }',
    // Engelsk og innloggede: skjult til appen har rendret (som #root[data-prerendered], public/seo-early.js)
    `html.pr-client ${SCOPE} { visibility: hidden; }`,
  ].join('\n')
  return {
    head: `${fonts}\n    <style id="veiviser-css">\n${hostCss}\n    </style>`,
    body: `<main id="veiviser" data-veiviser-host>\n${markup}\n</main>\n<script type="module" src="/arveveiviser/page.js"></script>\n<script type="module" src="/arveveiviser/ui.js"></script>`,
  }
}

export function injectVeiviser(html, parts) {
  if (html.split('</head>').length !== 2 || html.split('</body>').length !== 2) throw new Error('veiviser: uventet HTML-mal')
  return html.replace('</head>', () => `  ${parts.head}\n  </head>`).replace('</body>', () => `${parts.body}\n  </body>`)
}
