import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

export default function GuidePage({ standalone = false }) {
  const navigate = useNavigate()
  const { id } = useParams()
  // Opened from the landing page (no estate) — go back to the home page instead
  const backPath = id ? `/estate/${id}` : '/home'

  // The "Tilbake" button at the bottom of veiviser.html asks us to navigate back
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin === window.location.origin && e.data?.type === 'veiviser-back') navigate(backPath)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [backPath, navigate])

  return (
    <div style={{ height: standalone ? '100vh' : 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', background: '#FBF9F5', borderBottom: '1px solid #D9CFC0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(backPath)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
          {id ? '← Tilbake til boet' : '← Tilbake til hjemmesiden'}
        </button>
      </div>
      <iframe
        src={id ? '/veiviser.html' : '/veiviser.html?back=home'}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Arveprosess-veiviser"
      />
    </div>
  )
}
