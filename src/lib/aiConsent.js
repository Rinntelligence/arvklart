// Samtykke til AI-analyse av bilder og verdiestimat. Lagres per nettleser.
const KEY = 'aiConsented'

export const hasAiConsent = () => { try { return localStorage.getItem(KEY) === 'true' } catch { return false } }
export const giveAiConsent = () => { try { localStorage.setItem(KEY, 'true') } catch { /* privat modus */ } }
export const withdrawAiConsent = () => { try { localStorage.removeItem(KEY) } catch { /* privat modus */ } }
