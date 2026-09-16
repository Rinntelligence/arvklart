import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getItem, addInterest, removeInterest, deleteItem, getComments, addComment, deleteComment, assignItem, getEstateMembers, supabase } from '../lib/supabase'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export default function ItemDetailPage({ session, profile, onToast }) {
  const { id, itemId } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState(null)
  const [comments, setComments] = useState([])
  const [members, setMembers] = useState([])
  const [myRole, setMyRole] = useState('member')
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [suggestedValue, setSuggestedValue] = useState('')
  const [showSuggestInput, setShowSuggestInput] = useState(false)
  const commentsEndRef = useRef(null)

  const load = async () => {
    const [{ data: it }, { data: cms }, { data: mems }, { data: mem }] = await Promise.all([
      getItem(itemId),
      getComments(itemId),
      getEstateMembers(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
    ])
    setItem(it)
    setComments(cms || [])
    setMembers(mems || [])
    setMyRole(mem?.role || 'member')
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel(`item-detail-${itemId}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'comments', filter:`item_id=eq.${itemId}` }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'interests', filter:`item_id=eq.${itemId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [itemId])

  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [comments.length])

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Laster…</div>
  if (!item) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Gjenstand ikke funnet.</div>

  const cat = item.categories || { emoji:'', label:'Annet' }
  const myInterest = item.interests?.find(x => x.user_id === session.user.id)
  const isAssigned = item.status === 'assigned'
  const canDelete = myRole === 'admin' || item.added_by === session.user.id
  const allImages = [item.image_url, ...(item.extra_images || [])].filter(Boolean)

  const handleInterest = async () => {
    if (myInterest) { setShowWithdrawConfirm(true); return }
    if (!showReason) { setShowReason(true); return }
    await addInterest(itemId, session.user.id, reason)
    onToast('Interesse registrert')
    setShowReason(false); setReason(''); load()
  }

  const confirmWithdraw = async () => {
    await removeInterest(itemId, session.user.id)
    onToast('Interesse trukket tilbake')
    setShowWithdrawConfirm(false); load()
  }

  const handleEstimateVote = async (vote, suggestedValue) => {
    const voterIds = item.value_voter_ids || []
    const alreadyVoted = voterIds.includes(session.user.id)
    if (alreadyVoted) return
    const agree = (item.value_agree_count || 0) + (vote === 'agree' ? 1 : 0)
    const disagree = (item.value_disagree_count || 0) + (vote === 'disagree' ? 1 : 0)
    const updateData = {
      value_agree_count: agree,
      value_disagree_count: disagree,
      value_voter_ids: [...voterIds, session.user.id],
    }
    if (vote === 'disagree' && suggestedValue) {
      const existing = item.value_suggestions || []
      updateData.value_suggestions = [...existing, {
        user_id: session.user.id,
        name: profile?.display_name || 'Ukjent',
        value: parseFloat(suggestedValue),
      }]
    }
    await supabase.from('items').update(updateData).eq('id', itemId)
    onToast('Stemme registrert')
    load()
  }

  const handleComment = async () => {
    if (!commentText.trim()) return
    setSubmittingComment(true)
    await addComment(itemId, session.user.id, commentText.trim())
    setCommentText(''); setSubmittingComment(false); load()
  }

  const handleAssign = async (userId) => {
    await assignItem(itemId, userId)
    onToast('Gjenstand tildelt'); setShowAssign(false); load()
  }

  const handleDelete = async () => {
    await deleteItem(itemId)
    onToast('Gjenstand slettet')
    navigate(`/estate/${id}`)
  }

  return (
    <div style={{ maxWidth:'700px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
        <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>
          ← Tilbake
        </button>
        <button onClick={() => navigate(`/estate/${id}/item/${itemId}/edit`)} style={{ background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', color:'#5C4530', cursor:'pointer', fontSize:'13px', padding:'6px 14px', fontFamily:'Karla, sans-serif', marginBottom:'16px' }}>
          Rediger
        </button>
      </div>

      {/* Image carousel */}
      {allImages.length > 0 ? (
        <div style={{ marginBottom:'24px', position:'relative' }}>
          <div style={{ background:'#E8DFD0', borderRadius:'14px', height:'280px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
            <img src={allImages[currentImageIndex]} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            {allImages.length > 1 && currentImageIndex > 0 && (
              <button onClick={() => setCurrentImageIndex(i => i-1)} style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', borderRadius:'50%', width:'40px', height:'40px', fontSize:'22px', cursor:'pointer' }}>‹</button>
            )}
            {allImages.length > 1 && currentImageIndex < allImages.length-1 && (
              <button onClick={() => setCurrentImageIndex(i => i+1)} style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', borderRadius:'50%', width:'40px', height:'40px', fontSize:'22px', cursor:'pointer' }}>›</button>
            )}
            {allImages.length > 1 && (
              <div style={{ position:'absolute', bottom:'8px', right:'12px', background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:'12px', padding:'3px 8px', borderRadius:'20px' }}>
                {currentImageIndex+1} / {allImages.length}
              </div>
            )}
          </div>
          {allImages.length > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:'6px', marginTop:'10px' }}>
              {allImages.map((_, i) => (
                <button key={i} onClick={() => setCurrentImageIndex(i)} style={{ width: i===currentImageIndex?'20px':'8px', height:'8px', borderRadius:'4px', border:'none', background: i===currentImageIndex?'#3A2F26':'#D9CFC0', cursor:'pointer', padding:0, transition:'all 0.2s' }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:'#E8DFD0', borderRadius:'14px', height:'280px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'24px' }}>
          <span style={{ fontSize:'48px', color:'#9C8267' }}>{cat.emoji || '·'}</span>
        </div>
      )}

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'28px', marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', margin:0 }}>{item.title}</h1>
          <span style={{ fontSize:'12px', color:'#9C8267', background:'#E8DFD0', padding:'4px 12px', borderRadius:'20px', marginLeft:'12px', whiteSpace:'nowrap' }}>{cat.label}</span>
        </div>
        <p style={{ color:'#9C8267', fontSize:'13px', marginBottom:'8px' }}>
          Lagt inn av {item.added_by_name || 'ukjent'} · {new Date(item.created_at).toLocaleDateString('nb-NO', { day:'numeric', month:'long', year:'numeric' })}
        </p>
        {item.estimated_value && (() => {
          const voterIds = item.value_voter_ids || []
          const hasVoted = voterIds.includes(session.user.id)
          const totalVotes = (item.value_agree_count || 0) + (item.value_disagree_count || 0)
          const formatNOK = n => n ? new Intl.NumberFormat('nb-NO', { style:'currency', currency:'NOK', maximumFractionDigits:0 }).format(n) : '—'
          const suggestions = item.value_suggestions || []
          return (
            <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
              <div style={{ fontSize:'12px', color:'#3A5A30', fontWeight:'500', marginBottom:'4px' }}>Verdiestimat</div>
              <div style={{ fontSize:'20px', color:'#3A2F26', fontFamily:'Fraunces, serif', marginBottom:'8px' }}>
                {formatNOK(item.estimated_value)}
              </div>
              {totalVotes > 0 && (
                <div style={{ fontSize:'12px', color:'#5C4530', marginBottom:'8px' }}>
                  Enig: {item.value_agree_count || 0} · Uenig: {item.value_disagree_count || 0} ({totalVotes} {totalVotes === 1 ? 'stemme' : 'stemmer'})
                </div>
              )}
              {suggestions.length > 0 && (
                <div style={{ fontSize:'12px', color:'#5C4530', marginBottom:'8px' }}>
                  {suggestions.map((s, i) => (
                    <div key={i}>{s.name} foreslår {formatNOK(s.value)}</div>
                  ))}
                </div>
              )}
              {!hasVoted ? (
                <div>
                  <div style={{ display:'flex', gap:'6px', marginBottom: showSuggestInput ? '8px' : '0' }}>
                    <button onClick={() => { handleEstimateVote('agree'); setShowSuggestInput(false) }} style={{
                      flex:1, padding:'8px', border:'1px solid #B8C8A8', borderRadius:'7px',
                      background:'#5F6E52', cursor:'pointer', fontSize:'13px', color:'#fff', fontFamily:'Karla, sans-serif',
                    }}>Enig</button>
                    <button onClick={() => setShowSuggestInput(!showSuggestInput)} style={{
                      flex:1, padding:'8px', border:'1px solid #B8C8A8', borderRadius:'7px',
                      background: showSuggestInput ? '#A97C3F' : '#fff', cursor:'pointer', fontSize:'13px',
                      color: showSuggestInput ? '#fff' : '#3A2F26', fontFamily:'Karla, sans-serif',
                    }}>Uenig</button>
                  </div>
                  {showSuggestInput && (
                    <div style={{ display:'flex', gap:'6px', marginTop:'8px' }}>
                      <input
                        type="number"
                        value={suggestedValue}
                        onChange={e => setSuggestedValue(e.target.value)}
                        placeholder="Ditt estimat (NOK)"
                        style={{ flex:1, padding:'8px 12px', border:'1px solid #B8C8A8', borderRadius:'7px', fontSize:'14px', background:'#fff', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}
                      />
                      <button onClick={() => { handleEstimateVote('disagree', suggestedValue); setShowSuggestInput(false); setSuggestedValue('') }} style={{
                        padding:'8px 14px', background:'#A97C3F', color:'#fff', border:'none', borderRadius:'7px',
                        cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap',
                      }}>Send inn</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize:'12px', color:'#5C4530' }}>Du har stemt.</div>
              )}
            </div>
          )
        })()}
        {item.description && <p style={{ color:'#5C4530', lineHeight:'1.8', marginBottom:'24px', fontSize:'15px' }}>{item.description}</p>}

        {isAssigned ? (
          <div style={{ padding:'16px', background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', marginBottom:'24px' }}>
            <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500' }}>Denne gjenstanden er offisielt tildelt</div>
          </div>
        ) : showWithdrawConfirm ? (
          <div style={{ padding:'18px', background:'#E8DFD0', border:'1px solid #C8BEA0', borderRadius:'10px', marginBottom:'24px' }}>
            <div style={{ fontSize:'15px', color:'#3A2F26', marginBottom:'12px', fontWeight:'500' }}>Vil du angre interessen din?</div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setShowWithdrawConfirm(false)} style={{ flex:1, padding:'11px', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif', color:'#5C4530' }}>Nei, behold</button>
              <button onClick={confirmWithdraw} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Ja, angre</button>
            </div>
          </div>
        ) : myInterest ? (
          <button onClick={handleInterest} style={{ width:'100%', padding:'14px', background:'#E8DFD0', color:'#3A2F26', border:'1px solid #3A2F26', borderRadius:'10px', cursor:'pointer', fontSize:'15px', fontFamily:'Karla, sans-serif', marginBottom:'24px' }}>
            Du er interessert — klikk for å angre
          </button>
        ) : showReason ? (
          <div style={{ marginBottom:'24px' }}>
            <label style={{ display:'block', fontSize:'14px', color:'#5C4530', marginBottom:'10px' }}>Hvorfor vil du ha denne? <span style={{ color:'#9C8267' }}>(valgfri)</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="f.eks. Jeg husker denne fra barndommen…" rows={3} maxLength={1000}
              style={{ width:'100%', padding:'12px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', fontFamily:'Karla, sans-serif', color:'#3A2F26', background:'#FBF9F5', resize:'vertical', outline:'none', boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:'10px', marginTop:'10px' }}>
              <button onClick={() => setShowReason(false)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Avbryt</button>
              <button onClick={handleInterest} style={{ flex:2, padding:'11px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Registrer interesse</button>
            </div>
          </div>
        ) : (
          <button onClick={handleInterest} style={{ width:'100%', padding:'14px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'15px', fontFamily:'Karla, sans-serif', marginBottom:'24px' }}>
            Registrer interesse
          </button>
        )}

        <div style={{ borderTop:'1px solid #E8DFD0', paddingTop:'20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
            <h3 style={{ fontSize:'13px', color:'#9C8267', fontWeight:'400', textTransform:'uppercase', letterSpacing:'1px' }}>
              Interesserte ({item.interests?.length || 0})
            </h3>
            {myRole === 'admin' && !isAssigned && item.interests?.length > 0 && (
              <button onClick={() => setShowAssign(!showAssign)} style={{ fontSize:'13px', color:'#5F6E52', background:'none', border:'1px solid #B8C8A8', padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontFamily:'Karla, sans-serif' }}>
                Tildel
              </button>
            )}
          </div>
          {showAssign && (
            <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
              <p style={{ fontSize:'13px', color:'#5C4530', marginBottom:'12px' }}>Hvem får denne?</p>
              {members.map(m => (
                <button key={m.user_id} onClick={() => handleAssign(m.user_id)} style={{ display:'flex', alignItems:'center', gap:'10px', width:'100%', padding:'10px 14px', background:'#fff', border:'1px solid #B8C8A8', borderRadius:'8px', cursor:'pointer', textAlign:'left', fontFamily:'Karla, sans-serif', marginBottom:'6px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:m.profiles?.avatar_color||'#DCE3D2', border:tc(m.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:tc(m.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500' }}>
                    {(m.profiles?.display_name||'?')[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize:'14px', color:'#3A2F26' }}>{m.profiles?.display_name}</span>
                  {item.interests?.some(x => x.user_id===m.user_id) && <span style={{ fontSize:'11px', color:'#5F6E52', marginLeft:'auto' }}>interessert</span>}
                </button>
              ))}
            </div>
          )}
          {!item.interests?.length ? (
            <div>
              <p style={{ color:'#9C8267', fontSize:'14px', fontStyle:'italic', marginBottom:'16px' }}>Ingen har vist interesse ennå.</p>
              {!isAssigned && (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {[
                    { label:'Legg ut på Finn.no', desc:'Selg gjenstanden på nett', url:`https://www.finn.no/bap/forsale/new?title=${encodeURIComponent(item.title)}` },
                    { label:'Doner til veldighet', desc:'Gi til Fretex eller lignende', url:'https://www.fretex.no' },
                    { label:'Bestill tømming', desc:'Hent og fjern fra boet', url:'https://www.google.no/search?q=bestill+boligtømming' },
                  ].map(({ label, desc, url }) => (
                    <button key={label} onClick={() => window.open(url, '_blank')} style={{
                      width:'100%', padding:'13px 16px', background:'#FBF9F5', border:'1px solid #D9CFC0',
                      borderRadius:'9px', cursor:'pointer', textAlign:'left', fontFamily:'Karla, sans-serif',
                      display:'flex', justifyContent:'space-between', alignItems:'center',
                    }}>
                      <div>
                        <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500' }}>{label}</div>
                        <div style={{ fontSize:'12px', color:'#9C8267', marginTop:'2px' }}>{desc}</div>
                      </div>
                      <span style={{ color:'#9C8267', fontSize:'16px' }}>›</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {item.interests.map(x => (
                <div key={x.id} style={{ display:'flex', gap:'14px', alignItems:'flex-start', padding:'14px 16px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'10px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:x.profiles?.avatar_color||'#DCE3D2', border:tc(x.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', color:tc(x.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
                    {(x.profiles?.display_name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'14px', color:'#3A2F26', marginBottom:'4px', fontWeight:'500' }}>
                      {x.profiles?.display_name}
                      {x.user_id === session.user.id && <span style={{ color:'#9C8267', fontSize:'12px', fontWeight:'400', marginLeft:'6px' }}>(deg)</span>}
                    </div>
                    {x.reason && <div style={{ fontSize:'13px', color:'#5C4530', fontStyle:'italic', lineHeight:1.6 }}>"{x.reason}"</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canDelete && (
          <div style={{ borderTop:'1px solid #E8DFD0', paddingTop:'16px' }}>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ background:'none', border:'none', color:'#8B3A3A', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif' }}>
                Slett gjenstand…
              </button>
            ) : (
              <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'13px', color:'#5C4530' }}>Er du sikker? Kan ikke angres.</span>
                <button onClick={handleDelete} style={{ padding:'7px 16px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif' }}>Slett</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ padding:'7px 16px', background:'none', border:'1px solid #D9CFC0', borderRadius:'6px', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif', color:'#5C4530' }}>Avbryt</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'24px' }}>
        <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>
          Kommentarer ({comments.length})
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'16px', maxHeight:'360px', overflowY:'auto' }}>
          {comments.length === 0 ? (
            <p style={{ color:'#9C8267', fontSize:'14px', fontStyle:'italic' }}>Ingen kommentarer ennå.</p>
          ) : comments.map(c => (
            <div key={c.id} style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:c.profiles?.avatar_color||'#DCE3D2', border:tc(c.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:tc(c.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
                {(c.profiles?.display_name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'10px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'13px', fontWeight:'500', color:'#3A2F26' }}>{c.profiles?.display_name}</span>
                  <span style={{ fontSize:'11px', color:'#9C8267' }}>{new Date(c.created_at).toLocaleDateString('nb-NO', { day:'numeric', month:'short' })}</span>
                </div>
                <p style={{ fontSize:'14px', color:'#5C4530', lineHeight:'1.6', margin:0 }}>{c.content}</p>
                {c.user_id === session.user.id && (
                  <button onClick={async () => { await deleteComment(c.id); load() }} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'12px', marginTop:'4px', fontFamily:'Karla, sans-serif' }}>slett</button>
                )}
              </div>
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:profile?.avatar_color||'#DCE3D2', border:tc(profile?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', color:tc(profile?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
            {(profile?.display_name||'?')[0].toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleComment()} }}
              placeholder="Skriv en kommentar… (Enter for å sende)" rows={2} maxLength={2000}
              style={{ width:'100%', padding:'10px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', fontFamily:'Karla, sans-serif', color:'#3A2F26', background:'#FBF9F5', resize:'none', outline:'none', boxSizing:'border-box' }} />
          </div>
          <button onClick={handleComment} disabled={!commentText.trim()||submittingComment} style={{
            padding:'10px 14px', background:commentText.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5',
            border:'none', borderRadius:'8px', cursor:commentText.trim()?'pointer':'not-allowed',
            fontSize:'14px', fontFamily:'Karla, sans-serif',
          }}>Send</button>
        </div>
      </div>
    </div>
  )
}
