import { lazy } from 'react'

// Sider som bare innloggede bruker, lastes som egne filer (code splitting), så offentlige sider (forsiden,
// innlogging, veiviseren) ikke laster hele appen. Se src/appPages.js.
//
// Etter en ny utrulling har en åpen fane fortsatt de gamle filnavnene; de finnes ikke lenger, og importen feiler.
// Da lastes siden på nytt én gang (sessionStorage hindrer løkke), så brukeren får den nye versjonen. Feiler det
// igjen, kastes feilen videre til feilgrensen (src/components/PageErrorBoundary.jsx).
export const RELOAD_KEY = 'hs_chunk_reload'

export function reloadOnce() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch { return false } // uten sessionStorage kan vi ikke vite om vi allerede har prøvd
  window.location.reload()
  return true
}

const loaded = () => { try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* privat modus */ } }

// lazyPage(() => import('./pages/X')) eller med navngitt eksport: lazyPage(() => import('./pages/Y'), m => m.Y)
export function lazyPage(load, pick = (m) => m.default) {
  const Page = lazy(() => load().then(
    (m) => { loaded(); return { default: pick(m) } },
    (err) => { if (reloadOnce()) return new Promise(() => {}); throw err },
  ))
  // Forhåndslasting i bakgrunnen etter innlogging: feil her er ufarlige (siden lastes igjen når den åpnes)
  Page.preload = () => load().catch(() => {})
  return Page
}
