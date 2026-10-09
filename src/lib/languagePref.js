// Språk per konto: valget lagres på profilen (profiles.preferred_lang) og følger brukeren mellom enheter.
// localStorage (hs_lang i lang.js) er bare en hurtigbuffer, og det eneste som gjelder før innlogging.
// null på profilen betyr «ikke valgt»; da beholdes nettleserens språk (norsk som standard).
import { supabase } from './supabase'
import { LANGS, SYNC_KEY, setLang } from './lang'

// Bytt språk: lagres lokalt, på profilen og på innloggingen (e-postmalene leser user_metadata.lang),
// og siden lastes på nytt. Demokontoer kan ikke endre profilen, så for dem gjelder bare nettleseren.
export async function changeLanguage(next, { userId = null, isDemo = false } = {}) {
  if (!LANGS.includes(next)) return
  setLang(next)
  if (userId && !isDemo) {
    await Promise.allSettled([
      supabase.from('profiles').update({ preferred_lang: next }).eq('user_id', userId),
      supabase.auth.updateUser({ data: { lang: next } }),
    ])
  }
  try { sessionStorage.setItem(SYNC_KEY, next) } catch { /* ikke viktig */ }
  window.location.reload()
}
