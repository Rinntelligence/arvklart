// Legg til mange gjenstander på en gang (maks 20): ta bilder på stedet eller velg fra kamerarullen/PC-en,
// la AI fylle inn navn, kategori, tilstand og verdi for alle, og legg dem inn i boet.
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getCategories, supabase, signOut } from '../lib/supabase'
import { downscaleImage, removeImages, uploadEstateImage } from '../lib/images'
import { hasAiConsent, giveAiConsent } from '../lib/aiConsent'
import { formatNOK, parseNOK } from '../lib/format'
import { L } from '../lib/lang'
import { analyzeItemPhotos, matchCategory, mergeSelectedPhotos, runPool } from '../lib/itemAi'
import { AiConsent, DemoNotice } from '../components/AiDialogs'
import CameraCapture from '../components/CameraCapture'

const MAX_ITEMS = 20
const MAX_PHOTOS = 5
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // etter forminsking
const AI_PARALLEL = 3

let nextKey = 1
const newDraft = () => ({
  key: nextKey++, photos: [], title: '', categoryId: '', condition: 'good', description: '',
  value: '', status: 'idle', // idle | analyzing | analyzed | failed | saving | saveFailed | saved
})

const inputStyle = {
  width: '100%', padding: '10px 12px', border: '1px solid #D9CFC0', borderRadius: '8px',
  fontSize: '16px', background: '#FBF9F5', color: '#3A2F26', outline: 'none',
  fontFamily: 'Karla, sans-serif', boxSizing: 'border-box',
}
const smallBtn = {
  padding: '6px 10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '7px',
  cursor: 'pointer', fontSize: '12px', color: '#5C4530', fontFamily: 'Karla, sans-serif',
}

