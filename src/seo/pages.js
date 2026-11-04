// Markedssidene (egne React-komponenter) som kan indekseres. Guidene ligger i content/guider/*.md
// (src/seo/content.js). Sammen er de registeret over offentlige sider (publicRegistry i content.js ved bygging,
// src/seo/registry.js i nettleseren), som metadata, forhåndsrendering, sitemap.xml og RouteMeta bygger på.
//
// Ny markedsside: legg den inn her med prerender: true, og legg ruten inn i App.jsx. Ingen endring i vercel.json
// eller sitemap: «/<side>» omskrives generelt til «/<side>.html», som byggesteget lager, og sitemap.xml lages ved
// bygging. test/seo/seo.test.js sjekker at rutene i App.jsx, reglene i vercel.json og registeret stemmer.
// Alle andre stier (appen på /app og /estate/…, innlogging, invitasjoner) får noindex; ukjente adresser gir 404.
// Ren data uten nettleser-API-er: brukes både i nettleseren og i byggesteget (src/seo/vitePlugin.js).

export const SITE_URL = 'https://www.arvklart.no'
export const SITE_NAME = 'Arvklart'
export const OG_IMAGE = '/hero-bg.jpg'
export const CONTACT_EMAIL = 'admin@arvklart.no'

export const DEFAULT_META = {
  title: 'Arvklart — Arvefordeling gjort enklere',
  title_en: 'Arvklart — Inheritance distribution made simpler',
  description: 'Arvklart hjelper familier med å fordele arv på en ryddig, inkluderende og rettferdig måte.',
  description_en: 'Arvklart helps families distribute an inheritance in an orderly, inclusive and fair way.',
}

export const PUBLIC_PAGES = [
  {
    path: '/',
    ...DEFAULT_META,
    prerender: true,
    sitemap: true,
    organization: true,
    website: true,
  },
  {
    path: '/kontakt',
    title: 'Kontakt — Arvklart',
    title_en: 'Contact — Arvklart',
    description: 'Har du spørsmål om Arvklart, trenger hjelp med et bo eller vil gi oss tilbakemelding? Send oss en e-post.',
    description_en: 'Do you have questions about Arvklart, need help with an estate or want to give us feedback? Send us an email.',
    prerender: true,
    sitemap: true,
  },
  {
    path: '/personvern',
    title: 'Personvernerklæring og vilkår — Arvklart',
    title_en: 'Privacy policy and terms — Arvklart',
    description: 'Personvernerklæringen beskriver hvordan Arvklart behandler personopplysninger om deg som bruker, og vilkårene for bruk av tjenesten.',
    description_en: 'The privacy policy describes how Arvklart processes personal data about you as a user, and the terms of use for the service.',
    prerender: false,
    sitemap: true,
  },
  {
    // Hele veiviseren står i HTML-en (src/seo/veiviserHost.js). Tittel og beskrivelse er satt sammen av tekst som
    // står på siden: H1 («Arveveiviser: fra dødsfall til fordelt bo …»), startkortet («Hvem arver – og hvor mye?»)
    // og innledningen. Primært søkeord: arveveiviser; sekundært: hvem arver (og hvor mye).
    path: '/veiviser',
    title: 'Arveveiviser: Hvem arver – og hvor mye? — Arvklart',
    title_en: 'Inheritance guide: Who inherits – and how much? — Arvklart',
    description: 'Arveveiviser: finn ut hvem som arver og omtrent hvor mye, og se hele prosessen fra dødsfall til fordelt bo, med ordliste og offentlige ressurser.',
    description_en: 'Inheritance guide: find out who inherits and roughly how much, and see the whole process from death to a distributed estate, with a glossary and public resources.',
    prerender: true,
    sitemap: true,
  },
]

