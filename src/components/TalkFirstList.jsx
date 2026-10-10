import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { L } from '../lib/lang'
import { removeInterest } from '../lib/supabase'
import { addInterestClearingPass } from '../lib/decisions'

// «Snakk sammen først» (K4): gjenstandene flere ønsker, med begrunnelsene side om side. Hver arving kan trekke
// sitt eget ønske så de andre kan få den, og angre. Ingen kan trekke andres ønske. Alt logges av databasen.
// allItems: alle gjenstander i boet, så en gjenstand man nettopp har trukket ønsket fra (og som ikke lenger
// er omstridt) fortsatt vises med «Angre».
// withdrawn/setWithdrawn kan styres av siden, så angringen overlever at lista blir tom.
export default function TalkFirstList({ items, allItems = [], nameOf, myUserId, estateId, onChanged, onToast, withdrawn: w0, setWithdrawn: sw0 }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [own, setOwn] = useState({}) // itemId → begrunnelse, til angring
  const withdrawn = w0 ?? own
  const setWithdrawn = sw0 ?? setOwn

  const withdraw = async (item, reason) => {
    setBusy(true)
    const { error } = await removeInterest(item.id, myUserId)
    setBusy(false)
    if (error) { onToast(L('Kunne ikke trekke ønsket. Prøv igjen.', 'Could not withdraw your wish. Please try again.'), 'error'); return }
    setWithdrawn(w => ({ ...w, [item.id]: reason || '' }))
    onToast(L('Du har trukket ønsket ditt', 'You have withdrawn your wish'))
    onChanged()
  }
  const undo = async (itemId) => {
    setBusy(true)
    const { error } = await addInterestClearingPass(itemId, myUserId, withdrawn[itemId] || '')
    setBusy(false)
    if (error) { onToast(L('Kunne ikke angre. Gjenstanden kan allerede være tildelt.', 'Could not undo. The item may already be assigned.'), 'error'); return }
    setWithdrawn(w => { const n = { ...w }; delete n[itemId]; return n })
    onChanged()
  }

  const small = { fontSize: '0.8125rem', color: '#5C4530', lineHeight: 1.6, margin: 0 }
  const btn = { padding: '8px 14px', minHeight: '40px', background: '#fff', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', color: '#5C4530' }

  return (
    <section aria-labelledby="talk-first" style={{ fontFamily: 'Karla, sans-serif', marginBottom: '24px' }}>
      <h2 id="talk-first" style={{ fontFamily: 'Fraunces, serif', fontSize: '1.25rem', fontWeight: 400, color: '#3A2F26', margin: '0 0 6px' }}>{L('Snakk sammen først', 'Talk first')}</h2>
      <p style={{ ...small, marginBottom: '14px' }}>
        {L('Se hvorfor hver enkelt ønsker gjenstandene. Kanskje noen vil la en annen få en av dem. Det som fortsatt ønskes av flere, fordeles etterpå med en metode alle kan godta.',
          'See why each of you wants the items. Perhaps someone will let another have one. What several still want is divided afterwards with a method everyone can accept.')}
      </p>
      <div style={{ display: 'grid', gap: '12px' }}>
        {[...items, ...allItems.filter(i => withdrawn[i.id] !== undefined && !items.some(x => x.id === i.id))].map(item => {
          const mine = item.interests?.find(x => x.user_id === myUserId)
          return (
            <article key={item.id} style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '14px 16px' }}>
              <h3 style={{ fontSize: '0.9375rem', color: '#3A2F26', fontWeight: 600, margin: '0 0 10px' }}>{item.title}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '8px' }}>
                {(item.interests || []).map(x => (
                  <li key={x.user_id} style={{ background: '#FBF9F5', border: '1px solid #E8DFD0', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3A2F26' }}>{x.user_id === myUserId ? L('Du', 'You') : nameOf(x.user_id)}</div>
                    <p style={{ ...small, fontStyle: x.reason ? 'italic' : 'normal', color: x.reason ? '#5C4530' : '#75604B' }}>
                      {x.reason ? `«${x.reason}»` : L('Ingen begrunnelse ennå', 'No reason yet')}
                    </p>
                  </li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                {mine && <button onClick={() => withdraw(item, mine.reason)} disabled={busy} style={btn}>{L('Trekk ønsket mitt', 'Withdraw my wish')}</button>}
                {withdrawn[item.id] !== undefined && !mine && <button onClick={() => undo(item.id)} disabled={busy} style={btn}>{L('Angre: legg inn ønsket igjen', 'Undo: add my wish again')}</button>}
                <button onClick={() => navigate(`/estate/${estateId}/item/${item.id}#kommentarer`)} style={{ ...btn, border: 'none', textDecoration: 'underline' }}>{L('Kommenter', 'Comment')}</button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
