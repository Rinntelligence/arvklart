// Sjekker teknisk SEO mot en ekte utrulling hos Vercel: omskrivinger, robots.txt, sitemap.xml, forhåndsrendret
// HTML, canonical, noindex og sikkerhetshoder (test/seo/httpChecks.mjs). Den lokale etterligningen i e2e-testene
// er ikke bevis for hvordan Vercel tolker vercel.json, så dette kjøres på forhåndsvisningen før fletting og mot
// produksjon rett etter utrulling. Bare lesing (GET).
//
//   node scripts/check-seo.mjs https://<forhåndsvisning>.vercel.app
//   node scripts/check-seo.mjs https://www.arvklart.no --production
//
// Beskyttede forhåndsvisninger: sett VERCEL_AUTOMATION_BYPASS_SECRET (Vercel → Project Settings →
// Deployment Protection → Protection Bypass for Automation). Uten --production regnes adressen som en
// forhåndsvisning: Vercel setter da selv noindex, og fraværet av noindex på offentlige sider rapporteres som SKIP.
import { runHttpChecks } from '../test/seo/httpChecks.mjs'

const [base, ...flags] = process.argv.slice(2)
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Bruk: node scripts/check-seo.mjs <https://adresse> [--production]')
  process.exit(2)
}
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const headers = secret ? { 'x-vercel-protection-bypass': secret } : {}
const results = await runHttpChecks(base.replace(/\/$/, ''), { headers, preview: !flags.includes('--production') })
console.log(results.join('\n'))
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0)
