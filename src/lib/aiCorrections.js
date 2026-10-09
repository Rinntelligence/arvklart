// Familiens rettelser av AI-ens identifikasjon (items.ai_analysis.corrections: { felt: { value, by, at } }).
// AI-forslaget (ai_analysis.ai) endres aldri. value null betyr at familien har fjernet forslaget (feil, eller
// finnes ikke). Samme regler som applyCorrections i supabase/functions/_shared/analysis.ts, som bruker
// rettelsene i verdianslaget.
export const CORRECTABLE_FIELDS = ['brand', 'manufacturer', 'model', 'model_number', 'designer_or_artist', 'period', 'material']
export const MAX_CORRECTION_LENGTH = 120

const validCorrection = c => !!c && typeof c === 'object' && (c.value === null || typeof c.value === 'string')

// Identifikasjonen slik den gjelder: familiens rettelser (basis «family») foran AI-forslaget
export function effectiveIdentification(ai, corrections) {
  const out = { ...(ai?.identification || {}) }
  for (const f of CORRECTABLE_FIELDS) {
    const c = corrections?.[f]
    if (!validCorrection(c)) continue
    const value = (c.value || '').trim()
    out[f] = value ? { value, basis: 'family', evidence: '' } : null
  }
  return out
}

export const isCorrected = (record, field) => validCorrection(record?.corrections?.[field])

// Verdiene skjemaet starter med: det som gjelder nå, tom tekst for ukjent
export function currentValues(record) {
  const id = effectiveIdentification(record?.ai, record?.corrections)
  return Object.fromEntries(CORRECTABLE_FIELDS.map(f => [f, id[f]?.value || '']))
}

// Nytt ai_analysis-dokument med feltene brukeren har endret (uendrede felt røres ikke), eller null når
// ingenting er endret. Tomt felt lagres som null.
export function withCorrections(record, values, userId, at = new Date().toISOString()) {
  const before = currentValues(record)
  const corrections = { ...(record?.corrections || {}) }
  let changed = false
  for (const f of CORRECTABLE_FIELDS) {
    if (!(f in values)) continue
    const value = String(values[f] ?? '').trim().slice(0, MAX_CORRECTION_LENGTH)
    if (value === before[f]) continue
    corrections[f] = { value: value || null, by: userId, at }
    changed = true
  }
  return changed ? { ...record, corrections } : null
}
