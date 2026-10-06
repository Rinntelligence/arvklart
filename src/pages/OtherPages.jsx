// ── JoinPage ──────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { joinEstateByCode } from '../lib/joinEstate'
import { L, isEn } from '../lib/lang'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function JoinPage({ session, onToast }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!session) { localStorage.setItem('pendingJoinCode', code); navigate('/'); return }
    const join = async () => {
      const { estate, reason, error } = await joinEstateByCode(code, session.user.email)
      if (error) { setStatus(reason === 'invalid' ? 'invalid' : 'denied'); setErrorMsg(error); return }
      onToast(L(`Ble med i "${estate.name}" ✓`, `Joined "${estate.name}" ✓`))
      navigate(`/estate/${estate.id}`)
    }
    join()
  }, [session])

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif' }}>
      <div style={{ textAlign:'center', padding:'40px' }}>
        {status === 'denied'
          ? <><h2 style={{ fontFamily:"'Fraunces', serif", fontSize:'22px', fontWeight:'400', color:'#3A2F26' }}>{L('Du er ikke lagt til i dette boet', 'You have not been added to this estate')}</h2><p style={{ color:'#9C8267', marginTop:'8px', maxWidth:'420px', lineHeight:'1.5' }}>{errorMsg}</p><button onClick={() => navigate('/')} style={{ marginTop:'20px', padding:'10px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>{L('Til mine bo', 'To my estates')}</button></>
          : status === 'invalid'
          ? <><div style={{ fontSize:'48px', marginBottom:'16px' }}>❌</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>{L('Ugyldig invitasjonslenke', 'Invalid invite link')}</h2><p style={{ color:'#8c7b6b', marginTop:'8px' }}>{L('Denne lenken kan ha utløpt eller blitt fornyet.', 'This link may have expired or been renewed.')}</p></>
          : <><div style={{ fontSize:'48px', marginBottom:'16px' }}>⏳</div><h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'22px', fontWeight:'400', color:'#1a1410' }}>{L('Blir med i boet…', 'Joining the estate…')}</h2></>}
      </div>
    </div>
  )
}

export default JoinPage

