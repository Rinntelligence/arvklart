import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyEstates, createEstate, ensureDefaultCategories, supabase } from '../lib/supabase'
import { usePlan } from '../hooks/usePlan'
import { joinEstateByCode } from '../lib/joinEstate'
import { Card } from '../components/UI'
import { L, locale } from '../lib/lang'

function genCode() { return Math.random().toString(36).substring(2,8).toUpperCase() }

export default function EstatesPage({ session, profile, onToast }) {
  const [estates, setEstates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const navigate = useNavigate()
  const [joining, setJoining] = useState(false)
  const { limit } = usePlan()

  const load = async () => {
    const { data, error } = await getMyEstates(session.user.id)
    if (error) onToast(L('Kunne ikke hente boene dine. Last siden på nytt.', 'Could not load your estates. Reload the page.'), 'error')
    setEstates(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    const myEstates = estates.filter(e => e.role === 'admin').length
    if (myEstates >= limit('estates')) { onToast(L(`Oppgrader for å opprette mer enn ${limit('estates')} bo`, `Upgrade to create more than ${limit('estates')} estates`), 'error'); return }
    setCreating(true)
    const { data, error } = await createEstate({
      name: newName.trim(), description: newDesc.trim(),
      owner_id: session.user.id, invite_code: genCode(),
      branding_color: '#3A2F26', status: 'active',
    })
    if (error) { onToast(L('Kunne ikke opprette boet: ', 'Could not create the estate: ') + error.message, 'error'); setCreating(false); return }
    const { error: memberError } = await supabase.from('estate_members').insert({ estate_id: data.id, user_id: session.user.id, role: 'admin' })
    if (memberError) { onToast(L('Boet ble opprettet, men du ble ikke lagt til som admin: ', 'The estate was created, but you were not added as admin: ') + memberError.message, 'error'); setCreating(false); return }
    await ensureDefaultCategories(data.id)
    onToast(L('Bo opprettet! ✓', 'Estate created! ✓'))
    setShowNew(false); setNewName(''); setNewDesc('')
    load()
    setCreating(false)
  }

  const joinByCode = async () => {
    if (!joinCode.trim() || joining) return
    setJoining(true)
    const { estate, error } = await joinEstateByCode(joinCode, session.user.email)
    setJoining(false)
    if (error) { onToast(error, 'error'); return }
    onToast(L(`Ble med i "${estate.name}" ✓`, `Joined "${estate.name}" ✓`))
    load(); setJoinCode('')
  }

  return (
    <div style={{ maxWidth:'860px', margin:'0 auto', padding:'32px 16px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'32px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'28px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>
            {L('Velkommen tilbake', 'Welcome back')}, {profile?.display_name?.split(' ')[0]}
          </h1>
          <p style={{ color:'#75604B', fontSize:'15px' }}>{L('Administrer dine bo eller bli med via en invitasjonskode', 'Manage your estates or join one with an invite code')}</p>
        </div>
        <button onClick={()=>setShowNew(!showNew)} style={{
          padding:'11px 22px', background:'#3A2F26', color:'#FBF9F5',
          border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif',
        }}>{L('+ Nytt bo', '+ New estate')}</button>
      </div>

      {showNew && (
        <Card style={{ padding:'28px', marginBottom:'24px' }}>
          <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>{L('Opprett nytt bo', 'Create new estate')}</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
            <div>
              <label htmlFor="estates-f1" style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'6px' }}>{L('Navn på boet *', 'Estate name *')}</label>
              <input id="estates-f1" value={newName} onChange={e=>setNewName(e.target.value)} placeholder={L('f.eks. Hansens familiebu', 'e.g. The Hansen family estate')} maxLength={200}
                style={{ width:'100%', padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
            </div>
            <div>
              <label htmlFor="estates-f2" style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'6px' }}>{L('Beskrivelse (valgfri)', 'Description (optional)')}</label>
              <input id="estates-f2" value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder={L('f.eks. Gjenstander fra bestefars hus', 'e.g. Items from grandfather\'s house')} maxLength={500}
                style={{ width:'100%', padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={()=>setShowNew(false)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
            <button onClick={create} disabled={!newName.trim()||creating} style={{ flex:2, padding:'11px', background:newName.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newName.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
              {creating?L('Oppretter…','Creating…'):L('Opprett bo','Create estate')}
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#75604B' }}>{L('Laster…', 'Loading…')}</div>
      ) : estates.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 20px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D9CFC0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:'16px' }}>
            <path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/>
          </svg>
          <p style={{ color:'#75604B', fontSize:'16px', marginBottom:'24px' }}>{L('Ingen bo ennå. Opprett et eller bli med via invitasjonskode.', 'No estates yet. Create one or join with an invite code.')}</p>
          <button onClick={()=>setShowNew(true)} style={{ padding:'12px 28px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'15px', fontFamily:'Karla, sans-serif' }}>
            {L('Opprett første bo', 'Create your first estate')}
          </button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'16px', marginBottom:'32px' }}>
          {estates.map(e => {
            const est = e.estates
            return (
              <div key={e.estate_id} onClick={()=>navigate(`/estate/${e.estate_id}`)} role="link" tabIndex={0}
                onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); navigate(`/estate/${e.estate_id}`) } }}
                aria-label={L(`Åpne ${est?.name || 'boet'}`, `Open ${est?.name || 'the estate'}`)} style={{
                background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px',
                padding:'22px', cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={ev=>{ ev.currentTarget.style.transform='translateY(-2px)'; ev.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.09)' }}
              onMouseLeave={ev=>{ ev.currentTarget.style.transform='none'; ev.currentTarget.style.boxShadow='none' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'10px' }}>
                  <div style={{ width:'42px', height:'42px', borderRadius:'10px', background: est?.branding_color || '#3A2F26', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FBF9F5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/>
                    </svg>
                  </div>
                  <div style={{ display:'flex', gap:'6px' }}>
                    {est?.status === 'closed' && <span style={{ fontSize:'11px', background:'#E8DFD0', color:'#75604B', padding:'3px 8px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{L('Avsluttet', 'Closed')}</span>}
                    <span style={{ fontSize:'11px', background: e.role==='admin'?'#E8DFD0':'#DCE3D2', color: e.role==='admin'?'#5C4530':'#3A5A30', padding:'3px 8px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{e.role === 'admin' ? L('Admin', 'Admin') : L('Medlem', 'Member')}</span>
                  </div>
                </div>
                <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'17px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{est?.name}</h3>
                {est?.description && <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'12px', lineHeight:'1.5' }}>{est.description}</p>}
                <div style={{ fontSize:'12px', color:'#75604B' }}>
                  {L('Opprettet', 'Created')} {new Date(est?.created_at).toLocaleDateString(locale(), { day:'numeric', month:'short', year:'numeric' })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Card style={{ padding:'24px' }}>
        <style>{`@media (max-width: 600px) { .join-code::placeholder { letter-spacing: 0; } }`}</style>
        <h3 style={{ fontSize:'15px', color:'#3A2F26', marginBottom:'6px', fontWeight:'500' }}>{L('Bli med i et bo', 'Join an estate')}</h3>
        <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'16px' }}>{L('Har du en invitasjonskode? Skriv den inn nedenfor.', 'Have an invite code? Enter it below.')}</p>
        <div style={{ display:'flex', gap:'10px' }}>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&joinByCode()} placeholder={L('Skriv invitasjonskode (f.eks. AB3X9K)', 'Enter invite code (e.g. AB3X9K)')} maxLength={10}
            className="join-code"
            style={{ flex:1, minWidth:0, padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif', letterSpacing:'2px' }} />
          <button onClick={joinByCode} disabled={joining} style={{ padding:'11px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>{joining ? L('Vent…', 'Wait…') : L('Bli med', 'Join')}</button>
        </div>
      </Card>
    </div>
  )
}
