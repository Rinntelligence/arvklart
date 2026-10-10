// Protokollen som PDF (src/lib/distributionPdf.js): riktig status, delvis fordeling og vannmerke
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDistributionPdf } from '../../src/lib/distributionPdf.js'
import { summarizeDistribution } from '../../src/lib/distributionSummary.js'

const members = [{ user_id: 'k', profiles: { display_name: 'Kari' } }, { user_id: 'l', profiles: { display_name: 'Lars' } }]
const items = [
  { id: 'a', title: 'Gyngestol', status: 'assigned', assigned_to: 'k', agreed_value: 3000, interests: [] },
  { id: 'b', title: 'Symaskin', disposition: 'donate', interests: [] },
  { id: 'c', title: 'Maleri', interests: [{ user_id: 'k' }, { user_id: 'l' }] },
]
const textOf = doc => doc.output()

test('utkast: vannmerke, delvis fordeling og det som ikke er avklart står for seg', () => {
  const pdf = textOf(buildDistributionPdf({ estateName: 'Testbo', summary: summarizeDistribution({ items, members }), kind: 'draft' }))
  for (const s of ['UTKAST', 'Delvis fordeling', 'Ikke avklart', 'Gyngestol', 'Gis bort', 'Maleri', 'ikke juridisk verifiserte elektroniske signaturer', 'ikke kontrollert juridisk av Arvklart']) assert.ok(pdf.includes(s), `mangler «${s}»`)
})

test('papirversjon har signaturfelt; endelig versjon sier registrert godkjenning', () => {
  const summary = summarizeDistribution({ items: items.slice(0, 2), members })
  const paper = textOf(buildDistributionPdf({ estateName: 'Testbo', summary, kind: 'paper', deciders: [{ name: 'Kari' }, { name: 'Lars' }] }))
  assert.ok(paper.includes('Ikke godkjent digitalt') && paper.includes('Signatur og dato'))
  assert.ok(!paper.includes('Delvis fordeling'))
  const final = textOf(buildDistributionPdf({ estateName: 'Testbo', summary, kind: 'final', deciders: [{ name: 'Kari', statusText: 'Godkjent' }] }))
  assert.ok(final.includes('registrert sin godkjenning i Arvklart') && !final.includes('UTKAST'))
})
