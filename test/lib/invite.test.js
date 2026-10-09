import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inviteMessage } from '../../src/lib/invite.js'

test('invitasjonsmeldingen har navn, bo, e-post og lenke, på valgt språk', () => {
  const args = { name: 'Kari', email: 'kari@test.no', estateName: 'Boet etter mor', url: 'https://arvklart.no/join/ABC123' }
  const no = inviteMessage({ ...args, lang: 'no' })
  const en = inviteMessage({ ...args, lang: 'en' })
  for (const m of [no, en]) for (const v of Object.values(args)) assert.ok(m.includes(v), `${v} mangler i «${m}»`)
  assert.match(no, /^Hei Kari!/)
  assert.match(en, /^Hi Kari!/)
})
