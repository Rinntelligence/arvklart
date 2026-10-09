import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getItems, removeInterest } from '../lib/supabase'
import { getEstatePasses, addPass, addInterestClearingPass, removePass, setInterestReason } from '../lib/decisions'
import { readReasonDraft, clearReasonDraft } from '../lib/reasonDraft'
import ReasonEditor from '../components/ReasonEditor'
import { L } from '../lib/lang'
import { categoryLabel } from '../lib/categories'
import { formatNOK } from '../lib/format'

export default function SwipePage({ session, profile, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [action, setAction] = useState(null) // 'like' | 'pass'
  const startPos = useRef(null)
  const cardRef = useRef(null)
  const busy = useRef(false) // ett kort om gangen, også ved dobbeltklikk
  const [last, setLast] = useState(null) // { type, item }: siste valg kan angres uten tidsfrist
  const [reasons, setReasons] = useState({}) // itemId → lagret begrunnelse, for ønsker registrert her
  // Sveipingen er bare for ønsker: «Vil ha» eller «Nei takk». Hva som skjer med det ingen vil ha
  // (selges, gis bort, kastes), bestemmes etter at alle har tatt stilling, ikke underveis her.

  useEffect(() => {
    getItems(id).then(async ({ data }) => {
      const all = data || []
      const myPasses = (await getEstatePasses(id)).filter(p => p.user_id === session.user.id)
      const unswipedItems = all.filter(item =>
        item.status !== 'assigned' &&
        !item.interests?.some(x => x.user_id === session.user.id) &&
        !myPasses.some(p => p.item_id === item.id)
      )
      setItems(unswipedItems)
      setLoading(false)
    })
  }, [id])

  const currentItem = items[index]

  // Sveiper man videre med en påbegynt begrunnelse på forrige ønske, lagres den, så teksten ikke går tapt.
  // Feiler lagringen, ligger teksten igjen som utkast og kan fullføres fra gjenstanden eller «Mine».
  const saveReasonInProgress = () => {
    if (last?.type !== 'like') return
    const { id: itemId, title } = last.item
    const draft = readReasonDraft(session.user.id, itemId)
    if (draft === null || draft === (reasons[itemId] || '')) return
    setInterestReason(itemId, session.user.id, draft).then(({ error }) => {
      if (error) { onToast(L(`Begrunnelsen for «${title}» ble ikke lagret. Teksten er tatt vare på, og du kan lagre den fra gjenstanden.`, `The reason for «${title}» was not saved. Your text is kept, and you can save it from the item.`), 'error'); return }
      clearReasonDraft(session.user.id, itemId)
      setReasons(r => ({ ...r, [itemId]: draft.trim() || null }))
      onToast(L(`Begrunnelse lagret for «${title}»`, `Reason saved for «${title}»`))
    })
  }

  const handleAction = (type) => {
    const item = currentItem
    if (!item || busy.current) return
    busy.current = true
    saveReasonInProgress()
    setAction(type)

    setTimeout(async () => {
      let error
      if (type === 'like') {
        ({ error } = await addInterestClearingPass(item.id, session.user.id, ''))
      } else {
        ({ error } = await addPass(item.id, session.user.id))
      }

      setOffset({ x: 0, y: 0 })
      setAction(null)
      busy.current = false
      if (error) { onToast(L('Kunne ikke lagre valget. Prøv igjen.', 'Could not save your choice. Please try again.'), 'error'); return }
      setLast({ type, item })
      if (index + 1 >= items.length) {
        setDone(true)
      } else {
        setIndex(i => i + 1)
      }
    }, 400)
  }

  // Angre siste valg: fjerner interessen eller «nei takk», og viser kortet igjen
  const undoLast = async () => {
    if (!last || busy.current) return
    busy.current = true
    const { type, item } = last
    let error
    if (type === 'like') ({ error } = await removeInterest(item.id, session.user.id))
    else ({ error } = await removePass(item.id, session.user.id))
    busy.current = false
    if (error) { onToast(L('Kunne ikke angre. Prøv igjen.', 'Could not undo. Please try again.'), 'error'); return }
    // Ønsket er borte, og begrunnelsen med det
    if (type === 'like') { clearReasonDraft(session.user.id, item.id); setReasons(r => ({ ...r, [item.id]: null })) }
    setLast(null)
    setDone(false)
    setIndex(Math.max(0, items.findIndex(i => i.id === item.id)))
  }

  const lastText = last && (last.type === 'like'
    ? L(`Du vil ha «${last.item.title}»`, `You want «${last.item.title}»`)
    : L(`Nei takk til «${last.item.title}»`, `No thanks to «${last.item.title}»`))
  // Statusteksten leses opp; knappene og begrunnelsesfeltet ligger utenfor det levende området.
  // «+ Si hvorfor» er helt valgfritt: knappene og sveipingen virker som før mens feltet er åpent.
  const undoBar = last && (
    <div style={{ padding:'8px 20px', fontSize:'0.875rem', color:'#3A2F26', width:'100%', maxWidth:'420px', margin:'0 auto', boxSizing:'border-box' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px', flexWrap:'wrap' }}>
        <span role="status">{lastText}</span>
        <button onClick={undoLast} style={{ minHeight:'44px', padding:'8px 16px', background:'#fff', border:'1px solid #9A8B78', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontWeight:'600', color:'#3A2F26', fontFamily:'Karla, sans-serif' }}>{L('Angre', 'Undo')}</button>
      </div>
      {last.type === 'like' && (
        <div style={{ display:'flex', justifyContent:'center', marginTop:'4px' }}>
          <ReasonEditor key={last.item.id} itemId={last.item.id} itemTitle={last.item.title} userId={session.user.id} compact
            savedReason={reasons[last.item.id] || null} onToast={onToast}
            onSaved={r => setReasons(prev => ({ ...prev, [last.item.id]: r }))} />
        </div>
      )}
    </div>
  )

  const onTouchStart = (e) => {
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    setDragging(true)
  }

  const onTouchMove = (e) => {
    if (!startPos.current) return
    const dx = e.touches[0].clientX - startPos.current.x
    const dy = e.touches[0].clientY - startPos.current.y
    setOffset({ x: dx, y: dy })

    if (dx > 60) setAction('like')
    else if (dx < -60) setAction('pass')
    else setAction(null)
  }

  const onTouchEnd = () => {
    setDragging(false)
    if (action) {
      handleAction(action)
    } else {
      setOffset({ x: 0, y: 0 })
    }
    startPos.current = null
  }

  const onMouseDown = (e) => {
    startPos.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
  }

  const onMouseMove = (e) => {
    if (!dragging || !startPos.current) return
    const dx = e.clientX - startPos.current.x
    const dy = e.clientY - startPos.current.y
    setOffset({ x: dx, y: dy })
    if (dx > 60) setAction('like')
    else if (dx < -60) setAction('pass')
    else setAction(null)
  }

  const onMouseUp = () => {
    if (!dragging) return
    setDragging(false)
    if (action) {
      handleAction(action)
    } else {
      setOffset({ x: 0, y: 0 })
    }
    startPos.current = null
  }

  const rotate = offset.x * 0.08
  const cardStyle = {
    transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotate}deg)`,
    transition: dragging ? 'none' : 'transform 0.3s ease',
    cursor: dragging ? 'grabbing' : 'grab',
    userSelect: 'none',
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Karla, sans-serif', color:'#75604B' }}>
      {L('Laster…', 'Loading…')}
    </div>
  )

  if (done || items.length === 0) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'Karla, sans-serif', padding:'20px', textAlign:'center', background:'#FBF9F5' }}>
      <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'1.5rem', fontWeight:'400', color:'#3A2F26', marginBottom:'12px' }}>
        {items.length === 0 ? L('Ingen gjenstander igjen!', 'No items left!') : L('Du har sett alle gjenstander!', 'You have seen all the items!')}
      </h2>
      <p style={{ color:'#75604B', marginBottom:'24px', maxWidth:'420px', lineHeight:1.6 }}>{L('Du har tatt stilling til alle. Du kan endre valget ditt på hver gjenstand i oversikten.', 'You have decided on all of them. You can change your choice on each item in the overview.')}</p>
      {undoBar}
      <div style={{ height:'16px' }} />
      <button onClick={() => navigate(`/estate/${id}`)} style={{ padding:'14px 32px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'1rem', fontFamily:'Karla, sans-serif' }}>
        {L('← Tilbake til oversikt', '← Back to overview')}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', fontFamily:'Karla, sans-serif', display:'flex', flexDirection:'column' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      {/* Header */}
      <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
          {L('← Tilbake', '← Back')}
        </button>
        <div style={{ fontSize:'0.8125rem', color:'#75604B' }}>
          {index + 1} / {items.length}
        </div>
        <div style={{ width:'60px' }} />
      </div>

      {/* Progress bar */}
      <div style={{ height:'3px', background:'#D9CFC0', margin:'0 20px' }}>
        <div style={{ height:'100%', background:'#3A2F26', width:`${((index) / items.length) * 100}%`, transition:'width 0.3s', borderRadius:'2px' }} />
      </div>

      {/* Card area */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px', position:'relative' }}>

        {/* Action indicators */}
        {action === 'like' && (
          <div style={{ position:'absolute', top:'30px', left:'30px', background:'#5F6E52', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontSize:'1.125rem', fontWeight:'700', transform:'rotate(-15deg)', zIndex:10, border:'3px solid #4A5A3E' }}>
            {L('VIL HA', 'WANT')}
          </div>
        )}
        {action === 'pass' && (
          <div style={{ position:'absolute', top:'30px', right:'30px', background:'#8B3A3A', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontSize:'1.125rem', fontWeight:'700', transform:'rotate(15deg)', zIndex:10, border:'3px solid #6A2A2A' }}>
            {L('NEI TAKK', 'NO THANKS')}
          </div>
        )}

        {/* Next card (background) */}
        {items[index + 1] && (
          <div style={{ position:'absolute', width:'min(380px, 90vw)', background:'#fff', borderRadius:'20px', overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.08)', transform:'scale(0.95) translateY(10px)', zIndex:0 }}>
            <div style={{ height:'320px', background:'#E8DFD0' }} />
          </div>
        )}

        {/* Main card */}
        <div ref={cardRef} style={{ ...cardStyle, width:'min(380px, 90vw)', background:'#fff', borderRadius:'20px', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.12)', zIndex:1, position:'relative' }}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}>

          {/* Image */}
          <div style={{ height:'320px', background:'#E8DFD0', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
            {currentItem.image_url
              ? <img src={currentItem.image_url} alt={currentItem.title} style={{ width:'100%', height:'100%', objectFit:'contain', pointerEvents:'none' }} />
              : <span style={{ fontSize:'3rem', color:'#75604B' }}>{currentItem.categories?.emoji || '·'}</span>
            }
          </div>

          {/* Info */}
          <div style={{ padding:'20px' }}>
            <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'1.25rem', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{currentItem.title}</h2>
            <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px' }}>
              <span style={{ fontSize:'0.75rem', color:'#75604B', background:'#E8DFD0', padding:'3px 10px', borderRadius:'20px' }}>
                {currentItem.categories?.emoji} {categoryLabel(currentItem.categories?.label) || L('Annet', 'Other')}
              </span>
              {currentItem.estimated_value && (
                <span style={{ fontSize:'0.75rem', color:'#5F6E52' }}>{formatNOK(currentItem.estimated_value)}</span>
              )}
            </div>
            {currentItem.description && (
              <p style={{ fontSize:'0.8125rem', color:'#5C4530', lineHeight:'1.6', margin:0 }}>{currentItem.description.slice(0, 100)}{currentItem.description.length > 100 ? '…' : ''}</p>
            )}
            {currentItem.interests?.length > 0 && (
              <p style={{ fontSize:'0.75rem', color:'#5F6E52', marginTop:'8px' }}>
                {L(
                  `${currentItem.interests.length} ${currentItem.interests.length === 1 ? 'person' : 'personer'} er interessert`,
                  `${currentItem.interests.length} ${currentItem.interests.length === 1 ? 'person is' : 'people are'} interested`,
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {undoBar}

      {/* Buttons */}
      <div style={{ padding:'16px 20px 32px', display:'flex', justifyContent:'center', gap:'20px', alignItems:'center' }}>
        <button onClick={() => handleAction('pass')} style={{
          width:'80px', height:'80px', borderRadius:'50%', border:'2px solid #D9CFC0',
          background:'#fff', cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'0.8125rem', fontWeight:'600', color:'#8B3A3A', fontFamily:'Karla, sans-serif',
        }}>{L('Nei takk', 'No thanks')}</button>

        <button onClick={() => handleAction('like')} style={{
          width:'80px', height:'80px', borderRadius:'50%', border:'2px solid #B8C8A8',
          background:'#fff', cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'0.8125rem', fontWeight:'600', color:'#5F6E52', fontFamily:'Karla, sans-serif',
        }}>{L('Vil ha', 'Want')}</button>
      </div>

      {/* Hint */}
      <div style={{ textAlign:'center', paddingBottom:'16px', fontSize:'0.8125rem', color:'#75604B' }}>
        {L('Du kan også sveipe: ← nei takk · → vil ha', 'You can also swipe: ← no thanks · → want')}
      </div>
    </div>
  )
}
