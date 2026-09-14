// ── JoinPage ──────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function JoinPage({ session, onToast }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')

  useEffect(() => {
    if (!session) { localStorage.setItem('pendingJoinCode', code); navigate('/'); return }
    const join = async () => {
      const { data: estate } = await supabase.from('estates').select('id, name').eq('invite_code', code).single()
      if (!estate) { setStatus('invalid'); return }
      await supabase.from('estate_members').upsert({ estate_id: estate.id, user_id: session.user.id, role: 'admin' }, { onConflict: 'estate_id,user_id' })
      onToast(`Ble med i "${estate.name}" ✓`)
      navigate(`/estate/${estate.id}`)
    }
    join()
  }, [session])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ textAlign:'center', padding:'40px' }}>
        {status === 'invalid'
          ? <><div style={{ fontSize:'48px', marginBottom:'16px' }}>❌</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>Ugyldig invitasjonslenke</h2><p style={{ color:'#8c7b6b', marginTop:'8px' }}>Denne lenken kan ha utløpt eller blitt fornyet.</p></>
          : <><div style={{ fontSize:'48px', marginBottom:'16px' }}>⏳</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>Blir med i boet…</h2></>}
      </div>
    </div>
  )
}

export default JoinPage

// ── PricingPage ───────────────────────────────────────────────────────────────
export function PricingPage({ session }) {
  const navigate = useNavigate()
  const plans = [
    { name:'Free', price:'$0', period:'forever', color:'#e8e0d6', features:['10 items max','3 family members','Photo upload','Interest + reason','Basic overview'], missing:['Dashboard analytics','Comments','PDF report','Unlimited items','White-label'] },
    { name:'Family', price:'$9', period:'/month or $49/year', color:'#6b8fa8', popular:true, features:['Everything in Free','Unlimited items','Unlimited members','Dashboard & analytics','Comments per item','PDF distribution report','Officially assign items'], missing:['White-label branding','Multiple estates'] },
    { name:'Business', price:'$99', period:'/month or $799/year', color:'#c4855a', features:['Everything in Family','Up to 15 active estates','Admin dashboard','Send invite links','Custom logo & colors','Activity log per estate','Email notifications'], missing:['Unlimited estates','API access'] },
    { name:'Enterprise', price:'$299', period:'/month or $2,990/year', color:'#1a1410', features:['Everything in Business','Unlimited estates','API access','Dedicated onboarding','SLA guarantee','Invoice billing','Multi-admin management','Custom integrations'], missing:[] },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif', padding:'48px 16px' }}>
      <div style={{ maxWidth:'940px', margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:'48px' }}>
          <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'36px', fontWeight:'400', color:'#1a1410', marginBottom:'12px' }}>Simple, honest pricing</h1>
          <p style={{ color:'#8c7b6b', fontSize:'16px' }}>Start free. Upgrade when you need more.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px,1fr))', gap:'16px' }}>
          {plans.map(p => (
            <div key={p.name} style={{ background:'#fff', border: p.popular?`2px solid ${p.color}`:'1px solid #e8e0d6', borderRadius:'14px', padding:'28px', position:'relative' }}>
              {p.popular && <div style={{ position:'absolute', top:'-12px', left:'50%', transform:'translateX(-50%)', background:p.color, color:'#fff', fontSize:'11px', padding:'3px 12px', borderRadius:'20px', whiteSpace:'nowrap' }}>Most popular</div>}
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:p.color, marginBottom:'16px' }} />
              <h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'20px', fontWeight:'400', color:'#1a1410', marginBottom:'4px' }}>{p.name}</h2>
              <div style={{ fontSize:'28px', color:'#1a1410', marginBottom:'4px', fontFamily:'Playfair Display, serif' }}>{p.price}</div>
              <div style={{ fontSize:'12px', color:'#a89080', marginBottom:'20px' }}>{p.period}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'24px' }}>
                {p.features.map(f=><div key={f} style={{ fontSize:'13px', color:'#4a3c30', display:'flex', gap:'8px' }}><span style={{ color:'#7aaa7a' }}>✓</span>{f}</div>)}
                {p.missing.map(f=><div key={f} style={{ fontSize:'13px', color:'#c0b0a0', display:'flex', gap:'8px' }}><span>—</span>{f}</div>)}
              </div>
              <button onClick={()=>session?window.location.href='mailto:hei@arvklart.no?subject=Oppgradering til ' + p.name:navigate('/')} style={{ width:'100%', padding:'11px', background:p.name==='Free'?'#f5f0eb':p.color, color:p.name==='Free'?'#1a1410':'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'DM Sans, sans-serif' }}>
                {p.name==='Free'?'Kom i gang gratis':`Få ${p.name}`}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign:'center', marginTop:'32px', fontSize:'13px', color:'#a89080' }}>
          Spørsmål? Send oss en e-post på <a href="mailto:hei@arvklart.no" style={{ color:'#c4855a' }}>hei@arvklart.no</a>
        </p>
      </div>
    </div>
  )
}

