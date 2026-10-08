// Kategorimatching for AI-forslag, parallellkjøringen og «Slå sammen gjenstander» i «Legg til flere».
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { addCapturedPhotos, matchCategory, mergeSelectedPhotos, removePhotoAt, restoreRemoved, runPool, splitDraft } from '../../src/lib/itemAiHelpers.js'

const categories = [
  { id: 1, label: 'Møbler' },
  { id: 2, label: 'Kunst og bilder' },
  { id: 3, label: 'Smykker og klokker' },
  { id: 4, label: 'Annet' },
]

describe('matchCategory', () => {
  test('nøyaktig navn, uavhengig av store bokstaver', () => {
    assert.equal(matchCategory(categories, 'møbler').id, 1)
    assert.equal(matchCategory(categories, ' Annet ').id, 4)
  })

  test('delvis navn i begge retninger', () => {
    assert.equal(matchCategory(categories, 'Smykker').id, 3)
    assert.equal(matchCategory(categories, 'Kunst og bilder (malerier)').id, 2)
  })

  test('ingen treff eller tomt forslag', () => {
    assert.equal(matchCategory(categories, 'Kjøretøy'), null)
    assert.equal(matchCategory(categories, ''), null)
    assert.equal(matchCategory(categories, undefined), null)
  })
})

describe('runPool', () => {
  test('kjører alle, høyst limit samtidig', async () => {
    let running = 0, peak = 0
    const done = []
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++; peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 5))
      done.push(n)
      running--
    })
    assert.equal(peak, 3)
    assert.deepEqual(done.sort(), [1, 2, 3, 4, 5, 6, 7])
  })

  test('starter ikke nye når shouldStop blir sann', async () => {
    const started = []
    let stop = false
    await runPool([1, 2, 3, 4, 5], 1, async (n) => {
      started.push(n)
      if (n === 2) stop = true
    }, () => stop)
    assert.deepEqual(started, [1, 2])
  })

  test('tom liste', async () => {
    await runPool([], 3, async () => { throw new Error('skal ikke kjøres') })
  })
})

describe('mergeSelectedPhotos', () => {
  const photo = (url) => ({ url })
  const draft = (key, urls, title = '', status = 'idle') => ({ key, photos: urls.map(photo), title, status })
  const summary = (drafts) => drafts.map(d => `${d.key}:${d.photos.map(p => p.url).join(',')}${d.title ? `(${d.title})` : ''}`)

  test('samler valgte bilder i den første gjenstanden, i valgt rekkefølge', () => {
    const drafts = [draft(1, ['a']), draft(2, ['b']), draft(3, ['c']), draft(4, ['d'])]
    assert.deepEqual(summary(mergeSelectedPhotos(drafts, ['c', 'a', 'd'])), ['1:c,a,d', '2:b'])
  })

  test('gjenstanden med navn beholdes, og bilder som ikke er valgt blir igjen', () => {
    const drafts = [draft(1, ['a', 'x']), draft(2, ['b'], 'Gyngestol', 'analyzed'), draft(3, ['c'])]
    const out = mergeSelectedPhotos(drafts, ['a', 'b'])
    assert.deepEqual(summary(out), ['1:x', '2:a,b(Gyngestol)', '3:c'])
    assert.equal(out[1].status, 'idle')
  })

  test('gjenstand med navn som mister alle bildene beholdes', () => {
    const drafts = [draft(1, ['a'], 'Lampe'), draft(2, ['b'], 'Bord')]
    assert.deepEqual(summary(mergeSelectedPhotos(drafts, ['b', 'a'])), ['1:b,a(Lampe)', '2:(Bord)'])
  })

  test('færre enn to bilder endrer ingenting', () => {
    const drafts = [draft(1, ['a']), draft(2, ['b'])]
    assert.equal(mergeSelectedPhotos(drafts, ['a']), drafts)
    assert.equal(mergeSelectedPhotos(drafts, ['a', 'ukjent']), drafts)
  })
})

// ── Kamera og gruppering (scenario A–D i fase 1) ──────────────────────────────────────────────────
describe('kamera: ett bilde per gjenstand som standard', () => {
  let n = 0
  const makeDraft = () => ({ key: `k${++n}`, photos: [], title: '', status: 'idle' })
  const shot = (url) => ({ url })
  const opts = { maxPhotos: 5, maxItems: 20, makeDraft }
  const shoot = (state, url, sameItem = false) => {
    const r = addCapturedPhotos(state.drafts, { ...opts, currentKey: state.currentKey, sameItem, photos: [shot(url)] })
    return { drafts: r.drafts, currentKey: r.currentKey, created: r.created, rejected: r.rejected }
  }
  const layout = (drafts) => drafts.map(d => d.photos.map(p => p.url).join('+'))

  test('A: sju bilder etter hverandre blir sju gjenstander, uten ekstra trykk', () => {
    let s = { drafts: [], currentKey: null }
    for (const u of ['1', '2', '3', '4', '5', '6', '7']) s = shoot(s, u)
    assert.deepEqual(layout(s.drafts), ['1', '2', '3', '4', '5', '6', '7'])
  })

  test('B: «flere bilder av denne» legger tre bilder på samme gjenstand', () => {
    let s = { drafts: [], currentKey: null }
    s = shoot(s, 'a')
    s = shoot(s, 'b', true)
    s = shoot(s, 'c', true)
    s = shoot(s, 'neste')            // tilbake til standard: ny gjenstand
    assert.deepEqual(layout(s.drafts), ['a+b+c', 'neste'])
  })

  test('«Neste gjenstand» lager et tomt utkast som fylles av neste bilde', () => {
    let s = { drafts: [], currentKey: null }
    s = shoot(s, 'a', true)
    const empty = makeDraft()
    s = { drafts: [...s.drafts, empty], currentKey: empty.key }
    s = shoot(s, 'b', true)
    assert.deepEqual(layout(s.drafts), ['a', 'b'])
  })

  test('maks bilder per gjenstand og maks gjenstander: bildet avvises i stedet for å havne feil', () => {
    let s = { drafts: [], currentKey: null }
    s = shoot(s, '1')
    for (const u of ['2', '3', '4', '5']) s = shoot(s, u, true)
    s = shoot(s, '6', true)
    assert.equal(s.rejected, 1)
    assert.deepEqual(layout(s.drafts), ['1+2+3+4+5'])
    const full = addCapturedPhotos(Array.from({ length: 20 }, (_, i) => ({ key: `f${i}`, photos: [shot(`f${i}`)], title: '', status: 'idle' })),
      { ...opts, currentKey: 'f19', sameItem: false, photos: [shot('x')] })
    assert.equal(full.rejected, 1)
    assert.equal(full.drafts.length, 20)
  })

  test('lagrede gjenstander får aldri nye bilder', () => {
    const drafts = [{ key: 's', photos: [shot('a')], title: 'Lagret', status: 'saved' }]
    const r = addCapturedPhotos(drafts, { ...opts, currentKey: 's', sameItem: true, photos: [shot('b')] })
    assert.deepEqual(layout(r.drafts), ['a', 'b'])
    assert.equal(r.drafts[0].status, 'saved')
  })
})

