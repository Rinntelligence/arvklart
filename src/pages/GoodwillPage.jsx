import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getEstateMembers } from '../lib/supabase'
import { L, locale } from '../lib/lang'

const CHORE_SIZES = [
  { id: 'small',  label: L('Liten', 'Small'),           desc: L('Under 1 time', 'Under 1 hour'),        points: 15 },
  { id: 'medium', label: L('Middels', 'Medium'),        desc: L('1–3 timer', '1–3 hours'),              points: 35 },
  { id: 'large',  label: L('Stor', 'Large'),            desc: L('Halv/hel dag', 'Half/full day'),       points: 70 },
  { id: 'dump',   label: L('Søppelkjøring', 'Dump run'), desc: L('Kjøring til dump', 'Drive to the dump'), points: 40 },
]

const SCORE_COLORS = ['#5F6E52','#8B9A7D','#A97C3F','#7A8B6E','#9C8267','#6E8B87','#8B3A3A']
const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }
const getScoreColor = (i) => SCORE_COLORS[i % SCORE_COLORS.length]
// complete_chore() lagrer loggteksten på norsk; oversettes ved visning
const logText = d => d?.replace(/^Fullførte: /, L('Fullførte: ', 'Completed: '))

export default function GoodwillPage({ session, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [chores, setChores] = useState([])
  const [goodwillLog, setGoodwillLog] = useState([])
  const [tab, setTab] = useState('chores')
  const [showAddChore, setShowAddChore] = useState(false)
  const [newChore, setNewChore] = useState({ title: '', description: '', size: 'medium', assigned_to: '' })
  const [loading, setLoading] = useState(true)

  const load = async () => {
    // chores og goodwill_log peker på auth.users, så profilene hentes fra medlemslisten
    const [{ data: mems }, { data: chs }, { data: log }] = await Promise.all([
      getEstateMembers(id),
      supabase.from('chores').select('*').eq('estate_id', id).order('created_at', { ascending: false }),
      supabase.from('goodwill_log').select('*').eq('estate_id', id).order('created_at', { ascending: false }),
    ])
    const profileOf = uid => (mems || []).find(m => m.user_id === uid)?.profiles || null
    setMembers(mems || [])
    setChores((chs || []).map(c => ({ ...c, assigned_to_profile: profileOf(c.assigned_to), completed_by_profile: profileOf(c.completed_by) })))
    setGoodwillLog((log || []).map(e => ({ ...e, profiles: profileOf(e.user_id) })))
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel(`goodwill-${id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'chores', filter:`estate_id=eq.${id}` }, load)
      .on('postgres_changes', { event:'*', schema:'public', table:'goodwill_log', filter:`estate_id=eq.${id}` }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [id])

  // Hvem har gjort hva: alfabetisk, uten poeng, rangering eller sammenligning
  // (chores.points og goodwill_log.points beholdes i databasen, men vises ikke)
  const contributors = members.map(m => ({
    ...m,
    events: goodwillLog.filter(e => e.user_id === m.user_id),
  })).sort((a, b) => (a.profiles?.display_name || '').localeCompare(b.profiles?.display_name || '', 'nb'))

  const claimChore = async (choreId) => {
    const { error } = await supabase.from('chores').update({ assigned_to: session.user.id }).eq('id', choreId).is('assigned_to', null)
    if (error) onToast(L('Kunne ikke ta oppgaven', 'Could not take the task'), 'error')
    load()
  }

  // Databasen markerer oppgaven som ferdig og gir poeng én gang, også ved dobbeltklikk
  const completeChore = async (chore) => {
    const { error } = await supabase.rpc('complete_chore', { p_chore_id: chore.id })
    if (error) onToast(L('Kunne ikke fullføre oppgaven', 'Could not complete the task'), 'error')
    load()
  }

  const addChore = async () => {
    if (!newChore.title.trim()) return
    const size = CHORE_SIZES.find(s => s.id === newChore.size)
    const { error } = await supabase.from('chores').insert({
      estate_id: id, title: newChore.title.trim(),
      description: newChore.description.trim(), size: newChore.size,
      assigned_to: newChore.assigned_to || null,
      added_by: session.user.id, completed: false,
      points: size?.points || 35,
    })
    if (error) { onToast(L('Kunne ikke legge til oppgaven', 'Could not add the task'), 'error'); return }
    setNewChore({ title: '', description: '', size: 'medium', assigned_to: '' })
    setShowAddChore(false)
    load()
  }

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  return (
    <div style={{ maxWidth:'820px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'1.625rem', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>{L('Oppgaver og bidrag', 'Tasks and contributions')}</h1>
          <p style={{ color:'#75604B', fontSize:'0.875rem' }}>{L('Hvem tar hva, og hva som er gjort', 'Who takes what, and what has been done')}</p>
        </div>
        <button onClick={() => { setShowAddChore(true); setTab('chores') }} style={{ padding:'9px 18px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
          {L('+ Legg til oppgave', '+ Add task')}
        </button>
      </div>

      {/* Faner */}
      <style>{`@media (max-width: 400px) { .gw-tabs > button { padding-left: 10px !important; padding-right: 10px !important; } }`}</style>
      <div className="gw-tabs" style={{ display:'flex', gap:'4px', borderBottom:'1px solid #D9CFC0', marginBottom:'24px' }}>
        {[['chores',L('Oppgaver','Tasks')],['overview',L('Hvem har bidratt','Who has helped')],['log',L('Det som er gjort','What has been done')]].map(([t,l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'10px 18px', border:'none', background:'none', cursor:'pointer',
            fontSize:'0.875rem', fontFamily:'Karla, sans-serif',
            color:tab===t?'#3A2F26':'#75604B',
            borderBottom:tab===t?'2px solid #3A2F26':'2px solid transparent',
            marginBottom:'-1px',
          }}>{l}</button>
        ))}
      </div>

      {/* HVEM HAR BIDRATT */}
      {tab === 'overview' && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px' }}>
          <p style={{ fontSize:'0.875rem', color:'#5C4530', lineHeight:1.6, marginBottom:'16px' }}>
            {L('Her ser dere hva hver enkelt har tatt seg av. Det er ment som oversikt, ikke som en sammenligning.', 'Here you can see what each person has taken care of. It is meant as an overview, not a comparison.')}
          </p>
          {contributors.map((c, i) => (
            <div key={c.user_id} style={{ display:'flex', alignItems:'flex-start', gap:'10px', padding:'10px 0', borderTop: i ? '1px solid #E8DFD0' : 'none' }}>
              <div style={{ width:'32px', height:'32px', flexShrink:0, borderRadius:'50%', background:c.profiles?.avatar_color||getScoreColor(i), border:tc(c.profiles?.avatar_color||getScoreColor(i))==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8125rem', color:tc(c.profiles?.avatar_color||getScoreColor(i)), fontWeight:'500' }}>
                {(c.profiles?.display_name||'?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'0.9375rem', color:'#3A2F26' }}>
                  {c.profiles?.display_name}{c.user_id===session.user.id && <span style={{ fontSize:'0.75rem', color:'#75604B', marginLeft:'6px' }}>{L('(deg)', '(you)')}</span>}
                </div>
                <div style={{ fontSize:'0.8125rem', color:'#75604B' }}>
                  {c.events.length === 0 ? L('Ingen oppgaver registrert ennå', 'No tasks recorded yet') : L(`${c.events.length} ${c.events.length === 1 ? 'oppgave' : 'oppgaver'} gjort`, `${c.events.length} ${c.events.length === 1 ? 'task' : 'tasks'} done`)}
                </div>
                {c.events.slice(0, 2).map(e => (
                  <div key={e.id} style={{ fontSize:'0.8125rem', color:'#5C4530', marginTop:'2px' }}>{logText(e.description)}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OPPGAVER */}
      {tab === 'chores' && (
        <div>
          {showAddChore && (
            <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
              <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'1rem', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>{L('Legg til oppgave', 'Add task')}</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <input value={newChore.title} onChange={e => setNewChore(p => ({ ...p, title: e.target.value }))} placeholder={L('Oppgavetittel, f.eks. Rydde garasjen', 'Task title, e.g. Clear out the garage')} maxLength={200}
                  style={{ width:'100%', padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                <input value={newChore.description} onChange={e => setNewChore(p => ({ ...p, description: e.target.value }))} placeholder={L('Beskrivelse (valgfri)', 'Description (optional)')} maxLength={500}
                  style={{ width:'100%', padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                  {CHORE_SIZES.map(s => (
                    <button key={s.id} onClick={() => setNewChore(p => ({ ...p, size: s.id }))} style={{
                      padding:'9px 14px', border:`2px solid ${newChore.size===s.id?'#3A2F26':'#D9CFC0'}`,
                      borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif',
                      background:newChore.size===s.id?'#3A2F26':'#fff',
                      color:newChore.size===s.id?'#FBF9F5':'#5C4530',
                    }}>
                      {s.label} <span style={{ fontSize:'0.75rem', opacity:0.85 }}>({s.desc.toLowerCase()})</span>
                    </button>
                  ))}
                </div>
                <div>
                  <label htmlFor="goodwill-f1" style={{ display:'block', fontSize:'0.8125rem', color:'#75604B', marginBottom:'6px' }}>{L('Tildel til (valgfri)', 'Assign to (optional)')}</label>
                  <select id="goodwill-f1" value={newChore.assigned_to} onChange={e => setNewChore(p => ({ ...p, assigned_to: e.target.value }))}
                    style={{ width:'100%', padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif' }}>
                    <option value="">{L('— Hvem som helst kan ta den —', '— Anyone can take it —')}</option>
                    {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  <button onClick={() => setShowAddChore(false)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
                  <button onClick={addChore} disabled={!newChore.title.trim()} style={{ flex:2, padding:'11px', background:newChore.title.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newChore.title.trim()?'pointer':'not-allowed', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>
                    {L('Legg til oppgave', 'Add task')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {chores.length === 0 ? (
            <div style={{ textAlign:'center', padding:'80px 20px', color:'#75604B' }}>
              <p style={{ marginBottom:'20px' }}>{L('Ingen oppgaver ennå. Legg til ting som må gjøres — garasje, søppelkjøring, pakking.', 'No tasks yet. Add things that need doing — garage, dump runs, packing.')}</p>
              <button onClick={() => setShowAddChore(true)} style={{ padding:'11px 24px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Legg til første oppgave', 'Add the first task')}</button>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              {chores.filter(c => !c.completed).length > 0 && (
                <>
                  <div style={{ fontSize:'0.8125rem', color:'#75604B', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:'4px' }}>{L('Åpne oppgaver', 'Open tasks')}</div>
                  {chores.filter(c => !c.completed).map(chore => (
                    <ChoreCard key={chore.id} chore={chore} session={session} members={members}
                      onClaim={() => claimChore(chore.id)}
                      onComplete={() => completeChore(chore)} />
                  ))}
                </>
              )}
              {chores.filter(c => c.completed).length > 0 && (
                <>
                  <div style={{ fontSize:'0.8125rem', color:'#75604B', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.5px', margin:'12px 0 4px' }}>{L('Fullførte', 'Completed')}</div>
                  {chores.filter(c => c.completed).map(chore => (
                    <ChoreCard key={chore.id} chore={chore} session={session} members={members} completed />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* AKTIVITETSLOGG */}
      {tab === 'log' && (
        <div>
          {goodwillLog.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px', color:'#75604B' }}>
              <p>{L('Ingen oppgaver er gjort ennå.', 'No tasks have been done yet.')}</p>
            </div>
          ) : (
            <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
              {goodwillLog.map((event, i) => (
                <div key={event.id} style={{ display:'flex', alignItems:'center', gap:'14px', padding:'14px 18px', borderBottom:i < goodwillLog.length-1?'1px solid #FBF9F5':'none' }}>
                  <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:event.profiles?.avatar_color||'#DCE3D2', border:tc(event.profiles?.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', color:tc(event.profiles?.avatar_color||'#DCE3D2'), fontWeight:'500', flexShrink:0 }}>
                    {(event.profiles?.display_name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'0.875rem', color:'#3A2F26' }}>
                      <strong>{event.profiles?.display_name}</strong> — {logText(event.description)}
                    </div>
                    <div style={{ fontSize:'0.75rem', color:'#75604B', marginTop:'2px' }}>
                      {new Date(event.created_at).toLocaleDateString(locale(), { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ChoreCard({ chore, session, members, onClaim, onComplete, completed }) {
  const size = CHORE_SIZES.find(s => s.id === chore.size) || CHORE_SIZES[1]
  const isAssignedToMe = chore.assigned_to === session.user.id
  const isUnassigned = !chore.assigned_to

  return (
    <div style={{
      background: completed?'#FBF9F5':'#fff',
      border:`1px solid ${isAssignedToMe?'#B8C8A8':'#D9CFC0'}`,
      borderRadius:'10px', padding:'16px 18px',
      opacity: completed?0.75:1,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:'12px', flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:'200px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
            <span style={{ fontSize:'0.9375rem', color:'#3A2F26', textDecoration:completed?'line-through':'none' }}>{chore.title}</span>
          </div>
          {chore.description && <div style={{ fontSize:'0.8125rem', color:'#5C4530', marginBottom:'8px' }}>{chore.description}</div>}
          <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:'0.75rem', background:'#E8DFD0', color:'#5C4530', padding:'2px 8px', borderRadius:'20px' }}>
              {size.label} · {size.desc}
            </span>
            <span style={{ fontSize:'0.75rem', color:'#5C4530' }}>{size.desc}</span>
            {completed && chore.completed_by_profile && (
              <span style={{ fontSize:'0.75rem', color:'#5F6E52' }}>{L('Gjort av', 'Done by')} {chore.completed_by_profile.display_name}</span>
            )}
            {!completed && chore.assigned_to_profile && (
              <span style={{ fontSize:'0.75rem', color:'#75604B' }}>{L('Tatt av', 'Taken by')} {chore.assigned_to_profile.display_name}</span>
            )}
            {!completed && isUnassigned && (
              <span style={{ fontSize:'0.75rem', color:'#75604B', fontStyle:'italic' }}>{L('Ikke tatt ennå. Hvem som helst kan ta den.', 'Not taken yet. Anyone can take it.')}</span>
            )}
          </div>
        </div>

        {!completed && (
          <div style={{ display:'flex', gap:'8px', flexShrink:0 }}>
            {isUnassigned && (
              <button onClick={onClaim} style={{ padding:'8px 14px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', color:'#5C4530', fontFamily:'Karla, sans-serif' }}>
                {L('Ta oppgaven', 'Take the task')}
              </button>
            )}
            {(isAssignedToMe || isUnassigned) && (
              <button onClick={onComplete} style={{ padding:'8px 14px', background:'#5F6E52', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif' }}>
                {L('Merk som gjort', 'Mark as done')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
