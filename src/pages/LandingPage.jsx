import { useState } from 'react'
import { signIn } from '../lib/supabase'

const DEMO_EMAIL = 'mona.demo@heirsplit.no'
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || ''

export default function LandingPage() {
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')

  const handleDemo = async () => {
    setDemoLoading(true)
    setDemoError('')
    const { error } = await signIn(DEMO_EMAIL, DEMO_PASSWORD)
    if (error) {
      console.error('Demo login error:', error.message)
      setDemoLoading(false)
      setDemoError('Demo er ikke tilgjengelig akkurat nå. Sjekk at VITE_DEMO_PASSWORD er satt riktig.')
      return
    }
    window.open('/', '_blank')
    setDemoLoading(false)
  }

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
        .lp { font-family: 'Karla', sans-serif; color: var(--espresso); background: var(--lin); }
        .lp .serif { font-family: 'Fraunces', serif; font-weight: 400; }
        .lp a { color: inherit; text-decoration: none; }

        .lp header {
          position: absolute; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 28px 56px;
        }
        .lp .logo img { display: block; height: 28px; }
        .lp nav ul { display: flex; gap: 38px; list-style: none; }
        .lp nav a { font-size: 14.5px; color: var(--snow); opacity: 0.92; }
        .lp nav a:hover { opacity: 1; text-decoration: underline; text-underline-offset: 4px; }

        .lp .hero {
          position: relative; min-height: 92vh;
          display: flex; align-items: center; justify-content: center;
          background-image:
            linear-gradient(180deg, rgba(42,33,26,0) 0%, rgba(42,33,26,0.08) 45%, rgba(42,33,26,0.6) 75%, rgba(42,33,26,0.9) 100%),
            url('/hero-bg.jpg');
          background-size: cover; background-position: center;
        }
        .lp .hero-inner {
          position: relative; z-index: 2;
          max-width: 640px; text-align: left;
          padding: 0 56px 80px;
        }
        .lp .hero-inner h1 {
          font-size: 42px; line-height: 1.28; color: var(--snow); margin-bottom: 14px;
          font-weight: 400; font-family: 'Fraunces', serif;
        }
        .lp .hero-inner .subline {
          font-size: 16px; line-height: 1.6; color: var(--snow); opacity: 0.9;
          max-width: 480px; margin-bottom: 38px;
        }
        .lp .hero-cta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
        .lp .btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 15px 30px; font-size: 15px; font-family: 'Karla', sans-serif;
          font-weight: 500; cursor: pointer; border: none;
        }
        .lp .btn-fill { background: var(--snow); color: var(--espresso); }
        .lp .btn-fill:hover { background: var(--sand); }
        .lp .btn-fill:disabled { opacity: 0.7; cursor: wait; }
        .lp .btn-line { color: var(--snow); background: none; border-bottom: 1px solid rgba(251,249,245,0.5); padding: 15px 4px; }
        .lp .btn-line:hover { border-bottom-color: var(--snow); }

        .lp .intro { padding: 120px 56px; max-width: 760px; margin: 0 auto; text-align: left; }
        .lp .eyebrow { font-size: 14px; color: var(--sage-d); margin-bottom: 20px; letter-spacing: 0.3px; }
        .lp .intro h2 { font-size: 34px; line-height: 1.35; color: var(--espresso); font-weight: 400; font-family: 'Fraunces', serif; }
        .lp .intro h2 em { font-style: normal; color: var(--text2); }

        .lp .features { background: var(--sand); padding: 110px 56px; }
        .lp .features-head { max-width: 640px; margin: 0 auto 76px; }
        .lp .features-head h2 { font-size: 32px; font-weight: 400; line-height: 1.3; font-family: 'Fraunces', serif; }
        .lp .feature-grid {
          max-width: 1080px; margin: 0 auto;
          display: grid; grid-template-columns: repeat(3,1fr); gap: 0;
        }
        .lp .feature { padding: 0 34px 0 0; }
        .lp .feature + .feature { border-left: 1px solid var(--sandgray); padding-left: 34px; }
        .lp .feature .num { font-family: 'Fraunces', serif; font-size: 15px; color: var(--sage-d); margin-bottom: 22px; }
        .lp .feature h3 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 21px; margin-bottom: 14px; }
        .lp .feature p { font-size: 14.5px; line-height: 1.65; color: var(--text2); }

        .lp .demo-section {
          background: var(--espresso); color: var(--snow);
          padding: 130px 56px; text-align: center;
        }
        .lp .demo-section .eyebrow { color: var(--sage-l); margin-bottom: 18px; }
        .lp .demo-section h2 {
          font-family: 'Fraunces', serif; font-weight: 300; font-size: 36px;
          line-height: 1.35; max-width: 580px; margin: 0 auto 16px;
        }
        .lp .demo-section p {
          font-size: 15px; color: rgba(251,249,245,0.75); max-width: 440px;
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
        .lp .demo-title { font-family: 'Fraunces', serif; font-size: 18px; color: var(--espresso); margin-bottom: 4px; }
        .lp .demo-sub { font-size: 12px; color: var(--coffee); margin-bottom: 22px; }
        .lp .demo-conflict {
          border: 1px solid var(--sandgray); border-radius: 10px;
          padding: 18px 20px; margin-bottom: 12px;
          display: flex; justify-content: space-between; align-items: center;
          background: var(--lin);
        }
        .lp .demo-conflict-left h4 { font-size: 14px; color: var(--espresso); margin-bottom: 3px; }
        .lp .demo-conflict-left span { font-size: 12px; color: var(--coffee); }
        .lp .demo-badge {
          font-size: 11px; padding: 4px 10px; border-radius: 20px;
          background: var(--sage-mist); color: var(--sage-d);
        }
        .lp .demo-badge.orange { background: #F5E8D5; color: #A97C3F; }

        footer.lp-footer {
          background: var(--bark); color: var(--sand); padding: 56px;
          display: flex; align-items: center; justify-content: space-between;
        }
        footer.lp-footer img { height: 24px; opacity: 0.85; }
        footer.lp-footer .foot-links { display: flex; gap: 32px; list-style: none; }
        footer.lp-footer .foot-links a { font-size: 13.5px; color: #B7A995; }
        footer.lp-footer .foot-links a:hover { color: var(--snow); }

        @media (max-width: 860px) {
          .lp header { padding: 22px 24px; }
          .lp nav ul { gap: 20px; }
          .lp .hero-inner { padding: 0 24px 64px; }
          .lp .hero-inner h1 { font-size: 28px; }
          .lp .intro { padding: 76px 24px; }
          .lp .features { padding: 76px 24px; }
          .lp .feature-grid { grid-template-columns: 1fr; gap: 44px; }
          .lp .feature + .feature { border-left: none; padding-left: 0; border-top: 1px solid var(--sandgray); padding-top: 44px; }
          .lp .demo-section { padding: 90px 24px; }
          .lp .demo-mockup { margin: 40px 0 0; }
          footer.lp-footer { flex-direction: column; gap: 26px; text-align: center; }
        }
      `}</style>

      <div className="lp">
        {/* NAV */}
        <header>
          <div className="logo">
            <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
          </div>
          <nav>
            <ul>
              <li><a href="#slik-fungerer">Slik fungerer det</a></li>
              <li><a href="#for-hvem">For hvem</a></li>
              <li><a href="#demo" onClick={(e) => { e.preventDefault(); document.getElementById('demo').scrollIntoView({ behavior: 'smooth' }) }}>Prøv demo</a></li>
              <li><a href="/estate/guide">Veiviser</a></li>
              <li><a href="/logg-inn">Logg inn</a></li>
            </ul>
          </nav>
        </header>

        {/* HERO */}
        <section className="hero">
          <div className="hero-inner">
            <h1>Arvefordeling gjort enklere og inkluderende</h1>
            <div className="subline">Så struktur og ro kan verne om det som betyr mest</div>
            <div className="hero-cta">
              <button
                className="btn btn-fill"
                onClick={handleDemo}
                disabled={demoLoading}
              >
                {demoLoading ? 'Logger inn…' : 'Test ut demo nå'}
              </button>
              <a className="btn btn-line" href="#slik-fungerer">Se hvordan det fungerer</a>
            </div>
            {demoError && <div style={{ marginTop: '12px', fontSize: '13px', color: '#F5C2C2', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: '6px', maxWidth: '400px' }}>{demoError}</div>}
          </div>
        </section>

        {/* INTRO */}
        <section className="intro" id="for-hvem">
          <div className="eyebrow">Hvorfor Arvklart</div>
          <h2>Vi hjelper deg med det. <em>Så dere kan bruke tiden på hverandre, ikke på regneark og misforståelser.</em></h2>
        </section>

        {/* FEATURES */}
        <section className="features" id="slik-fungerer">
          <div className="features-head">
            <div className="eyebrow">Slik fungerer det</div>
            <h2>Én rolig, tydelig vei gjennom en vanskelig prosess.</h2>
          </div>
          <div className="feature-grid">
            <div className="feature">
              <div className="num">01</div>
              <h3 className="serif">Rettferdig, ikke bare likt</h3>
              <p>En felles, forståelig måte å komme fram til fordelinger alle kan stå bak — uten at noen må regne det ut selv.</p>
            </div>
            <div className="feature">
              <div className="num">02</div>
              <h3 className="serif">Alt samlet på ett sted</h3>
              <p>Testament, skjøter og verdivurderinger ligger trygt og oversiktlig, tilgjengelig for dem som skal ha det.</p>
            </div>
            <div className="feature">
              <div className="num">03</div>
              <h3 className="serif">Rom til å snakke sammen</h3>
              <p>Et nøytralt sted å ta opp det som er vanskelig å si rundt middagsbordet — før eller etter at det skjer.</p>
            </div>
          </div>
        </section>

        {/* DEMO */}
        <section className="demo-section" id="demo">
          <div className="eyebrow">Test ut demo</div>
          <h2>Se hvordan Arvklart gjør arvefordeling enklere — uten å måtte registrere deg</h2>
          <p>Utforsk oversikten, interesseregistrering og fordeling i en ferdig oppsatt familie. Ingen konto nødvendig.</p>
          <button
            className="btn btn-fill"
            onClick={handleDemo}
            disabled={demoLoading}
            style={{ margin: '0 auto' }}
          >
            {demoLoading ? 'Logger inn…' : 'Åpne demo'}
          </button>
          {demoError && <div style={{ marginTop: '14px', fontSize: '13px', color: '#F5C2C2', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: '6px', display: 'inline-block' }}>{demoError}</div>}

          <div className="demo-mockup">
            <div className="demo-topbar">
              <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
            </div>
            <div className="demo-body">
              <div className="demo-title">Fam. Hansen sitt bo</div>
              <div className="demo-sub">12 gjenstander · 4 arvinger</div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>Bestemors gyngestol</h4>
                  <span>Erik og Mona er interesserte</span>
                </div>
                <span className="demo-badge orange">Avventer</span>
              </div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>Antikk eiketresbord</h4>
                  <span>Tildelt Mona</span>
                </div>
                <span className="demo-badge">Avklart</span>
              </div>
              <div className="demo-conflict">
                <div className="demo-conflict-left">
                  <h4>Mahognibokhylle</h4>
                  <span>Lars er eneste interesserte</span>
                </div>
                <span className="demo-badge">Avklart</span>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" />
          <ul className="foot-links">
            <li><a href="#">Om oss</a></li>
            <li><a href="#">For advokater og meklere</a></li>
            <li><a href="/personvern">Personvernerklæring</a></li>
            <li><a href="/personvern#vilkar">Vilkår for bruk</a></li>
            <li><a href="mailto:hei@arvklart.no">Kontakt</a></li>
          </ul>
        </footer>
      </div>
    </>
  )
}
