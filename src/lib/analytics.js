// Statistikk med Google Analytics 4 via Google Tag Manager – bare med samtykke, og bare på offentlige sider for
// besøkende som ikke er innlogget (src/components/AnalyticsConsent.jsx). Aldri i appen, i boene eller i demoen.
// Skriptet lastes fra denne filen (ikke direkte i HTML-en), så innholdsreglene (CSP i vercel.json) kan holdes stramme.
import { hasAuthInUrl } from '../seo/clientState.js'

export const GTM_ID = 'GTM-KQWKCWBC'
export const CONSENT_KEY = 'hs_analytics_consent'
// Øk versjonen når hva det samtykkes til endres vesentlig (nye formål eller mottakere): da spørres alle på nytt
export const CONSENT_VERSION = 1
export const CONSENT_EVENT = 'arvklart:consent'

export function getConsent() {
  try {
    const v = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null')
    return v?.v === CONSENT_VERSION && ['granted', 'denied'].includes(v.choice) ? v.choice : null
  } catch { return null }
}

// Bare offentlige sider, ikke innlogget, og ikke med økten fra en e-postlenke i adressen.
// page er oppslaget i registeret over offentlige sider (pageFor i src/seo/registry.js: markedssidene og de
// publiserte guidene; aldri utkast, app-sider eller ukjente adresser). Oppslaget gjøres av komponenten, så denne
// regelen er ren og kan testes uten byggesteget.
export function canLoadAnalytics({ consent, page, loggedIn, authInUrl }) {
  return consent === 'granted' && Boolean(page?.path) && ['page', 'guide', undefined].includes(page.kind) && !loggedIn && !authInUrl
}

export const isGtmLoaded = () => typeof window !== 'undefined' && Boolean(window.__arvklartGtm)

function gtag() { window.dataLayer.push(arguments) } // GTM krever Arguments-objektet, ikke en tabell

// Googles dokumenterte oppstart av GTM, med samtykkemodus: bare statistikk, aldri annonser.
export function loadGtm() {
  if (isGtmLoaded()) return
  window.__arvklartGtm = true
  window.dataLayer = window.dataLayer || []
  gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
  document.head.appendChild(s)
}

// Google Analytics' informasjonskapsler (_ga, _ga_<id>, _gid) på verten og på hoveddomenet (.arvklart.no)
export function clearAnalyticsCookies() {
  const host = window.location.hostname
  const domains = ['', host, `.${host.replace(/^www\./, '')}`]
  for (const name of document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(n => /^_ga(_|$)|^_gid$/.test(n)))
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ''}`
}

export function setConsent(choice) {
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, choice, at: new Date().toISOString() })) } catch { /* privat modus: spør igjen neste gang */ }
  if (choice === 'denied') {
    clearAnalyticsCookies()
    // Allerede lastet: si fra til Google, og last siden på nytt uten GTM
    if (isGtmLoaded()) { gtag('consent', 'update', { analytics_storage: 'denied' }); window.location.reload(); return }
  }
  window.dispatchEvent(new Event(CONSENT_EVENT))
}

export { hasAuthInUrl }
