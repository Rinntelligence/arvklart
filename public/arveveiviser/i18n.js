// Språk i arveveiviseren. Norsk er standard og den juridisk gjeldende versjonen.
// Engelsk brukes bare når appen ber om det med ?lang=en, og appen gjør det bare når den engelske versjonen
// er slått på etter juridisk gjennomgang (VITE_GUIDE_EN i GuidePage). Uten det er alt som før, på norsk.
//
//   tr('Neste', 'Next')        – tekst i koden
//   field(q, 'title')          – tekst i innholdsfilene: q.title_en på engelsk når den finnes, ellers q.title
//
// Mangler en engelsk tekst, vises den norske. Det er bedre enn ingenting, men E2 skal fylle inn alt.

let lang = (() => {
  try { return new URLSearchParams(globalThis.location?.search || '').get('lang') === 'en' ? 'en' : 'no' } catch { return 'no' }
})()

export const getLang = () => lang
// For tester og for appen (veiviser-context); endrer ikke noe som allerede er vist før neste render
export const setLang = l => { lang = l === 'en' ? 'en' : 'no' }
export const isEn = () => lang === 'en'
export const tr = (no, en) => (lang === 'en' && en != null ? en : no)
export const field = (obj, key) => {
  if (!obj) return undefined
  if (lang === 'en') {
    const en = obj[`${key}_en`]
    if (en != null) return en
  }
  return obj[key]
}
// Datoer og tall
export const dateLocale = () => (lang === 'en' ? 'en-GB' : 'nb-NO')
