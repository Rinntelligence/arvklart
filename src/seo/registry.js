// Registeret over offentlige sider i nettleseren: markedssidene (pages.js) og de publiserte guidene, som
// byggesteget gir som den virtuelle modulen «virtual:arvklart-guides» (bare metadata, ingen tekst, aldri utkast).
// Brukes der nettleseren må vite om en sti er offentlig: RouteMeta (tittel og canonical) og statistikk
// (AnalyticsConsent slår opp siden her og gir den til canLoadAnalytics i src/lib/analytics.js).
import { PUBLIC_PAGES } from './pages.js'
import { GUIDES } from 'virtual:arvklart-guides'

export const REGISTRY = [...PUBLIC_PAGES, ...GUIDES]
export const pageFor = (path) => REGISTRY.find(p => p.path === path) || null
