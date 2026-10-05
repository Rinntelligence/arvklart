import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getEstateMembers } from '../lib/supabase'
import { WIZARD_TAG } from '../lib/wizardEstate'

const RELATIONSHIPS = ['Barn', 'Ektefelle / Partner', 'Søsken', 'Forelder', 'Barnebarn', 'Bobestyrer', 'Advokat', 'Rådgiver', 'Annen']
const AVATAR_COLORS = ['#DCE3D2','#E8DFD0','#C9AE8E','#A8B598','#8B9A7D','#D9CFC0','#5F6E52','#9C8267']
const normEmail = e => (e || '').trim().toLowerCase()
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

export default function HeirsPage({ session, profile, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [heirs, setHeirs] = useState([])
  const [totalValue, setTotalValue] = useState('')
  const [splitMode, setSplitMode] = useState('equal')
  const [showAdd, setShowAdd] = useState(false)
  const [newHeir, setNewHeir] = useState({ name: '', email: '', relationship: 'Barn', notes: '', percentage: '' })
  const [myRole, setMyRole] = useState('member')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [memberEmails, setMemberEmails] = useState([])
  const [copied, setCopied] = useState('')
  const [emailEdit, setEmailEdit] = useState(null)

  const load = async () => {
    const [{ data: hs }, { data: mem }, { data: es }, { data: members }] = await Promise.all([
      supabase.from('heirs').select('*').eq('estate_id', id).order('created_at'),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
      supabase.from('estates').select('total_value, split_mode, invite_code').eq('id', id).single(),
      getEstateMembers(id),
    ])
    setHeirs(hs || [])
    setMyRole(mem?.role || 'member')
    setInviteCode(es?.invite_code || '')
    setMemberEmails((members || []).map(m => normEmail(m.profiles?.email)).filter(Boolean))
    if (es?.total_value) setTotalValue(es.total_value.toString())
    if (es?.split_mode) setSplitMode(es.split_mode)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  const saveSettings = async () => {
    setSaving(true)
    await supabase.from('estates').update({ total_value: parseFloat(totalValue) || null, split_mode: splitMode }).eq('id', id)
    if (splitMode === 'custom') {
      for (const heir of heirs) {
        await supabase.from('heirs').update({ percentage: parseFloat(heir.percentage) || 0 }).eq('id', heir.id)
      }
    }
    setSaving(false)
    load()
  }

  const addHeir = async () => {
    if (!newHeir.name.trim()) return
    const email = normEmail(newHeir.email)
    if (email && !isEmail(email)) { onToast?.('Ugyldig e-postadresse', 'error'); return }
    const { error } = await supabase.from('heirs').insert({ ...newHeir, email: email || null, estate_id: id, percentage: parseFloat(newHeir.percentage) || 0 })
    if (error) { onToast?.('Kunne ikke legge til arving: ' + error.message, 'error'); return }
    onToast?.(email ? `${newHeir.name.trim()} er lagt til. Send invitasjonskoden ${inviteCode} til ${email}` : `${newHeir.name.trim()} er lagt til`)
    setNewHeir({ name: '', email: '', relationship: 'Barn', notes: '', percentage: '' })
    setShowAdd(false)
    load()
  }

  const saveEmail = async () => {
    const email = normEmail(emailEdit.value)
    if (email && !isEmail(email)) { onToast?.('Ugyldig e-postadresse', 'error'); return }
    const { error } = await supabase.from('heirs').update({ email: email || null }).eq('id', emailEdit.id)
    if (error) { onToast?.('Kunne ikke lagre e-post: ' + error.message, 'error'); return }
    setEmailEdit(null)
    load()
  }

  const copy = (what, text) => {
    navigator.clipboard?.writeText(text)
    setCopied(what)
    setTimeout(() => setCopied(''), 2000)
  }
  const inviteUrl = inviteCode ? `${window.location.origin}/join/${inviteCode}` : ''

  const removeHeir = async (heirId) => {
    await supabase.from('heirs').delete().eq('id', heirId)
    load()
  }

  const updateLocalPercentage = (heirId, val) => {
    setHeirs(prev => prev.map(h => h.id === heirId ? { ...h, percentage: val } : h))
  }

  const total = parseFloat(totalValue) || 0
  const equalShare = heirs.length > 0 ? total / heirs.length : 0
  const totalCustom = heirs.reduce((a, h) => a + (parseFloat(h.percentage) || 0), 0)
  const customValid = Math.abs(totalCustom - 100) < 0.1

  const getShare = (heir) => {
    if (!total) return null
    if (splitMode === 'equal') return equalShare
    if (splitMode === 'custom') return total * ((parseFloat(heir.percentage) || 0) / 100)
    return null
  }

  const formatMoney = (n) => {
    if (n === null || isNaN(n)) return '—'
    return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)
  }

  if (loading) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>Laster…</div>

  return (
    <div style={{ maxWidth:'760px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>← Tilbake til boet</button>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'28px', flexWrap:'wrap', gap:'12px' }}>
        <div>
          <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'26px', fontWeight:'400', color:'#3A2F26', marginBottom:'4px' }}>Arvinger og fordeling</h1>
          <p style={{ color:'#9C8267', fontSize:'14px' }}>Administrer arvinger og beregn hvordan boet fordeles</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={{ padding:'9px 18px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
          + Legg til arving
        </button>
      </div>

      {heirs.some(h => h.notes?.startsWith(WIZARD_TAG)) && (
        <div style={{ background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'12px', padding:'16px 20px', marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
          <p style={{ margin:0, fontSize:'14px', color:'#3A5A30', lineHeight:'1.5', flex:'1 1 260px' }}>
            Arvingene og prosentene er beregnet i arveveiviseren etter arveloven. Endrer du svarene der og lagrer på nytt, oppdateres de automatisk.
          </p>
          <button onClick={() => navigate(`/estate/${id}/guide`)} style={{ padding:'9px 16px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>
            Endre svarene i veiviseren
          </button>
        </div>
      )}

      {/* Invitasjon */}
      {inviteCode && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'20px' }}>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>Inviter arvinger</h2>
          <p style={{ fontSize:'13px', color:'#9C8267', lineHeight:'1.6', marginBottom:'16px' }}>
            For å bli med i boet må arvingen være lagt til nedenfor med e-posten de logger inn med, og skrive inn invitasjonskoden.
          </p>
          <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap' }}>
            <span style={{ fontFamily:'Fraunces, serif', fontSize:'26px', letterSpacing:'4px', color:'#3A2F26', background:'#E8DFD0', padding:'8px 16px', borderRadius:'8px' }}>{inviteCode}</span>
            <button onClick={() => copy('code', inviteCode)} style={{ padding:'9px 16px', background: copied==='code'?'#5F6E52':'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
              {copied === 'code' ? 'Kopiert ✓' : 'Kopier kode'}
            </button>
            <button onClick={() => copy('link', inviteUrl)} style={{ padding:'9px 16px', background:'none', color:'#5C4530', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
              {copied === 'link' ? 'Kopiert ✓' : 'Kopier lenke'}
            </button>
          </div>
        </div>
      )}

      {/* Fordelingskalkulator */}
      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'20px' }}>Fordelingskalkulator</h2>

        <div style={{ marginBottom:'20px' }}>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'8px' }}>Total boeverdi (omtrentlig)</label>
          <div style={{ position:'relative', maxWidth:'280px' }}>
            <span style={{ position:'absolute', left:'14px', top:'50%', transform:'translateY(-50%)', color:'#9C8267', fontSize:'15px' }}>kr</span>
            <input type="number" value={totalValue} onChange={e => setTotalValue(e.target.value)} placeholder="f.eks. 500000"
              style={{ width:'100%', padding:'11px 14px 11px 38px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
          </div>
          <p style={{ fontSize:'12px', color:'#9C8267', marginTop:'6px' }}>Dette er kun for beregning — ikke juridisk bindende</p>
        </div>

        <div style={{ marginBottom:'20px' }}>
          <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'10px' }}>Hvordan fordele</label>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {[
              { id: 'equal', label: 'Lik fordeling', desc: 'Alle får like mye' },
              { id: 'custom', label: 'Egendefinert %', desc: 'Sett prosenter manuelt' },
              { id: 'assigned', label: 'Per gjenstand', desc: 'Basert på tildelte gjenstander' },
            ].map(opt => (
              <button key={opt.id} onClick={() => setSplitMode(opt.id)} style={{
                padding:'10px 16px', border:`2px solid ${splitMode===opt.id?'#3A2F26':'#D9CFC0'}`,
                borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif',
                background: splitMode===opt.id?'#3A2F26':'#fff',
                color: splitMode===opt.id?'#FBF9F5':'#3A2F26',
                textAlign:'left',
              }}>
                <div style={{ fontWeight:'500' }}>{opt.label}</div>
                <div style={{ fontSize:'11px', opacity:0.7, marginTop:'2px' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {myRole === 'admin' && (
          <button onClick={saveSettings} disabled={saving} style={{ padding:'10px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
            {saving ? 'Lagrer…' : 'Lagre innstillinger'}
          </button>
        )}
      </div>

      {/* Legg til arving */}
      {showAdd && (
        <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'20px' }}>
          <h3 style={{ fontFamily:'Fraunces, serif', fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>Legg til arving</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
            <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:'160px' }}>
                <label style={{ display:'block', fontSize:'12px', color:'#9C8267', marginBottom:'5px' }}>Fullt navn *</label>
                <input value={newHeir.name} onChange={e => setNewHeir(p => ({ ...p, name: e.target.value }))} placeholder="f.eks. Kari Hansen" maxLength={100}
                  style={{ width:'100%', padding:'10px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
              <div style={{ flex:1, minWidth:'160px' }}>
                <label style={{ display:'block', fontSize:'12px', color:'#9C8267', marginBottom:'5px' }}>E-post (den arvingen logger inn med)</label>
                <input type="email" value={newHeir.email} onChange={e => setNewHeir(p => ({ ...p, email: e.target.value }))} placeholder="kari@epost.no" maxLength={254}
                  style={{ width:'100%', padding:'10px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
              <div style={{ flex:1 }}>
                <label style={{ display:'block', fontSize:'12px', color:'#9C8267', marginBottom:'5px' }}>Relasjon</label>
                <select value={newHeir.relationship} onChange={e => setNewHeir(p => ({ ...p, relationship: e.target.value }))}
                  style={{ width:'100%', padding:'10px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }}>
                  {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {splitMode === 'custom' && (
                <div style={{ width:'120px' }}>
                  <label style={{ display:'block', fontSize:'12px', color:'#9C8267', marginBottom:'5px' }}>Andel %</label>
                  <input type="number" min="0" max="100" value={newHeir.percentage} onChange={e => setNewHeir(p => ({ ...p, percentage: e.target.value }))} placeholder="f.eks. 25"
                    style={{ width:'100%', padding:'10px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
                </div>
              )}
            </div>
            <div>
              <label style={{ display:'block', fontSize:'12px', color:'#9C8267', marginBottom:'5px' }}>Notater</label>
              <input value={newHeir.notes} onChange={e => setNewHeir(p => ({ ...p, notes: e.target.value }))} placeholder="Relevante notater…" maxLength={500}
                style={{ width:'100%', padding:'10px 12px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:'10px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Avbryt</button>
              <button onClick={addHeir} disabled={!newHeir.name.trim()} style={{ flex:2, padding:'10px', background:newHeir.name.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newHeir.name.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Legg til arving</button>
            </div>
          </div>
        </div>
      )}

      {/* Valideringsadvarsel */}
      {splitMode === 'custom' && heirs.length > 0 && !customValid && (
        <div style={{ padding:'12px 16px', background:'#E8DFD0', border:'1px solid #C8BEA0', borderRadius:'8px', marginBottom:'16px', fontSize:'13px', color:'#5C4530' }}>
          Prosentene summeres til {totalCustom.toFixed(1)}% — må være nøyaktig 100%
        </div>
      )}
      {splitMode === 'custom' && heirs.length > 0 && customValid && (
        <div style={{ padding:'12px 16px', background:'#DCE3D2', border:'1px solid #B8C8A8', borderRadius:'8px', marginBottom:'16px', fontSize:'13px', color:'#3A5A30' }}>
          Prosentene summeres til 100% — ser bra ut
        </div>
      )}

      {/* Arvingsliste */}
      {heirs.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#9C8267' }}>
          <p style={{ marginBottom:'20px' }}>Ingen arvinger lagt til ennå.</p>
          <button onClick={() => setShowAdd(true)} style={{ padding:'11px 24px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>Legg til første arving</button>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
          {heirs.map((heir, i) => {
            const share = getShare(heir)
            const pct = splitMode === 'equal' ? (heirs.length > 0 ? (100 / heirs.length).toFixed(1) : 0) : (heir.percentage || 0)

            return (
              <div key={heir.id} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'20px', display:'flex', gap:'16px', alignItems:'flex-start', flexWrap:'wrap' }}>
                <div style={{ width:'48px', height:'48px', borderRadius:'50%', background:AVATAR_COLORS[i % AVATAR_COLORS.length], border:tc(AVATAR_COLORS[i%AVATAR_COLORS.length])==='#3A2F26'?'1px solid #D9CFC0':'none', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', color:tc(AVATAR_COLORS[i % AVATAR_COLORS.length]), fontWeight:'500', flexShrink:0 }}>
                  {heir.name[0].toUpperCase()}
                </div>

                <div style={{ flex:1, minWidth:'160px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px', flexWrap:'wrap' }}>
                    <span style={{ fontSize:'15px', fontWeight:'500', color:'#3A2F26' }}>{heir.name}</span>
                    <span style={{ fontSize:'12px', background:'#E8DFD0', color:'#5C4530', padding:'2px 8px', borderRadius:'20px' }}>
                      {heir.relationship}
                    </span>
                  </div>
                  {emailEdit?.id === heir.id ? (
                    <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', margin:'4px 0 6px' }}>
                      <input type="email" autoFocus value={emailEdit.value} onChange={e => setEmailEdit(p => ({ ...p, value: e.target.value }))} onKeyDown={e => e.key === 'Enter' && saveEmail()} placeholder="kari@epost.no" maxLength={254}
                        style={{ flex:'1 1 180px', padding:'6px 10px', border:'1px solid #D9CFC0', borderRadius:'6px', fontSize:'13px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }} />
                      <button onClick={saveEmail} style={{ padding:'6px 12px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontFamily:'Karla, sans-serif' }}>Lagre</button>
                      <button onClick={() => setEmailEdit(null)} style={{ padding:'6px 10px', background:'none', color:'#9C8267', border:'1px solid #D9CFC0', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontFamily:'Karla, sans-serif' }}>Avbryt</button>
                    </div>
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap', marginBottom:'4px' }}>
                      {heir.email && <span style={{ fontSize:'12px', color:'#9C8267' }}>{heir.email}</span>}
                      {(() => {
                        const st = !heir.email ? { label:'Ingen e-post – kan ikke bli med', bg:'#E8DFD0', fg:'#5C4530' }
                          : memberEmails.includes(normEmail(heir.email)) ? { label:'Har blitt med', bg:'#DCE3D2', fg:'#3A5A30' }
                          : { label:'Venter på at arvingen blir med', bg:'#FBF9F5', fg:'#9C8267' }
                        return <span style={{ fontSize:'11px', background:st.bg, color:st.fg, border:'1px solid #D9CFC0', padding:'1px 8px', borderRadius:'20px' }}>{st.label}</span>
                      })()}
                      {!memberEmails.includes(normEmail(heir.email)) && (
                        <button onClick={() => setEmailEdit({ id: heir.id, value: heir.email || '' })} style={{ fontSize:'12px', color:'#9C8267', background:'none', border:'none', padding:0, cursor:'pointer', textDecoration:'underline', fontFamily:'Karla, sans-serif' }}>
                          {heir.email ? 'Endre e-post' : 'Legg til e-post'}
                        </button>
                      )}
                    </div>
                  )}
                  {heir.notes && <div style={{ fontSize:'13px', color:'#5C4530', fontStyle:'italic' }}>{heir.notes}</div>}
                </div>

                <div style={{ textAlign:'right', flexShrink:0 }}>
                  {splitMode === 'custom' ? (
                    <div style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
                      <input type="number" min="0" max="100" value={heir.percentage || ''} onChange={e => updateLocalPercentage(heir.id, e.target.value)}
                        style={{ width:'70px', padding:'6px 10px', border:'1px solid #D9CFC0', borderRadius:'6px', fontSize:'14px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif', textAlign:'right' }} />
                      <span style={{ fontSize:'14px', color:'#9C8267' }}>%</span>
                    </div>
                  ) : (
                    <div style={{ fontSize:'18px', color:'#5F6E52', fontFamily:'Fraunces, serif', marginBottom:'4px' }}>{pct}%</div>
                  )}
                  {share !== null && (
                    <div style={{ fontSize:'13px', color:'#3A2F26', fontWeight:'500' }}>{formatMoney(share)}</div>
                  )}
                  {myRole === 'admin' && (
                    <button onClick={() => removeHeir(heir.id)} style={{ fontSize:'11px', color:'#9C8267', background:'none', border:'none', cursor:'pointer', marginTop:'6px', fontFamily:'Karla, sans-serif' }}>Fjern</button>
                  )}
                </div>
              </div>
            )
          })}

          {total > 0 && (
            <div style={{ background:'#E8DFD0', border:'1px solid #D9CFC0', borderRadius:'10px', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:'14px', fontWeight:'500', color:'#3A2F26' }}>Total boeverdi</span>
              <span style={{ fontSize:'22px', fontFamily:'Fraunces, serif', color:'#3A2F26' }}>{formatMoney(total)}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop:'24px', padding:'16px 20px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'10px', fontSize:'12px', color:'#9C8267', lineHeight:'1.6' }}>
        <strong>Ansvarsfraskrivelse:</strong> Disse beregningene er kun til informasjonsformål og utgjør ikke juridisk eller finansiell rådgivning. Konsulter en kvalifisert advokat før du tar fordelingsbeslutninger.
      </div>
    </div>
  )
}
