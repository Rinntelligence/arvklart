// Lager en nedlastbar PDF av rapporten fra report.js.
// jsPDF lastes fra cdnjs først når brukeren ber om en PDF.

import { buildReport } from './report.js'
import { localToday } from './flow.js'

const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
let loading = null

function loadJsPdf() {
  if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = JSPDF_URL
      s.crossOrigin = 'anonymous'
      s.onload = () => (window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error('jsPDF mangler')))
      s.onerror = () => { loading = null; reject(new Error('Kunne ikke laste PDF-biblioteket')) }
      document.head.appendChild(s)
    })
  }
  return loading
}

// Standardfontene i PDF støtter bare Latin-1/WinAnsi. Bytt ut tegn som ikke finnes der.
const clean = t => String(t ?? '')
  .replace(/[   ]/g, ' ')
  .replace(/−/g, '-')
  .replace(/[→]/g, '->')
  .replace(/[^\x00-\xFF–—‘’“”•€…\n]/g, '')

// Arvklart-paletten: espresso, kastanje og kaffe latte til tekst, salviegrønn aksent, beige flater
const COLOR = {
  ink: [58, 47, 38], muted: [122, 97, 70], faint: [156, 130, 103],
  primary: [95, 110, 82], primaryStrong: [63, 74, 55], primarySoft: [241, 243, 236],
  accent: [201, 174, 142], accentSoft: [247, 243, 236], border: [232, 223, 208], espresso: [58, 47, 38],
}