// ── PricingPage ───────────────────────────────────────────────────────────────
export function PricingPage({ session }) {
  const navigate = useNavigate()
  const plans = [
    { name:'Free', price:'$0', period:L('for alltid','forever'), color:'#e8e0d6',
      features:[L('Maks 10 gjenstander','10 items max'),L('3 familiemedlemmer','3 family members'),L('Opplasting av bilder','Photo upload'),L('Interesse + begrunnelse','Interest + reason'),L('Enkel oversikt','Basic overview')],
      missing:[L('Dashbord og analyse','Dashboard analytics'),L('Kommentarer','Comments'),L('PDF-rapport','PDF report'),L('Ubegrenset antall gjenstander','Unlimited items'),'White-label'] },
    { name:'Family', price:'$9', period:L('/mnd eller $49/år','/month or $49/year'), color:'#6b8fa8', popular:true,
      features:[L('Alt i Free','Everything in Free'),L('Ubegrenset antall gjenstander','Unlimited items'),L('Ubegrenset antall medlemmer','Unlimited members'),L('Dashbord og analyse','Dashboard & analytics'),L('Kommentarer per gjenstand','Comments per item'),L('PDF-rapport over fordelingen','PDF distribution report'),L('Offisiell tildeling av gjenstander','Officially assign items')],
      missing:[L('Egen merkevare (white-label)','White-label branding'),L('Flere bo','Multiple estates')] },
    { name:'Business', price:'$99', period:L('/mnd eller $799/år','/month or $799/year'), color:'#c4855a',
      features:[L('Alt i Family','Everything in Family'),L('Opptil 15 aktive bo','Up to 15 active estates'),L('Administrasjonsdashbord','Admin dashboard'),L('Send invitasjonslenker','Send invite links'),L('Egen logo og farger','Custom logo & colors'),L('Aktivitetslogg per bo','Activity log per estate'),L('E-postvarsler','Email notifications')],
      missing:[L('Ubegrenset antall bo','Unlimited estates'),L('API-tilgang','API access')] },
    { name:'Enterprise', price:'$299', period:L('/mnd eller $2 990/år','/month or $2,990/year'), color:'#1a1410',
      features:[L('Alt i Business','Everything in Business'),L('Ubegrenset antall bo','Unlimited estates'),L('API-tilgang','API access'),L('Dedikert oppstartshjelp','Dedicated onboarding'),L('SLA-garanti','SLA guarantee'),L('Betaling med faktura','Invoice billing'),L('Flere administratorer','Multi-admin management'),L('Tilpassede integrasjoner','Custom integrations')],
      missing:[] },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#f8f5f0', fontFamily:'DM Sans, sans-serif', padding:'48px 16px' }}>
      <div style={{ maxWidth:'940px', margin:'0 auto' }}>
        <div style={{ textAlign:'center', marginBottom:'48px' }}>
          <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'36px', fontWeight:'400', color:'#1a1410', marginBottom:'12px' }}>{L('Enkle, ærlige priser', 'Simple, honest pricing')}</h1>
          <p style={{ color:'#8c7b6b', fontSize:'16px' }}>{L('Start gratis. Oppgrader når du trenger mer.', 'Start free. Upgrade when you need more.')}</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(210px,1fr))', gap:'16px' }}>
          {plans.map(p => (
            <div key={p.name} style={{ background:'#fff', border: p.popular?`2px solid ${p.color}`:'1px solid #e8e0d6', borderRadius:'14px', padding:'28px', position:'relative' }}>
              {p.popular && <div style={{ position:'absolute', top:'-12px', left:'50%', transform:'translateX(-50%)', background:p.color, color:'#fff', fontSize:'11px', padding:'3px 12px', borderRadius:'20px', whiteSpace:'nowrap' }}>{L('Mest populær', 'Most popular')}</div>}
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:p.color, marginBottom:'16px' }} />
              <h2 style={{ fontFamily:'Playfair Display, serif', fontSize:'20px', fontWeight:'400', color:'#1a1410', marginBottom:'4px' }}>{p.name}</h2>
              <div style={{ fontSize:'28px', color:'#1a1410', marginBottom:'4px', fontFamily:'Playfair Display, serif' }}>{p.price}</div>
              <div style={{ fontSize:'12px', color:'#a89080', marginBottom:'20px' }}>{p.period}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'24px' }}>
                {p.features.map(f=><div key={f} style={{ fontSize:'13px', color:'#4a3c30', display:'flex', gap:'8px' }}><span style={{ color:'#7aaa7a' }}>✓</span>{f}</div>)}
                {p.missing.map(f=><div key={f} style={{ fontSize:'13px', color:'#c0b0a0', display:'flex', gap:'8px' }}><span>—</span>{f}</div>)}
              </div>
              <button onClick={()=>session?window.location.href='mailto:admin@arvklart.no?subject=Oppgradering til ' + p.name:navigate('/')} style={{ width:'100%', padding:'11px', background:p.name==='Free'?'#f5f0eb':p.color, color:p.name==='Free'?'#1a1410':'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'DM Sans, sans-serif' }}>
                {p.name==='Free'?L('Kom i gang gratis','Get started free'):L(`Få ${p.name}`, `Get ${p.name}`)}
              </button>
            </div>
          ))}
        </div>
        <p style={{ textAlign:'center', marginTop:'32px', fontSize:'13px', color:'#a89080' }}>
          {L('Spørsmål? Send oss en e-post på', 'Questions? Email us at')} <a href="mailto:admin@arvklart.no" style={{ color:'#c4855a' }}>admin@arvklart.no</a>
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
    setNewLabel(''); setNewEmoji('📦'); setShowPicker(false); onToast(L('Kategori lagt til ✓', 'Category added ✓')); load()
  }
  const remove = async (catId) => {
    await supabase.from('categories').delete().eq('id', catId)
    onToast(L('Kategori fjernet', 'Category removed')); load()
  }

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', padding:'28px 16px', fontFamily:'DM Sans, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}/admin`)} style={{ background:'none', border:'none', color:'#8c7b6b', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'DM Sans, sans-serif' }}>{L('← Tilbake til administrasjon', '← Back to administration')}</button>
      <h1 style={{ fontFamily:'Playfair Display, serif', fontSize:'24px', fontWeight:'400', color:'#1a1410', marginBottom:'28px' }}>{L('Kategorier', 'Categories')}</h1>

      <div style={{ background:'#fff', border:'1px solid #e8e0d6', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', color:'#8c7b6b', marginBottom:'14px' }}>{L('Legg til ny kategori:', 'Add a new category:')}</p>
        <div style={{ display:'flex', gap:'8px', marginBottom: showPicker?'12px':'0' }}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{ padding:'10px 14px', border:'1px solid #e0d8d0', borderRadius:'8px', background:'#faf7f3', cursor:'pointer', fontSize:'20px' }}>{newEmoji}</button>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder={L('Kategorinavn…', 'Category name…')} maxLength={100}
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
          <div style={{ padding:'24px', textAlign:'center', color:'#a89080', fontSize:'14px' }}>{L('Ingen kategorier ennå. Legg til den første.', 'No categories yet. Add the first one.')}</div>
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
  const [tab, setTab] = useState(() => window.location.hash === '#vilkar' ? 'terms' : 'privacy')

  const switchTab = (key) => {
    setTab(key)
    window.history.replaceState(null, '', key === 'terms' ? '#vilkar' : '#')
  }
  const s = { fontFamily: 'Karla, sans-serif', maxWidth: '720px', margin: '0 auto', padding: '40px 20px 80px', color: '#3A2F26', lineHeight: '1.8' }
  const h2s = { fontFamily: 'Fraunces, serif', fontSize: '20px', fontWeight: '400', marginTop: '32px', marginBottom: '8px', color: '#3A2F26' }
  const ps = { fontSize: '15px', color: '#5C4530', marginBottom: '12px' }
  const lis = { fontSize: '15px', color: '#5C4530', marginBottom: '6px' }
  return (
    <div style={s}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '28px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Juridisk', 'Legal')}</h1>
      <p style={{ color: '#9C8267', fontSize: '14px', marginBottom: '28px' }}>{L('Sist oppdatert: september 2026', 'Last updated: September 2026')}</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '1px solid #E8DFD0', paddingBottom: '16px' }}>
        {[['privacy', L('Personvernerklæring', 'Privacy policy')], ['terms', L('Vilkår for bruk', 'Terms of use')]].map(([key, label]) => (
          <button key={key} onClick={() => switchTab(key)} style={{ padding: '8px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Karla, sans-serif', fontSize: '14px', background: tab === key ? '#3A2F26' : '#E8DFD0', color: tab === key ? '#FBF9F5' : '#5C4530' }}>{label}</button>
        ))}
      </div>

      {isEn() && (
        <p style={{ ...ps, fontSize: '13px', color: '#9C8267' }}>This is an English translation. If the Norwegian and English versions differ, the Norwegian version applies.</p>
      )}

      {tab === 'privacy' && (
        <div>
          <p style={ps}>{L('Denne personvernerklæringen beskriver hvordan ArvKlart («vi», «oss», «tjenesten») behandler personopplysninger om deg som bruker.', 'This privacy policy describes how ArvKlart (“we”, “us”, “the service”) processes personal data about you as a user.')}</p>
          <p style={{ ...ps, background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '8px', padding: '12px 16px' }}>
            <strong>{L('Behandlingsansvarlig:', 'Data controller:')}</strong> [SELSKAPSNAVN AS], {L('org.nr.', 'org. no.')} [ORGNR] · {L('kontakt', 'contact')}: admin@arvklart.no
          </p>
          <h2 style={h2s}>{L('Hva vi samler inn', 'What we collect')}</h2>
          <ul>
            <li style={lis}><strong>{L('Kontoopplysninger:', 'Account details:')}</strong> {L('navn og e-postadresse ved registrering.', 'name and email address at registration.')}</li>
            <li style={lis}><strong>{L('Bo-innhold:', 'Estate content:')}</strong> {L('bilder, beskrivelser og anslåtte verdier av gjenstander.', 'photos, descriptions and estimated values of items.')}</li>
            <li style={lis}><strong>{L('Interesser og kommentarer', 'Interests and comments')}</strong> {L('du registrerer på gjenstander.', 'you register on items.')}</li>
            <li style={lis}><strong>{L('Tekniske data:', 'Technical data:')}</strong> {L('IP-adresse og innloggingstidspunkt, behandlet av infrastrukturleverandøren.', 'IP address and login time, processed by the infrastructure provider.')}</li>
          </ul>
          <h2 style={h2s}>{L('Grunnlag og formål', 'Legal basis and purpose')}</h2>
          <ul>
            <li style={lis}><strong>{L('Avtaleutførelse', 'Performance of contract')}</strong> {L('(GDPR art. 6 nr. 1 b): levering av tjenesten du har bedt om.', '(GDPR Art. 6(1)(b)): delivering the service you have requested.')}</li>
            <li style={lis}><strong>{L('Berettiget interesse', 'Legitimate interest')}</strong> {L('(GDPR art. 6 nr. 1 f): sikkerhet og feilsøking.', '(GDPR Art. 6(1)(f)): security and troubleshooting.')}</li>
            <li style={lis}><strong>{L('Samtykke', 'Consent')}</strong> {L('(GDPR art. 6 nr. 1 a): AI-analyse av bilder — du gir samtykke eksplisitt ved bruk av denne funksjonen.', '(GDPR Art. 6(1)(a)): AI analysis of photos — you give explicit consent when using this feature.')}</li>
          </ul>
          <h2 style={h2s}>{L('Tredjeparter som mottar data', 'Third parties that receive data')}</h2>
          <ul>
            <li style={lis}><strong>Supabase Inc. (USA)</strong> — {L('database og autentisering. Databehandleravtale inngått. Data lagres i EU (Frankfurt, AWS eu-central-1).', 'database and authentication. Data processing agreement in place. Data is stored in the EU (Frankfurt, AWS eu-central-1).')}</li>
            <li style={lis}><strong>Vercel Inc. (USA)</strong> — {L('hosting av webapplikasjonen. Databehandleravtale inngått.', 'hosting of the web application. Data processing agreement in place.')}</li>
            <li style={lis}><strong>Anthropic PBC (USA)</strong> — {L('AI-bildeanalyse, kun ved ditt eksplisitte samtykke. Anthropic bruker ikke API-data til modelltrening. Se', 'AI photo analysis, only with your explicit consent. Anthropic does not use API data for model training. See')} <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('Anthropics personvernerklæring', "Anthropic's privacy policy")}</a>.</li>
          </ul>
          <h2 style={h2s}>{L('Lagringstid', 'Retention period')}</h2>
          <p style={ps}>{L('Opplysninger lagres så lenge kontoen er aktiv. Ved kontosletting slettes personopplysninger innen 30 dager, med unntak av det vi er rettslig forpliktet til å oppbevare.', 'Data is stored for as long as the account is active. When an account is deleted, personal data is deleted within 30 days, except for what we are legally required to retain.')}</p>
          <h2 style={h2s}>{L('Dine rettigheter', 'Your rights')}</h2>
          <p style={ps}>{L('Du har rett til innsyn, retting, sletting, dataportabilitet og å protestere mot behandlingen. Utøv disse via «Min konto» i appen, eller kontakt oss på admin@arvklart.no. Du kan klage til', 'You have the right to access, rectification, erasure, data portability and to object to the processing. Exercise these via «My account» in the app, or contact us at admin@arvklart.no. You can complain to')} <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('Datatilsynet', 'Datatilsynet (the Norwegian Data Protection Authority)')}</a>.</p>
          <h2 style={h2s}>{L('Sikkerhet', 'Security')}</h2>
          <p style={ps}>{L('All kommunikasjon er TLS-kryptert. Data er kryptert i ro. Tilgang til produksjonsdata er begrenset til autorisert personell.', 'All communication is TLS encrypted. Data is encrypted at rest. Access to production data is limited to authorised personnel.')}</p>
          <h2 style={h2s}>{L('Endringer', 'Changes')}</h2>
          <p style={ps}>{L('Vesentlige endringer varsles på e-post minst 30 dager i forkant.', 'Material changes are announced by email at least 30 days in advance.')}</p>
          <h2 style={h2s}>{L('Kontakt', 'Contact')}</h2>
          <p style={ps}><a href="mailto:admin@arvklart.no" style={{ color: '#5F6E52' }}>admin@arvklart.no</a></p>
        </div>
      )}

      {tab === 'terms' && (
        <div>
          <p style={ps}>{L('Ved å opprette konto og bruke ArvKlart godtar du disse vilkårene.', 'By creating an account and using ArvKlart you accept these terms.')}</p>
          <h2 style={h2s}>{L('Tjenestebeskrivelse', 'Description of the service')}</h2>
          <p style={ps}>{L('ArvKlart er en digital plattform for registrering og fordeling av gjenstander i dødsbo. Tjenesten er et hjelpeverktøy og erstatter ikke juridisk rådgivning, testament eller bindende arveavtaler.', "ArvKlart is a digital platform for registering and distributing items in a deceased person's estate. The service is a support tool and does not replace legal advice, a will or binding inheritance agreements.")}</p>
          <h2 style={h2s}>{L('Konto og ansvar', 'Account and responsibility')}</h2>
          <ul>
            <li style={lis}>{L('Du er ansvarlig for å holde innloggingsdetaljene sikre.', 'You are responsible for keeping your login details secure.')}</li>
            <li style={lis}>{L('Du er ansvarlig for innhold du laster opp og bekrefter at du har rett til å dele det.', 'You are responsible for the content you upload and confirm that you have the right to share it.')}</li>
            <li style={lis}>{L('Tjenesten kan ikke brukes til ulovlige formål.', 'The service may not be used for unlawful purposes.')}</li>
          </ul>
          <h2 style={h2s}>{L('Tilgjengelighet og endringer', 'Availability and changes')}</h2>
          <p style={ps}>{L('Vi tilstreber høy oppetid, men garanterer ikke 100 % tilgjengelighet. Vi forbeholder oss retten til å endre eller avslutte tjenesten med rimelig varsel.', 'We aim for high uptime but do not guarantee 100% availability. We reserve the right to change or discontinue the service with reasonable notice.')}</p>
          <h2 style={h2s}>{L('Ansvarsfraskrivelse', 'Disclaimer')}</h2>
          <p style={ps}>{L('Verdiestimat fra AI er veiledende og ikke profesjonell takst. Vi er ikke ansvarlige for beslutninger tatt på bakgrunn av estimater. Tjenesten leveres «som den er» uten garantier utover ufravikelig lovgivning.', 'AI value estimates are indicative and not a professional appraisal. We are not responsible for decisions made on the basis of estimates. The service is provided “as is” without warranties beyond mandatory law.')}</p>
          <h2 style={h2s}>{L('Abonnement og betaling', 'Subscription and payment')}</h2>
          <p style={ps}>{L('Gratis-tieren er gratis uten tidsbegrensning. Betalte abonnementer faktureres forskuddsvis. Refusjon gis ikke for påbegynt periode.', 'The free tier is free with no time limit. Paid subscriptions are billed in advance. No refund is given for a period that has started.')}</p>
          <h2 style={h2s}>{L('Gjeldende lov', 'Governing law')}</h2>
          <p style={ps}>{L('Norsk lov gjelder. Tvister søkes løst i minnelighet; ellers ved Oslo tingrett.', 'Norwegian law applies. Disputes shall be resolved amicably if possible; otherwise by Oslo District Court.')}</p>
          <h2 style={h2s}>{L('Kontakt', 'Contact')}</h2>
          <p style={ps}><a href="mailto:admin@arvklart.no" style={{ color: '#5F6E52' }}>admin@arvklart.no</a></p>
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
      const { buildDataExportPdf } = await import('../lib/dataExportPdf')
      buildDataExportPdf({ email: session.user.email, profile, interests, comments }).save(L('mine-data-arvklart.pdf', 'my-data-arvklart.pdf'))
      onToast(L('Data lastet ned', 'Data downloaded'))
    } catch { onToast(L('Eksport feilet', 'Export failed'), 'error') }
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
      if (!result.success) throw new Error(result.error || L('Ukjent feil', 'Unknown error'))
      await supabase.auth.signOut()
      navigate('/home')
    } catch (e) {
      onToast(L('Feil ved sletting: ', 'Error deleting: ') + e.message, 'error')
      setDeleting(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px', fontFamily: 'Karla, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '26px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Min konto', 'My account')}</h1>
      <p style={{ color: '#9C8267', fontSize: '14px', marginBottom: '32px' }}>{session.user.email}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Last ned dine data', 'Download your data')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Last ned alle personopplysninger vi har om deg (profil, interesser, kommentarer) som PDF.', 'Download all personal data we hold about you (profile, interests, comments) as a PDF.')}</p>
          <button onClick={exportData} disabled={exporting} style={{ padding: '10px 20px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
            {exporting ? L('Eksporterer…', 'Exporting…') : L('Last ned mine data', 'Download my data')}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Personvern og vilkår', 'Privacy and terms')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>{L('Les vår personvernerklæring og vilkår for bruk av tjenesten.', 'Read our privacy policy and terms of use for the service.')}</p>
          <a href="/personvern" style={{ fontSize: '14px', color: '#5F6E52' }}>{L('Åpne personvernerklæring →', 'Open privacy policy →')}</a>
        </div>

        <div style={{ background: '#fff', border: '1px solid #F0D4D4', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#8B3A3A', marginBottom: '6px' }}>{L('Slett konto', 'Delete account')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Sletter kontoen og alle personopplysninger permanent. Bo og gjenstander delt med andre beholdes.', 'Permanently deletes your account and all personal data. Estates and items shared with others are kept.')}</p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ padding: '10px 20px', background: 'none', border: '1px solid #8B3A3A', color: '#8B3A3A', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>{L('Slett min konto', 'Delete my account')}</button>
          ) : (
            <div>
              <p style={{ fontSize: '14px', color: '#8B3A3A', marginBottom: '12px', fontWeight: '500' }}>{L('Er du helt sikker? Dette kan ikke angres.', 'Are you absolutely sure? This cannot be undone.')}</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>{L('Avbryt', 'Cancel')}</button>
                <button onClick={deleteAccount} disabled={deleting} style={{ flex: 1, padding: '10px', background: '#8B3A3A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
                  {deleting ? L('Sletter…', 'Deleting…') : L('Ja, slett permanent', 'Yes, delete permanently')}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
