import React from 'react'
import ReactDOM from 'react-dom/client'
import { flushSync } from 'react-dom'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { getLang } from './lib/lang'
import { applyTextSize } from './lib/textSize'
import { hasAuthInUrl, hasStoredSession } from './seo/clientState'

// Tekststørrelsen settes før første visning, så siden ikke hopper
applyTextSize()

if (getLang() === 'en') {
  document.documentElement.lang = 'en'
  document.title = 'Arvklart — Inheritance distribution made simpler'
}

// Offentlige sider kan være forhåndsrendret (src/seo/vitePlugin.js): HTML-en er appens første visning på norsk
// for en besøkende uten innlogging. Bare da hydreres den (samme DOM, ingen blinking). Engelsk, innloggede
// (også demoen) og lenker fra e-post med økten i adressen rendres i nettleseren som før: Splash og så siden. Den forhåndsrendrede teksten er da skjult
// av public/seo-early.js til React har tatt over, og byttes ut i én operasjon.
const container = document.getElementById('root')
const prerendered = container.hasAttribute('data-prerendered')
const app = (props) => <BrowserRouter><App {...props} /></BrowserRouter>

if (prerendered && getLang() === 'no' && !hasStoredSession() && !hasAuthInUrl()) {
  ReactDOM.hydrateRoot(container, app({ prerendered: true }))
} else {
  const root = ReactDOM.createRoot(container)
  flushSync(() => root.render(app({})))
  container.removeAttribute('data-prerendered')
  document.documentElement.classList.remove('pr-client')
}
