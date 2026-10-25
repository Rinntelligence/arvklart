// ── JoinPage ──────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../lib/supabase'
import { joinEstateByCode } from '../lib/joinEstate'
import { hasAiConsent, withdrawAiConsent } from '../lib/aiConsent'
import { L, isEn, getLang } from '../lib/lang'
import { changeLanguage } from '../lib/languagePref'
import { isDemoSession } from '../lib/demo'
import { categoryLabel } from '../lib/categories'
import TextSizeControl from '../components/TextSizeControl'
import { PRIVACY_UPDATED } from '../lib/privacy'

const updatedText = () => new Date(`${PRIVACY_UPDATED}T12:00:00`).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })

const btn = { minHeight:'44px', padding:'10px 20px', background:'#3A2F26', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }
const h2 = { fontFamily:"'Fraunces', serif", fontSize:'1.375rem', fontWeight:'400', color:'#3A2F26' }

export function JoinPage({ session, onToast }) {
  const { code } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('joining')
  const [errorMsg, setErrorMsg] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [copied, setCopied] = useState(false)
  const email = session?.user?.email || ''

  // Feil konto: logg ut og inn med riktig e-post; koden huskes til etter innlogging
  const switchAccount = async () => {
    try { localStorage.setItem('pendingJoinCode', code) } catch { /* privat modus */ }
    await signOut()
    navigate('/logg-inn', { replace: true })
  }
  const copyEmail = () => { navigator.clipboard?.writeText(email); setCopied(true) }

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
  }, [session?.user?.id, code, attempt])

  const titles = { denied: L('Du er ikke lagt til i dette boet ennå', 'You have not been added to this estate yet'), invalid: L('Ugyldig invitasjonslenke', 'Invalid invite link'), error: L('Noe gikk galt', 'Something went wrong') }
  const texts = { invalid: L('Lenken kan ha blitt fornyet. Be den som administrerer boet om en ny.', 'The link may have been renewed. Ask the estate administrator for a new one.') }

  return (
    <div style={{ minHeight:'70vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#FBF9F5', fontFamily:'Karla, sans-serif' }}>
      <div style={{ textAlign:'center', padding:'40px 20px', maxWidth:'460px' }}>
        {status === 'joining' ? (
          <h2 style={h2}>{L('Blir med i boet…', 'Joining the estate…')}</h2>
        ) : (
          <>
            <h2 style={h2}>{titles[status]}</h2>
            {status === 'denied' ? (
              <div style={{ textAlign:'left', marginTop:'12px', color:'#3A2F26', lineHeight:1.6 }}>
                <p>{L('Du er logget inn som', 'You are logged in as')} <strong style={{ overflowWrap:'anywhere' }}>{email}</strong>.</p>
                <p style={{ marginTop:'8px' }}>{L('Den som administrerer boet, må legge til akkurat denne e-postadressen under «Arvinger». Send den gjerne til dem, og trykk «Prøv igjen» etterpå.', 'The estate administrator must add exactly this email address under «Heirs». You can send it to them, then tap «Try again».')}</p>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginTop:'16px' }}>
                  <button onClick={copyEmail} style={{ ...btn, background:'#fff', color:'#3A2F26', border:'1px solid #9A8B78' }}>{copied ? L('E-postadressen er kopiert ✓', 'Email address copied ✓') : L('Kopier e-postadressen min', 'Copy my email address')}</button>
                  <button onClick={() => { setStatus('joining'); setAttempt(a => a + 1) }} style={btn}>{L('Prøv igjen', 'Try again')}</button>
                  <button onClick={switchAccount} style={{ ...btn, background:'none', color:'#5F6E52', textDecoration:'underline' }}>{L('Logg inn med en annen e-post', 'Log in with another email')}</button>
                </div>
              </div>
            ) : (
              <p style={{ color:'#75604B', marginTop:'8px', lineHeight:'1.5' }}>{texts[status] || errorMsg}</p>
            )}
            <button onClick={() => navigate('/')} style={{ ...btn, marginTop:'20px', background:'none', color:'#5C4530', border:'1px solid #9A8B78' }}>{L('Til mine bo', 'To my estates')}</button>
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

  const input = { padding:'10px 14px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.9375rem', background:'#FBF9F5', color:'#3A2F26', fontFamily:'Karla, sans-serif' }

  return (
    <div style={{ maxWidth:'520px', margin:'0 auto', padding:'28px 16px', fontFamily:'Karla, sans-serif' }}>
      <button onClick={()=>navigate(`/estate/${id}/admin`)} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'0.8125rem', padding:'0 0 20px', fontFamily:'Karla, sans-serif' }}>{L('← Tilbake til administrasjon', '← Back to administration')}</button>
      <h1 style={{ fontFamily:"'Fraunces', serif", fontSize:'1.5rem', fontWeight:'400', color:'#3A2F26', marginBottom:'28px' }}>{L('Kategorier', 'Categories')}</h1>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'24px', marginBottom:'16px' }}>
        <p style={{ fontSize:'0.8125rem', color:'#75604B', marginBottom:'14px' }}>{L('Legg til ny kategori:', 'Add a new category:')}</p>
        <div style={{ display:'flex', gap:'8px', marginBottom: showPicker?'12px':'0' }}>
          <button onClick={()=>setShowPicker(!showPicker)} style={{ ...input, padding:'10px 14px', cursor:'pointer', fontSize:'1.25rem' }}>{newEmoji}</button>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()} placeholder={L('Kategorinavn…', 'Category name…')} maxLength={100} style={{ ...input, flex:1, minWidth:0 }} />
          <button onClick={add} disabled={!newLabel.trim()} style={{ padding:'10px 18px', background:newLabel.trim()?'#3A2F26':'#D9CFC0', color:'#FBF9F5', border:'none', borderRadius:'8px', cursor:newLabel.trim()?'pointer':'not-allowed', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>+</button>
        </div>
        {showPicker && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', padding:'12px', background:'#E8DFD0', borderRadius:'8px' }}>
            {EMOJIS.map(e=>(<button key={e} onClick={()=>{setNewEmoji(e);setShowPicker(false)}} style={{ fontSize:'1.25rem', background:newEmoji===e?'#D9CFC0':'none', border:'none', cursor:'pointer', padding:'5px', borderRadius:'6px' }}>{e}</button>))}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
        {categories.length === 0 && (
          <div style={{ padding:'24px', textAlign:'center', color:'#75604B', fontSize:'0.875rem' }}>{L('Ingen kategorier ennå. Legg til den første.', 'No categories yet. Add the first one.')}</div>
        )}
        {categories.map((c,i)=>(
          <div key={c.id} style={{ display:'flex', alignItems:'center', padding:'14px 20px', borderBottom:i<categories.length-1?'1px solid #E8DFD0':'none' }}>
            <span style={{ fontSize:'1.25rem', marginRight:'14px' }}>{c.emoji}</span>
            <span style={{ flex:1, fontSize:'0.9375rem', color:'#3A2F26' }}>{categoryLabel(c.label)}</span>
            <button onClick={()=>remove(c.id)} title={L('Fjern kategori', 'Remove category')} style={{ background:'none', border:'none', color:'#75604B', cursor:'pointer', fontSize:'1.25rem' }}>×</button>
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
  const h2s = { fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: '400', marginTop: '32px', marginBottom: '8px', color: '#3A2F26' }
  const ps = { fontSize: '0.9375rem', color: '#5C4530', marginBottom: '12px' }
  const lis = { fontSize: '0.9375rem', color: '#5C4530', marginBottom: '6px' }
  return (
    <div style={s}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.75rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Juridisk', 'Legal')}</h1>
      <p style={{ color: '#75604B', fontSize: '0.875rem', marginBottom: '28px' }}>{L(`Sist oppdatert: ${updatedText()}`, `Last updated: ${updatedText()}`)}</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '1px solid #E8DFD0', paddingBottom: '16px' }}>
        {[['privacy', L('Personvernerklæring', 'Privacy policy')], ['terms', L('Vilkår for bruk', 'Terms of use')]].map(([key, label]) => (
          <button key={key} onClick={() => switchTab(key)} style={{ padding: '8px 18px', borderRadius: '20px', border: 'none', cursor: 'pointer', fontFamily: 'Karla, sans-serif', fontSize: '0.875rem', background: tab === key ? '#3A2F26' : '#E8DFD0', color: tab === key ? '#FBF9F5' : '#5C4530' }}>{label}</button>
        ))}
      </div>

      {isEn() && (
        <p style={{ ...ps, fontSize: '0.8125rem', color: '#75604B' }}>This is an English translation. If the Norwegian and English versions differ, the Norwegian version applies.</p>
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
            <li style={lis}><strong>{L('Bo-innhold:', 'Estate content:')}</strong> {L('bilder, beskrivelser og anslåtte verdier av gjenstander, og AI-vurderingen av bildene (hva AI-en så, og rettelser dere gjør). Bildene er private: de vises bare for medlemmer av boet, via lenker som utløper etter kort tid.', 'photos, descriptions and estimated values of items, and the AI assessment of the photos (what the AI saw, and corrections you make). Photos are private: they are only shown to members of the estate, through links that expire after a short time.')}</li>
            <li style={lis}><strong>{L('Interesser, «nei takk» og kommentarer', 'Interests, «no thanks» and comments')}</strong> {L('du registrerer på gjenstander.', 'you register on items.')}</li>
            <li style={lis}><strong>{L('Fordelingen:', 'The distribution:')}</strong> {L('en logg over tildelinger, loddtrekninger, fordelingsverdier og valg for gjenstander ingen vil ha, og forslag til fordeling med hvem som har godkjent eller sagt fra (navn fra listen over personer i boet, konto-e-post og tidspunkt), samt registrerte fullmakter og verger med grunnlag. Godkjenningene registreres av innloggede brukere (e-post og passord); Arvklart verifiserer ikke identitet med BankID. Loggen og godkjenningene kan ikke endres i appen. Sletter du kontoen, fjernes e-posten din og koblingen til kontoen din fra dem. Navnet ditt slik det står på listen over personer i boet, og det som er registrert om fordelingen, blir stående i boet til boet slettes.', 'a log of assignments, draws, distribution values and choices for items no one wants, and proposed distributions with who approved or objected (name from the list of people in the estate, account email and time), plus registered powers of attorney and guardians with their basis. Approvals are registered by signed-in users (email and password); Arvklart does not verify identity with BankID. The log and approvals cannot be changed in the app. If you delete your account, your email and the link to your account are removed from them. Your name as it appears on the list of people in the estate, and what has been registered about the distribution, remain in the estate until the estate is deleted.')}</li>
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
            <li style={lis}><strong>Supabase Inc. (USA)</strong> — {L('database, fillagring og innlogging. Behandler data på våre vegne etter Supabases databehandleravtale, som er en del av Supabases tjenestevilkår. Databasen og filene lagres i EU (Frankfurt, AWS eu-central-1).', 'database, file storage and login. Processes data on our behalf under Supabase\'s data processing agreement, which is part of Supabase\'s terms of service. The database and files are stored in the EU (Frankfurt, AWS eu-central-1).')}</li>
            <li style={lis}><strong>Vercel Inc. (USA)</strong> — {L('levering av nettsiden (hosting). Vercel mottar tekniske opplysninger som IP-adresse når du åpner appen.', 'delivery of the website (hosting). Vercel receives technical information such as your IP address when you open the app.')}</li>
            <li style={lis}><strong>Anthropic PBC (USA)</strong> — {L('AI-analyse av bilder og verdiestimat, bare når du har samtykket. Bildene og beskrivelsen sendes, men ikke navnet eller e-posten din. Anthropic bruker som standard ikke data fra API-et til å trene modeller. Dataene slettes som hovedregel innen 30 dager, men kan oppbevares lenger ved mistanke om brudd på bruksvilkårene eller når loven krever det. Se', 'AI analysis of photos and value estimates, only when you have consented. The photos and description are sent, but not your name or email. By default, Anthropic does not use data from the API to train models. As a rule the data is deleted within 30 days, but it may be kept longer if a breach of the usage policy is suspected or the law requires it. See')} <a href="https://www.anthropic.com/privacy" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('Anthropics personvernerklæring', "Anthropic's privacy policy")}</a>.</li>
          </ul>
          <h2 style={h2s}>{L('Lagringstid', 'Retention period')}</h2>
          <p style={ps}>{L('Opplysninger lagres så lenge kontoen er aktiv. Ved kontosletting slettes personopplysningene dine fra tjenesten med en gang, og fra sikkerhetskopiene når disse utløper, med unntak av det vi er rettslig forpliktet til å oppbevare. Profilen din, ønskene dine med begrunnelse, «nei takk», kommentarene og tilbakemeldingene dine og medlemskapene dine slettes. Bo der du er eneste medlem, slettes helt med bilder og dokumenter, også om andre personer uten konto står på listen der. Bo du deler med andre, beholdes for dem: gjenstander, bilder og dokumenter du har lagt inn, blir værende som boets innhold. Navnet ditt fjernes fra det du har lagt inn, og verdiforslagene, stemmene og rettelsene dine blir stående uten navnet ditt. Står du på listen over personer i boet, blir det administratoren har registrert om deg der (navn, e-post, relasjon og andel) stående, sammen med det som er registrert om fordelingen (tildelinger, godkjenninger og eventuelle begrunnelser), til boet slettes. Var du eneste administrator, overtar det medlemmet som har vært lengst med. Bruken av AI registreres bare som antall og kostnad (uten bilder eller tekst) og slettes sammen med kontoen. Et avsluttet bo med bilder og dokumenter oppbevares til det slettes. Det finnes ingen automatisk sletting. Administratoren kan be oss slette boet (admin@arvklart.no); vi kontrollerer at forespørselen kommer fra en administrator av boet før noe slettes. Slettingen gjelder hele boet for alle medlemmer og kan ikke angres.', 'Data is stored for as long as the account is active. When you delete your account, your personal data is deleted from the service immediately, and from the backups when they expire, except what we are legally obliged to keep. Your profile, your wishes with reasons, «no thanks», your comments and feedback and your memberships are deleted. Estates where you are the only member are deleted completely with photos and documents, even if other people without an account are on the list there. Estates you share with others are kept for them: items, photos and documents you added remain as the estate\'s content. Your name is removed from what you added, and your value suggestions, votes and corrections remain without your name. If you are on the list of people in the estate, what the administrator registered about you there (name, email, relationship and share) remains, together with what has been registered about the distribution (assignments, approvals and any reasons given), until the estate is deleted. If you were the only administrator, the member who has been in the estate the longest takes over. AI usage is recorded only as counts and cost (without photos or text) and is deleted with the account. A closed estate with its photos and documents is kept until it is deleted. There is no automatic deletion. The administrator can ask us to delete the estate (admin@arvklart.no); we check that the request comes from an administrator of the estate before anything is deleted. The deletion applies to the whole estate for all members and cannot be undone.')}</p>
          <h2 style={h2s}>{L('Dine rettigheter', 'Your rights')}</h2>
          <p style={ps}>{L('Du har rett til innsyn, retting, sletting, dataportabilitet og å protestere mot behandlingen. I «Min konto» kan du laste ned opplysningene dine som PDF og slette kontoen. For annet, også en maskinlesbar kopi, kontakt oss på admin@arvklart.no. Du kan klage til', 'You have the right to access, rectification, erasure, data portability and to object to the processing. In «My account» you can download your data as a PDF and delete your account. For anything else, including a machine-readable copy, contact us at admin@arvklart.no. You can complain to')} <a href="https://www.datatilsynet.no" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('Datatilsynet', 'Datatilsynet (the Norwegian Data Protection Authority)')}</a>.</p>
          <h2 style={h2s}>{L('Sikkerhet', 'Security')}</h2>
          <p style={ps}>{L('All kommunikasjon er TLS-kryptert. Data er kryptert i ro. Tilgang til produksjonsdata er begrenset til autorisert personell.', 'All communication is TLS encrypted. Data is encrypted at rest. Access to production data is limited to authorised personnel.')}</p>
          <h2 style={h2s}>{L('Endringer', 'Changes')}</h2>
          <p style={ps}>{L('Vi informerer om vesentlige endringer før de trer i kraft.', 'We inform you of material changes before they take effect.')}</p>
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
        supabase.from('items').select('title, description, estimated_value, created_at, ai_analysis, estates(name)').eq('added_by', uid),
        supabase.from('documents').select('name, folder, created_at, estates(name)').eq('uploaded_by', uid),
        supabase.from('feedback').select('type, content, nps_score, created_at').eq('user_id', uid),
        // Verdivurderinger brukeren har stemt på (med eventuelle egne verdiforslag), og oppgaver hen har fått eller fullført
        supabase.from('items').select('title, value_suggestions, estates(name)').contains('value_voter_ids', [uid]),
        supabase.from('tasks').select('title, completed, completed_at, estates(name)').or(`assigned_to.eq.${uid},completed_by.eq.${uid}`),
      ])
      const failed = results.find(r => r.error)
      if (failed) throw failed.error
      const [profile, estates, interests, passes, comments, items, documents, feedback, votes, tasks] = results.map(r => r.data)
      const { buildDataExportPdf } = await import('../lib/dataExportPdf')
      buildDataExportPdf({ email: session.user.email, userId: uid, profile, estates, interests, passes, comments, items, documents, feedback, votes, tasks }).save(L('mine-data-arvklart.pdf', 'my-data-arvklart.pdf'))
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
      if (error || !data?.success) {
        let code = data?.code
        try { code = code || (await error?.context?.json())?.code } catch { /* ikke JSON */ }
        throw Object.assign(new Error('delete-account'), { code })
      }
      await supabase.auth.signOut()
      navigate('/home')
    } catch (e) {
      // Fast melding på brukerens språk (serveren sender aldri råtekst); slettingen kan prøves på nytt
      onToast(e.code === 'delete_failed'
        ? L('Kontoen kunne ikke slettes helt. Prøv igjen, eller kontakt oss.', 'The account could not be fully deleted. Please try again, or contact us.')
        : L('Kontoen kunne ikke slettes. Prøv igjen.', 'The account could not be deleted. Please try again.'), 'error')
      setDeleting(false)
    }
  }

  return (
    <div style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 20px', fontFamily: 'Karla, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Min konto', 'My account')}</h1>
      <p style={{ color: '#75604B', fontSize: '0.875rem', marginBottom: '32px' }}>{session.user.email}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '12px' }}>{L('Visning', 'Display')}</h2>
          <TextSizeControl />
          <p style={{ fontSize: '0.8125rem', color: '#75604B', marginTop: '10px', lineHeight: 1.5 }}>{L('Gjelder på denne enheten. Teksten følger også tekststørrelsen du har valgt på telefonen.', 'Applies on this device. The text also follows the text size you have chosen on your phone.')}</p>
        </div>

        {/* Språk per konto: følger brukeren til andre enheter. Endrer ikke det som er lagret i boet. */}
        <fieldset style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px', margin: 0 }}>
          <legend style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26', padding: '0 4px' }}>{L('Språk', 'Language')}</legend>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            {[['no', 'Norsk'], ['en', 'English']].map(([code, label]) => (
              <label key={code} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '44px', padding: '8px 14px', border: `2px solid ${getLang() === code ? '#3A2F26' : '#D9CFC0'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '0.9375rem', color: '#3A2F26' }}>
                <input type="radio" name="account-lang" value={code} checked={getLang() === code} lang={code === 'en' ? 'en' : 'no'}
                  onChange={() => changeLanguage(code, { userId: session.user.id, isDemo: isDemoSession(session) })} />
                <span lang={code === 'en' ? 'en' : 'no'}>{label}</span>
              </label>
            ))}
          </div>
          <p style={{ fontSize: '0.8125rem', color: '#75604B', marginTop: '10px', lineHeight: 1.5 }}>{L('Lagres på kontoen din og gjelder på alle enheter. Det dere har skrevet i boet, oversettes ikke.', 'Saved to your account and used on all devices. What has been written in the estate is not translated.')}</p>
        </fieldset>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Last ned dine data', 'Download your data')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Last ned personopplysningene vi har om deg som PDF: profil, bo du er med i, interesser, kommentarer, gjenstander og dokumenter du har lagt inn, og tilbakemeldinger.', 'Download the personal data we hold about you as a PDF: profile, estates you belong to, interests, comments, items and documents you have added, and feedback.')}</p>
          <button onClick={exportData} disabled={exporting} style={{ padding: '10px 20px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>
            {exporting ? L('Eksporterer…', 'Exporting…') : L('Last ned mine data', 'Download my data')}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Samtykke til AI-analyse', 'Consent to AI analysis')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>
            {aiConsent
              ? L('Du har samtykket til at bilder og beskrivelser sendes til Anthropic når du bruker AI-analyse eller verdiestimat i denne nettleseren.', 'You have consented to photos and descriptions being sent to Anthropic when you use AI analysis or value estimates in this browser.')
              : L('Du har ikke gitt samtykke til AI-analyse i denne nettleseren. Du blir spurt første gang du bruker funksjonen.', 'You have not consented to AI analysis in this browser. You will be asked the first time you use the feature.')}
          </p>
          {aiConsent && (
            <button onClick={() => { withdrawAiConsent(); setAiConsent(false); onToast(L('Samtykket er trukket tilbake', 'Your consent has been withdrawn')) }} style={{ padding: '9px 18px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>{L('Trekk tilbake samtykket', 'Withdraw consent')}</button>
          )}
        </div>

        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>{L('Personvern og vilkår', 'Privacy and terms')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#5C4530', marginBottom: '12px', lineHeight: '1.6' }}>{L('Les vår personvernerklæring og vilkår for bruk av tjenesten.', 'Read our privacy policy and terms of use for the service.')}</p>
          <a href="/personvern" style={{ fontSize: '0.875rem', color: '#5F6E52' }}>{L('Åpne personvernerklæring →', 'Open privacy policy →')}</a>
        </div>

        <div style={{ background: '#fff', border: '1px solid #F0D4D4', borderRadius: '12px', padding: '24px' }}>
          <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#8B3A3A', marginBottom: '6px' }}>{L('Slett konto', 'Delete account')}</h2>
          <p style={{ fontSize: '0.875rem', color: '#5C4530', marginBottom: '16px', lineHeight: '1.6' }}>{L('Sletter kontoen og personopplysningene dine permanent. Bo der du er eneste medlem, slettes med bilder og dokumenter. Bo du deler med andre, beholdes for dem: ønskene, kommentarene og profilen din slettes, mens gjenstander, bilder og dokumenter du har lagt inn, blir værende uten navnet ditt, og verdiforslagene og stemmene dine blir stående uten navnet ditt. Står du på listen over personer i boet, blir det som er registrert om deg der (navn, e-post, relasjon og andel) og om fordelingen (tildelinger og godkjenninger) stående til boet slettes. Er du eneste administrator, overtar den som har vært lengst med.', 'Permanently deletes your account and your personal data. Estates where you are the only member are deleted with photos and documents. Estates you share with others are kept for them: your wishes, comments and profile are deleted, while items, photos and documents you added remain without your name, and your value suggestions and votes remain without your name. If you are on the list of people in the estate, what is registered about you there (name, email, relationship and share) and about the distribution (assignments and approvals) remains until the estate is deleted. If you are the only administrator, the member who has been there longest takes over.')}</p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{ padding: '10px 20px', background: 'none', border: '1px solid #8B3A3A', color: '#8B3A3A', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Slett min konto', 'Delete my account')}</button>
          ) : (
            <div>
              <p style={{ fontSize: '0.875rem', color: '#8B3A3A', marginBottom: '12px', fontWeight: '500' }}>{L('Er du helt sikker? Dette kan ikke angres.', 'Are you absolutely sure? This cannot be undone.')}</p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>{L('Avbryt', 'Cancel')}</button>
                <button onClick={deleteAccount} disabled={deleting} style={{ flex: 1, padding: '10px', background: '#8B3A3A', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>
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
