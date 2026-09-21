import { useState } from 'react'
import { signIn, signUp, upsertProfile } from '../lib/supabase'

const AVATAR_COLORS = ['#5F6E52','#8B9A7D','#9C8267','#7A8B6E','#A97C3F','#6E8B87']
const randColor = () => AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)]

export default function LoginPage({ onToast }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const errMsg = (msg) => {
    if (msg.includes('Invalid login')) return 'Wrong email or password'
    if (msg.includes('already registered')) return 'Email already registered — log in instead'
    if (msg.includes('Password should')) return 'Password must be at least 6 characters'
    return msg
  }

  const handleSubmit = async () => {
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

  const canSubmit = email.trim() && password.trim() && (mode === 'login' || name.trim())

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', display:'flex', fontFamily:'Karla, sans-serif' }}>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 20px' }}>
        <div style={{ maxWidth:'400px', width:'100%' }}>
          <div style={{ textAlign:'center', marginBottom:'40px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#5C4530" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:'16px' }}>
              <path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/>
            </svg>
            <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'30px', fontWeight:'400', color:'#3A2F26', marginBottom:'10px' }}>HeirSplit</h1>
            <p style={{ color:'#9C8267', fontSize:'15px', lineHeight:'1.6' }}>The professional platform for distributing estate items fairly</p>
          </div>

          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'36px', boxShadow:'0 4px 32px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', background:'#E8DFD0', borderRadius:'8px', padding:'4px', marginBottom:'28px' }}>
              {[['login','Log in'],['signup','Create account']].map(([m,l]) => (
                <button key={m} onClick={()=>setMode(m)} style={{
                  flex:1, padding:'9px', border:'none', borderRadius:'6px', cursor:'pointer',
                  background:mode===m?'#fff':'transparent',
                  color:mode===m?'#3A2F26':'#9C8267', fontSize:'14px', fontFamily:'Karla, sans-serif',
                  boxShadow:mode===m?'0 1px 4px rgba(0,0,0,0.08)':'none', transition:'all 0.15s',
                }}>{l}</button>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
              {mode==='signup' && (
                <div>
                  <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Your name *</label>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Sarah Johnson" maxLength={100}
                    style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Email *</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder="you@example.com" maxLength={254}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Password *</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSubmit()} placeholder={mode==='signup'?'Min. 6 characters':'••••••••'} maxLength={128}
                  style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
            </div>

            <button onClick={handleSubmit} disabled={loading||!canSubmit} style={{
              width:'100%', padding:'13px', background:canSubmit?'#3A2F26':'#D9CFC0',
              color:'#FBF9F5', border:'none', borderRadius:'8px',
              cursor:canSubmit?'pointer':'not-allowed', fontSize:'15px', fontFamily:'Karla, sans-serif',
            }}>{loading?'Please wait…':mode==='login'?'Log in':'Create account'}</button>

            {mode==='signup' && (
              <p style={{ textAlign:'center', marginTop:'12px', fontSize:'12px', color:'#9C8267', lineHeight:'1.6' }}>
                Ved å opprette konto godtar du våre{' '}
                <a href="/personvern" style={{ color:'#5F6E52' }}>vilkår og personvernerklæring</a>.
              </p>
            )}

            <p style={{ textAlign:'center', marginTop:'16px', fontSize:'13px', color:'#9C8267' }}>
              {mode==='login'?<>New here?{' '}<button onClick={()=>setMode('signup')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Create account</button></>
              :<>Have an account?{' '}<button onClick={()=>setMode('login')} style={{ background:'none', border:'none', color:'#5F6E52', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', textDecoration:'underline' }}>Log in</button></>}
            </p>
          </div>

          <p style={{ textAlign:'center', marginTop:'20px', fontSize:'12px', color:'#9C8267' }}>
            Used by funeral homes, estate attorneys &amp; families worldwide
          </p>
        </div>
      </div>
    </div>
  )
}
