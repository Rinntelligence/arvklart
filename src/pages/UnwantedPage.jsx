import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getItems } from '../lib/supabase'
import { loadStatusExtras } from '../lib/decisions'
import { decidingMembers } from '../lib/estateProgress'
import { L } from '../lib/lang'
import { DISPOSITIONS, dispositionAction, dispositionLabel, setDispositions, unwantedItems } from '../lib/disposition'

// «Ingen vil ha»: hva familien vil gjøre med gjenstandene ingen ønsker – selge, gi bort eller kaste.
// Administrator velger (set_dispositions, logges); alle ser valgene. Valgene er foreløpige til alle har
// godkjent fordelingen. Et gammelt kastemerke er ikke et vedtak og vises bare som en merknad.
export default function UnwantedPage({ session, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [passes, setPasses] = useState([])
  const [deciders, setDeciders] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [closed, setClosed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [{ data: its }, extras, { data: mem }, { data: est }] = await Promise.all([
      getItems(id), loadStatusExtras(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).maybeSingle(),
      supabase.from('estates').select('status').eq('id', id).maybeSingle(),
    ])
    setItems(unwantedItems(its || []))
    setPasses(extras.passes)
    setDeciders(decidingMembers(extras.members, extras.heirs))
    setIsAdmin(mem?.role === 'admin')
    setClosed(est?.status === 'closed')
    setLoading(false)
  }
  useEffect(() => { load() }, [id])

  const choose = async (values, okText) => {
    setBusy(true)
    const { error } = await setDispositions(id, values)
    setBusy(false)
    if (error) { onToast(L('Kunne ikke lagre valget. Prøv igjen.', 'Could not save the choice. Please try again.'), 'error'); return }
    onToast(okText)
    load()
  }

  const canChoose = isAdmin && !closed
  const everyonePassed = item => deciders.length > 0 && deciders.every(m => passes.some(p => p.item_id === item.id && p.user_id === m.user_id))
  const undecided = items.filter(i => !i.disposition)
  const btn = (active) => ({ minHeight: '44px', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif',
    background: active ? '#3A2F26' : '#fff', color: active ? '#FBF9F5' : '#3A2F26', border: `1px solid ${active ? '#3A2F26' : '#9A8B78'}` })

  if (loading) return <div style={{ padding: '80px', textAlign: 'center', color: '#75604B', fontFamily: 'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '28px 16px 64px', fontFamily: 'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#75604B', cursor: 'pointer', fontSize: '0.8125rem', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.625rem', fontWeight: 400, color: '#3A2F26', marginBottom: '8px' }}>{L('Ingen vil ha', 'No one wants')}</h1>
      <p style={{ color: '#5C4530', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '20px' }}>
        {L('Bestem sammen hva som skal skje med gjenstandene ingen av dere ønsker. Valgene er foreløpige til alle har godkjent fordelingen.',
          'Decide together what happens to the items none of you want. The choices are provisional until everyone has approved the distribution.')}
        {!canChoose && ' ' + L('Administratoren registrerer valgene.', 'The administrator records the choices.')}
      </p>

      {items.length === 0 ? (
        <p style={{ color: '#75604B', fontStyle: 'italic' }}>{L('Ingen gjenstander står uten noen som ønsker dem.', 'There are no items that nobody wants.')}</p>
      ) : (
        <>
          {canChoose && undecided.length > 1 && (
            <div role="group" aria-label={L('Samme valg for alle som ikke er bestemt', 'Same choice for all that are not decided')} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px', fontSize: '0.875rem', color: '#3A2F26' }}>
              <span>{L(`Samme for alle ${undecided.length} som ikke er bestemt:`, `Same for all ${undecided.length} not decided:`)}</span>
              {DISPOSITIONS.map(d => (
                <button key={d} disabled={busy} onClick={() => choose(undecided.map(i => ({ item_id: i.id, disposition: d })), L('Valget er registrert for alle', 'The choice has been recorded for all'))} style={btn(false)}>{dispositionAction(d)}</button>
              ))}
            </div>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
            {items.map(item => (
              <li key={item.id} style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <button onClick={() => navigate(`/estate/${id}/item/${item.id}`)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600, color: '#3A2F26', fontFamily: 'Karla, sans-serif', textAlign: 'left' }}>{item.title}</button>
                  <span style={{ fontSize: '0.8125rem', color: item.disposition ? '#3A5A30' : '#75604B' }}>{dispositionLabel(item.disposition)}{item.disposition ? ` (${L('foreløpig', 'provisional')})` : ''}</span>
                </div>
                {!everyonePassed(item) && <p style={{ fontSize: '0.75rem', color: '#75604B', margin: '4px 0 0' }}>{L('Ikke alle har tatt stilling ennå – noen kan fortsatt ønske den.', 'Not everyone has decided yet – someone may still want it.')}</p>}
                {item.marked_for_disposal && !item.disposition && <p style={{ fontSize: '0.75rem', color: '#75604B', margin: '4px 0 0' }}>{L('Tidligere merket for kast. Det er ikke et vedtak; velg sammen.', 'Previously marked for discarding. That is not a decision; choose together.')}</p>}
                {canChoose && (
                  <div role="group" aria-label={L(`Hva skal skje med ${item.title}?`, `What happens to ${item.title}?`)} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {[...DISPOSITIONS, null].map(d => (
                      <button key={d || 'later'} disabled={busy} aria-pressed={item.disposition === d || (!item.disposition && !d)}
                        onClick={() => choose([{ item_id: item.id, disposition: d }], L('Valget er registrert', 'The choice has been recorded'))}
                        style={btn(item.disposition === d || (!item.disposition && !d))}>{dispositionAction(d)}</button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
