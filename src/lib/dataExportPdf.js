// Bygger GDPR-dataeksporten (alt som er knyttet til brukeren) som en lesbar PDF
import { jsPDF } from 'jspdf'
import { L, locale } from './lang'

const ESPRESSO = '#3A2F26'
const WALNUT = '#5C4530'
const LATTE = '#9C8267'
const BORDER = '#D9CFC0'

const PROFILE_LABELS = {
  display_name: L('Visningsnavn', 'Display name'),
  email: L('E-post', 'Email'),
  avatar_color: L('Avatarfarge', 'Avatar colour'),
  plan: L('Abonnement', 'Subscription'),
  is_founder: 'Founder',
  created_at: L('Opprettet', 'Created'),
  updated_at: L('Sist oppdatert', 'Last updated'),
  user_id: L('Bruker-ID', 'User ID'),
  id: L('Profil-ID', 'Profile ID'),
}

// Standardfontene i PDF støtter bare Latin-1/WinAnsi; fjern tegn (f.eks. emoji) som ellers blir til rot
const clean = s => String(s ?? '').replace(/[^\u0000-ÿ–—‘’“”•…€]/g, '')

const isIsoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
const fmtDate = v => new Date(v).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' })

const fmtValue = v => {
  if (v === true) return L('Ja', 'Yes')
  if (v === false) return L('Nei', 'No')
  if (isIsoDate(v)) return fmtDate(v)
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function buildDataExportPdf({
  email, profile, estates = [], interests = [], passes = [], comments = [], items = [], documents = [], feedback = [],
  exportedAt = new Date(),
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 20
  const W = doc.internal.pageSize.getWidth() - M * 2
  const BOTTOM = doc.internal.pageSize.getHeight() - M
  let y = M

  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = M } }

  const text = (str, { size = 10, color = WALNUT, bold = false, indent = 0, gap = 1.5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color)
    const lineH = size * 0.42
    for (const line of doc.splitTextToSize(clean(str), W - indent)) {
      ensure(lineH)
      doc.text(line, M + indent, y + lineH * 0.8)
      y += lineH
    }
    y += gap
  }

  const rule = () => { ensure(4); doc.setDrawColor(BORDER).setLineWidth(0.3).line(M, y, M + W, y); y += 4 }

  const heading = str => { y += 4; ensure(14); text(str, { size: 14, color: ESPRESSO, bold: true, gap: 1 }); rule() }

  text(L('Mine data – Arvklart', 'My data – Arvklart'), { size: 20, color: ESPRESSO, bold: true, gap: 2 })
  text(`${L('Eksportert', 'Exported')} ${fmtDate(exportedAt)}`, { color: LATTE, gap: 0.5 })
  if (email) text(`${L('Konto', 'Account')}: ${email}`, { color: LATTE })
  text(L('Dette dokumentet inneholder personopplysningene Arvklart har lagret om deg: profil, bo du er med i, interesser, nei takk, kommentarer, gjenstander og dokumenter du har lagt inn, og tilbakemeldinger.', 'This document contains the personal data Arvklart has stored about you: profile, estates you belong to, interests, declined items, comments, items and documents you have added, and feedback.'), { size: 9.5, color: LATTE, gap: 2 })

  heading(L('Profil', 'Profile'))
  const entries = Object.entries(profile || {}).filter(([, v]) => v !== null && v !== '')
  if (!entries.length) text(L('Ingen profildata.', 'No profile data.'), { color: LATTE })
  for (const [k, v] of entries) {
    text(PROFILE_LABELS[k] || k, { size: 9, color: LATTE, gap: 0.3 })
    text(fmtValue(v), { gap: 2.5 })
  }

  // Én oppføring per rad: tittel, dato og valgfri tekst
  const addEntries = (title, rows, empty, toEntry) => {
    heading(`${title} (${rows.length})`)
    if (!rows.length) text(empty, { color: LATTE })
    for (const row of rows) {
      const { head, date, body } = toEntry(row)
      ensure(14)
      text(head || '–', { size: 11, color: ESPRESSO, bold: true, gap: 0.5 })
      if (date) text(fmtDate(date), { size: 9, color: LATTE, gap: 0.8 })
      if (body) text(body, { gap: 0.5 })
      y += 3
    }
  }

  addEntries(L('Bo du er med i', 'Estates you belong to'), estates, L('Du er ikke med i noen bo.', 'You do not belong to any estates.'), e => ({
    head: e.estates?.name || L('Ukjent bo', 'Unknown estate'), date: e.joined_at,
    body: e.role === 'admin' ? L('Rolle: administrator', 'Role: administrator') : L('Rolle: medlem', 'Role: member'),
  }))

  heading(`${L('Interesser', 'Interests')} (${interests.length})`)
  if (!interests.length) text(L('Du har ikke meldt interesse for noen gjenstander.', 'You have not registered interest in any items.'), { color: LATTE })
  for (const i of interests) {
    ensure(14)
    text(i.items?.title || L('Ukjent gjenstand', 'Unknown item'), { size: 11, color: ESPRESSO, bold: true, gap: 0.5 })
    if (i.created_at) text(fmtDate(i.created_at), { size: 9, color: LATTE, gap: 0.8 })
    if (i.reason) text(i.reason, { gap: 0.5 })
    y += 3
  }

  heading(`${L('Kommentarer', 'Comments')} (${comments.length})`)
  if (!comments.length) text(L('Du har ikke skrevet noen kommentarer.', 'You have not written any comments.'), { color: LATTE })
  for (const c of comments) {
    ensure(14)
    text(c.items?.title || L('Ukjent gjenstand', 'Unknown item'), { size: 11, color: ESPRESSO, bold: true, gap: 0.5 })
    if (c.created_at) text(fmtDate(c.created_at), { size: 9, color: LATTE, gap: 0.8 })
    if (c.content) text(c.content, { gap: 0.5 })
    y += 3
  }

  addEntries(L('Nei takk', 'Declined'), passes, L('Du har ikke sagt nei takk til noen gjenstander.', 'You have not declined any items.'), p => ({
    head: p.items?.title || L('Ukjent gjenstand', 'Unknown item'), date: p.created_at,
  }))
  addEntries(L('Gjenstander du har lagt inn', 'Items you have added'), items, L('Du har ikke lagt inn noen gjenstander.', 'You have not added any items.'), i => ({
    head: i.title, date: i.created_at,
    body: [i.estates?.name && `${L('Bo', 'Estate')}: ${i.estates.name}`, i.description, i.estimated_value && `${L('Anslått verdi', 'Estimated value')}: ${i.estimated_value} kr`].filter(Boolean).join('\n'),
  }))
  addEntries(L('Dokumenter du har lastet opp', 'Documents you have uploaded'), documents, L('Du har ikke lastet opp noen dokumenter.', 'You have not uploaded any documents.'), d => ({
    head: d.name, date: d.created_at, body: d.estates?.name && `${L('Bo', 'Estate')}: ${d.estates.name}`,
  }))
  addEntries(L('Tilbakemeldinger', 'Feedback'), feedback, L('Du har ikke sendt noen tilbakemeldinger.', 'You have not sent any feedback.'), f => ({
    head: f.type === 'bug' ? L('Feil', 'Bug') : f.type === 'idea' ? L('Idé', 'Idea') : L('Generelt', 'General'), date: f.created_at,
    body: [f.content, f.nps_score && `${L('Anbefaling', 'Recommendation')}: ${f.nps_score}/10`].filter(Boolean).join('\n'),
  }))

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont('helvetica', 'normal').setFontSize(8).setTextColor(LATTE)
    doc.text(L(`Side ${p} av ${pages}`, `Page ${p} of ${pages}`), M + W, BOTTOM + 8, { align: 'right' })
  }

  return doc
}
