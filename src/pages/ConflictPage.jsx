import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getItems } from '../lib/supabase'
import { loadStatusExtras } from '../lib/decisions'
import { getUndecided, isContested } from '../lib/estateProgress'
import { parseNOK, formatNOK as formatAmount } from '../lib/format'
import { L } from '../lib/lang'
import { equalValueResolutions, itemsWithoutValue, valueTotal, confirmedWeights, aiEstimate, itemValue } from '../lib/distribution'
import StoredImage from '../components/StoredImage'
import { assignItems, drawLot } from '../lib/assignments'
import TalkFirstList from '../components/TalkFirstList'
import { makeNameOf } from '../lib/eventText'

const PALETTE = ['#5F6E52','#8B9A7D','#A97C3F','#7A8B6E','#9C8267','#6E8B87']

function Avatar({ name, color, size = 32 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color || '#9C8267', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, color: '#fff', fontWeight: '600',
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

// null når gjenstanden ikke har en verdi som kan leses som kroner
const formatNOK = (v) => (parseNOK(v) === null ? null : formatAmount(v))

export default function ConflictPage({ session, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [members, setMembers] = useState([])
  const [mode, setMode] = useState('lottery')
  const [resolutions, setResolutions] = useState({})
  const [animating, setAnimating] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [snakeOrderIds, setSnakeOrderIds] = useState([])
  const [snakePos, setSnakePos] = useState(0)
  const [draftStarted, setDraftStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [undecided, setUndecided] = useState([])
  const [assignedItems, setAssignedItems] = useState([])
  const [allItems, setAllItems] = useState([])
  const [heirs, setHeirs] = useState([])
  const [estate, setEstate] = useState(null)
  const [settingValues, setSettingValues] = useState(false)
  const [withdrawn, setWithdrawn] = useState({}) // «Trekk ønsket mitt»: itemId → begrunnelse, til angring
  const [myRole, setMyRole] = useState('member')

  const load = async () => {
    const [{ data: its }, extras, { data: mem }, { data: est }] = await Promise.all([
      getItems(id),
      loadStatusExtras(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).maybeSingle(),
      supabase.from('estates').select('split_mode, shares_confirmed').eq('id', id).maybeSingle(),
    ])
    setHeirs(extras.heirs)
    setEstate(est || null)
    const ms = extras.members
    const memberIds = new Set(ms.map(m => m.user_id))
    // Interesser fra tidligere medlemmer teller ikke med i fordelingen
    const all = (its || []).map(i => ({ ...i, interests: (i.interests || []).filter(x => memberIds.has(x.user_id)) }))
    setItems(all.filter(isContested))
    setAssignedItems(all.filter(i => i.status === 'assigned'))
    setAllItems(all)
    setMembers(ms)
    setMyRole(mem?.role || 'member')
    setUndecided(getUndecided(all, ms, extras.passes, extras.heirs))
    setSnakeOrderIds(ms.map(m => m.user_id))
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const getMember = (userId) => members.find(m => m.user_id === userId)
  const nameOf = makeNameOf(members)
  const memberColor = (userId) => PALETTE[members.findIndex(m => m.user_id === userId) % PALETTE.length]

  // Det hver arving allerede har fått tildelt, er utgangspunktet for den jevne fordelingen.
  // Ukjent verdi er ikke 0 (src/lib/distribution.js): mangler noe verdi, regnes ikke jevn fordeling ut
  const alreadyAssigned = (userId) => valueTotal(assignedItems.filter(i => i.assigned_to === userId))
  const missingValues = itemsWithoutValue(items, assignedItems)
  // Bekreftede arveandeler (src/lib/distribution.js): ellers lik deling
  const weights = confirmedWeights(heirs, estate)
  const computeEqualResolutions = () => equalValueResolutions(items, members.map(m => m.user_id), assignedItems, weights)
  const canUseAi = missingValues.filter(i => aiEstimate(i) !== null)

  useEffect(() => {
    if (mode === 'equal' && items.length && members.length) {
      setResolutions(computeEqualResolutions())
    } else if (mode !== 'equal') {
      setResolutions({})
      setSnakePos(0)
      setDraftStarted(false)
    }
  }, [mode, items, assignedItems, members, heirs, estate])

  // «Bruk AI-anslaget som fordelingsverdi» for gjenstandene som mangler fordelingsverdi (administrator, logges)
  const useAiAsValue = async () => {
    setSettingValues(true)
    const { error } = await supabase.rpc('set_agreed_values', { p_estate: id, p_values: canUseAi.map(i => ({ item_id: i.id, value: aiEstimate(i), source: 'ai' })) })
    setSettingValues(false)
    if (error) { onToast(L('Kunne ikke sette fordelingsverdiene. Prøv igjen.', 'Could not set the distribution values. Please try again.'), 'error'); return }
    onToast(L('AI-anslagene er brukt som foreslått fordelingsverdi', 'The AI estimates are used as the proposed distribution value'))
    load()
  }

  const drawLottery = async (item) => {
    if (animating) return
    const interested = (item.interests || []).map(x => x.user_id)
    setAnimating(item.id)
    for (let i = 3; i >= 1; i--) {
      setCountdown(i)
      await new Promise(r => setTimeout(r, 450))
    }
    setCountdown('!')
    // Loddet trekkes av databasen blant dem som ønsker gjenstanden, og trekningen logges (også om den gjøres på nytt)
    const [{ data, error }] = await Promise.all([drawLot(item.id), new Promise(r => setTimeout(r, 350))])
    if (error || !data?.winner || !interested.includes(data.winner)) {
      onToast(L('Kunne ikke trekke lodd. Prøv igjen.', 'Could not draw lots. Please try again.'), 'error')
    } else {
      setResolutions(prev => ({ ...prev, [item.id]: data.winner }))
    }
    setAnimating(null)
    setCountdown(null)
  }

  const drawAll = async () => {
    for (const item of items.filter(i => !resolutions[i.id])) {
      await drawLottery(item)
      await new Promise(r => setTimeout(r, 200))
    }
  }

  const getSnakeUser = (pos) => {
    if (!snakeOrderIds.length) return null
    const n = snakeOrderIds.length
    const round = Math.floor(pos / n)
    const posInRound = pos % n
    const order = round % 2 === 0 ? snakeOrderIds : [...snakeOrderIds].reverse()
    return order[posInRound]
  }

  const wantsAny = (userId, list) => list.some(i => i.interests?.some(x => x.user_id === userId))

  // Neste plass i rekkefølgen der arvingen fortsatt vil ha noe av det som er igjen.
  const nextPickPos = (fromPos, unclaimed) => {
    for (let pos = fromPos; pos < fromPos + snakeOrderIds.length; pos++) {
      if (wantsAny(getSnakeUser(pos), unclaimed)) return pos
    }
    return fromPos
  }

  const currentSnakeUser = getSnakeUser(snakePos)
  const unclaimedItems = items.filter(i => !resolutions[i.id])
  const resolvedCount = Object.keys(resolutions).length
  const allResolved = items.length > 0 && resolvedCount === items.length

  // Man kan bare velge blant gjenstandene man selv har vist interesse for.
  const snakePick = (itemId) => {
    const item = unclaimedItems.find(i => i.id === itemId)
    if (!currentSnakeUser || !item?.interests?.some(x => x.user_id === currentSnakeUser)) return
    setResolutions(prev => ({ ...prev, [itemId]: currentSnakeUser }))
    setSnakePos(nextPickPos(snakePos + 1, unclaimedItems.filter(i => i.id !== itemId)))
  }

  const shuffleSnake = () => {
    setSnakeOrderIds(prev => {
      const arr = [...prev]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
  }

  // Alt tildeles i én transaksjon i databasen, med metoden logget. Gjenstander som en annen har tildelt
  // i mellomtiden, hoppes over. Etter loddtrekning må tildelingen være lik databasens trekning.
  const apply = async () => {
    setApplying(true)
    const list = Object.entries(resolutions).map(([item_id, user_id]) => ({ item_id, user_id }))
    const { data, error } = await assignItems(id, list, mode)
    const count = error ? 0 : data?.assigned || 0
    const failed = list.length - count
    setApplying(false)
    if (failed) onToast(L(`${count} tildelt. ${failed} kunne ikke tildeles – de kan allerede være tildelt.`, `${count} assigned. ${failed} could not be assigned – they may already be assigned.`), 'error')
    else onToast(L(`${count} ${count === 1 ? 'gjenstand' : 'gjenstander'} tildelt`, `${count} ${count === 1 ? 'item' : 'items'} assigned`))
    navigate(`/estate/${id}`)
  }

  const memberTotals = members.map((m, i) => {
    const mine = items.filter(it => resolutions[it.id] === m.user_id)
    const earlier = alreadyAssigned(m.user_id)
    const now = valueTotal(mine)
    return { ...m, color: PALETTE[i % PALETTE.length], assignedItems: mine, earlier: earlier.sum, total: earlier.sum + now.sum, unknown: earlier.unknown + now.unknown }
  })

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  if (undecided.length) {
    const meMissing = undecided.some(u => u.member.user_id === session.user.id)
    return (
      <div style={{ maxWidth:'560px', margin:'0 auto', padding:'28px 16px 60px', fontFamily:'Karla, sans-serif' }}>
        <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
        <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'1.625rem', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Løsningsmetoder', 'Resolution methods')}</h1>
        <p style={{ color:'#5C4530', fontSize:'0.875rem', lineHeight:1.6, marginBottom:'24px' }}>
          {L(
            'Løsningsmetodene kan brukes når alle arvingene har tatt stilling til hver gjenstand — enten vist interesse eller sagt at de ikke skal ha den.',
            'The resolution methods can be used once all heirs have decided on every item — either shown interest or said they do not want it.',
          )}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', marginBottom:'24px' }}>
          {undecided.map(({ member, items: missing }) => {
            const isMe = member.user_id === session.user.id
            const name = isMe ? L('Du', 'You') : (member.profiles?.display_name || L('En arving', 'An heir'))
            return (
              <div key={member.user_id} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
                  <Avatar name={member.profiles?.display_name} color={memberColor(member.user_id)} size={28} />
                  <div style={{ fontSize:'0.875rem', color:'#3A2F26' }}>
                    <strong style={{ fontWeight:'500' }}>{name}</strong> {L(
                      `mangler å vise interesse eller si nei takk til ${missing.length} ${missing.length === 1 ? 'gjenstand' : 'gjenstander'}`,
                      `${isMe ? 'have' : 'has'} yet to show interest or say no thanks to ${missing.length} ${missing.length === 1 ? 'item' : 'items'}`,
                    )}
                  </div>
                </div>
                <div style={{ fontSize:'0.75rem', color:'#75604B', lineHeight:1.5, paddingLeft:'38px' }}>
                  {missing.slice(0, 5).map(i => i.title).join(', ')}{missing.length > 5 ? L(` og ${missing.length - 5} til`, ` and ${missing.length - 5} more`) : ''}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          {meMissing && (
            <button onClick={() => navigate(`/estate/${id}/swipe`)} style={{ flex:'1 1 200px', padding:'12px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
              {L('Ta stilling til dine gjenstander', 'Decide on your items')}
            </button>
          )}
          <button onClick={() => navigate(`/estate/${id}/status`)} style={{ flex:'1 1 200px', padding:'12px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
            {L('Se hva som gjenstår', 'See what remains')}
          </button>
        </div>
      </div>
    )
  }

  const talkFirst = <TalkFirstList items={items} allItems={allItems} nameOf={nameOf} myUserId={session.user.id} estateId={id} onChanged={load} onToast={onToast} withdrawn={withdrawn} setWithdrawn={setWithdrawn} />

  if (!items.length && Object.keys(withdrawn).length) return (
    <div style={{ maxWidth:'560px', margin:'0 auto', padding:'28px 16px 60px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <p style={{ color:'#5C4530', fontSize:'0.875rem', lineHeight:1.6, marginBottom:'16px' }}>{L('Ingen gjenstander ønskes av flere lenger.', 'No items are wanted by several people any more.')}</p>
      {talkFirst}
    </div>
  )

  if (!items.length) return (
    <div style={{ maxWidth:'560px', margin:'0 auto', padding:'60px 16px', textAlign:'center', fontFamily:'Karla, sans-serif' }}>
      <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'1.5rem', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Ingen konflikter', 'No conflicts')}</h2>
      <p style={{ color:'#75604B', marginBottom:'24px' }}>{L('Alle gjenstander har høyst én interessert arving — ingen konflikter å løse!', 'Every item has at most one interested heir — no conflicts to resolve!')}</p>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ padding:'11px 24px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
    </div>
  )

  if (myRole !== 'admin') return (
    <div style={{ maxWidth:'560px', margin:'0 auto', padding:'28px 16px 60px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'1.625rem', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Løsningsmetoder', 'Resolution methods')}</h1>
      <p style={{ color:'#5C4530', fontSize:'0.875rem', lineHeight:1.6, marginBottom:'24px' }}>
        {L('Alle har tatt stilling. Det er administratoren av boet som gjennomfører loddtrekning eller fordeling, gjerne mens dere er samlet.', 'Everyone has decided. The estate administrator carries out the draw or distribution, ideally while you are together.')}
      </p>
      {talkFirst}
    </div>
  )

  return (
    <div className="cf-page" style={{ maxWidth:'920px', margin:'0 auto', padding:'28px 16px 80px', fontFamily:'Karla, sans-serif' }}>
      <style>{`@media (max-width: 600px) {
        .cf-page { padding-bottom: 170px !important; }
        .cf-modes { grid-template-columns: 1fr !important; gap: 8px !important; }
        .cf-action { flex-basis: 100% !important; text-align: left !important; }
        .cf-action > button { width: 100%; }
        .cf-winner { justify-content: flex-start !important; }
        .cf-pick-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
        .cf-apply { width: 100%; }
      }`}</style>

      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 16px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'1.625rem', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{L('Løsningsmetoder', 'Resolution methods')}</h1>
          <p style={{ color:'#75604B', fontSize:'0.875rem' }}>{L(`${items.length} gjenstander med overlappende interesser`, `${items.length} ${items.length === 1 ? 'item' : 'items'} with overlapping interests`)}</p>
        </div>
        <div style={{ background:resolvedCount===items.length?'#DCE3D2':'#E8DFD0', border:`1px solid ${resolvedCount===items.length?'#B8C8A8':'#C8BEA0'}`, borderRadius:'8px', padding:'8px 16px', fontSize:'0.8125rem', color:resolvedCount===items.length?'#3A5A30':'#5C4530' }}>
          {L(`${resolvedCount} av ${items.length} løst`, `${resolvedCount} of ${items.length} resolved`)}
        </div>
      </div>

      {/* Mode selector */}
      <details open style={{ marginBottom:'24px' }}>
        <summary style={{ cursor:'pointer', fontSize:'0.875rem', color:'#5C4530', padding:'10px 0', minHeight:'44px', boxSizing:'border-box' }}>
          {L(`Snakk sammen først: begrunnelsene for ${items.length} ${items.length === 1 ? 'gjenstand' : 'gjenstander'}`, `Talk first: the reasons for ${items.length} ${items.length === 1 ? 'item' : 'items'}`)}
        </summary>
        {talkFirst}
      </details>
      <div className="cf-modes" style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'10px', marginBottom:'28px' }}>
        {[
          { id: 'lottery', title: L('Loddtrekning', 'Lottery'), desc: L('Tilfeldig trekk per gjenstand — rettferdig for emosjonelle gjenstander', 'Random draw per item — fair for sentimental items') },
          { id: 'snake', title: L('Vekslende runder', 'Alternating rounds'), desc: L('Arvingene velger én gjenstand hver, på omgang', 'Heirs take turns choosing one item each') },
          { id: 'equal', title: L('Jevn verdifordeling', 'Even value split'), desc: L('Algoritme balanserer total NOK-verdi per arving', 'An algorithm balances the total NOK value per heir') },
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding:'16px', border:`2px solid ${mode===m.id?'#3A2F26':'#D9CFC0'}`,
            borderRadius:'12px', cursor:'pointer', textAlign:'left',
            background:mode===m.id?'#3A2F26':'#fff',
            color:mode===m.id?'#FBF9F5':'#3A2F26',
            fontFamily:'Karla, sans-serif', transition:'all 0.15s',
          }}>
            <div style={{ fontSize:'0.8125rem', fontWeight:'500', marginBottom:'3px' }}>{m.title}</div>
            <div style={{ fontSize:'0.6875rem', opacity:0.65, lineHeight:1.4 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* LODDTREKNING */}
      {mode === 'lottery' && (
        <div>
          {items.filter(i => !resolutions[i.id]).length > 1 && (
            <button onClick={drawAll} disabled={!!animating} style={{ marginBottom:'16px', padding:'9px 18px', background:animating?'#D9CFC0':'#5F6E52', color:'#fff', border:'none', borderRadius:'8px', cursor:animating?'not-allowed':'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif' }}>
              {L('Trekk alle på én gang', 'Draw all at once')}
            </button>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            {items.map(item => {
              const winner = resolutions[item.id] ? getMember(resolutions[item.id]) : null
              const isAnim = animating === item.id
              return (
                <div key={item.id} style={{
                  background:'#fff',
                  border:`1px solid ${winner?'#B8C8A8':isAnim?'#C8BEA0':'#D9CFC0'}`,
                  borderRadius:'12px', padding:'18px 20px',
                  display:'flex', gap:'16px', alignItems:'center', flexWrap:'wrap',
                  transition:'border-color 0.3s',
                }}>
                  {item.image_url && (
                    <StoredImage src={item.image_url} alt={item.title}
                      style={{ width:'76px', height:'76px', objectFit:'cover', borderRadius:'8px', flexShrink:0, background:'#E8DFD0' }} />
                  )}
                  <div style={{ flex:1, minWidth:'150px' }}>
                    <div style={{ fontSize:'0.9375rem', color:'#3A2F26', fontWeight:'500', marginBottom:'3px' }}>{item.title}</div>
                    {formatNOK(item.estimated_value) && <div style={{ fontSize:'0.75rem', color:'#5F6E52', marginBottom:'6px' }}>{formatNOK(item.estimated_value)}</div>}
                    <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontSize:'0.6875rem', color:'#75604B' }}>{L('Vil ha:', 'Wanted by:')}</span>
                      {(item.interests || []).map(x => {
                        const m = getMember(x.user_id)
                        return (
                          <div key={x.id} title={x.reason} style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                            <Avatar name={m?.profiles?.display_name} color={memberColor(x.user_id)} size={22} />
                            <span style={{ fontSize:'0.75rem', color:'#3A2F26' }}>{m?.profiles?.display_name || '?'}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <div className="cf-action" style={{ flexShrink:0, textAlign:'center', minWidth:'120px' }}>
                    {winner ? (
                      <div>
                        <div style={{ fontSize:'0.6875rem', color:'#3A5A30', marginBottom:'6px' }}>{L('Vinner', 'Winner')}</div>
                        <div className="cf-winner" style={{ display:'flex', alignItems:'center', gap:'8px', justifyContent:'center' }}>
                          <Avatar name={winner.profiles?.display_name} color={memberColor(winner.user_id)} size={34} />
                          <span style={{ fontSize:'0.8125rem', fontWeight:'500', color:'#3A2F26' }}>{winner.profiles?.display_name}</span>
                        </div>
                        <button onClick={() => setResolutions(p => { const n = { ...p }; delete n[item.id]; return n })}
                          style={{ marginTop:'8px', fontSize:'0.6875rem', color:'#75604B', background:'none', border:'none', cursor:'pointer', fontFamily:'Karla, sans-serif' }}>
                          {L('Trekk på nytt', 'Draw again')}
                        </button>
                      </div>
                    ) : isAnim ? (
                      <div style={{ fontSize:'2.375rem', fontWeight:'700', color:'#5F6E52', fontFamily:'Fraunces, serif', lineHeight:1 }}>
                        {countdown}
                      </div>
                    ) : (
                      <button onClick={() => drawLottery(item)} disabled={!!animating}
                        style={{ padding:'10px 18px', background:'#5F6E52', color:'#fff', border:'none', borderRadius:'8px', cursor:animating?'not-allowed':'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>
                        {L('Trekk vinner', 'Draw winner')}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* SNAKE DRAFT — setup */}
      {mode === 'snake' && !draftStarted && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'28px', maxWidth:'500px' }}>
          <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'1.125rem', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{L('Rekkefølge', 'Picking order')}</h3>
          <p style={{ fontSize:'0.8125rem', color:'#75604B', marginBottom:'20px' }}>{L('Den som velger sist i én runde, velger først i neste. Slik blir det rettferdig for alle.', 'Whoever chooses last in one round chooses first in the next. That way it is fair to everyone.')}</p>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom:'20px' }}>
            {snakeOrderIds.map((uid, i) => {
              const m = getMember(uid)
              return (
                <div key={uid} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px', background:'#FBF9F5', borderRadius:'8px', border:'1px solid #D9CFC0' }}>
                  <div style={{ width:'24px', height:'24px', borderRadius:'50%', background:PALETTE[i%PALETTE.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', color:'#fff', fontWeight:'700' }}>{i+1}</div>
                  <Avatar name={m?.profiles?.display_name} color={PALETTE[i%PALETTE.length]} size={32} />
                  <span style={{ fontSize:'0.875rem', color:'#3A2F26', flex:1 }}>{m?.profiles?.display_name || uid}</span>
                </div>
              )
            })}
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={shuffleSnake} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', color:'#5C4530' }}>
              {L('Tilfeldig rekkefølge', 'Shuffle')}
            </button>
            <button onClick={() => { setSnakePos(nextPickPos(0, items)); setDraftStarted(true) }} style={{ flex:2, padding:'11px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
              {L('Start valgrundene →', 'Start picking →')}
            </button>
          </div>
        </div>
      )}

      {mode === 'snake' && draftStarted && (
        <div>
          {unclaimedItems.length > 0 ? (
            <div style={{ background:'#3A2F26', color:'#FBF9F5', borderRadius:'12px', padding:'20px 24px', marginBottom:'20px', display:'flex', alignItems:'center', gap:'16px' }}>
              <Avatar name={getMember(currentSnakeUser)?.profiles?.display_name} color={memberColor(currentSnakeUser)} size={52} />
              <div>
                <div style={{ fontSize:'0.75rem', color:'#75604B', marginBottom:'3px' }}>
                  {L('Runde', 'Round')} {Math.floor(snakePos/snakeOrderIds.length)+1}, {L('valg', 'pick')} {(snakePos%snakeOrderIds.length)+1} {L('av', 'of')} {snakeOrderIds.length}
                </div>
                <div style={{ fontSize:'1.25rem', fontFamily:'Fraunces, serif' }}>
                  {getMember(currentSnakeUser)?.profiles?.display_name || '?'} {L('velger nå…', 'is choosing…')}
                </div>
                <div style={{ fontSize:'0.75rem', color:'#C8BEA0', marginTop:'3px' }}>{L('Klikk på en av de markerte gjenstandene – du kan bare velge det du har vist interesse for', 'Click one of the highlighted items – you can only pick items you have shown interest in')}</div>
              </div>
            </div>
          ) : (
            <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'12px', padding:'24px', marginBottom:'20px', textAlign:'center' }}>
              <div style={{ fontSize:'1.125rem', color:'#3A2F26', fontFamily:'Fraunces, serif' }}>{L('Alle valg er gjort!', 'All picks are done!')}</div>
              <div style={{ fontSize:'0.8125rem', color:'#5C4530', marginTop:'6px' }}>{L('Bekreft fordelingen nedenfor for å tildele gjenstandene offisielt.', 'Confirm the distribution below to officially assign the items.')}</div>
            </div>
          )}

          {unclaimedItems.length > 0 && (
            <div style={{ display:'flex', gap:'6px', marginBottom:'20px', flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:'0.75rem', color:'#75604B' }}>{L('Rekkefølge:', 'Order:')}</span>
              {Array.from({ length: snakeOrderIds.length * 2 }, (_, i) => getSnakeUser(snakePos + i))
                .filter(uid => wantsAny(uid, unclaimedItems))
                .slice(0, Math.min(snakeOrderIds.length * 2, unclaimedItems.length + 3))
                .map((uid, i) => {
                const m = getMember(uid)
                return (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'20px', background:i===0?'#3A2F26':'#E8DFD0', color:i===0?'#FBF9F5':'#5C4530', fontSize:'0.75rem' }}>
                    <Avatar name={m?.profiles?.display_name} color={memberColor(uid)} size={18} />
                    {m?.profiles?.display_name}
                  </div>
                )
              })}
            </div>
          )}

          {unclaimedItems.length > 0 && (
            <div className="cf-pick-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px, 1fr))', gap:'12px', marginBottom:'24px' }}>
              {unclaimedItems.map(item => {
                const isMine = item.interests?.some(x => x.user_id === currentSnakeUser)
                return (
                  <div key={item.id} onClick={() => snakePick(item.id)} style={{
                    background:isMine?'#DCE3D2':'#fff',
                    border:`2px solid ${isMine?'#5F6E52':'#D9CFC0'}`,
                    borderRadius:'10px', overflow:'hidden', cursor:isMine?'pointer':'not-allowed', transition:'transform 0.1s',
                    opacity: isMine ? 1 : 0.55,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.09)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
                    <div style={{ height:'100px', background:'#E8DFD0', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {item.image_url
                        ? <StoredImage src={item.image_url} alt={item.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                        : <span style={{ fontSize:'2.25rem', color:'#75604B' }}>·</span>}
                    </div>
                    <div style={{ padding:'10px 12px' }}>
                      <div style={{ fontSize:'0.8125rem', color:'#3A2F26', fontWeight:'500', marginBottom:'2px', lineHeight:1.3 }}>{item.title}</div>
                      {formatNOK(item.estimated_value) && <div style={{ fontSize:'0.6875rem', color:'#5F6E52' }}>{formatNOK(item.estimated_value)}</div>}
                      {isMine ? (
                        <div style={{ fontSize:'0.6875rem', color:'#5F6E52', marginTop:'4px' }}>{L('Interessert', 'Interested')}</div>
                      ) : (
                        <div style={{ fontSize:'0.6875rem', color:'#75604B', marginTop:'4px' }}>
                          {(item.interests || []).length} {L(`interessert${(item.interests || []).length !== 1 ? 'e' : ''}`, 'interested')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {resolvedCount > 0 && (
            <div style={{ background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'16px 20px', marginBottom:'20px' }}>
              <div style={{ fontSize:'0.75rem', color:'#75604B', fontWeight:'500', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{L('Valgt', 'Chosen')} ({resolvedCount})</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {items.filter(i => resolutions[i.id]).map(item => {
                  const m = getMember(resolutions[item.id])
                  return (
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'0.8125rem', color:'#5C4530' }}>
                      <Avatar name={m?.profiles?.display_name} color={memberColor(resolutions[item.id])} size={22} />
                      <span style={{ fontWeight:'500', minWidth:'80px' }}>{m?.profiles?.display_name}</span>
                      <span style={{ color:'#75604B' }}>→</span>
                      <span style={{ flex:1 }}>{item.title}</span>
                      {formatNOK(item.estimated_value) && <span style={{ color:'#5F6E52', fontSize:'0.6875rem', whiteSpace:'nowrap' }}>{formatNOK(item.estimated_value)}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* JEVN VERDIFORDELING */}
      {mode === 'equal' && missingValues.length > 0 && (
        <div role="status" style={{ background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'18px 20px', marginBottom:'20px', color:'#3A2F26', lineHeight:1.6 }}>
          <div style={{ fontWeight:'600', marginBottom:'6px' }}>
            {L(`${missingValues.length} ${missingValues.length === 1 ? 'gjenstand mangler' : 'gjenstander mangler'} fordelingsverdi og er ikke med i den jevne fordelingen`,
              `${missingValues.length} ${missingValues.length === 1 ? 'item lacks' : 'items lack'} a distribution value and ${missingValues.length === 1 ? 'is' : 'are'} not included in the equal distribution`)}
          </div>
          <p style={{ fontSize:'0.875rem', marginBottom:'10px' }}>
            {L('De kan fordeles på annen måte, eller få en fordelingsverdi først. En manglende verdi regnes aldri som 0 kr; 0 kr må settes eksplisitt.', 'They can be divided another way, or be given a distribution value first. A missing value is never counted as 0 kr; 0 kr must be set explicitly.')}
          </p>
          {canUseAi.length > 0 && (
            <button onClick={useAiAsValue} disabled={settingValues} style={{ minHeight:'44px', padding:'8px 14px', marginBottom:'10px', background:'#5F6E52', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
              {L(`Bruk AI-anslaget som fordelingsverdi (${canUseAi.length})`, `Use the AI estimate as distribution value (${canUseAi.length})`)}
            </button>
          )}
          <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:'6px' }}>
            {missingValues.map(it => (
              <li key={it.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', fontSize:'0.875rem' }}>
                <span>{it.title}{it.status === 'assigned' ? L(' (tildelt tidligere)', ' (assigned earlier)') : ''}{aiEstimate(it) !== null ? ` · ${L('AI-anslag', 'AI estimate')} ${formatNOK(aiEstimate(it))}` : ''}</span>
                <button onClick={() => navigate(`/estate/${id}/item/${it.id}`)} style={{ minHeight:'44px', padding:'8px 14px', background:'#fff', border:'1px solid #9A8B78', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', color:'#3A2F26' }}>
                  {L(`Sett fordelingsverdi på ${it.title}`, `Set distribution value for ${it.title}`)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'equal' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'16px', marginBottom:'20px' }}>
            {memberTotals.map(m => (
              <div key={m.user_id} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'14px' }}>
                  <Avatar name={m.profiles?.display_name} color={m.color} size={44} />
                  <div>
                    <div style={{ fontSize:'0.875rem', fontWeight:'500', color:'#3A2F26' }}>{m.profiles?.display_name}</div>
                    <div style={{ fontSize:'1.375rem', fontFamily:'Fraunces, serif', color:'#5F6E52' }}>
                      {formatNOK(m.total) || '—'}
                    </div>
                    {m.earlier > 0 && <div style={{ fontSize:'0.6875rem', color:'#75604B' }}>{L('inkl.', 'incl.')} {formatNOK(m.earlier)} {L('tildelt tidligere', 'assigned earlier')}</div>}
                  </div>
                </div>
                {m.assignedItems.length === 0 ? (
                  <div style={{ fontSize:'0.75rem', color:'#75604B', fontStyle:'italic' }}>{L('Ingen gjenstander tildelt', 'No items assigned')}</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                    {m.assignedItems.map(item => (
                      <div key={item.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.75rem', color:'#5C4530', padding:'6px 8px', background:'#FBF9F5', borderRadius:'6px' }}>
                        <span style={{ lineHeight:1.3 }}>{item.title}</span>
                        <span style={{ color:'#5F6E52', flexShrink:0, marginLeft:'8px' }}>{formatNOK(itemValue(item)) || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ background:'#E8DFD0', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'14px 18px', fontSize:'0.8125rem', color:'#5C4530', marginBottom:'20px', lineHeight:1.6 }}>
            {L('Forslag til jevn fordeling – beslutningsstøtte, ikke en fasit. Gjenstandene med fordelingsverdi sorteres etter synkende verdi, og neste gjenstand går til den av de interesserte som har lavest sum så langt, medregnet det hver arving allerede har fått. Fordelingsverdiene er foreslåtte til dere har godkjent fordelingen.',
              'A proposal for an equal distribution – decision support, not a final answer. Items with a distribution value are sorted by descending value, and the next item goes to the interested heir with the lowest sum so far, including what each heir has already received. The distribution values are proposals until you have approved the distribution.')}
            {' '}{weights
              ? L('Fordelingen er vektet etter arveandelene dere har bekreftet.', 'The distribution is weighted by the inheritance shares you have confirmed.')
              : L('Alle regnes likt; arveandeler brukes bare når administrator har bekreftet at de gjelder innbo og løsøre (under «Arvinger»).', 'Everyone counts equally; inheritance shares are only used when the administrator has confirmed that they apply to household contents (under «Heirs»).')}
          </div>
          <button onClick={() => setResolutions(computeEqualResolutions())} style={{ padding:'9px 18px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif', color:'#5C4530', marginBottom:'20px' }}>
            {L('Kjør på nytt', 'Run again')}
          </button>
        </div>
      )}

      {/* BEKREFT OG TILDEL */}
      {resolvedCount > 0 && (
        <div className="bottom-bar" style={{ position:'fixed', bottom:0, left:0, right:0, padding:'16px', background:'#fff', borderTop:'1px solid #D9CFC0', boxShadow:'0 -4px 20px rgba(0,0,0,0.08)', zIndex:100 }}>
          <div style={{ maxWidth:'920px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:'0.875rem', fontWeight:'500', color:'#3A2F26' }}>{L(`${resolvedCount} av ${items.length} gjenstander løst`, `${resolvedCount} of ${items.length} items resolved`)}</div>
              {!allResolved && <div style={{ fontSize:'0.75rem', color:'#75604B' }}>{L('Gjenværende forblir ukrevde til neste runde', 'The rest stay unclaimed until the next round')}</div>}
            </div>
            <button className="cf-apply" onClick={apply} disabled={applying} style={{
              padding:'13px 32px', background:applying?'#D9CFC0':'#3A2F26', color:'#FBF9F5',
              border:'none', borderRadius:'10px', cursor:applying?'not-allowed':'pointer',
              fontSize:'0.9375rem', fontFamily:'Karla, sans-serif', fontWeight:'500', whiteSpace:'nowrap',
            }}>
              {applying?L('Tildeler…','Assigning…'):L(`Bekreft og tildel (${resolvedCount})`, `Confirm and assign (${resolvedCount})`)}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
