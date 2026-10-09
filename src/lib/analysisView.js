// Visning av AI-vurderingen (items.ai_analysis / analyze-item «analysis», versjon 2) på brukerens språk.
import { L } from './lang'

export const conditionLabel = c => ({
  excellent: L('Utmerket', 'Excellent'),
  good: L('God', 'Good'),
  fair: L('Middels', 'Fair'),
  poor: L('Dårlig', 'Poor'),
  unknown: L('Ikke vurdert', 'Not assessed'),
}[c] || L('Ikke vurdert', 'Not assessed'))

export const CONDITION_OPTIONS = () => ['excellent', 'good', 'fair', 'poor', 'unknown'].map(value => ({ value, label: conditionLabel(value) }))

export const fieldLabel = f => ({
  object_type: L('Type', 'Type'),
  brand: L('Merke', 'Brand'),
  manufacturer: L('Produsent', 'Manufacturer'),
  model: L('Modell', 'Model'),
  variant: L('Variant', 'Variant'),
  material: L('Materiale', 'Material'),
  colour: L('Farge', 'Colour'),
  period: L('Periode', 'Period'),
  designer_or_artist: L('Designer eller kunstner', 'Designer or artist'),
  model_number: L('Modellnummer', 'Model number'),
}[f] || f)

export const confidenceLabel = c => ({ high: L('ganske sikker', 'fairly sure'), medium: L('middels sikker', 'moderately sure'), low: L('usikker', 'unsure') }[c] || '')

const ORDER = ['brand', 'manufacturer', 'model', 'variant', 'designer_or_artist', 'period', 'material', 'colour', 'model_number', 'object_type']

// Identifikasjonen delt i «sett på bildet», «sannsynlig» og «ukjent»
export function splitIdentification(ai) {
  const observed = [], probable = []
  for (const f of ORDER) {
    const v = ai?.identification?.[f]
    if (!v) continue
    ;(v.basis === 'observed' ? observed : probable).push({ field: f, label: fieldLabel(f), value: v.value, evidence: v.evidence })
  }
  const unknown = ORDER.filter(f => !ai?.identification?.[f] && f !== 'object_type' && f !== 'variant' && f !== 'model_number').map(fieldLabel)
  return { observed, probable, unknown }
}

// Én linje med det viktigste: merke/produsent, modell, designer og periode. Sannsynlig merkes.
export function identificationSummary(ai) {
  const parts = []
  const brand = ai?.identification?.brand || ai?.identification?.manufacturer
  for (const v of [brand, ai?.identification?.model, ai?.identification?.designer_or_artist, ai?.identification?.period]) {
    if (v?.value) parts.push(v.basis === 'probable' ? `${v.value} (${L('sannsynlig', 'probably')})` : v.value)
  }
  return parts.join(' · ')
}

// Advarsel når bildet ser ut til å vise flere gjenstander
export function multipleItemsText(ai) {
  const m = ai?.multiple_items
  if (!m?.detected) return ''
  return m.count
    ? L(`Bildet ser ut til å vise flere gjenstander (ca. ${m.count}). Ta gjerne ett bilde per gjenstand.`, `The photo seems to show several items (about ${m.count}). Consider one photo per item.`)
    : L('Bildet ser ut til å vise flere gjenstander. Ta gjerne ett bilde per gjenstand.', 'The photo seems to show several items. Consider one photo per item.')
}