// ── CategoriesPage ────────────────────────────────────────────────────────────
export function CategoriesPage({ session, onToast }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [categories, setCategories] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [showPicker, setShowPicker] = useState(false)
  const EMOJIS = ['🛋️','🖼️','📚','🍳','🏺','📺','🧣','📦','🪑','🛏️','🪞','🎨','🎻','⌚','💍','🪴','🧸','🎁','🗝️','📷','🪆','🧩','🍷','🕰️','🪵','🧺','💻','🎭']

  const load = () => supabase.from('categories').select('*').eq('estate_id', id).order('label').then(({data})=>setCategories(data||[]))
  useEffect(()=>{load()},[])

  const add = async () => {
    if (!newLabel.trim()) return
    await supabase.from('categories').insert({ label:newLabel.trim(), emoji:newEmoji, estate_id:id })
    setNewLabel(''); setNewEmoji('📦'); setShowPicker(false); onToast('Kategori lagt til ✓'); load()
  }
  const remove = async (catId) => {
    await supabase.from('categories').delete().eq('id', catId)
    onToast('Kategori fjernet'); load()
  }

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', padding:'28px 16px', fontFamily:'DM Sans, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}/admin`)} style={{ background:'none', border:'none', color:'#8c7b6b', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'DM Sans, sans-serif' }}>← Tilbake til administrasjon</button>
      <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'24px', fontWeight:'400', color:'#1a1410', marginBottom:'28px' }}>Kategorier</h1>

      <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', color:'#8c7b6b', marginBottom:'14px' }}>Legg til ny kategori:</p>
        <div style={{ display:'flex', gap:'8px', marginBottom: showPicker?'12px':'0' }}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{ padding:'10px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', background:'#faf7f3', cursor:'pointer', fontSize:'20px' }}>{newEmoji}</button>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Kategorinavn…" maxLength={100}
            style={{ flex:1, padding:'10px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', fontSize:'15px', background:'#faf7f3', color:'#1a1410', outline:'none', fontFamily:'DM Sans, sans-serif' }} />
          <button onClick={add} disabled={!newLabel.trim()} style={{ padding:'10px 18px', background:newLabel.trim()?'#1a1410':'#c0b8b0', color:'#f5f0eb', border:'none', borderRadius:'8px', cursor:newLabel.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'DM Sans, sans-serif' }}>+</button>
        </div>
        {showPicker && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'12px', background:'#f5f0eb', borderRadius:'8px' }}>
            {EMOJIS.map(e=>(<button key={e} onClick={()=>{setNewEmoji(e);setShowPicker(false)}} style={{ fontSize:'20px', background:newEmoji===e?'#e0d8d0':'none', border:'none', cursor:'pointer', padding:'5px', borderRadius:'6px' }}>{e}</button>))}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', overflow:'hidden' }}>
        {categories.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'#a89080', fontSize:'14px' }}>Ingen kategorier ennå. Legg til den første.</div>
        )}
        {categories.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', padding:'14px 20px', borderBottom:i<categories.length-1?'1px solid #f0ebe4':'none' }}>
            <span style={{ fontSize:'20px', marginRight:'14px' }}>{c.emoji}</span>
            <span style={{ flex:1, fontSize:'15px', color:'#1a1410' }}>{c.label}</span>
            <button onClick={()=>remove(c.id)} style={{ background:'none', border:'none', color:'#c0a090', cursor:'pointer', fontSize:'20px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}
