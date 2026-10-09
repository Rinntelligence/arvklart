// Legg til mange gjenstander på en gang (maks 20): ta bilder på stedet eller velg fra kamerarullen/PC-en,
// la AI fylle inn navn, kategori, tilstand og beskrivelse for alle, se over og godkjenn alle samlet.
// AI-analysen lagrer aldri noe selv; bare «Godkjenn og lagre alle» legger gjenstandene inn i boet.
// AI fyller ikke inn verdi her: verdien er valgfri og skrives inn av brukeren.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCategories, supabase, signOut } from '../lib/supabase'
import { downscaleImage, removeImages, uploadEstateImage } from '../lib/images'
import { hasAiConsent, giveAiConsent } from '../lib/aiConsent'
import { formatNOK, parseNOK } from '../lib/format'
import { L } from '../lib/lang'
import { categoryLabel } from '../lib/categories'
import { addCapturedPhotos, aiErrorMessage, analyzeItemPhotos, estimateApplies, mergeSelectedPhotos, removePhotoAt, requestValueEstimate, restoreRemoved, runPool, splitDraft } from '../lib/itemAi'
import { aiAnalysisRecord, aiSuggestion, applyAiSuggestion } from '../lib/itemAiHelpers'
import { CONDITION_OPTIONS, identificationSummary, multipleItemsText } from '../lib/analysisView'
import { AiConsent, DemoNotice } from '../components/AiDialogs'
import AnalysisDetails from '../components/AnalysisDetails'
import CameraCapture from '../components/CameraCapture'

const MAX_ITEMS = 20
const MAX_PHOTOS = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // etter forminsking
const AI_PARALLEL = 4
const AI_STOP_CODES = ['demo_limit', 'rate_limit', 'ai_busy', 'ai_unavailable']

let nextKey = 1
const newDraft = () => ({
  key: nextKey++, photos: [], title: '', categoryId: '', condition: 'unknown', description: '', // tilstand er ukjent til noen vurderer den
  value: '', status: 'idle', // idle | analyzing | analyzed | failed | saving | saveFailed | saved
  estimate: null, estimating: false, // AI-verdianslag bare når brukeren ber om det (se estimateApplies)
  analysis: null, aiFilled: {}, // AI-vurderingen (lagres i ai_analysis) og feltene AI-en har fylt inn
})

// Sekundærtekst og feltkanter med nok kontrast (WCAG 1.4.3 / 1.4.11)
const MUTED = '#75604B'
const FIELD_BORDER = '#9A8B78'

const inputStyle = {
  width: '100%', minHeight: '44px', padding: '10px 12px', border: `1px solid ${FIELD_BORDER}`, borderRadius: '8px',
  fontSize: '1rem', background: '#FBF9F5', color: '#3A2F26',
  fontFamily: 'Karla, sans-serif', boxSizing: 'border-box',
}
const bigBtn = {
  minHeight: '48px', padding: '14px 12px', borderRadius: '10px', cursor: 'pointer',
  fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', fontWeight: '500',
}
const smallBtn = {
  minHeight: '44px', padding: '8px 12px', background: 'none', border: `1px solid ${FIELD_BORDER}`, borderRadius: '8px',
  cursor: 'pointer', fontSize: '0.875rem', color: '#5C4530', fontFamily: 'Karla, sans-serif',
}

