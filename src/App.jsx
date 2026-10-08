import { useCallback, useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase, upsertProfile } from './lib/supabase'
import { PlanProvider } from './hooks/usePlan'
import { isDemoSession } from './lib/demo'
import LoginPage from './pages/LoginPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import LandingPage from './pages/LandingPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import EstatesPage from './pages/EstatesPage'
import EstatePage from './pages/EstatePage'
import ItemDetailPage from './pages/ItemDetailPage'
import AddItemPage from './pages/AddItemPage'
import AddItemsPage from './pages/AddItemsPage'
import SwipePage from './pages/SwipePage'
import EditItemPage from './pages/EditItemPage'
import AdminPage from './pages/AdminPage'
import FounderPage from './pages/FounderPage'
import FounderGate from './components/FounderGate'
import GuidePage from './pages/GuidePage'
import TasksPage from './pages/TasksPage'
import DocumentVaultPage from './pages/DocumentVaultPage'
import HeirsPage from './pages/HeirsPage'
import GoodwillPage from './pages/GoodwillPage'
import { JoinPage, CategoriesPage, PrivacyPage, AccountPage } from './pages/OtherPages'
import ConflictPage from './pages/ConflictPage'
import StatusPage from './pages/StatusPage'
import ContactPage from './pages/ContactPage'
import { getPendingSave, clearPendingSave } from './lib/wizardEstate'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import FeedbackWidget from './components/FeedbackWidget'
import { L } from './lib/lang'

// Pages that must never be hijacked by post-login redirects (e.g. legal text opened in a new tab)
const NO_REDIRECT_PATHS = ['/personvern']
const RESET_PATH = '/nytt-passord'
const AVATAR_COLORS = ['#5F6E52', '#8B9A7D', '#9C8267', '#7A8B6E', '#A97C3F', '#6E8B87']

