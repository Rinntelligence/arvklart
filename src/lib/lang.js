// Simple EN/NO language system - no external dependencies

export const getLang = () => {
  try { return localStorage.getItem('hs_lang') || 'no' } catch { return 'no' }
}

export const setLang = (code) => {
  try { localStorage.setItem('hs_lang', code) } catch {}
}

// Språket leses ved hver render. Bytte av språk laster siden på nytt, så alt oppdateres.
export const isEn = () => getLang() === 'en'

// Velger norsk eller engelsk tekst: L('Lagre', 'Save')
export const L = (no, en) => (isEn() ? en : no)

// Locale for tall og datoer
export const locale = () => (isEn() ? 'en-GB' : 'nb-NO')

// ── Språk per konto (profiles.preferred_lang); lagring på kontoen ligger i languagePref.js ──────────
export const SYNC_KEY = 'hs_lang_synced'
export const LANGS = ['no', 'en']

// Kontoens språk vinner over nettleserens. Returnerer true når siden må lastes på nytt for å bytte språk.
// Laster aldri på nytt i ring: bare én gang per fane og språk, og ikke hvis valget ikke kan lagres lokalt.
export function adoptProfileLang(preferred) {
  if (!LANGS.includes(preferred) || getLang() === preferred) return false
  try {
    if (sessionStorage.getItem(SYNC_KEY) === preferred) return false
    sessionStorage.setItem(SYNC_KEY, preferred)
  } catch { /* ingen sessionStorage: sjekken under hindrer likevel løkke */ }
  setLang(preferred)
  return getLang() === preferred
}

// Språket en ny profil får: det brukeren valgte før innlogging, hvis det var engelsk; ellers «ikke valgt»
export const initialProfileLang = () => (getLang() === 'en' ? 'en' : null)
