import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getEstateMembers, updateEstate, supabase } from '../lib/supabase'
import { usePlan } from '../hooks/usePlan'
import { uploadEstateImage } from '../lib/images'
import { Avatar, Card } from '../components/UI'
import { L, locale } from '../lib/lang'

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()

export default function AdminPage({ session, profile, onToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [estate, setEstate] = useState(null)
  const [members, setMembers] = useState([])
  const [brandColor, setBrandColor] = useState('#3A2F26')
  const [saving, setSaving] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [copied, setCopied] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const logoRef = useRef()
  const { can } = usePlan()

  const load = async () => {
    const [{ data: est }, { data: mems }] = await Promise.all([
      getEstate(id),
      getEstateMembers(id),
    ])
    setEstate(est)
    setMembers(mems || [])
    setLoaded(true)
    setBrandColor(est?.branding_color || '#3A2F26')
    setLogoPreview(est?.branding_logo || null)
  }

  useEffect(() => { load() }, [id])

  const inviteUrl = estate ? `${window.location.origin}/join/${estate.invite_code}` : ''

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const regenerateCode = async () => {
    // Koden er unik; prøv på nytt hvis den tilfeldigvis er tatt
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await updateEstate(id, { invite_code: genCode() })
      if (!error) { onToast(L('Invitasjonslenke fornyet ✓', 'Invite link renewed ✓')); load(); return }
      if (error.code !== '23505') break
    }
    onToast(L('Kunne ikke fornye invitasjonskoden', 'Could not renew the invite code'), 'error')
  }

  const saveBranding = async () => {
    if (!can('whitelabel')) { onToast(L('Hvitmerking krever Business-plan', 'White-label requires the Business plan'), 'error'); return }
    setSaving(true)
    try {
      let logoUrl = estate.branding_logo
      if (logoFile) logoUrl = await uploadEstateImage(logoFile, id, 'logo')
      const { error } = await updateEstate(id, { branding_color: brandColor, branding_logo: logoUrl })
      if (error) throw error
      setLogoFile(null)
      onToast(L('Merkevare lagret ✓', 'Branding saved ✓'))
      load()
    } catch {
      onToast(L('Kunne ikke lagre merkevaren', 'Could not save the branding'), 'error')
    }
    setSaving(false)
  }

  const removeMember = async (member) => {
    const { error } = await supabase.rpc('remove_estate_member', { p_estate_id: id, p_user_id: member.user_id })
    setConfirmRemove(null)
    if (error) { onToast(error.message.includes('cannot_remove_owner') ? L('Eieren av boet kan ikke fjernes', 'The owner of the estate cannot be removed') : L('Kunne ikke fjerne medlemmet', 'Could not remove the member'), 'error'); return }
    onToast(L('Medlem fjernet', 'Member removed'))
    load()
  }

  // Avsluttede bo slettes automatisk etter 12 måneder (se personvernerklæringen)
  const setClosed = async (closed) => {
    const { error } = await updateEstate(id, closed ? { status: 'closed', closed_at: new Date().toISOString() } : { status: 'active', closed_at: null })
    setConfirmClose(false)
    if (error) { onToast(L('Kunne ikke endre status på boet', 'Could not change the status of the estate'), 'error'); return }
    onToast(closed ? L('Boet er avsluttet', 'The estate is closed') : L('Boet er åpnet igjen', 'The estate has been reopened'))
    load()
  }

  const handleLogo = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  if (!loaded) return <div style={{ padding:'80px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  const myRole = members.find(m => m.user_id === session.user.id)?.role
  if (!estate || myRole !== 'admin') return (
    <div style={{ padding:'80px 16px', textAlign:'center', color:'#75604B', fontFamily:'Karla, sans-serif' }}>
      <p style={{ marginBottom:'16px' }}>{L('Bare administratorer av boet har tilgang til denne siden.', 'Only administrators of the estate can access this page.')}</p>
      <button onClick={() => navigate(estate ? `/estate/${id}` : '/')} style={{ padding:'10px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Tilbake', 'Back')}</button>
    </div>
  )

  return (
    <div style={{ maxWidth:'680px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'28px' }}>{L('Administrer', 'Manage')} — {estate.name}</h1>

      {/* Invite link */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{L('Invitasjonslenke', 'Invite link')}</h2>
        <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'16px', lineHeight:'1.6' }}>
          {L('Send lenken til arvingene. For å bli med må de logge inn med e-posten som er lagt inn på dem under', 'Send the link to the heirs. To join, they must log in with the email address added for them under')}{' '}
          <button onClick={() => navigate(`/estate/${id}/heirs`)} style={{ background:'none', border:'none', padding:0, color:'#5F6E52', cursor:'pointer', fontSize:'13px', textDecoration:'underline', fontFamily:'Karla, sans-serif' }}>{L('Arvinger', 'Heirs')}</button>.
        </p>
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
          <input value={inviteUrl} readOnly aria-label={L('Invitasjonslenke', 'Invite link')}
            style={{ flex:1, minWidth:0, padding:'11px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'13px', background:'#FBF9F5', color:'#5C4530', fontFamily:'monospace' }} />
          <button onClick={copyInvite} style={{ padding:'11px 18px', background: copied?'#5F6E52':'#3A2F26', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>
            {copied ? L('✓ Kopiert!', '✓ Copied!') : L('Kopier lenke', 'Copy link')}
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'4px 12px', flexWrap:'wrap' }}>
          <span style={{ fontSize:'13px', color:'#75604B' }}>{L('Invitasjonskode:', 'Invite code:')} <strong style={{ letterSpacing:'2px', color:'#3A2F26' }}>{estate.invite_code}</strong></span>
          <button onClick={regenerateCode} style={{ fontSize:'12px', color:'#75604B', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontFamily:'Karla, sans-serif' }}>{L('Forny kode', 'Renew code')}</button>
        </div>
      </Card>

      {/* Members */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>{L('Medlemmer', 'Members')} ({members.length})</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {members.map(m => (
            <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'8px' }}>
              <Avatar name={m.profiles?.display_name||'?'} size={38} color={m.profiles?.avatar_color} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500' }}>{m.profiles?.display_name}</div>
                <div style={{ fontSize:'12px', color:'#75604B', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.profiles?.email}</div>
              </div>
              <span style={{ flexShrink:0, fontSize:'11px', background:m.role==='admin'?'#E8DFD0':'#DCE3D2', color:m.role==='admin'?'#5C4530':'#3A5A30', padding:'3px 8px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.user_id === estate.owner_id ? L('Eier', 'Owner') : m.role === 'admin' ? L('Admin', 'Admin') : L('Medlem', 'Member')}</span>
              {m.user_id !== session.user.id && m.user_id !== estate.owner_id && (
                confirmRemove === m.user_id ? (
                  <span style={{ display:'flex', gap:'6px' }}>
                    <button onClick={()=>removeMember(m)} style={{ padding:'4px 10px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'6px', cursor:'pointer', fontSize:'12px', fontFamily:'Karla, sans-serif' }}>{L('Fjern', 'Remove')}</button>
                    <button onClick={()=>setConfirmRemove(null)} style={{ padding:'4px 10px', background:'none', border:'1px solid #D9CFC0', borderRadius:'6px', cursor:'pointer', fontSize:'12px', color:'#5C4530', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
                  </span>
                ) : (
                  <button onClick={()=>setConfirmRemove(m.user_id)} title={L('Fjern fra boet', 'Remove from the estate')} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'18px', padding:'0 4px' }}>×</button>
                )
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize:'12px', color:'#75604B', marginTop:'12px', lineHeight:'1.5' }}>
          {L('Når et medlem fjernes, fjernes også interessene deres for gjenstander som ikke er tildelt. Fjern arvingens e-post under Arvinger hvis de ikke skal kunne bli med igjen.', 'When a member is removed, their interests in unassigned items are removed too. Remove the heir\'s email under Heirs if they should not be able to rejoin.')}
        </p>
      </Card>

      {/* White-label branding */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26' }}>{L('Merkevare', 'Branding')}</h2>
          {!can('whitelabel') && <span style={{ fontSize:'11px', background:'#DCE3D2', color:'#5F6E52', padding:'3px 8px', borderRadius:'20px' }}>{L('Business-plan', 'Business plan')}</span>}
        </div>
        <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'20px' }}>{L('Tilpass utseendet for dine klienter — din logo og farger i topplinjen.', 'Customise the look for your clients — your logo and colours in the top bar.')}</p>

        <div style={{ display:'flex', gap:'20px', flexWrap:'wrap', marginBottom:'20px' }}>
          <div style={{ flex:1, minWidth:'160px' }}>
            <label htmlFor="admin-f1" style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'8px' }}>{L('Merkevarefarge', 'Brand colour')}</label>
            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
              <input id="admin-f1" type="color" value={brandColor} onChange={e=>setBrandColor(e.target.value)}
                style={{ width:'48px', height:'48px', border:'1px solid #9A8B78', borderRadius:'8px', cursor:'pointer', padding:'2px' }} />
              <span style={{ fontSize:'13px', color:'#5C4530', fontFamily:'monospace' }}>{brandColor}</span>
            </div>
          </div>
          <div style={{ flex:1, minWidth:'160px' }}>
            <div style={{ display:'block', fontSize:'13px', color:'#75604B', marginBottom:'8px' }}>{L('Logotype', 'Logo')}</div>
            <div onClick={()=>can('whitelabel')&&logoRef.current.click()} style={{ width:'80px', height:'48px', background:'#E8DFD0', border:'1px dashed #D9CFC0', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', cursor: can('whitelabel')?'pointer':'not-allowed', overflow:'hidden' }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                : <span style={{ fontSize:'13px', color:'#75604B' }}>Logo</span>}
            </div>
            <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{ display:'none' }} />
          </div>
        </div>

        <div style={{ background:'#3A2F26', borderRadius:'10px', padding:'14px 18px', display:'flex', alignItems:'center', gap:'12px', marginBottom:'20px' }}>
          {logoPreview
            ? <img src={logoPreview} alt="" style={{ height:'24px', borderRadius:'4px' }} />
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FBF9F5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/></svg>}
          <span style={{ fontFamily:'Fraunces, serif', fontSize:'15px', color:'#FBF9F5' }}>
            {estate.name} · Arvklart
          </span>
        </div>

        <button onClick={saveBranding} disabled={saving || !can('whitelabel')} style={{
          padding:'11px 22px', background: can('whitelabel')?'#3A2F26':'#D9CFC0',
          color:'#FBF9F5', border:'none', borderRadius:'8px',
          cursor:can('whitelabel')?'pointer':'not-allowed', fontSize:'14px', fontFamily:'Karla, sans-serif',
        }}>{saving?L('Lagrer…','Saving…'):L('Lagre merkevare','Save branding')}</button>
      </Card>

      {/* Categories */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{L('Kategorier', 'Categories')}</h2>
        <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'16px' }}>{L('Administrer kategoriene som er tilgjengelige for gjenstander i dette boet.', 'Manage the categories available for items in this estate.')}</p>
        <button onClick={()=>navigate(`/estate/${id}/categories`)} style={{ padding:'9px 18px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
          {L('Administrer kategorier →', 'Manage categories →')}
        </button>
      </Card>

      {/* Avslutt boet */}
      <Card style={{ padding:'28px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{estate.status === 'closed' ? L('Boet er avsluttet', 'The estate is closed') : L('Avslutt boet', 'Close the estate')}</h2>
        <p style={{ fontSize:'13px', color:'#75604B', marginBottom:'16px', lineHeight:'1.6' }}>
          {estate.status === 'closed'
            ? `${L('Avsluttet', 'Closed')} ${estate.closed_at ? new Date(estate.closed_at).toLocaleDateString(locale(), { day:'numeric', month:'long', year:'numeric' }) : ''}. ${L('Boet med bilder og dokumenter slettes automatisk 12 måneder etter dette. Åpner du boet igjen, stopper slettingen.', 'The estate with its photos and documents is deleted automatically 12 months after this. Reopening the estate stops the deletion.')}`
            : L('Når oppgjøret er ferdig, kan du avslutte boet. Det slettes da automatisk med alle bilder og dokumenter etter 12 måneder. Last ned det dere trenger før det.', 'When the settlement is finished, you can close the estate. It is then deleted automatically with all photos and documents after 12 months. Download what you need before then.')}
        </p>
        {estate.status === 'closed' ? (
          <button onClick={() => setClosed(false)} style={{ padding:'9px 18px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Åpne boet igjen', 'Reopen the estate')}</button>
        ) : confirmClose ? (
          <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:'13px', color:'#8B3A3A' }}>{L('Avslutte boet?', 'Close the estate?')}</span>
            <button onClick={() => setClosed(true)} style={{ padding:'8px 16px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'13px', fontFamily:'Karla, sans-serif' }}>{L('Ja, avslutt', 'Yes, close it')}</button>
            <button onClick={() => setConfirmClose(false)} style={{ padding:'8px 16px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'13px', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
          </div>
        ) : (
          <button onClick={() => setConfirmClose(true)} style={{ padding:'9px 18px', background:'none', border:'1px solid #8B3A3A', borderRadius:'8px', cursor:'pointer', color:'#8B3A3A', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Avslutt boet…', 'Close the estate…')}</button>
        )}
      </Card>
    </div>
  )
}
