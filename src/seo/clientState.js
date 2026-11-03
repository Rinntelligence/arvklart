// Om nettleseren har en lagret Supabase-økt. Leses bare (nøkkelen «sb-<prosjekt>-auth-token» i localStorage),
// og brukes bare til å velge hvordan en forhåndsrendret side vises (main.jsx); innloggingen sjekkes som før i App.
// Samme sjekk står i public/seo-early.js, som kjører før appen.
export const SESSION_KEY = /^sb-.+-auth-token$/

// Lenker fra Supabase (e-postbekreftelse, magisk lenke, ny e-post) lander på «/» med økten eller en feil i adressen
// (#access_token=… eller ?code=…). Da er brukeren på vei inn i appen, ikke en ny besøkende på forsiden.
export const AUTH_IN_URL = /[#&?](access_token|refresh_token|error_description|code)=/

export function hasAuthInUrl(loc = typeof window !== 'undefined' ? window.location : null) {
  return Boolean(loc) && AUTH_IN_URL.test(`${loc.search || ''}${loc.hash || ''}`)
}

export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) if (SESSION_KEY.test(localStorage.key(i) || '')) return true
  } catch { /* ingen localStorage: ingen lagret økt */ }
  return false
}
