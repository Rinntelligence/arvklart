import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getItems, getCategories, supabase } from '../lib/supabase'
import { buildRemainingSteps, getUndecided, getStatusBreakdown, isContested } from '../lib/estateProgress'
import { loadStatusExtras } from '../lib/decisions'
import { formatNOK } from '../lib/format'
import { removeImages, itemImageUrls } from '../lib/images'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { L, locale } from '../lib/lang'

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
  const [deleting, setDeleting] = useState(false)

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
    setStatusExtras(await loadStatusExtras(id))
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

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>
  if (!estate) return <div style={{ padding:'60px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>{L('Fant ikke boet. Det kan være slettet, eller du er ikke medlem.', 'Estate not found. It may have been deleted, or you are not a member.')}</div>

  const myItems = items.filter(i => i.interests?.some(x => x.user_id === session.user.id))
  const otherItems = items.filter(i => !i.interests?.some(x => x.user_id === session.user.id))

  const getFiltered = () => {
    if (filterStatus === 'mine') return items.filter(i => i.interests?.some(x => x.user_id === session.user.id))
    if (filterStatus === 'contested') return items.filter(isContested)
    if (filterStatus === 'wanted') return items.filter(i => i.interests?.length > 0)
    if (filterStatus === 'unwanted') return items.filter(i => i.status !== 'assigned' && !i.interests?.length)
    if (filterStatus === 'assigned') return items.filter(i => i.status === 'assigned')
    return items
  }

  const filtered = getFiltered().filter(i => filterCat === 'all' || i.category_id === filterCat)

  const myCount = myItems.length
  const contested = items.filter(isContested).length
  const unwanted = items.filter(i => i.status !== 'assigned' && !i.interests?.length).length
  const assigned = items.filter(i => i.status === 'assigned').length
  const undecided = statusExtras ? getUndecided(items, statusExtras.members, statusExtras.passes, statusExtras.heirs) : []
  const undecidedCount = undecided.length
  const remainingSteps = statusExtras ? buildRemainingSteps({ estateId: id, userId: session.user.id, items, ...statusExtras }).length : null

  const handleDelete = (item, e) => {
    e.stopPropagation()
    setConfirmItem(item)
  }

  const confirmDelete = async () => {
    if (!confirmItem || deleting) return
    setDeleting(true)
    const { data, error } = await supabase.from('items').delete().eq('id', confirmItem.id).select('id')
    setDeleting(false)
    if (error || !data?.length) { onToast(L('Kunne ikke slette gjenstanden. Bare admin og den som la den inn kan slette den.', 'Could not delete the item. Only an admin and the person who added it can delete it.'), 'error'); return }
    await removeImages(itemImageUrls(confirmItem))
    onToast(L('Gjenstand slettet', 'Item deleted'))
    setConfirmItem(null)
    load()
  }

  const byCat = categories.map(c => ({
    name: `${c.emoji} ${c.label}`,
    count: items.filter(i => i.category_id === c.id).length,
  })).filter(x => x.count > 0).sort((a,b) => b.count - a.count)

  const pieData = [
    { name: L('Tildelt', 'Assigned'), value: assigned },
    { name: L('Ettertraktet', 'Contested'), value: contested },
    { name: L('Ønsket', 'Wanted'), value: items.filter(i => i.status !== 'assigned' && i.interests?.length === 1).length },
    { name: L('Ingen vil ha', 'Unwanted'), value: unwanted },
  ].filter(d => d.value > 0)

  const breakdown = getStatusBreakdown(items)
  const myUndecided = undecided.find(u => u.member.user_id === session.user.id)?.items.length || 0
  const memberCount = statusExtras?.members.length

  const statusTabs = [
    { key:'all', label:L('Alle', 'All'), count:items.length },
    { key:'mine', label:L('Mine', 'Mine'), count:myCount },
    { key:'contested', label:L('Ettertraktede', 'Contested'), count:contested },
    { key:'wanted', label:L('Noen vil ha', 'Wanted'), count:items.filter(i => i.interests?.length > 0).length },
    { key:'unwanted', label:L('Ingen vil ha', 'Unwanted'), count:unwanted },
    { key:'assigned', label:L('Tildelt', 'Assigned'), count:assigned },
  ]

  const statusBar = [
    { label:L('Tildelt', 'Assigned'), value:breakdown.assigned, color:'#5F6E52' },
    { label:L('Ettertraktet', 'Contested'), value:breakdown.contested, color:'#9C8267' },
    { label:L('Én vil ha', 'One wants it'), value:breakdown.single, color:'#8B9A7D' },
    { label:L('Ingen vil ha', 'No one wants it'), value:breakdown.none, color:'#E8DFD0' },
  ]

  const btn = { padding:'9px 16px', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }
  const btnPrimary = { ...btn, background:'#3A2F26', border:'1px solid #3A2F26', color:'#FBF9F5' }
  const sectionLabel = { fontSize:'13px', fontWeight:'500', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }
  const openItem = item => { sessionStorage.setItem('estate_scroll_' + id, window.scrollY); navigate(`/estate/${id}/item/${item.id}`) }

  return (
    <div style={{ maxWidth:'960px', margin:'0 auto', padding:'24px 16px 64px', fontFamily:'Karla, sans-serif' }}>
      <style>{`@media (max-width: 600px) { .item-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; } }`}</style>
      {/* Header */}
      <button onClick={() => navigate('/')} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 8px', fontFamily:'Karla, sans-serif' }}>{L('← Alle bo', '← All estates')}</button>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:'20px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'2px' }}>{estate.name}</h1>
          {estate.description && <p style={{ color:'#9C8267', fontSize:'14px' }}>{estate.description}</p>}
          <p style={{ color:'#9C8267', fontSize:'14px' }}>
            {memberCount ? `${memberCount} ${memberCount === 1 ? L('medlem', 'member') : L('medlemmer', 'members')} · ` : ''}{items.length} {items.length === 1 ? L('gjenstand', 'item') : L('gjenstander', 'items')}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {myRole === 'admin' && !isDemo && <button onClick={() => navigate(`/estate/${id}/admin`)} style={btn}>{L('Administrer', 'Manage')}</button>}
          <button onClick={() => navigate(`/estate/${id}/swipe`)} style={btn}>{L('Sveip', 'Swipe')}</button>
          <button onClick={() => navigate(`/estate/${id}/add`)} style={btnPrimary}>{isDemo ? L('Prøv AI-verdivurdering', 'Try AI valuation') : L('+ Legg til', '+ Add')}</button>
        </div>
      </div>

      {estate.status === 'closed' && (
        <div style={{ background:'#E8DFD0', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'12px 16px', marginBottom:'16px', fontSize:'13px', color:'#5C4530', lineHeight:1.5 }}>
          {L('Boet er avsluttet. Det slettes automatisk, med alle bilder og dokumenter, 12 måneder etter at det ble avsluttet.', 'This estate is closed. It is deleted automatically, with all photos and documents, 12 months after it was closed.')}
          {estate.closed_at && ` (${new Date(estate.closed_at).toLocaleDateString(locale(), { day:'numeric', month:'long', year:'numeric' })})`}
        </div>
      )}

      {/* Status for boet */}
      {items.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'10px', gap:'12px', flexWrap:'wrap' }}>
            <span style={{ fontSize:'15px', fontWeight:'600', color:'#3A2F26' }}>{L('Status for boet', 'Estate status')}</span>
            <span style={{ fontSize:'14px', color:'#9C8267' }}>{L(`${assigned} av ${items.length} fordelt`, `${assigned} of ${items.length} distributed`)}</span>
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
              {L(
                `Du har ${myUndecided} ${myUndecided === 1 ? 'gjenstand' : 'gjenstander'} du ikke har tatt stilling til`,
                `You have ${myUndecided} ${myUndecided === 1 ? 'item' : 'items'} you have not decided on`,
              )}
            </div>
            <div style={{ fontSize:'14px', color:'#5C4530' }}>{L('Si ja eller nei takk til hver av dem, så kan fordelingen starte.', 'Say yes or no thanks to each of them so the distribution can start.')}</div>
          </div>
          <button onClick={() => navigate(`/estate/${id}/swipe`)} style={{ ...btnPrimary, background:'#5F6E52', border:'1px solid #5F6E52' }}>{L('Gå gjennom nå', 'Review now')}</button>
        </div>
      ) : remainingSteps > 0 ? (
        <div style={{ background:'#DCE3D2', borderRadius:'10px', padding:'16px 20px', marginBottom:'28px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'16px', flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:'15px', fontWeight:'600', color:'#3A2F26', marginBottom:'2px' }}>{L('Du har tatt stilling til alle gjenstandene', 'You have decided on all the items')}</div>
            <div style={{ fontSize:'14px', color:'#5C4530' }}>{L(`${remainingSteps} steg gjenstår før boet er ferdig.`, `${remainingSteps} ${remainingSteps === 1 ? 'step remains' : 'steps remain'} before the estate is finished.`)}</div>
          </div>
          <button onClick={() => navigate(`/estate/${id}/status`)} style={{ ...btnPrimary, background:'#5F6E52', border:'1px solid #5F6E52' }}>{L('Se hva som gjenstår', 'See what remains')}</button>
        </div>
      ) : <div style={{ marginBottom:'12px' }} />}

      {/* Snarveier */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:'8px', marginBottom:'32px' }}>
        {[
          { path:`/estate/${id}/guide`, label:L('Veiviser', 'Guide'), desc:L('For arveprosessen', 'For the inheritance process') },
          { path:`/estate/${id}/heirs`, label:L('Arvinger', 'Heirs'), desc:L('Fordelingskalkulator', 'Distribution calculator') },
          undecidedCount > 0
            ? { path:`/estate/${id}/conflicts`, label:L('Løsningsmetoder', 'Resolution methods'), desc:L(`Venter på ${undecidedCount} ${undecidedCount === 1 ? 'arving' : 'arvinger'}`, `Waiting for ${undecidedCount} ${undecidedCount === 1 ? 'heir' : 'heirs'}`) }
            : contested > 0
            ? { path:`/estate/${id}/conflicts`, label:L('Løsningsmetoder', 'Resolution methods'), desc:L(`${contested} ettertraktede`, `${contested} contested`), highlight: true }
            : { path:`/estate/${id}/conflicts`, label:L('Løsningsmetoder', 'Resolution methods'), desc:L('Ingen ettertraktede ennå', 'None contested yet') },
          { path:`/estate/${id}/status`, label:L('Hva gjenstår', 'What remains'), desc: remainingSteps === null ? L('Oversikt over boet', 'Estate overview') : remainingSteps === 0 ? L('Alt er klart', 'All done') : L(`${remainingSteps} steg gjenstår`, `${remainingSteps} ${remainingSteps === 1 ? 'step' : 'steps'} left`) },
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
        {[...statusTabs, { key:'analytics', label:L('Analyse', 'Analytics') }].map(t => {
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
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>{L('Gjenstander per kategori', 'Items per category')}</h3>
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
                <option value="all">{L('Alle kategorier', 'All categories')}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
              </select>
            </div>
          )}

          {filterStatus === 'all' && myItems.length > 0 && (
            <div style={{ marginBottom:'24px' }}>
              <div style={{ ...sectionLabel, color:'#5F6E52' }}>{L('Mine interesser', 'My interests')} ({myItems.length})</div>
              <div className="item-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px', marginBottom:'20px' }}>
                {myItems.filter(i => filterCat === 'all' || i.category_id === filterCat).map(item => (
                  <ItemCard key={item.id} item={item} userId={session.user.id} myRole={myRole} isDemo={isDemo}
                    onClick={() => openItem(item)} onDelete={e => handleDelete(item, e)} />
                ))}
              </div>
              {otherItems.filter(i => filterCat === 'all' || i.category_id === filterCat).length > 0 && (
                <div style={{ ...sectionLabel, color:'#9C8267' }}>{L('Andre gjenstander', 'Other items')}</div>
              )}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'80px 20px', color:'#9C8267' }}>
              <p style={{ marginBottom:'20px' }}>{items.length === 0 ? L('Ingen gjenstander ennå.', 'No items yet.') : L('Ingen gjenstander i dette utvalget.', 'No items in this selection.')}</p>
              {!isDemo && items.length === 0 && <button onClick={() => navigate(`/estate/${id}/add`)} style={{ ...btnPrimary, padding:'11px 24px' }}>
                {L('Legg til første gjenstand', 'Add the first item')}
              </button>}
            </div>
          ) : (
            <div className="item-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px' }}>
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
            <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Slett gjenstand', 'Delete item')}</h3>
            <p style={{ fontSize:'14px', color:'#5C4530', marginBottom:'6px' }}>«{confirmItem.title}»</p>
            <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'24px' }}>{L('Kan ikke angres.', 'This cannot be undone.')}</p>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setConfirmItem(null)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={confirmDelete} disabled={deleting} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{deleting ? L('Sletter…', 'Deleting…') : L('Slett', 'Delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Navn på de som ønsker gjenstanden, med «deg» for innlogget bruker
const interestNames = (interests, userId) => {
  const me = L('deg', 'you'), and = L('og', 'and')
  const names = interests.map(x => x.user_id === userId ? me : (x.profiles?.display_name || L('Ukjent', 'Unknown')))
  const sorted = [...names.filter(n => n !== me), ...names.filter(n => n === me)]
  if (sorted.length <= 3) return sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} ${and} ${sorted.at(-1)}` : sorted[0] || ''
  return L(`${sorted.slice(0, 2).join(', ')} og ${sorted.length - 2} til`, `${sorted.slice(0, 2).join(', ')} and ${sorted.length - 2} more`)
}

function ItemCard({ item, userId, onClick, onDelete, myRole, isDemo }) {
  const cat = item.categories || { emoji:'📦', label:L('Annet', 'Other') }
  const myInterest = item.interests?.some(x => x.user_id === userId)
  const count = item.interests?.length || 0
  const isAssigned = item.status === 'assigned'
  // Den som la inn gjenstanden kan slette den bare før den er tildelt (håndheves også i databasen)
  const canDelete = !isDemo && (myRole === 'admin' || (item.added_by === userId && !item.assigned_to && item.status !== 'assigned'))
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
        }}>{L('Slett', 'Delete')}</button>
      )}

      <div style={{ height:'130px', background:'#E8DFD0', overflow:'hidden', position:'relative' }}>
        {item.image_url
          ? <img src={item.image_url} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          : <span style={{ position:'absolute', left:'10px', bottom:'8px', fontSize:'11px', color:'#9C8267' }}>{cat.emoji} {cat.label}</span>}
        {count > 1 && !isAssigned && <span style={{ position:'absolute', top:'8px', right:'8px', background:'#5F6E52', color:'#fff', fontSize:'11px', padding:'2px 8px', borderRadius:'10px' }}>{L(`${count} vil ha`, `${count} want it`)}</span>}
        {isAssigned && <span style={{ position:'absolute', top:'8px', right:'8px', background:'#8B9A7D', color:'#fff', fontSize:'11px', padding:'2px 8px', borderRadius:'10px' }}>{L('Tildelt', 'Assigned')}</span>}
      </div>

      <div style={{ padding:'10px 12px 12px' }}>
        <div style={{ fontSize:'14px', fontWeight:'500', color:'#3A2F26', marginBottom:'2px', lineHeight:'1.3' }}>{item.title}</div>
        {item.estimated_value && <div style={{ fontSize:'12px', color:'#9C8267' }}>{formatNOK(item.estimated_value)}</div>}
        <div style={{ marginTop:'8px', fontSize:'12px', color: count ? '#5C4530' : '#9C8267', fontStyle: count ? 'normal' : 'italic' }}>
          {count === 0 ? L('Ingen ennå', 'No one yet') : names === L('deg', 'you') ? L('Bare deg', 'Only you') : names.charAt(0).toUpperCase() + names.slice(1)}
        </div>
      </div>
    </div>
  )
}
