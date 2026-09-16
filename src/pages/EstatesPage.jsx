import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMyEstates, createEstate, supabase } from '../lib/supabase'
import { usePlan } from '../hooks/usePlan'
import { t } from '../lib/lang'
import { Card, Button, Avatar } from '../components/UI'

function genCode() { return Math.random().toString(36).substring(2,8).toUpperCase() }

const DEFAULT_CATEGORIES = [
  'Møbler', 'Kunst og bilder', 'Smykker', 'Bøker',
  'Elektronikk', 'Kjøkken', 'Klær og tekstiler',
  'Verktøy', 'Kjøretøy', 'Dokumenter', 'Annet',
].map(label => ({ label, emoji: '' }))

export default function EstatesPage({ session, profile, onToast }) {
  const [estates, setEstates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const navigate = useNavigate()
  const { plan, limit } = usePlan()

  const load = async () => {
    const { data } = await getMyEstates(session.user.id)
    setEstates(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    const myEstates = estates.filter(e => e.role === 'admin').length
    if (myEstates >= limit('estates')) { onToast(`Oppgrader for å opprette mer enn ${limit('estates')} bo`, 'error'); return }
    setCreating(true)
    const { data, error } = await createEstate({
      name: newName.trim(), description: newDesc.trim(),
      owner_id: session.user.id, invite_code: genCode(),
      branding_color: '#3A2F26', status: 'active',
    })
    if (error) { onToast('Feil: ' + error.message, 'error'); setCreating(false); return }
    await supabase.from('estate_members').insert({ estate_id: data.id, user_id: session.user.id, role: 'admin' })
    await supabase.from('categories').insert(DEFAULT_CATEGORIES.map(c => ({ ...c, estate_id: data.id })))
    onToast('Bo opprettet! ✓')
    setShowNew(false); setNewName(''); setNewDesc('')
    load()
    setCreating(false)
  }

  const joinByCode = async () => {
    if (!joinCode.trim()) return
    const code = joinCode.trim().toUpperCase()
    const { data: estate } = await supabase.from('estates').select('id, name').eq('invite_code', code).single()
    if (!estate) { onToast('Ugyldig invitasjonskode', 'error'); return }
    await supabase.from('estate_members').upsert({ estate_id: estate.id, user_id: session.user.id, role: 'member' }, { onConflict: 'estate_id,user_id' })
    onToast(`Ble med i "${estate.name}" ✓`)
    load(); setJoinCode('')
  }

  return (
    <div style={{ maxWidth:'860px', margin:'0 auto', padding:'32px 16px', fontFamily:'Karla, sans-serif' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'32px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'28px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>
            Velkommen tilbake, {profile?.display_name?.split(' ')[0]}
          </h1>
          <p style={{ color:'#9C8267', fontSize:'15px' }}>Administrer dine bo eller bli med via en invitasjonskode</p>
        </div>
        <button onClick={()=>setShowNew(!showNew)} style={{
          padding:'11px 22px', background:'#3A2F26', color:'#FBF9F5',
          border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif',
        }}>+ Nytt bo</button>
      </div>

      {showNew && (
        <Card style={{ padding:'28px', marginBottom:'24px' }}>
          <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Opprett nytt bo</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'14px', marginBottom:'20px' }}>
            <div>
              <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Navn på boet *</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="f.eks. Hansens familiebu" maxLength={200}
                style={{ width:'100%', padding:'11px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'6px' }}>Beskrivelse (valgfri)</label>
              <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="f.eks. Gjenstander fra bestefars hus" maxLength={500}
                style={{ width:'100%', padding:'11px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={()=>setShowNew(false)} style={{ flex:1, padding:'11px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Avbryt</button>
            <button onClick={create} disabled={!newName.trim()||creating} style={{ flex:2, padding:'11px', background:newName.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newName.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
              {creating?'Oppretter…':'Opprett bo'}
            </button>
          </div>
        </Card>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#9C8267' }}>Laster…</div>
      ) : estates.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 20px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D9CFC0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom:'16px' }}>
            <path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/>
          </svg>
          <p style={{ color:'#9C8267', fontSize:'16px', marginBottom:'24px' }}>Ingen bo ennå. Opprett et eller bli med via invitasjonskode.</p>
          <button onClick={()=>setShowNew(true)} style={{ padding:'12px 28px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'15px', fontFamily:'Karla, sans-serif' }}>
            Opprett første bo
          </button>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:'16px', marginBottom:'32px' }}>
          {estates.map(e => {
            const est = e.estates
            return (
              <div key={e.estate_id} onClick={()=>navigate(`/estate/${e.estate_id}`)} style={{
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
                  <span style={{ fontSize:'11px', background: e.role==='admin'?'#E8DFD0':'#DCE3D2', color: e.role==='admin'?'#5C4530':'#3A5A30', padding:'3px 8px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{e.role}</span>
                </div>
                <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'17px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{est?.name}</h3>
                {est?.description && <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'12px', lineHeight:'1.5' }}>{est.description}</p>}
                <div style={{ fontSize:'12px', color:'#9C8267' }}>
                  Opprettet {new Date(est?.created_at).toLocaleDateString('nb-NO', { day:'numeric', month:'short', year:'numeric' })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Card style={{ padding:'24px' }}>
        <h3 style={{ fontSize:'15px', color:'#3A2F26', marginBottom:'6px', fontWeight:'500' }}>Bli med i et bo</h3>
        <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'16px' }}>Har du en invitasjonskode? Skriv den inn nedenfor.</p>
        <div style={{ display:'flex', gap:'10px' }}>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&joinByCode()} placeholder="Skriv invitasjonskode (f.eks. AB3X9K)" maxLength={10}
            style={{ flex:1, padding:'11px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', letterSpacing:'2px' }} />
          <button onClick={joinByCode} style={{ padding:'11px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Bli med</button>
        </div>
      </Card>
    </div>
  )
}
