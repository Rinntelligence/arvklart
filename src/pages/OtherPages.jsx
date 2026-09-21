// ── JoinPage ──────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function JoinPage({ session, onToast }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')

  useEffect(() => {
    if (!session) { localStorage.setItem('pendingJoinCode', code); navigate('/'); return }
    const join = async () => {
      const { data: estate } = await supabase.from('estates').select('id, name').eq('invite_code', code).single()
      if (!estate) { setStatus('invalid'); return }
      await supabase.from('estate_members').upsert({ estate_id: estate.id, user_id: session.user.id, role: 'admin' }, { onConflict: 'estate_id,user_id' })
      onToast(`Ble med i "${estate.name}" ✓`)
      navigate(`/estate/${estate.id}`)
    }
    join()
  }, [session])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ textAlign:'center', padding:'40px' }}>
        {status === 'invalid'
          ? <><div style={{ fontSize:'48px', marginBottom:'16px' }}>❌</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>Ugyldig invitasjonslenke</h2><p style={{ color:'#8c7b6b', marginTop:'8px' }}>Denne lenken kan ha utløpt eller blitt fornyet.</p></>
          : <><div style={{ fontSize:'48px', marginBottom:'16px' }}>⏳</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>Blir med i boet…</h2></>}
      </div>
    </div>
  )
}

export default JoinPage

// ── PricingPage ───────────────────────────────────────────────────────────────
export function PricingPage({ session }) {
  const navigate = useNavigate()
  const plans = [
    { name:'Free', price:'$0', period:'forever', color:'#e8e0d6', features:['10 items max','3 family members','Photo upload','Interest + reason','Basic overview'], missing:['Dashboard analytics','Comments','PDF report','Unlimited items','White-label'] },
    { name:'Family', price:'$9', period:'/month or $49/year', color:'#6b8fa8', popular:true, features:['Everything in Free','Unlimited items','Unlimited members','Dashboard & analytics','Comments per item','PDF distribution report','Officially assign items'], missing:['White-label branding','Multiple estates'] },
    { name:'Business', price:'$99', period:'/month or $799/year', color:'#c4855a', features:['Everything in Family','Up to 15 active estates','Admin dashboard','Send invite links','Custom logo & colors','Activity log per estate','Email notifications'], missing:['Unlimited estates','API access'] },
    { name:'Enterprise', price:'$299', period:'/month or $2,990/year', color:'#1a1410', features:['Everything in Business','Unlimited estates','API access','Dedicated onboarding','SLA guarantee','Invoice billing','Multi-admin management','Custom integrations'], missing:[] },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif', padding:'48px 16px' }}>
      <div style={{ maxWidth:'940px', margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:'48px' }}>
          <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'36px', fontWeight:'400', color:'#1a1410', marginBottom:'12px' }}>Simple, honest pricing</h1>
          <p style={{ color:'#8c7b6b', fontSize:'16px' }}>Start free. Upgrade when you need more.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px,1fr))', gap:'16px' }}>
          {plans.map(p => (
            <div key={p.name} style={{ background:'#fff', border: p.popular?`2px solid ${p.color}`:'1px solid #e8e0d6', borderRadius:'14px', padding:'28px', position:'relative' }}>
              {p.popular && <div style={{ position:'absolute', top:'-12px', left:'50%', transform:'translateX(-50%)', background:p.color, color:'#fff', fontSize:'11px', padding:'3px 12px', borderRadius:'20px', whiteSpace:'nowrap' }}>Most popular</div>}
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:p.color, marginBottom:'16px' }} />
              <h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'20px', fontWeight:'400', color:'#1a1410', marginBottom:'4px' }}>{p.name}</h2>
              <div style={{ fontSize:'28px', color:'#1a1410', marginBottom:'4px', fontFamily:'Playfair Display, serif' }}>{p.price}</div>
              <div style={{ fontSize:'12px', color:'#a89080', marginBottom:'20px' }}>{p.period}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'24px' }}>
                {p.features.map(f=><div key={f} style={{ fontSize:'13px', color:'#4a3c30', display:'flex', gap:'8px' }}><span style={{ color:'#7aaa7a' }}>✓</span>{f}</div>)}
                {p.missing.map(f=><div key={f} style={{ fontSize:'13px', color:'#c0b0a0', display:'flex', gap:'8px' }}><span>—</span>{f}</div>)}
              </div>
              <button onClick={()=>session?window.location.href='mailto:hei@arvklart.no?subject=Oppgradering til ' + p.name:navigate('/')} style={{ width:'100%', padding:'11px', background:p.name==='Free'?'#f5f0eb':p.color, color:p.name==='Free'?'#1a1410':'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'DM Sans, sans-serif' }}>
                {p.name==='Free'?'Kom i gang gratis':`Få ${p.name}`}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign:'center', marginTop:'32px', fontSize:'13px', color:'#a89080' }}>
          Spørsmål? Send oss en e-post på <a href="mailto:hei@arvklart.no" style={{ color:'#c4855a' }}>hei@arvklart.no</a>
        </p>
      </div>
    </div>
  )
}

