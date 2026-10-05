import { useState } from 'react'
import { supabase, signIn, signUp, upsertProfile } from '../lib/supabase'

const AVATAR_COLORS = ['#5F6E52','#8B9A7D','#9C8267','#7A8B6E','#A97C3F','#6E8B87']
const randColor = () => AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)]

export default function LoginPage({ onToast }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const errMsg = (msg) => {
    if (msg.includes('Invalid login')) return 'Feil e-post eller passord'
    if (msg.includes('already registered')) return 'E-posten er allerede registrert — logg inn i stedet'
    if (msg.includes('Password should')) return 'Passordet må ha minst 6 tegn'
    if (msg.includes('rate limit') || msg.includes('security purposes')) return 'For mange forsøk — vent litt og prøv igjen'
    return msg
  }

  const switchMode = (m) => { setMode(m); setResetSent(false) }

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
      const { data, error } = await signUp(email.trim(), password)
      if (error) { onToast(errMsg(error.message), 'error'); setLoading(false); return }
      if (data?.user) {
        await upsertProfile({ user_id: data.user.id, display_name: name.trim(), avatar_color: randColor(), email: email.trim(), plan: 'free' })
      }
      await signIn(email.trim(), password)
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
            <p style={{ color:'#9C8267', fontSize:'15px', lineHeight:'1.6' }}>Den profesjonelle plattformen for rettferdig fordeling av arv</p>
          </div>

          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'36px', boxShadow:'0 4px 32px rgba(0,0,0,0.06)' }}>
            {mode==='forgot' ? (
              <div style={{ marginBottom:'24px' }}>
                <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'22px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>Glemt passord</h2>
                <p style={{ color:'#9C8267', fontSize:'14px', lineHeight:'1.6', margin:0 }}>Skriv inn e-postadressen din, så sender vi deg en lenke for å velge nytt passord.</p>
              </div>
            ) : (
            <div style={{ display:'flex', background:'#E8DFD0', borderRadius:'8px', padding:'4px', marginBottom:'28px' }}>
              {[['login','Logg inn'],['signup','Opprett konto']].map(([m,l]) => (
                <button key={m} onClick={()=>switchMode(m)} style={{
                  flex:1, padding:'9px', border:'none', borderRadius:'6px', cursor:'pointer',
                  background:mode===m?'#fff':'transparent',
                  color:mode===m?'#3A2F26':'#9C8267', fontSize:'14px', fontFamily:'Karla, sans-serif',
                  boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.08)':'none', transition:'all 0.15s',
                }}>{l}</button>
              ))}
            </div>
            )}

            {mode==='forgot' && resetSent ? (
              <div style={{ background:'#DCE3D2', borderRadius:'8px', padding:'16px', fontSize:'14px', color:'#3A2F26', lineHeight:'1.6', marginBottom:'4px' }}>
                Hvis det finnes en konto for <strong>{email.trim()}</strong>, får du snart en e-post med en lenke for å tilbakestille passordet. Sjekk søppelpost hvis den ikke dukker opp.
              </div>
            ) : (<>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
              {mode==='signup' && (
                <div>
                  <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Ditt navn *</label>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="f.eks. Kari Nordmann" maxLength={100}
                    style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>E-post *</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder="deg@eksempel.no" maxLength={254}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
              {mode!=='forgot' && (
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Passord *</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder={mode==='signup'?'Minst 6 tegn':'••••••••'} maxLength={128}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                {mode==='login' && (
                  <div style={{ textAlign:'right', marginTop:'6px' }}>
                    <button onClick={()=>switchMode('forgot')} style={{ background:'none', border:'none', padding:0, color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Glemt passord?</button>
                  </div>
                )}
              </div>
              )}
            </div>

            <button onClick={handleSubmit} disabled={loading||!canSubmit} style={{
              width:'100%', padding:'13px', background:canSubmit?'#3A2F26':'#D9CFC0',
              color:'#FBF9F5', border:'none', borderRadius:'8px',
              cursor:canSubmit?'pointer':'not-allowed', fontSize:'15px', fontFamily:'Karla, sans-serif',
            }}>{loading?'Vent litt…':mode==='login'?'Logg inn':mode==='forgot'?'Send lenke':'Opprett konto'}</button>
            </>)}

            {mode==='signup' && (
              <p style={{ textAlign:'center', marginTop:'12px', fontSize:'12px', color:'#9C8267', lineHeight:'1.6' }}>
                Ved å opprette konto godtar du våre{' '}
                <a href="/personvern" style={{ color:'#5F6E52' }}>vilkår og personvernerklæring</a>.
              </p>
            )}

            <p style={{ textAlign:'center', marginTop:'16px', fontSize:'13px', color:'#9C8267' }}>
              {mode==='forgot'?<button onClick={()=>switchMode('login')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Tilbake til innlogging</button>
              :mode==='login'?<>Ny her?{' '}<button onClick={()=>switchMode('signup')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Opprett konto</button></>
              :<>Har du konto?{' '}<button onClick={()=>switchMode('login')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Logg inn</button></>}
            </p>
          </div>

          <p style={{ textAlign:'center', marginTop:'20px', fontSize:'12px', color:'#9C8267' }}>
            Brukt av begravelsesbyråer, advokater og familier
          </p>
        </div>
      </div>
    </div>
  )
}
