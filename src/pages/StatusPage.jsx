import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getItems } from '../lib/supabase'
import { buildRemainingSteps } from '../lib/estateProgress'
import { loadStatusExtras } from '../lib/decisions'

export default function StatusPage({ session }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [estate, setEstate] = useState(null)
  const [items, setItems] = useState([])
  const [steps, setSteps] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const [{ data: est }, { data: its }] = await Promise.all([getEstate(id), getItems(id)])
      const all = its || []
      const extras = await loadStatusExtras(id, all)
      setEstate(est)
      setItems(all)
      setSteps(buildRemainingSteps({ estateId: id, userId: session.user.id, items: all, ...extras }))
      setLoading(false)
    })()
  }, [id])

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Laster…</div>

  const assigned = items.filter(i => i.status === 'assigned').length
  const pct = items.length ? Math.round((assigned / items.length) * 100) : 0

  return (
    <div style={{ maxWidth:'560px', margin:'0 auto', padding:'28px 16px 60px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>← Tilbake til boet</button>
      <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>Hva gjenstår</h1>
      {estate?.name && <p style={{ color:'#9C8267', fontSize:'14px', marginBottom:'20px' }}>{estate.name}</p>}

      <div style={{ marginBottom:'28px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'13px', color:'#5C4530', marginBottom:'6px' }}>
          <span>{assigned} av {items.length} gjenstander tildelt</span>
          <span>{pct} %</span>
        </div>
        <div style={{ height:'6px', background:'#E8DFD0', borderRadius:'3px', overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'#5F6E52', borderRadius:'3px' }} />
        </div>
      </div>

      {steps.length === 0 ? (
        <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'12px', padding:'24px', textAlign:'center' }}>
          <div style={{ fontFamily:'Fraunces, serif', fontSize:'18px', color:'#3A2F26', marginBottom:'4px' }}>Alt er klart</div>
          <div style={{ fontSize:'13px', color:'#5C4530' }}>Det er ingenting som gjenstår i boet.</div>
        </div>
      ) : (
        <ol style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'10px' }}>
          {steps.map((step, i) => (
            <li key={step.key} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'14px 16px', display:'flex', gap:'12px', alignItems:'flex-start' }}>
              <div style={{ width:'24px', height:'24px', borderRadius:'50%', border:'1.5px solid #D9CFC0', color:'#9C8267', fontSize:'12px', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i + 1}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500', lineHeight:1.4 }}>{step.title}</div>
                {step.detail && <div style={{ fontSize:'12px', color:'#9C8267', marginTop:'3px', lineHeight:1.5 }}>{step.detail}</div>}
              </div>
              {step.path && (
                <button onClick={() => navigate(step.path)} style={{ flexShrink:0, padding:'6px 12px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'12px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>
                  {step.pathLabel || 'Åpne'} →
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