export default function AddItemsPage({ session, profile, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [drafts, setDrafts] = useState([])
  const [cameraKey, setCameraKey] = useState(null) // gjenstanden kameraet fotograferer
  const [pendingFiles, setPendingFiles] = useState(null) // valgte bilder som venter på «hver for seg / samme»
  const [preparing, setPreparing] = useState(false)
  const [busy, setBusy] = useState(null) // 'analyzing' | 'saving'
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [saveAfterAi, setSaveAfterAi] = useState(true)
  const [autoSaveQueued, setAutoSaveQueued] = useState(false)
  const [aiConsented, setAiConsented] = useState(hasAiConsent)
  const [askConsent, setAskConsent] = useState(false)
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

  useEffect(() => { getCategories(id).then(({ data }) => setCategories(data || [])) }, [id])

  // Forhåndsvisningene er objekt-URL-er; frigjør dem når siden lukkes
  useEffect(() => () => draftsRef.current.forEach(d => d.photos.forEach(p => URL.revokeObjectURL(p.url))), [])

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

  const removeDraft = (key) => {
    setDrafts(prev => {
      prev.find(d => d.key === key)?.photos.forEach(p => URL.revokeObjectURL(p.url))
      return prev.filter(d => d.key !== key)
    })
  }

  const removePhoto = (key, index) => update(key, d => {
    URL.revokeObjectURL(d.photos[index].url)
    return { photos: d.photos.filter((_, i) => i !== index) }
  })

  // Slår gjenstanden sammen med den over (når to bilder var av samme ting)
  const mergeUp = (key) => setDrafts(prev => {
    const i = prev.findIndex(d => d.key === key)
    if (i < 1) return prev
    const above = prev[i - 1], cur = prev[i]
    const photos = [...above.photos, ...cur.photos]
    if (photos.length > MAX_PHOTOS) { onToast(L('Maks 5 bilder per gjenstand', 'Max 5 photos per item'), 'error'); return prev }
    const merged = { ...above, photos, status: above.status === 'saved' ? above.status : 'idle' }
    return [...prev.slice(0, i - 1), merged, ...prev.slice(i + 1)]
  })

  const startMerge = () => { setMergeSel([]); setMerging(true); setPendingFiles(null) }
  const cancelMerge = () => { setMerging(false); setMergeSel([]) }
  const toggleMergePhoto = (url) => setMergeSel(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url])
  const approveMerge = () => {
    if (mergeSel.length < 2 || mergeSel.length > MAX_PHOTOS) return
    setDrafts(prev => mergeSelectedPhotos(prev, mergeSel))
    cancelMerge()
    onToast(L('Bildene er slått sammen til én gjenstand', 'The photos have been merged into one item'))
  }

  // Kamera: fortsetter på siste gjenstand hvis den er tom, ellers en ny
  const openCamera = () => {
    const last = drafts[drafts.length - 1]
    if (last && last.photos.length === 0 && last.status !== 'saved') { setCameraKey(last.key); return }
    if (drafts.length >= MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    const d = newDraft()
    setDrafts(prev => [...prev, d])
    setCameraKey(d.key)
  }

  const nextCameraItem = () => {
    if (draftsRef.current.length >= MAX_ITEMS) return
    const d = newDraft()
    setDrafts(prev => [...prev, d])
    setCameraKey(d.key)
  }

  // Tomme gjenstander fra kameraet fjernes når det lukkes
  const closeCamera = () => {
    setCameraKey(null)
    setDrafts(prev => prev.filter(d => d.photos.length > 0 || d.title.trim() || d.key !== cameraKey))
  }

  const addEmpty = () => {
    if (drafts.length >= MAX_ITEMS) { onToast(L('Maks 20 gjenstander om gangen', 'Max 20 items at a time'), 'error'); return }
    setDrafts(prev => [...prev, newDraft()])
  }

  // ── AI ────────────────────────────────────────────────────────────────────────

  const aiTargets = drafts.filter(d => d.photos.length > 0 && (d.status === 'idle' || d.status === 'failed'))

  const analyzeAll = async (consented = aiConsented) => {
    if (!consented) { setAskConsent(true); return }
    let targets = draftsRef.current.filter(d => d.photos.length > 0 && (d.status === 'idle' || d.status === 'failed'))
    if (isDemo) {
      if (demoRemaining === 0) { setDemoBlocked(true); return }
      targets = targets.slice(0, demoRemaining)
    }
    if (!targets.length) return
    setBusy('analyzing')
    setProgress({ done: 0, total: targets.length })
    let stopped = null
    let failed = 0
    targets.forEach(d => update(d.key, { status: 'analyzing' }))
    await runPool(targets, AI_PARALLEL, async (d) => {
      try {
        const { result, quota } = await analyzeItemPhotos(d.photos.map(p => p.file), { categories, estimate: true })
        if (typeof quota?.remaining === 'number') setDemoRemaining(quota.remaining)
        const match = matchCategory(categories, result.category)
        const likely = Number(result.likely_nok)
        update(d.key, cur => ({
          status: 'analyzed',
          title: cur.title.trim() ? cur.title : (result.title || ''),
          description: cur.description.trim() ? cur.description : (result.description || ''),
          condition: ['excellent', 'good', 'fair', 'poor'].includes(result.condition) ? result.condition : cur.condition,
          categoryId: match ? match.id : cur.categoryId,
          value: cur.value || (likely > 0 ? String(Math.round(likely)) : ''),
          range: result.low_nok && result.high_nok ? [result.low_nok, result.high_nok] : null,
        }))
      } catch (e) {
        update(d.key, { status: 'failed' })
        failed++
        if (['demo_limit', 'rate_limit', 'ai_busy'].includes(e.code)) stopped = stopped || e
      } finally {
        setProgress(p => ({ ...p, done: p.done + 1 }))
      }
    }, () => !!stopped)
    // Gjenstander som ikke ble startet fordi grensen ble nådd
    setDrafts(prev => prev.map(d => d.status === 'analyzing' ? { ...d, status: 'idle' } : d))
    setBusy(null)

    if (stopped?.code === 'demo_limit') { setDemoRemaining(0); setDemoBlocked(true); return }
    if (stopped) onToast(stopped.message + ' ' + L('Resten kan fylles inn manuelt.', 'The rest can be filled in manually.'), 'error')
    else if (failed) onToast(L(`AI klarte ikke ${failed} ${failed === 1 ? 'gjenstand' : 'gjenstander'} — fyll inn navn selv`, `AI could not identify ${failed} ${failed === 1 ? 'item' : 'items'} — add the name yourself`), 'error')
    // Det AI-en rakk å fylle inn legges inn; resten blir igjen i listen
    if (saveAfterAi && !isDemo) setAutoSaveQueued(true)
    else if (!stopped && !failed) onToast(L('AI har fylt inn gjenstandene — se over og lagre', 'AI has filled in the items — review and save'))
  }

  // ── Lagring ───────────────────────────────────────────────────────────────────

  const saveOne = async (d) => {
    const urls = []
    for (const p of d.photos) urls.push(await uploadEstateImage(p.file, id))
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
      estimated_value: parseNOK(d.value) || null,
    })
    if (error) {
      await removeImages(urls).catch(() => {})
      throw error
    }
  }

  const saveAll = async () => {
    if (isDemo) { setDemoBlocked(true); return }
    const pending = draftsRef.current.filter(d => d.status !== 'saved')
    const ready = pending.filter(d => d.title.trim())
    const missing = pending.length - ready.length
    if (!ready.length) { onToast(L('Gi gjenstandene et navn, eller bruk AI', 'Give the items a name, or use AI'), 'error'); return }
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
    if (!missing && !notSaved) {
      onToast(L(`${saved} ${saved === 1 ? 'gjenstand' : 'gjenstander'} lagt til ✓`, `${saved} ${saved === 1 ? 'item' : 'items'} added ✓`))
      navigate(`/estate/${id}`)
      return
    }
    // Lagrede gjenstander fjernes fra listen; resten blir igjen
    setDrafts(prev => prev.filter(d => d.status !== 'saved'))
    const parts = [L(`${saved} lagt til.`, `${saved} added.`)]
    if (missing) parts.push(L(`${missing} mangler navn.`, `${missing} need a name.`))
    if (notSaved) parts.push(L(`${notSaved} kunne ikke lagres — prøv igjen.`, `${notSaved} could not be saved — try again.`))
    onToast(parts.join(' '), saved ? undefined : 'error')
  }

  useEffect(() => {
    if (autoSaveQueued && !busy) { setAutoSaveQueued(false); saveAll() }
  }, [autoSaveQueued, busy])

  // ── Visning ───────────────────────────────────────────────────────────────────

  const cameraDraft = drafts.find(d => d.key === cameraKey)
  const cameraIndex = drafts.findIndex(d => d.key === cameraKey)
  const toSave = drafts.filter(d => d.status !== 'saved' && d.title.trim()).length
  const full = drafts.length >= MAX_ITEMS
  const mergeable = drafts.filter(d => d.status !== 'saved' && d.photos.length > 0)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files || [])) }}
      style={{ maxWidth: '720px', margin: '0 auto', padding: '20px 16px 200px', fontFamily: 'Karla, sans-serif', minHeight: '100vh' }}
    >
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '14px', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>
        {L('← Tilbake', '← Back')}
      </button>

      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '24px', fontWeight: '400', color: '#3A2F26', marginBottom: '6px' }}>
        {L('Legg til flere gjenstander', 'Add several items')}
      </h1>
      <p style={{ color: '#9C8267', fontSize: '14px', lineHeight: 1.5, marginBottom: '18px' }}>
        {L('Ta bilder på stedet eller velg fra bildene dine. Opptil 5 bilder per gjenstand og 20 gjenstander om gangen. AI kan fylle inn navn, kategori, tilstand og verdi for alle.',
           'Take photos on the spot or choose from your photos. Up to 5 photos per item and 20 items at a time. AI can fill in name, category, condition and value for all of them.')}
      </p>

      {isDemo && (
        <div style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: '#3A5A30', lineHeight: 1.5, marginBottom: '18px' }}>
          <strong>{L(`${demoRemaining} av 5 AI-forsøk igjen.`, `${demoRemaining} of 5 AI attempts left.`)}</strong>{' '}
          {L('Hver gjenstand bruker ett forsøk. Gjenstandene lagres ikke.', 'Each item uses one attempt. The items are not saved.')}
        </div>
      )}

      {/* Kilder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '10px' }}>
        <SourceButton onClick={openCamera} disabled={full || !!busy || merging}
          title={L('Ta bilder', 'Take photos')} hint={L('Kamera med «Neste gjenstand»', 'Camera with «Next item»')} />
        <SourceButton onClick={() => pickRef.current.click()} disabled={full || !!busy || merging}
          title={L('Velg bilder', 'Choose photos')} hint={L('Kamerarull, filer — eller dra hit', 'Camera roll, files — or drag here')} />
      </div>
      <input ref={pickRef} type="file" accept="image/*" multiple onChange={onPick} style={{ display: 'none' }} />
      <input ref={addInputRef} type="file" accept="image/*" multiple onChange={onAddTo} style={{ display: 'none' }} />
      <button onClick={addEmpty} disabled={full || !!busy || merging} style={{ background: 'none', border: 'none', color: '#5F6E52', cursor: 'pointer', fontSize: '13px', padding: '4px 0 18px', fontFamily: 'Karla, sans-serif', textDecoration: 'underline' }}>
        {L('+ Legg til gjenstand uten bilde', '+ Add an item without a photo')}
      </button>

      {/* Hver for seg eller samme gjenstand? */}
      {pendingFiles && (
        <div style={{ background: '#fff', border: '2px solid #5F6E52', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '15px', color: '#3A2F26', fontWeight: '500', marginBottom: '12px' }}>
            {L(`Du valgte ${pendingFiles.length} bilder. Hva viser de?`, `You chose ${pendingFiles.length} photos. What do they show?`)}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => addAsSeparate(pendingFiles)} style={{ flex: '1 1 180px', padding: '12px', background: '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
              {L(`${pendingFiles.length} ulike gjenstander`, `${pendingFiles.length} different items`)}
            </button>
            <button onClick={() => addAsOne(pendingFiles)} style={{ flex: '1 1 180px', padding: '12px', background: '#FBF9F5', color: '#3A2F26', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
              {L('Samme gjenstand', 'The same item')}{pendingFiles.length > MAX_PHOTOS ? L(' (de 5 første)', ' (first 5)') : ''}
            </button>
            <button onClick={() => setPendingFiles(null)} style={{ ...smallBtn, border: 'none' }}>{L('Avbryt', 'Cancel')}</button>
          </div>
          <p style={{ fontSize: '12px', color: '#9C8267', marginTop: '10px', marginBottom: 0 }}>
            {L('Du kan slå sammen eller legge til bilder etterpå.', 'You can merge items or add photos afterwards.')}
          </p>
        </div>
      )}

      {preparing && <p style={{ fontSize: '13px', color: '#9C8267', marginBottom: '12px' }}>{L('Klargjør bilder…', 'Preparing photos…')}</p>}

      {dragOver && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(95,110,82,0.18)', border: '4px dashed #5F6E52', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ background: '#fff', padding: '16px 24px', borderRadius: '12px', fontSize: '16px', color: '#3A2F26' }}>{L('Slipp bildene her', 'Drop the photos here')}</div>
        </div>
      )}

      {/* Gjenstandene */}
      {drafts.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', color: '#9C8267' }}>
            {L(`${drafts.length} av maks ${MAX_ITEMS} gjenstander`, `${drafts.length} of max ${MAX_ITEMS} items`)}
          </span>
          {!merging && mergeable.length >= 2 && (
            <button onClick={startMerge} disabled={!!busy} style={{ ...smallBtn, padding: '8px 12px', fontSize: '13px', color: '#3A2F26', background: '#fff', opacity: busy ? 0.5 : 1 }}>
              {L('Slå sammen gjenstander', 'Merge items')}
            </button>
          )}
        </div>
      )}

      {merging ? (
        <MergeGrid drafts={drafts} items={mergeable} selected={mergeSel} onToggle={toggleMergePhoto} />
      ) : <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {drafts.map((d, i) => (
          <DraftCard key={d.key} draft={d} index={i} categories={categories} locked={!!busy}
            onChange={patch => update(d.key, patch)}
            onRemove={() => removeDraft(d.key)}
            onRemovePhoto={pi => removePhoto(d.key, pi)}
            onMergeUp={i > 0 ? () => mergeUp(d.key) : null}
            onAddPhotos={() => { addToRef.current = d.key; addInputRef.current.click() }}
            onCamera={() => setCameraKey(d.key)}
          />
        ))}
      </div>}

      {drafts.length === 0 && !pendingFiles && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9C8267', fontSize: '14px', border: '2px dashed #D9CFC0', borderRadius: '12px' }}>
          {L('Ingen gjenstander ennå. Start med å ta eller velge bilder.', 'No items yet. Start by taking or choosing photos.')}
        </div>
      )}

      {/* Handlinger nederst */}
      {drafts.length > 0 && (
        <div className="bottom-bar" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px max(16px, env(safe-area-inset-bottom))', background: '#fff', borderTop: '1px solid #D9CFC0', boxShadow: '0 -4px 20px rgba(0,0,0,0.08)', zIndex: 100 }}>
          <div style={{ maxWidth: '720px', margin: '0 auto' }}>
            {askConsent && (
              <div style={{ marginBottom: '10px' }}>
                <AiConsent onCancel={() => setAskConsent(false)} onAccept={() => { giveAiConsent(); setAiConsented(true); setAskConsent(false); analyzeAll(true) }} />
              </div>
            )}
            {merging ? (
              <div>
                <div style={{ fontSize: '13px', color: mergeSel.length > MAX_PHOTOS ? '#8A4B2A' : '#5C4530', marginBottom: '10px' }}>
                  {mergeSel.length > MAX_PHOTOS
                    ? L('Maks 5 bilder per gjenstand — fjern noen av de markerte', 'Max 5 photos per item — unmark some')
                    : mergeSel.length < 2
                      ? L('Marker minst to bilder som viser samme gjenstand', 'Mark at least two photos of the same item')
                      : L(`${mergeSel.length} bilder blir én gjenstand`, `${mergeSel.length} photos become one item`)}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={cancelMerge} style={{ flex: 1, padding: '14px 10px', background: '#fff', color: '#5C4530', border: '1px solid #D9CFC0', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontFamily: 'Karla, sans-serif' }}>
                    {L('Avbryt', 'Cancel')}
                  </button>
                  {(() => {
                    const ok = mergeSel.length >= 2 && mergeSel.length <= MAX_PHOTOS
                    return (
                      <button onClick={approveMerge} disabled={!ok} style={{
                        flex: 2, padding: '14px 10px', border: 'none', borderRadius: '10px', fontSize: '15px', fontFamily: 'Karla, sans-serif', fontWeight: '500',
                        background: ok ? '#5F6E52' : '#D9CFC0', color: '#fff', cursor: ok ? 'pointer' : 'not-allowed',
                      }}>
                        {L('Godkjenn sammenslåing', 'Approve merge')}{mergeSel.length ? ` (${mergeSel.length})` : ''}
                      </button>
                    )
                  })()}
                </div>
              </div>
            ) : busy ? (
              <div>
                <div style={{ fontSize: '14px', color: '#3A2F26', marginBottom: '8px' }}>
                  {busy === 'analyzing' ? L(`AI analyserer… ${progress.done} av ${progress.total}`, `AI is analysing… ${progress.done} of ${progress.total}`) : L(`Lagrer… ${progress.done} av ${progress.total}`, `Saving… ${progress.done} of ${progress.total}`)}
                </div>
                <div style={{ height: '8px', background: '#E8DFD0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`, background: '#5F6E52', transition: 'width 0.3s' }} />
                </div>
              </div>
            ) : !askConsent && (
              <>
                {aiTargets.length > 0 && !isDemo && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#5C4530', marginBottom: '10px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={saveAfterAi} onChange={e => setSaveAfterAi(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#5F6E52' }} />
                    {L('Legg inn i boet med en gang etter AI-analysen', 'Add to the estate right after the AI analysis')}
                  </label>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {aiTargets.length > 0 && (
                    <button onClick={() => analyzeAll()} style={{ flex: 3, padding: '14px 10px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '15px', fontFamily: 'Karla, sans-serif', fontWeight: '500' }}>
                      {saveAfterAi && !isDemo
                        ? L(`Analyser og legg inn (${aiTargets.length})`, `Analyse and add (${aiTargets.length})`)
                        : L(`Analyser med AI (${aiTargets.length})`, `Analyse with AI (${aiTargets.length})`)}
                    </button>
                  )}
                  <button onClick={saveAll} disabled={!toSave} style={{
                    flex: 2, padding: '14px 10px', border: 'none', borderRadius: '10px', fontSize: '15px', fontFamily: 'Karla, sans-serif', fontWeight: '500',
                    background: toSave ? '#3A2F26' : '#D9CFC0', color: '#FBF9F5', cursor: toSave ? 'pointer' : 'not-allowed',
                  }}>
                    {L(`Lagre ${toSave || ''}`.trim(), `Save ${toSave || ''}`.trim())}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {cameraDraft && (
        <CameraCapture
          photos={cameraDraft.photos.map(p => p.url)}
          maxPhotos={MAX_PHOTOS}
          onCapture={files => addPhotosTo(cameraKey, files)}
          onNextItem={nextCameraItem}
          onClose={closeCamera}
          itemNumber={cameraIndex + 1}
          maxItems={MAX_ITEMS}
        />
      )}

      {demoBlocked && <DemoNotice onClose={() => setDemoBlocked(false)} onSignup={async () => { await signOut(); navigate('/logg-inn') }} />}
    </div>
  )
}

function SourceButton({ onClick, disabled, title, hint }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      display: 'block', textAlign: 'left', padding: '14px',
      background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, fontFamily: 'Karla, sans-serif',
    }}>
      <span style={{ display: 'block', fontSize: '15px', color: '#3A2F26', fontWeight: '500' }}>{title}</span>
      <span style={{ display: 'block', fontSize: '12px', color: '#9C8267', lineHeight: 1.4, marginTop: '2px' }}>{hint}</span>
    </button>
  )
}

// Alle bildene i ett rutenett, merket med gjenstandsnummeret. Trykk for å markere; tallet oppe til høyre
// viser rekkefølgen (1 blir hovedbildet).
function MergeGrid({ drafts, items, selected, onToggle }) {
  const photos = items.flatMap(d => d.photos.map(p => ({ ...p, itemNo: drafts.indexOf(d) + 1 })))
  return (
    <div>
      <p style={{ fontSize: '14px', color: '#5C4530', lineHeight: 1.5, marginBottom: '14px' }}>
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
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600',
                fontFamily: 'Karla, sans-serif', background: order ? '#5F6E52' : 'rgba(255,255,255,0.85)',
                color: '#fff', border: order ? 'none' : '2px solid #fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>{order || ''}</span>
              <span style={{
                position: 'absolute', left: '6px', bottom: '6px', padding: '2px 7px', borderRadius: '10px',
                background: 'rgba(58,47,38,0.75)', color: '#FBF9F5', fontSize: '11px', fontFamily: 'Karla, sans-serif',
              }}>{L(`Gjenstand ${p.itemNo}`, `Item ${p.itemNo}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const STATUS = {
  analyzing: () => ({ text: L('AI analyserer…', 'AI is analysing…'), color: '#5F6E52', bg: '#DCE3D2' }),
  analyzed: () => ({ text: L('✓ Fylt inn av AI', '✓ Filled in by AI'), color: '#5F6E52', bg: '#DCE3D2' }),
  failed: () => ({ text: L('Ikke fullført — prøv igjen eller fyll inn selv', 'Not completed — try again or fill in yourself'), color: '#8A4B2A', bg: '#F3E3D3' }),
  saveFailed: () => ({ text: L('Kunne ikke lagres — prøv igjen', 'Could not be saved — try again'), color: '#8A4B2A', bg: '#F3E3D3' }),
  saving: () => ({ text: L('Lagrer…', 'Saving…'), color: '#5C4530', bg: '#E8DFD0' }),
  saved: () => ({ text: L('✓ Lagret', '✓ Saved'), color: '#5F6E52', bg: '#DCE3D2' }),
}

function DraftCard({ draft: d, index, categories, locked, onChange, onRemove, onRemovePhoto, onMergeUp, onAddPhotos, onCamera }) {
  const status = STATUS[d.status]?.()
  const disabled = locked || d.status === 'saved'
  return (
    <div style={{ background: '#fff', border: `1px solid ${d.status === 'failed' || d.status === 'saveFailed' ? '#C9AE8E' : '#D9CFC0'}`, borderRadius: '12px', padding: '14px', opacity: d.status === 'saved' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#9C8267' }}>{L(`Gjenstand ${index + 1}`, `Item ${index + 1}`)}</span>
        {status && <span style={{ fontSize: '12px', color: status.color, background: status.bg, padding: '3px 9px', borderRadius: '12px' }}>{status.text}</span>}
      </div>

      {/* Bilder */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {d.photos.map((p, i) => (
          <div key={p.url} style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', background: '#E8DFD0' }}>
            <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {!disabled && (
              <button onClick={() => onRemovePhoto(i)} aria-label={L('Fjern bilde', 'Remove photo')} style={{
                position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', lineHeight: '1', padding: 0,
              }}>×</button>
            )}
          </div>
        ))}
        {!disabled && d.photos.length < MAX_PHOTOS && <>
          <button onClick={onCamera} style={tileStyle}>{L('+ Ta bilde', '+ Take photo')}</button>
          <button onClick={onAddPhotos} style={tileStyle}>{L('+ Velg bilder', '+ Choose photos')}</button>
        </>}
      </div>

      {/* Felter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
        <input value={d.title} onChange={e => onChange({ title: e.target.value })} disabled={disabled} maxLength={200}
          placeholder={d.photos.length ? L('Navn (AI kan fylle inn)', 'Name (AI can fill in)') : L('Navn på gjenstand', 'Item name')}
          style={{ ...inputStyle, gridColumn: '1 / -1' }} />
        <select value={d.categoryId} onChange={e => onChange({ categoryId: e.target.value })} disabled={disabled} style={inputStyle}>
          <option value="">{L('Velg kategori', 'Choose category')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select value={d.condition} onChange={e => onChange({ condition: e.target.value })} disabled={disabled} style={inputStyle}>
          <option value="excellent">{L('Utmerket', 'Excellent')}</option>
          <option value="good">{L('God', 'Good')}</option>
          <option value="fair">{L('Middels', 'Fair')}</option>
          <option value="poor">{L('Dårlig', 'Poor')}</option>
        </select>
        <textarea value={d.description} onChange={e => onChange({ description: e.target.value })} disabled={disabled} maxLength={2000} rows={2}
          placeholder={L('Beskrivelse (valgfri)', 'Description (optional)')}
          style={{ ...inputStyle, gridColumn: '1 / -1', resize: 'vertical', fontSize: '15px' }} />
        <div style={{ gridColumn: '1 / -1' }}>
          <input value={d.value} onChange={e => onChange({ value: e.target.value })} disabled={disabled} inputMode="numeric"
            placeholder={L('Verdi i NOK (valgfri)', 'Value in NOK (optional)')} style={inputStyle} />
          {d.range && (
            <div style={{ fontSize: '12px', color: '#9C8267', marginTop: '4px' }}>
              {L('AI-estimat', 'AI estimate')}: {formatNOK(d.range[0])} – {formatNOK(d.range[1])} · {L('kun veiledende', 'for guidance only')}
            </div>
          )}
        </div>
      </div>

      {!disabled && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          {onMergeUp && <button onClick={onMergeUp} style={smallBtn}>{L('↑ Samme gjenstand som over', '↑ Same item as above')}</button>}
          <button onClick={onRemove} style={{ ...smallBtn, color: '#8A4B2A' }}>{L('Fjern', 'Remove')}</button>
        </div>
      )}
    </div>
  )
}

const tileStyle = {
  width: '64px', height: '64px', borderRadius: '8px', border: '2px dashed #D9CFC0', background: '#FBF9F5',
  cursor: 'pointer', fontSize: '11px', color: '#9C8267', fontFamily: 'Karla, sans-serif', lineHeight: 1.3,
  padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
}
