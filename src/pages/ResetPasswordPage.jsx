import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { L } from '../lib/lang'
import { isDemoSession } from '../lib/demo'

const inputStyle = { width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }
const linkStyle = { background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }

// Landing page for the reset link from "Forgot password". Supabase signs the user in
// from the link, so a session here means the link was valid.
export default function ResetPasswordPage({ session, onToast, onDone }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  const isDemo = isDemoSession(session)
  const mismatch = confirm && password !== confirm
  const canSubmit = password.length >= 6 && password === confirm

  const errMsg = (msg) => {
    if (msg.includes('different from the old')) return L('Det nye passordet må være forskjellig fra det gamle', 'The new password must be different from the old one')
    if (msg.includes('Password should')) return L('Passordet må ha minst 6 tegn', 'The password must have at least 6 characters')
    return msg
  }

  const handleSubmit = async () => {
    if (!canSubmit || isDemo) return
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { onToast(errMsg(error.message), 'error'); return }
    onToast(L('Passordet er oppdatert', 'Your password has been updated'))
    if (onDone) onDone()
    else navigate('/')
  }

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 20px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ maxWidth:'400px', width:'100%', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'36px', boxShadow:'0 4px 32px rgba(0,0,0,0.06)' }}>
        <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'10px' }}>{L('Velg nytt passord', 'Choose a new password')}</h1>

        {!session ? (
          <>
            <p style={{ color:'#9C8267', fontSize:'14px', lineHeight:'1.6', marginBottom:'20px' }}>
              {L('Lenken er ugyldig eller utløpt. Be om en ny fra innloggingssiden.', 'The link is invalid or has expired. Request a new one from the log-in page.')}
            </p>
            <button onClick={()=>navigate('/logg-inn')} style={linkStyle}>{L('Tilbake til innlogging', 'Back to log in')}</button>
          </>
        ) : isDemo ? (
          <p style={{ color:'#9C8267', fontSize:'14px', lineHeight:'1.6' }}>{L('Passordet til demokontoen kan ikke endres.', 'The password of the demo account cannot be changed.')}</p>
        ) : (
          <>
            <p style={{ color:'#9C8267', fontSize:'14px', lineHeight:'1.6', marginBottom:'24px' }}>
              For <strong style={{ color:'#5C4530' }}>{session.user.email}</strong>
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Nytt passord *', 'New password *')}</label>
                <input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={L('Minst 6 tegn', 'At least 6 characters')} maxLength={128} style={inputStyle} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>{L('Gjenta nytt passord *', 'Repeat new password *')}</label>
                <input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} maxLength={128} style={inputStyle} />
                {mismatch && <p style={{ fontSize:'12px', color:'#c0392b', marginTop:'6px' }}>{L('Passordene er ikke like', 'The passwords do not match')}</p>}
              </div>
            </div>
            <button onClick={handleSubmit} disabled={loading||!canSubmit} style={{
              width:'100%', padding:'13px', background:canSubmit?'#3A2F26':'#D9CFC0',
              color:'#FBF9F5', border:'none', borderRadius:'8px',
              cursor:canSubmit?'pointer':'not-allowed', fontSize:'15px', fontFamily:'Karla, sans-serif',
            }}>{loading?L('Vent litt…','Please wait…'):L('Lagre nytt passord','Save new password')}</button>
          </>
        )}
      </div>
    </div>
  )
}
