import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEstate, getEstateMembers, updateEstate, uploadLogo, supabase } from '../lib/supabase'
import { usePlan } from '../hooks/usePlan'
import { Avatar, Card } from '../components/UI'
import { L } from '../lib/lang'

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
  const logoRef = useRef()
  const { can } = usePlan()

  const load = async () => {
    const [{ data: est }, { data: mems }] = await Promise.all([
      getEstate(id),
      getEstateMembers(id),
    ])
    setEstate(est)
    setMembers(mems || [])
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
    const code = Math.random().toString(36).substring(2,8).toUpperCase()
    await updateEstate(id, { invite_code: code })
    onToast(L('Invitasjonslenke fornyet ✓', 'Invite link renewed ✓'))
    load()
  }

  const saveBranding = async () => {
    if (!can('whitelabel')) { onToast(L('Hvitmerking krever Business-plan', 'White-label requires the Business plan'), 'error'); return }
    setSaving(true)
    let logoUrl = estate.branding_logo
    if (logoFile) logoUrl = await uploadLogo(logoFile, id)
    await updateEstate(id, { branding_color: brandColor, branding_logo: logoUrl })
    onToast(L('Merkevare lagret ✓', 'Branding saved ✓'))
    setSaving(false); load()
  }

  const removeMember = async (userId) => {
    await supabase.from('estate_members').delete().eq('estate_id', id).eq('user_id', userId)
    onToast(L('Medlem fjernet', 'Member removed'))
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

  if (!estate) return <div style={{ padding:'80px', textAlign:'center', color:'#9C8267', fontFamily:'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  return (
    <div style={{ maxWidth:'680px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <h1 style={{ fontFamily:'Fraunces, serif', fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'28px' }}>{L('Administrer', 'Manage')} — {estate.name}</h1>

      {/* Invite link */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{L('Invitasjonslenke', 'Invite link')}</h2>
        <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'16px' }}>{L('Send denne lenken til familiemedlemmer — de klikker og legges automatisk til i boet.', 'Send this link to family members — they click it and are added to the estate automatically.')}</p>
        <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
          <input value={inviteUrl} readOnly
            style={{ flex:1, padding:'11px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'13px', background:'#FBF9F5', color:'#5C4530', outline:'none', fontFamily:'monospace' }} />
          <button onClick={copyInvite} style={{ padding:'11px 18px', background: copied?'#8B9A7D':'#3A2F26', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif', whiteSpace:'nowrap' }}>
            {copied ? L('✓ Kopiert!', '✓ Copied!') : L('Kopier lenke', 'Copy link')}
          </button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'13px', color:'#9C8267' }}>{L('Invitasjonskode:', 'Invite code:')} <strong style={{ letterSpacing:'2px', color:'#3A2F26' }}>{estate.invite_code}</strong></span>
          <button onClick={regenerateCode} style={{ fontSize:'12px', color:'#9C8267', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontFamily:'Karla, sans-serif' }}>{L('Forny kode', 'Renew code')}</button>
        </div>
      </Card>

      {/* Members */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'16px' }}>{L('Medlemmer', 'Members')} ({members.length})</h2>
        <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
          {members.map(m => (
            <div key={m.user_id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'12px 14px', background:'#FBF9F5', border:'1px solid #D9CFC0', borderRadius:'8px' }}>
              <Avatar name={m.profiles?.display_name||'?'} size={38} color={m.profiles?.avatar_color} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'14px', color:'#3A2F26', fontWeight:'500' }}>{m.profiles?.display_name}</div>
                <div style={{ fontSize:'12px', color:'#9C8267' }}>{m.profiles?.email}</div>
              </div>
              <span style={{ fontSize:'11px', background:m.role==='admin'?'#E8DFD0':'#DCE3D2', color:m.role==='admin'?'#5C4530':'#3A5A30', padding:'3px 8px', borderRadius:'20px', textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.role}</span>
              {m.user_id !== session.user.id && (
                <button onClick={()=>removeMember(m.user_id)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'18px', padding:'0 4px' }}>×</button>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* White-label branding */}
      <Card style={{ padding:'28px', marginBottom:'20px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'6px' }}>
          <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26' }}>{L('Merkevare', 'Branding')}</h2>
          {!can('whitelabel') && <span style={{ fontSize:'11px', background:'#DCE3D2', color:'#5F6E52', padding:'3px 8px', borderRadius:'20px' }}>{L('Business-plan', 'Business plan')}</span>}
        </div>
        <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'20px' }}>{L('Tilpass utseendet for dine klienter — din logo og farger i topplinjen.', 'Customise the look for your clients — your logo and colours in the top bar.')}</p>

        <div style={{ display:'flex', gap:'20px', flexWrap:'wrap', marginBottom:'20px' }}>
          <div style={{ flex:1, minWidth:'160px' }}>
            <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'8px' }}>{L('Merkevarefarge', 'Brand colour')}</label>
            <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
              <input type="color" value={brandColor} onChange={e=>setBrandColor(e.target.value)}
                style={{ width:'48px', height:'48px', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', padding:'2px' }} />
              <span style={{ fontSize:'13px', color:'#5C4530', fontFamily:'monospace' }}>{brandColor}</span>
            </div>
          </div>
          <div style={{ flex:1, minWidth:'160px' }}>
            <label style={{ display:'block', fontSize:'13px', color:'#9C8267', marginBottom:'8px' }}>{L('Logotype', 'Logo')}</label>
            <div onClick={()=>can('whitelabel')&&logoRef.current.click()} style={{ width:'80px', height:'48px', background:'#E8DFD0', border:'1px dashed #D9CFC0', borderRadius:'8px', display:'flex', alignItems:'center', justifyContent:'center', cursor: can('whitelabel')?'pointer':'not-allowed', overflow:'hidden' }}>
              {logoPreview
                ? <img src={logoPreview} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                : <span style={{ fontSize:'13px', color:'#9C8267' }}>Logo</span>}
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
      <Card style={{ padding:'28px' }}>
        <h2 style={{ fontFamily:'Fraunces, serif', fontSize:'18px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>{L('Kategorier', 'Categories')}</h2>
        <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'16px' }}>{L('Administrer kategoriene som er tilgjengelige for gjenstander i dette boet.', 'Manage the categories available for items in this estate.')}</p>
        <button onClick={()=>navigate(`/estate/${id}/categories`)} style={{ padding:'9px 18px', background:'none', border:'1px solid #D9CFC0', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>
          {L('Administrer kategorier →', 'Manage categories →')}
        </button>
      </Card>
    </div>
  )
}
