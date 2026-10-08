import { L } from '../lib/lang'
const CONTACT_EMAIL = 'admin@arvklart.no'

export default function ContactPage() {
  return (
    <>
      <style>{`
        .cp * { box-sizing: border-box; margin: 0; padding: 0; }
        .cp {
          --lin:#F7F3EC; --snow:#FBF9F5; --sand:#E8DFD0; --sandgray:#D9CFC0;
          --espresso:#3A2F26; --bark:#2A211A; --sage-d:#5F6E52; --text2:#7A6C5D;
          font-family: 'Karla', sans-serif; color: var(--espresso); background: var(--lin);
          min-height: 100vh; display: flex; flex-direction: column;
        }
        .cp a { color: inherit; text-decoration: none; }
        .cp header {
          background: var(--bark); padding: 24px 56px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .cp header img { display: block; height: 28px; }
        .cp header .back {
          font-size: 14.5px; font-weight: 500; color: var(--snow);
          padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(251,249,245,0.45);
        }
        .cp header .back:hover { background: rgba(251,249,245,0.15); }
        .cp main { flex: 1; padding: 110px 56px; max-width: 760px; margin: 0 auto; width: 100%; }
        .cp .eyebrow { font-size: 14px; color: var(--sage-d); margin-bottom: 20px; letter-spacing: 0.3px; }
        .cp h1 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 38px; line-height: 1.3; margin-bottom: 18px; }
        .cp .lead { font-size: 16px; line-height: 1.65; color: var(--text2); max-width: 520px; margin-bottom: 48px; }
        .cp .card {
          background: var(--snow); border: 1px solid var(--sandgray); border-radius: 12px;
          padding: 28px 32px;
        }
        .cp .card .label { font-size: 13px; color: var(--text2); margin-bottom: 8px; }
        .cp .card a.mail {
          font-family: 'Fraunces', serif; font-size: 24px; color: var(--espresso);
          border-bottom: 1px solid var(--sandgray); word-break: break-all;
        }
        .cp .card a.mail:hover { border-bottom-color: var(--espresso); }
        .cp footer { background: var(--bark); padding: 32px 56px; }
        .cp footer img { height: 22px; opacity: 0.85; }

        @media (max-width: 860px) {
          .cp header { padding: 20px 24px; }
          .cp main { padding: 64px 24px; }
          .cp h1 { font-size: 30px; }
          .cp .card { padding: 24px; }
          .cp .card a.mail { font-size: 20px; }
          .cp footer { padding: 28px 24px; text-align: center; }
        }
      `}</style>

      <div className="cp">
        <header>
          <a href="/home"><img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" /></a>
          <a className="back" href="/home">{L('Til forsiden', 'To the home page')}</a>
        </header>

        <main>
          <div className="eyebrow">{L('Kontakt', 'Contact')}</div>
          <h1>{L('Ta kontakt med oss', 'Get in touch')}</h1>
          <p className="lead">
            {L(
              'Har du spørsmål om Arvklart, trenger hjelp med et bo eller vil gi oss tilbakemelding? Send oss en e-post.',
              'Do you have questions about Arvklart, need help with an estate or want to give us feedback? Send us an email.',
            )}
          </p>

          <div className="card">
            <div className="label">{L('E-post', 'Email')}</div>
            <a className="mail" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </div>
        </main>

        <footer>
          <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
        </footer>
      </div>
    </>
  )
}
