import { useEffect, useLayoutEffect, useState, useRef } from 'react'

import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getItems, getCategories, supabase } from '../lib/supabase'
import { buildRemainingSteps, getUndecided, getStatusBreakdown } from '../lib/estateProgress'
import { loadStatusExtras } from '../lib/decisions'
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
  const [statusExtras, setStatusExtras] = useState(null)
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
    setStatusExtras(await loadStatusExtras(id, its || []))
  }

  useEffect(() => {
    load()
    const channel = supabase.channel(`estate-${id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'items', filter:`estate_id=eq.${id}` }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'interests' }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'item_passes' }, load)
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
  const undecidedCount = statusExtras ? getUndecided(items, statusExtras.members, statusExtras.passes).length : 0
  const remainingSteps = statusExtras ? buildRemainingSteps({ estateId: id, userId: session.user.id, items, ...statusExtras }).length : null

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

  const breakdown = getStatusBreakdown(items)
  const myUndecided = statusExtras
    ? getUndecided(items, statusExtras.members, statusExtras.passes).find(u => u.member.user_id === session.user.id)?.items.length || 0
    : 0
  const memberCount = statusExtras?.members.length

  const statusTabs = [
    { key:'all', label:'Alle', count:items.length },
    { key:'mine', label:'Mine', count:myCount },
    { key:'contested', label:'Ettertraktede', count:contested },
    { key:'wanted', label:'Noen vil ha', count:items.filter(i => i.interests?.length > 0).length },
    { key:'unwanted', label:'Ingen vil ha', count:unwanted },
    { key:'assigned', label:'Tildelt', count:assigned },
  ]

  const statusBar = [
    { label:'Tildelt', value:breakdown.assigned, color:'#5F6E52' },
    { label:'Ettertraktet', value:breakdown.contested, color:'#9C8267' },
    { label:'Én vil ha', value:breakdown.single, color:'#8B9A7D' },
    { label:'Ingen vil ha', value:breakdown.none, color:'#E8DFD0' },
  ]

  const btn = { padding:'9px 16px', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }
  const btnPrimary = { ...btn, background:'#3A2F26', border:'1px solid #3A2F26', color:'#FBF9F5' }
  const sectionLabel = { fontSize:'13px', fontWeight:'500', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }
  const openItem = item => { sessionStorage.setItem('estate_scroll_' + id, window.scrollY); navigate(`/estate/${id}/item/${item.id}`) }

  return (
    <div style={{ maxWidth:'960px', margin:'0 auto', padding:'24px 16px 64px', fontFamily:'Karla, sans-serif' }}>
      {/* Header */}
      <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 8px', fontFamily:'Karla, sans-serif' }}>← Alle bo</button>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'2px' }}>{estate.name}</h1>
          {estate.description && <p style={{ color:'#9C8267', fontSize:'14px' }}>{estate.description}</p>}
          <p style={{ color:'#9C8267', fontSize:'14px' }}>
            {memberCount ? `${memberCount} ${memberCount === 1 ? 'medlem' : 'medlemmer'} · ` : ''}{items.length} {items.length === 1 ? 'gjenstand' : 'gjenstander'}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {myRole === 'admin' && <button onClick={() => navigate(`/estate/${id}/admin`)} style={btn}>Administrer</button>}
          <button onClick={() => navigate(`/estate/${id}/swipe`)} style={btn}>Sveip</button>
          {!isDemo && <button onClick={() => navigate(`/estate/${id}/add`)} style={btnPrimary}>+ Legg til</button>}
        </div>
      </div>

      {/* Status for boet */}
      {items.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'10px', gap:'12px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'15px', fontWeight:'600', color:'#3A2F26' }}>Status for boet</span>
            <span style={{ fontSize:'14px', color:'#9C8267' }}>{assigned} av {items.length} fordelt</span>
          </div>
          <div style={{ display:'flex', height:'10px', borderRadius:'5px', overflow:'hidden', background:'#E8DFD0' }}>
            {statusBar.map(s => s.value > 0 && <span key={s.label} style={{ width:`${s.value / items.length * 100}%`, background:s.color }} />)}
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px 20px', marginTop:'12px', fontSize:'13px', color:'#5C4530' }}>
            {statusBar.map(s => (
              <span key={s.label} style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                <i style={{ width:'10px', height:'10px', borderRadius:'2px', background:s.color, border: s.color === '#E8DFD0' ? '1px solid #D9CFC0' : 'none' }} />
                {s.label} {s.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Neste steg for brukeren */}
      {myUndecided > 0 ? (
        <div style={{ background:'#DCE3D2', borderRadius:'10px', padding:'16px 20px', marginBottom:'28px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'16px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'#3A2F26', marginBottom:'2px' }}>
              Du har {myUndecided} {myUndecided === 1 ? 'gjenstand' : 'gjenstander'} du ikke har tatt stilling til
            </div>
            <div style={{ fontSize:'14px', color:'#5C4530' }}>Si ja eller nei takk til hver av dem, så kan fordelingen starte.</div>
          </div>
          <button onClick={() => navigate(`/estate/${id}/swipe`)} style={{ ...btnPrimary, background:'#5F6E52', border:'1px solid #5F6E52' }}>Gå gjennom nå</button>
        </div>
      ) : remainingSteps > 0 ? (
        <div style={{ background:'#DCE3D2', borderRadius:'10px', padding:'16px 20px', marginBottom:'28px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'16px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'#3A2F26', marginBottom:'2px' }}>Du har tatt stilling til alle gjenstandene</div>
            <div style={{ fontSize:'14px', color:'#5C4530' }}>{remainingSteps} steg gjenstår før boet er ferdig.</div>
          </div>
          <button onClick={() => navigate(`/estate/${id}/status`)} style={{ ...btnPrimary, background:'#5F6E52', border:'1px solid #5F6E52' }}>Se hva som gjenstår</button>
        </div>
      ) : <div style={{ marginBottom:'12px' }} />}

      {/* Snarveier */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:'8px', marginBottom:'32px' }}>
        {[
          { path:`/estate/${id}/guide`, label:'Veiviser', desc:'For arveprosessen' },
          { path:`/estate/${id}/heirs`, label:'Arvinger', desc:'Fordelingskalkulator' },
          undecidedCount > 0
            ? { path:`/estate/${id}/conflicts`, label:'Løsningsmetoder', desc:`Venter på ${undecidedCount} ${undecidedCount === 1 ? 'arving' : 'arvinger'}` }
            : contested > 0
            ? { path:`/estate/${id}/conflicts`, label:'Løsningsmetoder', desc:`${contested} ettertraktede`, highlight: true }
            : { path:`/estate/${id}/conflicts`, label:'Løsningsmetoder', desc:'Ingen ettertraktede ennå' },
          { path:`/estate/${id}/status`, label:'Hva gjenstår', desc: remainingSteps === null ? 'Oversikt over boet' : remainingSteps === 0 ? 'Alt er klart' : `${remainingSteps} steg gjenstår` },
        ].map(mod => (
          <button key={mod.path} onClick={() => navigate(mod.path)} style={{
            padding:'12px 14px', background:'#fff', border:`1px solid ${mod.highlight ? '#8B9A7D' : '#D9CFC0'}`,
            borderRadius:'8px', cursor:'pointer', textAlign:'left', fontFamily:'Karla, sans-serif',
          }}>
            <div style={{ fontSize:'14px', color:'#3A2F26', marginBottom:'2px' }}>{mod.label}</div>
            <div style={{ fontSize:'12px', color: mod.highlight ? '#5F6E52' : '#9C8267', fontWeight: mod.highlight ? '600' : '400' }}>{mod.desc}</div>
          </button>
        ))}
      </div>

      {/* Faner: statusfilter + analyse */}
      <div style={{ display:'flex', gap:'2px', borderBottom:'1px solid #D9CFC0', marginBottom:'16px', overflowX:'auto' }}>
        {[...statusTabs, { key:'analytics', label:'Analyse' }].map(t => {
          const active = t.key === 'analytics' ? tab === 'analytics' : tab === 'items' && filterStatus === t.key
          return (
            <button key={t.key} onClick={() => {
              if (t.key === 'analytics') { setTab('analytics'); return }
              setTab('items'); setFilterStatus(t.key)
            }} style={{
              padding:'10px 12px', border:'none', background:'none', cursor:'pointer', whiteSpace:'nowrap',
              fontSize:'14px', fontFamily:'Karla, sans-serif',
              color: active ? '#3A2F26' : '#9C8267',
              borderBottom: active ? '2px solid #3A2F26' : '2px solid transparent', marginBottom:'-1px',
              marginLeft: t.key === 'analytics' ? 'auto' : 0,
            }}>
              {t.label}
              {t.count !== undefined && <span style={{ fontSize:'12px', background:'#E8DFD0', color:'#5C4530', borderRadius:'10px', padding:'1px 7px', marginLeft:'6px' }}>{t.count}</span>}
            </button>
          )
        })}
      </div>

      {tab === 'analytics' ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:'20px' }}>
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
          {categories.length > 0 && (
            <div style={{ marginBottom:'20px' }}>
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                style={{ minWidth:'200px', padding:'9px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#fff', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}>
                <option value="all">Alle kategorier</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
          )}

          {filterStatus === 'all' && myItems.length > 0 && (
            <div style={{ marginBottom:'24px' }}>
              <div style={{ ...sectionLabel, color:'#5F6E52' }}>Mine interesser ({myItems.length})</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px', marginBottom:'20px' }}>
                {myItems.filter(i => filterCat === 'all' || i.category_id === filterCat).map(item => (
                  <ItemCard key={item.id} item={item} userId={session.user.id} myRole={myRole} isDemo={isDemo}
                    onClick={() => openItem(item)} onDelete={e => handleDelete(item, e)} />
                ))}
              </div>
              {otherItems.filter(i => filterCat === 'all' || i.category_id === filterCat).length > 0 && (
                <div style={{ ...sectionLabel, color:'#9C8267' }}>Andre gjenstander</div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'80px 20px', color:'#9C8267' }}>
              <p style={{ marginBottom:'20px' }}>{items.length === 0 ? 'Ingen gjenstander ennå.' : 'Ingen gjenstander i dette utvalget.'}</p>
              {!isDemo && items.length === 0 && <button onClick={() => navigate(`/estate/${id}/add`)} style={{ ...btnPrimary, padding:'11px 24px' }}>
                Legg til første gjenstand
              </button>}
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px' }}>
              {(filterStatus === 'all' ? otherItems : filtered).filter(i => filterCat === 'all' || i.category_id === filterCat).map(item => (
                <ItemCard key={item.id} item={item} userId={session.user.id} myRole={myRole} isDemo={isDemo}
                  onClick={() => openItem(item)} onDelete={e => handleDelete(item, e)} />
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

// Navn på de som ønsker gjenstanden, med «deg» for innlogget bruker
const interestNames = (interests, userId) => {
  const names = interests.map(x => x.user_id === userId ? 'deg' : (x.profiles?.display_name || 'Ukjent'))
  const sorted = [...names.filter(n => n !== 'deg'), ...names.filter(n => n === 'deg')]
  if (sorted.length <= 3) return sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} og ${sorted.at(-1)}` : sorted[0] || ''
  return `${sorted.slice(0, 2).join(', ')} og ${sorted.length - 2} til`
}

function ItemCard({ item, userId, onClick, onDelete, myRole, isDemo }) {
  const cat = item.categories || { emoji:'📦', label:'Annet' }
  const myInterest = item.interests?.some(x => x.user_id === userId)
  const count = item.interests?.length || 0
  const isAssigned = item.status === 'assigned'
  const canDelete = !isDemo && (myRole === 'admin' || item.added_by === userId)
  const names = interestNames(item.interests || [], userId)

  return (
    <div onClick={onClick} style={{
      background:'#fff', borderRadius:'10px', overflow:'hidden', cursor:'pointer',
      border: myInterest ? '2px solid #3A2F26' : isAssigned ? '1.5px solid #8B9A7D' : '1px solid #D9CFC0',
      transition:'transform 0.15s, box-shadow 0.15s', position:'relative',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.09)' }}
    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>

      {canDelete && (
        <button onClick={onDelete} style={{
          position:'absolute', top:'8px', left:'8px', zIndex:10,
          background:'#8B3A3A', color:'#fff', border:'none',
          borderRadius:'6px', padding:'3px 8px', cursor:'pointer',
          fontSize:'11px', fontFamily:'Karla, sans-serif',
        }}>Slett</button>
      )}

      <div style={{ height:'130px', background:'#E8DFD0', overflow:'hidden', position:'relative' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : <span style={{ position:'absolute', left:'10px', bottom:'8px', fontSize:'11px', color:'#9C8267' }}>{cat.emoji} {cat.label}</span>}
        {count > 1 && !isAssigned && <span style={{ position:'absolute', top:'8px', right:'8px', background:'#5F6E52', color:'#fff', fontSize:'11px', padding:'2px 8px', borderRadius:'10px' }}>{count} vil ha</span>}
        {isAssigned && <span style={{ position:'absolute', top:'8px', right:'8px', background:'#8B9A7D', color:'#fff', fontSize:'11px', padding:'2px 8px', borderRadius:'10px' }}>Tildelt</span>}
      </div>

      <div style={{ padding:'10px 12px 12px' }}>
        <div style={{ fontSize:'14px', fontWeight:'500', color:'#3A2F26', marginBottom:'2px', lineHeight:'1.3' }}>{item.title}</div>
        {item.estimated_value && <div style={{ fontSize:'12px', color:'#9C8267' }}>{item.estimated_value}</div>}
        <div style={{ marginTop:'8px', fontSize:'12px', color: count ? '#5C4530' : '#9C8267', fontStyle: count ? 'normal' : 'italic' }}>
          {count === 0 ? 'Ingen ennå' : names === 'deg' ? 'Bare deg' : names.charAt(0).toUpperCase() + names.slice(1)}
        </div>
      </div>
    </div>
  )
}
