import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { L } from '../lib/lang'
import { usePageData } from '../seo/pageData'
import { pageFor } from '../seo/registry'

// Mal for guidene (/guider/<slug>, innhold i content/guider/*.md). Teksten er forhåndsrendret i HTML-en ved bygging
// (src/seo/vitePlugin.js) og kommer hit via PageDataContext (src/seo/pageData.js), så nettleseren viser det samme.
// Guidene er på norsk; menyteksten følger språket. Ingen tekst fra brukere: HTML-en er laget av src/seo/markdown.js.
const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember']
// Datoen skrives av koden (ikke Intl), så serveren og nettleseren gir nøyaktig samme tekst
export const formatDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d}. ${MONTHS[m - 1]} ${y}` }
const RELOAD_KEY = 'hs_article_reload'

export default function ArticlePage() {
  const data = usePageData()
  const { pathname } = useLocation()
  const ready = data?.kind === 'guide' && data.path === pathname

  // Åpnet ved navigering i appen (uten innholdet i HTML-en): last siden fra serveren én gang
  useEffect(() => {
    if (ready) { try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* privat modus */ } return }
    try { if (sessionStorage.getItem(RELOAD_KEY) === pathname) return; sessionStorage.setItem(RELOAD_KEY, pathname) } catch { return }
    window.location.reload()
  }, [ready, pathname])

  if (!ready) {
    return <main style={{ padding: '80px 24px', fontFamily: 'Karla, sans-serif', color: '#75604B', textAlign: 'center' }}><p role="status">{L('Laster guiden …', 'Loading the guide …')}</p></main>
  }

  return (
    <>
      <style>{`
        .ga { --snow:#FBF9F5; --sand:#E8DFD0; --sandgray:#D9CFC0; --espresso:#3A2F26; --bark:#2A211A; --walnut:#5C4530; --latte-d:#75604B; --sage-d:#5F6E52;
          font-family: 'Karla', sans-serif; color: var(--espresso); background: var(--snow); min-height: 100vh; display: flex; flex-direction: column; }
        .ga a { color: var(--sage-d); }
        .ga header { background: var(--bark); padding: 20px 56px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .ga header img { display: block; height: 26px; }
        .ga header .back { font-size: 0.9062rem; font-weight: 500; color: var(--snow); text-decoration: none; padding: 8px 14px; border-radius: 999px; border: 1px solid rgba(251,249,245,0.45); }
        .ga header a:focus-visible { outline-color: var(--snow); }
        .ga main { flex: 1; width: 100%; max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }
        .ga .crumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; font-size: 0.875rem; color: var(--latte-d); margin-bottom: 28px; }
        .ga .crumbs li + li::before { content: '›'; margin-right: 6px; }
        .ga h1 { font-family: 'Fraunces', serif; font-weight: 400; font-size: clamp(1.875rem, 4vw, 2.5rem); line-height: 1.2; margin-bottom: 14px; }
        .ga .meta { font-size: 0.875rem; color: var(--latte-d); margin-bottom: 36px; }
        .ga .lead { font-size: 1.0625rem; line-height: 1.7; color: var(--walnut); margin-bottom: 28px; }
        .ga .body { font-size: 1.0625rem; line-height: 1.75; color: var(--walnut); }
        .ga .body h2 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 1.5rem; color: var(--espresso); margin: 40px 0 12px; line-height: 1.3; }
        .ga .body h3 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 1.1875rem; color: var(--espresso); margin: 28px 0 10px; }
        .ga .body p, .ga .body ul, .ga .body ol, .ga .body blockquote { margin-bottom: 18px; }
        .ga .body ul, .ga .body ol { padding-left: 24px; }
        .ga .body li { margin-bottom: 6px; }
        .ga .body blockquote { border-left: 3px solid var(--sandgray); padding: 4px 0 4px 16px; color: var(--latte-d); }
        .ga aside { margin-top: 44px; padding-top: 24px; border-top: 1px solid var(--sandgray); }
        .ga aside h2 { font-family: 'Fraunces', serif; font-weight: 400; font-size: 1.1875rem; margin-bottom: 10px; }
        .ga aside ul { padding-left: 20px; font-size: 0.9375rem; line-height: 1.7; color: var(--walnut); }
        .ga footer { background: var(--bark); padding: 28px 56px; display: flex; gap: 24px; flex-wrap: wrap; }
        .ga footer a { color: #B7A995; font-size: 0.875rem; text-decoration: none; }
        @media (max-width: 860px) { .ga header, .ga footer { padding-left: 20px; padding-right: 20px; } .ga main { padding-top: 32px; } }
      `}</style>
      <div className="ga">
        <header>
          <a href="/"><img src="/ARVKLART Horizontal Negative.svg" alt="Arvklart" /></a>
          <a className="back" href="/">{L('Til forsiden', 'To the home page')}</a>
        </header>
        <main>
          <nav className="crumbs" aria-label={L('Brødsmulesti', 'Breadcrumb')}>
            <ol>
              <li><a href="/">{L('Forside', 'Home')}</a></li>
              <li aria-current="page">{data.title}</li>
            </ol>
          </nav>
          <article>
            <h1>{data.title}</h1>
            <p className="meta">
              {data.author} · {L('Publisert', 'Published')} <time dateTime={data.published}>{formatDate(data.published)}</time>
              {data.updated && <> · {L('Oppdatert', 'Updated')} <time dateTime={data.updated}>{formatDate(data.updated)}</time></>}
            </p>
            <p className="lead">{data.description}</p>
            <div className="body" dangerouslySetInnerHTML={{ __html: data.html }} />
          </article>
          {data.sources?.length > 0 && (
            <aside aria-labelledby="kilder">
              <h2 id="kilder">{L('Kilder', 'Sources')}</h2>
              <ul>{data.sources.map(s => <li key={s.url}><a href={s.url}>{s.title}</a></li>)}</ul>
            </aside>
          )}
          {data.related?.length > 0 && (
            <aside aria-labelledby="les-ogsa">
              <h2 id="les-ogsa">{L('Les også', 'Read also')}</h2>
              <ul>{data.related.map(path => <li key={path}><a href={path}>{pageFor(path)?.title || path}</a></li>)}</ul>
            </aside>
          )}
        </main>
        <footer>
          <a href="/">{L('Forside', 'Home')}</a>
          <a href="/veiviser">{L('Veiviser', 'Guide')}</a>
          <a href="/kontakt">{L('Kontakt', 'Contact')}</a>
          <a href="/personvern">{L('Personvernerklæring', 'Privacy policy')}</a>
        </footer>
      </div>
    </>
  )
}
