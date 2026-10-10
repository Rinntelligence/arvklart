import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getItems } from '../lib/supabase'
import { loadStatusExtras } from '../lib/decisions'
import { L } from '../lib/lang'
import { formatNOK } from '../lib/format'
import { itemValue } from '../lib/distribution'
import { summarizeDistribution, diffText } from '../lib/distributionSummary'
import { dispositionLabel } from '../lib/dispositionLabels'

// «Fordelingen»: oversikt slik den står nå – per arving, gjenstander ingen vil ha og det som ikke er avklart –
// og nedlasting av protokollen som utkast (PDF). Verdiutjevningen er beslutningsstøtte. Forslag og
// godkjenning kommer i F6.
export default function DistributionPage({ session, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    (async () => {
      const [{ data: items }, extras, { data: estate }] = await Promise.all([
        getItems(id), loadStatusExtras(id),
        supabase.from('estates').select('name, split_mode, shares_confirmed, status').eq('id', id).maybeSingle(),
      ])
      setData({ items: items || [], members: extras.members, heirs: extras.heirs, estate })
    })()
  }, [id])

  if (!data) return <div style={{ padding: '80px', textAlign: 'center', color: '#75604B', fontFamily: 'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>
  const s = summarizeDistribution(data)
  const notSettled = s.pending.length + s.unwanted.undecided.length

  const download = async () => {
    try {
      const { buildDistributionPdf } = await import('../lib/distributionPdf')
      const doc = buildDistributionPdf({ estateName: data.estate?.name, summary: s, kind: isDemo ? 'demo' : 'draft' })
      doc.save(`${L('fordeling-utkast', 'distribution-draft')}-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch {
      onToast(L('Kunne ikke lage PDF-en. Prøv igjen.', 'Could not create the PDF. Please try again.'), 'error')
    }
  }

  const card = { background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '16px', marginBottom: '12px' }
  const h2 = { fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 400, color: '#3A2F26', margin: '24px 0 10px' }
  const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 16px 64px', fontFamily: 'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#75604B', cursor: 'pointer', fontSize: '0.8125rem', padding: '0 0 16px', fontFamily: 'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.75rem', fontWeight: 400, color: '#3A2F26', marginBottom: '8px' }}>{L('Fordelingen', 'The distribution')}</h1>
      <p style={{ ...small, fontSize: '0.875rem', marginBottom: '16px' }}>
        {L('Slik står fordelingen nå. Verdiene er fordelingsverdiene dere har satt; verdiutjevningen er beslutningsstøtte, ikke en fasit. Alt er foreløpig til alle har godkjent fordelingen.',
          'This is how the distribution stands now. The values are the distribution values you have set; the value balance is decision support, not a final answer. Everything is provisional until everyone has approved the distribution.')}
      </p>

      <div role="status" style={{ ...card, background: notSettled ? '#FBF9F5' : '#DCE3D2', borderColor: notSettled ? '#D9CFC0' : '#B8C8A8' }}>
        <p style={{ ...small, color: '#3A2F26', fontWeight: 600 }}>
          {notSettled
            ? L(`${notSettled} ${notSettled === 1 ? 'gjenstand er' : 'gjenstander er'} ikke avklart ennå`, `${notSettled} ${notSettled === 1 ? 'item is' : 'items are'} not settled yet`)
            : L('Alle gjenstandene er avklart', 'All items are settled')}
        </p>
        <p style={small}>{L(`${s.itemCount} gjenstander i alt · ${formatNOK(s.totalKnown)} i fordelingsverdi tildelt`, `${s.itemCount} items in total · ${formatNOK(s.totalKnown)} in distribution value assigned`)}</p>
        <button onClick={download} style={{ marginTop: '10px', minHeight: '44px', padding: '8px 14px', background: '#fff', border: '1px solid #9A8B78', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', color: '#3A2F26' }}>
          {L('Last ned utkast (PDF)', 'Download draft (PDF)')}
        </button>
      </div>

      <h2 style={h2}>{L('Per arving', 'Per heir')}</h2>
      {!s.weighted && s.totalKnown > 0 && <p style={{ ...small, marginBottom: '10px' }}>{L('Sammenlignet med en lik andel. Arveandeler brukes bare når administrator har bekreftet dem under «Arvinger».', 'Compared with an equal share. Inheritance shares are only used when the administrator has confirmed them under «Heirs».')}</p>}
      {s.perHeir.map(h => (
        <section key={h.user_id} aria-label={h.name} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'baseline' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#3A2F26', margin: 0 }}>{h.name}</h3>
            <span style={{ fontFamily: 'Fraunces, serif', fontSize: '1.125rem', color: '#3A2F26' }}>{formatNOK(h.sum)}</span>
          </div>
          <p style={small}>
            {L(`${h.items.length} ${h.items.length === 1 ? 'gjenstand' : 'gjenstander'}`, `${h.items.length} ${h.items.length === 1 ? 'item' : 'items'}`)}
            {h.unknown > 0 && L(` · ${h.unknown} uten fordelingsverdi`, ` · ${h.unknown} without distribution value`)}
            {s.totalKnown > 0 && ` · ${diffText(h, s)}`}
          </p>
          {h.items.length > 0 && (
            <details style={{ marginTop: '6px' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: '#5C4530', minHeight: '44px', display: 'flex', alignItems: 'center' }}>{L('Vis gjenstandene', 'Show the items')}</summary>
              <ul style={{ ...small, paddingLeft: '18px' }}>
                {h.items.map(i => <li key={i.id}>{i.title} – {itemValue(i) === null ? L('uten fordelingsverdi', 'no distribution value') : formatNOK(itemValue(i))}</li>)}
              </ul>
            </details>
          )}
        </section>
      ))}

      <h2 style={h2}>{L('Ingen vil ha', 'No one wants')}</h2>
      <div style={card}>
        {['sell', 'donate', 'discard'].map(d => <p key={d} style={small}>{dispositionLabel(d)}: {s.unwanted[d].length}</p>)}
        <p style={small}>{L('Ikke bestemt', 'Not decided')}: {s.unwanted.undecided.length}</p>
        <button onClick={() => navigate(`/estate/${id}/ingen-vil-ha`)} style={{ marginTop: '8px', background: 'none', border: 'none', padding: 0, minHeight: '44px', color: '#5F6E52', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Gå til «Ingen vil ha»', 'Go to «No one wants»')}</button>
      </div>

      {s.pending.length > 0 && (
        <>
          <h2 style={h2}>{L('Ønsket, men ikke tildelt ennå', 'Wanted, but not assigned yet')}</h2>
          <div style={card}>
            <ul style={{ ...small, paddingLeft: '18px' }}>
              {s.pending.map(i => <li key={i.id}>{i.title} – {L(`ønskes av ${i.interests.length}`, `wanted by ${i.interests.length}`)}</li>)}
            </ul>
            <button onClick={() => navigate(`/estate/${id}/conflicts`)} style={{ marginTop: '8px', background: 'none', border: 'none', padding: 0, minHeight: '44px', color: '#5F6E52', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Gå til «Løsningsmetoder»', 'Go to «Resolution methods»')}</button>
          </div>
        </>
      )}
    </div>
  )
}
