import { useEffect, useState } from 'react'
import { getFounderDashboard, setUserPlan } from '../lib/founder'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'

export default function FounderPage({ session, onToast }) {
  const [estates, setEstates] = useState([])
  const [profiles, setProfiles] = useState([])
  const [feedback, setFeedback] = useState([])
  const [itemCount, setItemCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    const load = async () => {
      // Én security definer-funksjon; avviser kallet uten founder-rolle og tofaktor
      const { data, error } = await getFounderDashboard()
      if (error) setLoadError(true)
      setEstates(data?.estates || [])
      setProfiles(data?.profiles || [])
      setFeedback(data?.feedback || [])
      setItemCount(data?.item_count || 0)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Laster dashboard…</div>
  if (loadError) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Ingen tilgang til dashboardet.</div>

  const planCounts = profiles.reduce((acc, p) => { acc[p.plan||'free']=(acc[p.plan||'free']||0)+1; return acc }, {})
  const mrr = (planCounts.family||0)*9 + (planCounts.business||0)*99 + (planCounts.enterprise||0)*299
  const avgNps = feedback.filter(f=>f.nps_score).length ? (feedback.filter(f=>f.nps_score).reduce((a,f)=>a+f.nps_score,0)/feedback.filter(f=>f.nps_score).length).toFixed(1) : 'N/A'

  // Growth by month
  const byMonth = {}
  profiles.forEach(p => {
    const m = new Date(p.created_at).toLocaleDateString('en-GB', { month:'short', year:'2-digit' })
    byMonth[m] = (byMonth[m]||0)+1
  })
  const growthData = Object.entries(byMonth).slice(-6).map(([m,v])=>({ month:m, users:v }))

  // Plan distribution
  const planData = Object.entries(planCounts).map(([plan,count])=>({ plan, count }))

  // Activity: estates with most items
  const estateActivity = estates.map(e => ({
    name: e.name,
    items: e.item_count || 0,
    owner: e.profiles?.display_name || e.profiles?.email || 'Unknown',
  })).sort((a,b)=>b.items-a.items).slice(0,8)

  return (
    <div style={{ maxWidth:'960px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'32px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'28px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>Founder Dashboard</h1>
          <p style={{ color:'#9C8267', fontSize:'14px' }}>Privat — kun synlig for deg</p>
        </div>
        <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', padding:'12px 20px', textAlign:'center' }}>
          <div style={{ fontSize:'24px', color:'#3A2F26', fontFamily:'Fraunces, serif' }}>${mrr.toLocaleString()}</div>
          <div style={{ fontSize:'12px', color:'#3A5A30' }}>Est. MRR</div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:'10px', marginBottom:'32px' }}>
        {[
          { v:profiles.length, l:'Totalt brukere' },
          { v:estates.length, l:'Boer opprettet' },
          { v:itemCount, l:'Gjenstander' },
          { v:planCounts.family||0, l:'Family-plan' },
          { v:planCounts.business||0, l:'Business-plan' },
          { v:planCounts.enterprise||0, l:'Enterprise' },
          { v:feedback.length, l:'Tilbakemeld.' },
          { v:avgNps, l:'Gj.snitt NPS' },
        ].map(s=>(
          <div key={s.l} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'14px' }}>
            <div style={{ fontSize:'22px', color:'#3A2F26', fontFamily:'Fraunces, serif' }}>{s.v}</div>
            <div style={{ fontSize:'11px', color:'#9C8267', marginTop:'2px' }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'4px', borderBottom:'1px solid #D9CFC0', marginBottom:'24px' }}>
        {[['overview','Oversikt'],['users','Brukere'],['feedback','Tilbakemelding'],['estates','Boer']].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            padding:'10px 18px', border:'none', background:'none', cursor:'pointer',
            fontSize:'14px', fontFamily:'Karla, sans-serif',
            color:tab===t?'#3A2F26':'#9C8267',
            borderBottom:tab===t?'2px solid #3A2F26':'2px solid transparent', marginBottom:'-1px',
          }}>{l}</button>
        ))}
      </div>

      {tab==='overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Brukervekst (siste 6 mnd)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFD0" />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9C8267' }} />
                <YAxis tick={{ fontSize:11, fill:'#9C8267' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontFamily:'Karla', fontSize:12, borderRadius:8 }} />
                <Line type="monotone" dataKey="users" stroke="#5F6E52" strokeWidth={2} dot={{ fill:'#5F6E52' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Planfordeling</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={planData}>
                <XAxis dataKey="plan" tick={{ fontSize:11, fill:'#9C8267' }} />
                <YAxis tick={{ fontSize:11, fill:'#9C8267' }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontFamily:'Karla', fontSize:12, borderRadius:8 }} />
                <Bar dataKey="count" fill="#8B9A7D" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ gridColumn:'1/-1', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>Mest aktive boer</h3>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {estateActivity.map((e,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 14px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'8px' }}>
                  <span style={{ fontSize:'13px', color:'#9C8267', minWidth:'20px' }}>#{i+1}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', color:'#3A2F26' }}>{e.name}</div>
                    <div style={{ fontSize:'12px', color:'#9C8267' }}>av {e.owner}</div>
                  </div>
                  <span style={{ fontSize:'13px', color:'#5F6E52', fontWeight:'500' }}>{e.items} gjenstander</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==='users' && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#FBF9F5', borderBottom:'1px solid #D9CFC0' }}>
                {['Navn','E-post','Plan','Registrert','Boer'].map(h=>(
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', color:'#9C8267', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profiles.map((p,i)=>(
                <tr key={p.id} style={{ borderBottom: i<profiles.length-1?'1px solid #E8DFD0':'none' }}>
                  <td style={{ padding:'12px 16px', fontSize:'14px', color:'#3A2F26' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:p.avatar_color||'#DCE3D2', border:tc(p.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:tc(p.avatar_color||'#DCE3D2'), fontWeight:'500' }}>{(p.display_name||'?')[0].toUpperCase()}</div>
                      {p.display_name||'—'}
                    </div>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#5C4530' }}>{p.email}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <select
                      value={p.plan || 'free'}
                      onChange={async (e) => {
                        const plan = e.target.value
                        const { error } = await setUserPlan(p.user_id, plan)
                        if (error) return onToast?.('Kunne ikke endre plan.', 'error')
                        setProfiles(prev => prev.map(x => x.user_id === p.user_id ? {...x, plan} : x))
                      }}
                      style={{ fontSize:'12px', border:'1px solid #D9CFC0', borderRadius:'6px', padding:'3px 8px', background:'#fff', cursor:'pointer', fontFamily:'Karla, sans-serif' }}
                    >
                      <option value="free">free</option>
                      <option value="family">family</option>
                      <option value="business">business</option>
                      <option value="enterprise">enterprise</option>
                    </select>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#9C8267' }}>{new Date(p.created_at).toLocaleDateString('nb-NO', { day:'numeric', month:'short', year:'numeric' })}</td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#9C8267' }}>{estates.filter(e=>e.owner_id===p.user_id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='feedback' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          {feedback.length===0 ? (
            <div style={{ padding:'60px', textAlign:'center', color:'#9C8267' }}>Ingen tilbakemeldinger ennå.</div>
          ) : feedback.map(f=>(
            <div key={f.id} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'20px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                  <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:f.profiles?.avatar_color||'#DCE3D2', border:tc(f.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'13px', color:tc(f.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500' }}>{(f.profiles?.display_name||'?')[0].toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500' }}>{f.profiles?.display_name||'Ukjent'}</div>
                    <div style={{ fontSize:'12px', color:'#9C8267' }}>{f.profiles?.email} · {new Date(f.created_at).toLocaleDateString('nb-NO')}</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  {f.nps_score && <span style={{ fontSize:'13px', color:f.nps_score>=8?'#3A5A30':f.nps_score>=6?'#A97C3F':'#8B3A3A', fontWeight:'500' }}>NPS: {f.nps_score}/10</span>}
                  <span style={{ fontSize:'11px', background:'#FBF9F5', color:'#5C4530', padding:'3px 8px', borderRadius:'20px' }}>{f.type}</span>
                </div>
              </div>
              {f.content && <p style={{ fontSize:'14px', color:'#5C4530', lineHeight:'1.7', fontStyle:'italic' }}>"{f.content}"</p>}
            </div>
          ))}
        </div>
      )}

      {tab==='estates' && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#FBF9F5', borderBottom:'1px solid #D9CFC0' }}>
                {['Navn på bo','Eier','Status','Opprettet','Gjenstander'].map(h=>(
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', color:'#9C8267', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estates.map((e,i)=>(
                <tr key={e.id} style={{ borderBottom:i<estates.length-1?'1px solid #E8DFD0':'none' }}>
                  <td style={{ padding:'12px 16px', fontSize:'14px', color:'#3A2F26' }}>{e.name}</td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#5C4530' }}>{e.profiles?.display_name||e.profiles?.email||'—'}</td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:'11px', background:e.status==='active'?'#DCE3D2':'#E8DFD0', color:e.status==='active'?'#3A5A30':'#5C4530', padding:'3px 8px', borderRadius:'20px' }}>{e.status||'active'}</span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#9C8267' }}>{new Date(e.created_at).toLocaleDateString('nb-NO', { day:'numeric', month:'short' })}</td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#5F6E52', fontWeight:'500' }}>{e.item_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
