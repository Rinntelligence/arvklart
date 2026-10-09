// Dialoger som deles av sidene for å legge til gjenstander: AI-samtykke og demo-melding.
import { L } from '../lib/lang'
import { demoFeatureMessage } from '../lib/demo'
import { Modal } from './UI'

// Demoen kan prøve AI-funksjonene, men ikke lagre eller bruke dem ubegrenset
export function DemoNotice({ onClose, onSignup }) {
  return (
    <Modal onClose={onClose} labelledBy="demo-notice-title" zIndex={300}>
        <h3 id="demo-notice-title" style={{ fontFamily: "'Fraunces', serif", fontSize: '1.1875rem', fontWeight: '400', color: '#3A2F26', marginBottom: '10px' }}>{L('Dette er en demo', 'This is a demo')}</h3>
        <p style={{ fontSize: '0.875rem', color: '#5C4530', lineHeight: 1.6, marginBottom: '22px' }}>{demoFeatureMessage()}</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={onClose} style={{ flex: '1 1 120px', padding: '11px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', color: '#5C4530', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Fortsett demoen', 'Continue the demo')}</button>
          <button onClick={onSignup} style={{ flex: '2 1 180px', padding: '11px', background: '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Opprett konto', 'Create an account')}</button>
        </div>
    </Modal>
  )
}

// Samtykke før noe sendes til AI-tjenesten (GDPR art. 6 nr. 1 a). Kan trekkes tilbake under «Min konto».
export function AiConsent({ onCancel, onAccept }) {
  return (
    <div style={{ marginTop: '10px', background: '#FBF9F5', border: '1px solid #D9CFC0', borderRadius: '10px', padding: '14px' }}>
      <div style={{ fontSize: '0.8125rem', color: '#3A2F26', fontWeight: '500', marginBottom: '6px' }}>{L('Opplysningene sendes til en AI-tjeneste', 'The information is sent to an AI service')}</div>
      <p style={{ fontSize: '0.75rem', color: '#5C4530', lineHeight: '1.6', marginBottom: '10px' }}>
        {L('For å identifisere og verdsette gjenstanden sendes bildet og beskrivelsen til Anthropic (USA). De brukes kun til dette og lagres ikke av dem. Du kan trekke samtykket tilbake under «Min konto». Les mer i vår', 'To identify and value the item, the photo and description are sent to Anthropic (USA). They are used only for this and are not stored by them. You can withdraw your consent under «My account». Read more in our')} <a href="/personvern" target="_blank" rel="noreferrer" style={{ color: '#5F6E52' }}>{L('personvernerklæring', 'privacy policy')}</a>.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '8px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif', color: '#5C4530' }}>{L('Avbryt', 'Cancel')}</button>
        <button onClick={onAccept} style={{ flex: 2, padding: '8px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'Karla, sans-serif' }}>{L('Godta og fortsett', 'Accept and continue')}</button>
      </div>
    </div>
  )
}