// Flytter fokus til navnefeltet på et kort (fra oppsummeringen og bunnlinjen)
const focusDraft = (key) => {
  const el = document.getElementById(`draft-title-${key}`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus({ preventScroll: true })
}

export default function AddItemsPage({ session, profile, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [drafts, setDrafts] = useState([])
  const [cameraKey, setCameraKey] = useState(null) // gjenstanden kameraet fotograferer
  const [pendingFiles, setPendingFiles] = useState(null) // valgte bilder som venter på «hver for seg / samme»
  const [preparing, setPreparing] = useState(false)
  const [busy, setBusy] = useState(null) // 'estimating' | 'saving'; AI-analysen låser bare kortene den gjelder
  const [aiProgress, setAiProgress] = useState(null) // { done, total } mens AI analyserer
  const [autoAnalyze, setAutoAnalyze] = useState(false) // etter første «Analyser med AI»: nye bilder analyseres av seg selv
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [cameraSame, setCameraSame] = useState(false) // kameraet: neste bilde til samme gjenstand (ellers ny gjenstand)
  const [undo, setUndo] = useState(null) // { removed, text } fra sletting til neste sletting, endring av grupperingen eller lagring
  const [aiReport, setAiReport] = useState(null) // { failedKeys, stoppedCode, notStarted } etter AI-analyse med feil
  const [done, setDone] = useState(null) // { saved } når alt er lagret
  const [myRole, setMyRole] = useState(null)
  const [aiConsented, setAiConsented] = useState(hasAiConsent)
  const [askConsent, setAskConsent] = useState(null) // { kind: 'analyze' | 'estimate', key } som venter på samtykke
  const [estimateReport, setEstimateReport] = useState(null) // { failed, stoppedCode } når verdianslag ikke lyktes for alle
  const [demoBlocked, setDemoBlocked] = useState(false)
  const [demoRemaining, setDemoRemaining] = useState(isDemo ? 5 : null)
  const [dragOver, setDragOver] = useState(false)
  const [merging, setMerging] = useState(false) // «Slå sammen gjenstander»: marker bildene som hører sammen
  const [mergeSel, setMergeSel] = useState([]) // valgte bilde-URL-er i valgt rekkefølge
  const pickRef = useRef()
  const addToRef = useRef(null) // gjenstanden «+»-knappen legger bilder til
  const addInputRef = useRef()
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const cameraKeyRef = useRef(cameraKey)
  cameraKeyRef.current = cameraKey
  const cameraSameRef = useRef(cameraSame)
  cameraSameRef.current = cameraSame
  const captureQueue = useRef(Promise.resolve())
  const undoRef = useRef(undo)
  undoRef.current = undo
  const aiQueue = useRef([]) // gjenstander som venter på analyse
  const aiRunning = useRef(0)
  const aiBatch = useRef(null) // { total, done, analyzed, failedKeys, keys, stopped, manual } til køen er tom

  // Meldinger (toast) legges over bunnlinjen i stedet for oppå knappene
  const barObserver = useRef(null)
  const bottomBarRef = useCallback((el) => {
    barObserver.current?.disconnect()
    const root = document.documentElement
    if (!el) { root.style.removeProperty('--toast-offset'); return }
    const set = () => root.style.setProperty('--toast-offset', `${el.offsetHeight}px`)
    set()
    barObserver.current = new ResizeObserver(set)
    barObserver.current.observe(el)
  }, [])

  useEffect(() => { getCategories(id).then(({ data }) => setCategories(data || [])) }, [id])
  useEffect(() => {
    supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setMyRole(data?.role || null))
  }, [id, session.user.id])

  // Forhåndsvisningene er objekt-URL-er; frigjør dem når siden lukkes
  useEffect(() => () => {
    draftsRef.current.forEach(d => d.photos.forEach(p => URL.revokeObjectURL(p.url)))
    releaseRemoved(undoRef.current?.removed)
  }, [])

  // Advar før man forlater siden med ulagrede gjenstander
  const unsaved = drafts.some(d => d.status !== 'saved')
  useEffect(() => {
    if (!unsaved) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const update = (key, patch) => setDrafts(prev => prev.map(d => d.key === key ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d))

  // Mobilbilder er ofte 5–15 MB. Forminskes med en gang, så 100 bilder ikke fyller minnet på telefonen.
  const prepare = async (files) => {
    setPreparing(true)
    const photos = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const file = await downscaleImage(f)
      if (file.size > MAX_IMAGE_SIZE) { onToast(L(`"${f.name}" er for stor (maks 10 MB)`, `"${f.name}" is too large (max 10 MB)`), 'error'); continue }
      photos.push({ file, url: URL.createObjectURL(file) })
    }
    setPreparing(false)
    return photos
  }

  const addPhotosTo = async (key, files) => {
    const target = draftsRef.current.find(d => d.key === key)
    const room = MAX_PHOTOS - (target?.photos.length || 0)
    if (files.length > room) onToast(L('Maks 5 bilder per gjenstand', 'Max 5 photos per item'), 'error')
    const photos = await prepare(files.slice(0, Math.max(0, room)))
    if (photos.length) update(key, d => ({ photos: [...d.photos, ...photos], status: d.status === 'saved' ? d.status : 'idle' }))
  }

  // Valgte/slupne bilder: ett bilde = én gjenstand, eller alle til samme gjenstand
  const addFiles = (files) => {
    const images = files.filter(f => f.type.startsWith('image/'))
    if (!images.length) return
    if (images.length === 1) { addAsSeparate(images); return }
    setPendingFiles(images)
  }

  const addAsSeparate = async (files) => {
    setPendingFiles(null)
    const room = MAX_ITEMS - draftsRef.current.length
    if (room <= 0) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    if (files.length > room) onToast(L(`Bare de ${room} første ble lagt til (maks 20 gjenstander)`, `Only the first ${room} were added (max 20 items)`), 'error')
    const photos = await prepare(files.slice(0, room))
    setDrafts(prev => [...prev, ...photos.map(p => ({ ...newDraft(), photos: [p] }))])
  }

  const addAsOne = async (files) => {
    setPendingFiles(null)
    if (draftsRef.current.length >= MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    if (files.length > MAX_PHOTOS) onToast(L('Maks 5 bilder per gjenstand', 'Max 5 photos per item'), 'error')
    const photos = await prepare(files.slice(0, MAX_PHOTOS))
    if (photos.length) setDrafts(prev => [...prev, { ...newDraft(), photos }])
  }

  const onPick = (e) => {
    addFiles(Array.from(e.target.files || []))
    e.target.value = ''
  }

  const onAddTo = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (addToRef.current && files.length) addPhotosTo(addToRef.current, files)
  }

  // Siste sletting kan angres uten tidsfrist (WCAG 2.2.1): til neste sletting, til grupperingen endres
  // (del opp / slå sammen), til lagring, eller til brukeren lukker meldingen. Forhåndsvisningene (objekt-URL-er)
  // frigjøres først når angring ikke lenger er mulig. Bildene er ikke lastet opp før lagring.
  const releaseRemoved = (removed) => {
    if (!removed) return
    const urls = removed.photo ? [removed.photo.url] : removed.draft.photos.map(p => p.url)
    urls.forEach(u => URL.revokeObjectURL(u))
  }
  const offerUndo = (removed, text) => {
    releaseRemoved(undoRef.current?.removed)
    // atPhotos: i kameraet vises angre bare til neste bilde tas; nederst på siden står den videre
    undoRef.current = { removed, text, atPhotos: draftsRef.current.reduce((n, d) => n + d.photos.length, 0) }
    setUndo(undoRef.current)
  }
  const dismissUndo = () => {
    releaseRemoved(undoRef.current?.removed)
    undoRef.current = null
    setUndo(null)
  }
  const undoRemove = () => {
    const current = undoRef.current
    if (!current) return
    const restored = restoreRemoved(draftsRef.current, current.removed, { maxPhotos: MAX_PHOTOS, maxItems: MAX_ITEMS })
    if (restored === draftsRef.current) {
      onToast(current.removed.draftRemoved || !draftsRef.current.some(d => d.key === current.removed.draft.key)
        ? L('Kan ikke angre: det er allerede 20 gjenstander', 'Cannot undo: there are already 20 items')
        : L('Kan ikke angre: gjenstanden har allerede 5 bilder', 'Cannot undo: the item already has 5 photos'), 'error')
      return
    }
    draftsRef.current = restored
    setDrafts(restored)
    undoRef.current = null
    setUndo(null)
  }

  const removeDraft = (key) => {
    const list = draftsRef.current
    const draftIndex = list.findIndex(d => d.key === key)
    if (draftIndex === -1) return
    draftsRef.current = list.filter(d => d.key !== key)
    setDrafts(draftsRef.current)
    offerUndo({ draft: list[draftIndex], draftIndex, draftRemoved: true, photo: null }, L('Gjenstand fjernet', 'Item removed'))
  }

  const removePhoto = (key, index) => {
    const { drafts: next, removed } = removePhotoAt(draftsRef.current, key, index)
    if (!removed) return
    draftsRef.current = next
    setDrafts(next)
    offerUndo(removed, L('Bilde slettet', 'Photo deleted'))
    // Fotograferer vi gjenstanden som forsvant, går kameraet tilbake til forrige gjenstand
    if (removed.draftRemoved && key === cameraKeyRef.current) {
      const prev = [...next].reverse().find(d => d.status !== 'saved')
      if (prev) setCameraKey(prev.key)
      else { const d = newDraft(); setDrafts(p => [...p, d]); setCameraKey(d.key) }
      setCameraSame(false)
    }
  }

  // «Del opp»: ett bilde per gjenstand
  const splitUp = (key) => {
    const d = draftsRef.current.find(x => x.key === key)
    if (!d) return
    if (draftsRef.current.length + d.photos.length - 1 > MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    dismissUndo()
    setDrafts(prev => splitDraft(prev, key, newDraft))
    onToast(L(`Delt opp i ${d.photos.length} gjenstander`, `Split into ${d.photos.length} items`))
  }

  // Slår gjenstanden sammen med den over (når to bilder var av samme ting)
  const mergeUp = (key) => {
    const prev = draftsRef.current
    const i = prev.findIndex(d => d.key === key)
    if (i < 1) return
    const above = prev[i - 1], cur = prev[i]
    if (above.status === 'analyzing' || cur.status === 'analyzing') return
    const photos = [...above.photos, ...cur.photos]
    if (photos.length > MAX_PHOTOS) { onToast(L('Maks 5 bilder per gjenstand', 'Max 5 photos per item'), 'error'); return }
    dismissUndo()
    const merged = { ...above, photos, status: above.status === 'saved' ? above.status : 'idle' }
    setDrafts([...prev.slice(0, i - 1), merged, ...prev.slice(i + 1)])
  }

  const startMerge = () => { setMergeSel([]); setMerging(true); setPendingFiles(null) }
  const cancelMerge = () => { setMerging(false); setMergeSel([]) }
  const toggleMergePhoto = (url) => setMergeSel(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])
  const approveMerge = () => {
    if (mergeSel.length < 2 || mergeSel.length > MAX_PHOTOS) return
    dismissUndo()
    setDrafts(prev => mergeSelectedPhotos(prev, mergeSel))
    cancelMerge()
    onToast(L('Bildene er slått sammen til én gjenstand', 'The photos have been merged into one item'))
  }

  // Kamera: hvert bilde blir en ny gjenstand, med mindre «Flere bilder av denne gjenstanden» er valgt.
  // Starter på siste gjenstand hvis den er tom, ellers på en ny.
  const openCamera = () => {
    setCameraSame(false)
    const last = drafts[drafts.length - 1]
    if (last && last.photos.length === 0 && last.status !== 'saved') { setCameraKey(last.key); return }
    if (drafts.length >= MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    const d = newDraft()
    setDrafts(prev => [...prev, d])
    setCameraKey(d.key)
  }

  // Bilder tatt raskt etter hverandre behandles i rekkefølge, så grupperingen blir riktig
  const captureToCamera = (files) => {
    captureQueue.current = captureQueue.current.then(async () => {
      const photos = await prepare(files)
      if (!photos.length) return
      const r = addCapturedPhotos(draftsRef.current, {
        currentKey: cameraKeyRef.current, sameItem: cameraSameRef.current, photos,
        makeDraft: newDraft, maxPhotos: MAX_PHOTOS, maxItems: MAX_ITEMS,
      })
      if (r.rejected) photos.slice(photos.length - r.rejected).forEach(p => URL.revokeObjectURL(p.url))
      draftsRef.current = r.drafts
      cameraKeyRef.current = r.currentKey
      setDrafts(r.drafts)
      setCameraKey(r.currentKey)
    })
  }

  // «Neste gjenstand»: neste bilde starter en ny gjenstand
  const nextCameraItem = () => {
    setCameraSame(false)
    const current = draftsRef.current.find(d => d.key === cameraKeyRef.current)
    if (current && current.photos.length === 0) return
    if (draftsRef.current.length >= MAX_ITEMS) return
    const d = newDraft()
    setDrafts(prev => [...prev, d])
    setCameraKey(d.key)
  }

  // Fra et kort («+ Ta bilde»): bildene hører til akkurat den gjenstanden
  const openCameraFor = (key) => { setCameraKey(key); setCameraSame(true) }

  // Tomme gjenstander fra kameraet fjernes når det lukkes
  const closeCamera = () => {
    setCameraKey(null)
    setCameraSame(false)
    setDrafts(prev => prev.filter(d => d.photos.length > 0 || d.title.trim() || d.key !== cameraKey))
  }

  const addEmpty = () => {
    if (drafts.length >= MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    setDrafts(prev => [...prev, newDraft()])
  }

  // ── AI ────────────────────────────────────────────────────────────────────────

  const aiTargets = drafts.filter(d => d.photos.length > 0 && (d.status === 'idle' || d.status === 'failed'))

  // Analysen går i en kø med høyst AI_PARALLEL kall samtidig. Bare kortene som analyseres er låst; resten av
  // siden kan brukes imens (legge til bilder, rette andre kort, lagre de som er ferdige).
  const analyzeAll = (consented = aiConsented, onlyKey = null, { auto = false } = {}) => {
    if (!consented) { setAskConsent({ kind: 'analyze', key: onlyKey }); return }
    let targets = draftsRef.current.filter(d => d.photos.length > 0 && (onlyKey ? d.key === onlyKey && (d.status === 'idle' || d.status === 'failed')
      : auto ? d.status === 'idle' && d.key !== cameraKeyRef.current : d.status === 'idle' || d.status === 'failed'))
    if (isDemo) {
      const room = (demoRemaining ?? 0) - aiQueue.current.length - aiRunning.current
      if (room <= 0) { if (!auto && !aiRunning.current) setDemoBlocked(true); return }
      targets = targets.slice(0, room)
    }
    if (!targets.length) return
    setAutoAnalyze(true)
    const b = aiBatch.current ||= { total: 0, done: 0, analyzed: 0, failedKeys: [], keys: new Set(), stopped: null, manual: false }
    b.total += targets.length
    b.manual = b.manual || !auto
    const keys = new Set(targets.map(d => d.key))
    keys.forEach(k => { b.keys.add(k); aiQueue.current.push(k) })
    draftsRef.current = draftsRef.current.map(d => keys.has(d.key) ? { ...d, status: 'analyzing' } : d)
    setDrafts(draftsRef.current)
    setAiProgress({ done: b.done, total: b.total })
    pumpAi()
  }

  const pumpAi = () => {
    const b = aiBatch.current
    while (b && !b.stopped && aiRunning.current < AI_PARALLEL && aiQueue.current.length) {
      const d = draftsRef.current.find(x => x.key === aiQueue.current[0])
      aiQueue.current.shift()
      if (!d) { b.done++; continue } // fjernet mens den ventet
      aiRunning.current++
      analyzeOne(d, b).finally(() => { aiRunning.current--; pumpAi() })
    }
    finishAi()
  }

  const analyzeOne = async (d, b) => {
    try {
      // Bare identifikasjon: ingen verdi i bulk (verdien er valgfri og fylles inn av brukeren)
      const { result, quota } = await analyzeItemPhotos(d.photos.map(p => p.file), { categories })
      if (typeof quota?.remaining === 'number') setDemoRemaining(quota.remaining)
      // AI fyller bare felt brukeren ikke har endret selv (også ved «Prøv AI igjen»). Fikk kortet flere bilder
      // underveis (kameraet), analyseres det på nytt med alle bildene.
      update(d.key, cur => ({
        status: cur.photos.length === d.photos.length ? 'analyzed' : 'idle',
        analysis: result.analysis || null,
        ...applyAiSuggestion(cur, aiSuggestion(result, categories)),
      }))
      b.analyzed++
    } catch (e) {
      update(d.key, { status: 'failed' })
      b.failedKeys.push(d.key)
      if (AI_STOP_CODES.includes(e.code)) b.stopped = b.stopped || e
    } finally {
      b.done++
      setAiProgress({ done: b.done, total: b.total })
    }
  }

  // Når køen er tom (eller stoppet av en grense): oppsummering, og kortene som ikke ble startet låses opp
  const finishAi = () => {
    const b = aiBatch.current
    if (!b || aiRunning.current > 0 || (aiQueue.current.length && !b.stopped)) return
    const notStarted = aiQueue.current.filter(k => draftsRef.current.some(d => d.key === k))
    const waiting = new Set(aiQueue.current)
    aiQueue.current = []
    aiBatch.current = null
    setAiProgress(null)
    setDrafts(prev => prev.map(d => d.status === 'analyzing' && waiting.has(d.key) ? { ...d, status: 'idle' } : d))
    if (b.stopped) setAutoAnalyze(false) // ikke prøv igjen av seg selv etter en grense eller feil hos AI-en

    if (b.stopped?.code === 'demo_limit') { setDemoRemaining(0); setDemoBlocked(true); return }
    // Ingenting lagres her: brukeren ser over kortene og trykker «Godkjenn og lagre alle».
    // Delvise feil vises i en oppsummering som blir stående til de er rettet (ikke i en toast som forsvinner).
    if (b.stopped || b.failedKeys.length) {
      setAiReport(prev => ({
        failedKeys: [...new Set([...(prev?.failedKeys || []).filter(k => !b.keys.has(k)), ...b.failedKeys])],
        stoppedCode: b.stopped?.code || null, notStarted: notStarted.length,
      }))
      return
    }
    setAiReport(prev => {
      const left = (prev?.failedKeys || []).filter(k => !b.keys.has(k))
      return left.length ? { ...prev, failedKeys: left, stoppedCode: null, notStarted: 0 } : null
    })
    if (b.manual) onToast(L('AI har fylt inn gjenstandene. Se over og trykk «Godkjenn og lagre alle».', 'AI has filled in the items. Review them and tap «Approve and save all».'))
  }

  // Etter første «Analyser med AI» analyseres nye bilder av seg selv, uten flere trykk. Gjenstanden kameraet
  // fotograferer venter til man går videre (det kan komme flere bilder av den), og alt venter litt, så bilder
  // som tas raskt etter hverandre kommer med i samme analyse.
  useEffect(() => {
    if (!autoAnalyze || !aiConsented || busy || merging) return
    if (!drafts.some(d => d.photos.length > 0 && d.status === 'idle' && d.key !== cameraKey)) return
    const t = setTimeout(() => analyzeAll(true, null, { auto: true }), 1200)
    return () => clearTimeout(t)
  }, [drafts, autoAnalyze, aiConsented, busy, merging, cameraKey])

  // Verdianslag: bare når brukeren ber om det, ett tekstkall per gjenstand (estimate-value), ingen bilder.
  // Verdien fylles inn synlig og merkes som AI-anslag; brukeren kan endre eller tømme den.
  const canEstimate = (d) => d.status !== 'saved' && d.status !== 'analyzing' && d.title.trim() && !d.estimating
  const estimateValues = async (consented = aiConsented, onlyKey = null) => {
    if (!consented) { setAskConsent({ kind: 'estimate', key: onlyKey }); return }
    // «Anslå verdi for alle» hopper over kort som fikk «for lite informasjon»; de kan prøves igjen på kortet
    let targets = draftsRef.current.filter(d => canEstimate(d) && (onlyKey ? d.key === onlyKey : !d.estimate && !d.estimateMissing))
    if (isDemo) {
      if (demoRemaining === 0) { setDemoBlocked(true); return }
      targets = targets.slice(0, demoRemaining)
    }
    if (!targets.length) return
    setEstimateReport(null)
    if (!onlyKey) { setBusy('estimating'); setProgress({ done: 0, total: targets.length }) }
    targets.forEach(d => update(d.key, { estimating: true }))
    let stopped = null
    let failed = 0
    await runPool(targets, AI_PARALLEL, async (d) => {
      try {
        const cat = categories.find(c => c.id === d.categoryId)
        // Bildeanalysen sendes med, så anslaget bygger på den uten at bildene sendes igjen
        const { estimate, insufficient, quota } = await requestValueEstimate({ title: d.title.trim(), description: d.description.trim(), category: cat?.label || '', condition: d.condition, analysis: d.analysis })
        if (typeof quota?.remaining === 'number') setDemoRemaining(quota.remaining)
        // For lite grunnlag: ingen verdi (aldri 0 kr), men tips om hva som kan hjelpe
        if (insufficient) { update(d.key, { estimating: false, estimateMissing: insufficient.missing }); return }
        if (!estimate.likely) throw new Error('no estimate')
        update(d.key, cur => ({
          estimating: false,
          estimateMissing: null,
          value: String(estimate.likely),
          estimate: { ...estimate, value: String(estimate.likely), basis: { title: cur.title, condition: cur.condition, categoryId: cur.categoryId } },
        }))
      } catch (e) {
        failed++
        update(d.key, { estimating: false })
        if (AI_STOP_CODES.includes(e.code)) stopped = stopped || e
      } finally {
        if (!onlyKey) setProgress(p => ({ ...p, done: p.done + 1 }))
      }
    }, () => !!stopped)
    setDrafts(prev => prev.map(d => d.estimating ? { ...d, estimating: false } : d))
    if (!onlyKey) setBusy(null)
    if (stopped?.code === 'demo_limit') { setDemoRemaining(0); setDemoBlocked(true); return }
    if (failed) setEstimateReport({ failed, stoppedCode: stopped?.code || null })
  }

  // ── Lagring ───────────────────────────────────────────────────────────────────

  const saveOne = async (d) => {
    const urls = []
    for (const p of d.photos) urls.push(await uploadEstateImage(p.file, id))
    const aiAnalysis = aiAnalysisRecord(d)
    // AI-ens anslag lagres for seg (veiledende), så lenge navn, tilstand og kategori er de samme som da det ble laget
    const b = d.estimate?.basis
    if (aiAnalysis && d.estimate?.valuation && b && b.title === d.title && b.condition === d.condition && b.categoryId === d.categoryId) aiAnalysis.valuation = d.estimate.valuation
    const { error } = await supabase.from('items').insert({
      estate_id: id,
      title: d.title.trim(),
      description: d.description.trim() || null,
      category_id: d.categoryId || null,
      condition: d.condition,
      added_by: session.user.id,
      added_by_name: profile?.display_name || '',
      status: 'active',
      image_url: urls[0] || null,
      extra_images: urls.slice(1),
      estimated_value: parseNOK(d.value) ?? null, // 0 er en verdi; tomt felt er ukjent
      // Begrunnelsen følger bare med når verdien fortsatt er AI-anslaget
      ...(estimateApplies(d) ? { estimate_reasoning: d.estimate.reasoning, estimate_confidence: d.estimate.confidence } : {}),
      // AI-vurderingen og hva brukeren gjorde med forslagene; bare når AI-en har analysert gjenstanden
      ...(aiAnalysis ? { ai_analysis: aiAnalysis } : {}),
    })
    if (error) {
      await removeImages(urls).catch(() => {})
      throw error
    }
  }

  const saveAll = async () => {
    if (isDemo) { setDemoBlocked(true); return }
    // Kort som AI-en fortsatt analyserer, venter; de kan lagres når de er ferdige
    const pending = draftsRef.current.filter(d => d.status !== 'saved' && d.status !== 'analyzing')
    const ready = pending.filter(d => d.title.trim())
    const missing = pending.length - ready.length
    if (!ready.length) { onToast(L('Gi gjenstandene et navn, eller bruk AI', 'Give the items a name, or use AI'), 'error'); return }
    dismissUndo()
    setBusy('saving')
    setProgress({ done: 0, total: ready.length })
    let saved = 0
    await runPool(ready, 3, async (d) => {
      update(d.key, { status: 'saving' })
      try {
        await saveOne(d)
        update(d.key, { status: 'saved' })
        saved++
      } catch (e) {
        console.error('Lagring feilet:', e)
        update(d.key, { status: 'saveFailed' })
      } finally {
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }
    })
    setBusy(null)
    const notSaved = ready.length - saved
    const analyzing = draftsRef.current.filter(d => d.status === 'analyzing').length
    if (!missing && !notSaved && !analyzing) {
      draftsRef.current.forEach(d => d.photos.forEach(p => URL.revokeObjectURL(p.url)))
      setDrafts([])
      setAiReport(null)
      setDone({ saved })
      window.scrollTo(0, 0)
      return
    }
    // Lagrede gjenstander fjernes fra listen; resten blir igjen
    setDrafts(prev => prev.filter(d => d.status !== 'saved'))
    const parts = [L(`${saved} lagt til.`, `${saved} added.`)]
    if (missing) parts.push(L(`${missing} mangler navn.`, `${missing} need a name.`))
    if (notSaved) parts.push(L(`${notSaved} kunne ikke lagres — prøv igjen.`, `${notSaved} could not be saved — try again.`))
    if (analyzing) parts.push(L(`${analyzing} analyseres fortsatt av AI.`, `${analyzing} still being analysed by AI.`))
    onToast(parts.join(' '), saved ? undefined : 'error')
  }

  // ── Visning ───────────────────────────────────────────────────────────────────

  const cameraDraft = drafts.find(d => d.key === cameraKey)
  const cameraIndex = drafts.findIndex(d => d.key === cameraKey)
  const toSave = drafts.filter(d => d.status !== 'saved' && d.status !== 'analyzing' && d.title.trim()).length
  const full = drafts.length >= MAX_ITEMS
  const mergeable = drafts.filter(d => d.status !== 'saved' && d.status !== 'analyzing' && d.photos.length > 0)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files || [])) }}
      style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px 260px', fontFamily: 'Karla, sans-serif', minHeight: '100vh' }}
    >
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '0.875rem', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>
        {L('← Tilbake', '← Back')}
      </button>

      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.5rem', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>
        {L('Legg til flere gjenstander', 'Add several items')}
      </h1>
      <p style={{ color: MUTED, fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '18px' }}>
        {L('Ta ett bilde av hver gjenstand. AI fyller inn navn, kategori og tilstand, du ser over, og så lagrer du alle samlet. Opptil 20 gjenstander om gangen.',
           'Take one photo of each item. AI fills in name, category and condition, you review, then you save them all at once. Up to 20 items at a time.')}
      </p>

      {isDemo && (
        <div style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '10px', padding: '12px 14px', fontSize: '0.8125rem', color: '#3A5A30', lineHeight: 1.5, marginBottom: '18px' }}>
          <strong>{L(`${demoRemaining} av 5 AI-forsøk igjen.`, `${demoRemaining} of 5 AI attempts left.`)}</strong>{' '}
          {L('Hver gjenstand bruker ett forsøk. Gjenstandene lagres ikke.', 'Each item uses one attempt. The items are not saved.')}
        </div>
      )}

      {done && (
        <div role="status" style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '12px', padding: '18px', marginBottom: '18px' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.25rem', color: '#3A2F26', marginBottom: '6px' }}>
            {L(`✓ ${done.saved} ${done.saved === 1 ? 'gjenstand' : 'gjenstander'} lagt til i boet`, `✓ ${done.saved} ${done.saved === 1 ? 'item' : 'items'} added to the estate`)}
          </div>
          <p style={{ fontSize: '0.875rem', color: '#3A5A30', lineHeight: 1.5, marginBottom: '14px' }}>
            {myRole === 'admin'
              ? L('Neste steg: inviter arvingene, så de kan se gjenstandene og vise interesse.', 'Next step: invite the heirs so they can see the items and show interest.')
              : L('Gjenstandene er nå synlige for alle i boet.', 'The items are now visible to everyone in the estate.')}
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {myRole === 'admin' && !isDemo && (
              <button onClick={() => navigate(`/estate/${id}/admin`)} style={{ ...bigBtn, background: '#3A2F26', color: '#FBF9F5', border: 'none' }}>
                {L('Inviter arvingene', 'Invite the heirs')}
              </button>
            )}
            <button onClick={() => navigate(`/estate/${id}`)} style={{ ...bigBtn, background: myRole === 'admin' ? '#fff' : '#3A2F26', color: myRole === 'admin' ? '#3A2F26' : '#FBF9F5', border: myRole === 'admin' ? `1px solid ${FIELD_BORDER}` : 'none' }}>
              {L('Se gjenstandene', 'See the items')}
            </button>
            <button onClick={() => { setDone(null); openCamera() }} style={{ ...bigBtn, background: '#fff', color: '#3A2F26', border: `1px solid ${FIELD_BORDER}` }}>
              {L('Legg til flere', 'Add more')}
            </button>
          </div>
        </div>
      )}

      {/* Kilder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
        <SourceButton onClick={openCamera} disabled={full || !!busy || merging}
          title={L('Ta bilder', 'Take photos')} hint={L('Ett bilde = én gjenstand', 'One photo = one item')} primary cameraReturn />
        <SourceButton onClick={() => pickRef.current.click()} disabled={full || !!busy || merging}
          title={L('Velg bilder', 'Choose photos')} hint={L('Kamerarull, filer — eller dra hit', 'Camera roll, files — or drag here')} />
      </div>
      <input ref={pickRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />
      <input ref={addInputRef} type="file" accept="image/*" multiple onChange={onAddTo} style={{ display: 'none' }} />
      <button onClick={addEmpty} disabled={full || !!busy || merging} style={{ background: 'none', border: 'none', color: '#5F6E52', cursor: 'pointer', fontSize: '0.8125rem', padding: '4px 0 18px', fontFamily: 'Karla, sans-serif', textDecoration: 'underline' }}>
        {L('+ Legg til gjenstand uten bilde', '+ Add an item without a photo')}
      </button>

      {/* Hver for seg eller samme gjenstand? */}
      {pendingFiles && (
        <div style={{ background: '#fff', border: '2px solid #5F6E52', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.9375rem', color: '#3A2F26', fontWeight: '500', marginBottom: '12px' }}>
            {L(`Du valgte ${pendingFiles.length} bilder. Hva viser de?`, `You chose ${pendingFiles.length} photos. What do they show?`)}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => addAsSeparate(pendingFiles)} style={{ flex: '1 1 180px', padding: '12px', background: '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>
              {L(`${pendingFiles.length} ulike gjenstander`, `${pendingFiles.length} different items`)}
            </button>
            <button onClick={() => addAsOne(pendingFiles)} style={{ flex: '1 1 180px', padding: '12px', background: '#FBF9F5', color: '#3A2F26', border: `1px solid ${FIELD_BORDER}`, borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>
              {L('Samme gjenstand', 'The same item')}{pendingFiles.length > MAX_PHOTOS ? L(' (de 5 første)', ' (first 5)') : ''}
            </button>
            <button onClick={() => setPendingFiles(null)} style={{ ...smallBtn, border: 'none' }}>{L('Avbryt', 'Cancel')}</button>
          </div>
          <p style={{ fontSize: '0.75rem', color: MUTED, marginTop: '10px', marginBottom: 0 }}>
            {L('Du kan slå sammen eller legge til bilder etterpå.', 'You can merge items or add photos afterwards.')}
          </p>
        </div>
      )}

      {preparing && <p style={{ fontSize: '0.8125rem', color: MUTED, marginBottom: '12px' }}>{L('Klargjør bilder…', 'Preparing photos…')}</p>}

      {dragOver && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(95,110,82,0.18)', border: '4px dashed #5F6E52', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#fff', padding: '16px 24px', borderRadius: '12px', fontSize: '1rem', color: '#3A2F26' }}>{L('Slipp bildene her', 'Drop the photos here')}</div>
        </div>
      )}

      {/* Gjenstandene */}
      {drafts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8125rem', color: MUTED }}>
            {L(`${drafts.length} av maks ${MAX_ITEMS} gjenstander`, `${drafts.length} of max ${MAX_ITEMS} items`)}
          </span>
          {!merging && mergeable.length >= 2 && (
            <button onClick={startMerge} disabled={!!busy} style={{ ...smallBtn, padding: '8px 12px', fontSize: '0.8125rem', color: '#3A2F26', background: '#fff', opacity: busy ? 0.5 : 1 }}>
              {L('Slå sammen gjenstander', 'Merge items')}
            </button>
          )}
        </div>
      )}

      {aiReport && !merging && !busy && (
        <AiSummary report={aiReport} drafts={drafts} onClose={() => setAiReport(null)} />
      )}

      {/* Tilbud om verdianslag etter analysen: et synlig, frivillig valg */}
      {(() => {
        const n = drafts.filter(d => canEstimate(d) && !d.estimate && !d.estimateMissing).length
        if (merging || busy || !n || !drafts.some(d => d.status === 'analyzed')) return null
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', fontSize: '0.9375rem', color: '#3A2F26' }}>
            <span style={{ flex: '1 1 220px', lineHeight: 1.5 }}>
              {L('Vil du ha et grovt verdianslag? Verdien er valgfri og bare veiledende.', 'Would you like a rough value estimate? The value is optional and for guidance only.')}
              <span style={{ display: 'block', fontSize: '0.8125rem', color: MUTED }}>{L(`Bruker ${n} AI-forsøk.`, `Uses ${n} AI attempts.`)}</span>
            </span>
            <button onClick={() => estimateValues()} style={{ ...smallBtn, background: '#fff', color: '#3A2F26', fontWeight: '600' }}>
              {L(`Anslå verdi for alle (${n})`, `Estimate value for all (${n})`)}
            </button>
          </div>
        )
      })()}

      {estimateReport && !busy && (
        <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: '#F3E3D3', border: '1px solid #C9AE8E', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', fontSize: '0.9375rem', color: '#3A2F26', lineHeight: 1.5 }}>
          <span style={{ flex: 1 }}>
            {estimateReport.stoppedCode ? `${aiErrorMessage(estimateReport.stoppedCode)} ` : ''}
            {L(`Verdien ble ikke anslått for ${estimateReport.failed} ${estimateReport.failed === 1 ? 'gjenstand' : 'gjenstander'}. Du kan prøve igjen på kortet, eller la feltet stå tomt.`, `The value was not estimated for ${estimateReport.failed} ${estimateReport.failed === 1 ? 'item' : 'items'}. You can try again on the card, or leave the field empty.`)}
          </span>
          <button onClick={() => setEstimateReport(null)} aria-label={L('Lukk meldingen', 'Close the message')} style={{ minWidth: '44px', minHeight: '44px', background: 'none', border: 'none', fontSize: '1.25rem', color: '#5C4530', cursor: 'pointer', marginTop: '-10px', marginRight: '-10px' }}>×</button>
        </div>
      )}

      {merging ? (
        <MergeGrid drafts={drafts} items={mergeable} selected={mergeSel} onToggle={toggleMergePhoto} />
      ) : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {drafts.map((d, i) => (
          <DraftCard key={d.key} draft={d} index={i} categories={categories} locked={!!busy || d.status === 'analyzing'}
            onChange={patch => update(d.key, patch)}
            onRemove={() => removeDraft(d.key)}
            onRemovePhoto={pi => removePhoto(d.key, pi)}
            onMergeUp={i > 0 ? () => mergeUp(d.key) : null}
            onSplit={() => splitUp(d.key)}
            onRetry={() => analyzeAll(aiConsented, d.key)}
            onEstimate={() => estimateValues(aiConsented, d.key)}
            onAddPhotos={() => { addToRef.current = d.key; addInputRef.current.click() }}
            onCamera={() => openCameraFor(d.key)}
          />
        ))}
      </div>}

      {drafts.length === 0 && !pendingFiles && !done && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: MUTED, fontSize: '0.875rem', border: '2px dashed #D9CFC0', borderRadius: '12px' }}>
          {L('Ingen gjenstander ennå. Start med å ta eller velge bilder.', 'No items yet. Start by taking or choosing photos.')}
        </div>
      )}

      {/* Handlinger nederst: alltid synlige, også med 20 kort */}
      {(drafts.length > 0 || undo) && (
        <div ref={bottomBarRef} className="bottom-bar" role="region" aria-label={L('Lagre gjenstandene', 'Save the items')} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px max(16px, env(safe-area-inset-bottom))', background: '#fff', borderTop: '1px solid #D9CFC0', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 100 }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {askConsent && (
              <div style={{ marginBottom: '10px' }}>
                <AiConsent onCancel={() => setAskConsent(null)} onAccept={() => {
                  const ask = askConsent
                  giveAiConsent(); setAiConsented(true); setAskConsent(null)
                  if (ask.kind === 'estimate') estimateValues(true, ask.key); else analyzeAll(true, ask.key)
                }} />
              </div>
            )}
            {aiProgress && !merging && (
              <div style={{ marginBottom: '10px' }}>
                <div role="status" style={{ fontSize: '0.875rem', color: '#3A2F26', marginBottom: '6px' }}>
                  {L(`AI analyserer… ${aiProgress.done} av ${aiProgress.total} ferdig. Du kan fortsette imens.`, `AI is analysing… ${aiProgress.done} of ${aiProgress.total} done. You can carry on meanwhile.`)}
                </div>
                <div style={{ height: '6px', background: '#E8DFD0', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${aiProgress.total ? (aiProgress.done / aiProgress.total) * 100 : 0}%`, background: '#5F6E52', transition: 'width 0.3s' }} />
                </div>
              </div>
            )}
            {merging ? (
              <div>
                <div style={{ fontSize: '0.8125rem', color: mergeSel.length > MAX_PHOTOS ? '#8A4B2A' : '#5C4530', marginBottom: '10px' }}>
                  {mergeSel.length > MAX_PHOTOS
                    ? L('Maks 5 bilder per gjenstand — fjern noen av de markerte', 'Max 5 photos per item — unmark some')
                    : mergeSel.length < 2
                      ? L('Marker minst to bilder som viser samme gjenstand', 'Mark at least two photos of the same item')
                      : L(`${mergeSel.length} bilder blir én gjenstand`, `${mergeSel.length} photos become one item`)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={cancelMerge} style={{ flex: 1, padding: '14px 10px', background: '#fff', color: '#5C4530', border: `1px solid ${FIELD_BORDER}`, borderRadius: '10px', cursor: 'pointer', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif' }}>
                    {L('Avbryt', 'Cancel')}
                  </button>
                  {(() => {
                    const ok = mergeSel.length >= 2 && mergeSel.length <= MAX_PHOTOS
                    return (
                      <button onClick={approveMerge} disabled={!ok} style={{
                        flex: 2, padding: '14px 10px', border: 'none', borderRadius: '10px', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', fontWeight: '500',
                        background: ok ? '#5F6E52' : '#E8DFD0', color: ok ? '#fff' : '#5C4530', cursor: ok ? 'pointer' : 'not-allowed',
                      }}>
                        {L('Godkjenn sammenslåing', 'Approve merge')}{mergeSel.length ? ` (${mergeSel.length})` : ''}
                      </button>
                    )
                  })()}
                </div>
              </div>
            ) : busy ? (
              <div>
                <div role="status" style={{ fontSize: '0.875rem', color: '#3A2F26', marginBottom: '8px' }}>
                  {busy === 'estimating' ? L(`Anslår verdi… ${progress.done} av ${progress.total}`, `Estimating value… ${progress.done} of ${progress.total}`) : L(`Lagrer… ${progress.done} av ${progress.total}`, `Saving… ${progress.done} of ${progress.total}`)}
                </div>
                <div style={{ height: '8px', background: '#E8DFD0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: '#5F6E52', transition: 'width 0.3s' }} />
                </div>
              </div>
            ) : !askConsent && (
              <>
                {undo && !cameraDraft && (
                  <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9375rem', color: '#3A2F26', marginBottom: '10px' }}>
                    <span style={{ flex: 1 }}>{undo.text}</span>
                    <button onClick={undoRemove} style={{ ...smallBtn, fontSize: '0.9375rem', color: '#3A2F26', fontWeight: '600', background: '#fff' }}>{L('Angre', 'Undo')}</button>
                    <button onClick={dismissUndo} aria-label={L('Lukk meldingen', 'Close the message')} style={{ ...smallBtn, minWidth: '44px', border: 'none', fontSize: '1.125rem' }}>×</button>
                  </div>
                )}
                {(() => {
                  // Oversikt før lagring: hvor mange som er klare, og hvilke som mangler navn
                  const missing = drafts.filter(d => d.status !== 'saved' && d.status !== 'analyzing' && !d.title.trim() && !aiTargets.includes(d))
                  if (!toSave && !missing.length) return null
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.875rem', color: '#3A2F26', marginBottom: '8px' }}>
                      <span>{L(`${toSave} klare til lagring`, `${toSave} ready to save`)}</span>
                      {missing.length > 0 && <>
                        <span style={{ color: '#8A4B2A' }}>· {L(`${missing.length} mangler navn og lagres ikke`, `${missing.length} without a name will not be saved`)}</span>
                        <button onClick={() => focusDraft(missing[0].key)} style={{ ...smallBtn, color: '#3A2F26' }}>
                          {L('Vis', 'Show')}
                        </button>
                      </>}
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {aiTargets.length > 0 && (
                    <button onClick={() => analyzeAll()} style={{ ...bigBtn, flex: '3 1 180px', background: '#5F6E52', color: '#fff', border: 'none' }}>
                      {L(`Analyser med AI (${aiTargets.length})`, `Analyse with AI (${aiTargets.length})`)}
                    </button>
                  )}
                  <button onClick={saveAll} disabled={!toSave} style={{
                    ...bigBtn, flex: '2 1 180px', border: 'none',
                    background: toSave ? '#3A2F26' : '#E8DFD0', color: toSave ? '#FBF9F5' : '#5C4530', cursor: toSave ? 'pointer' : 'not-allowed',
                  }}>
                    {toSave ? L(`Godkjenn og lagre alle (${toSave})`, `Approve and save all (${toSave})`) : L('Godkjenn og lagre alle', 'Approve and save all')}
                  </button>
                </div>
                {aiTargets.length > 0 && toSave > 0 && (
                  <p style={{ fontSize: '0.75rem', color: MUTED, margin: '8px 0 0' }}>
                    {L('Ingenting lagres før du trykker «Godkjenn og lagre alle».', 'Nothing is saved until you tap «Approve and save all».')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {cameraDraft && (
        <CameraCapture
          photos={cameraDraft.photos.map(p => p.url)}
          maxPhotos={MAX_PHOTOS}
          onCapture={captureToCamera}
          onRemovePhoto={pi => removePhoto(cameraKey, pi)}
          onClose={closeCamera}
          undo={undo && undo.atPhotos === drafts.reduce((n, d) => n + d.photos.length, 0) ? { text: undo.text, onUndo: undoRemove } : null}
          multi={{
            itemNumber: cameraIndex + 1,
            itemCount: drafts.filter(d => d.photos.length > 0).length,
            photoCount: drafts.reduce((n, d) => n + d.photos.length, 0),
            sameItem: cameraSame,
            onSameItem: setCameraSame,
            onNextItem: nextCameraItem,
            maxItems: MAX_ITEMS,
            full: drafts.length >= MAX_ITEMS && cameraDraft.photos.length > 0,
          }}
        />
      )}

      {demoBlocked && <DemoNotice onClose={() => setDemoBlocked(false)} onSignup={async () => { await signOut(); navigate('/logg-inn') }} />}
    </div>
  )
}

function SourceButton({ onClick, disabled, title, hint, primary, cameraReturn }) {
  return (
    <button onClick={onClick} disabled={disabled} data-camera-return={cameraReturn || undefined} style={{
      display: 'block', textAlign: 'left', padding: '16px', minHeight: '64px',
      background: primary ? '#3A2F26' : '#fff', border: primary ? 'none' : `1px solid ${FIELD_BORDER}`, borderRadius: '12px',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'Karla, sans-serif',
    }}>
      <span style={{ display: 'block', fontSize: '1rem', color: primary ? '#FBF9F5' : '#3A2F26', fontWeight: '500' }}>{title}</span>
      <span style={{ display: 'block', fontSize: '0.8125rem', color: primary ? '#E8DFD0' : MUTED, lineHeight: 1.4, marginTop: '2px' }}>{hint}</span>
    </button>
  )
}

// Alle bildene i ett rutenett, merket med gjenstandsnummeret. Trykk for å markere; tallet oppe til høyre
// viser rekkefølgen (1 blir hovedbildet).
function MergeGrid({ drafts, items, selected, onToggle }) {
  const photos = items.flatMap(d => d.photos.map(p => ({ ...p, itemNo: drafts.indexOf(d) + 1 })))
  return (
    <div>
      <p style={{ fontSize: '0.875rem', color: '#5C4530', lineHeight: 1.5, marginBottom: '14px' }}>
        {L('Trykk på bildene som viser samme gjenstand, og godkjenn nederst. Bildet du markerer først blir hovedbildet.',
           'Tap the photos that show the same item, then approve below. The first photo you mark becomes the main photo.')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
        {photos.map(p => {
          const order = selected.indexOf(p.url) + 1
          return (
            <button key={p.url} onClick={() => onToggle(p.url)} aria-pressed={order > 0} style={{
              position: 'relative', aspectRatio: '1', padding: 0, borderRadius: '10px', overflow: 'hidden', cursor: 'pointer',
              border: order ? '3px solid #5F6E52' : '1px solid #D9CFC0', background: '#E8DFD0',
            }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{
                position: 'absolute', top: '6px', right: '6px', width: '24px', height: '24px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8125rem', fontWeight: '600',
                fontFamily: 'Karla, sans-serif', background: order ? '#5F6E52' : 'rgba(255,255,255,0.85)',
                color: '#fff', border: order ? 'none' : '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>{order || ''}</span>
              <span style={{
                position: 'absolute', left: '6px', bottom: '6px', padding: '2px 7px', borderRadius: '10px',
                background: 'rgba(58,47,38,0.75)', color: '#FBF9F5', fontSize: '0.6875rem', fontFamily: 'Karla, sans-serif',
              }}>{L(`Gjenstand ${p.itemNo}`, `Item ${p.itemNo}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Oppsummering etter AI-analyse med feil. Blir stående til alt er rettet eller brukeren lukker den,
// i stedet for en melding som forsvinner etter noen sekunder.
function AiSummary({ report, drafts, onClose }) {
  const needs = drafts
    .map((d, i) => ({ d, no: i + 1 }))
    .filter(({ d }) => report.failedKeys.includes(d.key) && d.status === 'failed' && !d.title.trim())
  if (!needs.length && !report.stoppedCode) return null
  return (
    <div role="status" style={{ background: '#F3E3D3', border: '1px solid #C9AE8E', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', color: '#3A2F26', fontSize: '0.9375rem', lineHeight: 1.5 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          {report.stoppedCode && (
            <p style={{ margin: '0 0 8px' }}>
              {aiErrorMessage(report.stoppedCode)}
              {report.notStarted > 0 && ` ${L(`${report.notStarted} ${report.notStarted === 1 ? 'gjenstand ble' : 'gjenstander ble'} ikke analysert. Prøv igjen med «Analyser med AI» senere, eller fyll inn selv.`, `${report.notStarted} ${report.notStarted === 1 ? 'item was' : 'items were'} not analysed. Try «Analyse with AI» again later, or fill them in yourself.`)}`}
            </p>
          )}
          {needs.length > 0 && (
            <p style={{ margin: 0 }}>
              {L(`AI klarte ikke ${needs.length} ${needs.length === 1 ? 'gjenstand' : 'gjenstander'}. Skriv inn navnet selv, eller trykk «Prøv AI igjen» på kortet.`,
                 `AI could not do ${needs.length} ${needs.length === 1 ? 'item' : 'items'}. Type the name yourself, or tap «Try AI again» on the card.`)}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label={L('Lukk oppsummeringen', 'Close the summary')} style={{ minWidth: '44px', minHeight: '44px', background: 'none', border: 'none', fontSize: '1.25rem', color: '#5C4530', cursor: 'pointer', marginTop: '-10px', marginRight: '-10px' }}>×</button>
      </div>
      {needs.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {needs.map(({ d, no }) => (
            <button key={d.key} onClick={() => focusDraft(d.key)} style={{ ...smallBtn, background: '#fff', color: '#3A2F26' }}>
              {L(`Gå til gjenstand ${no}`, `Go to item ${no}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS = {
  analyzing: () => ({ text: L('AI analyserer…', 'AI is analysing…'), color: '#5F6E52', bg: '#DCE3D2' }),
  analyzed: () => ({ text: L('✓ Fylt inn av AI – se over', '✓ Filled in by AI – review'), color: '#5F6E52', bg: '#DCE3D2' }),
  failed: () => ({ text: L('AI klarte ikke denne', 'AI could not do this one'), color: '#8A4B2A', bg: '#F3E3D3' }),
  saveFailed: () => ({ text: L('Kunne ikke lagres — prøv igjen', 'Could not be saved — try again'), color: '#8A4B2A', bg: '#F3E3D3' }),
  saving: () => ({ text: L('Lagrer…', 'Saving…'), color: '#5C4530', bg: '#E8DFD0' }),
  saved: () => ({ text: L('✓ Lagret', '✓ Saved'), color: '#5F6E52', bg: '#DCE3D2' }),
}

function DraftCard({ draft: d, index, categories, locked, onChange, onRemove, onRemovePhoto, onMergeUp, onSplit, onRetry, onEstimate, onAddPhotos, onCamera }) {
  const status = STATUS[d.status]?.()
  const disabled = locked || d.status === 'saved'
  const aiValue = estimateApplies(d)
  const showValueInMore = !d.estimate && !d.estimating
  // AI-vurderingen: kort oppsummering, advarsel ved flere gjenstander, og hvilke felt som fortsatt er AI-forslag
  const ai = d.analysis?.ai
  const summary = ai ? identificationSummary(ai) : ''
  const multiple = ai ? multipleItemsText(ai) : ''
  const fieldNames = { title: L('navn', 'name'), categoryId: L('kategori', 'category'), condition: L('tilstand', 'condition'), description: L('beskrivelse', 'description') }
  const aiFields = Object.keys(fieldNames).filter(f => d.aiFilled?.[f] !== undefined && d[f] === d.aiFilled[f]).map(f => fieldNames[f])
  const photoTip = !disabled && d.photos.length < MAX_PHOTOS ? ai?.photo_suggestions?.[0]?.reason : null
  const valueField = (
    <div style={{ marginTop: showValueInMore ? 0 : '8px' }}>
      {!showValueInMore && <label htmlFor={`value-${d.key}`} style={{ display: 'block', fontSize: '0.875rem', color: '#5C4530', marginBottom: '4px' }}>{L('Verdi i kroner (valgfri)', 'Value in NOK (optional)')}</label>}
      <input id={`value-${d.key}`} value={d.value} onChange={e => onChange({ value: e.target.value })} disabled={disabled || d.estimating} inputMode="numeric"
        aria-label={showValueInMore ? L('Verdi i NOK (valgfri)', 'Value in NOK (optional)') : undefined} aria-describedby={aiValue ? `est-${d.key}` : undefined}
        placeholder={d.estimating ? L('Anslår verdi…', 'Estimating value…') : L('Verdi i NOK (valgfri)', 'Value in NOK (optional)')} style={inputStyle} />
      {aiValue && (
        <div id={`est-${d.key}`} style={{ fontSize: '0.8125rem', color: '#5C4530', marginTop: '4px', lineHeight: 1.5 }}>
          {L('Veiledende AI-anslag, ikke en dokumentert markedsverdi', 'Indicative AI estimate, not a documented market value')}
          {d.estimate.low && d.estimate.high ? ` (${formatNOK(d.estimate.low)} – ${formatNOK(d.estimate.high)})` : ''}
          {'. '}{L('Du kan endre eller tømme feltet.', 'You can change or clear the field.')}
        </div>
      )}
    </div>
  )
  return (
    <div id={`draft-${d.key}`} style={{ background: '#fff', border: `1px solid ${d.status === 'failed' || d.status === 'saveFailed' ? '#C9AE8E' : '#D9CFC0'}`, borderRadius: '12px', padding: '14px', opacity: d.status === 'saved' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8125rem', color: MUTED }}>{L(`Gjenstand ${index + 1}`, `Item ${index + 1}`)}{d.photos.length > 1 ? L(` · ${d.photos.length} bilder`, ` · ${d.photos.length} photos`) : ''}</span>
        {status && <span style={{ fontSize: '0.8125rem', color: status.color, background: status.bg, padding: '3px 9px', borderRadius: '12px' }}>{status.text}</span>}
      </div>
      {d.status === 'failed' && !locked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontSize: '0.8125rem', color: '#8A4B2A' }}>
          <span>{L('Fyll inn selv, eller', 'Fill it in yourself, or')}</span>
          <button onClick={onRetry} style={{ ...smallBtn, minHeight: '40px', fontSize: '0.8125rem', color: '#3A2F26' }}>{L('Prøv AI igjen', 'Try AI again')}</button>
        </div>
      )}

      {/* Bilder */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {d.photos.map((p, i) => (
          <div key={p.url} style={{ position: 'relative', width: '84px', height: '84px', borderRadius: '8px', overflow: 'hidden', background: '#E8DFD0' }}>
            <img src={p.url} alt={L(`Gjenstand ${index + 1}, bilde ${i + 1}`, `Item ${index + 1}, photo ${i + 1}`)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!disabled && (
              <button onClick={() => onRemovePhoto(i)} aria-label={L(`Slett bilde ${i + 1}`, `Delete photo ${i + 1}`)} style={{
                position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
                borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.125rem', lineHeight: '1', padding: 0,
              }}>×</button>
            )}
          </div>
        ))}
        {!disabled && d.photos.length < MAX_PHOTOS && <>
          <button onClick={onCamera} style={tileStyle}>{L('+ Ta bilde', '+ Take photo')}</button>
          <button onClick={onAddPhotos} style={tileStyle}>{L('+ Velg bilder', '+ Choose photos')}</button>
        </>}
      </div>
      {photoTip && <p style={{ fontSize: '0.8125rem', color: MUTED, margin: '-4px 0 10px', lineHeight: 1.5 }}>{L('Tips', 'Tip')}: {photoTip}</p>}

      {/* Felter: navn, kategori og tilstand alltid synlig; beskrivelse og verdi under «Mer» */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <input id={`draft-title-${d.key}`} value={d.title} onChange={e => onChange({ title: e.target.value })} disabled={disabled} maxLength={200} aria-label={L('Navn', 'Name')}
          placeholder={d.photos.length ? L('Navn (AI kan fylle inn)', 'Name (AI can fill in)') : L('Navn på gjenstand', 'Item name')}
          style={{ ...inputStyle, gridColumn: '1 / -1' }} />
        <select value={d.categoryId} onChange={e => onChange({ categoryId: e.target.value })} disabled={disabled} style={inputStyle} aria-label={L('Kategori', 'Category')}>
          <option value="">{L('Kategori', 'Category')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{categoryLabel(c.label)}</option>)}
        </select>
        <select value={d.condition} onChange={e => onChange({ condition: e.target.value })} disabled={disabled} style={inputStyle} aria-label={L('Tilstand', 'Condition')}>
          {CONDITION_OPTIONS().map(o => <option key={o.value} value={o.value}>{o.value === 'unknown' ? L('Tilstand: ikke vurdert', 'Condition: not assessed') : o.label}</option>)}
        </select>
      </div>
      {ai && (aiFields.length > 0 || summary) && (
        <p style={{ fontSize: '0.8125rem', color: MUTED, margin: '6px 0 0', lineHeight: 1.5 }}>
          {summary && <>{L('AI', 'AI')}: {summary}. </>}
          {aiFields.length > 0 && L(`AI-forslag: ${aiFields.join(', ')}. Se over.`, `AI suggestions: ${aiFields.join(', ')}. Please review.`)}
        </p>
      )}
      {multiple && (
        <p style={{ fontSize: '0.8125rem', color: '#8A4B2A', background: '#F3E3D3', borderRadius: '8px', padding: '8px 10px', margin: '8px 0 0', lineHeight: 1.5 }}>
          {multiple}{d.photos.length > 1 ? ` ${L('Du kan også dele opp kortet nedenfor.', 'You can also split the card below.')}` : ''}
        </p>
      )}
      {(d.estimate || d.estimating) && valueField}
      {d.estimateMissing && !d.estimate && !d.estimating && (
        <p style={{ fontSize: '0.8125rem', color: '#5C4530', background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '8px 10px', margin: '8px 0 0', lineHeight: 1.5 }}>
          {L('For lite informasjon til å anslå verdi.', 'Too little information to estimate a value.')}
          {d.estimateMissing.length > 0 && <> {L('Dette kan hjelpe', 'This could help')}: {d.estimateMissing.join('; ')}.</>}
        </p>
      )}
      <details style={{ marginTop: '8px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#5C4530', padding: '10px 0', minHeight: '44px', boxSizing: 'border-box' }}>
          {showValueInMore
            ? <>{L('Mer', 'More')}{d.description.trim() || d.value ? ` · ${[d.description.trim() && L('beskrivelse', 'description'), d.value && formatNOK(d.value)].filter(Boolean).join(' · ')}` : ` · ${L('beskrivelse og verdi (valgfritt)', 'description and value (optional)')}`}</>
            : <>{L('Mer', 'More')} · {d.description.trim() ? L('beskrivelse', 'description') : L('beskrivelse (valgfritt)', 'description (optional)')}</>}
        </summary>
        <div style={{ display: 'grid', gap: '8px', paddingTop: '6px' }}>
          <textarea value={d.description} onChange={e => onChange({ description: e.target.value })} disabled={disabled} maxLength={2000} rows={2} aria-label={L('Beskrivelse', 'Description')}
            placeholder={L('Beskrivelse (valgfri)', 'Description (optional)')}
            style={{ ...inputStyle, resize: 'vertical', fontSize: '0.9375rem' }} />
          {showValueInMore && valueField}
          {ai && <div style={{ borderTop: '1px solid #E8DFD0', paddingTop: '8px' }}><AnalysisDetails analysis={d.analysis} headingLevel={4} /></div>}
        </div>
      </details>

      {!disabled && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          {d.title.trim() && !d.estimate && !d.estimating && <button onClick={onEstimate} style={smallBtn}>{L('Anslå verdi (AI)', 'Estimate value (AI)')}</button>}
          {d.photos.length > 1 && <button onClick={onSplit} style={smallBtn}>{L('Del opp: ett bilde per gjenstand', 'Split: one photo per item')}</button>}
          {onMergeUp && <button onClick={onMergeUp} style={smallBtn}>{L('↑ Samme gjenstand som over', '↑ Same item as above')}</button>}
          <button onClick={onRemove} style={{ ...smallBtn, color: '#8A4B2A' }}>{L('Fjern', 'Remove')}</button>
        </div>
      )}
    </div>
  )
}

const tileStyle = {
  width: '84px', height: '84px', borderRadius: '8px', border: `2px dashed ${FIELD_BORDER}`, background: '#FBF9F5',
  cursor: 'pointer', fontSize: '0.8125rem', color: '#5C4530', fontFamily: 'Karla, sans-serif', lineHeight: 1.3,
  padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
}
