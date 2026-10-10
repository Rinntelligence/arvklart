// Protokoll for fordelingen av innbo og løsøre som PDF (F5/F6).
//
// kind:
//   'draft'  – utkast fra slik det står nå (vannmerke UTKAST)
//   'final'  – fra en godkjent versjon, med de registrerte godkjenningene
//   'paper'  – forslaget kan ikke godkjennes digitalt (f.eks. arving uten konto): signaturfelt på papir
//   'demo'   – demoen (vannmerke DEMO), aldri en ekte fordeling
// Godkjenninger beskrives som registrerte godkjenninger i Arvklart, ikke som elektroniske signaturer.
// Det som ikke er avklart, står for seg og omfattes ikke av godkjenningen.
import { jsPDF } from 'jspdf'
import { L, locale } from './lang.js'
import { formatNOK } from './format.js'
import { itemValue } from './distribution.js'
import { diffText } from './distributionSummary.js'
import { dispositionLabel } from './dispositionLabels.js'

const ESPRESSO = '#3A2F26'
const WALNUT = '#5C4530'
const LATTE = '#75604B'
const BORDER = '#D9CFC0'

// Standardfontene i PDF støtter bare Latin-1/WinAnsi
const clean = s => String(s ?? '').replace(/[^\u0000-ÿ–—‘’“”•…€]/g, '')
const fmtDate = v => new Date(v).toLocaleString(locale(), { dateStyle: 'long', timeStyle: 'short' })

