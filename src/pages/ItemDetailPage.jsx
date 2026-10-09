import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getItem, removeInterest, getComments, addComment, deleteComment, getEstateMembers, supabase } from '../lib/supabase'
import { getPasses, addPass, removePass, addInterestClearingPass } from '../lib/decisions'
import { formatNOK, parseNOK } from '../lib/format'
import { removeImages, itemImageUrls } from '../lib/images'
import { L, locale } from '../lib/lang'
import { categoryLabel } from '../lib/categories'
import ReasonEditor from '../components/ReasonEditor'
import AnalysisDetails from '../components/AnalysisDetails'
import AiCorrectionsForm from '../components/AiCorrectionsForm'
import { withCorrections } from '../lib/aiCorrections'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export default function ItemDetailPage({ session, profile, onToast, isDemo }) {
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
  const [passes, setPasses] = useState([])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [suggestedValue, setSuggestedValue] = useState('')
  const [showSuggestInput, setShowSuggestInput] = useState(false)
  const [busy, setBusy] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const commentsEndRef = useRef(null)

  const load = async () => {
    const [{ data: it }, { data: cms }, { data: mems }, { data: mem }, ps] = await Promise.all([
      getItem(itemId),
      getComments(itemId),
      getEstateMembers(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
      getPasses([itemId]),
    ])
    setItem(it)
    setPasses(ps)
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
      .on('postgres_changes', { event:'*', schema:'public', table:'item_passes', filter:`item_id=eq.${itemId}` }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [itemId])

  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [comments.length])

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>
  if (!item) return <div style={{ padding:'80px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>{L('Gjenstand ikke funnet.', 'Item not found.')}</div>

  const cat = item.categories || { emoji:'', label:L('Annet', 'Other') }
  const myInterest = item.interests?.find(x => x.user_id === session.user.id)
  const myPass = passes.some(p => p.user_id === session.user.id)
  const isAssigned = item.status === 'assigned'
  const isAdmin = myRole === 'admin'
  const canEdit = !isDemo
  // Den som la inn gjenstanden kan slette den bare før den er tildelt (håndheves også i databasen)
  const canDelete = !isDemo && (isAdmin || (item.added_by === session.user.id && !item.assigned_to && item.status !== 'assigned'))
  // AI-ens identifikasjon kan rettes av administrator og den som la inn gjenstanden (håndheves i guard_item_update)
  const canCorrect = !isDemo && (isAdmin || item.added_by === session.user.id)
  const allImages = itemImageUrls(item)
  const assignedMember = members.find(m => m.user_id === item.assigned_to)

  // Kjører en handling én gang om gangen og viser feilen hvis den ikke gikk gjennom.
  const run = async (action, okMsg, errMsg) => {
    if (busy) return false
    setBusy(true)
    const { error } = (await action()) || {}
    setBusy(false)
    if (error) { onToast(errMsg, 'error'); return false }
    if (okMsg) onToast(okMsg)
    load()
    return true
  }

  // Rettelsene bygges på det som er lagret nå, så andre endringer i ai_analysis ikke går tapt
  const saveCorrections = async (values) => {
    const ok = await run(async () => {
      const { data, error } = await supabase.from('items').select('ai_analysis').eq('id', itemId).single()
      if (error) return { error }
      const next = withCorrections(data?.ai_analysis, values, session.user.id)
      return next ? supabase.from('items').update({ ai_analysis: next }).eq('id', itemId) : {}
    }, L('Rettelsene er lagret', 'Corrections saved'), L('Kunne ikke lagre rettelsene. Prøv igjen.', 'Could not save the corrections. Please try again.'))
    if (ok) setCorrecting(false)
  }

  const handleInterest = async () => {
    if (myInterest) { setShowWithdrawConfirm(true); return }
    if (!showReason) { setShowReason(true); return }
    const ok = await run(() => addInterestClearingPass(itemId, session.user.id, reason.trim()), L('Interesse registrert', 'Interest registered'), L('Kunne ikke registrere interessen. Prøv igjen.', 'Could not register your interest. Please try again.'))
    if (ok) { setShowReason(false); setReason('') }
  }

  const confirmWithdraw = async () => {
    const ok = await run(() => removeInterest(itemId, session.user.id), L('Interesse trukket tilbake', 'Interest withdrawn'), L('Kunne ikke trekke interessen. Prøv igjen.', 'Could not withdraw your interest. Please try again.'))
    if (ok) setShowWithdrawConfirm(false)
  }

  const handlePass = () => run(() => addPass(itemId, session.user.id), L('Registrert at du ikke skal ha denne', 'Noted that you do not want this'), L('Kunne ikke lagre. Prøv igjen.', 'Could not save. Please try again.'))

  const undoPass = () => run(() => removePass(itemId, session.user.id), L('Angret', 'Undone'), L('Kunne ikke angre. Prøv igjen.', 'Could not undo. Please try again.'))

  // Stemmene lagres på gjenstanden. Oppdateringen krever at tellerne er uendret siden vi leste dem,
  // så to som stemmer samtidig ikke overskriver hverandre; da leses gjenstanden på nytt.
  const handleEstimateVote = async (vote, suggested) => {
    if (busy) return
    const suggestedValue = parseNOK(suggested)
    if (vote === 'disagree' && suggested && suggestedValue === null) { onToast(L('Skriv estimatet som et beløp, f.eks. 1500', 'Enter the estimate as an amount, e.g. 1500'), 'error'); return }
    setBusy(true)
    let current = item
    for (let attempt = 0; attempt < 3; attempt++) {
      const voterIds = current.value_voter_ids || []
      if (voterIds.includes(session.user.id)) break
      const agreeBefore = current.value_agree_count || 0
      const disagreeBefore = current.value_disagree_count || 0
      const updateData = {
        value_agree_count: agreeBefore + (vote === 'agree' ? 1 : 0),
        value_disagree_count: disagreeBefore + (vote === 'disagree' ? 1 : 0),
        value_voter_ids: [...voterIds, session.user.id],
      }
      if (vote === 'disagree' && suggestedValue !== null) {
        updateData.value_suggestions = [...(current.value_suggestions || []), {
          user_id: session.user.id,
          name: profile?.display_name || L('Ukjent', 'Unknown'),
          value: suggestedValue,
        }]
      }
      let query = supabase.from('items').update(updateData).eq('id', itemId)
      query = current.value_agree_count == null ? query.is('value_agree_count', null) : query.eq('value_agree_count', agreeBefore)
      query = current.value_disagree_count == null ? query.is('value_disagree_count', null) : query.eq('value_disagree_count', disagreeBefore)
      const { data, error } = await query.select('id')
      if (error) { setBusy(false); onToast(L('Kunne ikke lagre stemmen. Prøv igjen.', 'Could not save your vote. Please try again.'), 'error'); return }
      if (data?.length) { setBusy(false); onToast(L('Stemme registrert', 'Vote registered')); load(); return }
      const { data: fresh } = await getItem(itemId)
      if (!fresh) break
      current = fresh
    }
    setBusy(false)
    load()
  }

  const handleComment = async () => {
    if (!commentText.trim()) return
    setSubmittingComment(true)
    const { error } = await addComment(itemId, session.user.id, commentText.trim())
    setSubmittingComment(false)
    if (error) { onToast(L('Kunne ikke lagre kommentaren. Prøv igjen.', 'Could not save the comment. Try again.'), 'error'); return }
    setCommentText(''); load()
  }

  const handleAssign = async (userId) => {
    const ok = await run(
      () => supabase.from('items').update({ assigned_to: userId, status: 'assigned' }).eq('id', itemId).neq('status', 'assigned'),
      L('Gjenstand tildelt', 'Item assigned'), L('Kunne ikke tildele. Bare administratorer kan tildele gjenstander.', 'Could not assign. Only administrators can assign items.'),
    )
    if (ok) setShowAssign(false)
  }

  const handleUnassign = () => run(
    () => supabase.from('items').update({ assigned_to: null, status: 'active' }).eq('id', itemId),
    L('Tildelingen er angret', 'The assignment has been undone'), L('Kunne ikke angre tildelingen.', 'Could not undo the assignment.'),
  )

  const handleDelete = async () => {
    if (busy) return
    setBusy(true)
    const { data, error } = await supabase.from('items').delete().eq('id', itemId).select('id')
    setBusy(false)
    if (error || !data?.length) { onToast(L('Kunne ikke slette gjenstanden. Bare admin og den som la den inn kan slette den.', 'Could not delete the item. Only an admin and the person who added it can delete it.'), 'error'); return }
    await removeImages(allImages)
    onToast(L('Gjenstand slettet', 'Item deleted'))
    navigate(`/estate/${id}`)
  }

  return (
    <div style={{ maxWidth:'700px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
        <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>
          {L('← Tilbake', '← Back')}
        </button>
        {canEdit && <button onClick={() => navigate(`/estate/${id}/item/${itemId}/edit`)} style={{ background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', color:'#5C4530', cursor:'pointer', fontSize:'0.8125rem', padding:'6px 14px', fontFamily:'Karla, sans-serif', marginBottom:'16px' }}>
          {L('Rediger', 'Edit')}
        </button>}
      </div>

      {/* Image carousel */}
      {allImages.length > 0 ? (
        <div style={{ marginBottom:'24px', position:'relative' }}>
          <div style={{ background:'#E8DFD0', borderRadius:'14px', height:'280px', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
            <img src={allImages[currentImageIndex]} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'contain' }} />
            {allImages.length > 1 && currentImageIndex > 0 && (
              <button onClick={() => setCurrentImageIndex(i => i-1)} style={{ position:'absolute', left:'8px', top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', borderRadius:'50%', width:'40px', height:'40px', fontSize:'1.375rem', cursor:'pointer' }}>‹</button>
            )}
            {allImages.length > 1 && currentImageIndex < allImages.length-1 && (
              <button onClick={() => setCurrentImageIndex(i => i+1)} style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', background:'rgba(0,0,0,0.5)', color:'#fff', border:'none', borderRadius:'50%', width:'40px', height:'40px', fontSize:'1.375rem', cursor:'pointer' }}>›</button>
            )}
            {allImages.length > 1 && (
              <div style={{ position:'absolute', bottom:'8px', right:'12px', background:'rgba(0,0,0,0.5)', color:'#fff', fontSize:'0.75rem', padding:'3px 8px', borderRadius:'20px' }}>
                {currentImageIndex+1} / {allImages.length}
              </div>
            )}
          </div>
          {allImages.length > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:'0', marginTop:'6px' }}>
              {allImages.map((_, i) => (
                <button key={i} onClick={() => setCurrentImageIndex(i)} aria-label={L(`Bilde ${i + 1}`, `Photo ${i + 1}`)} aria-pressed={i===currentImageIndex} style={{ minWidth:'32px', height:'32px', border:'none', background:'none', cursor:'pointer', padding:0, display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ display:'block', width: i===currentImageIndex?'20px':'10px', height:'10px', borderRadius:'5px', background: i===currentImageIndex?'#3A2F26':'#9A8B78', transition:'all 0.2s' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background:'#E8DFD0', borderRadius:'14px', height:'280px', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'24px' }}>
          <span style={{ fontSize:'3rem', color:'#75604B' }}>{cat.emoji || '·'}</span>
        </div>
      )}

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'28px', marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'8px' }}>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'1.5rem', fontWeight:'400', color:'#3A2F26', margin:0 }}>{item.title}</h1>
          <span style={{ fontSize:'0.75rem', color:'#75604B', background:'#E8DFD0', padding:'4px 12px', borderRadius:'20px', marginLeft:'12px', whiteSpace:'nowrap' }}>{categoryLabel(cat.label)}</span>
        </div>
        <p style={{ color:'#75604B', fontSize:'0.8125rem', marginBottom:'8px' }}>
          {L('Lagt inn av', 'Added by')} {item.added_by_name || L('ukjent', 'unknown')} · {new Date(item.created_at).toLocaleDateString(locale(), { day:'numeric', month:'long', year:'numeric' })}
        </p>
        {item.estimated_value && (() => {
          const voterIds = item.value_voter_ids || []
          const hasVoted = voterIds.includes(session.user.id)
          const totalVotes = (item.value_agree_count || 0) + (item.value_disagree_count || 0)
          const suggestions = item.value_suggestions || []
          return (
            <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
              <div style={{ fontSize:'0.75rem', color:'#3A5A30', fontWeight:'500', marginBottom:'4px' }}>{L('Verdiestimat', 'Value estimate')}</div>
              <div style={{ fontSize:'1.25rem', color:'#3A2F26', fontFamily:'Fraunces, serif', marginBottom:'8px' }}>
                {formatNOK(item.estimated_value)}
              </div>
              {item.estimate_reasoning && (
                <p style={{ fontSize:'0.75rem', color:'#5C4530', lineHeight:'1.5', marginBottom:'8px', marginTop:'-2px' }}>
                  {item.estimate_reasoning}
                </p>
              )}
              {item.estimate_confidence === 'low' && (
                <div style={{ fontSize:'0.75rem', color:'#7A5A2A', background:'#FBF0DC', border:'1px solid #E8D4A0', borderRadius:'7px', padding:'8px 10px', marginBottom:'8px' }}>
                  {L(
                    'Estimatet er usikkert — gjenstanden kan ha spesiell verdi. Sjekk gjerne på Finn.no eller spør en fagperson.',
                    'The estimate is uncertain — the item may have special value. Consider checking on Finn.no or asking an expert.'
                  )}
                </div>
              )}
              {totalVotes > 0 && (
                <div style={{ fontSize:'0.75rem', color:'#5C4530', marginBottom:'8px' }}>
                  {L('Enig', 'Agree')}: {item.value_agree_count || 0} · {L('Uenig', 'Disagree')}: {item.value_disagree_count || 0} ({totalVotes} {totalVotes === 1 ? L('stemme', 'vote') : L('stemmer', 'votes')})
                </div>
              )}
              {suggestions.length > 0 && (
                <div style={{ fontSize:'0.75rem', color:'#5C4530', marginBottom:'8px' }}>
                  {suggestions.map((s, i) => (
                    <div key={i}>{s.name} {L('foreslår', 'suggests')} {formatNOK(s.value)}</div>
                  ))}
                </div>
              )}
              {isDemo ? null : !hasVoted ? (
                <div>
                  <div style={{ display:'flex', gap:'6px', marginBottom: showSuggestInput ? '8px' : '0' }}>
                    <button onClick={() => { handleEstimateVote('agree'); setShowSuggestInput(false) }} style={{
                      flex:1, padding:'8px', border:'1px solid #B8C8A8', borderRadius:'7px',
                      background:'#5F6E52', cursor:'pointer', fontSize:'0.8125rem', color:'#fff', fontFamily:'Karla, sans-serif',
                    }}>{L('Enig', 'Agree')}</button>
                    <button onClick={() => setShowSuggestInput(!showSuggestInput)} style={{
                      flex:1, padding:'8px', border:'1px solid #B8C8A8', borderRadius:'7px',
                      background: showSuggestInput ? '#A97C3F' : '#fff', cursor:'pointer', fontSize:'0.8125rem',
                      color: showSuggestInput ? '#fff' : '#3A2F26', fontFamily:'Karla, sans-serif',
                    }}>{L('Uenig', 'Disagree')}</button>
                  </div>
                  {showSuggestInput && (
                    <div style={{ display:'flex', gap:'6px', marginTop:'8px' }}>
                      <input
                        inputMode="numeric"
                        value={suggestedValue}
                        onChange={e => setSuggestedValue(e.target.value)}
                        placeholder={L('Ditt estimat (NOK)', 'Your estimate (NOK)')}
                        style={{ flex:1, padding:'8px 12px', border:'1px solid #B8C8A8', borderRadius:'7px', fontSize:'0.875rem', background:'#fff', color:'#3A2F26', fontFamily:'Karla, sans-serif' }}
                      />
                      <button onClick={() => { handleEstimateVote('disagree', suggestedValue); setShowSuggestInput(false); setSuggestedValue('') }} style={{
                        padding:'8px 14px', background:'#A97C3F', color:'#fff', border:'none', borderRadius:'7px',
                        cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap',
                      }}>{L('Send inn', 'Submit')}</button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize:'0.75rem', color:'#5C4530' }}>{L('Du har stemt.', 'You have voted.')}</div>
              )}
            </div>
          )
        })()}
        {item.description && <p style={{ color:'#5C4530', lineHeight:'1.8', marginBottom:'24px', fontSize:'0.9375rem' }}>{item.description}</p>}

        {/* AI-vurderingen fra da gjenstanden ble lagt inn: bare til opplysning, adskilt fra det som er registrert */}
        {item.ai_analysis?.ai && (
          <details style={{ marginBottom:'24px', background:'#FBF9F5', border:'1px solid #E8DFD0', borderRadius:'10px', padding:'0 14px' }}>
            <summary style={{ cursor:'pointer', fontSize:'0.875rem', color:'#5C4530', padding:'12px 0', minHeight:'44px', boxSizing:'border-box' }}>{L('Hva AI-en så', 'What the AI saw')}</summary>
            <div style={{ paddingBottom:'14px' }}>
              {correcting ? (
                <AiCorrectionsForm record={item.ai_analysis} saving={busy} onSave={saveCorrections} onCancel={() => setCorrecting(false)} />
              ) : (
                <>
                  <AnalysisDetails analysis={item.ai_analysis} heading={false} />
                  {canCorrect && (
                    <button onClick={() => setCorrecting(true)} style={{ marginTop:'12px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', color:'#5C4530', cursor:'pointer', fontSize:'0.8125rem', padding:'10px 14px', minHeight:'44px', fontFamily:'Karla, sans-serif' }}>
                      {L('Rett opplysningene', 'Correct the details')}
                    </button>
                  )}
                </>
              )}
            </div>
          </details>
        )}

        {isAssigned ? (
          <div style={{ padding:'16px', background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', marginBottom:'24px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
            <div style={{ fontSize:'0.875rem', color:'#3A2F26', fontWeight:'500' }}>
              {L('Tildelt', 'Assigned to')} {assignedMember?.user_id === session.user.id ? L('deg', 'you') : assignedMember?.profiles?.display_name || L('en arving', 'an heir')}
            </div>
            {isAdmin && (
              <button onClick={handleUnassign} disabled={busy} style={{ fontSize:'0.8125rem', color:'#5C4530', background:'#fff', border:'1px solid #B8C8A8', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontFamily:'Karla, sans-serif' }}>
                {L('Angre tildeling', 'Undo assignment')}
              </button>
            )}
          </div>
        ) : showWithdrawConfirm ? (
          <div style={{ padding:'18px', background:'#E8DFD0', border:'1px solid #C8BEA0', borderRadius:'10px', marginBottom:'24px' }}>
            <div style={{ fontSize:'0.9375rem', color:'#3A2F26', marginBottom:'12px', fontWeight:'500' }}>{L('Vil du angre interessen din?', 'Do you want to withdraw your interest?')}</div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setShowWithdrawConfirm(false)} style={{ flex:1, padding:'11px', background:'#fff', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif', color:'#5C4530' }}>{L('Nei, behold', 'No, keep it')}</button>
              <button onClick={confirmWithdraw} disabled={busy} style={{ flex:1, padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Ja, angre', 'Yes, withdraw')}</button>
            </div>
          </div>
        ) : myInterest ? (
          <div style={{ marginBottom:'24px' }}>
            <button onClick={handleInterest} style={{ width:'100%', padding:'14px', background:'#E8DFD0', color:'#3A2F26', border:'1px solid #3A2F26', borderRadius:'10px', cursor:'pointer', fontSize:'0.9375rem', fontFamily:'Karla, sans-serif', marginBottom:'10px' }}>
              {L('Du er interessert — klikk for å angre', 'You are interested — click to withdraw')}
            </button>
            <ReasonEditor key={itemId} itemId={itemId} userId={session.user.id} savedReason={myInterest.reason || null}
              onToast={onToast} onSaved={load} />
          </div>
        ) : showReason ? (
          <div style={{ marginBottom:'24px' }}>
            <label htmlFor="itemdetail-f1" style={{ display:'block', fontSize:'0.875rem', color:'#5C4530', marginBottom:'10px' }}>{L('Hvorfor vil du ha denne?', 'Why do you want this?')} <span style={{ color:'#75604B' }}>{L('(valgfri)', '(optional)')}</span></label>
            <textarea id="itemdetail-f1" value={reason} onChange={e => setReason(e.target.value)} placeholder={L('f.eks. Jeg husker denne fra barndommen…', 'e.g. I remember this from my childhood…')} rows={3} maxLength={1000}
              style={{ width:'100%', padding:'12px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', fontFamily:'Karla, sans-serif', color:'#3A2F26', background:'#FBF9F5', resize:'vertical', boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:'10px', marginTop:'10px' }}>
              <button onClick={() => setShowReason(false)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={handleInterest} disabled={busy} style={{ flex:2, padding:'11px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Registrer interesse', 'Register interest')}</button>
            </div>
          </div>
        ) : myPass ? (
          <button onClick={undoPass} disabled={busy} style={{ width:'100%', padding:'14px', background:'#FBF9F5', color:'#5C4530', border:'1px solid #D9CFC0', borderRadius:'10px', cursor:'pointer', fontSize:'0.9375rem', fontFamily:'Karla, sans-serif', marginBottom:'24px' }}>
            {L('Du skal ikke ha denne — klikk for å angre', 'You do not want this — click to undo')}
          </button>
        ) : (
          <div style={{ display:'flex', gap:'10px', marginBottom:'24px' }}>
            <button onClick={handleInterest} style={{ flex:2, padding:'14px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'10px', cursor:'pointer', fontSize:'0.9375rem', fontFamily:'Karla, sans-serif' }}>
              {L('Registrer interesse', 'Register interest')}
            </button>
            <button onClick={handlePass} disabled={busy} style={{ flex:1, padding:'14px', background:'#fff', color:'#5C4530', border:'1px solid #D9CFC0', borderRadius:'10px', cursor:'pointer', fontSize:'0.9375rem', fontFamily:'Karla, sans-serif' }}>
              {L('Ikke interessert', 'Not interested')}
            </button>
          </div>
        )}

        <div style={{ borderTop:'1px solid #E8DFD0', paddingTop:'20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
            <h3 style={{ fontSize:'0.8125rem', color:'#75604B', fontWeight:'400', textTransform:'uppercase', letterSpacing:'1px' }}>
              {L('Interesserte', 'Interested')} ({item.interests?.length || 0})
            </h3>
            {isAdmin && !isAssigned && item.interests?.length > 0 && (
              <button onClick={() => setShowAssign(!showAssign)} style={{ fontSize:'0.8125rem', color:'#5F6E52', background:'none', border:'1px solid #B8C8A8', padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontFamily:'Karla, sans-serif' }}>
                {L('Tildel', 'Assign')}
              </button>
            )}
          </div>
          {showAssign && (
            <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
              <p style={{ fontSize:'0.8125rem', color:'#5C4530', marginBottom:'12px' }}>{L('Hvem får denne?', 'Who gets this?')}</p>
              {members.map(m => (
                <button key={m.user_id} onClick={() => handleAssign(m.user_id)} disabled={busy} style={{ display:'flex', alignItems:'center', gap:'10px', width:'100%', padding:'10px 14px', background:'#fff', border:'1px solid #B8C8A8', borderRadius:'8px', cursor:'pointer', textAlign:'left', fontFamily:'Karla, sans-serif', marginBottom:'6px' }}>
                  <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:m.profiles?.avatar_color||'#DCE3D2', border:tc(m.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', color:tc(m.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500' }}>
                    {(m.profiles?.display_name||'?')[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize:'0.875rem', color:'#3A2F26' }}>{m.profiles?.display_name}</span>
                  {item.interests?.some(x => x.user_id===m.user_id) && <span style={{ fontSize:'0.6875rem', color:'#5F6E52', marginLeft:'auto' }}>{L('interessert', 'interested')}</span>}
                </button>
              ))}
            </div>
          )}
          {!item.interests?.length ? (
            <div>
              <p style={{ color:'#75604B', fontSize:'0.875rem', fontStyle:'italic', marginBottom:'16px' }}>{L('Ingen har vist interesse ennå.', 'No one has shown interest yet.')}</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {item.interests.map(x => (
                <div key={x.id} style={{ display:'flex', gap:'14px', alignItems:'flex-start', padding:'14px 16px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'10px' }}>
                  <div style={{ width:'36px', height:'36px', borderRadius:'50%', background:x.profiles?.avatar_color||'#DCE3D2', border:tc(x.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.875rem', color:tc(x.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
                    {(x.profiles?.display_name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'0.875rem', color:'#3A2F26', marginBottom:'4px', fontWeight:'500' }}>
                      {x.profiles?.display_name}
                      {x.user_id === session.user.id && <span style={{ color:'#75604B', fontSize:'0.75rem', fontWeight:'400', marginLeft:'6px' }}>{L('(deg)', '(you)')}</span>}
                    </div>
                    {x.reason && <div style={{ fontSize:'0.8125rem', color:'#5C4530', fontStyle:'italic', lineHeight:1.6 }}>"{x.reason}"</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canDelete && (
          <div style={{ borderTop:'1px solid #E8DFD0', paddingTop:'16px' }}>
            {!showDeleteConfirm ? (
              <button onClick={() => setShowDeleteConfirm(true)} style={{ background:'none', border:'none', color:'#8B3A3A', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif' }}>
                {L('Slett gjenstand…', 'Delete item…')}
              </button>
            ) : (
              <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:'0.8125rem', color:'#5C4530' }}>{L('Er du sikker? Kan ikke angres.', 'Are you sure? This cannot be undone.')}</span>
                <button onClick={handleDelete} disabled={busy} style={{ padding:'7px 16px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif' }}>{L('Slett', 'Delete')}</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ padding:'7px 16px', background:'none', border:'1px solid #D9CFC0', borderRadius:'6px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', color:'#5C4530' }}>{L('Avbryt', 'Cancel')}</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'14px', padding:'24px' }}>
        <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'1.125rem', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>
          {L('Kommentarer', 'Comments')} ({comments.length})
        </h3>
        <div style={{ display:'flex', flexDirection:'column', gap:'12px', marginBottom:'16px', maxHeight:'360px', overflowY:'auto' }}>
          {comments.length === 0 ? (
            <p style={{ color:'#75604B', fontSize:'0.875rem', fontStyle:'italic' }}>{L('Ingen kommentarer ennå.', 'No comments yet.')}</p>
          ) : comments.map(c => (
            <div key={c.id} style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
              <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:c.profiles?.avatar_color||'#DCE3D2', border:tc(c.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:tc(c.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
                {(c.profiles?.display_name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1, background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'10px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'0.8125rem', fontWeight:'500', color:'#3A2F26' }}>{c.profiles?.display_name}</span>
                  <span style={{ fontSize:'0.6875rem', color:'#75604B' }}>{new Date(c.created_at).toLocaleDateString(locale(), { day:'numeric', month:'short' })}</span>
                </div>
                <p style={{ fontSize:'0.875rem', color:'#5C4530', lineHeight:'1.6', margin:0 }}>{c.content}</p>
                {c.user_id === session.user.id && !isDemo && (
                  <button onClick={async () => {
                    const { error } = await deleteComment(c.id)
                    if (error) onToast(L('Kunne ikke slette kommentaren', 'Could not delete the comment'), 'error')
                    load()
                  }} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.75rem', marginTop:'4px', fontFamily:'Karla, sans-serif' }}>{L('slett', 'delete')}</button>
                )}
              </div>
            </div>
          ))}
          <div ref={commentsEndRef} />
        </div>
        {isDemo ? (
          <p style={{ color:'#75604B', fontSize:'0.8125rem', fontStyle:'italic' }}>{L('Kommentarer er slått av i demoen.', 'Comments are turned off in the demo.')}</p>
        ) : (
        <div style={{ display:'flex', gap:'8px', alignItems:'flex-end' }}>
          <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:profile?.avatar_color||'#DCE3D2', border:tc(profile?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:tc(profile?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
            {(profile?.display_name||'?')[0].toUpperCase()}
          </div>
          <div style={{ flex:1 }}>
            {/* Mobil: feltet får 16px skrift (index.html), så plassholderen trenger tre linjer */}
            <style>{`@media (max-width: 600px) { .comment-input { min-height: 80px; } }`}</style>
            <textarea className="comment-input" value={commentText} onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleComment()} }}
              placeholder={L('Skriv en kommentar… (Enter for å sende)', 'Write a comment… (Enter to send)')} rows={2} maxLength={2000}
              style={{ width:'100%', padding:'10px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', fontFamily:'Karla, sans-serif', color:'#3A2F26', background:'#FBF9F5', resize:'none', boxSizing:'border-box' }} />
          </div>
          <button onClick={handleComment} disabled={!commentText.trim()||submittingComment} style={{
            padding:'10px 14px', background:commentText.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5',
            border:'none', borderRadius:'8px', cursor:commentText.trim()?'pointer':'not-allowed',
            fontSize:'0.875rem', fontFamily:'Karla, sans-serif',
          }}>Send</button>
        </div>
        )}
      </div>
    </div>
  )
}
