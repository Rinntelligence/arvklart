import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { signIn, signUp, upsertProfile } from '../lib/supabase'
import {
  getPendingSave, setPendingSave, clearPendingSave,
  createWizardEstate, listAdminEstates, loadWizardContext, saveWizardToEstate,
} from '../lib/wizardEstate'
import { L, isEn } from '../lib/lang'

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
      toFrame({ type: 'veiviser-saved', ok: false, error: L('Lagringen feilet: ', 'Saving failed: ') + result.error.message })
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
      if (error) { processingPending = false; setBusy(false); onToast(L('Kunne ikke opprette bo: ', 'Could not create estate: ') + error.message, 'error'); return }
      clearPendingSave()
      const saved = await doSave(estate.id, pending.request)
      processingPending = false
      setBusy(false)
      if (saved) {
        onToast(L('Boet er opprettet, og resultatet fra veiviseren er lagret ✓', 'The estate has been created and the guide result saved ✓'))
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
          toFrame({ type: 'veiviser-saved', ok: false, error: L('Demo-kontoen kan ikke lagre. Opprett din egen bruker for å lagre resultatet.', 'The demo account cannot save. Create your own account to save the result.') })
        } else if (!userId) {
          setModal({ kind: 'auth', login: Boolean(m.login), request })
        } else if (id) {
          const estate = contextRef.current?.estate
          if (estate && estate.role !== 'admin') {
            toFrame({ type: 'veiviser-saved', ok: false, error: L('Bare administratorer av boet kan lagre resultatet her.', 'Only administrators of the estate can save the result here.') })
            return
          }
          const saved = await doSave(id, request)
          if (saved) {
            toFrame({ type: 'veiviser-saved', ok: true, estate, savedAt: saved.savedAt, text: L(`Lagret! ${saved.heirs} arvinger og stegene dere bør gjøre er oppdatert i boet.`, `Saved! ${saved.heirs} heirs and the steps you should take have been updated in the estate.`) })
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
    onToast(L(`Resultatet er lagret i «${estateName}» ✓`, `The result has been saved in «${estateName}» ✓`))
    navigate(`/estate/${estateId}/guide`)
  }

  const createAndSave = async (name) => {
    setBusy(true)
    const { data, error } = await createWizardEstate(userId, name)
    if (error) { setBusy(false); onToast(L('Kunne ikke opprette bo: ', 'Could not create estate: ') + error.message, 'error'); return }
    setBusy(false)
    await saveInto(data.id, data.name)
  }

  return (
    <div style={{ height: standalone ? '100vh' : 'calc(100vh - 56px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 20px', background: '#FBF9F5', borderBottom: '1px solid #D9CFC0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate(backPath)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
          {id ? L('← Tilbake til boet', '← Back to the estate') : L('← Tilbake til hjemmesiden', '← Back to the home page')}
        </button>
        {busy && <span style={{ fontSize: '13px', color: '#5F6E52', fontFamily: 'Karla, sans-serif' }}>{L('Lagrer i boet …', 'Saving to the estate …')}</span>}
        {isEn() && <span style={{ fontSize: '13px', color: '#9C8267', fontFamily: 'Karla, sans-serif', marginLeft: 'auto' }}>The inheritance guide follows Norwegian law and is only available in Norwegian.</span>}
      </div>
      <iframe
        ref={frameRef}
        src={id ? '/veiviser.html' : '/veiviser.html?back=home'}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title={L('Arveprosess-veiviser', 'Inheritance process guide')}
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
    const first = boxRef.current?.querySelector('input') || boxRef.current?.querySelector('button:not([data-close])')
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
          <button onClick={onClose} data-close aria-label={L('Lukk', 'Close')} style={{ background: 'none', border: 'none', fontSize: '22px', lineHeight: 1, color: '#9C8267', cursor: 'pointer' }}>×</button>
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
  const [estateName, setEstateName] = useState(() => L('Arveoppgjør', 'Estate settlement'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)

  const message = msg => {
    if (msg.includes('Invalid login')) return L('Feil e-post eller passord.', 'Wrong email or password.')
    if (msg.includes('already registered')) return L('E-posten er allerede registrert. Logg inn i stedet.', 'This email is already registered. Log in instead.')
    if (msg.includes('Password should')) return L('Passordet må ha minst 6 tegn.', 'The password must have at least 6 characters.')
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
          if (loginErr.message.includes('Email not confirmed')) setInfo(L('Vi har sendt deg en e-post. Bekreft adressen og logg inn – svarene dine er tatt vare på og blir lagt inn i boet når du logger inn.', 'We have sent you an email. Confirm your address and log in – your answers are kept and will be added to the estate when you log in.'))
          else setError(message(loginErr.message))
          return
        }
      }
    } else {
      const { error: err } = await signIn(email.trim(), password)
      if (err) {
        setLoading(false)
        if (err.message.includes('Email not confirmed')) setInfo(L('E-posten din er ikke bekreftet ennå. Sjekk innboksen din, og logg inn igjen etterpå.', 'Your email has not been confirmed yet. Check your inbox and log in again afterwards.'))
        else { setError(message(err.message)); clearPendingSave() }
        return
      }
    }
    // Innloggingen fører til at appen åpner veiviseren på nytt og fullfører lagringen.
  }

  const onKey = e => { if (e.key === 'Enter') submit() }

  return (
    <Overlay
      title={mode === 'signup' ? L('Opprett bruker og lagre', 'Create account and save') : L('Logg inn og lagre', 'Log in and save')}
      intro={L(
        'Vi oppretter et bo for deg i Arvklart og legger inn arvingene, den beregnede fordelingen og stegene dere bør gjøre. Svarene lagres, så du kan gå tilbake og endre dem når som helst.',
        'We create an estate for you in Arvklart and add the heirs, the calculated distribution and the steps you should take. Your answers are saved, so you can go back and change them at any time.',
      )}
      onClose={onClose}>
      {info ? (
        <p style={{ background: '#DCE3D2', color: '#3A5A30', padding: '14px', borderRadius: '8px', fontSize: '14px', lineHeight: 1.6 }}>{info}</p>
      ) : (
        <>
          <div style={{ display: 'flex', background: '#E8DFD0', borderRadius: '8px', padding: '4px', marginBottom: '20px' }}>
            {[['signup', L('Ny bruker', 'New user')], ['login', L('Har bruker', 'Have an account')]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError(null) }} style={{
                flex: 1, padding: '9px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontFamily: font,
                background: mode === m ? '#fff' : 'transparent', color: mode === m ? '#3A2F26' : '#9C8267',
                boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
            {mode === 'signup' && (
              <div><label style={labelStyle} htmlFor="wz-name">{L('Ditt navn', 'Your name')}</label>
                <input id="wz-name" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} maxLength={100} autoComplete="name" style={inputStyle} /></div>
            )}
            <div><label style={labelStyle} htmlFor="wz-email">{L('E-post', 'Email')}</label>
              <input id="wz-email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} maxLength={254} autoComplete="email" style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="wz-password">{L('Passord', 'Password')}</label>
              <input id="wz-password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} maxLength={128}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={mode === 'signup' ? L('Minst 6 tegn', 'At least 6 characters') : ''} style={inputStyle} /></div>
            <div><label style={labelStyle} htmlFor="wz-estate">{L('Navn på boet', 'Estate name')}</label>
              <input id="wz-estate" value={estateName} onChange={e => setEstateName(e.target.value)} onKeyDown={onKey} maxLength={200} placeholder={L('f.eks. Boet etter Kari Hansen', 'e.g. The estate of Jane Smith')} style={inputStyle} />
              <p style={{ fontSize: '12px', color: '#9C8267', margin: '6px 0 0' }}>{L('Du kan endre navnet senere.', 'You can change the name later.')}</p></div>
          </div>
          {error && <p role="alert" style={{ color: '#9B3B2E', fontSize: '14px', margin: '0 0 14px' }}>{error}</p>}
          <PrimaryButton onClick={submit} disabled={!canSubmit || loading}>
            {loading ? L('Vent litt …', 'Please wait …') : mode === 'signup' ? L('Opprett bruker og lagre', 'Create account and save') : L('Logg inn og lagre', 'Log in and save')}
          </PrimaryButton>
          {mode === 'signup' && (
            <p style={{ textAlign: 'center', marginTop: '12px', fontSize: '12px', color: '#9C8267', lineHeight: 1.6 }}>
              {L('Ved å opprette bruker godtar du våre', 'By creating an account you accept our')} <a href="/personvern" target="_blank" rel="noopener noreferrer" style={{ color: '#5F6E52' }}>{L('vilkår og personvernerklæring', 'terms and privacy policy')}</a>.
            </p>
          )}
        </>
      )}
    </Overlay>
  )
}

function ChooseEstateModal({ userId, busy, onClose, onChoose, onCreate }) {
  const [estates, setEstates] = useState(null)
  const [name, setName] = useState(() => L('Arveoppgjør', 'Estate settlement'))
  useEffect(() => { listAdminEstates(userId).then(setEstates) }, [userId])

  return (
    <Overlay
      title={L('Lagre i et bo', 'Save to an estate')}
      intro={L(
        'Velg hvilket bo resultatet skal lagres i, eller opprett et nytt. Arvinger og steg fra veiviseren legges inn – det du har lagt inn selv, blir ikke endret.',
        'Choose which estate to save the result in, or create a new one. Heirs and steps from the guide are added – what you entered yourself is not changed.',
      )}
      onClose={onClose}>
      {estates === null ? <p style={{ color: '#9C8267', fontSize: '14px' }}>{L('Laster …', 'Loading …')}</p> : (
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
          <label style={labelStyle} htmlFor="wz-new-estate">{estates.length ? L('Eller opprett et nytt bo', 'Or create a new estate') : L('Navn på det nye boet', 'Name of the new estate')}</label>
          <input id="wz-new-estate" value={name} onChange={e => setName(e.target.value)} maxLength={200} style={{ ...inputStyle, marginBottom: '14px' }} />
          <PrimaryButton disabled={!name.trim() || busy} onClick={() => onCreate(name.trim())}>{busy ? L('Lagrer …', 'Saving …') : L('Opprett bo og lagre', 'Create estate and save')}</PrimaryButton>
        </>
      )}
    </Overlay>
  )
}
