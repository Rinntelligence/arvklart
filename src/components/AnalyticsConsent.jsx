import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { L } from '../lib/lang'
import { CONSENT_EVENT, canLoadAnalytics, getConsent, hasAuthInUrl, isGtmLoaded, loadGtm, setConsent } from '../lib/analytics'
// Registeret over offentlige sider: markedssidene og alle publiserte guider (aldri utkast eller app-sider)
import { pageFor } from '../seo/registry'

// Samtykke til statistikk (Google Analytics 4 via Google Tag Manager), se src/lib/analytics.js.
//  - Spørsmålet vises bare på offentlige sider (src/seo/registry.js, også publiserte guider) for besøkende som ikke er innlogget, og først etter at siden er
//    vist (ikke i den forhåndsrendrede HTML-en, så søkemotorer og hydreringen ser samme innhold som før).
//  - «Godta» og «Avslå» er like enkle. Valget kan endres på /personvern#informasjonskapsler.
//  - Er GTM lastet og siden går over i appen (innlogging, demo) eller til en side som ikke er offentlig, lastes
//    siden på nytt uten GTM, så appens adresser aldri sendes til Google.
export default function AnalyticsConsent({ loggedIn }) {
  const { pathname } = useLocation()
  const [consent, setConsentState] = useState(undefined) // undefined = ikke lest ennå (som på serveren)

  useEffect(() => {
    const read = () => setConsentState(getConsent())
    read()
    window.addEventListener(CONSENT_EVENT, read)
    return () => window.removeEventListener(CONSENT_EVENT, read)
  }, [])

  useEffect(() => {
    if (consent === undefined) return
    const allowed = canLoadAnalytics({ consent, page: pageFor(pathname), loggedIn, authInUrl: hasAuthInUrl() })
    if (allowed) loadGtm()
    else if (isGtmLoaded()) window.location.reload()
  }, [consent, pathname, loggedIn])

  if (consent !== null || loggedIn || !pageFor(pathname)) return null
  return (
    <section aria-label={L('Informasjonskapsler', 'Cookies')} style={{
      position: 'fixed', left: '16px', right: '16px', bottom: '16px', zIndex: 10000, maxWidth: '440px',
      background: '#FBF9F5', color: '#3A2F26', border: '1px solid #D9CFC0', borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '18px 20px', fontFamily: 'Karla, sans-serif',
    }}>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: '1.125rem', marginBottom: '8px' }}>{L('Tillater du statistikk?', 'Do you allow statistics?')}</h2>
      <p style={{ fontSize: '0.875rem', lineHeight: 1.55, color: '#5C4530', marginBottom: '14px' }}>
        {L(
          'Med samtykket ditt bruker vi Google Analytics til å se hvordan forsiden og veiviseren brukes. Det lagrer informasjonskapsler og sender opplysninger om besøket til Google. Appen og boene måles aldri.',
          'With your consent, we use Google Analytics to see how the home page and the guide are used. This stores cookies and sends information about the visit to Google. The app and the estates are never measured.',
        )}{' '}
        <a href="/personvern#informasjonskapsler" style={{ color: '#5F6E52' }}>{L('Les mer', 'Read more')}</a>
      </p>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {[['granted', L('Godta', 'Accept')], ['denied', L('Avslå', 'Decline')]].map(([choice, label]) => (
          <button key={choice} onClick={() => setConsent(choice)} style={{
            flex: '1 1 120px', minHeight: '44px', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer',
            background: '#3A2F26', color: '#FBF9F5', border: 'none', fontFamily: 'Karla, sans-serif', fontSize: '0.9375rem', fontWeight: 500,
          }}>{label}</button>
        ))}
      </div>
    </section>
  )
}

// Valget på personvernsiden: status og knapp for å endre det (like enkelt å trekke tilbake som å gi)
export function ConsentSettings() {
  const [consent, setConsentState] = useState(undefined)
  useEffect(() => {
    const read = () => setConsentState(getConsent())
    read()
    window.addEventListener(CONSENT_EVENT, read)
    return () => window.removeEventListener(CONSENT_EVENT, read)
  }, [])
  if (consent === undefined) return null
  const status = consent === 'granted' ? L('Du har godtatt statistikk i denne nettleseren.', 'You have accepted statistics in this browser.')
    : consent === 'denied' ? L('Du har avslått statistikk i denne nettleseren.', 'You have declined statistics in this browser.')
      : L('Du har ikke valgt ennå. Ingen statistikk samles inn før du godtar.', 'You have not chosen yet. No statistics are collected until you accept.')
  const btn = { minHeight: '44px', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: '#3A2F26', color: '#FBF9F5', border: 'none', fontFamily: 'Karla, sans-serif', fontSize: '0.9375rem', marginRight: '10px', marginTop: '6px' }
  return (
    <div style={{ background: '#E8DFD0', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
      <p role="status" style={{ fontSize: '0.9375rem', color: '#3A2F26', marginBottom: '6px' }}>{status}</p>
      {consent !== 'granted' && <button style={btn} onClick={() => setConsent('granted')}>{L('Godta statistikk', 'Accept statistics')}</button>}
      {consent !== 'denied' && <button style={btn} onClick={() => setConsent('denied')}>{consent === 'granted' ? L('Trekk tilbake samtykket', 'Withdraw consent') : L('Avslå statistikk', 'Decline statistics')}</button>}
    </div>
  )
}
