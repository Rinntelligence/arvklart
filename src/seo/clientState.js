// Om nettleseren har en lagret Supabase-økt. Leses bare (nøkkelen «sb-<prosjekt>-auth-token» i localStorage),
// og brukes bare til å velge hvordan en forhåndsrendret side vises (main.jsx); innloggingen sjekkes som før i App.
// Samme sjekk står i public/seo-early.js, som kjører før appen.
export const SESSION_KEY = /^sb-.+-auth-token$/

export function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) if (SESSION_KEY.test(localStorage.key(i) || '')) return true
  } catch { /* ingen localStorage: ingen lagret økt */ }
  return false
}