// ── CategoriesPage ────────────────────────────────────────────────────────────
export function CategoriesPage({ session, onToast }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [categories, setCategories] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [showPicker, setShowPicker] = useState(false)
  const EMOJIS = ['🛋️','🖼️','📚','🍳','🏺','📺','🧣','📦','🪑','🛏️','🪞','🎨','🎻','⌚','💍','🪴','🧸','🎁','🗝️','📷','🪆','🧩','🍷','🕰️','🪵','🧺','💻','🎭']

  const load = () => supabase.from('categories').select('*').eq('estate_id', id).order('label').then(({data})=>setCategories(data||[]))
  useEffect(()=>{load()},[])

  const add = async () => {
    if (!newLabel.trim()) return
    await supabase.from('categories').insert({ label:newLabel.trim(), emoji:newEmoji, estate_id:id })
    setNewLabel(''); setNewEmoji('📦'); setShowPicker(false); onToast('Kategori lagt til ✓'); load()
  }
  const remove = async (catId) => {
    await supabase.from('categories').delete().eq('id', catId)
    onToast('Kategori fjernet'); load()
  }

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', padding:'28px 16px', fontFamily:'DM Sans, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}/admin`)} style={{ background:'none', border:'none', color:'#8c7b6b', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'DM Sans, sans-serif' }}>← Tilbake til administrasjon</button>
      <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'24px', fontWeight:'400', color:'#1a1410', marginBottom:'28px' }}>Kategorier</h1>

      <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', color:'#8c7b6b', marginBottom:'14px' }}>Legg til ny kategori:</p>
        <div style={{ display:'flex', gap:'8px', marginBottom: showPicker?'12px':'0' }}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{ padding:'10px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', background:'#faf7f3', cursor:'pointer', fontSize:'20px' }}>{newEmoji}</button>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="Kategorinavn…" maxLength={100}
            style={{ flex:1, padding:'10px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', fontSize:'15px', background:'#faf7f3', color:'#1a1410', outline:'none', fontFamily:'DM Sans, sans-serif' }} />
          <button onClick={add} disabled={!newLabel.trim()} style={{ padding:'10px 18px', background:newLabel.trim()?'#1a1410':'#c0b8b0', color:'#f5f0eb', border:'none', borderRadius:'8px', cursor:newLabel.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'DM Sans, sans-serif' }}>+</button>
        </div>
        {showPicker && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'12px', background:'#f5f0eb', borderRadius:'8px' }}>
            {EMOJIS.map(e=>(<button key={e} onClick={()=>{setNewEmoji(e);setShowPicker(false)}} style={{ fontSize:'20px', background:newEmoji===e?'#e0d8d0':'none', border:'none', cursor:'pointer', padding:'5px', borderRadius:'6px' }}>{e}</button>))}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', overflow:'hidden' }}>
        {categories.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'#a89080', fontSize:'14px' }}>Ingen kategorier ennå. Legg til den første.</div>
        )}
        {categories.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', padding:'14px 20px', borderBottom:i<categories.length-1?'1px solid #f0ebe4':'none' }}>
            <span style={{ fontSize:'20px', marginRight:'14px' }}>{c.emoji}</span>
            <span style={{ flex:1, fontSize:'15px', color:'#1a1410' }}>{c.label}</span>
            <button onClick={()=>remove(c.id)} style={{ background:'none', border:'none', color:'#c0a090', cursor:'pointer', fontSize:'20px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PrivacyPage ───────────────────────────────────────────────────────────────
export function PrivacyPage() {
  const [tab, setTab] = useState('privacy')
  const s = { fontFamily: 'Karla, sans-serif', maxWidth: '720px', margin: '0 auto', padding: '40px 20px 80px', color: '#3A2F26', lineHeight: '1.8' }
  const h2s = { fontFamily: 'Fraunces, serif', fontSize: '20px', fontWeight: '400', marginTop: '32px', marginBottom: '8px', color: '#3A2F26' }
  const ps = { fontSize: '15px', color: '#5C4530', marginBottom: '12px' }
  const lis = { fontSize: '15px', color: '#5C4530', marginBottom: '6px' }
  return (
    <div style={s}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '28px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>Juridisk</h1>
      <p style={{ color: '#9C8267', fontSize: '14px', marginBottom: '28px' }}>Sist oppdatert: september 2024</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '1px solid #E8DFD0', paddingBottom: '16px' }}>
        {[['privacy', 'Personvernerklæring'], ['terms', 'Vilkår for bruk']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: '8px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Karla, sans-serif', fontSize: '14px', background: tab === key ? '#3A2F26' : '#E8DFD0', color: tab === key ? '#FBF9F5' : '#5C4530' }}>{label}</button>
        ))}
      </div>

      {tab === 'privacy' && (
        <div>
          <p style={ps}>Denne personvernerklæringen beskriver hvordan ArvKlart («vi», «oss», «tjenesten») behandler personopplysninger om deg som bruker.</p>
          <p style={{ ...ps, background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '8px', padding: '12px 16px' }}>
            <strong>Behandlingsansvarlig:</strong> [SELSKAPSNAVN AS], org.nr. [ORGNR] · kontakt: hei@arvklart.no
          </p>
          <h2 style={h2s}>Hva vi samler inn</h2>
          <ul>
            <li style={lis}><strong>Kontoopplysninger:</strong> navn og e-postadresse ved registrering.</li>
            <li style={lis}><strong>Bo-innhold:</strong> bilder, beskrivelser og anslåtte verdier av gjenstander.</li>
            <li style={lis}><strong>Interesser og kommentarer</strong> du registrerer på gjenstander.</li>
            <li style={lis}><strong>Tekniske data:</strong> IP-adresse og innloggingstidspunkt, behandlet av infrastrukturleverandøren.</li>
          </ul>
          <h2 style={h2s}>Grunnlag og formål</h2>
          <ul>
            <li style={lis}><strong>Avtaleutførelse</strong> (GDPR art. 6 nr. 1 b): levering av tjenesten du har bedt om.</li>
            <li style={lis}><strong>Berettiget interesse</strong> (GDPR art. 6 nr. 1 f): sikkerhet og feilsøking.</li>
            <li style={lis}><strong>Samtykke</strong> (GDPR art. 6 nr. 1 a): AI-analyse av bilder — du gir samtykke eksplisitt ved bruk av denne funksjonen.</li>
          </ul>
          <h2 style={h2s}>Tredjeparter som mottar data</h2>
          <ul>
            <li style={lis}><strong>Supabase Inc. (USA)</strong> — database og autentisering. Databehandleravtale inngått. Data lagres i EU (Frankfurt, AWS eu-central-1).</li>
            <li style={lis}><strong>Vercel Inc. (USA)</strong> — hosting av webapplikasjonen. Databehandleravtale inngått.</li>
            <li style={lis}><strong>Anthropic PBC (USA)</strong> — AI-bildeanalyse, kun ved ditt eksplisitte samtykke. Anthropic bruker ikke API-data til modelltrening. Se <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>Anthropics personvernerklæring</a>.</li>
          </ul>
          <h2 style={h2s}>Lagringstid</h2>
          <p style={ps}>Opplysninger lagres så lenge kontoen er aktiv. Ved kontosletting slettes personopplysninger innen 30 dager, med unntak av det vi er rettslig forpliktet til å oppbevare.</p>
          <h2 style={h2s}>Dine rettigheter</h2>
          <p style={ps}>Du har rett til innsyn, retting, sletting, dataportabilitet og å protestere mot behandlingen. Utøv disse via «Min konto» i appen, eller kontakt oss på hei@arvklart.no. Du kan klage til <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>Datatilsynet</a>.</p>
          <h2 style={h2s}>Sikkerhet</h2>
          <p style={ps}>All kommunikasjon er TLS-kryptert. Data er kryptert i ro. Tilgang til produksjonsdata er begrenset til autorisert personell.</p>
          <h2 style={h2s}>Endringer</h2>
          <p style={ps}>Vesentlige endringer varsles på e-post minst 30 dager i forkant.</p>
          <h2 style={h2s}>Kontakt</h2>
          <p style={ps}><a href="mailto:hei@arvklart.no" style={{ color: '#5F6E52' }}>hei@arvklart.no</a></p>
        </div>
      )}

      {tab === 'terms' && (
        <div>
          <p style={ps}>Ved å opprette konto og bruke ArvKlart godtar du disse vilkårene.</p>
          <h2 style={h2s}>Tjenestebeskrivelse</h2>
          <p style={ps}>ArvKlart er en digital plattform for registrering og fordeling av gjenstander i dødsbo. Tjenesten er et hjelpeverktøy og erstatter ikke juridisk rådgivning, testament eller bindende arveavtaler.</p>
          <h2 style={h2s}>Konto og ansvar</h2>
          <ul>
            <li style={lis}>Du er ansvarlig for å holde innloggingsdetaljene sikre.</li>
            <li style={lis}>Du er ansvarlig for innhold du laster opp og bekrefter at du har rett til å dele det.</li>
            <li style={lis}>Tjenesten kan ikke brukes til ulovlige formål.</li>
          </ul>
          <h2 style={h2s}>Tilgjengelighet og endringer</h2>
          <p style={ps}>Vi tilstreber høy oppetid, men garanterer ikke 100 % tilgjengelighet. Vi forbeholder oss retten til å endre eller avslutte tjenesten med rimelig varsel.</p>
          <h2 style={h2s}>Ansvarsfraskrivelse</h2>
          <p style={ps}>Verdiestimat fra AI er veiledende og ikke profesjonell takst. Vi er ikke ansvarlige for beslutninger tatt på bakgrunn av estimater. Tjenesten leveres «som den er» uten garantier utover ufravikelig lovgivning.</p>
          <h2 style={h2s}>Abonnement og betaling</h2>
          <p style={ps}>Gratis-tieren er gratis uten tidsbegrensning. Betalte abonnementer faktureres forskuddsvis. Refusjon gis ikke for påbegynt periode.</p>
          <h2 style={h2s}>Gjeldende lov</h2>
          <p style={ps}>Norsk lov gjelder. Tvister søkes løst i minnelighet; ellers ved Oslo tingrett.</p>
          <h2 style={h2s}>Kontakt</h2>
          <p style={ps}><a href="mailto:hei@arvklart.no" style={{ color: '#5F6E52' }}>hei@arvklart.no</a></p>
        </div>
      )}
    </div>
  )
}

// ── AccountPage ───────────────────────────────────────────────────────────────
export function AccountPage({ session, onToast }) {
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportData = async () => {
    setExporting(true)
    try {
      const [{ data: profile }, { data: interests }, { data: comments }] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', session.user.id).single(),
        supabase.from('interests').select('*, items(title)').eq('user_id', session.user.id),
        supabase.from('comments').select('*, items(title)').eq('user_id', session.user.id),
      ])
      const blob = new Blob([JSON.stringify({ profile, interests, comments, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'mine-data-arvklart.json'; a.click()
      onToast('Data lastet ned')
    } catch { onToast('Eksport feilet', 'error') }
    setExporting(false)
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${s.access_token}`, 'apikey': SUPABASE_ANON_KEY },
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Ukjent feil')
      await supabase.auth.signOut()
      navigate('/home')
    } catch (e) {
      onToast('Feil ved sletting: ' + e.message, 'error')
      setDeleting(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px', fontFamily: 'Karla, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '26px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>Min konto</h1>
      <p style={{ color: '#9C8267', fontSize: '14px', marginBottom: '32px' }}>{session.user.email}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>Last ned dine data</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>Last ned alle personopplysninger vi har om deg (profil, interesser, kommentarer) som JSON-fil.</p>
          <button onClick={exportData} disabled={exporting} style={{ padding: '10px 20px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
            {exporting ? 'Eksporterer…' : 'Last ned mine data'}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>Personvern og vilkår</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>Les vår personvernerklæring og vilkår for bruk av tjenesten.</p>
          <a href="/personvern" style={{ fontSize: '14px', color: '#5F6E52' }}>Åpne personvernerklæring →</a>
        </div>

        <div style={{ background: '#fff', border: '1px solid #F0D4D4', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#8B3A3A', marginBottom: '6px' }}>Slett konto</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>Sletter kontoen og alle personopplysninger permanent. Bo og gjenstander delt med andre beholdes.</p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ padding: '10px 20px', background: 'none', border: '1px solid #8B3A3A', color: '#8B3A3A', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>Slett min konto</button>
          ) : (
            <div>
              <p style={{ fontSize: '14px', color: '#8B3A3A', marginBottom: '12px', fontWeight: '500' }}>Er du helt sikker? Dette kan ikke angres.</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>Avbryt</button>
                <button onClick={deleteAccount} disabled={deleting} style={{ flex: 1, padding: '10px', background: '#8B3A3A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
                  {deleting ? 'Sletter…' : 'Ja, slett permanent'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
