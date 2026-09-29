import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from '../lib/supabase'
import { getLang, setLang } from '../lib/lang'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export default function TopBar({ profile, session, estate }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [lang, setLangState] = useState(getLang())

  const brandColor = estate?.branding_color || '#3A2F26'
  const brandName = estate?.name ? `HeirSplit · ${estate.name}` : 'HeirSplit'

  const toggleLang = () => {
    const next = lang === 'en' ? 'no' : 'en'
    setLang(next)
    setLangState(next)
    setMenuOpen(false)
    window.location.reload()
  }

  const isDemo = session?.user?.email === 'mona.demo@heirsplit.no'

  const goHome = async () => {
    setLogoMenuOpen(false)
    setMenuOpen(false)
    // Demo sessions end when leaving so the landing page shows as for a new visitor
    if (isDemo) await signOut()
    navigate('/home')
  }

  const logout = async () => {
    setMenuOpen(false)
    await signOut()
    navigate('/home')
  }

  return (
    <div style={{
      background: brandColor, color: '#FBF9F5', height: '56px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', position: 'sticky', top: 0, zIndex: 100,
      fontFamily: 'Karla, sans-serif', boxShadow: '0 1px 12px rgba(0,0,0,0.18)',
    }}>
      <style>{`
        .tb-logo { background: none; border: 1px solid transparent; border-radius: 8px; padding: 4px 8px; margin-left: -8px; cursor: pointer; display: flex; align-items: center; gap: 6px; color: #FBF9F5; transition: background 0.15s, border-color 0.15s; }
        .tb-logo:hover, .tb-logo[aria-expanded="true"] { background: rgba(251,249,245,0.14); border-color: rgba(251,249,245,0.3); }
        .tb-item { display: block; width: 100%; padding: 11px 16px; background: none; border: none; text-align: left; cursor: pointer; font-size: 14px; color: #3A2F26; font-family: Karla, sans-serif; transition: background 0.12s; }
        .tb-item:hover, .tb-item:focus-visible { background: #F3EDE3; outline: none; }
        .tb-item.danger { color: #8B3A3A; }
        .tb-item + .tb-item { border-top: 1px solid #E8DFD0; }
      `}</style>

      {(menuOpen || logoMenuOpen) && (
        <div onClick={() => { setMenuOpen(false); setLogoMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      )}

      <div style={{ position: 'relative', zIndex: 200 }}>
        <button className="tb-logo" aria-haspopup="menu" aria-expanded={logoMenuOpen} onClick={() => { setLogoMenuOpen(!logoMenuOpen); setMenuOpen(false) }}>
          <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" style={{ height: '32px', display: 'block' }} />
          <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.8 }}>▾</span>
        </button>

        {logoMenuOpen && (
          <div role="menu" style={{
            position: 'absolute', top: '46px', left: '-8px', background: '#fff',
            border: '1px solid #D9CFC0', borderRadius: '12px', minWidth: '220px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
          }}>
            <button role="menuitem" className="tb-item" onClick={() => { navigate('/'); setLogoMenuOpen(false) }}>Mine bo</button>
            <button role="menuitem" className="tb-item" onClick={goHome}>
              {isDemo ? 'Avslutt demo og gå til hjemmesiden' : '← Tilbake til hjemmesiden'}
            </button>
          </div>
        )}
      </div>

      <div style={{ position: 'relative', zIndex: 200 }}>
        <button onClick={() => { setMenuOpen(!menuOpen); setLogoMenuOpen(false) }} style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: profile?.avatar_color || '#DCE3D2',
          border: tc(profile?.avatar_color||'#DCE3D2')==='#3A2F26' ? '2px solid #D9CFC0' : '2px solid rgba(255,255,255,0.25)', cursor: 'pointer',
          fontSize: '14px', color: tc(profile?.avatar_color||'#DCE3D2'), fontWeight: '500', fontFamily: 'Karla, sans-serif',
        }}>{(profile?.display_name || '?')[0].toUpperCase()}</button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: '44px', right: 0, background: '#fff',
            border: '1px solid #D9CFC0', borderRadius: '12px', minWidth: '200px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden', zIndex: 200,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E8DFD0' }}>
              <div style={{ fontSize: '14px', color: '#3A2F26', fontWeight: '500' }}>{profile?.display_name}</div>
              <div style={{ fontSize: '12px', color: '#9C8267', marginTop: '2px' }}>{session?.user?.email}</div>
            </div>

            <button className="tb-item" onClick={toggleLang} style={{ borderBottom: '1px solid #E8DFD0' }}>
              {lang === 'en' ? '🇳🇴 Bytt til Norsk' : '🇬🇧 Switch to English'}
            </button>

            {[
              { label: 'Min profil', action: () => { navigate('/setup'); setMenuOpen(false) } },
              ...(profile?.is_founder ? [{ label: 'Founder dashboard', action: () => { navigate('/founder'); setMenuOpen(false) } }] : []),
              ...(isDemo ? [] : [{ label: 'Tilbake til hjemmesiden', action: goHome }]),
              { label: isDemo ? 'Avslutt demo' : 'Logg ut', action: logout, danger: true },
            ].map(({ label, action, danger }) => (
              <button key={label} className={danger ? 'tb-item danger' : 'tb-item'} onClick={action}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
