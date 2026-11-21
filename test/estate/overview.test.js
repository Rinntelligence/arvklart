// Oversikten i boet (src/lib/estateOverview.js): tallene, «Anbefalt nå» og hvilke valg administrator,
// arving og demo får i nedtrekksgruppene.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { overviewCounts, recommendation, overviewGroups } from '../../src/lib/estateOverview.js'
import { buildRemainingSteps } from '../../src/lib/estateProgress.js'

const admin = { user_id: 'a', role: 'admin', profiles: { display_name: 'Anne', email: 'anne@x.no' } }
const ola = { user_id: 'o', role: 'member', profiles: { display_name: 'Ola', email: 'ola@x.no' } }
const heirs = [
  { id: 'ha', name: 'Anne', email: 'anne@x.no', relationship: 'Barn', receives_items: true },
  { id: 'ho', name: 'Ola', email: 'ola@x.no', relationship: 'Barn', receives_items: true },
]
const want = (...ids) => ids.map(user_id => ({ user_id }))
const pass = (item_id, user_id) => ({ item_id, user_id })
const estate = { id: 'e', status: 'active' }
const extrasWith = passes => ({ members: [admin, ola], passes, heirs, tasks: [{ id: 't', completed: false }] })

// Lager alt oversikten trenger for én bruker, slik EstatePage gjør det
const overview = ({ items, passes = [], userId = 'a', isAdmin = true, isDemo = false, proposal = null, status = 'active' }) => {
  const extras = extrasWith(passes)
  const counts = overviewCounts({ items, userId, extras })
  const steps = buildRemainingSteps({ estateId: 'e', userId, items, ...extras, proposal })
  const args = { estateId: 'e', estate: { ...estate, status }, counts, steps, isAdmin, isDemo }
  return { counts, steps, next: recommendation(args), groups: overviewGroups(args) }
}
const linkKeys = groups => groups.flatMap(g => g.links.map(l => l.key))

describe('overviewCounts', () => {
  test('teller fordelt, ettertraktet, ingen vil ha, egne ønsker og egne svar', () => {
    const items = [
      { id: '1', status: 'assigned', interests: want('a') },
      { id: '2', interests: want('a', 'o') },
      { id: '3', interests: want('o') },
      { id: '4', interests: [] },
    ]
    const c = overviewCounts({ items, userId: 'a', extras: extrasWith([pass('3', 'a')]) })
    assert.deepEqual(
      { total: c.total, assigned: c.assigned, contested: c.contested, unwanted: c.unwanted, mine: c.mine, myContested: c.myContested, myUndecided: c.myUndecided, members: c.members, openTasks: c.openTasks },
      { total: 4, assigned: 1, contested: 1, unwanted: 1, mine: 2, myContested: 1, myUndecided: 1, members: 2, openTasks: 1 },
    )
  })

  test('mens status lastes (extras er null) er tallene som avhenger av dem tomme', () => {
    const c = overviewCounts({ items: [{ id: '1', interests: [] }], userId: 'a', extras: null })
    assert.equal(c.myUndecided, 0)
    assert.equal(c.members, null)
    assert.equal(c.openTasks, null)
  })
})

