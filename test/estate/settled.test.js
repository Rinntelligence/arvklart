// «Avklart gjenstand» (pendingMembersFor/isSettled) mot de felles tilfellene i test/fixtures/settled_cases.json,
// som også kjøres mot item_pending_members() i databasen (test/db/rls.sql).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pendingMembersFor, isSettled, getUndecided } from '../../src/lib/estateProgress.js'

const { cases } = JSON.parse(readFileSync(new URL('../fixtures/settled_cases.json', import.meta.url), 'utf8'))

const build = c => ({
  item: { id: 'i', status: 'active', interests: c.interests.map(user_id => ({ user_id })) },
  members: c.members.map(m => ({ user_id: m.id, role: m.role || 'member', profiles: { email: m.email } })),
  passes: c.passes.map(user_id => ({ item_id: 'i', user_id })),
  heirs: c.heirs.map((h, n) => ({ id: `h${n}`, name: `H${n}`, ...h })),
})

for (const c of cases) {
  test(`avklart: ${c.name}`, () => {
    const { item, members, passes, heirs } = build(c)
    assert.deepEqual(pendingMembersFor(item, members, passes, heirs).map(m => m.user_id).sort(), [...c.pending].sort())
    assert.equal(isSettled(item, members, passes, heirs), c.pending.length === 0)
    // Samme svar som getUndecided (som «Hva gjenstår» og Løsningsmetoder bruker)
    const undecided = getUndecided([item], members, passes, heirs).map(u => u.member.user_id).sort()
    assert.deepEqual(undecided, [...c.pending].sort())
  })
}
