import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { L } from '../lib/lang'
import { setMustApprove, confirmDeciderRemoval, addRepresentative, verifyRepresentative, revokeRepresentative } from '../lib/approval'

// «Hvem godkjenner fordelingen»: beslutningstakere på arvelisten og representanter (fullmakt/verge).
// Reglene håndheves i databasen (20261020_distribution_approval.sql):
//  • en arving kan selv ta seg ut; administrator kan bare be om det, og en annen beslutningstaker må bekrefte
//  • en representant registrert av administrator er ubekreftet til en annen beslutningstaker (ikke
//    representanten eller den som registrerte den) bekrefter den; ubekreftet representasjon kan ikke svare
// Koble egen konto: et medlem hvis e-post står på nøyaktig én arving som ikke er koblet, kan koble seg selv.
// Det går via join_estate() med boets kode, samme kontroll som når en arving blir med via invitasjonen
// (e-posten fra innloggingen). Administrator kan ikke koble andre.
export default function DecidersPanel({ estateId, heirs, members, userId, userEmail, inviteCode, isAdmin, isDemo, onChanged, onToast }) {
  const [reps, setReps] = useState([])
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(null) // { heirId, mode: 'remove' | 'self' }
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(null) // heirId
  const [rep, setRep] = useState({ user: '', kind: 'fullmakt', basis: '' })

  const loadReps = async () => {
    const { data } = await supabase.from('heir_representatives').select('id, heir_id, user_id, kind, basis, created_by, verified_at, verified_by').eq('estate_id', estateId).is('revoked_at', null)
    setReps(data || [])
  }
  useEffect(() => { loadReps() }, [estateId, heirs])

  const nameOf = id => members.find(m => m.user_id === id)?.profiles?.display_name || L('tidligere medlem', 'former member')
  const iAmDecider = heirs.some(h => h.user_id === userId && h.must_approve)
  const myEmail = (userEmail || '').trim().toLowerCase()
  const isMine = h => !!myEmail && (h.email || '').trim().toLowerCase() === myEmail
  const iAmLinked = heirs.some(h => h.user_id === userId)
  const myRows = heirs.filter(isMine)
  const run = async (fn, ok) => {
    setBusy(true)
    const { error } = await fn()
    setBusy(false)
    if (error) { onToast(error.message && !/^[A-Z_]+$/.test(error.message) ? error.message : L('Kunne ikke lagre. Prøv igjen.', 'Could not save. Please try again.'), 'error'); return false }
    onToast(ok); setAsking(null); setReason(''); setAdding(null); setRep({ user: '', kind: 'fullmakt', basis: '' })
    onChanged(); loadReps()
    return true
  }

  const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }
  const btn = { minHeight: '40px', padding: '6px 12px', background: '#fff', border: '1px solid #9A8B78', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26' }
  const field = { minHeight: '44px', padding: '8px 10px', border: '1px solid #9A8B78', borderRadius: '8px', fontFamily: 'Karla, sans-serif', fontSize: '0.875rem', width: '100%', boxSizing: 'border-box' }
  if (!heirs.length) return null

  return (
    <section aria-labelledby="deciders-title" style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '20px', marginTop: '24px', fontFamily: 'Karla, sans-serif' }}>
      <h2 id="deciders-title" style={{ fontFamily: 'Fraunces, serif', fontSize: '1.125rem', fontWeight: 400, color: '#3A2F26', margin: '0 0 6px' }}>{L('Hvem godkjenner fordelingen', 'Who approves the distribution')}</h2>
      <p style={{ ...small, marginBottom: '14px' }}>
        {L('Fordelingen er godkjent først når alle beslutningstakerne har godkjent den – selv, eller via en representant som en annen beslutningstaker har bekreftet. En arving uten konto må inviteres eller ha en bekreftet representant; ellers signeres protokollen på papir. Fullmakter og vergemål registreres og bekreftes av familien selv; Arvklart kontrollerer dem ikke juridisk.',
          'The distribution is approved only when all decision-makers have approved it – themselves, or via a representative another decision-maker has confirmed. An heir without an account must be invited or have a confirmed representative; otherwise the record is signed on paper. Powers of attorney and guardianships are registered and confirmed by the family; Arvklart does not check them legally.')}
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
        {heirs.map(h => {
          const r = reps.find(x => x.heir_id === h.id)
          const self = h.user_id && h.user_id === userId
          const canVerify = r && !r.verified_at && iAmDecider && r.user_id !== userId && r.created_by !== userId && !isDemo
          const canRevoke = r && (isAdmin || r.user_id === userId || self) && !isDemo
          const canConfirmRemoval = h.exclusion_requested_by && h.exclusion_requested_by !== userId && (iAmDecider || self) && !isDemo
          return (
            <li key={h.id} style={{ background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.875rem', color: '#3A2F26' }}>{h.name}</strong>
                <span style={{ ...small, color: h.must_approve ? '#3A5A30' : '#75604B' }}>{h.must_approve ? L('Skal godkjenne', 'Approves') : L('Godkjenner ikke', 'Does not approve')}</span>
              </div>
              <p style={small}>{h.user_id ? L('Har konto i Arvklart (koblet da arvingen ble med)', 'Has an Arvklart account (linked when the heir joined)') : L('Har ikke blitt med ennå', 'Has not joined yet')}</p>
              {!h.user_id && !iAmLinked && !isDemo && isMine(h) && myRows.length === 1 && inviteCode && (
                <div style={{ marginTop: '8px' }}>
                  <p style={small}>{L('E-posten din står på denne arvingen. Koble kontoen din for å kunne godkjenne fordelingen.', 'Your email is on this heir. Link your account to be able to approve the distribution.')}</p>
                  <button onClick={() => run(() => supabase.rpc('join_estate', { p_code: inviteCode }), L('Kontoen din er koblet til arvingen', 'Your account is linked to the heir'))} disabled={busy} style={{ ...btn, marginTop: '6px' }}>{L('Dette er meg – koble kontoen min', 'This is me – link my account')}</button>
                </div>
              )}
              {!h.user_id && !iAmLinked && isMine(h) && myRows.length > 1 && (
                <p style={{ ...small, color: '#8A4B2A' }}>{L('E-posten din står på flere arvinger, så Arvklart kan ikke vite hvem av dem du er. Rett e-posten på arvingen som ikke er deg, eller registrer en representant.', 'Your email is on several heirs, so Arvklart cannot tell which of them you are. Correct the email on the heir who is not you, or register a representative.')}</p>
              )}
              {h.exclusion_requested_by && <p style={{ ...small, color: '#8A4B2A' }}>{L(`Det er bedt om at ${h.name} ikke skal godkjenne: «${h.exclusion_reason}». Gjelder først når en annen beslutningstaker bekrefter.`, `It has been requested that ${h.name} should not approve: «${h.exclusion_reason}». Takes effect only when another decision-maker confirms.`)}</p>}
              {r && <p style={small}>{L(`${nameOf(r.user_id)} er registrert som ${r.kind === 'verge' ? 'verge' : 'fullmektig'} (${r.basis}). `, `${nameOf(r.user_id)} is registered as ${r.kind === 'verge' ? 'guardian' : 'proxy'} (${r.basis}). `)}
                <strong>{r.verified_at ? L('Bekreftet av en annen beslutningstaker i Arvklart.', 'Confirmed by another decision-maker in Arvklart.') : L('Ubekreftet – kan ikke svare før en annen beslutningstaker bekrefter.', 'Unconfirmed – cannot respond until another decision-maker confirms.')}</strong>
                {r.verified_at && L(' Bekreftelsen betyr at familien godtar representasjonen. Arvklart har ikke kontrollert fullmakten eller vergemålet juridisk.', ' The confirmation means the family accepts the representation. Arvklart has not checked the power of attorney or guardianship legally.')}</p>}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {canConfirmRemoval && <button onClick={() => run(() => confirmDeciderRemoval(h.id), L('Bekreftet', 'Confirmed'))} disabled={busy} style={btn}>{L(`Bekreft at ${h.name} ikke skal godkjenne`, `Confirm that ${h.name} does not approve`)}</button>}
                {canVerify && <button onClick={() => run(() => verifyRepresentative(r.id), L('Representasjonen er bekreftet', 'The representation has been confirmed'))} disabled={busy} style={btn}>{L('Bekreft representasjonen', 'Confirm the representation')}</button>}
                {canRevoke && <button onClick={() => run(() => revokeRepresentative(r.id), L('Representasjonen er trukket', 'The representation has been withdrawn'))} disabled={busy} style={btn}>{L('Trekk representasjonen', 'Withdraw the representation')}</button>}
                {h.must_approve && self && !isDemo && !h.exclusion_requested_by && <button onClick={() => setAsking({ heirId: h.id, mode: 'self' })} style={btn}>{L('Jeg skal ikke godkjenne fordelingen', 'I will not approve the distribution')}</button>}
                {h.must_approve && isAdmin && !self && !isDemo && !h.exclusion_requested_by && <button onClick={() => setAsking({ heirId: h.id, mode: 'remove' })} style={btn}>{L('Be om at arvingen ikke skal godkjenne', 'Request that this heir does not approve')}</button>}
                {!h.must_approve && (isAdmin || self) && !isDemo && <button onClick={() => run(() => setMustApprove(h.id, true), L('Arvingen skal godkjenne fordelingen', 'The heir approves the distribution'))} disabled={busy} style={btn}>{L('Skal godkjenne fordelingen', 'Should approve the distribution')}</button>}
                {h.must_approve && isAdmin && !isDemo && !r && <button onClick={() => setAdding(h.id)} style={btn}>{L('Registrer representant', 'Register representative')}</button>}
              </div>

              {asking?.heirId === h.id && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <label htmlFor={`ex-${h.id}`} style={{ ...small, fontWeight: 600 }}>{L('Begrunnelse (vises for alle)', 'Reason (visible to everyone)')}</label>
                  <input id={`ex-${h.id}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={500} style={field} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button disabled={busy || reason.trim().length < 3} onClick={() => run(() => setMustApprove(h.id, false, reason), asking.mode === 'self' ? L('Du godkjenner ikke fordelingen', 'You do not approve the distribution') : L('Forespørselen er registrert. En annen beslutningstaker må bekrefte.', 'The request is registered. Another decision-maker must confirm.'))} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{L('Lagre', 'Save')}</button>
                    <button onClick={() => setAsking(null)} style={btn}>{L('Avbryt', 'Cancel')}</button>
                  </div>
                </div>
              )}
              {adding === h.id && (
                <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                  <label htmlFor={`rep-user-${h.id}`} style={{ ...small, fontWeight: 600 }}>{L('Hvem representerer arvingen?', 'Who represents the heir?')}</label>
                  <select id={`rep-user-${h.id}`} value={rep.user} onChange={e => setRep(r0 => ({ ...r0, user: e.target.value }))} style={field}>
                    <option value="">{L('Velg et medlem', 'Choose a member')}</option>
                    {members.filter(m => m.user_id !== h.user_id).map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
                  </select>
                  <label htmlFor={`rep-kind-${h.id}`} style={{ ...small, fontWeight: 600 }}>{L('Type', 'Type')}</label>
                  <select id={`rep-kind-${h.id}`} value={rep.kind} onChange={e => setRep(r0 => ({ ...r0, kind: e.target.value }))} style={field}>
                    <option value="fullmakt">{L('Fullmakt', 'Power of attorney')}</option>
                    <option value="verge">{L('Verge (f.eks. for mindreårig)', 'Guardian (e.g. for a minor)')}</option>
                  </select>
                  <label htmlFor={`rep-basis-${h.id}`} style={{ ...small, fontWeight: 600 }}>{L('Grunnlag (f.eks. skriftlig fullmakt datert …, eller vergemål)', 'Basis (e.g. written power of attorney dated …, or guardianship)')}</label>
                  <input id={`rep-basis-${h.id}`} value={rep.basis} onChange={e => setRep(r0 => ({ ...r0, basis: e.target.value }))} maxLength={1000} style={field} />
                  {rep.kind === 'verge' && <p style={small}>{L('For mindreårige gjelder egne regler for verge og eventuell interessekonflikt. Arvklart håndhever ikke dette.', 'Special rules apply to guardians of minors and possible conflicts of interest. Arvklart does not enforce these.')}</p>}
                  {rep.user === userId && <p style={{ ...small, color: '#8A4B2A' }}>{L('Du registrerer deg selv som representant. Det vises for alle og må bekreftes av en annen beslutningstaker.', 'You are registering yourself as representative. This is visible to everyone and must be confirmed by another decision-maker.')}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button disabled={busy || !rep.user || rep.basis.trim().length < 10} onClick={() => run(() => addRepresentative(h.id, rep.user, rep.kind, rep.basis), L('Representanten er registrert. En annen beslutningstaker må bekrefte.', 'The representative is registered. Another decision-maker must confirm.'))} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{L('Registrer', 'Register')}</button>
                    <button onClick={() => setAdding(null)} style={btn}>{L('Avbryt', 'Cancel')}</button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
