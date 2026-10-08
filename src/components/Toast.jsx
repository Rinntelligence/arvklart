import { L } from '../lib/lang'

// Meldinger nederst på skjermen. Suksess forsvinner av seg selv; feil blir stående til brukeren
// lukker dem (WCAG 2.2.1) og leses opp med en gang (role="alert").
// --toast-offset: høyden på en fast bunnlinje (AddItemsPage), så meldingen ikke dekker knappene der.
export default function Toasts({ success, errors = [], onDismiss }) {
  if (!success && !errors.length) return null
  return (
    <div style={{
      position: 'fixed', bottom: 'calc(var(--toast-offset, 0px) + 24px)', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10001, display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center',
      width: 'max-content', maxWidth: 'calc(100vw - 32px)', fontFamily: 'Karla, sans-serif',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {errors.map(e => (
        <div key={e.id} role="alert" style={{ ...box, background: '#8B3A3A', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 6px 6px 18px' }}>
          <span style={{ flex: 1 }}>{e.msg}</span>
          <button onClick={() => onDismiss(e.id)} aria-label={L('Lukk feilmeldingen', 'Close the error message')} style={{
            minWidth: '44px', minHeight: '44px', background: 'none', border: 'none', color: '#FBF9F5',
            fontSize: '20px', lineHeight: 1, cursor: 'pointer', borderRadius: '8px',
          }}>×</button>
        </div>
      ))}
      {success && <div role="status" style={{ ...box, background: '#3A2F26', padding: '11px 28px' }}>{success.msg}</div>}
    </div>
  )
}

const box = {
  color: '#FBF9F5', borderRadius: '10px', fontSize: '15px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  textAlign: 'center', lineHeight: 1.45, animation: 'fadeUp 0.2s ease', maxWidth: '100%',
}
