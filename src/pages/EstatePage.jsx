import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEstateData } from '../hooks/useEstateData'
import { buildRemainingSteps } from '../lib/estateProgress'
import { overviewCounts, recommendation, overviewGroups } from '../lib/estateOverview'
import { darkCss } from '../lib/estateThemeCss'
import { L, locale } from '../lib/lang'
import { APP_HOME } from '../lib/routes'

// Oversikten i et bo. Den svarer bare på «hva vil du gjøre?»:
//  1. Hvor langt boet har kommet (én linje).
//  2. «Anbefalt nå»: det viktigste for denne brukeren akkurat nå, med én knapp.
//  3. Fire nedtrekksgrupper (Gjenstander, Fordeling, Arvinger, Praktisk) med lenker videre til egne sider.
// Gjenstandene med bilder, søk, filter og analyse ligger på /estate/:id/gjenstander (EstateItemsPage).
// Hva som vises for administrator, arving og demo, bestemmes i src/lib/estateOverview.js.
export default function EstatePage({ session, isDemo }) {
  const { id } = useParams()
  const userId = session.user.id
  const { loading, estate, items, myRole, extras, proposal } = useEstateData(id, userId, { withProgress: true })
  const [openGroups, setOpenGroups] = useOpenGroups(id)

  if (loading) return <Message>{L('Laster…', 'Loading…')}</Message>
  if (!estate) return <Message>{L('Fant ikke boet. Det kan være slettet, eller du er ikke medlem.', 'Estate not found. It may have been deleted, or you are not a member.')}</Message>

  const isAdmin = myRole === 'admin'
  const counts = overviewCounts({ items, userId, extras })
  const steps = extras ? buildRemainingSteps({ estateId: id, userId, items, ...extras, proposal }) : null
  const next = recommendation({ estateId: id, estate, counts, steps, isAdmin, isDemo })
  const groups = overviewGroups({ estateId: id, counts, steps, isAdmin, isDemo })
  const progress = counts.total ? Math.round(counts.assigned / counts.total * 100) : 0

  return (
    <div className="bo-mork">
      <style>{darkCss}</style>
      <div className="bo-side">
        {/* Demoen har bare ett bo, og kan ikke administreres (notForDemo i App.jsx) */}
        {!isDemo && (
          <div className="bo-topplinje">
            <Link to={APP_HOME} className="bo-lenke">{L('← Alle bo', '← All estates')}</Link>
            {isAdmin && <Link to={`/estate/${id}/admin`} className="bo-lenke">{L('Administrer boet', 'Manage the estate')}</Link>}
          </div>
        )}

        <header className="bo-hode">
          <h1>{estate.name}</h1>
          {estate.description && <p className="bo-dempet">{estate.description}</p>}
          <p className="bo-status">
            {counts.total > 0 && <span className="bo-spor" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>}
            <span>
              {counts.total > 0
                ? L(`${counts.assigned} av ${counts.total} gjenstander fordelt`, `${counts.assigned} of ${counts.total} items distributed`)
                : L('Ingen gjenstander ennå', 'No items yet')}
              {counts.members !== null && ` · ${counts.members} ${counts.members === 1 ? L('medlem', 'member') : L('medlemmer', 'members')}`}
            </span>
          </p>
        </header>

        {estate.status === 'closed' && (
          <p className="bo-melding">
            {L('Boet er avsluttet', 'This estate is closed')}
            {estate.closed_at && ` (${new Date(estate.closed_at).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })})`}.{' '}
            {L('Det oppbevares med bilder og dokumenter til det slettes. Det finnes ingen automatisk sletting; administratoren kan be Arvklart slette boet.', 'It is kept with its photos and documents until it is deleted. There is no automatic deletion; the administrator can ask Arvklart to delete the estate.')}
          </p>
        )}

        {next && (
          <section className="bo-anbefalt" aria-labelledby="anbefalt-tittel">
            <div className="tekst">
              <span className="bo-etikett">{L('Anbefalt nå', 'Recommended now')}</span>
              <h2 id="anbefalt-tittel">{next.title}</h2>
              {next.text && <p>{next.text}</p>}
            </div>
            <Link to={next.path} className="bo-knapp messing">{next.action} →</Link>
          </section>
        )}

        <section aria-labelledby="valg-tittel">
          <h2 id="valg-tittel" className="bo-seksjonstittel">{L('Hva vil du gjøre?', 'What do you want to do?')}</h2>
          <div className="bo-grupper">
            {groups.map(group => (
              <details key={group.key} className="bo-gruppe" open={!!openGroups[group.key]}
                onToggle={e => setOpenGroups(group.key, e.currentTarget.open)}>
                <summary>
                  <span className="bo-ikon" aria-hidden="true">{ICONS[group.key]}</span>
                  <span>
                    <span className="tittel">{group.title}</span>
                    <span className="beskrivelse">{group.desc}</span>
                  </span>
                  <span className="bo-hint">{group.hint}</span>
                  <Chevron />
                </summary>
                <ul className="bo-valg">
                  {group.links.map(link => (
                    <li key={link.key}>
                      <Link to={link.path}>
                        <span>
                          <span className="navn">{link.title}</span>
                          <span className="forklaring">{link.desc}</span>
                        </span>
                        <Count link={link} />
                        <span className="til" aria-hidden="true">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// Tallet til høyre på en lenke: uthevet når noe venter på deg, ellers nøytralt
function Count({ link }) {
  if (link.badge > 0) return <span className="bo-tall venter">{link.badge}</span>
  if (link.countLabel) return <span className="bo-tall noytral">{link.countLabel}</span>
  if (link.count !== undefined && link.count !== null) return <span className="bo-tall noytral">{link.count}</span>
  return <span />
}

// Hvilke grupper som er åpne, husket i fanen per bo. «Gjenstander» er åpen første gang.
function useOpenGroups(estateId) {
  const key = `bo_grupper_${estateId}`
  const [open, setOpen] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key)) || { gjenstander: true } } catch { return { gjenstander: true } }
  })
  const set = (group, isOpen) => setOpen(prev => {
    if (!!prev[group] === isOpen) return prev
    const next = { ...prev, [group]: isOpen }
    try { sessionStorage.setItem(key, JSON.stringify(next)) } catch { /* privat modus: huskes ikke */ }
    return next
  })
  return [open, set]
}

function Message({ children }) {
  return (
    <div className="bo-mork">
      <style>{darkCss}</style>
      <p role="status" className="bo-dempet" style={{ padding: '80px 16px', textAlign: 'center' }}>{children}</p>
    </div>
  )
}

function Chevron() {
  return <svg className="bo-pil" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
}

const icon = path => <svg viewBox="0 0 24 24" fill="none" stroke="#F2EEE6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">{path}</svg>
const ICONS = {
  gjenstander: icon(<><path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z" /><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8" /></>),
  fordeling: icon(<><path d="M12 3v18M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0zM19 7l-3 7a3 3 0 006 0z" /></>),
  arvinger: icon(<><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.4.2 4 1.7 4.5 4.4" /></>),
  praktisk: icon(<><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4" /></>),
}
