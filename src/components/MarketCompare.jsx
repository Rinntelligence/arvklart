import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { L, locale } from '../lib/lang'
import { formatNOK } from '../lib/format'
import { hasAiConsent, giveAiConsent } from '../lib/aiConsent'
import { aiErrorMessage, requestItemEstimate, valuationRecord } from '../lib/itemAi'
import { PRICE_TYPES, emptyRecord, familyReferences, marketQuery, priceTypeLabel, searchLinks, withReference, withoutReference } from '../lib/marketRefs'
import { AiConsent } from './AiDialogs'

const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }
const btn = { padding: '10px 14px', minHeight: '44px', borderRadius: '8px', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', cursor: 'pointer', background: 'none', border: '1px solid #D9CFC0', color: '#5C4530' }
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #9A8B78', borderRadius: '8px', background: '#fff', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26', minHeight: '44px' }
const label = { display: 'grid', gap: '4px', fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26' }
const confidenceText = c => ({ high: L('høy', 'high'), medium: L('middels', 'medium'), low: L('lav', 'low') }[c] || '')
const dateText = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// «Sammenlign med markedet» på gjenstandssiden: søkelenker brukeren kan åpne selv, familiens egne
// sammenligninger (valgfritt) og verdianslaget fra estimate-value (markedsbasert med minst tre gode
// sammenligninger, ellers et veiledende AI-anslag). Sammenligninger og verdi kan endres av administrator og den
// som la inn gjenstanden (guard_item_update håndhever det samme).
export default function MarketCompare({ item, userId, canEdit, onChanged, onToast }) {
  const refs = familyReferences(item.ai_analysis)
  const links = searchLinks(marketQuery(item.ai_analysis, item.title))
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', price: '', price_type: 'sold_price', url: '', date: '' })
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [estimate, setEstimate] = useState(null) // svaret fra estimate-value
  const [askConsent, setAskConsent] = useState(false)

  // Endringer bygges på det som er lagret nå, så andre endringer i ai_analysis ikke går tapt
  const saveAnalysis = async (change, extra = {}) => {
    const { data, error } = await supabase.from('items').select('ai_analysis').eq('id', item.id).single()
    if (error) return { error }
    const next = change(data?.ai_analysis || emptyRecord())
    if (next.error) return next
    return supabase.from('items').update({ ai_analysis: next.record ?? next, ...extra }).eq('id', item.id)
  }

  const addReference = async (e) => {
    e.preventDefault()
    const check = withReference(item.ai_analysis, form, userId)
    if (check.error) { setFormError(check.error); return }
    setBusy(true)
    const { error } = await saveAnalysis(rec => withReference(rec, form, userId))
    setBusy(false)
    if (error) { setFormError(typeof error === 'string' ? error : L('Kunne ikke lagre. Prøv igjen.', 'Could not save. Please try again.')); return }
    setForm({ title: '', price: '', price_type: 'sold_price', url: '', date: '' })
    setFormError('')
    setAdding(false)
    setEstimate(null)
    onToast(L('Sammenligningen er lagt til', 'Comparison added'))
    onChanged()
  }

  const removeReference = async (id) => {
    setBusy(true)
    const { error } = await saveAnalysis(rec => withoutReference(rec, id))
    setBusy(false)
    if (error) { onToast(L('Kunne ikke fjerne. Prøv igjen.', 'Could not remove. Please try again.'), 'error'); return }
    setEstimate(null)
    onChanged()
  }

  const runEstimate = async (consented = hasAiConsent()) => {
    if (!consented) { setAskConsent(true); return }
    setBusy(true)
    try {
      setEstimate(await requestItemEstimate(item.id))
    } catch (e) {
      onToast(aiErrorMessage(e.code), 'error')
    }
    setBusy(false)
  }

  const applyEstimate = async () => {
    const d = estimate
    setBusy(true)
    const { error } = await saveAnalysis(rec => ({ ...rec, valuation: valuationRecord(d) }), {
      estimated_value: d.estimate.likely, estimate_reasoning: (d.explanation || d.reasoning || '').slice(0, 1000) || null, estimate_confidence: d.confidence,
    })
    setBusy(false)
    if (error) { onToast(L('Kunne ikke lagre verdien. Prøv igjen.', 'Could not save the value. Please try again.'), 'error'); return }
    onToast(L('Verdien er lagret', 'Value saved'))
    setEstimate(null)
    onChanged()
  }

  const isMarket = estimate?.method === 'market_sold' || estimate?.method === 'market_asking'
  const e = estimate?.status === 'ok' ? estimate.estimate : null

  return (
    <details style={{ marginBottom: '24px', background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '0 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#5C4530', padding: '12px 0', minHeight: '44px', boxSizing: 'border-box' }}>
        {L('Sammenlign med markedet', 'Compare with the market')}{refs.length ? ` · ${refs.length}` : ''}
      </summary>
      <div style={{ paddingBottom: '14px', display: 'grid', gap: '12px', fontFamily: 'Karla, sans-serif' }}>
        <p style={small}>
          {L('Valgfritt. Har dere funnet priser på tilsvarende gjenstander, kan dere legge dem inn her. Med tre eller flere av samme slag bygger verdianslaget på dem.',
            'Optional. If you have found prices for similar items, you can add them here. With three or more of the same kind, the value estimate is based on them.')}
        </p>

        {links.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {links.map(l => (
              <a key={l.provider} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={`${l.label} ${L('(åpnes i ny fane)', '(opens in a new tab)')}`}
                style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', color: '#3A2F26' }}>
                {l.label}<span aria-hidden="true">&nbsp;↗</span>
              </a>
            ))}
          </div>
        )}

        {refs.length > 0 && (
          <ul style={{ ...small, listStyle: 'none', padding: 0, display: 'grid', gap: '8px' }}>
            {refs.map(r => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: '#fff', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '8px 10px' }}>
                <span style={{ flex: '1 1 200px' }}>
                  {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3A2F26' }}>{r.title}</a> : <span style={{ color: '#3A2F26' }}>{r.title}</span>}
                  <br />{priceTypeLabel(r.price_type)} {formatNOK(r.price)}{r.date ? ` · ${dateText(r.date)}` : ''}
                </span>
                {canEdit && <button onClick={() => removeReference(r.id)} disabled={busy} aria-label={L(`Fjern «${r.title}»`, `Remove «${r.title}»`)} style={{ ...btn, color: '#8A4B2A' }}>{L('Fjern', 'Remove')}</button>}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (adding ? (
          <form onSubmit={addReference} style={{ display: 'grid', gap: '10px', background: '#fff', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '12px' }}>
            <label htmlFor="ref-title" style={label}>{L('Hva er det?', 'What is it?')}
              <input id="ref-title" value={form.title} maxLength={120} onChange={ev => setForm(f => ({ ...f, title: ev.target.value }))} placeholder={L('F.eks. «Figgjo Lotte tallerken, FINN»', 'E.g. «Figgjo Lotte plate, FINN»')} style={input} />
            </label>
            <label htmlFor="ref-type" style={label}>{L('Pristype', 'Price type')}
              <select id="ref-type" value={form.price_type} onChange={ev => setForm(f => ({ ...f, price_type: ev.target.value }))} style={input}>
                {PRICE_TYPES.map(t => <option key={t} value={t}>{priceTypeLabel(t)}</option>)}
              </select>
            </label>
            <label htmlFor="ref-price" style={label}>{L('Pris i kroner', 'Price in NOK')}
              <input id="ref-price" value={form.price} inputMode="numeric" onChange={ev => setForm(f => ({ ...f, price: ev.target.value }))} style={input} />
            </label>
            <label htmlFor="ref-url" style={label}>{L('Lenke (valgfri)', 'Link (optional)')}
              <input id="ref-url" type="url" value={form.url} onChange={ev => setForm(f => ({ ...f, url: ev.target.value }))} placeholder="https://" style={input} />
            </label>
            <label htmlFor="ref-date" style={label}>{L('Dato (valgfri)', 'Date (optional)')}
              <input id="ref-date" type="date" value={form.date} onChange={ev => setForm(f => ({ ...f, date: ev.target.value }))} style={input} />
            </label>
            {formError && <p role="alert" style={{ ...small, color: '#8A4B2A' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="submit" disabled={busy} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{L('Lagre sammenligningen', 'Save comparison')}</button>
              <button type="button" onClick={() => { setAdding(false); setFormError('') }} style={btn}>{L('Avbryt', 'Cancel')}</button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => setAdding(true)} style={btn}>{L('Legg til en sammenligning', 'Add a comparison')}</button>
            <button onClick={() => runEstimate()} disabled={busy} style={{ ...btn, color: '#3A2F26', fontWeight: 600 }}>{busy && !estimate ? L('Anslår…', 'Estimating…') : L('Anslå verdi', 'Estimate value')}</button>
          </div>
        ))}

        {askConsent && <AiConsent onCancel={() => setAskConsent(false)} onAccept={() => { giveAiConsent(); setAskConsent(false); runEstimate(true) }} />}

        {estimate?.status === 'insufficient' && (
          <p role="status" style={{ ...small, background: '#fff', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '10px' }}>
            {L('For lite informasjon til å anslå verdi.', 'Too little information to estimate a value.')}
            {estimate.missing?.length > 0 && <> {L('Dette kan hjelpe', 'This could help')}: {estimate.missing.join('; ')}.</>}
          </p>
        )}
        {e && (
          <div role="status" style={{ background: '#DCE3D2', border: '1px solid #B8C8A8', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '6px' }}>
            <div style={{ fontSize: '0.75rem', color: '#3A5A30', fontWeight: 600 }}>
              {isMarket ? L('Anslag ut fra sammenligningene', 'Estimate from the comparisons') : L('Veiledende AI-anslag, ikke en dokumentert markedsverdi', 'Indicative AI estimate, not a documented market value')}
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: '1.375rem', color: '#3A2F26' }}>{formatNOK(e.likely)}</div>
            <div style={{ ...small, color: '#3A5A30' }}>
              {estimate.range_kind === 'hits'
                ? L(`Spenn i ${estimate.stats?.n_used} treff: ${formatNOK(e.low)}–${formatNOK(e.high)}`, `Range in ${estimate.stats?.n_used} hits: ${formatNOK(e.low)}–${formatNOK(e.high)}`)
                : estimate.range_kind === 'p25_p75'
                  ? L(`Halvparten av treffene: ${formatNOK(e.low)}–${formatNOK(e.high)}`, `Half of the hits: ${formatNOK(e.low)}–${formatNOK(e.high)}`)
                  : L(`Mellom ${formatNOK(e.low)} og ${formatNOK(e.high)}`, `Between ${formatNOK(e.low)} and ${formatNOK(e.high)}`)}
              {' · '}{L('sikkerhet', 'confidence')}: {confidenceText(estimate.confidence)}
            </div>
            {(estimate.explanation || estimate.reasoning) && <p style={small}>{estimate.explanation || estimate.reasoning}</p>}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button onClick={applyEstimate} disabled={busy} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{L(`Bruk ${formatNOK(e.likely)} som verdi`, `Use ${formatNOK(e.likely)} as the value`)}</button>
              <button onClick={() => setEstimate(null)} style={btn}>{L('Lukk', 'Close')}</button>
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
