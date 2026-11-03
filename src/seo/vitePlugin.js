// Teknisk SEO i byggesteget (registrert i vite.config.js):
//  - Setter inn standardtaggene fra src/seo/pages.js i index.html (skallet som serveres på alle app-stier).
//  - Forhåndsrendrer alle offentlige sider med prerender: true i registeret (markedssidene i pages.js og de
//    publiserte guidene i content/guider, src/seo/content.js) til dist/<sti>.html; forsiden «/» til dist/index.html,
//    og appens skall flyttes til dist/shell.html. vercel.json omskriver generelt (/<side> og /guider/<slug>).
//  - Lager dist/sitemap.xml fra registeret (bare publiserte sider; lastmod bare med en faktisk endringsdato).
//  - Gir nettleseren metadata for de publiserte guidene som «virtual:arvklart-guides» (src/seo/registry.js).
//  Innholdsmappen er content/ (ARVKLART_CONTENT_DIR kan peke andre steder, f.eks. testinnhold i e2e-testene).
//    HTML-en er appens egen første visning (<App prerendered />) for en besøkende uten innlogging på norsk, så
//    søkemotorer og brukere får samme innhold, og nettleseren kan hydrere den uten å bytte ut DOM-en (main.jsx).
// Supabase byttes ut med en tom klient under renderingen: ingen nettverk, ingen miljøvariabler. Bruker noe
// Supabase under selve renderingen, feiler bygget (det skal bare skje i effekter, som ikke kjører på serveren).
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { SHELL_FILE, dataBlock, defaultHeadTags, headTags, prerenderFile, sitemapXml } from './pages.js'
import { CONTENT_DIR, clientMeta, publicRegistry } from './content.js'
import { PAGE_DATA_ID } from './pageData.js'

const SEO_PLACEHOLDER = '<!--seo-->'
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/
const ROOT_EMPTY = '<div id="root"></div>'
const ENTRY = fileURLToPath(new URL('./prerender.jsx', import.meta.url))
const SUPABASE_STUB = fileURLToPath(new URL('./supabaseStub.js', import.meta.url))
const VIRTUAL = 'virtual:arvklart-guides'
const RESOLVED = `\0${VIRTUAL}`

// Bare metadata for publiserte guider (aldri tekst, aldri utkast). Feil i guidene stopper bygget her.
function guidesModule(getRoot) {
  return {
    name: 'arvklart-guides',
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null },
    load(id) {
      if (id !== RESOLVED) return null
      const guides = publicRegistry(getRoot()).filter(p => p.kind === 'guide').map(clientMeta)
      return `export const GUIDES = ${JSON.stringify(guides)}`
    },
  }
}

const seoBlock = (tags) => `<!--seo:start-->\n    ${tags}\n    <!--seo:end-->`

export function injectHead(html, tags) {
  if (!SEO_BLOCK.test(html)) throw new Error('SEO: fant ikke <!--seo:start-->…<!--seo:end--> i index.html')
  return html.replace(SEO_BLOCK, () => seoBlock(tags))
}

// renderToString koder tekst i <style> som HTML (`>` blir `&gt;`, `'` blir `&#x27;`), men nettleseren leser
// <style> som ren tekst: CSS-en ville vært ødelagt før hydrering, og teksten ville ikke stemt med appens.
// Kodingen fjernes derfor inne i <style>. Trygt fordi teksten kommer fra komponentene, ikke fra brukere.
const ENTITIES = { '&gt;': '>', '&lt;': '<', '&quot;': '"', '&#x27;': "'", '&#39;': "'", '&amp;': '&' }
export function unescapeStyles(markup) {
  return markup.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open, css, close) => {
    const raw = css.replace(/&(?:gt|lt|quot|#x27|#39|amp);/g, e => ENTITIES[e])
    if (/<\/style/i.test(raw)) throw new Error('SEO: </style> inne i en <style>-blokk')
    return open + raw + close
  })
}

// data: innholdet siden trenger i nettleseren (guidene), lagt rett etter #root som en datablokk (src/seo/pageData.js)
export function injectRoot(html, markup, data = null) {
  if (!html.includes(ROOT_EMPTY)) throw new Error(`SEO: fant ikke ${ROOT_EMPTY} i index.html`)
  const block = data ? dataBlock('application/json', data, PAGE_DATA_ID) : ''
  return html.replace(ROOT_EMPTY, () => `<div id="root" data-prerendered>${markup}</div>${block}`)
}

// Det nettleseren trenger av en guide for å vise den likt (ikke kildeteksten eller lenkelistene)
export const guideData = (g) => ({ kind: 'guide', path: g.path, title: g.title, description: g.description, author: g.author, published: g.published, updated: g.updated, html: g.html, sources: g.sources, related: g.related })

export default function seoPlugin({ contentDir = CONTENT_DIR } = {}) {
  let config
  // Mappen leses først når Vite har lest konfigurasjonen (config.root)
  const root = () => resolve(config?.root || process.cwd(), contentDir)
  return [guidesModule(root), {
    name: 'arvklart-seo',
    configResolved(c) { config = c },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes(SEO_PLACEHOLDER)) throw new Error('SEO: index.html mangler <!--seo-->')
        return html.replace(SEO_PLACEHOLDER, () => seoBlock(defaultHeadTags()))
      },
    },
    async closeBundle() {
      if (config.command !== 'build' || config.build.ssr) return
      const outDir = resolve(config.root, config.build.outDir)
      // Skallet fra Vite (index.html) tas vare på som shell.html før index.html blir den forhåndsrendrede forsiden
      const template = await readFile(resolve(outDir, 'index.html'), 'utf8')
      await writeFile(resolve(outDir, SHELL_FILE), template)
      const server = await createServer({
        root: config.root,
        configFile: false,
        logLevel: 'error',
        appType: 'custom',
        plugins: [react(), guidesModule(root)],
        resolve: { alias: [{ find: /^@supabase\/supabase-js$/, replacement: SUPABASE_STUB }] },
        server: { middlewareMode: true, hmr: false, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      try {
        const { render } = await server.ssrLoadModule(ENTRY)
        const registry = publicRegistry(root())
        for (const page of registry.filter(p => p.prerender)) {
          const data = page.kind === 'guide' ? guideData(page) : null
          const markup = unescapeStyles(render(page.path, data))
          const h1 = (markup.match(/<h1[\s>]/g) || []).length
          if (h1 !== 1) throw new Error(`SEO: ${page.path} ble rendret med ${h1} <h1> (skal være én)`)
          const file = resolve(outDir, prerenderFile(page.path))
          await mkdir(dirname(file), { recursive: true })
          await writeFile(file, injectRoot(injectHead(template, headTags(page)), markup, data))
        }
        await writeFile(resolve(outDir, 'sitemap.xml'), sitemapXml(registry))
      } finally {
        await server.close()
      }
    },
  }]
}