const pendingJoin = {
  get: () => { try { return localStorage.getItem('pendingJoinCode') } catch { return null } },
  clear: () => { try { localStorage.removeItem('pendingJoinCode') } catch { /* privat modus */ } },
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [demoEstateId, setDemoEstateId] = useState(undefined)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const navigate = useNavigate()

  // Stabil funksjon: sider kan ha den i avhengighetslister uten at effekter kjører på nytt.
  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, type })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_OUT') {
        // Neste person på samme maskin skal ikke arve invitasjoner eller veiviser-lagring
        pendingJoin.clear()
        clearPendingSave()
      }
      // Fallback in case the reset link landed somewhere other than /nytt-passord
      if (event === 'PASSWORD_RECOVERY') navigate(RESET_PATH)
    })
    return () => subscription.unsubscribe()
  }, [])

  const emailRef = useRef(null)
  emailRef.current = session?.user?.email

  // Videre etter innlogging: profil, invitasjon eller veiviser-lagring som venter – ellers fallback.
  // Veiviser-lagringen gjelder bare brukeren som startet den (samme e-post).
  const routeAfterLogin = useCallback((p, fallback) => {
    if (!p?.display_name) { navigate('/setup'); return }
    const pendingCode = pendingJoin.get()
    if (pendingCode) {
      pendingJoin.clear()
      navigate(`/join/${pendingCode}`)
    } else if (getPendingSave(emailRef.current) && window.location.pathname !== '/veiviser') {
      navigate('/veiviser')
    } else if (fallback) {
      navigate(fallback)
    }
  }, [navigate])

  const user = session?.user
  const isDemo = isDemoSession(session)

  // Kjører én gang per innlogget bruker – ikke ved hver tokenfornyelse.
  useEffect(() => {
    setProfile(null)
    setDemoEstateId(undefined)
    if (!user) return
    let cancelled = false
    ;(async () => {
      let { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle()
      // Ved nettverksfeil: ikke opprett/overskriv profilen, og ikke send brukeren videre
      if (error) return
      const metaName = user.user_metadata?.display_name?.trim()
      if (!data && metaName && !isDemo) {
        // Registrert med navn (evt. med e-postbekreftelse): opprett profilen nå
        const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
        const res = await upsertProfile({ user_id: user.id, display_name: metaName.slice(0, 100), avatar_color: color, email: user.email })
        data = res.data
      }
      if (cancelled) return
      setProfile(data)

      if (isDemo) {
        const { data: membership } = await supabase.from('estate_members')
          .select('estate_id').eq('user_id', user.id).limit(1).maybeSingle()
        if (cancelled) return
        setDemoEstateId(membership?.estate_id || null)
        // Rett fra «Test ut demo» på forsiden og inn i demo-boet
        if (membership?.estate_id && window.location.pathname === '/home') navigate(`/estate/${membership.estate_id}`)
        return
      }
      // La brukeren velge nytt passord, eller lese personvernerklæringen, før noe annet
      if (window.location.pathname === RESET_PATH || NO_REDIRECT_PATHS.includes(window.location.pathname)) return
      routeAfterLogin(data)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  if (session === undefined) return <Splash />

  // Vent til demo-boet er funnet, så bo-listen aldri blinker forbi
  if (isDemo && demoEstateId === undefined) return <Splash />

  if (!session) {
    return (
      <>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <Routes>
          <Route path="/home" element={<LandingPage onToast={showToast} />} />
          <Route path="/logg-inn" element={<LoginPage onToast={showToast} />} />
          <Route path={RESET_PATH} element={<ResetPasswordPage session={null} onToast={showToast} />} />
          <Route path="/join/:code" element={<JoinPage onToast={showToast} />} />
          <Route path="/personvern" element={<PrivacyPage />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/veiviser" element={<GuidePage standalone onToast={showToast} />} />
          <Route path="*" element={<Navigate to="/home" />} />
        </Routes>
      </>
    )
  }

  const p = { session, profile, onToast: showToast, isDemo }
  // Demokontoen skal bare se og prøve fordelingen, ikke endre boet eller kontoen
  const notForDemo = (element) => (isDemo ? <Navigate to="/" replace /> : element)
  const demoHome = demoEstateId ? <Navigate to={`/estate/${demoEstateId}`} replace /> : <EstatesPage {...p} />

  return (
    <PlanProvider session={session}>
      <div style={{ minHeight: '100vh', background: '#FBF9F5' }}>
        <TopBar profile={profile} session={session} onToast={showToast} />
        {isDemo && (
          <div style={{ background: '#DCE3D2', borderBottom: '1px solid #B8C8A8', padding: '8px 20px', textAlign: 'center', fontSize: '13px', color: '#3A5A30', fontFamily: 'Karla, sans-serif' }}>
            {L('Du ser på en', 'You are viewing a')} <strong>demo</strong> — {L('Mona sitt bo. Du kan vise interesse, sveipe og prøve fordelingen, men ikke endre boet.', "Mona's estate. You can show interest, swipe and try the distribution, but not change the estate.")}
          </div>
        )}
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        {!isDemo && <FeedbackWidget session={session} onToast={showToast} />}
        <Routes>
          <Route path="/" element={isDemo ? demoHome : <EstatesPage {...p} />} />
          <Route path="/home" element={<LandingPage loggedIn onToast={showToast} />} />
          <Route path="/kontakt" element={<ContactPage />} />
          <Route path="/setup" element={notForDemo(<ProfileSetupPage session={session} profile={profile} onSaved={(saved) => {
            const first = !profile?.display_name
            setProfile(saved)
            if (first) routeAfterLogin(saved, '/')
            else navigate('/')
          }} onToast={showToast} />)} />
          <Route path="/estate/:id" element={<EstatePage {...p} />} />
          <Route path="/estate/:id/item/:itemId" element={<ItemDetailPage {...p} />} />
          <Route path="/estate/:id/swipe" element={<SwipePage {...p} />} />
          <Route path="/estate/:id/item/:itemId/edit" element={notForDemo(<EditItemPage {...p} />)} />
          {/* Demoen kan prøve AI-funksjonene her (5 forsøk), men ikke lagre */}
          <Route path="/estate/:id/add" element={<AddItemPage {...p} />} />
          <Route path="/estate/:id/add-many" element={<AddItemsPage {...p} />} />
          <Route path="/estate/:id/admin" element={notForDemo(<AdminPage {...p} />)} />
          <Route path="/estate/:id/categories" element={notForDemo(<CategoriesPage {...p} />)} />
          <Route path="/estate/:id/tasks" element={<TasksPage {...p} />} />
          <Route path="/estate/:id/documents" element={notForDemo(<DocumentVaultPage {...p} />)} />
          <Route path="/estate/:id/goodwill" element={notForDemo(<GoodwillPage {...p} />)} />
          <Route path="/estate/:id/heirs" element={<HeirsPage {...p} />} />
          <Route path="/estate/:id/conflicts" element={<ConflictPage {...p} />} />
          <Route path="/estate/:id/status" element={<StatusPage {...p} />} />
          <Route path="/join/:code" element={<JoinPage session={session} onToast={showToast} />} />
          <Route path="/founder" element={<FounderGate><FounderPage session={session} onToast={showToast} /></FounderGate>} />
          <Route path="/estate/:id/guide" element={<GuidePage session={session} onToast={showToast} />} />
          <Route path="/veiviser" element={<GuidePage session={session} onToast={showToast} />} />
          <Route path="/personvern" element={<PrivacyPage />} />
          <Route path={RESET_PATH} element={<ResetPasswordPage session={session} onToast={showToast} onDone={() => routeAfterLogin(profile, '/')} />} />
          <Route path="/konto" element={notForDemo(<AccountPage session={session} onToast={showToast} />)} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </PlanProvider>
  )
}

function Splash() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF9F5', fontFamily: "'Fraunces', serif", color: '#9C8267', fontSize: '20px', gap: '12px' }}>
      Arvklart
    </div>
  )
}
