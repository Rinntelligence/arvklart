// Påbegynt begrunnelse på et ønske, så teksten ikke går tapt ved et feiltrykk, en omlasting eller hvis
// lagringen feiler. Ligger i sessionStorage: bare denne fanen, og borte når fanen lukkes.
// Tåler at lagringen er blokkert (privat vindu o.l.); da finnes det bare ikke noe utkast.

const PREFIX = 'arvklart:reasonDraft:'
const key = (userId, itemId) => `${PREFIX}${userId}:${itemId}`

const store = () => { try { return globalThis.sessionStorage || null } catch { return null } }

export const readReasonDraft = (userId, itemId) => {
  try { return store()?.getItem(key(userId, itemId)) ?? null } catch { return null }
}

// Tom tekst betyr ingen utkast
export const writeReasonDraft = (userId, itemId, text) => {
  try {
    const s = store()
    if (!s) return
    if (text && text.trim()) s.setItem(key(userId, itemId), text)
    else s.removeItem(key(userId, itemId))
  } catch { /* ingen lagring tilgjengelig */ }
}

export const clearReasonDraft = (userId, itemId) => writeReasonDraft(userId, itemId, '')

// Ved utlogging: fjern alle utkast i fanen
export const clearAllReasonDrafts = () => {
  try {
    const s = store()
    if (!s) return
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i)
      if (k && k.startsWith(PREFIX)) s.removeItem(k)
    }
  } catch { /* ingen lagring tilgjengelig */ }
}