export async function downloadPdf(answers) {
  const JsPDF = await loadJsPdf()
  const report = buildReport(answers)
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 18
  const CW = W - 2 * M
  let y = M

  const setFont = (size, style = 'normal', color = COLOR.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color) }
  const lineH = size => size * 0.42
  const ensure = h => { if (y + h > H - 18) { doc.addPage(); y = M } }
  const wrap = (text, width) => doc.splitTextToSize(clean(text), width - 2)

  function paragraph(text, { size = 10, style = 'normal', color = COLOR.ink, indent = 0, gap = 2.5 } = {}) {
    setFont(size, style, color)
    for (const line of wrap(text, CW - indent)) {
      ensure(lineH(size))
      doc.text(line, M + indent, y + lineH(size) * 0.8)
      y += lineH(size)
    }
    y += gap
  }

  function heading(text) {
    // Hold overskriften sammen med starten av innholdet
    ensure(32)
    y += 3
    setFont(14, 'bold', COLOR.primaryStrong)
    doc.text(clean(text), M, y + 5)
    y += 8
    doc.setDrawColor(...COLOR.border); doc.setLineWidth(0.3); doc.line(M, y, W - M, y)
    y += 4
  }

  function table(block) {
    const n = block.columns.length
    const widths = (block.widths || (n === 2 ? [0.7, 0.3] : n === 4 ? [0.36, 0.32, 0.18, 0.14] : Array(n).fill(1 / n))).map(x => x * CW)
    const pad = 2
    const drawRow = (cells, { header = false, strong = false } = {}) => {
      setFont(9, header || strong ? 'bold' : 'normal', header ? COLOR.muted : COLOR.ink)
      const lines = cells.map((c, i) => wrap(c, widths[i] - 2 * pad))
      const h = Math.max(...lines.map(l => l.length)) * lineH(9) + 2 * pad
      ensure(h)
      if (header) { doc.setFillColor(...COLOR.primarySoft); doc.rect(M, y, CW, h, 'F') }
      let x = M
      lines.forEach((l, i) => {
        const right = block.align?.[i] === 'right'
        l.forEach((ln, k) => doc.text(ln, right ? x + widths[i] - pad : x + pad, y + pad + lineH(9) * (k + 0.8), { align: right ? 'right' : 'left' }))
        x += widths[i]
      })
      y += h
      doc.setDrawColor(...COLOR.border); doc.setLineWidth(0.2); doc.line(M, y, W - M, y)
    }
    if (block.columns.some(Boolean)) drawRow(block.columns, { header: true })
    for (const row of block.rows) drawRow(row.cells, { strong: row.strong })
    y += 4
  }

  function note(block) {
    const color = block.level === 'info' ? COLOR.primary : COLOR.accent
    const bg = block.level === 'info' ? COLOR.primarySoft : COLOR.accentSoft
    setFont(10, 'bold')
    const titleLines = wrap(block.title, CW - 8)
    setFont(9.5)
    const textLines = wrap(block.text, CW - 8)
    const h = titleLines.length * lineH(10) + textLines.length * lineH(9.5) + 6
    if (h < H - 2 * M) ensure(h)
    const top = y
    doc.setFillColor(...bg); doc.rect(M, top, CW, Math.min(h, H - 18 - top), 'F')
    doc.setFillColor(...color); doc.rect(M, top, 1.2, Math.min(h, H - 18 - top), 'F')
    y += 3
    setFont(10, 'bold')
    for (const l of titleLines) { ensure(lineH(10)); doc.text(l, M + 5, y + lineH(10) * 0.8); y += lineH(10) }
    setFont(9.5, 'normal', COLOR.ink)
    for (const l of textLines) { ensure(lineH(9.5)); doc.text(l, M + 5, y + lineH(9.5) * 0.8); y += lineH(9.5) }
    y += 6
  }

  function list(items, numbered = false) {
    items.forEach((item, i) => {
      const marker = numbered ? `${i + 1}.` : '•'
      setFont(10)
      const lines = wrap(item, CW - 7)
      lines.forEach((l, k) => {
        ensure(lineH(10))
        if (k === 0) doc.text(marker, M + 1, y + lineH(10) * 0.8)
        doc.text(l, M + 7, y + lineH(10) * 0.8)
        y += lineH(10)
      })
      y += 1.5
    })
    y += 2
  }

  function steps(items) {
    items.forEach((s, i) => {
      ensure(12)
      doc.setFillColor(...COLOR.primarySoft); doc.circle(M + 3, y + 3, 3, 'F')
      setFont(9, 'bold', COLOR.primary); doc.text(String(i + 1), M + 3, y + 4.1, { align: 'center' })
      setFont(10, 'bold')
      for (const l of wrap(s.title, CW - 10)) { ensure(lineH(10)); doc.text(l, M + 10, y + lineH(10) * 0.8 + 0.6); y += lineH(10) }
      setFont(9.5, 'normal', COLOR.muted)
      for (const l of wrap(s.text, CW - 10)) { ensure(lineH(9.5)); doc.text(l, M + 10, y + lineH(9.5) * 0.8 + 0.6); y += lineH(9.5) }
      y += 4
    })
  }

  function kv(rows) {
    for (const [k, v] of rows) {
      setFont(9, 'bold', COLOR.primary)
      const vLines = (setFont(10.5, 'bold'), wrap(v, CW - 10))
      const h = 5 + vLines.length * lineH(10.5) + 5
      ensure(h)
      doc.setFillColor(...COLOR.primarySoft); doc.roundedRect(M, y, CW, h, 2, 2, 'F')
      setFont(8.5, 'bold', COLOR.primary); doc.text(clean(k).toUpperCase(), M + 5, y + 5)
      setFont(10.5, 'bold')
      vLines.forEach((l, i) => doc.text(l, M + 5, y + 9.5 + i * lineH(10.5)))
      y += h + 3
    }
    y += 2
  }

  // ── Forside-topp ──
  doc.setFillColor(...COLOR.espresso); doc.roundedRect(M, y, 9, 9, 2, 2, 'F')
  setFont(11, 'bold', COLOR.ink); doc.text('Arvklart', M + 12, y + 6.2)
  y += 16
  setFont(20, 'bold', COLOR.ink); doc.text(clean(report.title), M, y + 6); y += 11
  paragraph(report.subtitle, { size: 9.5, color: COLOR.muted, gap: 3 })
  paragraph(report.disclaimer, { size: 8.5, color: COLOR.faint, gap: 4 })

  for (const section of report.sections) {
    heading(section.heading)
    for (const b of section.blocks) {
      if (b.type === 'p') paragraph(b.text)
      else if (b.type === 'subheading') { ensure(10); paragraph(b.text, { size: 10.5, style: 'bold', gap: 1.5 }) }
      else if (b.type === 'list') list(b.items)
      else if (b.type === 'steps') steps(b.items)
      else if (b.type === 'table') table(b)
      else if (b.type === 'note') note(b)
      else if (b.type === 'kv') kv(b.rows)
    }
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    setFont(8, 'normal', COLOR.faint)
    doc.text('Arvklart – veiledende beregning, ikke juridisk rådgivning', M, H - 10)
    doc.text(`Side ${i} av ${pages}`, W - M, H - 10, { align: 'right' })
  }

  doc.save(`arveoppgjor-oversikt-${localToday()}.pdf`)
  return report
}
