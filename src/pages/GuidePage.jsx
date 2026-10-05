import { useNavigate, useParams } from 'react-router-dom'

export default function GuidePage({ standalone = false }) {
  const navigate = useNavigate()
  const { id } = useParams()
  // Opened from the landing page (no estate) — go back to the home page instead
  const backPath = id ? `/estate/${id}` : '/home'

  return (
    <div style={{ height: standalone ? '100vh' : 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', background: '#FBF9F5', borderBottom: '1px solid #D9CFC0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(backPath)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
          {id ? '← Tilbake til boet' : '← Til forsiden'}
        </button>
      </div>
      <iframe
        src="/veiviser.html"
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Arveprosess-veiviser"
      />
    </div>
  )
}
