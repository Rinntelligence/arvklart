import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { isEn } from '../lib/lang'
import { DEFAULT_META, canonicalUrl, pageFor } from './pages'

// Holder tittel, beskrivelse og canonical i <head> i takt med ruten når brukeren navigerer i appen.
// Offentlige sider (src/seo/pages.js) får sin egen tittel og canonical; alle andre stier får standardtittelen
// og ingen canonical (de har X-Robots-Tag: noindex fra vercel.json). Forhåndsrendrede sider har de samme
// taggene i HTML-en fra serveren; her oppdateres de eksisterende taggene, så det aldri blir to.
function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

function setLink(rel, href) {
  const existing = document.head.querySelectorAll(`link[rel="${rel}"]`)
  if (!href) { existing.forEach(el => el.remove()); return }
  existing.forEach((el, i) => { if (i > 0) el.remove() })
  const el = existing[0] || document.head.appendChild(Object.assign(document.createElement('link'), { rel }))
  el.setAttribute('href', href)
}

export function applyRouteMeta(pathname) {
  const page = pageFor(pathname)
  const meta = page || DEFAULT_META
  const title = isEn() ? meta.title_en : meta.title
  const description = isEn() ? meta.description_en : meta.description
  document.title = title
  setMeta('name', 'description', description)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setLink('canonical', page ? canonicalUrl(page.path) : null)
  if (page) setMeta('property', 'og:url', canonicalUrl(page.path))
  else document.head.querySelector('meta[property="og:url"]')?.remove()
}

export default function RouteMeta() {
  const { pathname } = useLocation()
  useEffect(() => { applyRouteMeta(pathname) }, [pathname])
  return null
}
