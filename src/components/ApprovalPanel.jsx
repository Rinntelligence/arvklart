import { useEffect, useState } from 'react'
import { L, locale } from '../lib/lang'
import { latestVersion, versionStatus, proposeDistribution, respondDistribution, stateLabel, heirStatusText } from '../lib/approval'

// Godkjenning av fordelingen (F6). Administrator legger frem et forslag; hver beslutningstaker godkjenner
// eller sier fra selv (eller via en bekreftet representant). Reglene håndheves i databasen. Godkjenningene er
// registrerte godkjenninger i Arvklart, ikke elektroniske signaturer. Uavklarte gjenstander omfattes ikke.
export default function ApprovalPanel({ estateId, userId, isAdmin, isDemo, closed, items, nameOf, onVersion, onToast }) {
  const [version, setVersion] = useState(null)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [objecting, setObjecting] = useState(null) // heir_id som skriver innsigelse
  const [reason, setReason] = useState('')
  const [itemId, setItemId] = useState('')
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    const { data: v } = await latestVersion(estateId)
    setVersion(v || null)
    const { data: st } = v ? await versionStatus(v.id) : { data: null }
    setStatus(st || null)
    onVersion?.(v || null, st || null)
    setLoaded(true)
  }
  useEffect(() => { load() }, [estateId])

  const propose = async () => {
    setBusy(true)
    const { error } = await proposeDistribution(estateId)
    setBusy(false)
    if (error) { onToast(L('Kunne ikke legge frem forslaget. Sjekk at arvelisten har beslutningstakere.', 'Could not propose the distribution. Check that the list of heirs has decision-makers.'), 'error'); return }
    onToast(L('Forslaget er lagt frem. Alle beslutningstakerne kan nå svare.', 'The proposal has been made. All decision-makers can now respond.'))
    load()
  }
  const respond = async (heirId, decision) => {
    setBusy(true)
    const { error } = await respondDistribution(version.id, heirId, decision, decision === 'object' ? reason : null, decision === 'object' && itemId ? itemId : null)
    setBusy(false)
    if (error) {
      const msg = /utdatert/.test(error.message || '') ? L('Forslaget er utdatert. Administrator må legge frem en ny versjon.', 'The proposal is outdated. The administrator must make a new version.')
        : L('Kunne ikke registrere svaret. Prøv igjen.', 'Could not register the response. Please try again.')
      onToast(msg, 'error'); return
    }
    setObjecting(null); setReason(''); setItemId('')
    onToast(decision === 'approve' ? L('Godkjenningen din er registrert', 'Your approval has been registered') : L('Innsigelsen din er registrert', 'Your objection has been registered'))
    load()
  }

  if (!loaded) return null
  const mine = (status?.heirs || []).filter(h => h.user_id === userId || h.representative?.user_id === userId)
  const canRespond = status && !status.approved_at && !status.outdated && !closed
  const unsettled = version ? (version.snapshot?.items || []).filter(i => i.status !== 'assigned' && !i.disposition).length : 0
  const link = `${window.location.origin}/estate/${estateId}/fordeling`
  const shareText = L(`Fordelingen av innbo og løsøre er lagt frem i Arvklart. Se over og godkjenn eller si fra her: ${link}`, `The division of household contents has been proposed in Arvklart. Review it and approve or object here: ${link}`)

  const box = { background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '16px', marginBottom: '12px' }
  const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }
  const btn = (primary) => ({ minHeight: '44px', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif',
    background: primary ? '#5F6E52' : '#fff', color: primary ? '#fff' : '#3A2F26', border: primary ? 'none' : '1px solid #9A8B78' })

  return (
    <section aria-labelledby="approval-title" style={{ marginTop: '28px' }}>
      <h2 id="approval-title" style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 400, color: '#3A2F26', margin: '0 0 10px' }}>{L('Godkjenning', 'Approval')}</h2>
      <p style={{ ...small, marginBottom: '12px' }}>
        {L('Fordelingen er endelig først når alle beslutningstakerne har godkjent den. Godkjenningen registreres i Arvklart; den er ikke en juridisk verifisert elektronisk signatur.',
          'The distribution is final only when all decision-makers have approved it. The approval is registered in Arvklart; it is not a legally verified electronic signature.')}
      </p>

      {!version ? (
        <div style={box}>
          <p style={small}>{L('Ingen forslag er lagt frem ennå.', 'No proposal has been made yet.')}</p>
          {isAdmin && !closed && <button onClick={propose} disabled={busy} style={{ ...btn(true), marginTop: '10px' }}>{L('Legg frem forslag', 'Propose the distribution')}</button>}
        </div>
      ) : (
        <div role="status" style={{ ...box, borderColor: status?.state === 'approved' ? '#B8C8A8' : '#D9CFC0', background: status?.state === 'approved' ? '#DCE3D2' : '#fff' }}>
          <p style={{ ...small, fontWeight: 600, color: '#3A2F26' }}>{stateLabel(status?.state)}</p>
          <p style={small}>{L(`Versjon ${version.version_no}, lagt frem ${new Date(version.created_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}`, `Version ${version.version_no}, proposed ${new Date(version.created_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}`)} · {L(`${status?.approved} av ${status?.required} har godkjent`, `${status?.approved} of ${status?.required} have approved`)}</p>
          {unsettled > 0 && <p style={{ ...small, marginTop: '6px', fontWeight: 600 }}>{L(`Delvis fordeling: ${unsettled} ${unsettled === 1 ? 'gjenstand er' : 'gjenstander er'} ikke avklart og omfattes ikke av godkjenningen.`, `Partial distribution: ${unsettled} ${unsettled === 1 ? 'item is' : 'items are'} not settled and not covered by the approval.`)}</p>}
          {status?.outdated && <p style={{ ...small, marginTop: '6px', color: '#8A4B2A' }}>{status.approved_at
            ? L('Fordelingen er endret etter at den ble godkjent. Den godkjente versjonen står fast, men endringene krever en ny versjon som alle godkjenner.', 'The distribution has changed since it was approved. The approved version stands, but the changes require a new version that everyone approves.')
            : L('Fordelingen er endret etter at forslaget ble lagt frem. Alle må godkjenne en ny versjon.', 'The distribution has changed since the proposal was made. Everyone must approve a new version.')}</p>}
          {status?.state === 'not_digitally_approvable' && <p style={{ ...small, marginTop: '6px' }}>{L('Minst én beslutningstaker har ikke konto og ingen bekreftet representant. Forslaget kan ikke godkjennes digitalt; last ned protokollen for signering på papir, eller inviter arvingen.', 'At least one decision-maker has no account and no confirmed representative. The proposal cannot be approved digitally; download the record for signing on paper, or invite the heir.')}</p>}

          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: '6px' }}>
            {(status?.heirs || []).map(h => (
              <li key={h.heir_id} style={{ ...small, background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '8px 10px' }}>
                <strong style={{ color: '#3A2F26' }}>{h.name}</strong>: {heirStatusText(h, nameOf)}
              </li>
            ))}
          </ul>

          {canRespond && mine.map(h => (
            <div key={h.heir_id} style={{ marginTop: '14px', borderTop: '1px solid #E8DFD0', paddingTop: '12px' }}>
              <p style={{ ...small, fontWeight: 600, color: '#3A2F26' }}>
                {h.user_id === userId ? L('Ditt svar', 'Your response') : L(`Svar for ${h.name} (som bekreftet representant)`, `Respond for ${h.name} (as confirmed representative)`)}
              </p>
              <p style={small}>{L('Godkjenningen gjelder fordelingen slik den står i denne versjonen. Det som ikke er avklart, omfattes ikke.', 'The approval applies to the distribution as it stands in this version. What is not settled is not covered.')}</p>
              {objecting === h.heir_id ? (
                <div style={{ display: 'grid', gap: '8px', marginTop: '8px' }}>
                  <label htmlFor={`obj-${h.heir_id}`} style={{ ...small, fontWeight: 600 }}>{L('Hva er du ikke enig i?', 'What do you disagree with?')}</label>
                  <textarea id={`obj-${h.heir_id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} rows={3} style={{ padding: '10px', border: '1px solid #9A8B78', borderRadius: '8px', fontFamily: 'Karla, sans-serif', fontSize: '0.875rem' }} />
                  <label htmlFor={`obj-item-${h.heir_id}`} style={{ ...small, fontWeight: 600 }}>{L('Gjelder det en bestemt gjenstand? (valgfritt)', 'Is it about a specific item? (optional)')}</label>
                  <select id={`obj-item-${h.heir_id}`} value={itemId} onChange={e => setItemId(e.target.value)} style={{ minHeight: '44px', padding: '8px', border: '1px solid #9A8B78', borderRadius: '8px', fontFamily: 'Karla, sans-serif' }}>
                    <option value="">{L('Ingen bestemt gjenstand', 'No specific item')}</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => respond(h.heir_id, 'object')} disabled={busy || reason.trim().length < 3} style={btn(true)}>{L('Send innsigelsen', 'Send the objection')}</button>
                    <button onClick={() => setObjecting(null)} style={btn(false)}>{L('Avbryt', 'Cancel')}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                  {h.decision !== 'approve' && <button onClick={() => respond(h.heir_id, 'approve')} disabled={busy} style={btn(true)}>{L('Godkjenn fordelingen', 'Approve the distribution')}</button>}
                  <button onClick={() => setObjecting(h.heir_id)} disabled={busy} style={btn(false)}>{L('Jeg er ikke enig', 'I disagree')}</button>
                </div>
              )}
            </div>
          ))}

          {canRespond && !mine.length && !isDemo && (status?.heirs || []).some(h => !h.user_id) && (
            <p style={{ ...small, marginTop: '10px' }}>{L('Står du på arvelisten, men kan ikke svare? Koble kontoen din til arvingen under «Arvinger» («Dette er meg»).', 'Are you on the list of heirs but cannot respond? Link your account to the heir under «Heirs» («This is me»).')}</p>
          )}

          {isDemo && mine.some(h => h.decision === 'approve') && status?.state !== 'approved' && (
            <p style={{ ...small, marginTop: '10px', fontStyle: 'italic' }}>{L('I et ekte bo må alle arvingene godkjenne selv. Demoen legger ikke inn svar for de andre.', 'In a real estate every heir must approve themselves. The demo does not add responses for the others.')}</p>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
            {isAdmin && !closed && (status?.outdated || status?.state === 'objected') && <button onClick={propose} disabled={busy} style={btn(true)}>{L('Legg frem ny versjon', 'Propose a new version')}</button>}
            {!status?.approved_at && (
              <>
                <a href={`mailto:?subject=${encodeURIComponent(L('Fordelingen i Arvklart', 'The distribution in Arvklart'))}&body=${encodeURIComponent(shareText)}`} style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{L('Del lenke på e-post', 'Share link by email')}</a>
                <a href={`sms:?&body=${encodeURIComponent(shareText)}`} style={{ ...btn(false), display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>{L('Del lenke på SMS', 'Share link by SMS')}</a>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
