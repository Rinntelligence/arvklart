import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getItems, supabase } from '../lib/supabase'
import { getEstatePasses, addPass, addInterestClearingPass } from '../lib/decisions'
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
  const [action, setAction] = useState(null) // 'like' | 'pass' | 'trash'
  const startPos = useRef(null)
  const cardRef = useRef(null)
  const busy = useRef(false) // ett kort om gangen, også ved dobbeltklikk

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

  const handleAction = (type) => {
    const item = currentItem
    if (!item || busy.current) return
    busy.current = true
    setAction(type)

    setTimeout(async () => {
      let error
      if (type === 'like') {
        ({ error } = await addInterestClearingPass(item.id, session.user.id, ''))
      } else if (type === 'trash') {
        ({ error } = await addPass(item.id, session.user.id))
        if (!error) ({ error } = await supabase.from('items').update({ marked_for_disposal: true }).eq('id', item.id))
      } else {
        ({ error } = await addPass(item.id, session.user.id))
      }

      setOffset({ x: 0, y: 0 })
      setAction(null)
      busy.current = false
      if (error) { onToast(L('Kunne ikke lagre valget. Prøv igjen.', 'Could not save your choice. Please try again.'), 'error'); return }
      onToast(type === 'like' ? L('Interesse registrert!', 'Interest registered!') : type === 'trash' ? L('Merket for kast', 'Marked for disposal') : L('Ikke interessert', 'Not interested'))
      if (index + 1 >= items.length) {
        setDone(true)
      } else {
        setIndex(i => i + 1)
      }
    }, 400)
  }

  const onTouchStart = (e) => {
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    setDragging(true)
  }

  const onTouchMove = (e) => {
    if (!startPos.current) return
    const dx = e.touches[0].clientX - startPos.current.x
    const dy = e.touches[0].clientY - startPos.current.y
    setOffset({ x: dx, y: dy })

    if (dy < -80) setAction('trash')
    else if (dx > 60) setAction('like')
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
    if (dy < -80) setAction('trash')
    else if (dx > 60) setAction('like')
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
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Karla, sans-serif', color:'#9C8267' }}>
      {L('Laster…', 'Loading…')}
    </div>
  )

  if (done || items.length === 0) return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'Karla, sans-serif', padding:'20px', textAlign:'center', background:'#FBF9F5' }}>
      <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'12px' }}>
        {items.length === 0 ? L('Ingen gjenstander igjen!', 'No items left!') : L('Du har sett alle gjenstander!', 'You have seen all the items!')}
      </h2>
      <p style={{ color:'#9C8267', marginBottom:'32px' }}>{L('Gå tilbake for å se dine interesser', 'Go back to see your interests')}</p>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ padding:'14px 32px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'16px', fontFamily:'Karla, sans-serif' }}>
        {L('← Tilbake til oversikt', '← Back to overview')}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'#FBF9F5', fontFamily:'Karla, sans-serif', display:'flex', flexDirection:'column' }}
      onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      {/* Header */}
      <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
          {L('← Tilbake', '← Back')}
        </button>
        <div style={{ fontSize:'13px', color:'#9C8267' }}>
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
          <div style={{ position:'absolute', top:'30px', left:'30px', background:'#5F6E52', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontSize:'18px', fontWeight:'700', transform:'rotate(-15deg)', zIndex:10, border:'3px solid #4A5A3E' }}>
            {L('VIL HA', 'WANT')}
          </div>
        )}
        {action === 'pass' && (
          <div style={{ position:'absolute', top:'30px', right:'30px', background:'#8B3A3A', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontSize:'18px', fontWeight:'700', transform:'rotate(15deg)', zIndex:10, border:'3px solid #6A2A2A' }}>
            PASS
          </div>
        )}
        {action === 'trash' && (
          <div style={{ position:'absolute', top:'30px', left:'50%', transform:'translateX(-50%)', background:'#9C6B30', color:'#fff', padding:'8px 20px', borderRadius:'8px', fontSize:'18px', fontWeight:'700', zIndex:10, border:'3px solid #7A5020' }}>
            {L('KAST', 'DISCARD')}
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
              : <span style={{ fontSize:'48px', color:'#9C8267' }}>{currentItem.categories?.emoji || '·'}</span>
            }
          </div>

          {/* Info */}
          <div style={{ padding:'20px' }}>
            <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'20px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{currentItem.title}</h2>
            <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px' }}>
              <span style={{ fontSize:'12px', color:'#9C8267', background:'#E8DFD0', padding:'3px 10px', borderRadius:'20px' }}>
                {currentItem.categories?.emoji} {categoryLabel(currentItem.categories?.label) || L('Annet', 'Other')}
              </span>
              {currentItem.estimated_value && (
                <span style={{ fontSize:'12px', color:'#5F6E52' }}>{formatNOK(currentItem.estimated_value)}</span>
              )}
            </div>
            {currentItem.description && (
              <p style={{ fontSize:'13px', color:'#5C4530', lineHeight:'1.6', margin:0 }}>{currentItem.description.slice(0, 100)}{currentItem.description.length > 100 ? '…' : ''}</p>
            )}
            {currentItem.interests?.length > 0 && (
              <p style={{ fontSize:'12px', color:'#5F6E52', marginTop:'8px' }}>
                {L(
                  `${currentItem.interests.length} ${currentItem.interests.length === 1 ? 'person' : 'personer'} er interessert`,
                  `${currentItem.interests.length} ${currentItem.interests.length === 1 ? 'person is' : 'people are'} interested`,
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div style={{ padding:'16px 20px 32px', display:'flex', justifyContent:'center', gap:'20px', alignItems:'center' }}>
        <button onClick={() => handleAction('pass')} style={{
          width:'64px', height:'64px', borderRadius:'50%', border:'2px solid #D9CFC0',
          background:'#fff', cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'13px', fontWeight:'600', color:'#8B3A3A', fontFamily:'Karla, sans-serif',
        }}>Pass</button>

        <button onClick={() => handleAction('trash')} style={{
          width:'52px', height:'52px', borderRadius:'50%', border:'2px solid #D9CFC0',
          background:'#fff', cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'11px', fontWeight:'600', color:'#9C6B30', fontFamily:'Karla, sans-serif',
        }}>{L('Kast', 'Discard')}</button>

        <button onClick={() => handleAction('like')} style={{
          width:'64px', height:'64px', borderRadius:'50%', border:'2px solid #B8C8A8',
          background:'#fff', cursor:'pointer',
          boxShadow:'0 4px 16px rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'13px', fontWeight:'600', color:'#5F6E52', fontFamily:'Karla, sans-serif',
        }}>{L('Vil ha', 'Want')}</button>
      </div>

      {/* Hint */}
      <div style={{ textAlign:'center', paddingBottom:'16px', fontSize:'12px', color:'#D9CFC0' }}>
        {L('Sveip ← pass · ↑ kast · → vil ha', 'Swipe ← pass · ↑ discard · → want')}
      </div>
    </div>
  )
}
