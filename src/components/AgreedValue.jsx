import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { L } from '../lib/lang'
import { formatNOK, parseNOK } from '../lib/format'
import { aiEstimate, itemValue } from '../lib/distribution'

const SOURCE = { ai: () => L('fra AI-anslaget', 'from the AI estimate'), heir: () => L('fra en arvings forslag', 'from an heir’s suggestion'), manual: () => L('satt av administrator', 'set by the administrator') }

// Fordelingsverdien: verdien gjenstanden regnes med i fordelingen, adskilt fra AI-anslaget og arvingenes
// forslag. Bare administrator kan sette den (set_agreed_values, logges). Den er foreslått til fordelingen er
// godkjent av alle. Manglende verdi er aldri 0 kr.
export default function AgreedValue({ item, estateId, canEdit, onChanged, onToast }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const value = itemValue(item)
  const ai = aiEstimate(item)
  const suggestions = (item.value_suggestions || []).filter(s => Number.isFinite(Number(s?.value)))

  const save = async (v, source) => {
    setBusy(true)
    const { error } = await supabase.rpc('set_agreed_values', { p_estate: estateId, p_values: [{ item_id: item.id, value: v, source }] })
    setBusy(false)
    if (error) { onToast(L('Kunne ikke lagre fordelingsverdien. Prøv igjen.', 'Could not save the distribution value. Please try again.'), 'error'); return }
    setEditing(false); setText('')
    onToast(v === null ? L('Fordelingsverdien er fjernet', 'The distribution value has been removed') : L('Fordelingsverdien er lagret', 'The distribution value has been saved'))
    onChanged()
  }
  const submit = e => {
    e.preventDefault()
    const v = parseNOK(text)
    if (v === null || v < 0) { onToast(L('Skriv verdien i kroner, f.eks. 1500 eller 0', 'Enter the value in NOK, e.g. 1500 or 0'), 'error'); return }
    save(Math.round(v), 'manual')
  }

  const btn = { minHeight: '40px', padding: '8px 12px', background: '#fff', border: '1px solid #B8C8A8', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26' }
  if (value === null && !canEdit) return null
  return (
    <section aria-labelledby="agreed-value" style={{ background: '#fff', border: '1px solid #B8C8A8', borderRadius: '10px', padding: '14px', marginBottom: '12px', fontFamily: 'Karla, sans-serif' }}>
      <h2 id="agreed-value" style={{ fontSize: '0.75rem', color: '#3A5A30', fontWeight: 600, margin: '0 0 4px' }}>{L('Fordelingsverdi (foreslått)', 'Distribution value (proposed)')}</h2>
      {value === null
        ? <p style={{ fontSize: '0.875rem', color: '#75604B', margin: 0 }}>{L('Ingen fordelingsverdi ennå. Den er valgfri, og en manglende verdi regnes ikke som 0 kr.', 'No distribution value yet. It is optional, and a missing value is not counted as 0 kr.')}</p>
        : <p style={{ margin: 0 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', color: '#3A2F26' }}>{formatNOK(value)}</span>
            {item.agreed_value_source && <span style={{ fontSize: '0.75rem', color: '#5C4530' }}> · {SOURCE[item.agreed_value_source]?.()}</span>}
          </p>}
      <p style={{ fontSize: '0.75rem', color: '#5C4530', lineHeight: 1.5, margin: '6px 0 0' }}>
        {L('Verdien gjenstanden regnes med i fordelingen. Den er adskilt fra AI-anslaget og arvingenes forslag, og blir først endelig når alle har godkjent fordelingen.',
          'The value the item counts with in the distribution. It is separate from the AI estimate and the heirs’ suggestions, and only becomes final when everyone has approved the distribution.')}
      </p>
      {canEdit && (editing ? (
        <form onSubmit={submit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          <label htmlFor="agreed-input" className="sr-only">{L('Fordelingsverdi i kroner', 'Distribution value in NOK')}</label>
          <input id="agreed-input" value={text} onChange={e => setText(e.target.value)} inputMode="numeric" placeholder={L('Beløp i kroner', 'Amount in NOK')}
            style={{ flex: '1 1 140px', minHeight: '40px', padding: '8px 12px', border: '1px solid #9A8B78', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }} />
          <button type="submit" disabled={busy} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{L('Lagre', 'Save')}</button>
          <button type="button" onClick={() => setEditing(false)} style={btn}>{L('Avbryt', 'Cancel')}</button>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          {ai !== null && value !== ai && <button onClick={() => save(ai, 'ai')} disabled={busy} style={btn}>{L(`Bruk AI-anslaget (${formatNOK(ai)})`, `Use the AI estimate (${formatNOK(ai)})`)}</button>}
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => save(Math.round(Number(s.value)), 'heir')} disabled={busy} style={btn}>
              {L(`Bruk forslaget fra ${s.name || 'en arving'} (${formatNOK(s.value)})`, `Use ${s.name || 'an heir'}’s suggestion (${formatNOK(s.value)})`)}
            </button>
          ))}
          <button onClick={() => setEditing(true)} style={btn}>{value === null ? L('Sett fordelingsverdi', 'Set distribution value') : L('Endre', 'Change')}</button>
          {value !== null && <button onClick={() => save(null, null)} disabled={busy} style={{ ...btn, border: 'none', textDecoration: 'underline' }}>{L('Fjern', 'Remove')}</button>}
        </div>
      ))}
    </section>
  )
}
