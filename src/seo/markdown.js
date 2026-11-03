// Enkel og trygg Markdown for guidene (content/guider/*.md), brukt ved bygging (src/seo/content.js).
// Bare det en guide trenger: avsnitt, ## og ### overskrifter, lister (- og 1.), sitat (>), **fet**, *kursiv* og
// lenker. All tekst kodes som HTML; rå HTML i Markdown blir vanlig tekst. Lenker må være interne («/…») eller
// https://. H1 er guidens tittel og kan ikke stå i teksten.

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const headingId = (text) => text.toLowerCase()
  .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Inline: lenker, fet og kursiv. links samler lenkene, så byggesteget kan sjekke at interne lenker finnes.
function inline(text, links) {
  let out = ''
  let i = 0
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
  let m
  while ((m = re.exec(text))) {
    out += emphasis(esc(text.slice(i, m.index)))
    const [, label, href] = m
    if (!/^\/(?!\/)/.test(href) && !/^https:\/\//.test(href)) throw new Error(`Lenken «${href}» må være intern (/…) eller https://`)
    links.push(href)
    out += `<a href="${esc(href)}">${emphasis(esc(label))}</a>`
    i = re.lastIndex
  }
  return out + emphasis(esc(text.slice(i)))
}
const emphasis = (s) => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')

// Returnerer { html, links, headings }
export function renderMarkdown(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out = []
  const links = []
  const headings = []
  let para = []
  let list = null // { tag, items }
  let quote = []
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '), links)}</p>`); para = [] }
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map(t => `<li>${inline(t, links)}</li>`).join('')}</${list.tag}>`); list = null }
  const flushQuote = () => { if (quote.length) out.push(`<blockquote><p>${inline(quote.join(' '), links)}</p></blockquote>`); quote = [] }
  const flush = () => { flushPara(); flushList(); flushQuote() }

  for (const raw of lines) {
    const line = raw.trimEnd()
    let m
    if (!line.trim()) { flush(); continue }
    if (/^#\s/.test(line)) throw new Error('H1 (# ) er guidens tittel og kan ikke stå i teksten; bruk ## og ###')
    if ((m = line.match(/^(#{2,3})\s+(.+)$/))) {
      flush()
      const level = m[1].length
      const text = m[2].trim()
      const id = headingId(text)
      headings.push({ level, text, id })
      out.push(`<h${level} id="${id}">${inline(text, links)}</h${level}>`)
      continue
    }
    if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/))) {
      flushPara(); flushQuote()
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul'
      if (list && list.tag !== tag) flushList()
      list = list || { tag, items: [] }
      list.items.push(m[2].trim())
      continue
    }
    if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue }
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue }
    flushList(); flushQuote()
    para.push(line.trim())
  }
  flush()
  return { html: out.join('\n'), links, headings }
}
