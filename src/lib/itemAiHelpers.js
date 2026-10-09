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

// ── Kamera og gruppering i «Legg til flere» ──────────────────────────────────────────────────────
// Utkast: { key, photos: [{ url, file }], title, status, … }. makeDraft() lager et tomt utkast med ny key.

// Nye bilder fra kameraet. Som standard blir hvert bilde en ny gjenstand; med sameItem legges bildene til
// gjenstanden som fotograferes nå (opptil maxPhotos). Et tomt utkast (etter «Neste gjenstand») fylles først.
// Returnerer nye utkast, hvilken gjenstand som fotograferes nå, om en ny gjenstand ble laget, og hvor
// mange bilder som ikke fikk plass.
export function addCapturedPhotos(drafts, { currentKey, sameItem, photos, makeDraft, maxPhotos, maxItems }) {
  let list = drafts
  let key = currentKey
  let created = false
  let rejected = 0
  for (const photo of photos) {
    const current = list.find(d => d.key === key)
    const fillCurrent = current && current.status !== 'saved' && (current.photos.length === 0 || sameItem)
    if (fillCurrent) {
      if (current.photos.length >= maxPhotos) { rejected++; continue }
      list = list.map(d => (d.key === key ? { ...d, photos: [...d.photos, photo], status: d.status === 'saved' ? d.status : 'idle' } : d))
      continue
    }
    if (list.length >= maxItems) { rejected++; continue }
    const draft = { ...makeDraft(), photos: [photo] }
    list = [...list, draft]
    key = draft.key
    created = true
  }
  return { drafts: list, currentKey: key, created, rejected }
}

// Fjerner ett bilde. Står gjenstanden da uten bilder og uten navn, fjernes den også.
// `removed` har det som trengs for å angre (restoreRemoved).
export function removePhotoAt(drafts, key, index) {
  const draftIndex = drafts.findIndex(d => d.key === key)
  const draft = drafts[draftIndex]
  if (!draft || !draft.photos[index]) return { drafts, removed: null }
  const photo = draft.photos[index]
  const photos = draft.photos.filter((_, i) => i !== index)
  const draftRemoved = photos.length === 0 && !draft.title.trim()
  const next = draftRemoved
    ? drafts.filter(d => d.key !== key)
    : drafts.map(d => (d.key === key ? { ...d, photos } : d))
  return { drafts: next, removed: { draft, draftIndex, photoIndex: index, photo, draftRemoved } }
}

// Angrer removePhotoAt: legger bildet tilbake på samme plass, og gjenstanden tilbake hvis den ble fjernet.
// Angring har ingen tidsfrist, så det kan ha kommet nye bilder i mellomtiden: er gjenstanden full (maxPhotos)
// eller listen full (maxItems), returneres samme liste uendret, og siden sier fra.
export function restoreRemoved(drafts, removed, { maxPhotos = Infinity, maxItems = Infinity } = {}) {
  if (!removed) return drafts
  const { draft, draftIndex, photoIndex, photo, draftRemoved } = removed
  if (draftRemoved || !drafts.some(d => d.key === draft.key)) {
    if (drafts.length >= maxItems) return drafts
    const at = Math.min(draftIndex, drafts.length)
    return [...drafts.slice(0, at), draft, ...drafts.slice(at)]
  }
  const target = drafts.find(d => d.key === draft.key)
  if (target.photos.some(p => p.url === photo.url) || target.photos.length >= maxPhotos) return drafts
  return drafts.map(d => {
    if (d !== target) return d
    const photos = [...d.photos]
    photos.splice(Math.min(photoIndex, photos.length), 0, photo)
    return { ...d, photos }
  })
}

// «Del opp»: ett bilde per gjenstand. Den første beholder navn og felter; de andre blir nye, tomme utkast
// rett etter, så rekkefølgen bevares.
export function splitDraft(drafts, key, makeDraft) {
  const i = drafts.findIndex(d => d.key === key)
  const draft = drafts[i]
  if (!draft || draft.photos.length < 2) return drafts
  const [first, ...rest] = draft.photos
  const parts = [{ ...draft, photos: [first], status: draft.status === 'saved' ? draft.status : 'idle' }, ...rest.map(p => ({ ...makeDraft(), photos: [p] }))]
  return [...drafts.slice(0, i), ...parts, ...drafts.slice(i + 1)]
}

// Et AI-verdianslag gjelder bare så lenge grunnlaget er uendret: navn, tilstand og kategori, og verdien
// i feltet er den AI foreslo. Ellers er verdien brukerens egen og vises og lagres ikke som AI-anslag.
export function estimateApplies(draft) {
  const e = draft?.estimate
  if (!e?.basis) return false
  return draft.title === e.basis.title && draft.condition === e.basis.condition
    && draft.categoryId === e.basis.categoryId && String(draft.value) === String(e.value)
}
