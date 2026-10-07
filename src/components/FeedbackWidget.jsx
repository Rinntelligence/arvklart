import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { L } from '../lib/lang'

export default function FeedbackWidget({ session, onToast }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('bug')
  const [content, setContent] = useState('')
  const [nps, setNps] = useState(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!content.trim() && nps === null) return
    setSending(true)
    const { error } = await supabase.from('feedback').insert({
      user_id: session?.user?.id || null,
      type, content: content.trim(), nps_score: nps,
    })
    setSending(false)
    if (error) { onToast?.(L('Kunne ikke sende tilbakemeldingen. Prøv igjen.', 'Could not send your feedback. Please try again.'), 'error'); return }
    setSent(true)
    setTimeout(() => { setOpen(false); setSent(false); setContent(''); setNps(null) }, 2000)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: '16px', right: '16px', zIndex: 9999,
        background: '#3A2F26', color: '#FBF9F5', border: 'none',
        borderRadius: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '7px 12px', cursor: 'pointer',
        fontSize: '13px', fontFamily: 'Karla, sans-serif',
      }}>💬</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 10000, display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: '16px 16px 0 0',
            padding: '24px', width: '100%',
            boxShadow: '0 -8px 32px rgba(0,0,0,0.15)',
            fontFamily: 'Karla, sans-serif',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>🙏</div>
                <div style={{ fontSize: '16px', color: '#3A2F26' }}>{L('Takk!', 'Thank you!')}</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: '18px', fontWeight: '400', color: '#3A2F26' }}>{L('Tilbakemelding', 'Feedback')}</h3>
                  <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: '24px', color: '#9C8267', cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                  {[['bug',L('🐛 Feil','🐛 Bug')],['idea',L('💡 Idé','💡 Idea')],['general',L('💬 Generelt','💬 General')]].map(([id,label]) => (
                    <button key={id} onClick={() => setType(id)} style={{
                      flex: 1, padding: '8px 4px',
                      border: `2px solid ${type===id?'#3A2F26':'#D9CFC0'}`,
                      borderRadius: '8px', cursor: 'pointer', fontSize: '12px',
                      background: type===id?'#3A2F26':'#fff',
                      color: type===id?'#FBF9F5':'#5C4530',
                      fontFamily: 'Karla, sans-serif',
                    }}>{label}</button>
                  ))}
                </div>
                <textarea value={content} onChange={e => setContent(e.target.value)}
                  placeholder={type==='bug'?L('Hva gikk galt?','What went wrong?'):type==='idea'?L('Hvilken funksjon mangler?','What feature is missing?'):L('Fortell oss hva du synes…','Tell us what you think…')}
                  rows={4} maxLength={2000} style={{
                    width: '100%', padding: '12px', border: '1px solid #D9CFC0',
                    borderRadius: '8px', fontSize: '15px', fontFamily: 'Karla, sans-serif',
                    background: '#FBF9F5', color: '#3A2F26', resize: 'none',
                    outline: 'none', boxSizing: 'border-box', marginBottom: '14px',
                  }} />
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '12px', color: '#9C8267', marginBottom: '6px' }}>{L('Anbefaler du Arvklart? (1-10)', 'Would you recommend Arvklart? (1-10)')}</div>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <button key={n} onClick={() => setNps(nps===n?null:n)} style={{
                        flex: 1, padding: '6px 0',
                        border: `1px solid ${nps===n?'#3A2F26':'#D9CFC0'}`,
                        borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
                        background: nps===n?'#3A2F26':'#fff',
                        color: nps===n?'#fff':'#5C4530',
                        fontFamily: 'Karla, sans-serif',
                      }}>{n}</button>
                    ))}
                  </div>
                </div>
                <button onClick={send} disabled={sending||(!content.trim()&&nps===null)} style={{
                  width: '100%', padding: '14px',
                  background: (content.trim()||nps!==null)?'#3A2F26':'#D9CFC0',
                  color: '#FBF9F5', border: 'none', borderRadius: '10px',
                  cursor: (content.trim()||nps!==null)?'pointer':'not-allowed',
                  fontSize: '15px', fontFamily: 'Karla, sans-serif',
                }}>{sending?L('Sender…','Sending…'):L('Send tilbakemelding','Send feedback')}</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
