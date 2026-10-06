import { supabase } from './supabase'

// Founder-tilgang håndheves i databasen (is_founder() krever founders-rad + aal2 i JWT).
// Funksjonene her er bare klientsiden av flyten. Se supabase/migrations/20261006_founder_security.sql.

export const amIFounder = async () => {
  const { data, error } = await supabase.rpc('am_i_founder')
  return !error && data === true
}

// 'aal2' betyr at tofaktor er bekreftet i denne sesjonen
export const getAssuranceLevel = async () => {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  return data?.currentLevel || null
}

// Første bekreftede TOTP-faktor, eller null hvis tofaktor ikke er satt opp
export const getVerifiedTotpFactor = async () => {
  const { data } = await supabase.auth.mfa.listFactors()
  return data?.totp?.[0] || null
}

// Starter oppsett av tofaktor. Rydder bort halvferdige forsøk først, ellers feiler enroll.
export const enrollTotp = async () => {
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const stale = (factors?.all || []).filter(f => f.factor_type === 'totp' && f.status === 'unverified')
  for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id })
  return supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ArvKlart founder' })
}

// Bekrefter en 6-sifret kode. Ved suksess oppgraderes sesjonen til aal2.
export const verifyTotp = (factorId, code) =>
  supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })

export const getFounderDashboard = () => supabase.rpc('founder_dashboard')

export const setUserPlan = (userId, plan) =>
  supabase.rpc('founder_set_plan', { p_user_id: userId, p_plan: plan })
