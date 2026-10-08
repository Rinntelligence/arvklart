export default function Toast({ msg, type = 'success' }) {
  return (
    <div role="status" style={{
      // --toast-offset: høyden på en fast bunnlinje (AddItemsPage), så meldingen ikke dekker knappene der
      position: 'fixed', bottom: 'calc(var(--toast-offset, 0px) + 28px)', left: '50%', transform: 'translateX(-50%)',
      background: type === 'error' ? '#8B3A3A' : '#3A2F26',
      color: '#FBF9F5', padding: '11px 28px', borderRadius: '10px',
      fontSize: '14px', zIndex: 10001, boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
      fontFamily: 'Karla, sans-serif', textAlign: 'center',
      width: 'max-content', maxWidth: 'calc(100vw - 32px)', lineHeight: 1.45,
      animation: 'fadeUp 0.2s ease',
    }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {msg}
    </div>
  )
}