export const pageFor = (path) => PUBLIC_PAGES.find(p => p.path === path) || null
export const canonicalUrl = (path) => SITE_URL + path
export const canonicalOf = (page) => page.canonical || canonicalUrl(page.path)
export const prerenderedPaths = () => PUBLIC_PAGES.filter(p => p.prerender).map(p => p.path)
// Filen en forhåndsrendret side skrives til: «/» er index.html (Vercel serverer den på «/»), ellers <sti>.html
// (/guider/<slug> blir guider/<slug>.html). Appens skall (app-rutene i vercel.json) ligger i SHELL_FILE.
export const prerenderFile = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`)
export const SHELL_FILE = 'shell.html'

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Organization: bare opplysninger som står på nettstedet (navn, adresse, e-post på /kontakt).
// WebSite (nettstedsnavn i søkeresultatene): bare på forsiden på domenets rot, som Google krever.
export const websiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: `${SITE_URL}/`,
})
export const organizationJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  email: CONTACT_EMAIL,
})

// <head>-tagger for skallet (index.html), som serveres på alle stier: ingen canonical og ingen og:url.
export function defaultHeadTags() {
  return [
    `<title>${esc(DEFAULT_META.title)}</title>`,
    `<meta name="description" content="${esc(DEFAULT_META.description)}" />`,
    ...sharedTags(DEFAULT_META),
  ].join('\n    ')
}

// Guide: Article (forfatter, datoer, utgiver) og BreadcrumbList (Forside › guiden). Bare opplysninger fra guiden.
export const articleJsonLd = (g) => ({
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: g.title,
  description: g.description,
  author: { '@type': g.author === SITE_NAME ? 'Organization' : 'Person', name: g.author },
  publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
  datePublished: g.published,
  ...(g.updated ? { dateModified: g.updated } : {}),
  mainEntityOfPage: canonicalOf(g),
  image: SITE_URL + (g.og_image || OG_IMAGE),
  inLanguage: 'nb-NO',
})
export const breadcrumbJsonLd = (g) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Forside', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: g.title, item: canonicalOf(g) },
  ],
})

// JSON-LD og sidedata er datablokker, ikke skript: de kjøres ikke og stoppes ikke av CSP-en (script-src 'self').
// «<» kodes så teksten aldri kan avslutte blokken.
export const dataBlock = (type, data, id) => `<script type="${type}"${id ? ` id="${id}"` : ''}>${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`

// <head>-tagger for en forhåndsrendret offentlig side (norsk, som er versjonen søkemotorene ser).
export function headTags(page) {
  const url = canonicalOf(page)
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ...sharedTags(page),
  ]
  const ld = (data) => dataBlock('application/ld+json', data)
  if (page.website) tags.push(ld(websiteJsonLd()))
  if (page.organization) tags.push(ld(organizationJsonLd()))
  if (page.kind === 'guide') {
    tags.push(`<meta property="article:published_time" content="${esc(page.published)}" />`)
    if (page.updated) tags.push(`<meta property="article:modified_time" content="${esc(page.updated)}" />`)
    if (page.schema !== 'none') tags.push(ld(articleJsonLd(page)), ld(breadcrumbJsonLd(page)))
  }
  return tags.join('\n    ')
}

// sitemap.xml fra registeret: bare publiserte, indekserbare sider med sitemap: true. lastmod bare når siden har en
// faktisk endringsdato (guidene: updated eller published) – aldri byggetidspunktet.
export function sitemapXml(pages) {
  const urls = pages.filter(p => p.sitemap && (p.kind !== 'guide' || p.status === 'published')).map(p => {
    const loc = canonicalOf(p)
    if (!loc.startsWith(`${SITE_URL}/`)) throw new Error(`sitemap: ${loc} er ikke på ${SITE_URL}`)
    return `  <url><loc>${esc(loc)}</loc>${p.lastmod ? `<lastmod>${esc(p.lastmod)}</lastmod>` : ''}</url>`
  })
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

function sharedTags(meta) {
  const image = SITE_URL + (meta.og_image || OG_IMAGE)
  return [
    `<meta property="og:type" content="${meta.kind === 'guide' ? 'article' : 'website'}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="nb_NO" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ]
}
