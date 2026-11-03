// Serverer det bygde nettstedet (dist/) med hodene og omskrivingene fra vercel.json, slik Vercel gjør, så
// e2e-testene (csp.mjs, seo.mjs) kjører med de samme hodene og stiene som i produksjon. Supabase-adressen i
// CSP-en byttes til den simulerte (test.supabase.co). Bruk: node test/e2e/staticServer.mjs <dist> <port>
// Som Vercel: først videresendinger (redirects; permanent gir 308), så filen hvis den finnes («/» gir index.html),
// ellers første omskriving som passer (med $1 osv.), ellers 404 med 404.html. Hodene velges
// etter den opprinnelige stien (alle regler som passer, i rekkefølge). Kildene i vercel.json tolkes som
// regulære uttrykk (^…$), og bare den formen brukes der (test/seo/seo.test.js sjekker at det ikke er :param).
// Dette er en etterligning: oppførselen må også sjekkes på en forhåndsvisning hos Vercel (scripts/check-seo.mjs).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const [dir = 'dist', port = '5180'] = process.argv.slice(2)
const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'))
const PROD = 'swmuztsejghweqmaogol.supabase.co'
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' }

export const matches = (source, path) => new RegExp(`^${source}$`).test(path)

export function headersFor(path) {
  const out = {}
  for (const rule of vercel.headers) {
    if (!matches(rule.source, path)) continue
    for (const { key, value } of rule.headers) out[key] = value.replaceAll(PROD, 'test.supabase.co')
  }
  return out
}

const isFile = file => stat(file).then(s => s.isFile(), () => false)

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  const redirect = (vercel.redirects || []).find(r => matches(r.source, path))
  if (redirect) {
    res.writeHead(redirect.permanent === false ? 307 : 308, { ...headersFor(path), Location: redirect.destination })
    return res.end()
  }
  let file = join(dir, path)
  if (path.endsWith('/')) file = join(file, 'index.html')
  if (!(await isFile(file))) {
    const rewrite = vercel.rewrites.find(r => matches(r.source, path))
    // $1, $2 … er gruppene fra kilden (som hos Vercel)
    const groups = rewrite ? path.match(new RegExp(`^${rewrite.source}$`)) : null
    file = rewrite ? join(dir, rewrite.destination.replace(/\$(\d)/g, (_, n) => groups[n] ?? '')) : null
  }
  // Ingen fil og ingen omskriving som gir en fil: 404 med 404.html (antatt lik Vercel; sjekkes på forhåndsvisningen)
  if (!file || !(await isFile(file))) {
    const notFound = join(dir, '404.html')
    const page = (await isFile(notFound)) ? await readFile(notFound) : '404'
    res.writeHead(404, { ...headersFor(path), 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(page)
  }
  res.writeHead(200, { ...headersFor(path), 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
}).listen(Number(port))
