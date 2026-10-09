import { L } from '../lib/lang'
import { conditionLabel, confidenceLabel, splitIdentification } from '../lib/analysisView'

// «Hva AI-en så»: AI-ens vurdering av bildene, adskilt i det familien har rettet, det som er lest direkte,
// det som er sannsynlig og det som er ukjent. Bare til opplysning; brukerens egne felt endres ikke herfra.
// Rettelsene gjøres med AiCorrectionsForm.
export default function AnalysisDetails({ analysis, headingLevel = 3, heading = true }) {
  const ai = analysis?.ai
  if (!ai) return null
  const { corrected, observed, probable, unknown } = splitIdentification(ai, analysis.corrections)
  const H = `h${headingLevel}`
  const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }
  const sub = { fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26', margin: '10px 0 2px' }
  const list = { ...small, paddingLeft: '18px' }
  const row = x => <li key={x.field}><b style={{ fontWeight: 600 }}>{x.label}:</b> {x.value}{x.evidence ? <span style={{ color: '#75604B' }}> – {x.evidence}</span> : null}</li>

  return (
    <section style={{ fontFamily: 'Karla, sans-serif' }}>
      {heading && <H style={{ fontSize: '0.875rem', fontWeight: 600, color: '#3A2F26', margin: '0 0 4px' }}>{L('Hva AI-en så', 'What the AI saw')}</H>}
      <p style={{ ...small, color: '#75604B' }}>{L('AI-forslag, ikke fasit. Det du selv har fylt inn gjelder.', 'AI suggestions, not facts. What you have filled in applies.')}</p>

      {corrected.length > 0 && <><p style={sub}>{L('Rettet av familien', 'Corrected by the family')}</p><ul style={list}>{corrected.map(x =>
        <li key={x.field}><b style={{ fontWeight: 600 }}>{x.label}:</b> {x.value ?? <span style={{ color: '#75604B' }}>{L('ukjent eller ikke aktuelt', 'unknown or not applicable')}</span>}</li>)}</ul></>}
      {observed.length > 0 && <><p style={sub}>{L('Sett på bildet', 'Seen in the photo')}</p><ul style={list}>{observed.map(row)}</ul></>}
      {probable.length > 0 && <><p style={sub}>{L('Sannsynlig', 'Probable')}</p><ul style={list}>{probable.map(row)}</ul></>}
      {unknown.length > 0 && <p style={{ ...small, marginTop: '8px' }}><b style={{ fontWeight: 600 }}>{L('Ukjent', 'Unknown')}:</b> {unknown.join(', ').toLocaleLowerCase()}</p>}

      {ai.marks?.length > 0 && <>
        <p style={sub}>{L('Merker og stempler', 'Marks and stamps')}</p>
        <ul style={list}>{ai.marks.map((m, i) => <li key={i}>{[m.text && `«${m.text}»`, m.where].filter(Boolean).join(' – ')}</li>)}</ul>
      </>}

      <p style={sub}>{L('Tilstand', 'Condition')}</p>
      <p style={small}>
        {L('AI-forslag', 'AI suggestion')}: {conditionLabel(ai.condition_suggestion)}
        {ai.condition_suggestion !== 'unknown' && confidenceLabel(ai.condition_confidence) ? ` (${confidenceLabel(ai.condition_confidence)})` : ''}
      </p>
      {ai.condition_observations?.length > 0 && <ul style={list}>{ai.condition_observations.map((o, i) => <li key={i}>{o}</li>)}</ul>}
      {ai.condition_not_visible?.length > 0 && <p style={small}>{L('Kunne ikke ses', 'Could not be seen')}: {ai.condition_not_visible.join('; ')}</p>}

      {ai.photo_suggestions?.length > 0 && <>
        <p style={sub}>{L('Bilder som kan gjøre vurderingen sikrere', 'Photos that could make the assessment more certain')}</p>
        <ul style={list}>{ai.photo_suggestions.map((p, i) => <li key={i}>{p.reason}</li>)}</ul>
      </>}
    </section>
  )
}
