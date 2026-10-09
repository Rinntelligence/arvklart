// Tekststørrelse i appen: Normal / Stor / Ekstra stor. Ganges med grunnstørrelsen som nettleseren og
// telefonen allerede har valgt (inkl. iPhone-innstillingen), så brukerens egne innstillinger beholdes.
// Lagres per enhet. All tekst er i rem, så hele appen følger med.
const KEY = 'hs_text_size'
export const TEXT_SIZES = [
  { key: 'normal', scale: 1 },
  { key: 'large', scale: 1.18 },
  { key: 'xlarge', scale: 1.35 },
]

export const scaleFor = (key) => (TEXT_SIZES.find(s => s.key === key) || TEXT_SIZES[0]).scale

export function getTextSize() {
  try {
    const v = localStorage.getItem(KEY)
    return TEXT_SIZES.some(s => s.key === v) ? v : 'normal'
  } catch { return 'normal' }
}

let basePx = null
export function applyTextSize(key = getTextSize()) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (basePx === null) {
    html.style.fontSize = ''
    basePx = parseFloat(getComputedStyle(html).fontSize) || 16
  }
  const scale = scaleFor(key)
  html.style.fontSize = scale === 1 ? '' : `${Math.round(basePx * scale * 100) / 100}px`
}

export function setTextSize(key) {
  try { localStorage.setItem(KEY, key) } catch { /* privat modus: gjelder bare denne økten */ }
  applyTextSize(key)
}
