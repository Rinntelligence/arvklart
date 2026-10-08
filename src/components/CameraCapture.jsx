// Kamera i appen: ta mange bilder raskt uten å gå via telefonens kamera-app for hvert bilde.
// Med onNextItem vises «Neste gjenstand», så man kan fotografere flere gjenstander etter hverandre.
// Uten kameratilgang (nektet, ingen kamera, eldre nettleser) tilbys telefonens kamera-app eller filvalg.
import { useEffect, useRef, useState } from 'react'
import { L } from '../lib/lang'

const MAX_SIDE = 2000

export default function CameraCapture({ photos, maxPhotos = 5, onCapture, onClose, onNextItem, itemNumber, maxItems }) {
  const videoRef = useRef()
  const [status, setStatus] = useState('starting') // starting | live | unavailable
  const [flash, setFlash] = useState(false)
  const full = photos.length >= maxPhotos
  const canNext = onNextItem && photos.length > 0 && (!maxItems || itemNumber < maxItems)

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

  // Lukk med Esc på PC
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shoot = () => {
    const video = videoRef.current
    if (full || !video?.videoWidth) return
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

  const counter = onNextItem
    ? L(`Gjenstand ${itemNumber}${maxItems ? ` av maks ${maxItems}` : ''} · ${photos.length} av ${maxPhotos} bilder`,
        `Item ${itemNumber}${maxItems ? ` of max ${maxItems}` : ''} · ${photos.length} of ${maxPhotos} photos`)
    : L(`${photos.length} av ${maxPhotos} bilder`, `${photos.length} of ${maxPhotos} photos`)

  const pill = (primary, disabled) => ({
    padding: '12px 16px', borderRadius: '24px', border: 'none', fontSize: '14px', fontWeight: '500',
    fontFamily: 'Karla, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
    background: primary ? '#FBF9F5' : 'rgba(255,255,255,0.16)', color: primary ? '#3A2F26' : '#fff',
    opacity: disabled ? 0.4 : 1,
  })

  return (
    <div role="dialog" aria-label={L('Kamera', 'Camera')} style={{
      position: 'fixed', inset: 0, zIndex: 400, background: '#000', color: '#fff',
      display: 'flex', flexDirection: 'column', fontFamily: 'Karla, sans-serif',
    }}>
      {/* Topp: teller og lukk */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: 'max(12px, env(safe-area-inset-top)) 16px 12px' }}>
        <span style={{ fontSize: '14px' }}>{counter}</span>
        <button onClick={onClose} style={pill(true)}>{L('Ferdig', 'Done')}</button>
      </div>

      {/* Søker */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <video ref={videoRef} playsInline muted autoPlay onClick={shoot}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: status === 'live' ? 'block' : 'none' }} />
        {flash && <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: 0.6 }} />}
        {status === 'starting' && <p style={{ color: '#D9CFC0', fontSize: '14px' }}>{L('Starter kameraet…', 'Starting the camera…')}</p>}
        {status === 'unavailable' && (
          <div style={{ maxWidth: '340px', padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', lineHeight: 1.6, marginBottom: '18px', color: '#E8DFD0' }}>
              {L('Fikk ikke tilgang til kameraet her. Du kan bruke kamera-appen eller velge bilder i stedet.',
                 'Could not access the camera here. You can use the camera app or choose photos instead.')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ ...pill(true, full), display: 'block' }}>
                {L('Åpne kamera-appen', 'Open the camera app')}
                <input type="file" accept="image/*" capture="environment" onChange={fromInput} disabled={full} style={{ display: 'none' }} />
              </label>
              <label style={{ ...pill(false, full), display: 'block' }}>
                {L('Velg bilder', 'Choose photos')}
                <input type="file" accept="image/*" multiple onChange={fromInput} disabled={full} style={{ display: 'none' }} />
              </label>
            </div>
          </div>
        )}
        {full && status === 'live' && (
          <div style={{ position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.65)', padding: '8px 14px', borderRadius: '18px', fontSize: '13px', whiteSpace: 'nowrap' }}>
            {onNextItem ? L('Maks 5 bilder — gå til neste gjenstand', 'Max 5 photos — go to the next item') : L('Maks 5 bilder', 'Max 5 photos')}
          </div>
        )}
      </div>

      {/* Bilder av denne gjenstanden */}
      <div style={{ display: 'flex', gap: '6px', padding: '10px 16px 0', minHeight: '58px', overflowX: 'auto' }}>
        {photos.map((src, i) => (
          <img key={i} src={src} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0, border: '1px solid rgba(255,255,255,0.3)' }} />
        ))}
      </div>

      {/* Kontroller */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '12px', padding: '12px 16px max(18px, env(safe-area-inset-bottom))' }}>
        <div />
        <button onClick={shoot} disabled={status !== 'live' || full} aria-label={L('Ta bilde', 'Take photo')} style={{
          width: '72px', height: '72px', borderRadius: '50%', border: '4px solid #fff', padding: 0,
          background: status === 'live' && !full ? '#FBF9F5' : 'rgba(255,255,255,0.25)',
          boxShadow: 'inset 0 0 0 3px #000', cursor: status === 'live' && !full ? 'pointer' : 'not-allowed',
        }} />
        <div style={{ justifySelf: 'end' }}>
          {onNextItem && (
            <button onClick={onNextItem} disabled={!canNext} style={pill(false, !canNext)}>
              {L('Neste gjenstand →', 'Next item →')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
