// Sidene i den innloggede appen, lastet ved behov (src/lib/lazyPage.js). Offentlige sider og innlogging
// (LandingPage, ContactPage, LoginPage, ResetPasswordPage, GuidePage, OtherPages) importeres direkte i App.jsx:
// de forhåndsrendres og hydreres (src/seo/vitePlugin.js), og må være i hovedfilen.
import { lazyPage } from './lib/lazyPage'

export const ProfileSetupPage = lazyPage(() => import('./pages/ProfileSetupPage'))
export const EstatesPage = lazyPage(() => import('./pages/EstatesPage'))
export const EstatePage = lazyPage(() => import('./pages/EstatePage'))
export const ItemDetailPage = lazyPage(() => import('./pages/ItemDetailPage'))
export const AddItemPage = lazyPage(() => import('./pages/AddItemPage'))
export const AddItemsPage = lazyPage(() => import('./pages/AddItemsPage'))
export const SwipePage = lazyPage(() => import('./pages/SwipePage'))
export const EditItemPage = lazyPage(() => import('./pages/EditItemPage'))
export const AdminPage = lazyPage(() => import('./pages/AdminPage'))
export const FounderPage = lazyPage(() => import('./pages/FounderPage'))
export const TasksPage = lazyPage(() => import('./pages/TasksPage'))
export const DocumentVaultPage = lazyPage(() => import('./pages/DocumentVaultPage'))
export const HeirsPage = lazyPage(() => import('./pages/HeirsPage'))
export const GoodwillPage = lazyPage(() => import('./pages/GoodwillPage'))
export const ConflictPage = lazyPage(() => import('./pages/ConflictPage'))
export const UnwantedPage = lazyPage(() => import('./pages/UnwantedPage'))
export const DistributionPage = lazyPage(() => import('./pages/DistributionPage'))
export const StatusPage = lazyPage(() => import('./pages/StatusPage'))

const ALL = [ProfileSetupPage, EstatesPage, EstatePage, ItemDetailPage, AddItemPage, AddItemsPage, SwipePage, EditItemPage,
  AdminPage, FounderPage, TasksPage, DocumentVaultPage, HeirsPage, GoodwillPage, ConflictPage, UnwantedPage, DistributionPage, StatusPage]

// Etter innlogging hentes resten av appen i bakgrunnen når nettleseren er ledig, så navigering ikke venter på nett.
export function preloadAppPages() {
  const run = () => ALL.forEach(p => p.preload())
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1500)
}