describe('recommendation («Anbefalt nå»)', () => {
  test('egne svar først, med samme tekst som før («Du har N gjenstander du ikke har tatt stilling til»)', () => {
    const { next } = overview({ items: [{ id: '1', interests: [] }, { id: '2', interests: [] }] })
    assert.equal(next.key, 'decide')
    assert.equal(next.title, 'Du har 2 gjenstander du ikke har tatt stilling til')
    assert.equal(next.path, '/estate/e/swipe')
  })

  test('entall: «1 gjenstand»', () => {
    const { next } = overview({ items: [{ id: '1', interests: [] }] })
    assert.equal(next.title, 'Du har 1 gjenstand du ikke har tatt stilling til')
  })

  test('et forslag til fordeling som venter på svar, går foran alt annet', () => {
    const { next } = overview({ items: [{ id: '1', interests: [] }], proposal: { needsMyResponse: true } })
    assert.equal(next.key, 'respond')
    assert.equal(next.path, '/estate/e/fordeling')
  })

  test('arving med ønsker andre også har: snakk sammen, til listen over ettertraktede', () => {
    const items = [{ id: '1', interests: want('a', 'o') }]
    const { next } = overview({ items, userId: 'o', isAdmin: false })
    assert.equal(next.key, 'talk')
    assert.equal(next.path, '/estate/e/gjenstander?vis=ettertraktede')
  })

  test('administrator: det første steget som gjenstår og har en side', () => {
    const items = [{ id: '1', interests: want('a', 'o') }]
    const { next } = overview({ items })
    assert.equal(next.key, 'conflicts')
    assert.equal(next.path, '/estate/e/conflicts')
  })

  test('arving som har svart på alt, mens andre ikke har: venter, med lenke til «Hva gjenstår»', () => {
    const items = [{ id: '1', interests: want('o') }]
    const { next } = overview({ items, userId: 'o', isAdmin: false })
    assert.equal(next.key, 'waiting')
    assert.match(next.text, /Anne: 1 gjenstand/)
    assert.equal(next.path, '/estate/e/status')
  })

  test('arving: steg bare administrator kan ta, gir «steg gjenstår», ikke en lenke til administratorens verktøy', () => {
    const items = [{ id: '1', interests: want('o') }]
    const { next } = overview({ items, passes: [pass('1', 'a')], userId: 'o', isAdmin: false })
    assert.equal(next.key, 'remaining')
    assert.equal(next.path, '/estate/e/status')
  })

  test('alt avklart: til fordelingen', () => {
    const items = [{ id: '1', status: 'assigned', interests: want('a'), assigned_heir_id: 'ha' }]
    const { next } = overview({ items })
    assert.equal(next.key, 'done')
    assert.equal(next.path, '/estate/e/fordeling')
  })

  test('tomt bo: legg til gjenstander; demoen får ingen anbefaling', () => {
    assert.equal(overview({ items: [] }).next.path, '/estate/e/add-many')
    assert.equal(overview({ items: [], isDemo: true }).next, null)
  })

  test('avsluttet bo: ingen anbefaling', () => {
    assert.equal(overview({ items: [{ id: '1', interests: [] }], status: 'closed' }).next, null)
  })

  test('mens status lastes: bare det som ikke trenger den', () => {
    const counts = overviewCounts({ items: [{ id: '1', interests: want('a', 'o') }], userId: 'a', extras: null })
    assert.equal(recommendation({ estateId: 'e', estate, counts, steps: null, isAdmin: true, isDemo: false }), null)
  })
})

describe('overviewGroups (nedtrekksgruppene)', () => {
  const items = [{ id: '1', interests: [] }]

  test('fire grupper i fast rekkefølge', () => {
    assert.deepEqual(overview({ items }).groups.map(g => g.key), ['gjenstander', 'fordeling', 'arvinger', 'praktisk'])
  })

  test('administrator i et vanlig bo ser alle valgene', () => {
    assert.deepEqual(linkKeys(overview({ items }).groups), [
      'swipe', 'add-many', 'add-one', 'items', 'mine',
      'conflicts', 'distribution', 'unwanted', 'status',
      'heirs', 'invite',
      'tasks', 'goodwill', 'documents', 'guide',
    ])
  })

  test('arving: ingen invitasjon (bare administrator), men arvingene og resten', () => {
    const keys = linkKeys(overview({ items, userId: 'o', isAdmin: false }).groups)
    assert.ok(!keys.includes('invite'))
    for (const k of ['swipe', 'add-many', 'items', 'mine', 'conflicts', 'distribution', 'heirs', 'documents', 'goodwill']) assert.ok(keys.includes(k), k)
  })

  test('demo: bare det demokontoen kan bruke (ingen administrer, dokumenter, oppgaver og bidrag eller lagring)', () => {
    const keys = linkKeys(overview({ items, isDemo: true }).groups)
    for (const k of ['invite', 'documents', 'goodwill', 'add-many', 'add-one']) assert.ok(!keys.includes(k), `demoen viser ${k}`)
    for (const k of ['swipe', 'add-ai', 'items', 'mine', 'conflicts', 'distribution', 'unwanted', 'status', 'heirs', 'tasks', 'guide']) assert.ok(keys.includes(k), `demoen mangler ${k}`)
  })

  test('alle lenker går til en side i boet', () => {
    for (const isDemo of [false, true]) for (const isAdmin of [false, true]) {
      for (const g of overview({ items, isDemo, isAdmin, userId: isAdmin ? 'a' : 'o' }).groups) {
        for (const l of g.links) assert.match(l.path, /^\/estate\/e\/[a-z-]+(\?vis=[a-z-]+)?$/, `${l.key}: ${l.path}`)
      }
    }
  })

  test('det som venter på deg, er uthevet: egne svar og ettertraktede', () => {
    const { groups } = overview({ items: [{ id: '1', interests: [] }, { id: '2', interests: want('a', 'o') }], passes: [pass('1', 'o')] })
    const link = key => groups.flatMap(g => g.links).find(l => l.key === key)
    assert.equal(link('swipe').badge, 1)
    assert.equal(link('conflicts').badge, 1)
    assert.equal(groups[0].hint, '1 venter på deg')
    assert.equal(groups[1].hint, '1 ettertraktede')
  })
})
