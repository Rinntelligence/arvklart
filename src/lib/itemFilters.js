// Filtrene i gjenstandslisten (EstateItemsPage): «Vis»-valget, kategori og søk.
// Valget står i adressen (?vis=…&kategori=…&sok=…), slik at lenker som «Mine ønsker» åpner riktig utvalg,
// og utvalget er det samme når man går tilbake fra en gjenstand. Ren logikk, testes med node --test.
import { isContested } from './estateProgress.js'
import { categoryLabel } from './categories.js'
import { L } from './lang.js'

const wantedBy = (item, userId) => !!item.interests?.some(x => x.user_id === userId)

// Rekkefølgen er rekkefølgen i nedtrekkslisten. key er verdien i adressen.
export const ITEM_FILTERS = [
  { key: 'alle', label: () => L('Alle gjenstander', 'All items'), test: () => true },
  { key: 'mine', label: () => L('Mine ønsker', 'My wishes'), test: (i, userId) => wantedBy(i, userId) },
  { key: 'ettertraktede', label: () => L('Ettertraktede', 'Contested'), test: i => isContested(i) },
  { key: 'noen-vil-ha', label: () => L('Noen vil ha', 'Wanted'), test: i => (i.interests?.length || 0) > 0 },
  { key: 'ingen-vil-ha', label: () => L('Ingen vil ha', 'Unwanted'), test: i => i.status !== 'assigned' && !i.interests?.length },
  { key: 'tildelt', label: () => L('Tildelt', 'Assigned'), test: i => i.status === 'assigned' },
]

// Ukjent eller manglende verdi i adressen gir «alle»
export const filterByKey = key => ITEM_FILTERS.find(f => f.key === key) || ITEM_FILTERS[0]

// Søk i navn, beskrivelse og kategori (både lagret norsk navn og det oversatte)
export const matchesSearch = (item, query) => {
  const q = (query || '').trim().toLocaleLowerCase('nb')
  if (!q) return true
  return [item.title, item.description, item.categories?.label, item.categories && categoryLabel(item.categories.label)]
    .some(t => t && String(t).toLocaleLowerCase('nb').includes(q))
}

// Gjenstandene som passer valget. category er en kategori-id eller 'alle'.
export function filterItems(items, { vis, category = 'alle', query = '' }, userId) {
  const f = filterByKey(vis)
  return items.filter(i => f.test(i, userId)
    && (category === 'alle' || i.category_id === category)
    && matchesSearch(i, query))
}

// Antall gjenstander per filter (uten kategori og søk), til nedtrekkslisten
export const filterCounts = (items, userId) =>
  Object.fromEntries(ITEM_FILTERS.map(f => [f.key, items.filter(i => f.test(i, userId)).length]))
