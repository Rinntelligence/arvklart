// Visning av bilder fra Storage med tidsbegrensede (signerte) URL-er, så bøtten kan være privat.
// Databasen lagrer fortsatt den offentlige URL-en som identifikator (image_url, extra_images, branding_logo);
// her gjøres den om til en signert URL når bildet skal vises. Andre adresser (Unsplash i demoen,
// data:- og blob:-forhåndsvisninger) brukes som de er.
//
// Mange bilder på samme side hentes i ett kall (createSignedUrls), og svarene huskes til kort før de utløper.

export const BUCKET = 'item-images'
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`
export const SIGN_SECONDS = 60 * 60
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const MAX_BATCH = 100

// Stien i bøtten for en lagret URL, eller null hvis det ikke er et bilde i item-images
export function storagePath(stored) {
  if (typeof stored !== 'string') return null
  const i = stored.indexOf(PUBLIC_MARKER)
  if (i === -1) return null
  try { return decodeURIComponent(stored.slice(i + PUBLIC_MARKER.length).split('?')[0]) || null } catch { return null }
}

// Lager en løser som samler forespørsler i samme øyeblikk til ett kall. client er Supabase-klienten.
// Feiler signeringen (f.eks. eldre filer utenfor boets mappe mens bøtten fortsatt er offentlig),
// brukes den lagrede URL-en, så ingen bilder forsvinner i overgangen.
export function createImageResolver(client, now = () => Date.now()) {
  const cache = new Map() // sti → { url, expires }
  let queue = new Map() // sti → [resolve, ...]
  let scheduled = false

  const cached = path => {
    const c = cache.get(path)
    return c && c.expires - REFRESH_MARGIN_MS > now() ? c.url : null
  }

  async function flush() {
    scheduled = false
    const batch = queue
    queue = new Map()
    const paths = [...batch.keys()]
    for (let i = 0; i < paths.length; i += MAX_BATCH) {
      const chunk = paths.slice(i, i + MAX_BATCH)
      let rows = []
      try {
        const { data, error } = await client.storage.from(BUCKET).createSignedUrls(chunk, SIGN_SECONDS)
        if (!error && Array.isArray(data)) rows = data
      } catch { /* nettverksfeil: faller tilbake til lagret URL */ }
      const issued = now()
      for (const path of chunk) {
        const row = rows.find(r => r?.path === path && r.signedUrl && !r.error)
        if (row) cache.set(path, { url: row.signedUrl, expires: issued + SIGN_SECONDS * 1000 })
        for (const done of batch.get(path)) done(row ? row.signedUrl : null)
      }
    }
  }

  // Gir URL-en som skal vises. Synkront svar når det finnes i hurtigbufferen (peek), ellers et løfte.
  function resolve(stored) {
    const path = storagePath(stored)
    if (!path) return Promise.resolve(stored || null)
    const hit = cached(path)
    if (hit) return Promise.resolve(hit)
    return new Promise(done => {
      if (!queue.has(path)) queue.set(path, [])
      queue.get(path).push(url => done(url || stored))
      if (!scheduled) { scheduled = true; Promise.resolve().then(flush) }
    })
  }
  resolve.peek = stored => {
    const path = storagePath(stored)
    return path ? cached(path) : (stored || null)
  }
  resolve.clear = () => cache.clear()
  return resolve
}
