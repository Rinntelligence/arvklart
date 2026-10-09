import { useState } from 'react'
import { L } from '../lib/lang'
import { fieldLabel } from '../lib/analysisView'
import { CORRECTABLE_FIELDS, MAX_CORRECTION_LENGTH, currentValues } from '../lib/aiCorrections'

// «Rett opplysningene»: familien retter merke, modell og lignende som AI-en foreslo. Det som lagres går foran
// AI-forslaget i verdianslaget; AI-forslaget i seg selv endres ikke. Tomt felt betyr ukjent eller ikke aktuelt.
export default function AiCorrectionsForm({ record, onSave, onCancel, saving = false, idPrefix = 'fix' }) {
  const [values, setValues] = useState(() => currentValues(record))
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #9A8B78', borderRadius: '8px', background: '#fff', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26', minHeight: '44px' }
  const btn = { padding: '10px 16px', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', cursor: 'pointer', minHeight: '44px' }

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(values) }} style={{ fontFamily: 'Karla, sans-serif', display: 'grid', gap: '10px' }}>
      <p style={{ fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }}>
        {L('Det du skriver her går foran AI-forslaget, også når verdien anslås. La feltet stå tomt hvis det er ukjent eller ikke passer.',
          'What you enter here takes precedence over the AI suggestion, also when the value is estimated. Leave a field empty if it is unknown or does not apply.')}
      </p>
      {CORRECTABLE_FIELDS.map(f => (
        <label key={f} htmlFor={`${idPrefix}-${f}`} style={{ display: 'grid', gap: '4px', fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26' }}>
          {fieldLabel(f)}
          <input id={`${idPrefix}-${f}`} value={values[f]} maxLength={MAX_CORRECTION_LENGTH} autoComplete="off" disabled={saving}
            onChange={e => setValues(v => ({ ...v, [f]: e.target.value }))} style={input} />
        </label>
      ))}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>
          {saving ? L('Lagrer …', 'Saving …') : L('Lagre rettelsene', 'Save corrections')}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ ...btn, background: 'none', color: '#5C4530', border: '1px solid #D9CFC0' }}>
          {L('Avbryt', 'Cancel')}
        </button>
      </div>
    </form>
  )
}
