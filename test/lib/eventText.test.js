// Tekst for fordelingsloggen (src/lib/eventText.js)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DELETED_USER, eventText, makeNameOf } from '../../src/lib/eventText.js'

const nameOf = makeNameOf([{ user_id: 'a', profiles: { display_name: 'Kari' } }, { user_id: 'b', profiles: { display_name: 'Lars' } }])

test('tildeling, angring og loddtrekning med navn og metode', () => {
  assert.equal(eventText({ kind: 'assigned', actor: 'b', data: { to: 'a', method: 'lottery' } }, nameOf), 'Lars tildelte gjenstanden til Kari (etter loddtrekning)')
  assert.equal(eventText({ kind: 'unassigned', actor: 'b', data: { from: 'a' } }, nameOf), 'Lars angret tildelingen til Kari')
  assert.equal(eventText({ kind: 'lottery_draw', actor: 'b', data: { candidates: ['a', 'b'], winner: 'a', draw_no: 2 } }, nameOf), 'Loddtrekning nr. 2 blant Kari, Lars: Kari ble trukket')
})

test('ønsker og nei takk; ukjente og slettede brukere får en fast tekst', () => {
  assert.equal(eventText({ kind: 'wish_added', actor: 'a', data: { user_id: 'a' } }, nameOf), 'Kari ønsker denne')
  assert.equal(eventText({ kind: 'pass_added', actor: 'x', data: { user_id: 'x' } }, nameOf), 'tidligere medlem sa nei takk')
  assert.equal(eventText({ kind: 'wish_removed', actor: null, data: { user_id: DELETED_USER } }, nameOf), 'slettet bruker trakk ønsket sitt')
})

test('fordelingsverdi og arveandeler', () => {
  assert.match(eventText({ kind: 'agreed_value_set', actor: 'b', data: { value: 1200, source: 'ai' } }, nameOf), /^Lars satte fordelingsverdi .*1.?200.* fra AI-anslaget$/)
  assert.equal(eventText({ kind: 'agreed_value_set', actor: 'b', data: { value: null } }, nameOf), 'Lars fjernet fordelingsverdien')
  assert.equal(eventText({ kind: 'shares_unconfirmed', actor: null, data: { reason: 'heirs_changed' } }, nameOf), 'Bekreftelsen av arveandelene ble nullstilt fordi arvelisten ble endret')
})
