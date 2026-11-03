// Innhold en forhåndsrendret side trenger for å vises likt i nettleseren (i dag: guidene). Byggesteget legger det i
// HTML-en som en datablokk (<script type="application/json" id="page-data">, ikke et skript; CSP-en stopper det
// ikke), og main.jsx og prerender.jsx gir det videre med PageDataContext. Teksten havner dermed ikke i
// JavaScript-filene, så budsjettet for offentlige sider holder uansett hvor mange guider som publiseres.
import { createContext, useContext } from 'react'

export const PAGE_DATA_ID = 'page-data'
export const PageDataContext = createContext(null)
export const usePageData = () => useContext(PageDataContext)

export function readPageData() {
  try { return JSON.parse(document.getElementById(PAGE_DATA_ID)?.textContent || 'null') } catch { return null }
}
