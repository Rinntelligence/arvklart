import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { getEstate, getItems, getCategories, supabase } from '../lib/supabase'
import { loadStatusExtras } from '../lib/decisions'
import { proposalForMe } from '../lib/approval'

// Henter et bo med gjenstander, kategorier og egen rolle, og laster på nytt når gjenstander, ønsker eller
// «nei takk» endres (sanntid). Brukes av oversikten (EstatePage) og gjenstandslisten (EstateItemsPage).
//
// withProgress: hent også det som trengs for å vite hva som gjenstår (medlemmer, «nei takk», arvinger,
// oppgaver) og om et forslag til fordeling venter på svar fra brukeren. Det lastes etter resten, så siden
// vises med en gang; extras er null til det er klart.
//
// Et svar som kommer etter et nyere kall (eller etter at siden er forlatt), brukes ikke.
export function useEstateData(estateId, userId, { withProgress = false } = {}) {
  const [data, setData] = useState({ loading: true, estate: null, items: [], categories: [], myRole: 'member', extras: null, proposal: null })
  const latest = useRef(0)
  // Eget kanalnavn per side: Supabase gjenbruker en kanal med samme navn, og fra oversikten til
  // gjenstandslisten er den forrige sidens kanal ikke lukket ennå. Lyttere kan ikke legges til en kanal
  // som allerede abonnerer (det gir en feil), så de to sidene må ha hver sin.
  const channelId = useId()

  const load = useCallback(async () => {
    const run = ++latest.current
    const [{ data: estate }, { data: items }, { data: categories }, { data: membership }] = await Promise.all([
      getEstate(estateId),
      getItems(estateId),
      getCategories(estateId),
      supabase.from('estate_members').select('role').eq('estate_id', estateId).eq('user_id', userId).single(),
    ])
    if (run !== latest.current) return
    setData(d => ({ ...d, loading: false, estate, items: items || [], categories: categories || [], myRole: membership?.role || 'member' }))
    if (!withProgress) return
    const [extras, proposal] = await Promise.all([
      loadStatusExtras(estateId),
      proposalForMe(estateId, userId).catch(() => null),
    ])
    if (run !== latest.current) return
    setData(d => ({ ...d, extras, proposal }))
  }, [estateId, userId, withProgress])

  useEffect(() => {
    setData(d => ({ ...d, loading: true }))
    load()
    const channel = supabase.channel(`estate-${estateId}-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `estate_id=eq.${estateId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'item_passes' }, load)
      .subscribe()
    return () => {
      latest.current++ // svar som kommer etter at siden er forlatt, ignoreres
      supabase.removeChannel(channel)
    }
  }, [load, estateId, channelId])

  return { ...data, reload: load }
}
