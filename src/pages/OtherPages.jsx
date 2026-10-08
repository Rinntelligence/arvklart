// ── JoinPage ──────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { joinEstateByCode } from '../lib/joinEstate'
import { hasAiConsent, withdrawAiConsent } from '../lib/aiConsent'
import { L, isEn } from '../lib/lang'

const btn = { padding:'10px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'14px', fontFamily:'Karla, sans-serif' }
const h2 = { fontFamily:"'Fraunces', serif", fontSize:'22px', fontWeight:'400', color:'#3A2F26' }

export function JoinPage({ session, onToast }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!session) {
      // Huskes til brukeren har logget inn eller opprettet konto (se App)
      try { localStorage.setItem('pendingJoinCode', code) } catch { /* privat modus */ }
      navigate('/logg-inn', { replace: true })
      return
    }
    joinEstateByCode(code, session.user.email).then(({ estate, reason, error }) => {
      if (error) { setStatus(reason === 'invalid' ? 'invalid' : reason === 'not_invited' ? 'denied' : 'error'); setErrorMsg(error); return }
      onToast(L(`Ble med i "${estate.name}" ✓`, `Joined "${estate.name}" ✓`))
      navigate(`/estate/${estate.id}`, { replace: true })
    })
  }, [session?.user?.id, code])

  const titles = { denied: L('Du er ikke lagt til i dette boet', 'You have not been added to this estate'), invalid: L('Ugyldig invitasjonslenke', 'Invalid invite link'), error: L('Noe gikk galt', 'Something went wrong') }
  const texts = { invalid: L('Lenken kan ha blitt fornyet. Be den som administrerer boet om en ny.', 'The link may have been renewed. Ask the estate administrator for a new one.') }

  return (
    <div style={{ minHeight:'70vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FBF9F5', fontFamily:'Karla, sans-serif' }}>
      <div style={{ textAlign:'center', padding:'40px 20px', maxWidth:'460px' }}>
        {status === 'joining' ? (
          <h2 style={h2}>{L('Blir med i boet…', 'Joining the estate…')}</h2>
        ) : (
          <>
            <h2 style={h2}>{titles[status]}</h2>
            <p style={{ color:'#9C8267', marginTop:'8px', lineHeight:'1.5' }}>{texts[status] || errorMsg}</p>
            <button onClick={() => navigate('/')} style={{ ...btn, marginTop:'20px' }}>{L('Til mine bo', 'To my estates')}</button>
          </>
        )}
      </div>
    </div>
  )
}

export default JoinPage

