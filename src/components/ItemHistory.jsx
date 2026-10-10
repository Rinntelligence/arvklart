import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { L, locale } from '../lib/lang'
import { eventText, makeNameOf } from '../lib/eventText'

// «Historikk»: det som er registrert om gjenstanden i fordelingsloggen (estate_events), nyeste først.
// Loggen kan ikke endres av noen i appen. refreshKey laster på nytt etter endringer på siden.
export default function ItemHistory({ itemId, members, refreshKey }) {
  const [events, setEvents] = useState(null)
  useEffect(() => {
    supabase.from('estate_events').select('id, kind, data, actor, created_at').eq('item_id', itemId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100)
      .then(({ data }) => setEvents(data || []))
  }, [itemId, refreshKey])
  if (!events?.length) return null
  const nameOf = makeNameOf(members)
  const when = t => new Date(t).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return (
    <details style={{ marginBottom: '24px', background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '10px', padding: '0 14px' }}>
      <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#5C4530', padding: '12px 0', minHeight: '44px', boxSizing: 'border-box' }}>
        {L('Historikk', 'History')} · {events.length}
      </summary>
      <ol style={{ listStyle: 'none', padding: '0 0 12px', margin: 0, display: 'grid', gap: '8px', fontFamily: 'Karla, sans-serif' }}>
        {events.map(e => (
          <li key={e.id} style={{ fontSize: '0.8125rem', color: '#3A2F26', lineHeight: 1.5 }}>
            {eventText(e, nameOf)}
            <span style={{ display: 'block', color: '#75604B', fontSize: '0.75rem' }}>{when(e.created_at)}</span>
          </li>
        ))}
      </ol>
    </details>
  )
}
