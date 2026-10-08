// Kategorimatching for AI-forslag, parallellkjøringen og «Slå sammen gjenstander» i «Legg til flere».
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { matchCategory, mergeSelectedPhotos, runPool } from '../../src/lib/itemAiHelpers.js'

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
