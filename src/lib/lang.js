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