export function buildDistributionPdf({ estateName, summary, kind = 'draft', generatedAt = new Date(), version = null, deciders = [] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const M = 20
  const W = doc.internal.pageSize.getWidth() - M * 2
  const BOTTOM = doc.internal.pageSize.getHeight() - M
  let y = M
  const ensure = h => { if (y + h > BOTTOM) { doc.addPage(); y = M } }
  const text = (str, { size = 10, color = WALNUT, bold = false, indent = 0, gap = 1.5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color)
    const lineH = size * 0.42
    for (const line of doc.splitTextToSize(clean(str), W - indent)) { ensure(lineH); doc.text(line, M + indent, y + lineH * 0.8); y += lineH }
    y += gap
  }
  const rule = () => { ensure(4); doc.setDrawColor(BORDER).setLineWidth(0.3).line(M, y, M + W, y); y += 4 }
  const heading = str => { y += 4; ensure(14); text(str, { size: 13, color: ESPRESSO, bold: true, gap: 1 }); rule() }
  const value = i => (itemValue(i) === null ? L('uten fordelingsverdi', 'no distribution value') : formatNOK(itemValue(i)))

  text(L('Fordeling av innbo og løsøre', 'Division of household contents'), { size: 18, color: ESPRESSO, bold: true, gap: 1 })
  text(estateName || '', { size: 13, color: ESPRESSO, gap: 2 })
  const status = {
    draft: L('UTKAST – ikke godkjent. Viser fordelingen slik den står nå.', 'DRAFT – not approved. Shows the distribution as it stands now.'),
    final: L('Godkjent: alle beslutningstakerne har registrert sin godkjenning i Arvklart.', 'Approved: all decision-makers have registered their approval in Arvklart.'),
    paper: L('Ikke godkjent digitalt. Forslaget må godkjennes og signeres på papir av alle beslutningstakerne.', 'Not approved digitally. The proposal must be approved and signed on paper by all decision-makers.'),
    demo: L('DEMO – ikke en ekte fordeling.', 'DEMO – not a real distribution.'),
  }[kind]
  text(status, { bold: true, color: ESPRESSO, gap: 1 })
  text(`${L('Laget', 'Generated')} ${fmtDate(generatedAt)}${version ? ` · ${L('versjon', 'version')} ${version.version_no} (${L('lagt frem', 'proposed')} ${fmtDate(version.created_at)})` : ''}`, { color: LATTE, gap: 2 })
  text(L('Verdiene er fordelingsverdier familien har satt, adskilt fra AI-anslag. Verdiutjevningen er beslutningsstøtte, ikke en juridisk fasit. Godkjenninger er registrerte godkjenninger i Arvklart, ikke juridisk verifiserte elektroniske signaturer.',
    'The values are distribution values set by the family, separate from AI estimates. The value balance is decision support, not a legal answer. Approvals are registered approvals in Arvklart, not legally verified electronic signatures.'), { size: 9, color: LATTE, gap: 2 })

  const notSettled = summary.pending.length + summary.unwanted.undecided.length
  if (notSettled) {
    text(L(`Delvis fordeling: ${notSettled} ${notSettled === 1 ? 'gjenstand er' : 'gjenstander er'} ikke avklart og omfattes ikke av denne fordelingen (se siste avsnitt).`,
      `Partial distribution: ${notSettled} ${notSettled === 1 ? 'item is' : 'items are'} not settled and not covered by this distribution (see the last section).`), { bold: true, color: ESPRESSO, gap: 2 })
  }

  heading(L('Gjenstander per arving', 'Items per heir'))
  for (const h of summary.perHeir) {
    text(`${h.name}: ${h.items.length} ${h.items.length === 1 ? L('gjenstand', 'item') : L('gjenstander', 'items')} · ${formatNOK(h.sum)}${h.unknown ? ` + ${h.unknown} ${L('uten verdi', 'without value')}` : ''}`, { bold: true, color: ESPRESSO, gap: 0.5 })
    if (summary.totalKnown > 0) text(diffText(h, summary), { size: 9, color: LATTE, gap: 0.8 })
    for (const i of h.items) text(`• ${i.title} – ${value(i)}`, { indent: 4, gap: 0.3 })
    y += 2
  }

  heading(L('Gjenstander ingen ønsker', 'Items no one wants'))
  for (const d of ['sell', 'donate', 'discard']) {
    const list = summary.unwanted[d]
    if (!list.length) continue
    text(`${dispositionLabel(d)} (${list.length})`, { bold: true, color: ESPRESSO, gap: 0.5 })
    for (const i of list) text(`• ${i.title}`, { indent: 4, gap: 0.3 })
    y += 2
  }
  if (!['sell', 'donate', 'discard'].some(d => summary.unwanted[d].length)) text(L('Ingen.', 'None.'), { color: LATTE })

  if (notSettled) {
    heading(L('Ikke avklart – omfattes ikke av godkjenningen', 'Not settled – not covered by the approval'))
    for (const i of summary.pending) text(`• ${i.title} – ${L('ønskes av', 'wanted by')} ${(i.interests || []).length}`, { indent: 4, gap: 0.3 })
    for (const i of summary.unwanted.undecided) text(`• ${i.title} – ${L('ingen ønsker den; ikke bestemt', 'no one wants it; not decided')}`, { indent: 4, gap: 0.3 })
  }

  if (deciders.length) {
    heading(kind === 'paper' ? L('Godkjenning og signatur', 'Approval and signature') : L('Beslutningstakere og godkjenninger', 'Decision-makers and approvals'))
    for (const d of deciders) {
      text(d.name, { bold: true, color: ESPRESSO, gap: 0.3 })
      if (d.statusText) text(d.statusText, { size: 9, gap: 0.3 })
      if (d.representation) text(d.representation, { size: 9, color: LATTE, gap: 0.3 })
      if (kind === 'paper') { y += 8; ensure(10); doc.setDrawColor(ESPRESSO).line(M, y, M + 90, y); y += 4; text(L('Signatur og dato', 'Signature and date'), { size: 8, color: LATTE }) }
      y += 2
    }
  }

  // Vannmerke på hver side for utkast og demo
  if (kind === 'draft' || kind === 'demo') {
    const mark = kind === 'demo' ? 'DEMO' : L('UTKAST', 'DRAFT')
    for (let p = 1; p <= doc.getNumberOfPages(); p++) {
      doc.setPage(p)
      doc.setFont('helvetica', 'bold').setFontSize(70).setTextColor('#E8DFD0')
      doc.text(mark, 50, 200, { angle: 35 })
    }
  }
  return doc
}
