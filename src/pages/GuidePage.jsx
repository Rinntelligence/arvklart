import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { signIn, signUp, upsertProfile } from '../lib/supabase'
import {
  getPendingSave, setPendingSave, clearPendingSave,
  createWizardEstate, listAdminEstates, loadWizardContext, saveWizardToEstate,
} from '../lib/wizardEstate'

const AVATAR_COLORS = ['#5F6E52', '#8B9A7D', '#9C8267', '#7A8B6E', '#A97C3F', '#6E8B87']
const DEMO_EMAIL = 'mona.demo@heirsplit.no'
// Hindrer at en ventende lagring kjøres to ganger hvis siden monteres på nytt underveis
let processingPending = false

export default function GuidePage({ standalone = false, session = null, onToast = () => {} }) {
  const navigate = useNavigate()
  const { id } = useParams()
  const frameRef = useRef(null)
  const contextRef = useRef(null)
  const [modal, setModal] = useState(null) // { kind: 'auth' | 'choose', login, request }
  const [busy, setBusy] = useState(false)
  const userId = session?.user?.id
  const isDemo = session?.user?.email === DEMO_EMAIL
  // Opened from the landing page (no estate) — go back to the home page instead
  const backPath = id ? `/estate/${id}` : '/home'

  const toFrame = useCallback(msg => {
    frameRef.current?.contentWindow?.postMessage(msg, window.location.origin)
  }, [])

  // Forteller veiviseren om brukeren er innlogget, hvilket bo den er åpnet fra og hva som er lagret der
  const sendContext = useCallback(async () => {
    let ctx = { type: 'veiviser-context', loggedIn: Boolean(userId), estate: null, saved: null }
    if (userId && id) {
      const { estate, saved } = await loadWizardContext(id, userId)
      ctx = { ...ctx, estate, saved }
    }
    contextRef.current = ctx
    toFrame(ctx)
  }, [id, userId, toFrame])

  const doSave = useCallback(async (estateId, request) => {
    const result = await saveWizardToEstate(estateId, userId, request)
    if (result.error) {
      toFrame({ type: 'veiviser-saved', ok: false, error: 'Lagringen feilet: ' + result.error.message })
      return null
    }
    return result
  }, [userId, toFrame])

  // Lagring som ble startet før innlogging, fullføres når brukeren er logget inn
  useEffect(() => {
    if (!userId) return
    if (isDemo) { clearPendingSave(); return }
    const pending = getPendingSave()
    if (!pending?.request || processingPending) return
    processingPending = true
    ;(async () => {
      setBusy(true)
      const { data: estate, error } = await createWizardEstate(userId, pending.estateName)
      if (error) { processingPending = false; setBusy(false); onToast('Kunne ikke opprette bo: ' + error.message, 'error'); return }
      clearPendingSave()
      const saved = await doSave(estate.id, pending.request)
      processingPending = false
      setBusy(false)
      if (saved) {
        onToast('Boet er opprettet, og resultatet fra veiviseren er lagret ✓')
        navigate(`/estate/${estate.id}/guide`)
      }
    })()
  }, [userId, isDemo, doSave, navigate, onToast])

  useEffect(() => {
    const onMessage = async (e) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return
      const m = e.data || {}
      if (m.type === 'veiviser-back') navigate(backPath)
      if (m.type === 'veiviser-ready') sendContext()
      if (m.type === 'veiviser-navigate' && typeof m.path === 'string' && /^\/estate\/[\w-]+(\/[\w-]+)?$/.test(m.path)) navigate(m.path)
      if (m.type === 'veiviser-save') {
        const request = { answers: m.answers, payload: m.payload }
        if (isDemo) {
          toFrame({ type: 'veiviser-saved', ok: false, error: 'Demo-kontoen kan ikke lagre. Opprett din egen bruker for å lagre resultatet.' })
        } else if (!userId) {
          setModal({ kind: 'auth', login: Boolean(m.login), request })
        } else if (id) {
          const estate = contextRef.current?.estate
          if (estate && estate.role !== 'admin') {
            toFrame({ type: 'veiviser-saved', ok: false, error: 'Bare administratorer av boet kan lagre resultatet her.' })
            return
          }
          const saved = await doSave(id, request)
          if (saved) {
            toFrame({ type: 'veiviser-saved', ok: true, estate, savedAt: saved.savedAt, text: `Lagret! ${saved.heirs} arvinger og stegene dere bør gjøre er oppdatert i boet.` })
          }
        } else {
          setModal({ kind: 'choose', request })
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [backPath, navigate, sendContext, doSave, toFrame, userId, id, isDemo])

  // Ny kontekst når innlogging eller bo endres mens veiviseren er åpen
  useEffect(() => { if (contextRef.current) sendContext() }, [sendContext])

  const closeModal = () => {
    setModal(null)
    toFrame({ type: 'veiviser-saved', ok: false, cancelled: true })
  }

  const saveInto = async (estateId, estateName) => {
    setBusy(true)
    const saved = await doSave(estateId, modal.request)
    setBusy(false)
    if (!saved) return
    setModal(null)
    onToast(`Resultatet er lagret i «${estateName}» ✓`)
    navigate(`/estate/${estateId}/guide`)
  }

  const createAndSave = async (name) => {
    setBusy(true)
    const { data, error } = await createWizardEstate(userId, name)
    if (error) { setBusy(false); onToast('Kunne ikke opprette bo: ' + error.message, 'error'); return }
    setBusy(false)
    await saveInto(data.id, data.name)
  }

  return (
    <div style={{ height: standalone ? '100vh' : 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', background: '#FBF9F5', borderBottom: '1px solid #D9CFC0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(backPath)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
          {id ? '← Tilbake til boet' : '← Tilbake til hjemmesiden'}
        </button>
        {busy && <span style={{ fontSize: '13px', color: '#5F6E52', fontFamily: 'Karla, sans-serif' }}>Lagrer i boet …</span>}
      </div>
      <iframe
        ref={frameRef}
        src={id ? '/veiviser.html' : '/veiviser.html?back=home'}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="Arveprosess-veiviser"
      />
      {modal?.kind === 'auth' && (
        <AuthModal startInLogin={modal.login} request={modal.request} onClose={closeModal} />
      )}
      {modal?.kind === 'choose' && (
        <ChooseEstateModal userId={userId} busy={busy} onClose={closeModal} onChoose={saveInto} onCreate={createAndSave} />
      )}
    </div>
  )
}

// ── Dialoger ─────────────────────────────────────────────────
const font = 'Karla, sans-serif'
const inputStyle = { width: '100%', padding: '11px 14px', border: '1px solid #D9CFC0', borderRadius: '8px', fontSize: '15px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: font, boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '13px', color: '#5C4530', marginBottom: '6px' }

function Overlay({ title, intro, onClose, children }) {
  const boxRef = useRef(null)
  // Flytt fokus inn i dialogen (det ligger ellers i veiviseren), så tastatur og Escape virker
  useEffect(() => {
    const first = boxRef.current?.querySelector('input') || boxRef.current?.querySelector('button:not([aria-label="Lukk"])')
    ;(first || boxRef.current)?.focus()
  }, [])
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(58,47,38,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 1000, fontFamily: font }}>
      <div ref={boxRef} tabIndex={-1} style={{ outline: 'none', background: '#fff', borderRadius: '14px', padding: '28px', width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 48px rgba(0,0,0,0.18)', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: '400', color: '#3A2F26', margin: 0 }}>{title}</h2>
          <button onClick={onClose} aria-label="Lukk" style={{ background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#9C8267', cursor: 'pointer' }}>×</button>
        </div>
        {intro && <p style={{ fontSize: '14px', color: '#9C8267', lineHeight: 1.6, margin: '0 0 20px' }}>{intro}</p>}
        {children}
      </div>
    </div>
  )
}

function PrimaryButton({ children, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: '100%', padding: '13px', background: disabled ? '#D9CFC0' : '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: '15px', fontFamily: font }}>
      {children}
    </button>
  )
}

function AuthModal({ startInLogin, request, onClose }) {
  const [mode, setMode] = useState(startInLogin ? 'login' : 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [estateName, setEstateName] = useState('Arveoppgjør')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const message = msg => {
    if (msg.includes('Invalid login')) return 'Feil e-post eller passord.'
    if (msg.includes('already registered')) return 'E-posten er allerede registrert. Logg inn i stedet.'
    if (msg.includes('Password should')) return 'Passordet må ha minst 6 tegn.'
    if (msg.includes('Email not confirmed')) return null
    return msg
  }

  const canSubmit = email.trim() && password.length >= (mode === 'signup' ? 6 : 1) && estateName.trim() && (mode === 'login' || name.trim())

  const submit = async () => {
    if (!canSubmit || loading) return
    setLoading(true); setError(null)
    // Svarene tas vare på til brukeren er logget inn – også hvis e-posten må bekreftes først
    setPendingSave({ request, estateName: estateName.trim() })
    if (mode === 'signup') {
      const { data, error: err } = await signUp(email.trim(), password)
      if (err) { setError(message(err.message)); setLoading(false); clearPendingSave(); return }
      if (data?.user) {
        await upsertProfile({ user_id: data.user.id, display_name: name.trim(), avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)], email: email.trim(), plan: 'free' })
      }
      if (!data?.session) {
        const { error: loginErr } = await signIn(email.trim(), password)
        if (loginErr) {
          setLoading(false)
          if (loginErr.message.includes('Email not confirmed')) setInfo('Vi har sendt deg en e-post. Bekreft adressen og logg inn – svarene dine er tatt vare på og blir lagt inn i boet når du logger inn.')
          else setError(message(loginErr.message))
          return
        }
      }
    } else {
      const { error: err } = await signIn(email.trim(), password)
      if (err) {
        setLoading(false)
        if (err.message.includes('Email not confirmed')) setInfo('E-posten din er ikke bekreftet ennå. Sjekk innboksen din, og logg inn igjen etterpå.')
        else { setError(message(err.message)); clearPendingSave() }
        return
      }
    }
    // Innloggingen fører til at appen åpner veiviseren på nytt og fullfører lagringen.
  }

  const onKey = e => { if (e.key === 'Enter') submit() }

  return (
    <Overlay
      title={mode === 'signup' ? 'Opprett bruker og lagre' : 'Logg inn og lagre'}
      intro="Vi oppretter et bo for deg i Arvklart og legger inn arvingene, den beregnede fordelingen og stegene dere bør gjøre. Svarene lagres, så du kan gå tilbake og endre dem når som helst."
      onClose={onClose}>
      {info ? (
        <p style={{ background: '#DCE3D2', color: '#3A5A30', padding: '14px', borderRadius: '8px', fontSize: '14px', lineHeight: 1.6 }}>{info}</p>
      ) : (
        <>
          <div style={{ display: 'flex', background: '#E8DFD0', borderRadius: '8px', padding: '4px', marginBottom: '20px' }}>
            {[['signup', 'Ny bruker'], ['login', 'Har bruker']].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError(null) }} style={{
                flex: 1, padding: '9px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontFamily: font,
                background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#3A2F26' : '#9C8267',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
            {mode === 'signup' && (
              <div><label style={labelStyle} htmlFor="wz-name">Ditt navn</label>
                <input id="wz-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} maxLength={100} autoComplete="name" style={inputStyle} /></div>
            )}
            <div><label style={labelStyle} htmlFor="wz-email">E-post</label>
              <input id="wz-email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} maxLength={254} autoComplete="email" style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="wz-password">Passord</label>
              <input id="wz-password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} maxLength={128}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? 'Minst 6 tegn' : ''} style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="wz-estate">Navn på boet</label>
              <input id="wz-estate" value={estateName} onChange={e => setEstateName(e.target.value)} onKeyDown={onKey} maxLength={200} placeholder="f.eks. Boet etter Kari Hansen" style={inputStyle} />
              <p style={{ fontSize: '12px', color: '#9C8267', margin: '6px 0 0' }}>Du kan endre navnet senere.</p></div>
          </div>
          {error && <p role="alert" style={{ color: '#9B3B2E', fontSize: '14px', margin: '0 0 14px' }}>{error}</p>}
          <PrimaryButton onClick={submit} disabled={!canSubmit || loading}>
            {loading ? 'Vent litt …' : mode === 'signup' ? 'Opprett bruker og lagre' : 'Logg inn og lagre'}
          </PrimaryButton>
          {mode === 'signup' && (
            <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#9C8267', lineHeight: 1.6 }}>
              Ved å opprette bruker godtar du våre <a href="/personvern" target="_blank" rel="noopener noreferrer" style={{ color: '#5F6E52' }}>vilkår og personvernerklæring</a>.
            </p>
          )}
        </>
      )}
    </Overlay>
  )
}

function ChooseEstateModal({ userId, busy, onClose, onChoose, onCreate }) {
  const [estates, setEstates] = useState(null)
  const [name, setName] = useState('Arveoppgjør')
  useEffect(() => { listAdminEstates(userId).then(setEstates) }, [userId])

  return (
    <Overlay title="Lagre i et bo" intro="Velg hvilket bo resultatet skal lagres i, eller opprett et nytt. Arvinger og steg fra veiviseren legges inn – det du har lagt inn selv, blir ikke endret." onClose={onClose}>
      {estates === null ? <p style={{ color: '#9C8267', fontSize: '14px' }}>Laster …</p> : (
        <>
          {estates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {estates.map(e => (
                <button key={e.id} disabled={busy} onClick={() => onChoose(e.id, e.name)} style={{ textAlign: 'left', padding: '13px 14px', background: '#FBF9F5', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', color: '#3A2F26', fontFamily: font }}>
                  {e.name}
                </button>
              ))}
            </div>
          )}
          <label style={labelStyle} htmlFor="wz-new-estate">{estates.length ? 'Eller opprett et nytt bo' : 'Navn på det nye boet'}</label>
          <input id="wz-new-estate" value={name} onChange={e => setName(e.target.value)} maxLength={200} style={{ ...inputStyle, marginBottom: '14px' }} />
          <PrimaryButton disabled={!name.trim() || busy} onClick={() => onCreate(name.trim())}>{busy ? 'Lagrer …' : 'Opprett bo og lagre'}</PrimaryButton>
        </>
      )}
    </Overlay>
  )
}
