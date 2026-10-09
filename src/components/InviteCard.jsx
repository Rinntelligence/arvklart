import { useEffect, useRef, useState } from 'react'
import { L, isEn } from '../lib/lang'
import { inviteMessage } from '../lib/invite'

// Invitasjon i ett skjermbilde: ferdig melding (norsk eller engelsk) med lenken, og del den slik det
// passer – dele-menyen på telefonen, SMS, e-post eller kopier. Vises etter at en arving er lagt til,
// og fra arvingens rad («Send invitasjon») så lenge arvingen ikke har blitt med.
export default function InviteCard({ heir, estateName, inviteUrl, onClose }) {
  const [lang, setLang] = useState(isEn() ? 'en' : 'no')
  const [copied, setCopied] = useState(false)
  const headingRef = useRef(null)
  useEffect(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [heir.email])

  const text = inviteMessage({ lang, name: heir.name, email: heir.email, estateName, url: inviteUrl })
  const subject = lang === 'en' ? `Invitation to ${estateName} in Arvklart` : `Invitasjon til ${estateName} i Arvklart`
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  const share = () => navigator.share({ title: subject, text }).catch(() => {})
  const copy = () => { navigator.clipboard?.writeText(text); setCopied(true) }

  const btn = { minHeight: '44px', padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }
  const primary = { ...btn, background: '#3A2F26', color: '#FBF9F5', border: 'none' }
  const secondary = { ...btn, background: '#fff', color: '#3A2F26', border: '1px solid #9A8B78' }

  return (
    <section aria-labelledby="invite-card-title" style={{ background: '#fff', border: '2px solid #5F6E52', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
      <h2 id="invite-card-title" ref={headingRef} tabIndex={-1} style={{ fontFamily: 'Fraunces, serif', fontSize: '1.125rem', fontWeight: '400', color: '#3A2F26', marginBottom: '8px' }}>
        {L(`Send invitasjonen til ${heir.name}`, `Send the invitation to ${heir.name}`)}
      </h2>
      <p style={{ fontSize: '0.875rem', color: '#5C4530', lineHeight: 1.6, marginBottom: '12px' }}>
        {L(`${heir.name} kan bli med når de logger inn eller oppretter konto med ${heir.email}.`, `${heir.name} can join when they log in or create an account with ${heir.email}.`)}
      </p>
      <div role="group" aria-label={L('Språk i meldingen', 'Language of the message')} style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        {[['no', 'Norsk'], ['en', 'English']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setLang(k); setCopied(false) }} aria-pressed={lang === k} lang={k === 'en' ? 'en' : 'no'}
            style={lang === k ? { ...primary, padding: '6px 14px' } : { ...secondary, padding: '6px 14px' }}>{label}</button>
        ))}
      </div>
      <p lang={lang === 'en' ? 'en' : 'no'} style={{ background: '#FBF9F5', border: '1px solid #D9CFC0', borderRadius: '8px', padding: '12px', fontSize: '0.9375rem', color: '#3A2F26', lineHeight: 1.6, overflowWrap: 'anywhere', marginBottom: '12px' }}>{text}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))', gap: '8px' }}>
        {canShare && <button type="button" onClick={share} style={primary}>{L('Del …', 'Share …')}</button>}
        <a href={`sms:?&body=${encodeURIComponent(text)}`} style={canShare ? secondary : primary}>{L('Send SMS', 'Send text message')}</a>
        <a href={`mailto:${encodeURIComponent(heir.email).replace('%40', '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`} style={secondary}>{L('Send e-post', 'Send email')}</a>
        <button type="button" onClick={copy} style={secondary}>{copied ? L('Kopiert ✓', 'Copied ✓') : L('Kopier meldingen', 'Copy the message')}</button>
      </div>
      <p style={{ fontSize: '0.8125rem', color: '#75604B', lineHeight: 1.6, marginTop: '10px' }}>
        {L('Skjer det ingenting når du trykker «Send e-post»? Da er det ikke satt opp et e-postprogram på enheten. Trykk «Kopier meldingen» og lim den inn i e-posten din.',
          'Nothing happens when you tap «Send email»? Then no email app is set up on this device. Tap «Copy the message» and paste it into your email.')}
      </p>
      <button type="button" onClick={onClose} style={{ ...btn, background: 'none', border: 'none', color: '#5F6E52', textDecoration: 'underline', marginTop: '8px', padding: '10px 0' }}>{L('Ferdig', 'Done')}</button>
    </section>
  )
}
