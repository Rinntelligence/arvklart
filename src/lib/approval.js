// Forslag og godkjenning av fordelingen (20261020_distribution_approval.sql). Alle regler håndheves i
// databasen; her er bare kallene og tekstene. Godkjenninger er registrerte godkjenninger i Arvklart, ikke
// juridisk verifiserte elektroniske signaturer.
import { supabase } from './supabase'
import { L, locale } from './lang'

export const latestVersion = estateId => supabase.from('distribution_versions')
  .select('id, version_no, created_at, approved_at, required, snapshot').eq('estate_id', estateId)
  .order('version_no', { ascending: false }).limit(1).maybeSingle()
export const versionStatus = versionId => supabase.rpc('distribution_status', { p_version: versionId })
export const proposeDistribution = estateId => supabase.rpc('propose_distribution', { p_estate: estateId })
export const respondDistribution = (versionId, heirId, decision, reason = null, itemId = null) =>
  supabase.rpc('respond_distribution', { p_version: versionId, p_heir: heirId, p_decision: decision, p_reason: reason, p_item: itemId })

export const setMustApprove = (heirId, value, reason = null) => supabase.rpc('set_must_approve', { p_heir: heirId, p_value: value, p_reason: reason })
export const confirmDeciderRemoval = heirId => supabase.rpc('confirm_decider_removal', { p_heir: heirId })
export const addRepresentative = (heirId, userId, kind, basis, documentId = null) =>
  supabase.rpc('add_representative', { p_heir: heirId, p_user: userId, p_kind: kind, p_basis: basis, p_document: documentId })
export const verifyRepresentative = repId => supabase.rpc('verify_representative', { p_rep: repId })
export const revokeRepresentative = repId => supabase.rpc('revoke_representative', { p_rep: repId })

export const stateLabel = s => ({
  pending: L('Venter på svar', 'Waiting for responses'),
  objected: L('Noen er ikke enige', 'Someone disagrees'),
  approved: L('Godkjent av alle', 'Approved by everyone'),
  outdated: L('Utdatert – fordelingen er endret etter forslaget', 'Outdated – the distribution has changed since the proposal'),
  not_digitally_approvable: L('Kan ikke godkjennes digitalt ennå', 'Cannot be approved digitally yet'),
}[s] || '')

const when = t => new Date(t).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Status for én beslutningstaker i et forslag, til siden og protokollen
export function heirStatusText(h, nameOf) {
  const via = h.via_representative ? L(` av ${h.responder_email || nameOf(h.responder)} som representant`, ` by ${h.responder_email || nameOf(h.responder)} as representative`) : h.responder_email ? ` (${h.responder_email})` : ''
  if (h.decision === 'approve') return L(`Godkjent ${when(h.at)}${via}`, `Approved ${when(h.at)}${via}`)
  if (h.decision === 'object') return L(`Ikke enig ${when(h.at)}: «${h.reason}»`, `Disagrees ${when(h.at)}: «${h.reason}»`)
  if (!h.user_id && !h.representative) return L('Har ikke konto i Arvklart og ingen bekreftet representant – kan ikke svare digitalt', 'Has no Arvklart account and no confirmed representative – cannot respond digitally')
  return L('Har ikke svart ennå', 'Has not responded yet')
}

// Venter siste forslag på svar fra meg (selv eller som bekreftet representant)? Til «Hva gjenstår».
export async function proposalForMe(estateId, userId) {
  const { data: v } = await latestVersion(estateId)
  if (!v || v.approved_at) return null
  const { data: st } = await versionStatus(v.id)
  if (!st || st.outdated || st.state === 'approved') return null
  const needsMyResponse = (st.heirs || []).some(h => (h.user_id === userId || h.representative?.user_id === userId) && h.decision !== 'approve')
  return { needsMyResponse, state: st.state }
}
