// Teknisk SEO i byggesteget (registrert i vite.config.js):
//  - Setter inn standardtaggene fra src/seo/pages.js i index.html (skallet som serveres på alle app-stier).
//  - Forhåndsrendrer offentlige sider med prerender: true til dist/<side>.html (vercel.json omskriver /<side> dit).
//    HTML-en er appens egen første visning (<App prerendered />) for en besøkende uten innlogging på norsk, så
//    søkemotorer og brukere får samme innhold, og nettleseren kan hydrere den uten å bytte ut DOM-en (main.jsx).
// Supabase byttes ut med en tom klient under renderingen: ingen nettverk, ingen miljøvariabler. Bruker noe
// Supabase under selve renderingen, feiler bygget (det skal bare skje i effekter, som ikke kjører på serveren).
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { PUBLIC_PAGES, defaultHeadTags, headTags } from './pages.js'

const SEO_PLACEHOLDER = '<!--seo-->'
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/
const ROOT_EMPTY = '<div id="root"></div>'
const ENTRY = fileURLToPath(new URL('./prerender.jsx', import.meta.url))
const SUPABASE_STUB = fileURLToPath(new URL('./supabaseStub.js', import.meta.url))

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

export function injectRoot(html, markup) {
  if (!html.includes(ROOT_EMPTY)) throw new Error(`SEO: fant ikke ${ROOT_EMPTY} i index.html`)
  return html.replace(ROOT_EMPTY, () => `<div id="root" data-prerendered>${markup}</div>`)
}

export default function seoPlugin() {
  let config
  return {
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
      const template = await readFile(resolve(outDir, 'index.html'), 'utf8')
      const server = await createServer({
        root: config.root,
        configFile: false,
        logLevel: 'error',
        appType: 'custom',
        plugins: [react()],
        resolve: { alias: [{ find: /^@supabase\/supabase-js$/, replacement: SUPABASE_STUB }] },
        server: { middlewareMode: true, hmr: false, ws: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      })
      try {
        const { render } = await server.ssrLoadModule(ENTRY)
        for (const page of PUBLIC_PAGES.filter(p => p.prerender)) {
          const markup = unescapeStyles(render(page.path))
          if (!/<h1[\s>]/.test(markup)) throw new Error(`SEO: ${page.path} ble rendret uten <h1>`)
          const html = injectRoot(injectHead(template, headTags(page)), markup)
          await writeFile(resolve(outDir, `${page.path.slice(1)}.html`), html)
        }
      } finally {
        await server.close()
      }
    },
  }
}
