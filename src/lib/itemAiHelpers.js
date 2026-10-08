// Rene hjelpefunksjoner for «Legg til gjenstand(er)» (testes i test/lib/itemAiHelpers.test.js).

// Finner boets kategori som passer til AI-ens forslag (boet kan ha egne kategorinavn)
export function matchCategory(categories, suggestion) {
  const s = (suggestion || '').trim().toLowerCase()
  if (!s) return null
  const exact = categories.find(c => c.label.toLowerCase() === s)
  if (exact) return exact
  return categories.find(c => {
    const label = c.label.toLowerCase()
    return label.includes(s) || s.includes(label)
  }) || null
}

// Kjører worker for hvert element med høyst `limit` samtidig. Stopper å starte nye når shouldStop() er sann.
export async function runPool(list, limit, worker, shouldStop = () => false) {
  let next = 0
  const run = async () => {
    while (next < list.length && !shouldStop()) {
      const i = next++
      await worker(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run))
}

// «Slå sammen gjenstander»: de valgte bildene (i rekkefølgen de ble valgt, første blir hovedbildet) samles
// i én gjenstand. Den første gjenstanden med navn, ellers den første med et valgt bilde, beholder plassen og
// feltene sine. De andre mister de valgte bildene, og står de da uten bilder og navn, fjernes de.
export function mergeSelectedPhotos(drafts, selectedUrls) {
  const all = drafts.flatMap(d => d.photos)
  const photos = selectedUrls.map(url => all.find(p => p.url === url)).filter(Boolean)
  const chosen = new Set(photos.map(p => p.url))
  const sources = drafts.filter(d => d.photos.some(p => chosen.has(p.url)))
  if (photos.length < 2) return drafts
  const base = sources.find(d => d.title.trim()) || sources[0]
  return drafts.flatMap(d => {
    if (d === base) return [{ ...d, photos, status: 'idle' }]
    if (!sources.includes(d)) return [d]
    const rest = d.photos.filter(p => !chosen.has(p.url))
    return rest.length || d.title.trim() ? [{ ...d, photos: rest }] : []
  })
}
