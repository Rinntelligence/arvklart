// Visningsnavn for kategorier. Kategoriene lagres med norsk navn (CLAUDE.md); standardkategoriene vises på
// engelsk når grensesnittet er engelsk. Egne kategorier vises slik brukeren skrev dem.
import { L } from './lang'

const EN = {
  'Møbler': 'Furniture',
  'Kunst og bilder': 'Art and pictures',
  'Smykker og ur': 'Jewellery and watches',
  'Elektronikk': 'Electronics',
  'Kjøkken og porselen': 'Kitchen and porcelain',
  'Minner og arvestykker': 'Keepsakes and heirlooms',
  // Standardlisten i analyze-item
  'Bøker': 'Books',
  'Kjøkken': 'Kitchen',
  'Dekorasjoner': 'Decorations',
  'Klær og tekstiler': 'Clothing and textiles',
  'Smykker': 'Jewellery',
  'Verktøy': 'Tools',
  'Sportsutstyr': 'Sports equipment',
  'Samleobjekter': 'Collectibles',
  'Kjøretøy': 'Vehicles',
  'Dokumenter': 'Documents',
  'Annet': 'Other',
}

export const categoryLabel = (label) => (label ? L(label, EN[label] || label) : label)
