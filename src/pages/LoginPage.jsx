import { useState } from 'react'
import { supabase, signIn, signUp } from '../lib/supabase'
import { L } from '../lib/lang'

const hasPendingInvite = () => { try { return Boolean(localStorage.getItem('pendingJoinCode')) } catch { return false } }

export default function LoginPage({ onToast }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [confirmSent, setConfirmSent] = useState(false)
  const [invited] = useState(hasPendingInvite)

  const errMsg = (msg) => {
    if (msg.includes('Invalid login')) return L('Feil e-post eller passord', 'Wrong email or password')
    if (msg.includes('Email not confirmed')) return L('E-posten er ikke bekreftet ennå — sjekk innboksen din', 'Your email is not confirmed yet — check your inbox')
    if (msg.includes('already registered')) return L('E-posten er allerede registrert — logg inn i stedet', 'This email is already registered — log in instead')
    if (msg.includes('Password should')) return L('Passordet må ha minst 6 tegn', 'The password must have at least 6 characters')
    if (msg.includes('rate limit') || msg.includes('security purposes')) return L('For mange forsøk — vent litt og prøv igjen', 'Too many attempts — wait a moment and try again')
    return msg
  }

  const switchMode = (m) => { setMode(m); setResetSent(false); setConfirmSent(false) }

  const handleReset = async () => {
    if (!email.trim()) return
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nytt-passord`,
    })
    setLoading(false)
    if (error) { onToast(errMsg(error.message), 'error'); return }
    setResetSent(true)
  }

  const handleSubmit = async () => {
    if (mode === 'forgot') return handleReset()
    if (!email.trim() || !password.trim()) return
    if (mode === 'signup' && !name.trim()) return
    setLoading(true)

    if (mode === 'signup') {
      // Profilen opprettes fra navnet i App når brukeren er logget inn
      const { data, error } = await signUp(email.trim(), password, name.trim())
      if (error) { onToast(errMsg(error.message), 'error'); setLoading(false); return }
      // Uten økt må e-posten bekreftes først. Tom identities betyr at e-posten allerede er registrert.
      if (!data?.session) {
        if (data?.user && !data.user.identities?.length) onToast(errMsg('already registered'), 'error')
        else setConfirmSent(true)
      }
    } else {
      const { error } = await signIn(email.trim(), password)
      if (error) { onToast(errMsg(error.message), 'error') }
    }
    setLoading(false)
  }

  const canSubmit = mode === 'forgot'
    ? email.trim()
    : email.trim() && password.trim() && (mode === 'login' || name.trim())

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', display:'flex', fontFamily:'Karla, sans-serif' }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 20px' }}>
        <div style={{ maxWidth:'400px', width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:'40px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5C4530" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:'16px' }}>
              <path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/>
            </svg>
            <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'30px', fontWeight:'400', color:'#3A2F26', marginBottom:'10px' }}>Arvklart</h1>
            <p style={{ color:'#9C8267', fontSize:'15px', lineHeight:'1.6' }}>{L('Den profesjonelle plattformen for rettferdig fordeling av arv', 'The professional platform for fair distribution of inheritance')}</p>
          </div>

          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'36px', boxShadow:'0 4px 32px rgba(0,0,0,0.06)' }}>
            {mode==='forgot' ? (
              <div style={{ marginBottom:'24px' }}>
                <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'22px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Glemt passord', 'Forgot password')}</h2>
                <p style={{ color:'#9C8267', fontSize:'14px', lineHeight:'1.6', margin:0 }}>{L('Skriv inn e-postadressen din, så sender vi deg en lenke for å velge nytt passord.', 'Enter your email address and we will send you a link to choose a new password.')}</p>
              </div>
            ) : (
            <div style={{ display:'flex', background:'#E8DFD0', borderRadius:'8px', padding:'4px', marginBottom:'28px' }}>
              {[['login',L('Logg inn','Log in')],['signup',L('Opprett konto','Create account')]].map(([m,l]) => (
                <button key={m} onClick={()=>switchMode(m)} style={{
                  flex:1, padding:'9px', border:'none', borderRadius:'6px', cursor:'pointer',
                  background:mode===m?'#fff':'transparent',
                  color:mode===m?'#3A2F26':'#9C8267', fontSize:'14px', fontFamily:'Karla, sans-serif',
                  boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.08)':'none', transition:'all 0.15s',
                }}>{l}</button>
              ))}
            </div>
            )}

            {invited && mode !== 'forgot' && !confirmSent && (
              <div style={{ background:'#DCE3D2', borderRadius:'8px', padding:'12px 14px', fontSize:'13px', color:'#3A5A30', lineHeight:'1.5', marginBottom:'18px' }}>
                {L('Du er invitert til et bo. Logg inn eller opprett konto med e-posten invitasjonen ble sendt til, så blir du med automatisk.', 'You have been invited to an estate. Log in or create an account with the email the invitation was sent to, and you will join automatically.')}
              </div>
            )}

            {confirmSent ? (
              <div style={{ background:'#DCE3D2', borderRadius:'8px', padding:'16px', fontSize:'14px', color:'#3A2F26', lineHeight:'1.6', marginBottom:'4px' }}>
                {L('Vi har sendt en bekreftelseslenke til', 'We have sent a confirmation link to')} <strong>{email.trim()}</strong>. {L('Klikk på lenken i e-posten for å fullføre registreringen. Sjekk søppelpost hvis den ikke dukker opp.', 'Click the link in the email to complete your registration. Check your spam folder if it does not arrive.')}
              </div>
            ) : mode==='forgot' && resetSent ? (
              <div style={{ background:'#DCE3D2', borderRadius:'8px', padding:'16px', fontSize:'14px', color:'#3A2F26', lineHeight:'1.6', marginBottom:'4px' }}>
                {L('Hvis det finnes en konto for', 'If an account exists for')} <strong>{email.trim()}</strong>, {L('får du snart en e-post med en lenke for å tilbakestille passordet. Sjekk søppelpost hvis den ikke dukker opp.', 'you will soon receive an email with a link to reset your password. Check your spam folder if it does not show up.')}
              </div>
            ) : (<>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
              {mode==='signup' && (
                <div>
                  <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Ditt navn *', 'Your name *')}</label>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder={L('f.eks. Kari Nordmann', 'e.g. Jane Smith')} maxLength={100}
                    style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('E-post *', 'Email *')}</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder={L('deg@eksempel.no', 'you@example.com')} maxLength={254}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
              {mode!=='forgot' && (
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Passord *', 'Password *')}</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder={mode==='signup'?L('Minst 6 tegn','At least 6 characters'):'••••••••'} maxLength={128}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                {mode==='login' && (
                  <div style={{ textAlign:'right', marginTop:'6px' }}>
                    <button onClick={()=>switchMode('forgot')} style={{ background:'none', border:'none', padding:0, color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>{L('Glemt passord?', 'Forgot password?')}</button>
                  </div>
                )}
              </div>
              )}
            </div>

            <button onClick={handleSubmit} disabled={loading||!canSubmit} style={{
              width:'100%', padding:'13px', background:canSubmit?'#3A2F26':'#D9CFC0',
              color:'#FBF9F5', border:'none', borderRadius:'8px',
              cursor:canSubmit?'pointer':'not-allowed', fontSize:'15px', fontFamily:'Karla, sans-serif',
            }}>{loading?L('Vent litt…','Please wait…'):mode==='login'?L('Logg inn','Log in'):mode==='forgot'?L('Send lenke','Send link'):L('Opprett konto','Create account')}</button>
            </>)}

            {mode==='signup' && (
              <p style={{ textAlign:'center', marginTop:'12px', fontSize:'12px', color:'#9C8267', lineHeight:'1.6' }}>
                {L('Ved å opprette konto godtar du våre', 'By creating an account you accept our')}{' '}
                <a href="/personvern" style={{ color:'#5F6E52' }}>{L('vilkår og personvernerklæring', 'terms and privacy policy')}</a>.
              </p>
            )}

            <p style={{ textAlign:'center', marginTop:'16px', fontSize:'13px', color:'#9C8267' }}>
              {mode==='forgot'?<button onClick={()=>switchMode('login')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>{L('Tilbake til innlogging', 'Back to log in')}</button>
              :mode==='login'?<>{L('Ny her?', 'New here?')}{' '}<button onClick={()=>switchMode('signup')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>{L('Opprett konto', 'Create account')}</button></>
              :<>{L('Har du konto?', 'Have an account?')}{' '}<button onClick={()=>switchMode('login')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>{L('Logg inn', 'Log in')}</button></>}
            </p>
          </div>

          <p style={{ textAlign:'center', marginTop:'20px', fontSize:'12px', color:'#9C8267' }}>
            {L('Brukt av begravelsesbyråer, advokater og familier', 'Used by funeral homes, lawyers and families')}
          </p>
        </div>
      </div>
    </div>
  )
}
