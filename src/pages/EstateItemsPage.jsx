import { useEffect, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEstateData } from '../hooks/useEstateData'
import { getStatusBreakdown } from '../lib/estateProgress'
import { ITEM_FILTERS, filterByKey, filterItems, filterCounts } from '../lib/itemFilters'
import { formatNOK } from '../lib/format'
import { removeImages, itemImageUrls } from '../lib/images'
import { dispositionLabel } from '../lib/disposition'
import { categoryLabel } from '../lib/categories'
import { C } from '../lib/estateTheme'
import { darkCss } from '../lib/estateThemeCss'
import { L } from '../lib/lang'
import { Modal } from '../components/UI'
import ReasonEditor from '../components/ReasonEditor'
import StoredImage from '../components/StoredImage'

// Alle gjenstandene i boet, med store bilder. Søk, «Vis»-valg (alle, mine ønsker, ettertraktede, noen vil ha,
// ingen vil ha, tildelt) og kategori står i adressen (?vis=…&kategori=…&sok=…), og «Analyse» viser fordelingen
// per kategori og status. Et kort åpner gjenstandssiden, som går tilbake hit med samme utvalg.
export default function EstateItemsPage({ session, onToast, isDemo }) {
  const { id } = useParams()
  const location = useLocation()
  const userId = session.user.id
  const { loading, estate, items, categories, myRole, reload } = useEstateData(id, userId)
  const [params, setParams] = useSearchParams()
  const [confirmItem, setConfirmItem] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const scrollKey = `bo_gjenstander_scroll_${id}`

  // Tilbake fra en gjenstand: samme sted i listen
  useEffect(() => {
    if (loading) return
    let saved = null
    try { saved = sessionStorage.getItem(scrollKey); sessionStorage.removeItem(scrollKey) } catch { /* privat modus */ }
    if (saved) setTimeout(() => window.scrollTo({ top: parseInt(saved, 10), behavior: 'instant' }), 50)
  }, [loading])

  if (loading) return <Message>{L('Laster…', 'Loading…')}</Message>
  if (!estate) return <Message>{L('Fant ikke boet. Det kan være slettet, eller du er ikke medlem.', 'Estate not found. It may have been deleted, or you are not a member.')}</Message>

  // Utvalget fra adressen. Ukjente verdier (f.eks. en slettet kategori) gir alle.
  const vis = filterByKey(params.get('vis')).key
  const category = categories.some(c => c.id === params.get('kategori')) ? params.get('kategori') : 'alle'
  const query = params.get('sok') || ''
  const mode = params.get('visning') === 'analyse' ? 'analyse' : 'bilder'
  const setParam = (key, value, standard) => setParams(prev => {
    const next = new URLSearchParams(prev)
    if (!value || value === standard) next.delete(key); else next.set(key, value)
    return next
  }, { replace: true })
  const showAll = () => setParams({}, { replace: true })

  const isAdmin = myRole === 'admin'
  const counts = filterCounts(items, userId)
  const visible = filterItems(items, { vis, category, query }, userId)
  const isMine = i => !!i.interests?.some(x => x.user_id === userId)
  const narrowed = vis !== 'alle' || category !== 'alle' || query.trim() !== ''
  // Under «Alle» står egne ønsker først, i en egen del, slik de gjorde på den gamle bo-siden
  const sections = vis === 'alle' && visible.some(isMine)
    ? [
        { key: 'mine', title: L(`Mine ønsker (${visible.filter(isMine).length})`, `My wishes (${visible.filter(isMine).length})`), items: visible.filter(isMine) },
        { key: 'andre', title: L('Andre gjenstander', 'Other items'), items: visible.filter(i => !isMine(i)) },
      ].filter(s => s.items.length)
    : [{ key: 'utvalg', title: null, items: visible }]

  // Gjenstandssiden går tilbake hit, med samme utvalg (ItemDetailPage leser state.back)
  const back = location.pathname + location.search
  const rememberScroll = () => { try { sessionStorage.setItem(scrollKey, String(window.scrollY)) } catch { /* privat modus */ } }
  // Den som la inn gjenstanden kan slette den bare før den er tildelt (håndheves også i databasen)
  const canDelete = item => !isDemo && (isAdmin || (item.added_by === userId && !item.assigned_to && item.status !== 'assigned'))

  const confirmDelete = async () => {
    if (!confirmItem || deleting) return
    setDeleting(true)
    const { data, error } = await supabase.from('items').delete().eq('id', confirmItem.id).select('id')
    setDeleting(false)
    if (error || !data?.length) { onToast(L('Kunne ikke slette gjenstanden. Bare admin og den som la den inn kan slette den.', 'Could not delete the item. Only an admin and the person who added it can delete it.'), 'error'); return }
    await removeImages(itemImageUrls(confirmItem))
    onToast(L('Gjenstand slettet', 'Item deleted'))
    setConfirmItem(null)
    reload()
  }

  return (
    <div className="bo-mork">
      <style>{darkCss}</style>
      <div className="bo-side bred">
        <div className="bo-topplinje">
          <Link to={`/estate/${id}`} className="bo-lenke">{L('← Til oversikten', '← To the overview')}</Link>
        </div>

        <header className="bo-listehode">
          <div>
            <h1>{mode === 'analyse' ? L('Analyse', 'Analytics') : filterByKey(vis).label()}</h1>
            <p className="bo-dempet" role="status">
              {mode === 'analyse' || !narrowed
                ? L(`${items.length} ${items.length === 1 ? 'gjenstand' : 'gjenstander'} i ${estate.name}`, `${items.length} ${items.length === 1 ? 'item' : 'items'} in ${estate.name}`)
                : L(`Viser ${visible.length} av ${items.length} gjenstander`, `Showing ${visible.length} of ${items.length} items`)}
            </p>
          </div>
          {isDemo
            ? <Link to={`/estate/${id}/add`} className="bo-knapp fylt">{L('Prøv AI-verdivurdering', 'Try AI valuation')}</Link>
            : <Link to={`/estate/${id}/add-many`} className="bo-knapp fylt">{L('+ Legg til gjenstander', '+ Add items')}</Link>}
        </header>

        {items.length > 0 && (
          <div className="bo-verktoy" role="search">
            {mode === 'bilder' && <>
              <input type="search" value={query} onChange={e => setParam('sok', e.target.value, '')}
                aria-label={L('Søk i boet', 'Search the estate')} placeholder={L('Søk etter gjenstand…', 'Search for an item…')} />
              <select value={vis} onChange={e => setParam('vis', e.target.value, 'alle')} aria-label={L('Vis', 'Show')}>
                {ITEM_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label()} ({counts[f.key]})</option>)}
              </select>
              {categories.length > 0 && (
                <select value={category} onChange={e => setParam('kategori', e.target.value, 'alle')} aria-label={L('Kategori', 'Category')}>
                  <option value="alle">{L('Alle kategorier', 'All categories')}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {categoryLabel(c.label)}</option>)}
                </select>
              )}
            </>}
            <span className="bo-bryter" role="group" aria-label={L('Visning', 'View')}>
              <button type="button" aria-pressed={mode === 'bilder'} onClick={() => setParam('visning', 'bilder', 'bilder')}>{L('Bilder', 'Photos')}</button>
              <button type="button" aria-pressed={mode === 'analyse'} onClick={() => setParam('visning', 'analyse', 'bilder')}>{L('Analyse', 'Analytics')}</button>
            </span>
          </div>
        )}

        {mode === 'analyse' && items.length > 0 ? (
          <Analytics items={items} categories={categories} />
        ) : visible.length === 0 ? (
          <div className="bo-tom">
            <p>
              {items.length === 0 ? L('Ingen gjenstander ennå.', 'No items yet.')
                : query.trim() ? L(`Ingen gjenstander passer «${query.trim()}».`, `No items match «${query.trim()}».`)
                : L('Ingen gjenstander i dette utvalget.', 'No items in this selection.')}
            </p>
            {items.length === 0 && !isDemo && <Link to={`/estate/${id}/add-many`} className="bo-knapp fylt">{L('Legg til første gjenstand', 'Add the first item')}</Link>}
            {items.length > 0 && query.trim() && <button type="button" className="bo-knapp stille" onClick={() => setParam('sok', '', '')}>{L('Tøm søket', 'Clear the search')}</button>}
            {items.length > 0 && !query.trim() && narrowed && <button type="button" className="bo-knapp stille" onClick={showAll}>{L('Vis alle gjenstander', 'Show all items')}</button>}
          </div>
        ) : (
          sections.map(section => (
            <section key={section.key} className="bo-seksjon" aria-label={section.title || undefined}>
              {section.title && <h2>{section.title}</h2>}
              <div className="bo-rutenett">
                {section.items.map(item => (
                  <ItemCard key={item.id} item={item} userId={userId} estateId={id} back={back}
                    canDelete={canDelete(item)} showReason={vis === 'mine'}
                    onOpen={rememberScroll} onDelete={() => setConfirmItem(item)} onToast={onToast} onReasonSaved={reload} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {confirmItem && (
        <Modal onClose={() => setConfirmItem(null)} labelledBy="slett-tittel" maxWidth={380}
          panelStyle={{ background: C.flateHoy, color: C.lin, border: `1px solid ${C.kant}` }}>
          <h2 id="slett-tittel" style={{ fontSize: '1.125rem', marginBottom: '8px' }}>{L('Slett gjenstand', 'Delete item')}</h2>
          <p style={{ fontSize: '0.875rem', marginBottom: '6px' }}>«{confirmItem.title}»</p>
          <p className="bo-dempet" style={{ fontSize: '0.8125rem', marginBottom: '24px' }}>{L('Kan ikke angres.', 'This cannot be undone.')}</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="bo-knapp stille" style={{ flex: 1 }} onClick={() => setConfirmItem(null)}>{L('Avbryt', 'Cancel')}</button>
            <button type="button" className="bo-knapp slett" style={{ flex: 1 }} onClick={confirmDelete} disabled={deleting}>{deleting ? L('Sletter…', 'Deleting…') : L('Slett', 'Delete')}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// Ett kort: stort bilde, navn, verdi og hvem som ønsker gjenstanden. Hele bildet og teksten er én lenke;
// «Slett» og begrunnelsen ligger utenfor lenken, så de ikke åpner gjenstanden.
function ItemCard({ item, userId, estateId, back, canDelete, showReason, onOpen, onDelete, onToast, onReasonSaved }) {
  const cat = item.categories || { emoji: '📦', label: 'Annet' }
  const mine = item.interests?.find(x => x.user_id === userId)
  const count = item.interests?.length || 0
  const assigned = item.status === 'assigned'
  const names = interestNames(item.interests || [], userId)
  const badge = assigned ? { kind: 'tildelt', text: L('Tildelt', 'Assigned') }
    : count > 1 ? { kind: 'flere', text: L(`${count} vil ha`, `${count} want it`) }
    : item.disposition ? { kind: 'disponert', text: dispositionLabel(item.disposition) }
    : null

  return (
    <article className={mine ? 'bo-kort mitt' : 'bo-kort'}>
      <Link to={`/estate/${estateId}/item/${item.id}`} state={{ back }} onClick={onOpen}>
        <div className="bo-bilde">
          {item.image_url
            ? <StoredImage src={item.image_url} alt="" />
            : <span className="bo-plassholder" aria-hidden="true"><span className="emoji">{cat.emoji}</span>{categoryLabel(cat.label)}</span>}
        </div>
        <div className="tekst">
          <span className="navn">{item.title}</span>
          {item.estimated_value != null && item.estimated_value !== '' && <span className="verdi">{L('ca.', 'approx.')} {formatNOK(item.estimated_value)}</span>}
          <span className={count ? 'hvem' : 'hvem ingen'}>
            {count === 0 ? L('Ingen ennå', 'No one yet') : names === L('deg', 'you') ? L('Bare deg', 'Only you') : names.charAt(0).toUpperCase() + names.slice(1)}
          </span>
        </div>
        {/* Merket vises oppe til venstre på bildet, men står sist i lenken, så navnet leses først */}
        {badge && <span className={`bo-merke ${badge.kind}`}>{badge.text}</span>}
      </Link>
      {canDelete && (
        <button type="button" className="bo-slett" onClick={onDelete} aria-label={L(`Slett «${item.title}»`, `Delete «${item.title}»`)}>{L('Slett', 'Delete')}</button>
      )}
      {/* «Mine ønsker»: egen begrunnelse kan legges til, endres eller fjernes uten å åpne gjenstanden */}
      {showReason && mine && (
        <div className="begrunnelse">
          <ReasonEditor key={item.id} itemId={item.id} itemTitle={item.title} userId={userId} savedReason={mine.reason || null}
            compact dark onToast={onToast} onSaved={onReasonSaved} />
        </div>
      )}
    </article>
  )
}

// Navn på de som ønsker gjenstanden, med «deg» for innlogget bruker til slutt
const interestNames = (interests, userId) => {
  const me = L('deg', 'you'), and = L('og', 'and')
  const names = interests.map(x => x.user_id === userId ? me : (x.profiles?.display_name || L('Ukjent', 'Unknown')))
  const sorted = [...names.filter(n => n !== me), ...names.filter(n => n === me)]
  if (sorted.length <= 3) return sorted.length > 1 ? `${sorted.slice(0, -1).join(', ')} ${and} ${sorted.at(-1)}` : sorted[0] || ''
  return L(`${sorted.slice(0, 2).join(', ')} og ${sorted.length - 2} til`, `${sorted.slice(0, 2).join(', ')} and ${sorted.length - 2} more`)
}

// Fordelingen av alle gjenstandene: per kategori og per status. Tallene står ved siden av hver stolpe,
// så ingenting avhenger av fargene alene.
function Analytics({ items, categories }) {
  const known = new Set(categories.map(c => c.id))
  const byCategory = [
    ...categories.map(c => ({ key: c.id, name: `${c.emoji} ${categoryLabel(c.label)}`, n: items.filter(i => i.category_id === c.id).length })),
    { key: 'uten', name: L('📦 Uten kategori', '📦 No category'), n: items.filter(i => !known.has(i.category_id)).length },
  ].filter(x => x.n > 0).sort((a, b) => b.n - a.n)
  const max = Math.max(1, ...byCategory.map(x => x.n))

  const b = getStatusBreakdown(items)
  const status = [
    { key: 'assigned', label: L('Tildelt', 'Assigned'), n: b.assigned, color: C.mose },
    { key: 'contested', label: L('Ettertraktet', 'Contested'), n: b.contested, color: C.messing },
    { key: 'single', label: L('Én vil ha', 'One wants it'), n: b.single, color: C.linDempet },
    { key: 'none', label: L('Ingen vil ha', 'No one wants it'), n: b.none, color: C.flateHoy },
  ]

  return (
    <div className="bo-analyse">
      <section className="bo-panel" aria-labelledby="analyse-kategori">
        <h2 id="analyse-kategori">{L('Gjenstander per kategori', 'Items per category')}</h2>
        <ul className="bo-stolper">
          {byCategory.map(x => (
            <li key={x.key}>
              <span className="navn">{x.name}</span>
              <span className="stolpe" aria-hidden="true"><span style={{ width: `${x.n / max * 100}%` }} /></span>
              <span className="antall">{x.n}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="bo-panel" aria-labelledby="analyse-status">
        <h2 id="analyse-status">{L('Status', 'Status')}</h2>
        <div className="bo-stabel" aria-hidden="true">
          {status.filter(s => s.n > 0).map(s => <span key={s.key} style={{ width: `${s.n / items.length * 100}%`, background: s.color }} />)}
        </div>
        <ul className="bo-tegnforklaring">
          {status.map(s => (
            <li key={s.key}><i style={{ background: s.color, boxShadow: s.key === 'none' ? `inset 0 0 0 1px ${C.linje}` : 'none' }} />{s.label} {s.n}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Message({ children }) {
  return (
    <div className="bo-mork">
      <style>{darkCss}</style>
      <p role="status" className="bo-dempet" style={{ padding: '80px 16px', textAlign: 'center' }}>{children}</p>
    </div>
  )
}
