// Sjekker teknisk SEO mot en ekte utrulling hos Vercel: omskrivinger, robots.txt, sitemap.xml, forhåndsrendret
// HTML, canonical, noindex og sikkerhetshoder (test/seo/httpChecks.mjs). Den lokale etterligningen i e2e-testene
// er ikke bevis for hvordan Vercel tolker vercel.json, så dette kjøres på forhåndsvisningen før fletting og mot
// produksjon rett etter utrulling. Bare lesing (GET). Skriptet rapporterer; det ruller ikke tilbake noe.
//
//   node scripts/check-seo.mjs https://<forhåndsvisning>.vercel.app
//   node scripts/check-seo.mjs https://www.arvklart.no --production
//
// Beskyttede forhåndsvisninger: sett VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Project Settings →
// Deployment Protection → Protection Bypass for Automation). Uten --production regnes adressen som en
// forhåndsvisning: Vercel setter da selv noindex, og fraværet av noindex på offentlige sider rapporteres som SKIP.
// Med --production sjekkes også at arvklart.no og http:// sendes permanent (301/308) til https://www.arvklart.no.
// Utskriften starter med en rapport (INFO) over faktisk status og hoder per sti.
import { runHttpChecks, httpReport, domainChecks } from '../test/seo/httpChecks.mjs'

const [base, ...flags] = process.argv.slice(2)
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Bruk: node scripts/check-seo.mjs <https://adresse> [--production]')
  process.exit(2)
}
const production = flags.includes('--production')
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const headers = secret ? { 'x-vercel-protection-bypass': secret } : {}
const url = base.replace(/\/$/, '')
const report = await httpReport(url, { headers })
const results = await runHttpChecks(url, { headers, preview: !production })
if (production) results.push(...await domainChecks())
console.log([`Sjekker ${url} (${production ? 'produksjon' : 'forhåndsvisning'}${secret ? ', med bypass-hemmelighet' : ''})`, ...report, '', ...results].join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
