// Tekster for disponering (items.disposition), uten Supabase-avhengighet så de kan brukes i PDF og tester
import { L } from './lang.js'

export const DISPOSITIONS = ['sell', 'donate', 'discard']
export const dispositionLabel = d => ({
  sell: L('Selges', 'To be sold'),
  donate: L('Gis bort', 'To be given away'),
  discard: L('Kastes', 'To be discarded'),
}[d] || L('Ikke bestemt', 'Not decided'))
export const dispositionAction = d => ({ sell: L('Selg', 'Sell'), donate: L('Gi bort', 'Give away'), discard: L('Kast', 'Discard') }[d] || L('Bestem senere', 'Decide later'))
