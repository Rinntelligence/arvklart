import { useEffect, useState } from 'react'
import { listFounders, addFounder, removeFounder } from '../lib/founder'

// Feilkoder fra founder_add_founder / founder_remove_founder i databasen
const ERRORS = {
  user_not_found: 'Fant ingen konto med den e-posten. Personen må registrere seg i ArvKlart først.',
  already_founder: 'Personen er allerede founder.',
  cannot_remove_self: 'Du kan ikke fjerne deg selv.',
  not_authorized: 'Ingen tilgang. Logg inn på nytt og bekreft tofaktor.',
}
const errorText = (error) => ERRORS[Object.keys(ERRORS).find(k => error?.message?.includes(k))] || 'Noe gikk galt. Prøv igjen.'

const fmtDate = (d) => new Date(d).toLocaleDateString('nb-NO', { day:'numeric', month:'short', year:'numeric' })

export default function FounderManagement({ session, onToast }) {
  const [founders, setFounders] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data, error } = await listFounders()
    if (error) onToast?.(errorText(error), 'error')
    setFounders(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    const { error } = await addFounder(email)
    setBusy(false)
    if (error) return onToast?.(errorText(error), 'error')
    onToast?.(`${email.trim()} er lagt til som founder`)
    setEmail('')
    load()
  }

  const remove = async (f) => {
    if (!window.confirm(`Fjerne ${f.email} som founder? Personen mister tilgang til dashboardet med en gang.`)) return
    const { error } = await removeFounder(f.user_id)
    if (error) return onToast?.(errorText(error), 'error')
    onToast?.(`${f.email} er fjernet som founder`)
    load()
  }

  if (loading) return <div style={{ padding:'60px', textAlign:'center', color:'#75604B' }}>Laster founders…</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>
      <form onSubmit={add} style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', padding:'20px' }}>
        <h3 style={{ fontFamily:"'Fraunces', serif", fontSize:'16px', fontWeight:'400', color:'#3A2F26', marginBottom:'6px' }}>Legg til founder</h3>
        <p style={{ fontSize:'13px', color:'#75604B', lineHeight:'1.6', marginBottom:'14px' }}>
          Personen må ha en ArvKlart-konto. Neste gang de åpner /founder, må de sette opp tofaktor før de ser noe data.
        </p>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="navn@epost.no"
            style={{ flex:'1 1 220px', padding:'10px 14px', border:'1px solid #D9CFC0', borderRadius:'8px', fontSize:'14px', background:'#E8DFD0', color:'#3A2F26', fontFamily:'Karla, sans-serif' }}
          />
          <button type="submit" disabled={busy || !email.trim()} style={{
            padding:'10px 20px', border:'none', borderRadius:'8px', fontSize:'14px', fontFamily:'Karla, sans-serif',
            background: busy || !email.trim() ? '#D9CFC0' : '#3A2F26', color:'#FBF9F5',
            cursor: busy || !email.trim() ? 'not-allowed' : 'pointer',
          }}>{busy ? 'Legger til…' : 'Legg til'}</button>
        </div>
      </form>

      <div className="fd-table" style={{ background:'#fff', border:'1px solid #D9CFC0', borderRadius:'12px', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#FBF9F5', borderBottom:'1px solid #D9CFC0' }}>
              {['Founder','Tofaktor','Lagt til',''].map(h=>(
                <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:'12px', color:'#75604B', fontWeight:'500', textTransform:'uppercase', letterSpacing:'0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {founders.map((f,i)=>{
              const isMe = f.user_id === session?.user?.id
              return (
                <tr key={f.user_id} style={{ borderBottom: i<founders.length-1?'1px solid #E8DFD0':'none' }}>
                  <td style={{ padding:'12px 16px' }}>
                    <div style={{ fontSize:'14px', color:'#3A2F26' }}>{f.display_name || '—'}{isMe && <span style={{ color:'#75604B' }}> (deg)</span>}</div>
                    <div style={{ fontSize:'12px', color:'#75604B' }}>{f.email}</div>
                  </td>
                  <td style={{ padding:'12px 16px' }}>
                    <span style={{ fontSize:'11px', padding:'3px 8px', borderRadius:'20px', background:f.has_mfa?'#DCE3D2':'#E8DFD0', color:f.has_mfa?'#5F6E52':'#5C4530' }}>
                      {f.has_mfa ? 'Aktiv' : 'Ikke satt opp'}
                    </span>
                  </td>
                  <td style={{ padding:'12px 16px', fontSize:'13px', color:'#75604B' }}>
                    {fmtDate(f.created_at)}
                    {f.added_by_email && <div style={{ fontSize:'12px' }}>av {f.added_by_email}</div>}
                  </td>
                  <td style={{ padding:'12px 16px', textAlign:'right' }}>
                    {!isMe && (
                      <button onClick={() => remove(f)} style={{ fontSize:'12px', padding:'5px 12px', border:'1px solid #D9CFC0', borderRadius:'6px', background:'#fff', color:'#8B3A3A', cursor:'pointer', fontFamily:'Karla, sans-serif' }}>
                        Fjern
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
