import { useState } from 'react'
import { L } from '../lib/lang'
import { MAX_CORRECTION_LENGTH } from '../lib/aiCorrections'

// «Er det ekte sølv?»: vises når gjenstanden kan være sølv eller gull (preciousMetal i src/lib/valueAdvice.js) og
// familien ikke har svart. AI-en kan ikke se forskjell på ekte sølv og forsølvet på bilder: i kalibreringen ble et
// sølvbestikk kalt «forsølvet» og anslått 12 ganger for lavt. Svaret lagres som familiens rettelse av materialet
// (onAnswer får teksten, f.eks. «Sølv 830S, 166 g»), som går foran AI-forslaget også i verdianslaget.
// Svaret «vet ikke» lagres også, så spørsmålet ikke kommer igjen, men rådet om å sjekke stempelet gjelder fortsatt.
export default function MetalQuestion({ metal, onAnswer, disabled = false, idPrefix = 'metal' }) {
  const [stamped, setStamped] = useState(null) // 'silver' | 'gold' når familien har sagt at det har stempel
  const [stamp, setStamp] = useState('')
  const [grams, setGrams] = useState('')
  const [saving, setSaving] = useState(false)
  if (!metal) return null

  const gold = metal.kind === 'gold'
  const choices = metal.kind === 'precious' ? ['silver', 'gold'] : [gold ? 'gold' : 'silver']
  const metalName = k => (k === 'gold' ? L('Gull', 'Gold') : L('Sølv', 'Silver'))
  const answer = async text => {
    setSaving(true)
    try { await onAnswer(text.slice(0, MAX_CORRECTION_LENGTH)) } finally { setSaving(false) }
  }
  const saveStamped = e => {
    e.preventDefault()
    const g = grams.trim().replace(',', '.')
    const weight = /^\d+(\.\d+)?$/.test(g) && Number(g) > 0 ? `, ${grams.trim()} g` : ''
    const mark = stamp.trim() ? ` ${stamp.trim()}` : L(' med stempel', ' with hallmark')
    answer(`${metalName(stamped)}${mark}${weight}`)
  }

  const title = metal.kind === 'precious' ? L('Er det sølv eller gull?', 'Is it silver or gold?') : gold ? L('Er det ekte gull?', 'Is it real gold?') : L('Er det ekte sølv?', 'Is it real silver?')
  const btn = { minHeight: '44px', padding: '10px 14px', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', cursor: 'pointer', background: '#fff', color: '#3A2F26', border: '1px solid #9A8B78' }
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #9A8B78', borderRadius: '8px', background: '#fff', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26', minHeight: '44px' }
  const off = disabled || saving

  return (
    <section aria-labelledby={`${idPrefix}-title`} style={{ background: '#FBF9F5', border: '2px solid #A97C3F', borderRadius: '10px', padding: '12px 14px', margin: '8px 0 0', fontFamily: 'Karla, sans-serif', display: 'grid', gap: '8px' }}>
      <h4 id={`${idPrefix}-title`} style={{ margin: 0, fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: '1rem', color: '#3A2F26' }}>{title}</h4>
      <p style={{ margin: 0, fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6 }}>
        {L('Se etter et stempel, gjerne på baksiden eller undersiden: 830S, 925S eller «Sterling» for sølv, 14K, 18K, 585 eller 750 for gull. AI-en kan ikke se forskjell på ekte og forsølvet eller forgylt på bilder, og svaret ditt gjør verdianslaget sikrere.',
          'Look for a stamp, often on the back or underside: 830S, 925S or «Sterling» for silver, 14K, 18K, 585 or 750 for gold. The AI cannot tell real from plated in photos, and your answer makes the value estimate more reliable.')}
      </p>
      {stamped ? (
        <form onSubmit={saveStamped} style={{ display: 'grid', gap: '8px' }}>
          <label htmlFor={`${idPrefix}-stamp`} style={{ display: 'grid', gap: '4px', fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26' }}>
            {L('Hva står det i stempelet? (valgfritt)', 'What does the stamp say? (optional)')}
            <input id={`${idPrefix}-stamp`} value={stamp} maxLength={30} autoComplete="off" disabled={off} onChange={e => setStamp(e.target.value)}
              placeholder={stamped === 'gold' ? L('f.eks. 18K eller 750', 'e.g. 18K or 750') : L('f.eks. 830S eller 925S', 'e.g. 830S or 925S')} style={input} />
          </label>
          <label htmlFor={`${idPrefix}-grams`} style={{ display: 'grid', gap: '4px', fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26' }}>
            {L('Vekt i gram (valgfritt, kjøkkenvekt holder)', 'Weight in grams (optional, a kitchen scale will do)')}
            <input id={`${idPrefix}-grams`} value={grams} inputMode="decimal" maxLength={10} autoComplete="off" disabled={off} onChange={e => setGrams(e.target.value)} style={input} />
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="submit" disabled={off} style={{ ...btn, background: '#5F6E52', color: '#fff', border: 'none' }}>{saving ? L('Lagrer …', 'Saving …') : L('Lagre', 'Save')}</button>
            <button type="button" disabled={off} onClick={() => setStamped(null)} style={btn}>{L('Tilbake', 'Back')}</button>
          </div>
        </form>
      ) : (
        <div role="group" aria-labelledby={`${idPrefix}-title`} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {choices.map(k => (
            <button key={k} type="button" disabled={off} onClick={() => setStamped(k)} style={btn}>
              {k === 'gold' ? L('Gull, med stempel', 'Gold, with hallmark') : L('Sølv, med stempel', 'Silver, with hallmark')}
            </button>
          ))}
          <button type="button" disabled={off} onClick={() => answer(gold ? L('Forgylt', 'Gold-plated') : L('Forsølvet (plett)', 'Silver-plated'))} style={btn}>
            {gold ? L('Forgylt', 'Gold-plated') : L('Forsølvet eller plett', 'Silver-plated')}
          </button>
          <button type="button" disabled={off} onClick={() => answer(metal.kind === 'precious' ? L('Ukjent om det er sølv eller gull', 'Unknown whether it is silver or gold') : gold ? L('Ukjent om det er ekte gull', 'Unknown whether it is real gold') : L('Ukjent om det er ekte sølv', 'Unknown whether it is real silver'))} style={btn}>
            {L('Vet ikke', 'Don’t know')}
          </button>
        </div>
      )}
    </section>
  )
}
