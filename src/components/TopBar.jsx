import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signOut } from '../lib/supabase'
import { getLang, setLang, L } from '../lib/lang'
import { isDemoSession } from '../lib/demo'
import TextSizeControl from './TextSizeControl'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export default function TopBar({ profile, session, estate }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const onLanding = pathname === '/home'
  const [menuOpen, setMenuOpen] = useState(false)
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [lang, setLangState] = useState(getLang())
  const logoRef = useRef(null)
  const avatarRef = useRef(null)

  // Esc lukker en åpen meny og setter fokus tilbake på knappen som åpnet den
  useEffect(() => {
    if (!menuOpen && !logoMenuOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      const ref = menuOpen ? avatarRef : logoRef
      setMenuOpen(false)
      setLogoMenuOpen(false)
      ref.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, logoMenuOpen])

  const brandColor = estate?.branding_color || '#3A2F26'
  const brandName = estate?.name ? `Arvklart · ${estate.name}` : 'Arvklart'

  const toggleLang = () => {
    const next = lang === 'en' ? 'no' : 'en'
    setLang(next)
    setLangState(next)
    setMenuOpen(false)
    window.location.reload()
  }

  const isDemo = isDemoSession(session)

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
        .tb-item { display: block; width: 100%; padding: 11px 16px; background: none; border: none; text-align: left; cursor: pointer; font-size: 0.875rem; color: #3A2F26; font-family: Karla, sans-serif; transition: background 0.12s; }
        .tb-item:hover, .tb-item:focus-visible { background: #F3EDE3; }
        .tb-item:focus-visible { outline: 3px solid #5F6E52; outline-offset: -3px; }
        .tb-logo:focus-visible, .tb-nav a:focus-visible, .tb-avatar:focus-visible { outline: 3px solid #FBF9F5; outline-offset: 2px; }
        .tb-item.danger { color: #8B3A3A; }
        .tb-item + .tb-item { border-top: 1px solid #E8DFD0; }
        .tb-nav { flex: 1; min-width: 0; display: flex; justify-content: flex-end; gap: 4px; margin: 0 12px; overflow-x: auto; scrollbar-width: none; }
        .tb-nav::-webkit-scrollbar { display: none; }
        .tb-nav a { flex-shrink: 0; padding: 7px 13px; border-radius: 999px; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; color: #FBF9F5; text-decoration: none; white-space: nowrap; transition: background 0.15s, border-color 0.15s; }
        .tb-nav a:hover, .tb-nav a:focus-visible { background: rgba(251,249,245,0.14); border-color: rgba(251,249,245,0.3); }
        @media (max-width: 860px) { .tb-nav { justify-content: flex-start; margin: 0 8px; } .tb-nav a { padding: 6px 10px; font-size: 0.8438rem; } }
      `}</style>

      {(menuOpen || logoMenuOpen) && (
        <div onClick={() => { setMenuOpen(false); setLogoMenuOpen(false) }} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
      )}

      <div style={{ position: 'relative', zIndex: 200 }}>
        <button ref={logoRef} className="tb-logo" aria-label={L('Arvklart-meny', 'Arvklart menu')} aria-haspopup="menu" aria-expanded={logoMenuOpen} onClick={() => { setLogoMenuOpen(!logoMenuOpen); setMenuOpen(false) }}>
          <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" style={{ height: '32px', display: 'block' }} />
          <span aria-hidden="true" style={{ fontSize: '0.625rem', opacity: 0.8 }}>▾</span>
        </button>

        {logoMenuOpen && (
          <div role="menu" style={{
            position: 'absolute', top: '46px', left: '-8px', background: '#fff',
            border: '1px solid #D9CFC0', borderRadius: '12px', minWidth: '220px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden',
          }}>
            <button role="menuitem" className="tb-item" onClick={() => { navigate('/'); setLogoMenuOpen(false) }}>{L('Mine bo', 'My estates')}</button>
            <button role="menuitem" className="tb-item" onClick={goHome}>
              {isDemo ? L('Avslutt demo og gå til hjemmesiden', 'End demo and go to the home page') : L('← Tilbake til hjemmesiden', '← Back to the home page')}
            </button>
          </div>
        )}
      </div>

      {onLanding && (
        <nav className="tb-nav">
          <a href="#slik-fungerer">{L('Slik fungerer det', 'How it works')}</a>
          <a href="#for-hvem">{L('For hvem', 'Who it is for')}</a>
          <a href="#demo">{L('Prøv demo', 'Try the demo')}</a>
          <a href="/veiviser" onClick={(e) => { e.preventDefault(); navigate('/veiviser') }}>{L('Veiviser', 'Guide')}</a>
        </nav>
      )}

      <div style={{ position: 'relative', zIndex: 200 }}>
        <button ref={avatarRef} className="tb-avatar" aria-expanded={menuOpen}
          aria-label={L(`Meny for ${profile?.display_name || 'kontoen'}`, `Menu for ${profile?.display_name || 'the account'}`)}
          onClick={() => { setMenuOpen(!menuOpen); setLogoMenuOpen(false) }} style={{
          width: '44px', height: '44px', borderRadius: '50%',
          background: profile?.avatar_color || '#DCE3D2',
          border: tc(profile?.avatar_color||'#DCE3D2')==='#3A2F26' ? '2px solid #D9CFC0' : '2px solid rgba(255,255,255,0.25)', cursor: 'pointer',
          fontSize: '0.875rem', color: tc(profile?.avatar_color||'#DCE3D2'), fontWeight: '500', fontFamily: 'Karla, sans-serif',
        }}>{(profile?.display_name || '?')[0].toUpperCase()}</button>

        {menuOpen && (
          <div style={{
            position: 'absolute', top: '44px', right: 0, background: '#fff',
            border: '1px solid #D9CFC0', borderRadius: '12px', minWidth: '200px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)', overflow: 'hidden', zIndex: 200,
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E8DFD0' }}>
              <div style={{ fontSize: '0.875rem', color: '#3A2F26', fontWeight: '500' }}>{profile?.display_name}</div>
              <div style={{ fontSize: '0.75rem', color: '#75604B', marginTop: '2px' }}>{session?.user?.email}</div>
            </div>

            <div style={{ borderBottom: '1px solid #E8DFD0' }}><TextSizeControl compact /></div>
            <button className="tb-item" lang={lang === 'en' ? 'no' : 'en'} onClick={toggleLang} style={{ borderBottom: '1px solid #E8DFD0' }}>
              {lang === 'en' ? '🇳🇴 Bytt til Norsk' : '🇬🇧 Switch to English'}
            </button>

            {[
              ...(isDemo ? [] : [
                { label: L('Min profil', 'My profile'), action: () => { navigate('/setup'); setMenuOpen(false) } },
                { label: L('Min konto', 'My account'), action: () => { navigate('/konto'); setMenuOpen(false) } },
              ]),
              ...(profile?.is_founder ? [{ label: 'Founder dashboard', action: () => { navigate('/founder'); setMenuOpen(false) } }] : []),
              ...(isDemo ? [] : [{ label: L('Tilbake til hjemmesiden', 'Back to the home page'), action: goHome }]),
              { label: isDemo ? L('Avslutt demo', 'End demo') : L('Logg ut', 'Log out'), action: logout, danger: true },
            ].map(({ label, action, danger }) => (
              <button key={label} className={danger ? 'tb-item danger' : 'tb-item'} onClick={action}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