describe('slette bilde og angre (scenario C)', () => {
  const d = (key, urls, title = '') => ({ key, photos: urls.map(url => ({ url })), title, status: 'idle' })
  const layout = (drafts) => drafts.map(x => `${x.key}:${x.photos.map(p => p.url).join('+')}`)

  test('siste bilde av en gjenstand uten navn fjerner gjenstanden, og angre setter den tilbake på samme plass', () => {
    const drafts = [d('a', ['1']), d('b', ['2']), d('c', ['3'])]
    const { drafts: after, removed } = removePhotoAt(drafts, 'b', 0)
    assert.deepEqual(layout(after), ['a:1', 'c:3'])
    assert.ok(removed.draftRemoved)
    assert.deepEqual(layout(restoreRemoved(after, removed)), ['a:1', 'b:2', 'c:3'])
  })

  test('gjenstand med navn beholdes uten bilder; angre legger bildet tilbake på riktig plass', () => {
    const drafts = [d('a', ['1', '2', '3'], 'Stol')]
    const { drafts: after, removed } = removePhotoAt(drafts, 'a', 1)
    assert.deepEqual(layout(after), ['a:1+3'])
    assert.deepEqual(layout(restoreRemoved(after, removed)), ['a:1+2+3'])
    const { drafts: empty } = removePhotoAt([d('a', ['1'], 'Stol')], 'a', 0)
    assert.deepEqual(layout(empty), ['a:'])
  })

  test('angre to ganger legger ikke inn bildet dobbelt', () => {
    const { drafts: after, removed } = removePhotoAt([d('a', ['1', '2'])], 'a', 0)
    const once = restoreRemoved(after, removed)
    assert.deepEqual(layout(restoreRemoved(once, removed)), ['a:1+2'])
  })

  test('angre uten tidsfrist: full gjenstand eller full liste endres ikke', () => {
    // Bilde slettet, så tatt et nytt: gjenstanden har igjen 2 av 2 bilder
    const { drafts: after, removed } = removePhotoAt([d('a', ['1', '2'], 'Stol')], 'a', 0)
    const refilled = after.map(x => ({ ...x, photos: [...x.photos, { url: '3' }] }))
    assert.equal(restoreRemoved(refilled, removed, { maxPhotos: 2 }), refilled)
    // Gjenstand fjernet, så er listen fylt opp
    const { drafts: after2, removed: removed2 } = removePhotoAt([d('a', ['1']), d('b', ['2'])], 'b', 0)
    const full = [...after2, d('c', ['3'])]
    assert.equal(restoreRemoved(full, removed2, { maxItems: 2 }), full)
    assert.deepEqual(layout(restoreRemoved(after2, removed2, { maxItems: 2 })), ['a:1', 'b:2'])
  })
})

describe('dele opp feil gruppering (scenario D)', () => {
  let n = 0
  const makeDraft = () => ({ key: `ny${++n}`, photos: [], title: '', status: 'idle' })
  test('fem bilder på én gjenstand blir fem gjenstander i samme rekkefølge; den første beholder feltene', () => {
    const drafts = [{ key: 'x', photos: [], title: 'Før', status: 'idle' },
      { key: 'g', photos: ['1', '2', '3', '4', '5'].map(url => ({ url })), title: 'Gyngestol', status: 'analyzed' },
      { key: 'y', photos: [{ url: '9' }], title: '', status: 'idle' }]
    const out = splitDraft(drafts, 'g', makeDraft)
    assert.deepEqual(out.map(x => x.photos.map(p => p.url).join('')), ['', '1', '2', '3', '4', '5', '9'])
    assert.equal(out[1].title, 'Gyngestol')
    assert.equal(out[1].status, 'idle', 'må analyseres på nytt')
    assert.ok(out.slice(2, 6).every(x => x.title === '' && x.key.startsWith('ny')))
  })
  test('én eller ingen bilder: uendret', () => {
    const drafts = [{ key: 'g', photos: [{ url: '1' }], title: '', status: 'idle' }]
    assert.equal(splitDraft(drafts, 'g', makeDraft), drafts)
  })
})
