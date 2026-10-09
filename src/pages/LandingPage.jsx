import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startDemoSession } from '../lib/demo'
import { L, isEn, setLang } from '../lib/lang'

// Språkbytte for besøkende som ikke er innlogget (innloggede bytter i TopBar)
const toggleLang = (e) => {
  e.preventDefault()
  setLang(isEn() ? 'no' : 'en')
  window.location.reload()
}
const langLabel = () => (isEn() ? 'Norsk' : 'English')

export default function LandingPage({ loggedIn = false }) {
  const navigate = useNavigate()
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  // Innloggede (også demoen) går rett til appen; ellers startes en demo-økt i samme fane.
  const handleDemo = async () => {
    if (loggedIn) { navigate('/'); return }
    setDemoLoading(true)
    setDemoError('')
    const { error } = await startDemoSession()
    if (error) {
      console.error('Demo login error:', error.message)
      setDemoLoading(false)
      setDemoError(L('Demoen er ikke tilgjengelig akkurat nå. Prøv igjen om litt.', 'The demo is not available right now. Please try again shortly.'))
      return
    }
    navigate('/')
  }
  const demoLabel = (idle) => demoLoading ? L('Åpner demo…', 'Opening the demo…') : loggedIn ? L('Gå til mine bo', 'Go to my estates') : idle

  return (
    <>
      <style>{`
        :root {
          --lin:#F7F3EC; --snow:#FBF9F5; --sand:#E8DFD0; --sandgray:#D9CFC0;
          --latte:#C9AE8E; --coffee:#9C8267; --chestnut:#7A6146; --walnut:#5C4530;
          --espresso:#3A2F26; --bark:#2A211A;
          --sage-mist:#DCE3D2; --sage-l:#A8B598; --sage:#8B9A7D; --sage-d:#5F6E52;
          --text2:#7A6C5D;
        }
        .lp * { box-sizing: border-box; margin: 0; padding: 0; }
        .lp { position: relative; font-family: 'Karla', sans-serif; color: var(--espresso); background: var(--lin); }
        .lp .serif { font-family: 'Fraunces', serif; font-weight: 400; }
        .lp a { color: inherit; text-decoration: none; }
        .lp.logged-in section { scroll-margin-top: 56px; }

        .lp header {
          position: absolute; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 24px 56px 40px;
          background: linear-gradient(180deg, rgba(42,33,26,0.72) 0%, rgba(42,33,26,0.4) 60%, rgba(42,33,26,0) 100%);
        }
        .lp .logo img { display: block; height: 28px; filter: drop-shadow(0 1px 4px rgba(0,0,0,0.45)); }
        .lp nav ul { display: flex; gap: 6px; list-style: none; align-items: center; }
        .lp nav a {
          display: inline-block; padding: 8px 14px; border-radius: 999px;
          font-size: 0.9062rem; font-weight: 500; color: var(--snow);
          text-shadow: 0 1px 4px rgba(0,0,0,0.55);
          border: 1px solid transparent;
          transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
        }
        .lp nav a:hover, .lp nav a:focus-visible {
          background: rgba(251,249,245,0.2); border-color: rgba(251,249,245,0.45);
        }
        .lp nav a:focus-visible { outline: 3px solid var(--snow); outline-offset: 2px; }
        .lp nav a.nav-login { border-color: rgba(251,249,245,0.7); margin-left: 8px; }
        .lp nav a.nav-login:hover, .lp nav a.nav-login:focus-visible {
          background: var(--snow); color: var(--espresso); text-shadow: none; border-color: var(--snow);
        }
        .lp .nav-toggle { display: none; }

        .lp .hero {
          position: relative; min-height: 92vh;
          display: flex; align-items: flex-end; justify-content: flex-start;
          background-image:
            linear-gradient(90deg, rgba(42,33,26,0.78) 0%, rgba(42,33,26,0.55) 35%, rgba(42,33,26,0.12) 65%, rgba(42,33,26,0) 100%),
            linear-gradient(180deg, rgba(42,33,26,0) 0%, rgba(42,33,26,0) 40%, rgba(42,33,26,0.45) 70%, rgba(42,33,26,0.85) 100%),
            url('/hero-bg.jpg');
          background-size: cover; background-position: center;
        }
        .lp .hero-inner {
          position: relative; z-index: 2;
          max-width: 720px; text-align: left;
          padding: 0 56px 96px;
        }
        .lp .hero-inner h1 {
          font-size: clamp(32px, 4.2vw, 54px); line-height: 1.12; letter-spacing: -0.5px;
          color: var(--snow); margin-bottom: 20px;
          font-weight: 400; font-family: 'Fraunces', serif;
          text-shadow: 0 2px 18px rgba(0,0,0,0.35);
        }
        .lp .hero-inner .subline {
          font-size: clamp(17px, 1.4vw, 19px); line-height: 1.55; color: var(--snow);
          max-width: 520px; margin-bottom: 40px;
          text-shadow: 0 1px 10px rgba(0,0,0,0.4);
        }
        .lp .hero-cta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .lp .btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 15px 30px; font-size: 0.9375rem; font-family: 'Karla', sans-serif;
          font-weight: 500; cursor: pointer; border: none;
        }
        .lp .btn-fill { background: var(--snow); color: var(--espresso); }
        .lp .btn-fill:hover { background: var(--sand); }
        .lp .btn-fill:disabled { opacity: 0.7; cursor: wait; }
        .lp .btn-line { color: var(--snow); background: none; border-bottom: 1px solid rgba(251,249,245,0.5); padding: 15px 4px; }
        .lp .btn-line:hover { border-bottom-color: var(--snow); }

        .lp .intro { padding: 120px 56px; max-width: 760px; margin: 0 auto; text-align: left; }
        .lp .eyebrow { font-size: 0.875rem; color: var(--sage-d); margin-bottom: 20px; letter-spacing: 0.3px; }
        .lp .intro h2 { font-size: 2.125rem; line-height: 1.35; color: var(--espresso); font-weight: 400; font-family: 'Fraunces', serif; }
        .lp .intro h2 em { font-style: normal; color: var(--text2); }

        .lp .features { background: var(--sand); padding: 110px 56px; }
        .lp .features-head { max-width: 640px; margin: 0 auto 76px; }
        .lp .features-head h2 { font-size: 2rem; font-weight: 400; line-height: 1.3; font-family: 'Fraunces', serif; }
        .lp .feature-grid {
          max-width: 1080px; margin: 0 auto;
          display: grid; grid-template-columns: repeat(3,1fr); gap: 0;
        }
        .lp .feature { padding: 0 34px 0 0; }
        .lp .feature + .feature { border-left: 1px solid var(--sandgray); padding-left: 34px; }
        .lp .feature .num { font-family: 'Fraunces', serif; font-size: 0.9375rem; color: var(--sage-d); margin-bottom: 22px; }
        .lp .feature h3 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 1.3125rem; margin-bottom: 14px; }
        .lp .feature p { font-size: 0.9062rem; line-height: 1.65; color: var(--text2); }

        .lp .demo-section {
          background: var(--espresso); color: var(--snow);
          padding: 130px 56px; text-align: center;
        }
        .lp .demo-section .eyebrow { color: var(--sage-l); margin-bottom: 18px; }
        .lp .demo-section h2 {
          font-family: 'Fraunces', serif; font-weight: 300; font-size: 2.25rem;
          line-height: 1.35; max-width: 580px; margin: 0 auto 16px;
        }
        .lp .demo-section p {
          font-size: 0.9375rem; color: rgba(251,249,245,0.75); max-width: 440px;
          margin: 0 auto 40px; line-height: 1.65;
        }
        .lp .demo-mockup {
          max-width: 720px; margin: 56px auto 0;
          background: var(--snow); border-radius: 12px;
          overflow: hidden; text-align: left;
          box-shadow: 0 24px 64px rgba(0,0,0,0.35);
        }
        .lp .demo-topbar {
          background: #3A2F26; padding: 12px 20px;
          display: flex; align-items: center; gap: 10px;
        }
        .lp .demo-topbar img { height: 22px; }
        .lp .demo-body { padding: 28px 28px 32px; }
        .lp .demo-title { font-family: 'Fraunces', serif; font-size: 1.125rem; color: var(--espresso); margin-bottom: 4px; }
        .lp .demo-sub { font-size: 0.75rem; color: var(--coffee); margin-bottom: 22px; }
        .lp .demo-conflict {
          border: 1px solid var(--sandgray); border-radius: 10px;
          padding: 18px 20px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: center;
          background: var(--lin);
        }
        .lp .demo-conflict-left h4 { font-size: 0.875rem; color: var(--espresso); margin-bottom: 3px; }
        .lp .demo-conflict-left span { font-size: 0.75rem; color: var(--coffee); }
        .lp .demo-badge {
          font-size: 0.6875rem; padding: 4px 10px; border-radius: 20px;
          background: var(--sage-mist); color: var(--sage-d);
        }
        .lp .demo-badge.orange { background: #F5E8D5; color: #A97C3F; }

        footer.lp-footer {
          background: var(--bark); color: var(--sand); padding: 56px;
          display: flex; align-items: center; justify-content: space-between;
        }
        footer.lp-footer img { height: 24px; opacity: 0.85; }
        footer.lp-footer .foot-links { display: flex; gap: 32px; list-style: none; }
        footer.lp-footer .foot-links a { font-size: 0.8438rem; color: #B7A995; }
        footer.lp-footer .foot-links a:hover { color: var(--snow); }

        @media (max-width: 860px) {
          .lp header { padding: 22px 24px; }
          .lp nav ul { gap: 2px; flex-wrap: wrap; justify-content: flex-end; }
          .lp nav a { padding: 6px 10px; font-size: 0.8438rem; }
          .lp .hero { background-position: 60% center; }
          .lp .hero-inner { padding: 0 24px 56px; }
          .lp .intro { padding: 76px 24px; }
          .lp .features { padding: 76px 24px; }
          .lp .feature-grid { grid-template-columns: 1fr; gap: 44px; }
          .lp .feature + .feature { border-left: none; padding-left: 0; border-top: 1px solid var(--sandgray); padding-top: 44px; }
          .lp .demo-section { padding: 90px 24px; }
          .lp .demo-mockup { margin: 40px 0 0; }
          footer.lp-footer { flex-direction: column; gap: 26px; text-align: center; }
          footer.lp-footer .foot-links { flex-wrap: wrap; justify-content: center; gap: 12px 24px; }
          footer.lp-footer .foot-links a { white-space: nowrap; }
        }

        /* Mobil: lenkene samles i en meny, «Logg inn» står alltid synlig */
        @media (max-width: 640px) {
          .lp header { padding: 16px 16px 32px; }
          .lp nav { display: flex; align-items: center; gap: 8px; }
          .lp nav ul {
            display: none; position: absolute; top: 64px; left: 16px; right: 16px;
            flex-direction: column; align-items: stretch; gap: 0; padding: 6px;
            background: var(--espresso); border: 1px solid rgba(251,249,245,0.18);
            border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.35);
          }
          .lp header.nav-open nav ul { display: flex; }
          .lp nav ul li.nav-login-item { display: none; }
          .lp nav ul a { display: block; padding: 13px 14px; font-size: 0.9375rem; border-radius: 10px; text-shadow: none; }
          .lp nav > a.nav-login { display: inline-block; margin-left: 0; }
          .lp .nav-toggle {
            display: inline-flex; align-items: center; justify-content: center;
            width: 40px; height: 40px; border-radius: 999px; cursor: pointer;
            background: none; border: 1px solid rgba(251,249,245,0.45); color: var(--snow);
            font-size: 1.125rem; line-height: 1;
          }
        }
        @media (min-width: 641px) {
          .lp nav > a.nav-login { display: none; }
        }
      `}</style>

      <div className={loggedIn ? 'lp logged-in' : 'lp'}>
        {/* NAV — når innlogget ligger lenkene i TopBar i stedet */}
        {!loggedIn && <header className={navOpen ? 'nav-open' : ''}>
          <div className="logo">
            <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
          </div>
          <nav>
            <a className="nav-login" href="/logg-inn">{L('Logg inn', 'Log in')}</a>
            <button className="nav-toggle" aria-expanded={navOpen} aria-label={L('Meny', 'Menu')} onClick={() => setNavOpen(o => !o)}>
              {navOpen ? '✕' : '☰'}
            </button>
            <ul onClick={() => setNavOpen(false)}>
              <li><a href="#slik-fungerer">{L('Slik fungerer det', 'How it works')}</a></li>
              <li><a href="#for-hvem">{L('For hvem', 'Who it is for')}</a></li>
              <li><a href="#demo" onClick={(e) => { e.preventDefault(); document.getElementById('demo').scrollIntoView({ behavior: 'smooth' }) }}>{L('Prøv demo', 'Try the demo')}</a></li>
              <li><a href="/veiviser">{L('Veiviser', 'Guide')}</a></li>
              <li><a href="#" onClick={toggleLang} lang={isEn() ? 'no' : 'en'}>{langLabel()}</a></li>
              <li className="nav-login-item"><a className="nav-login" href="/logg-inn">{L('Logg inn', 'Log in')}</a></li>
            </ul>
          </nav>
        </header>}

        {/* HERO */}
        <section className="hero">
          <div className="hero-inner">
            <h1>{L('Arvefordeling gjort enklere og inkluderende', 'Inheritance distribution made simpler and more inclusive')}</h1>
            <div className="subline">{L('Så struktur og ro kan verne om det som betyr mest', 'So that structure and calm can protect what matters most')}</div>
            <div className="hero-cta">
              <button
                className="btn btn-fill"
                onClick={handleDemo}
                disabled={demoLoading}
              >
                {demoLabel(L('Test ut demo nå', 'Try the demo now'))}
              </button>
              <a className="btn btn-line" href="#slik-fungerer">{L('Se hvordan det fungerer', 'See how it works')}</a>
            </div>
            {demoError && <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: '#F5C2C2', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: '6px', maxWidth: '400px' }}>{demoError}</div>}
          </div>
        </section>

        {/* INTRO */}
        <section className="intro" id="for-hvem">
          <div className="eyebrow">{L('Hvorfor Arvklart', 'Why Arvklart')}</div>
          <h2>{L('Vi hjelper deg med det.', 'We help you with it.')} <em>{L('Så dere kan bruke tiden på hverandre, ikke på regneark og misforståelser.', 'So you can spend your time on each other, not on spreadsheets and misunderstandings.')}</em></h2>
        </section>

        {/* FEATURES */}
        <section className="features" id="slik-fungerer">
          <div className="features-head">
            <div className="eyebrow">{L('Slik fungerer det', 'How it works')}</div>
            <h2>{L('Én rolig, tydelig vei gjennom en vanskelig prosess.', 'One calm, clear path through a difficult process.')}</h2>
          </div>
          <div className="feature-grid">
            <div className="feature">
              <div className="num">01</div>
              <h3 className="serif">{L('Rettferdig, ikke bare likt', 'Fair, not just equal')}</h3>
              <p>{L('En felles, forståelig måte å komme fram til fordelinger alle kan stå bak — uten at noen må regne det ut selv.', 'A shared, understandable way to reach a distribution everyone can stand behind — without anyone having to work it out themselves.')}</p>
            </div>
            <div className="feature">
              <div className="num">02</div>
              <h3 className="serif">{L('Alt samlet på ett sted', 'Everything in one place')}</h3>
              <p>{L('Testament, skjøter og verdivurderinger ligger trygt og oversiktlig, tilgjengelig for dem som skal ha det.', 'Wills, deeds and valuations are kept safe and organised, available to those who need them.')}</p>
            </div>
            <div className="feature">
              <div className="num">03</div>
              <h3 className="serif">{L('Rom til å snakke sammen', 'Room to talk together')}</h3>
              <p>{L('Et nøytralt sted å ta opp det som er vanskelig å si rundt middagsbordet — før eller etter at det skjer.', 'A neutral place to raise what is hard to say around the dinner table — before or after it happens.')}</p>
            </div>
          </div>
        </section>

        {/* DEMO */}
        <section className="demo-section" id="demo">
          <div className="eyebrow">{L('Test ut demo', 'Try the demo')}</div>
          <h2>{L('Se hvordan Arvklart gjør arvefordeling enklere — uten å måtte registrere deg', 'See how Arvklart makes inheritance distribution simpler — without signing up')}</h2>
          <p>{L('Utforsk oversikten, interesseregistrering og fordeling i en ferdig oppsatt familie. Ingen konto nødvendig.', 'Explore the overview, interest registration and distribution in a ready-made family. No account needed.')}</p>
          <button
            className="btn btn-fill"
            onClick={handleDemo}
            disabled={demoLoading}
            style={{ margin: '0 auto' }}
          >
            {demoLabel(L('Åpne demo', 'Open the demo'))}
          </button>
          {demoError && <div style={{ marginTop: '14px', fontSize: '0.8125rem', color: '#F5C2C2', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: '6px', display: 'inline-block' }}>{demoError}</div>}

          <div className="demo-mockup">
            <div className="demo-topbar">
              <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
            </div>
            <div className="demo-body">
              <div className="demo-title">{L('Fam. Hansen sitt bo', 'The Hansen family estate')}</div>
              <div className="demo-sub">{L('12 gjenstander · 4 arvinger', '12 items · 4 heirs')}</div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>{L('Bestemors gyngestol', "Grandmother's rocking chair")}</h4>
                  <span>{L('Erik og Mona er interesserte', 'Erik and Mona are interested')}</span>
                </div>
                <span className="demo-badge orange">{L('Avventer', 'Pending')}</span>
              </div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>{L('Antikk eiketresbord', 'Antique oak table')}</h4>
                  <span>{L('Tildelt Mona', 'Assigned to Mona')}</span>
                </div>
                <span className="demo-badge">{L('Avklart', 'Settled')}</span>
              </div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>{L('Mahognibokhylle', 'Mahogany bookcase')}</h4>
                  <span>{L('Lars er eneste interesserte', 'Lars is the only one interested')}</span>
                </div>
                <span className="demo-badge">{L('Avklart', 'Settled')}</span>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
          <ul className="foot-links">
            <li><a href="/personvern">{L('Personvernerklæring', 'Privacy policy')}</a></li>
            <li><a href="/personvern#vilkar">{L('Vilkår for bruk', 'Terms of use')}</a></li>
            <li><a href="/kontakt">{L('Kontakt', 'Contact')}</a></li>
            <li><a href="#" onClick={toggleLang} lang={isEn() ? 'no' : 'en'}>{langLabel()}</a></li>
          </ul>
        </footer>
      </div>
    </>
  )
}