// ── CategoriesPage ────────────────────────────────────────────────────────────
export function CategoriesPage({ onToast }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const [categories, setCategories] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const [newEmoji, setNewEmoji] = useState('📦')
  const [showPicker, setShowPicker] = useState(false)
  const EMOJIS = ['🛋️','🖼️','📚','🍳','🏺','📺','🧣','📦','🪑','🛏️','🪞','🎨','🎻','⌚','💍','🪴','🧸','🎁','🗝️','📷','🪆','🧩','🍷','🕰️','🪵','🧺','💻','🎭']

  const load = () => supabase.from('categories').select('*').eq('estate_id', id).order('label').then(({data})=>setCategories(data||[]))
  useEffect(()=>{load()},[id])

  const add = async () => {
    if (!newLabel.trim()) return
    const { error } = await supabase.from('categories').insert({ label:newLabel.trim(), emoji:newEmoji, estate_id:id })
    if (error) { onToast(L('Kunne ikke legge til kategorien', 'Could not add the category'), 'error'); return }
    setNewLabel(''); setNewEmoji('📦'); setShowPicker(false); onToast(L('Kategori lagt til ✓', 'Category added ✓')); load()
  }
  // Gjenstander i kategorien beholdes, men står uten kategori
  const remove = async (catId) => {
    const { data, error } = await supabase.from('categories').delete().eq('id', catId).select('id')
    if (error || !data?.length) { onToast(L('Kunne ikke fjerne kategorien. Bare administratorer kan gjøre det.', 'Could not remove the category. Only administrators can do that.'), 'error'); return }
    onToast(L('Kategori fjernet', 'Category removed')); load()
  }

  const input = { padding:'10px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'15px', background:'#FBF9F5', color:'#3A2F26', outline:'none', fontFamily:'Karla, sans-serif' }

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}/admin`)} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'13px', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til administrasjon', '← Back to administration')}</button>
      <h1 style={{ fontFamily:"'Fraunces', serif", fontSize:'24px', fontWeight:'400', color:'#3A2F26', marginBottom:'28px' }}>{L('Kategorier', 'Categories')}</h1>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
        <p style={{ fontSize:'13px', color:'#9C8267', marginBottom:'14px' }}>{L('Legg til ny kategori:', 'Add a new category:')}</p>
        <div style={{ display:'flex', gap:'8px', marginBottom: showPicker?'12px':'0' }}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{ ...input, padding:'10px 14px', cursor:'pointer', fontSize:'20px' }}>{newEmoji}</button>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder={L('Kategorinavn…', 'Category name…')} maxLength={100} style={{ ...input, flex:1, minWidth:0 }} />
          <button onClick={add} disabled={!newLabel.trim()} style={{ padding:'10px 18px', background:newLabel.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newLabel.trim()?'pointer':'not-allowed', fontSize:'14px', fontFamily:'Karla, sans-serif' }}>+</button>
        </div>
        {showPicker && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'12px', background:'#E8DFD0', borderRadius:'8px' }}>
            {EMOJIS.map(e=>(<button key={e} onClick={()=>{setNewEmoji(e);setShowPicker(false)}} style={{ fontSize:'20px', background:newEmoji===e?'#D9CFC0':'none', border:'none', cursor:'pointer', padding:'5px', borderRadius:'6px' }}>{e}</button>))}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
        {categories.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'#9C8267', fontSize:'14px' }}>{L('Ingen kategorier ennå. Legg til den første.', 'No categories yet. Add the first one.')}</div>
        )}
        {categories.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', padding:'14px 20px', borderBottom:i<categories.length-1?'1px solid #E8DFD0':'none' }}>
            <span style={{ fontSize:'20px', marginRight:'14px' }}>{c.emoji}</span>
            <span style={{ flex:1, fontSize:'15px', color:'#3A2F26' }}>{c.label}</span>
            <button onClick={()=>remove(c.id)} title={L('Fjern kategori', 'Remove category')} style={{ background:'none', border:'none', color:'#9C8267', cursor:'pointer', fontSize:'20px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── PrivacyPage ───────────────────────────────────────────────────────────────
// Fyll inn når selskapet er registrert; da vises navn og org.nr. som behandlingsansvarlig.
const COMPANY = { name: '', orgnr: '' }

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
            <strong>{L('Behandlingsansvarlig:', 'Data controller:')}</strong> {COMPANY.name ? `${COMPANY.name}${COMPANY.orgnr ? `, ${L('org.nr.', 'org. no.')} ${COMPANY.orgnr}` : ''}` : 'ArvKlart'} · {L('kontakt', 'contact')}: admin@arvklart.no
          </p>
          <h2 style={h2s}>{L('Hva vi samler inn', 'What we collect')}</h2>
          <ul>
            <li style={lis}><strong>{L('Kontoopplysninger:', 'Account details:')}</strong> {L('navn og e-postadresse ved registrering.', 'name and email address at registration.')}</li>
            <li style={lis}><strong>{L('Bo-innhold:', 'Estate content:')}</strong> {L('bilder, beskrivelser og anslåtte verdier av gjenstander.', 'photos, descriptions and estimated values of items.')}</li>
            <li style={lis}><strong>{L('Interesser, «nei takk» og kommentarer', 'Interests, «no thanks» and comments')}</strong> {L('du registrerer på gjenstander.', 'you register on items.')}</li>
            <li style={lis}><strong>{L('Dokumenter', 'Documents')}</strong> {L('du laster opp i boets dokumenthvelv, og arvinger med e-post som administratoren legger inn.', 'you upload to the estate\'s document vault, and heirs with email addresses added by the administrator.')}</li>
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
            <li style={lis}><strong>Anthropic PBC (USA)</strong> — {L('AI-analyse av bilder og verdiestimat, kun ved ditt eksplisitte samtykke. Anthropic bruker ikke API-data til modelltrening. Se', 'AI analysis of photos and value estimates, only with your explicit consent. Anthropic does not use API data for model training. See')} <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('Anthropics personvernerklæring', "Anthropic's privacy policy")}</a>.</li>
          </ul>
          <h2 style={h2s}>{L('Lagringstid', 'Retention period')}</h2>
          <p style={ps}>{L('Opplysninger lagres så lenge kontoen er aktiv. Ved kontosletting slettes personopplysningene dine med en gang, med unntak av det vi er rettslig forpliktet til å oppbevare. Bo du deler med andre beholdes for dem, men navnet ditt fjernes. Når et bo avsluttes, slettes det med alle bilder og dokumenter etter 12 måneder.', 'Data is stored for as long as the account is active. When you delete your account, your personal data is deleted immediately, except what we are legally obliged to keep. Estates you share with others are kept for them, but your name is removed. When an estate is closed, it is deleted with all photos and documents after 12 months.')}</p>
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
          <p style={ps}>{L('Tjenesten er gratis å bruke. Hvis vi senere innfører betalte abonnementer, varsles det i god tid, og betalte abonnementer faktureres forskuddsvis uten refusjon for påbegynt periode.', 'The service is free to use. If we introduce paid subscriptions later, this will be announced well in advance, and paid subscriptions will be billed in advance with no refund for a period that has started.')}</p>
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
  const [aiConsent, setAiConsent] = useState(hasAiConsent)

  // Alt som er knyttet til brukeren: profil, bo, interesser, nei takk, kommentarer,
  // gjenstander og dokumenter brukeren har lagt inn, og tilbakemeldinger.
  const exportData = async () => {
    setExporting(true)
    try {
      const uid = session.user.id
      const results = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('estate_members').select('role, joined_at, estates(name)').eq('user_id', uid),
        supabase.from('interests').select('*, items(title)').eq('user_id', uid),
        supabase.from('item_passes').select('created_at, items(title)').eq('user_id', uid),
        supabase.from('comments').select('*, items(title)').eq('user_id', uid),
        supabase.from('items').select('title, description, estimated_value, created_at, estates(name)').eq('added_by', uid),
        supabase.from('documents').select('name, folder, created_at, estates(name)').eq('uploaded_by', uid),
        supabase.from('feedback').select('type, content, nps_score, created_at').eq('user_id', uid),
      ])
      const failed = results.find(r => r.error)
      if (failed) throw failed.error
      const [profile, estates, interests, passes, comments, items, documents, feedback] = results.map(r => r.data)
      const { buildDataExportPdf } = await import('../lib/dataExportPdf')
      buildDataExportPdf({ email: session.user.email, profile, estates, interests, passes, comments, items, documents, feedback }).save(L('mine-data-arvklart.pdf', 'my-data-arvklart.pdf'))
      onToast(L('Data lastet ned', 'Data downloaded'))
    } catch (e) {
      console.error('Eksport feilet:', e)
      // Etter en ny versjon av appen kan en gammel fane mangle eksportmodulen
      onToast(String(e?.message || '').includes('dynamically imported module') ? L('Eksport feilet – last siden på nytt og prøv igjen', 'Export failed – reload the page and try again') : L('Eksport feilet', 'Export failed'), 'error')
    }
    setExporting(false)
  }

  const deleteAccount = async () => {
    setDeleting(true)
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { method: 'POST' })
      if (error || !data?.success) throw new Error(data?.error || error?.message || L('Ukjent feil', 'Unknown error'))
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
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Last ned personopplysningene vi har om deg som PDF: profil, bo du er med i, interesser, kommentarer, gjenstander og dokumenter du har lagt inn, og tilbakemeldinger.', 'Download the personal data we hold about you as a PDF: profile, estates you belong to, interests, comments, items and documents you have added, and feedback.')}</p>
          <button onClick={exportData} disabled={exporting} style={{ padding: '10px 20px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
            {exporting ? L('Eksporterer…', 'Exporting…') : L('Last ned mine data', 'Download my data')}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Samtykke til AI-analyse', 'Consent to AI analysis')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>
            {aiConsent
              ? L('Du har samtykket til at bilder og beskrivelser sendes til Anthropic når du bruker AI-analyse eller verdiestimat i denne nettleseren.', 'You have consented to photos and descriptions being sent to Anthropic when you use AI analysis or value estimates in this browser.')
              : L('Du har ikke gitt samtykke til AI-analyse i denne nettleseren. Du blir spurt første gang du bruker funksjonen.', 'You have not consented to AI analysis in this browser. You will be asked the first time you use the feature.')}
          </p>
          {aiConsent && (
            <button onClick={() => { withdrawAiConsent(); setAiConsent(false); onToast(L('Samtykket er trukket tilbake', 'Your consent has been withdrawn')) }} style={{ padding: '9px 18px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>{L('Trekk tilbake samtykket', 'Withdraw consent')}</button>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Personvern og vilkår', 'Privacy and terms')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>{L('Les vår personvernerklæring og vilkår for bruk av tjenesten.', 'Read our privacy policy and terms of use for the service.')}</p>
          <a href="/personvern" style={{ fontSize: '14px', color: '#5F6E52' }}>{L('Åpne personvernerklæring →', 'Open privacy policy →')}</a>
        </div>

        <div style={{ background: '#fff', border: '1px solid #F0D4D4', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#8B3A3A', marginBottom: '6px' }}>{L('Slett konto', 'Delete account')}</h2>
          <p style={{ fontSize: '14px', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Sletter kontoen og personopplysningene dine permanent. Bo du er alene om, slettes med bilder og dokumenter. Bo du deler med andre, beholdes for dem uten navnet ditt; er du eneste administrator, overtar den som har vært lengst med.', 'Permanently deletes your account and personal data. Estates where you are the only member are deleted with photos and documents. Estates you share with others are kept for them without your name; if you are the only administrator, the longest-standing member takes over.')}</p>
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
