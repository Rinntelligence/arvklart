// Filtrene i gjenstandslisten (src/lib/itemFilters.js): samme regler som fanene på den gamle bo-siden.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { ITEM_FILTERS, filterByKey, filterItems, filterCounts, matchesSearch } from '../../src/lib/itemFilters.js'

const want = (...ids) => ids.map(user_id => ({ user_id }))
const items = [
  { id: 'tildelt', title: 'Klokke', status: 'assigned', interests: want('a'), category_id: 'm' },
  { id: 'flere', title: 'Gyngestol', description: 'Eik', interests: want('a', 'b'), category_id: 'm', categories: { label: 'Møbler' } },
  { id: 'en', title: 'Lampe', interests: want('b'), category_id: 'k' },
  { id: 'ingen', title: 'Sofa', interests: [], category_id: 'm' },
]
const ids = list => list.map(i => i.id)

describe('filterItems', () => {
  test('hvert «Vis»-valg', () => {
    const vis = key => ids(filterItems(items, { vis: key }, 'a'))
    assert.deepEqual(vis('alle'), ['tildelt', 'flere', 'en', 'ingen'])
    assert.deepEqual(vis('mine'), ['tildelt', 'flere'])
    assert.deepEqual(vis('ettertraktede'), ['flere'])
    assert.deepEqual(vis('noen-vil-ha'), ['tildelt', 'flere', 'en'])
    assert.deepEqual(vis('ingen-vil-ha'), ['ingen'])
    assert.deepEqual(vis('tildelt'), ['tildelt'])
  })

  test('ukjent eller manglende valg i adressen gir alle', () => {
    assert.equal(filterByKey('finnes-ikke').key, 'alle')
    assert.equal(filterByKey(null).key, 'alle')
    assert.equal(filterItems(items, { vis: 'tull' }, 'a').length, 4)
  })

  test('kategori og søk kombineres med valget', () => {
    assert.deepEqual(ids(filterItems(items, { vis: 'alle', category: 'm' }, 'a')), ['tildelt', 'flere', 'ingen'])
    assert.deepEqual(ids(filterItems(items, { vis: 'mine', category: 'm', query: 'gynge' }, 'a')), ['flere'])
  })

  test('søk i navn, beskrivelse og kategori, uten å skille store og små bokstaver', () => {
    assert.ok(matchesSearch(items[1], 'GYNGE'))
    assert.ok(matchesSearch(items[1], 'eik'))
    assert.ok(matchesSearch(items[1], 'møbler'))
    assert.ok(!matchesSearch(items[1], 'lampe'))
    assert.ok(matchesSearch(items[1], '   '))
  })
})

test('filterCounts gir antallet til hvert valg i nedtrekkslisten', () => {
  assert.deepEqual(filterCounts(items, 'a'), { 'alle': 4, 'mine': 2, 'ettertraktede': 1, 'noen-vil-ha': 3, 'ingen-vil-ha': 1, 'tildelt': 1 })
  assert.equal(ITEM_FILTERS.length, 6)
})
