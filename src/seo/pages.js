// Offentlige sider som kan indekseres av søkemotorer: én kilde for metadata, forhåndsrendering, sitemap,
// noindex-regelen i vercel.json og RouteMeta. Testene (test/seo/seo.test.js) feiler hvis public/sitemap.xml
// eller vercel.json ikke stemmer med denne listen.
//
// Ny offentlig side:
//   1. Legg den inn her (tekstene hentes fra siden selv; norsk er standard).
//   2. Legg stien inn i unntakene i noindex-regelen i vercel.json (ellers får den X-Robots-Tag: noindex).
//   3. Med prerender: true, legg inn omskriving «/sti» → «/sti.html» i vercel.json før «/(.*)».
//   4. Med sitemap: true, legg URL-en inn i public/sitemap.xml.
// Alle andre stier (appen, innlogging, invitasjoner, ukjente adresser og «/») får noindex.
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
    path: '/home',
    ...DEFAULT_META,
    prerender: true,
    sitemap: true,
    organization: true,
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
    path: '/veiviser',
    title: 'Veiviser — Arvklart',
    title_en: 'Guide — Arvklart',
    description: 'Fra dødsfall til fordelt bo — steg for steg. Finn ut hvem som arver og hvor mye, basert på din situasjon.',
    description_en: 'From death to a distributed estate — step by step. Find out who inherits and how much, based on your situation.',
    prerender: false,
    sitemap: true,
  },
]

export const pageFor = (path) => PUBLIC_PAGES.find(p => p.path === path) || null
export const canonicalUrl = (path) => SITE_URL + path
export const prerenderedPaths = () => PUBLIC_PAGES.filter(p => p.prerender).map(p => p.path)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Organization: bare opplysninger som står på nettstedet (navn, adresse, e-post på /kontakt).
// WebSite (nettstedsnavn) legges ikke inn før den offentlige forsiden ligger på «/»: Google leser den bare der.
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

// <head>-tagger for en forhåndsrendret offentlig side (norsk, som er versjonen søkemotorene ser).
export function headTags(page) {
  const url = canonicalUrl(page.path)
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    ...sharedTags(page),
  ]
  if (page.organization) {
    // JSON-LD er en datablokk, ikke et skript: den kjøres ikke og stoppes ikke av CSP-en (script-src 'self').
    // «<» kodes så teksten aldri kan avslutte blokken.
    tags.push(`<script type="application/ld+json">${JSON.stringify(organizationJsonLd()).replace(/</g, '\\u003c')}</script>`)
  }
  return tags.join('\n    ')
}

function sharedTags(meta) {
  return [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:locale" content="nb_NO" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${esc(SITE_URL + OG_IMAGE)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(SITE_URL + OG_IMAGE)}" />`,
  ]
}
