import { useEffect, useId, useRef, useState } from 'react'
import { setInterestReason } from '../lib/decisions'
import { readReasonDraft, writeReasonDraft, clearReasonDraft } from '../lib/reasonDraft'
import { L } from '../lib/lang'

// Valgfri begrunnelse på eget ønske: legges til, endres eller fjernes på stedet, uten dialog.
// Det som skrives speiles som utkast i fanen (reasonDraft), så teksten ikke går tapt hvis feltet lukkes,
// siden lastes på nytt eller lagringen feiler. Utkastet slettes når begrunnelsen er lagret eller forkastet.
export default function ReasonEditor({ itemId, itemTitle, userId, savedReason, onSaved, onToast, compact = false }) {
  const uid = useId()
  const fieldId = `reason-${uid}`, hintId = `reason-hint-${uid}`
  const saved = savedReason || ''
  // Et utkast fra tidligere i fanen som ikke ble lagret (foreldrene gir komponenten key={itemId})
  const [draft] = useState(() => { const d = readReasonDraft(userId, itemId); return d !== null && d !== saved ? d : null })
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(draft ?? saved)
  const [unsaved, setUnsaved] = useState(draft !== null)
  const [saving, setSaving] = useState(false)
  const [announce, setAnnounce] = useState('')
  const fieldRef = useRef(null)
  const triggerRef = useRef(null)
  const returnFocus = useRef(false)

  // Ny lagret verdi utenfra (f.eks. sanntid) mens feltet er lukket og uten utkast
  useEffect(() => { if (!open && !unsaved) setText(saved) }, [saved])

  useEffect(() => {
    if (open) fieldRef.current?.focus()
    else if (returnFocus.current) { returnFocus.current = false; triggerRef.current?.focus() }
  }, [open])

  const edit = e => {
    setText(e.target.value)
    const changed = e.target.value !== saved
    setUnsaved(changed)
    writeReasonDraft(userId, itemId, changed ? e.target.value : '')
  }

  const close = () => { returnFocus.current = true; setOpen(false) }

  const save = async value => {
    if (saving) return
    setSaving(true)
    const { error } = await setInterestReason(itemId, userId, value)
    setSaving(false)
    if (error) {
      onToast?.(L('Kunne ikke lagre begrunnelsen. Teksten er tatt vare på, prøv igjen.', 'Could not save the reason. Your text is kept, please try again.'), 'error')
      return
    }
    const next = value.trim()
    clearReasonDraft(userId, itemId)
    setText(next)
    setUnsaved(false)
    setAnnounce(next ? L('Begrunnelse lagret', 'Reason saved') : L('Begrunnelse fjernet', 'Reason removed'))
    onSaved?.(next || null)
    close()
  }

  const discard = () => {
    clearReasonDraft(userId, itemId)
    setText(saved)
    setUnsaved(false)
    close()
  }

  const linkBtn = { background:'none', border:'none', padding:'6px 4px', minHeight:'36px', cursor:'pointer', color:'#5F6E52', fontSize:'0.8125rem', fontWeight:'600', fontFamily:'Karla, sans-serif', textDecoration:'underline', textUnderlineOffset:'3px' }
  const btn = { minHeight:'40px', padding:'8px 14px', borderRadius:'8px', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'Karla, sans-serif' }

  return (
    <div onClick={e => e.stopPropagation()} style={{ fontFamily:'Karla, sans-serif', fontSize:'0.8125rem', color:'#5C4530', textAlign:'left' }}>
      <span role="status" className="sr-only">{announce}</span>
      {open ? (
        <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginTop: compact ? '6px' : 0 }}>
          <label htmlFor={fieldId} style={{ fontSize:'0.8125rem', color:'#3A2F26', fontWeight:'500' }}>
            {itemTitle ? L(`Hvorfor vil du ha «${itemTitle}»?`, `Why do you want «${itemTitle}»?`) : L('Hvorfor vil du ha den?', 'Why do you want it?')}{' '}
            <span style={{ color:'#75604B', fontWeight:'400' }}>{L('(valgfritt)', '(optional)')}</span>
          </label>
          <textarea id={fieldId} ref={fieldRef} value={text} onChange={edit} rows={compact ? 2 : 3} maxLength={1000}
            aria-describedby={hintId}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); close() } }}
            placeholder={L('f.eks. Jeg husker den fra barndommen', 'e.g. I remember it from my childhood')}
            style={{ width:'100%', padding:'10px 12px', border:'1px solid #9A8B78', borderRadius:'8px', fontSize:'0.875rem', fontFamily:'Karla, sans-serif', color:'#3A2F26', background:'#fff', resize:'vertical', boxSizing:'border-box' }} />
          <div id={hintId} style={{ color:'#75604B' }}>
            {L('De andre i boet kan se dette.', 'Others in the estate can see this.')}
            {unsaved && <> {L('Ikke lagret ennå.', 'Not saved yet.')}</>}
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <button onClick={() => save(text)} disabled={saving} style={{ ...btn, background:'#3A2F26', color:'#FBF9F5', border:'none' }}>
              {saving ? L('Lagrer…', 'Saving…') : L('Lagre', 'Save')}
            </button>
            <button onClick={close} style={{ ...btn, background:'#fff', color:'#5C4530', border:'1px solid #9A8B78' }}>{L('Lukk', 'Close')}</button>
          </div>
        </div>
      ) : unsaved ? (
        <div style={{ display:'flex', alignItems:'center', gap:'6px', flexWrap:'wrap' }}>
          <span>{L('Du har en begrunnelse som ikke er lagret.', 'You have a reason that is not saved.')}</span>
          <button ref={triggerRef} onClick={() => setOpen(true)} style={linkBtn}>{L('Fortsett', 'Continue')}</button>
          <button onClick={discard} style={{ ...linkBtn, color:'#8B3A3A' }}>{L('Forkast', 'Discard')}</button>
        </div>
      ) : saved ? (
        <div style={{ display:'flex', alignItems:'baseline', gap:'6px', flexWrap:'wrap' }}>
          <span>{L('Din begrunnelse:', 'Your reason:')} <i>«{saved}»</i></span>
          <button ref={triggerRef} onClick={() => setOpen(true)} aria-label={L('Endre begrunnelsen', 'Edit the reason')} style={linkBtn}>{L('Endre', 'Edit')}</button>
          <button onClick={() => save('')} disabled={saving} aria-label={L('Fjern begrunnelsen', 'Remove the reason')} style={{ ...linkBtn, color:'#8B3A3A' }}>{L('Fjern', 'Remove')}</button>
        </div>
      ) : (
        <button ref={triggerRef} onClick={() => setOpen(true)} style={linkBtn}>{L('+ Si hvorfor', '+ Say why')}</button>
      )}
    </div>
  )
}
