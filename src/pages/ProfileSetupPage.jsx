import { useState } from 'react'
import { upsertProfile } from '../lib/supabase'
import { L } from '../lib/lang'

const COLORS = ['#DCE3D2','#E8DFD0','#C9AE8E','#A8B598','#8B9A7D','#D9CFC0','#5F6E52','#9C8267']
const COLOR_NAMES = [['Lys salvie','Light sage'],['Sand','Sand'],['Karamell','Caramel'],['Salvie','Sage'],['Mosegrønn','Moss green'],['Lys grå','Light grey'],['Mørk salvie','Dark sage'],['Latte','Latte']]
const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

// Første gang: velkomst. Senere («Min profil»): endre navn og farge.
export default function ProfileSetupPage({ session, profile, onSaved, onToast }) {
  const editing = Boolean(profile?.display_name)
  const [name, setName] = useState(profile?.display_name || '')
  const [color, setColor] = useState(profile?.avatar_color || COLORS[0])
  const [loading, setLoading] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setLoading(true)
    const { data, error } = await upsertProfile({ user_id: session.user.id, display_name: name.trim(), avatar_color: color, email: session.user.email })
    setLoading(false)
    if (error) { onToast(L('Kunne ikke lagre profilen. Prøv igjen.', 'Could not save your profile. Please try again.'), 'error'); return }
    if (editing) onToast(L('Profilen er oppdatert', 'Your profile has been updated'))
    onSaved(data)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ maxWidth:'400px', width:'100%', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'40px', boxShadow:'0 4px 32px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{editing ? L('Min profil', 'My profile') : L('Velkommen', 'Welcome')}</h2>
        <p style={{ color:'#75604B', fontSize:'14px', lineHeight:'1.6', marginBottom:'28px' }}>{editing ? L('Navnet og fargen vises for de andre i boene dine.', 'Your name and colour are shown to the others in your estates.') : L('Sett opp profilen din så familiemedlemmer vet hvem du er.', 'Set up your profile so family members know who you are.')}</p>

        <div style={{ display:'flex', justifyContent:'center', marginBottom:'24px' }}>
          <div style={{ width:'72px', height:'72px', borderRadius:'50%', background:color, border:tc(color)==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'28px', color:tc(color), fontWeight:'500', transition:'background 0.2s' }}>
            {name ? name[0].toUpperCase() : '?'}
          </div>
        </div>

        <div style={{ marginBottom:'20px' }}>
          <label htmlFor="profilesetup-f1" style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'6px' }}>{L('Visningsnavn', 'Display name')}</label>
          <input id="profilesetup-f1" autoComplete="name" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&save()} placeholder={L('f.eks. Kari', 'e.g. Jane')} maxLength={100}
            style={{ width:'100%', padding:'12px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
        </div>

        <div style={{ marginBottom:'28px' }}>
          <div id="profile-colour-label" style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'10px' }}>{L('Velg din farge', 'Choose your colour')}</div>
          <div role="group" aria-labelledby="profile-colour-label" style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {COLORS.map((c, i) => (
              <button key={c} onClick={()=>setColor(c)} aria-pressed={color===c} aria-label={L(...COLOR_NAMES[i])} style={{ width:'44px', height:'44px', borderRadius:'50%', background:c, border:color===c?'3px solid #3A2F26':'3px solid transparent', cursor:'pointer', transition:'border 0.15s' }} />
            ))}
          </div>
        </div>

        <button onClick={save} disabled={!name.trim()||loading} style={{
          width:'100%', padding:'13px', background:name.trim()?'#3A2F26':'#D9CFC0',
          color:'#FBF9F5', border:'none', borderRadius:'8px',
          cursor:name.trim()?'pointer':'not-allowed', fontSize:'15px', fontFamily:'Karla, sans-serif',
        }}>{loading?L('Lagrer…','Saving…'):editing?L('Lagre','Save'):L('Kom i gang →','Get started →')}</button>
      </div>
    </div>
  )
}
