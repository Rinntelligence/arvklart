import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { amIFounder, getAssuranceLevel, getVerifiedTotpFactor, enrollTotp, verifyTotp } from '../lib/founder'

// Tofaktor-steg foran founder-dashboardet. Dette er kun UX: dataene beskyttes av
// is_founder() i databasen, som avviser alle kall uten founders-rad og aal2.
export default function FounderGate({ children }) {
  // checking | denied | enroll | verify | ok
  const [step, setStep] = useState('checking')
  const [factorId, setFactorId] = useState(null)
  const [qr, setQr] = useState(null)
  const [secret, setSecret] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const check = async () => {
      if (!(await amIFounder())) return setStep('denied')
      if ((await getAssuranceLevel()) === 'aal2') return setStep('ok')
      const factor = await getVerifiedTotpFactor()
      if (factor) {
        setFactorId(factor.id)
        return setStep('verify')
      }
      const { data, error } = await enrollTotp()
      if (error) {
        setError('Kunne ikke starte oppsett av tofaktor. Sjekk at MFA er aktivert i Supabase.')
        return setStep('enroll')
      }
      setFactorId(data.id)
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setStep('enroll')
    }
    check()
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!factorId || code.trim().length !== 6) return
    setBusy(true)
    setError('')
    const { error } = await verifyTotp(factorId, code)
    setBusy(false)
    if (error) {
      setCode('')
      return setError('Feil kode. Prøv igjen med koden som vises nå.')
    }
    setStep('ok')
  }

  if (step === 'checking') return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Sjekker tilgang…</div>
  if (step === 'denied') return <Navigate to="/" replace />
  if (step === 'ok') return children

  return (
    <div style={{ maxWidth:'420px', margin:'60px auto', padding:'0 16px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'28px' }}>
        <h1 style={{ fontFamily:"'Fraunces', serif", fontSize:'22px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>
          {step === 'enroll' ? 'Sett opp tofaktor' : 'Bekreft at det er deg'}
        </h1>
        <p style={{ fontSize:'14px', color:'#5C4530', lineHeight:'1.6', marginBottom:'20px' }}>
          {step === 'enroll'
            ? 'Founder-dashboardet krever tofaktor. Skann QR-koden med en autentiseringsapp (f.eks. Google Authenticator eller 1Password) og skriv inn koden appen viser.'
            : 'Skriv inn den 6-sifrede koden fra autentiseringsappen din.'}
        </p>

        {step === 'enroll' && qr && (
          <div style={{ textAlign:'center', marginBottom:'20px' }}>
            <img src={qr} alt="QR-kode for tofaktor" style={{ width:'180px', height:'180px', background:'#FBF9F5', borderRadius:'8px' }} />
            <div style={{ fontSize:'12px', color:'#9C8267', marginTop:'10px' }}>Kan ikke skanne? Skriv inn nøkkelen manuelt:</div>
            <code style={{ display:'inline-block', marginTop:'4px', fontSize:'12px', color:'#3A2F26', background:'#E8DFD0', padding:'4px 8px', borderRadius:'6px', wordBreak:'break-all' }}>{secret}</code>
          </div>
        )}

        {factorId && (
          <form onSubmit={submit}>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456"
              style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'20px', letterSpacing:'6px', textAlign:'center', background:'#E8DFD0', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box', marginBottom:'14px' }}
            />
            <button type="submit" disabled={busy || code.length !== 6} style={{
              width:'100%', padding:'12px', border:'none', borderRadius:'8px', fontSize:'15px', fontFamily:'Karla, sans-serif',
              background: busy || code.length !== 6 ? '#D9CFC0' : '#3A2F26', color:'#FBF9F5',
              cursor: busy || code.length !== 6 ? 'not-allowed' : 'pointer',
            }}>{busy ? 'Bekrefter…' : 'Bekreft'}</button>
          </form>
        )}

        {error && <div style={{ marginTop:'14px', fontSize:'13px', color:'#8B3A3A' }}>{error}</div>}
      </div>
    </div>
  )
}
