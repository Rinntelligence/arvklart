// Guidene (content/guider/<slug>.md) leses ved bygging: metadata øverst (mellom ---) og Markdown under.
// Bare i Node (byggesteget src/seo/vitePlugin.js og testene); nettleseren får bare metadata for publiserte guider
// via den virtuelle modulen «virtual:arvklart-guides» (src/seo/registry.js).
//
// Metadata (se content/guider/README.md):
//   title, description, status (draft|published), author, published (ÅÅÅÅ-MM-DD), updated (valgfri),
//   canonical (valgfri, bare på hoveddomenet), og_image (valgfri, /sti), schema (article|none, standard article),
//   sources (liste «Tittel | https://…»), related (liste med interne stier).
// Utkast (draft) bygges aldri: de får ingen side, står ikke i sitemap og er ukjente for nettleseren (404).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { renderMarkdown } from './markdown.js'
import { SITE_URL, PUBLIC_PAGES } from './pages.js'

export const GUIDE_PREFIX = '/guider/'
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const KEYS = new Set(['title', 'description', 'status', 'author', 'published', 'updated', 'canonical', 'og_image', 'schema', 'sources', 'related'])
const LISTS = new Set(['sources', 'related'])

export function parseFrontmatter(text, file = 'guide') {
  const m = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) throw new Error(`${file}: mangler metadata mellom --- øverst`)
  const meta = {}
  let current = null
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const item = line.match(/^\s+-\s+(.+)$/)
    if (item) {
      if (!current) throw new Error(`${file}: listepunkt uten felt: «${line.trim()}»`)
      meta[current].push(item[1].trim())
      continue
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) throw new Error(`${file}: kan ikke lese linjen «${line}»`)
    const [, key, value] = kv
    if (!KEYS.has(key)) throw new Error(`${file}: ukjent felt «${key}»`)
    if (LISTS.has(key)) {
      if (value.trim()) throw new Error(`${file}: «${key}» er en liste; skriv punktene på egne linjer med «  - »`)
      meta[key] = []
      current = key
    } else {
      meta[key] = value.trim().replace(/^"(.*)"$/, '$1')
      current = null
    }
  }
  return { meta, body: m[2] }
}

const validDate = (s) => DATE.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)

// Leser og kontrollerer én guide. Feil stopper bygget (heller ingen publisering enn en feil side).
export function parseGuide(text, file) {
  const slug = basename(file, '.md')
  const { meta, body } = parseFrontmatter(text, file)
  const fail = (msg) => { throw new Error(`${file}: ${msg}`) }
  if (!SLUG.test(slug)) fail('filnavnet (slug) må være små bokstaver a–z, tall og bindestrek, f.eks. fordeling-av-innbo.md')
  for (const key of ['title', 'description', 'status', 'author']) if (!meta[key]) fail(`mangler «${key}»`)
  if (!['draft', 'published'].includes(meta.status)) fail('status må være draft eller published')
  if (meta.description.length > 200) fail('description er over 200 tegn')
  if (meta.status === 'published' && !meta.published) fail('en publisert guide må ha «published» (dato)')
  for (const key of ['published', 'updated']) if (meta[key] && !validDate(meta[key])) fail(`«${key}» må være en gyldig dato ÅÅÅÅ-MM-DD`)
  if (meta.updated && meta.published && meta.updated < meta.published) fail('«updated» er før «published»')
  const path = `${GUIDE_PREFIX}${slug}`
  const canonical = meta.canonical || `${SITE_URL}${path}`
  if (!canonical.startsWith(`${SITE_URL}/`)) fail(`canonical må være på ${SITE_URL}`)
  if (meta.og_image && !/^\/[\w./-]+$/.test(meta.og_image)) fail('og_image må være en sti på nettstedet, f.eks. /bilder/guide.jpg')
  if (meta.schema && !['article', 'none'].includes(meta.schema)) fail('schema må være article eller none')
  const sources = (meta.sources || []).map(s => {
    const [title, url] = s.split('|').map(x => x.trim())
    if (!title || !/^https:\/\//.test(url || '')) fail(`kilden «${s}» må være «Tittel | https://…»`)
    return { title, url }
  })
  const related = meta.related || []
  for (const r of related) if (!/^\/[a-z0-9/-]*$/.test(r)) fail(`related «${r}» må være en intern sti`)
  let rendered
  try { rendered = renderMarkdown(body) } catch (e) { fail(e.message) }
  if (!rendered.html.trim()) fail('teksten er tom')
  return {
    kind: 'guide',
    slug,
    path,
    status: meta.status,
    title: meta.title,
    title_en: meta.title, // guidene er på norsk; engelsk tittel = norsk
    description: meta.description,
    description_en: meta.description,
    author: meta.author,
    published: meta.published || null,
    updated: meta.updated || null,
    lastmod: meta.updated || meta.published || null,
    canonical,
    og_image: meta.og_image || null,
    schema: meta.schema || 'article',
    sources,
    related,
    html: rendered.html,
    headings: rendered.headings,
    links: rendered.links,
    prerender: true,
    sitemap: true,
  }
}

export const CONTENT_DIR = process.env.ARVKLART_CONTENT_DIR || 'content'

export function loadGuides(root = CONTENT_DIR, { includeDrafts = false } = {}) {
  const dir = join(root, 'guider')
  if (!existsSync(dir)) return []
  const guides = readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').sort()
    .map(f => parseGuide(readFileSync(join(dir, f), 'utf8'), join(dir, f)))
  return includeDrafts ? guides : guides.filter(g => g.status === 'published')
}

// Alle offentlige, indekserbare sider: markedssidene i pages.js og de publiserte guidene. Kontrollerer at interne
// lenker i guidene peker til sider som finnes (ellers stopper bygget).
export function publicRegistry(root = CONTENT_DIR) {
  const guides = loadGuides(root)
  const all = [...PUBLIC_PAGES.map(p => ({ kind: 'page', ...p, lastmod: p.lastmod || null })), ...guides]
  const paths = new Set(all.map(p => p.path))
  if (paths.size !== all.length) throw new Error('to offentlige sider har samme adresse')
  for (const g of guides) {
    for (const href of [...g.links.filter(l => l.startsWith('/')), ...g.related]) {
      const target = href.split('#')[0].split('?')[0]
      if (!paths.has(target)) throw new Error(`${g.path}: den interne lenken «${href}» peker ikke til en publisert side`)
    }
  }
  return all
}

// Metadata nettleseren trenger (ingen tekst): RouteMeta og hvilke stier som er offentlige
export const clientMeta = (g) => ({ path: g.path, title: g.title, title_en: g.title_en, description: g.description, description_en: g.description_en, canonical: g.canonical, prerender: true, sitemap: true, kind: 'guide' })
