// Bygger GDPR-dataeksporten (profil, interesser, kommentarer) som en lesbar PDF
import { jsPDF } from 'jspdf'
import { L, locale } from './lang'

const ESPRESSO = '#3A2F26'
const WALNUT = '#5C4530'
const LATTE = '#9C8267'
const BORDER = '#D9CFC0'

const PROFILE_LABELS = {
  display_name: L('Visningsnavn', 'Display name'),
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

export function buildDataExportPdf({ email, profile, interests = [], comments = [], exportedAt = new Date() }) {
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
  text(L('Dette dokumentet inneholder alle personopplysninger Arvklart har lagret om deg: profil, interesser og kommentarer.', 'This document contains all personal data Arvklart has stored about you: profile, interests and comments.'), { size: 9.5, color: LATTE, gap: 2 })

  heading(L('Profil', 'Profile'))
  const entries = Object.entries(profile || {}).filter(([, v]) => v !== null && v !== '')
  if (!entries.length) text(L('Ingen profildata.', 'No profile data.'), { color: LATTE })
  for (const [k, v] of entries) {
    text(PROFILE_LABELS[k] || k, { size: 9, color: LATTE, gap: 0.3 })
    text(fmtValue(v), { gap: 2.5 })
  }

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

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont('helvetica', 'normal').setFontSize(8).setTextColor(LATTE)
    doc.text(L(`Side ${p} av ${pages}`, `Page ${p} of ${pages}`), M + W, BOTTOM + 8, { align: 'right' })
  }

  return doc
}
