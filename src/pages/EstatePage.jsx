import { useEffect, useLayoutEffect, useState, useRef } from 'react'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }
import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getItems, getCategories, supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const PALETTE = ['#5F6E52','#8B9A7D','#A97C3F','#7A8B6E','#9C8267','#6E8B87']

export default function EstatePage({ session, profile, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [estate, setEstate] = useState(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [myRole, setMyRole] = useState('member')
  const [tab, setTab] = useState('items')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [confirmItem, setConfirmItem] = useState(null)
  const scrollPos = useRef(0)

  useEffect(() => {
    const onScroll = () => sessionStorage.setItem('estate_scroll_' + id, window.scrollY)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [id])

  useEffect(() => {
    if (!loading) {
      const saved = sessionStorage.getItem('estate_scroll_' + id)
      if (saved) {
        setTimeout(() => {
          window.scrollTo({ top: parseInt(saved), behavior: 'instant' })
          sessionStorage.removeItem('estate_scroll_' + id)
        }, 50)
      }
    }
  }, [loading])

  const load = async () => {
    const [{ data: est }, { data: its }, { data: cats }, { data: mem }] = await Promise.all([
      getEstate(id),
      getItems(id),
      getCategories(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
    ])
    setEstate(est)
    setItems(its || [])
    setCategories(cats || [])
    setMyRole(mem?.role || 'member')
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel(`estate-${id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'items', filter:`estate_id=eq.${id}` }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'interests' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Laster…</div>
  if (!estate) return <div style={{ padding:'60px', textAlign:'center', color:'#9C8267' }}>Estate ikke funnet.</div>

  const myItems = items.filter(i => i.interests?.some(x => x.user_id === session.user.id))
  const otherItems = items.filter(i => !i.interests?.some(x => x.user_id === session.user.id))

  const getFiltered = () => {
    if (filterStatus === 'mine') return items.filter(i => i.interests?.some(x => x.user_id === session.user.id))
    if (filterStatus === 'contested') return items.filter(i => i.interests?.length > 1)
    if (filterStatus === 'wanted') return items.filter(i => i.interests?.length > 0)
    if (filterStatus === 'unwanted') return items.filter(i => i.interests?.length === 0)
    if (filterStatus === 'assigned') return items.filter(i => i.status === 'assigned')
    return items
  }

  const filtered = getFiltered().filter(i => filterCat === 'all' || i.category_id === filterCat)

  const myCount = myItems.length
  const contested = items.filter(i => i.interests?.length > 1).length
  const unwanted = items.filter(i => i.interests?.length === 0).length
  const assigned = items.filter(i => i.status === 'assigned').length

  const handleDelete = (item, e) => {
    e.stopPropagation()
    const canDelete = myRole === 'admin' || item.added_by === session.user.id
    if (!canDelete) { onToast('Bare admin kan slette andres gjenstander', 'error'); return }
    setConfirmItem(item)
  }

  const confirmDelete = async () => {
    if (!confirmItem) return
    await supabase.from('items').delete().eq('id', confirmItem.id)
    onToast('Gjenstand slettet')
    setConfirmItem(null)
    load()
  }

  const byCat = categories.map(c => ({
    name: `${c.emoji} ${c.label}`,
    count: items.filter(i => i.category_id === c.id).length,
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count)

  const pieData = [
    { name: 'Tildelt', value: assigned },
    { name: 'Ettertraktet', value: contested },
    { name: 'Ønsket', value: items.filter(i => i.interests?.length === 1).length },
    { name: 'Ingen vil ha', value: unwanted },
  ].filter(d => d.value > 0)

  return (
    <div style={{ maxWidth:'920px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 8px', fontFamily:'Karla, sans-serif' }}>← Alle estates</button>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{estate.name}</h1>
          {estate.description && <p style={{ color:'#9C8267', fontSize:'14px' }}>{estate.description}</p>}
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {myRole === 'admin' && (
            <button onClick={() => navigate(`/estate/${id}/admin`)} style={{ padding:'9px 16px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
              Administrer
            </button>
          )}
          <button onClick={() => navigate(`/estate/${id}/swipe`)} style={{ padding:'9px 16px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
            Sveip
          </button>
          {!isDemo && <button onClick={() => navigate(`/estate/${id}/add`)} style={{ padding:'9px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
            + Legg til
          </button>}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:'10px', marginBottom:'28px' }}>
        {[
          { v:items.length, l:'Gjenstander' },
          { v:myCount, l:'Mine interesser', clickStatus:'mine' },
          { v:contested, l:'Ettertraktede', warn:contested>0, clickStatus:'contested' },
          { v:items.filter(i => i.interests?.length > 0).length, l:'Noen vil ha', clickStatus:'wanted' },
          { v:unwanted, l:'Ingen vil ha', clickStatus:'unwanted' },
          { v:assigned, l:'Tildelt', clickStatus:'assigned' },
        ].map(s => (
          <div key={s.l} onClick={s.clickStatus ? () => setFilterStatus(filterStatus===s.clickStatus?'all':s.clickStatus) : undefined} style={{
            background: filterStatus===s.clickStatus?'#DCE3D2':'#fff',
            border:`1px solid ${s.warn&&s.v>0?'#C8BEA0':'#D9CFC0'}`, borderRadius:'10px', padding:'14px',
            cursor: s.clickStatus?'pointer':'default',
          }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#3A2F26', fontFamily:'Karla, sans-serif', marginBottom:'6px', lineHeight:'1.2' }}>{s.l}</div>
            <div style={{ fontSize:'18px', color:s.warn&&s.v>0?'#5F6E52':'#9C8267', fontFamily:'Fraunces, serif' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Modules */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:'10px', marginBottom:'28px' }}>
        {[
          { path:`/estate/${id}/guide`, label:'Veiviser', desc:'For arveprosessen', color:'#DCE3D2', border:'#B8C8A8' },
          { path:`/estate/${id}/heirs`, label:'Arvinger', desc:'Fordelingskalkulator', color:'#DCE3D2', border:'#B8C8A8' },
          ...(contested > 0 ? [{ path:`/estate/${id}/conflicts`, label:'Løsningsmetoder', desc:`${contested} ettertraktede`, color:'#E8DFD0', border:'#C8B8A0', highlight: true }] : []),
        ].map(mod => (
          <button key={mod.path} onClick={() => navigate(mod.path)} style={{
            padding:'16px', background:mod.color, border:`1.5px solid ${mod.border}`,
            borderRadius:'10px', cursor:'pointer', textAlign:'left', fontFamily:'Karla, sans-serif',
            boxShadow: mod.highlight ? '0 0 0 2px #5F6E5240' : 'none',
          }}>
            <div style={{ fontSize:'13px', fontWeight:'500', color:'#3A2F26', marginBottom:'2px' }}>{mod.label}</div>
            <div style={{ fontSize:'11px', color: mod.highlight ? '#5F6E52' : '#9C8267', fontWeight: mod.highlight ? '500' : '400' }}>{mod.desc}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'4px', borderBottom:'1px solid #D9CFC0', marginBottom:'24px' }}>
        {[['items','Gjenstander'],['analytics','Analyse']].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'10px 18px', border:'none', background:'none', cursor:'pointer',
            fontSize:'14px', fontFamily:'Karla, sans-serif',
            color:tab===t?'#3A2F26':'#9C8267',
            borderBottom:tab===t?'2px solid #3A2F26':'2px solid transparent', marginBottom:'-1px',
          }}>{l}</button>
        ))}
      </div>

      {tab === 'analytics' ? (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Gjenstander per kategori</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byCat} margin={{ bottom:40, left:-20 }}>
                <XAxis dataKey="name" tick={{ fontSize:10, fill:'#9C8267' }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize:10, fill:'#9C8267' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#5F6E52" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ percent }) => `${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_,i) => <Cell key={i} fill={PALETTE[i%PALETTE.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:'flex', gap:'8px', marginBottom:'20px', flexWrap:'wrap' }}>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ flex:1, minWidth:'140px', padding:'9px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#fff', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}>
              <option value="all">Alle kategorier</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ flex:1, minWidth:'140px', padding:'9px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#fff', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}>
              <option value="all">Alle gjenstander</option>
              <option value="mine">Mine interesser</option>
              <option value="contested">Ettertraktede</option>
              <option value="wanted">Noen vil ha</option>
              <option value="unwanted">Ingen vil ha</option>
              <option value="assigned">Tildelt</option>
            </select>
          </div>

          {filterStatus === 'all' && myItems.length > 0 && (
            <div style={{ marginBottom:'24px' }}>
              <div style={{ fontSize:'13px', color:'#5F6E52', fontWeight:'500', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                Mine interesser ({myItems.length})
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px', marginBottom:'20px' }}>
                {myItems.filter(i => filterCat === 'all' || i.category_id === filterCat).map(item => (
                  <ItemCard key={item.id} item={item} userId={session.user.id} myRole={myRole}
                    onClick={() => { sessionStorage.setItem('estate_scroll_' + id, window.scrollY); navigate(`/estate/${id}/item/${item.id}`) }}
                    onDelete={e => handleDelete(item, e)} />
                ))}
              </div>
              {otherItems.filter(i => filterCat === 'all' || i.category_id === filterCat).length > 0 && (
                <div style={{ fontSize:'13px', color:'#9C8267', fontWeight:'500', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                  Andre gjenstander
                </div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'80px 20px', color:'#9C8267' }}>
              <p style={{ marginBottom:'20px' }}>Ingen gjenstander ennå.</p>
              {!isDemo && <button onClick={() => navigate(`/estate/${id}/add`)} style={{ padding:'11px 24px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
                Legg til første gjenstand
              </button>}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px' }}>
              {(filterStatus === 'all' ? otherItems : filtered).filter(i => filterCat === 'all' || i.category_id === filterCat).map(item => (
                <ItemCard key={item.id} item={item} userId={session.user.id} myRole={myRole}
                  onClick={() => { sessionStorage.setItem('estate_scroll_' + id, window.scrollY); navigate(`/estate/${id}/item/${item.id}`) }}
                  onDelete={e => handleDelete(item, e)} />
              ))}
            </div>
          )}
        </>
      )}

      {confirmItem && (
        <div onClick={() => setConfirmItem(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', padding:'28px', maxWidth:'380px', width:'100%' }}>
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>Slett gjenstand</h3>
            <p style={{ fontSize:'14px', color:'#5C4530', marginBottom:'6px' }}>«{confirmItem.title}»</p>
            <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'24px' }}>Kan ikke angres.</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setConfirmItem(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Avbryt</button>
              <button onClick={confirmDelete} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Slett</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({ item, userId, onClick, onDelete, myRole }) {
  const cat = item.categories || { emoji:'📦', label:'Annet' }
  const myInterest = item.interests?.some(x => x.user_id === userId)
  const count = item.interests?.length || 0
  const isAssigned = item.status === 'assigned'
  const canDelete = myRole === 'admin' || item.added_by === userId

  return (
    <div onClick={onClick} style={{
      background:'#fff', borderRadius:'10px', overflow:'hidden', cursor:'pointer',
      border: isAssigned ? '1.5px solid #8B9A7D' : myInterest ? '2px solid #3A2F26' : '1px solid #D9CFC0',
      transition:'transform 0.15s, box-shadow 0.15s', position:'relative',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.09)' }}
    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>

      {canDelete && (
        <button onClick={onDelete} style={{
          position:'absolute', top:'6px', left:'6px', zIndex:10,
          background:'#8B3A3A', color:'#fff', border:'none',
          borderRadius:'6px', padding:'3px 8px', cursor:'pointer',
          fontSize:'11px', fontFamily:'Karla, sans-serif',
        }}>Slett</button>
      )}

      <div style={{ height:'130px', background:'#E8DFD0', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : <span style={{ fontSize:'44px' }}>{cat.emoji}</span>}
        {count > 1 && !isAssigned && <span style={{ position:'absolute', top:'6px', right:'6px', background:'#5F6E52', color:'#fff', fontSize:'10px', padding:'2px 6px', borderRadius:'20px' }}>{count}</span>}
        {isAssigned && <span style={{ position:'absolute', top:'6px', right:'6px', background:'#8B9A7D', color:'#fff', fontSize:'10px', padding:'2px 6px', borderRadius:'20px' }}>Tildelt</span>}
      </div>

      <div style={{ padding:'12px' }}>
        <div style={{ fontSize:'14px', color:'#3A2F26', marginBottom:'4px', lineHeight:'1.3' }}>{item.title}</div>
        {item.estimated_value && <div style={{ fontSize:'11px', color:'#9C8267', marginBottom:'6px' }}>{item.estimated_value}</div>}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', gap:'2px' }}>
            {(item.interests||[]).slice(0,4).map(x => (
              <div key={x.id} title={x.profiles?.display_name} style={{
                width:'20px', height:'20px', borderRadius:'50%',
                background:x.profiles?.avatar_color||'#DCE3D2',
                border:tc(x.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:'9px', color:tc(x.profiles?.avatar_color||'#DCE3D2'), fontWeight:'600',
              }}>{(x.profiles?.display_name||'?')[0].toUpperCase()}</div>
            ))}
            {count === 0 && <span style={{ fontSize:'11px', color:'#C0B0A0', fontStyle:'italic' }}>Ingen ennå</span>}
          </div>
          {myInterest && <span style={{ fontSize:'10px', color:'#3A2F26', background:'#E8DFD0', padding:'2px 6px', borderRadius:'20px' }}>Meg</span>}
        </div>
      </div>
    </div>
  )
}
