// Serverer det bygde nettstedet (dist/) med hodene og omskrivingen fra vercel.json, slik Vercel gjør, så
// e2e-testen av innholdsreglene (csp.mjs) kjører med de samme hodene som i produksjon. Supabase-adressen i
// CSP-en byttes til den simulerte (test.supabase.co). Bruk: node test/e2e/staticServer.mjs <dist> <port>
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const [dir = 'dist', port = '5180'] = process.argv.slice(2)
const vercel = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'))
const PROD = 'swmuztsejghweqmaogol.supabase.co'
const headers = Object.fromEntries(vercel.headers.flatMap(h => h.headers).map(({ key, value }) => [key, value.replaceAll(PROD, 'test.supabase.co')]))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' }

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '')
  let file = join(dir, path)
  // Som Vercel: finnes filen, serveres den; ellers index.html (rewrites i vercel.json)
  if (!(await stat(file).then(s => s.isFile(), () => false))) file = join(dir, 'index.html')
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' })
  res.end(await readFile(file))
}).listen(Number(port))
