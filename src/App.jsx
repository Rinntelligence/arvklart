import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { PlanProvider } from './hooks/usePlan'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import ProfileSetupPage from './pages/ProfileSetupPage'
import EstatesPage from './pages/EstatesPage'
import EstatePage from './pages/EstatePage'
import ItemDetailPage from './pages/ItemDetailPage'
import AddItemPage from './pages/AddItemPage'
import SwipePage from './pages/SwipePage'
import EditItemPage from './pages/EditItemPage'
import AdminPage from './pages/AdminPage'
import FounderPage from './pages/FounderPage'
import GuidePage from './pages/GuidePage'
import TasksPage from './pages/TasksPage'
import DocumentVaultPage from './pages/DocumentVaultPage'
import HeirsPage from './pages/HeirsPage'
import GoodwillPage from './pages/GoodwillPage'
import { JoinPage, PricingPage, CategoriesPage } from './pages/OtherPages'
import ConflictPage from './pages/ConflictPage'
import TopBar from './components/TopBar'
import Toast from './components/Toast'
import FeedbackWidget from './components/FeedbackWidget'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [toast, setToast] = useState(null)
  const navigate = useNavigate()

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s)
      if (!s) setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    const isDemo = session.user.email === 'mona.demo@heirsplit.no'
    supabase.from('profiles').select('*').eq('user_id', session.user.id).single()
      .then(async ({ data }) => {
        setProfile(data)
        if (isDemo) {
          const { data: membership } = await supabase
            .from('estate_members')
            .select('estate_id')
            .eq('user_id', session.user.id)
            .limit(1)
            .single()
          if (membership?.estate_id) {
            // Reset demo data on each login so state is fresh for next visitor
            const estateId = membership.estate_id
            const { data: demoItems } = await supabase
              .from('items')
              .select('id')
              .eq('estate_id', estateId)
            if (demoItems?.length) {
              const itemIds = demoItems.map(i => i.id)
              await supabase.from('interests').delete().in('item_id', itemIds)
              await supabase.from('items')
                .update({ assigned_to: null, status: 'active' })
                .eq('estate_id', estateId)
                .eq('status', 'assigned')
            }
          }
          navigate(membership?.estate_id ? `/estate/${membership.estate_id}` : '/')
        } else if (!data?.display_name) {
          navigate('/setup')
        } else {
          const pendingCode = localStorage.getItem('pendingJoinCode')
          if (pendingCode) {
            localStorage.removeItem('pendingJoinCode')
            navigate(`/join/${pendingCode}`)
          }
        }
      })
  }, [session])

  if (session === undefined) return <Splash />

  const isDemo = session?.user?.email === 'mona.demo@heirsplit.no'

  if (!session) {
    return (
      <>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        <Routes>
          <Route path="/home" element={<LandingPage onToast={showToast} />} />
          <Route path="/logg-inn" element={<LoginPage onToast={showToast} />} />
          <Route path="/join/:code" element={<JoinPage onToast={showToast} />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="*" element={<Navigate to="/home" />} />
        </Routes>
      </>
    )
  }

  return (
    <PlanProvider session={session}>
      <div style={{ minHeight: '100vh', background: '#FBF9F5' }}>
        <TopBar profile={profile} session={session} onToast={showToast} />
        {isDemo && (
          <div style={{ background: '#DCE3D2', borderBottom: '1px solid #B8C8A8', padding: '8px 20px', textAlign: 'center', fontSize: '13px', color: '#3A5A30', fontFamily: 'Karla, sans-serif' }}>
            Du ser på en <strong>demo</strong> — Mona sitt bo. Redigering er ikke tilgjengelig.
          </div>
        )}
        {toast && <Toast msg={toast.msg} type={toast.type} />}
        {!isDemo && <FeedbackWidget session={session} />}
        <Routes>
          <Route path="/" element={<EstatesPage session={session} profile={profile} onToast={showToast} isDemo={isDemo} />} />
          <Route path="/home" element={<LandingPage onToast={showToast} />} />
          <Route path="/setup" element={<ProfileSetupPage session={session} onSaved={(p) => {
            setProfile(p)
            const pendingCode = localStorage.getItem('pendingJoinCode')
            if (pendingCode) { localStorage.removeItem('pendingJoinCode'); navigate(`/join/${pendingCode}`) }
            else navigate('/')
          }} onToast={showToast} />} />
          <Route path="/estate/:id" element={<EstatePage session={session} profile={profile} onToast={showToast} isDemo={isDemo} />} />
          <Route path="/estate/:id/item/:itemId" element={<ItemDetailPage session={session} profile={profile} onToast={showToast} isDemo={isDemo} />} />
          <Route path="/estate/:id/swipe" element={<SwipePage session={session} profile={profile} onToast={showToast} isDemo={isDemo} />} />
          <Route path="/estate/:id/item/:itemId/edit" element={isDemo ? <Navigate to="/" /> : <EditItemPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/add" element={isDemo ? <Navigate to="/" /> : <AddItemPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/admin" element={<AdminPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/categories" element={<CategoriesPage session={session} onToast={showToast} />} />
          <Route path="/estate/:id/tasks" element={<TasksPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/documents" element={<DocumentVaultPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/goodwill" element={<GoodwillPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/heirs" element={<HeirsPage session={session} profile={profile} onToast={showToast} />} />
          <Route path="/estate/:id/conflicts" element={<ConflictPage session={session} onToast={showToast} />} />
          <Route path="/join/:code" element={<JoinPage session={session} onToast={showToast} />} />
          <Route path="/pricing" element={<PricingPage session={session} />} />
          <Route path="/founder" element={<FounderPage session={session} />} />
          <Route path="/estate/:id/guide" element={<GuidePage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </PlanProvider>
  )
}

function Splash() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF9F5', fontFamily: "'Fraunces', serif", color: '#9C8267', fontSize: '20px', gap: '12px' }}>
      HeirSplit
    </div>
  )
}
