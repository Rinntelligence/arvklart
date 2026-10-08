// Kamera i appen: ta mange bilder raskt uten å gå via telefonens kamera-app for hvert bilde.
// Med `multi` («Legg til flere») blir hvert bilde en ny gjenstand, med mindre brukeren velger
// «Flere bilder av denne gjenstanden»; da er «Neste gjenstand» hovedknappen.
// Uten kameratilgang (nektet, ingen kamera, eldre nettleser) tilbys telefonens kamera-app eller filvalg.
import { useEffect, useRef, useState } from 'react'
import { L } from '../lib/lang'

const MAX_SIDE = 2000

// multi: { itemNumber, itemCount, photoCount, sameItem, onSameItem, onNextItem, maxItems, full }
// undo: { text, onUndo } vises som en angre-knapp etter sletting, til neste bilde tas (siden har den videre)
export default function CameraCapture({ photos, maxPhotos = 5, onCapture, onClose, onRemovePhoto, multi, undo }) {
  const videoRef = useRef()
  const shutterRef = useRef()
  const dialogRef = useRef()
  const [status, setStatus] = useState('starting') // starting | live | unavailable
  const [flash, setFlash] = useState(false)
  const [newItem, setNewItem] = useState(null) // «Gjenstand 4 ✓» et øyeblikk når en ny gjenstand starter
  const lastCount = useRef(multi?.itemCount ?? 0)

  // Bildet kan ikke tas når gjenstanden er full (samme gjenstand) eller boet har nådd maks antall (ny gjenstand)
  const blocked = multi ? (multi.sameItem ? photos.length >= maxPhotos : multi.full) : photos.length >= maxPhotos
  const canAddMore = multi && photos.length > 0 && photos.length < maxPhotos

  useEffect(() => {
    let stream = null
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    }).then(s => {
      if (cancelled) { s.getTracks().forEach(t => t.stop()); return }
      stream = s
      videoRef.current.srcObject = s
      videoRef.current.play().catch(() => {})
      setStatus('live')
    }).catch(() => { if (!cancelled) setStatus('unavailable') })
    return () => { cancelled = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Fokus: inn i dialogen når den åpnes, tilbake til knappen som åpnet den når den lukkes.
  // Finnes ikke den knappen lenger, brukes siden sin «Ta bilder»-knapp ([data-camera-return]).
  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current?.focus()
    return () => {
      const target = opener && opener !== document.body && opener.isConnected ? opener : document.querySelector('[data-camera-return]')
      target?.focus?.()
    }
  }, [])
  useEffect(() => {
    if (status === 'live') shutterRef.current?.focus()
    else if (status === 'unavailable') dialogRef.current?.querySelector('label, button')?.focus()
  }, [status])

  // Lukk med Esc på PC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Tab blir værende i dialogen (fokusfelle)
  const trapTab = (e) => {
    if (e.key !== 'Tab') return
    const items = [...dialogRef.current.querySelectorAll('button:not([disabled]), label[tabindex], input:not([type=file]):not([disabled])')]
      .filter(el => el.offsetParent !== null)
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  // Ny gjenstand: vis nummeret tydelig et øyeblikk
  useEffect(() => {
    if (!multi) return
    if (multi.itemCount > lastCount.current && photos.length > 0) {
      setNewItem(multi.itemNumber)
      const t = setTimeout(() => setNewItem(null), 1100)
      lastCount.current = multi.itemCount
      return () => clearTimeout(t)
    }
    lastCount.current = multi.itemCount
  }, [multi?.itemCount])

  const shoot = () => {
    const video = videoRef.current
    if (blocked || !video?.videoWidth) return
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => {
      if (blob) onCapture([new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' })])
    }, 'image/jpeg', 0.85)
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
  }

  const fromInput = (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length) onCapture(files)
  }

  // Filvalgene er <label> rundt et skjult <input>; Enter/mellomrom åpner dem fra tastaturet
  const fileKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.currentTarget.querySelector('input')?.click()
  }

  const deleteLast = () => { if (photos.length && onRemovePhoto) onRemovePhoto(photos.length - 1) }

  const pill = (primary, disabled) => ({
    minHeight: '48px', padding: '12px 18px', borderRadius: '24px', border: 'none', fontSize: '15px', fontWeight: '500',
    fontFamily: 'Karla, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer',
    background: primary ? '#FBF9F5' : 'rgba(255,255,255,0.16)', color: primary ? '#3A2F26' : '#fff',
    opacity: disabled ? 0.4 : 1,
  })

  // Hvor neste bilde havner, sagt med ord
  const nextShotText = multi
    ? multi.sameItem
      ? L(`Flere bilder av gjenstand ${multi.itemNumber} · ${photos.length} av ${maxPhotos}`, `More photos of item ${multi.itemNumber} · ${photos.length} of ${maxPhotos}`)
      : L('Hvert bilde blir en ny gjenstand', 'Each photo becomes a new item')
    : L(`${photos.length} av ${maxPhotos} bilder`, `${photos.length} of ${maxPhotos} photos`)

  const blockedText = multi && !multi.sameItem
    ? L(`Maks ${multi.maxItems} gjenstander om gangen. Trykk «Ferdig» og lagre dem først.`, `Max ${multi.maxItems} items at a time. Tap «Done» and save them first.`)
    : multi
      ? L(`Maks ${maxPhotos} bilder per gjenstand. Trykk «Neste gjenstand».`, `Max ${maxPhotos} photos per item. Tap «Next item».`)
      : L(`Maks ${maxPhotos} bilder`, `Max ${maxPhotos} photos`)

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={L('Kamera', 'Camera')} tabIndex={-1} onKeyDown={trapTab} style={{
      position: 'fixed', inset: 0, zIndex: 400, background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: 'Karla, sans-serif', outline: 'none',
    }}>
      {/* Topp: antall og «Ferdig» */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: 'max(12px, env(safe-area-inset-top)) 16px 8px' }}>
        <span aria-live="polite" style={{ fontSize: '16px' }}>
          {multi
            ? <><strong>{L(`${multi.itemCount} ${multi.itemCount === 1 ? 'gjenstand' : 'gjenstander'}`, `${multi.itemCount} ${multi.itemCount === 1 ? 'item' : 'items'}`)}</strong>
                {' · '}{L(`${multi.photoCount} ${multi.photoCount === 1 ? 'bilde' : 'bilder'}`, `${multi.photoCount} ${multi.photoCount === 1 ? 'photo' : 'photos'}`)}</>
            : nextShotText}
        </span>
        <button onClick={onClose} style={pill(true)}>{L('Ferdig', 'Done')}</button>
      </div>

      {/* Hvor neste bilde havner */}
      {multi && (
        <div aria-live="polite" style={{
          margin: '0 16px 8px', padding: '8px 12px', borderRadius: '10px', fontSize: '14px', textAlign: 'center',
          background: multi.sameItem ? '#5F6E52' : 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: multi.sameItem ? '500' : '400',
        }}>{nextShotText}</div>
      )}

      {/* Søker. I «flere bilder av samme gjenstand» har den en tydelig ramme og en merkelapp i bildet */}
      <div data-same-item={multi?.sameItem ? 'true' : undefined} style={{
        flex: 1, position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: multi?.sameItem ? '0 8px' : 0, borderRadius: multi?.sameItem ? '14px' : 0, overflow: 'hidden',
      }}>
        <video ref={videoRef} playsInline muted autoPlay onClick={shoot}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: status === 'live' ? 'block' : 'none' }} />
        {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.6 }} />}
        {multi?.sameItem && status === 'live' && !blocked && (
          <div aria-hidden="true" style={{
            position: 'absolute', top: '14px', left: '14px', padding: '6px 12px', borderRadius: '10px',
            background: '#DCE3D2', color: '#3A2F26', fontSize: '14px', fontWeight: '600',
          }}>{L(`▣ Samme gjenstand (${multi.itemNumber}) · bilde ${Math.min(photos.length + 1, maxPhotos)} av ${maxPhotos}`, `▣ Same item (${multi.itemNumber}) · photo ${Math.min(photos.length + 1, maxPhotos)} of ${maxPhotos}`)}</div>
        )}
        {newItem && (
          <div role="status" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', padding: '14px 22px',
            borderRadius: '16px', background: 'rgba(95,110,82,0.92)', fontSize: '22px', fontFamily: "'Fraunces', serif", whiteSpace: 'nowrap',
          }}>{L(`Gjenstand ${newItem} ✓`, `Item ${newItem} ✓`)}</div>
        )}
        {status === 'starting' && <p style={{ color: '#D9CFC0', fontSize: '14px' }}>{L('Starter kameraet…', 'Starting the camera…')}</p>}
        {status === 'unavailable' && (
          <div style={{ maxWidth: '340px', padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', lineHeight: 1.6, marginBottom: '18px', color: '#E8DFD0' }}>
              {L('Fikk ikke tilgang til kameraet her. Du kan bruke kamera-appen eller velge bilder i stedet.',
                 'Could not access the camera here. You can use the camera app or choose photos instead.')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label tabIndex={0} role="button" onKeyDown={fileKey} style={{ ...pill(true, blocked), display: 'block' }}>
                {L('Åpne kamera-appen', 'Open the camera app')}
                <input type="file" accept="image/*" capture="environment" onChange={fromInput} disabled={blocked} style={{ display: 'none' }} />
              </label>
              <label tabIndex={0} role="button" onKeyDown={fileKey} style={{ ...pill(false, blocked), display: 'block' }}>
                {L('Velg bilder', 'Choose photos')}
                <input type="file" accept="image/*" multiple onChange={fromInput} disabled={blocked} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}
        {blocked && status === 'live' && (
          <div role="status" style={{ position: 'absolute', top: '12px', left: '16px', right: '16px', textAlign: 'center', background: 'rgba(0,0,0,0.7)', padding: '10px 14px', borderRadius: '12px', fontSize: '14px' }}>
            {blockedText}
          </div>
        )}
        {multi?.sameItem && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '14px', boxShadow: 'inset 0 0 0 5px #DCE3D2', pointerEvents: 'none' }} />}
        {undo && (
          <button onClick={undo.onUndo} style={{ ...pill(true), position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
            {undo.text} · <u>{L('Angre', 'Undo')}</u>
          </button>
        )}
      </div>

      {/* Bilder av gjenstanden som fotograferes nå, med sletting */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px 0', minHeight: '64px', overflowX: 'auto' }}>
        {multi && photos.length > 0 && (
          <span style={{ fontSize: '12px', color: '#D9CFC0', flexShrink: 0 }}>{L(`Gjenstand ${multi.itemNumber}`, `Item ${multi.itemNumber}`)}</span>
        )}
        {photos.map((src, i) => (
          <div key={src} style={{ position: 'relative', flexShrink: 0 }}>
            <img src={src} alt={L(`Bilde ${i + 1}`, `Photo ${i + 1}`)} style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.3)', display: 'block' }} />
            {onRemovePhoto && (
              <button onClick={() => onRemovePhoto(i)} aria-label={L(`Slett bilde ${i + 1}`, `Delete photo ${i + 1}`)} style={{
                position: 'absolute', top: '-10px', right: '-10px', width: '32px', height: '32px', borderRadius: '50%', padding: 0,
                border: '2px solid #000', background: '#FBF9F5', color: '#3A2F26', fontSize: '16px', lineHeight: 1, cursor: 'pointer',
              }}>×</button>
            )}
          </div>
        ))}
      </div>

      {/* Valg for neste bilde: flere av denne / neste gjenstand */}
      {multi && (
        <div style={{ padding: '10px 16px 0' }}>
          {multi.sameItem
            ? <button onClick={multi.onNextItem} style={{ ...pill(true), width: '100%', fontSize: '17px', fontWeight: '600' }}>
                {L('Neste gjenstand →', 'Next item →')}
              </button>
            : <button onClick={() => multi.onSameItem(true)} disabled={!canAddMore} style={{ ...pill(false, !canAddMore), width: '100%' }}>
                {photos.length
                  ? L(`＋ Flere bilder av gjenstand ${multi.itemNumber}`, `＋ More photos of item ${multi.itemNumber}`)
                  : L('＋ Flere bilder av samme gjenstand', '＋ More photos of the same item')}
              </button>}
        </div>
      )}

      {/* Utløser, med «slett siste» til venstre */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', padding: '12px 16px max(18px, env(safe-area-inset-bottom))' }}>
        <div>
          {onRemovePhoto && (
            <button onClick={deleteLast} disabled={!photos.length} style={{ ...pill(false, !photos.length), padding: '12px 14px' }}
              aria-label={L('Slett siste bilde', 'Delete the last photo')}>
              {L('↶ Slett siste', '↶ Delete last')}
            </button>
          )}
        </div>
        <button ref={shutterRef} onClick={shoot} disabled={status !== 'live' || blocked} aria-label={L('Ta bilde', 'Take photo')} style={{
          width: '76px', height: '76px', borderRadius: '50%', border: '4px solid #fff', padding: 0,
          background: status === 'live' && !blocked ? '#FBF9F5' : 'rgba(255,255,255,0.25)',
          boxShadow: 'inset 0 0 0 3px #000', cursor: status === 'live' && !blocked ? 'pointer' : 'not-allowed',
        }} />
        <div />
      </div>
    </div>
  )
}
