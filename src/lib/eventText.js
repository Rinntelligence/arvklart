// Tekst for hendelsene i fordelingsloggen (estate_events) på brukerens språk. Brukes i «Historikk» og
// senere i protokollen. nameOf(userId) gir visningsnavnet; ukjente og slettede brukere får en fast tekst.
import { L } from './lang.js'
import { formatNOK } from './format.js'

const formatKr = v => formatNOK(Number(v))

export const DELETED_USER = '00000000-0000-0000-0000-000000000000'

export const methodLabel = m => ({
  manual: L('valgt av administrator', 'chosen by the administrator'),
  lottery: L('etter loddtrekning', 'after drawing lots'),
  snake: L('i runder', 'in rounds'),
  equal: L('etter jevn verdifordeling', 'by equal value'),
}[m] || '')

export function makeNameOf(members = []) {
  const names = new Map(members.map(m => [m.user_id, m.profiles?.display_name || m.display_name]))
  return id => (id === DELETED_USER ? L('slettet bruker', 'deleted user') : names.get(id) || L('tidligere medlem', 'former member'))
}

export function eventText(e, nameOf) {
  const d = e.data || {}
  const who = e.actor ? nameOf(e.actor) : L('Arvklart', 'Arvklart')
  switch (e.kind) {
    case 'assigned': return L(`${who} tildelte gjenstanden til ${nameOf(d.to)} (${methodLabel(d.method)})`, `${who} assigned the item to ${nameOf(d.to)} (${methodLabel(d.method)})`)
    case 'unassigned': return L(`${who} angret tildelingen til ${nameOf(d.from)}`, `${who} undid the assignment to ${nameOf(d.from)}`)
    case 'lottery_draw': {
      const names = (d.candidates || []).map(nameOf).join(', ')
      return L(`Loddtrekning nr. ${d.draw_no} blant ${names}: ${nameOf(d.winner)} ble trukket`, `Draw no. ${d.draw_no} among ${names}: ${nameOf(d.winner)} was drawn`)
    }
    case 'wish_added': return L(`${nameOf(d.user_id)} ønsker denne`, `${nameOf(d.user_id)} wants this`)
    case 'wish_removed': return L(`${nameOf(d.user_id)} trakk ønsket sitt`, `${nameOf(d.user_id)} withdrew their wish`)
    case 'pass_added': return L(`${nameOf(d.user_id)} sa nei takk`, `${nameOf(d.user_id)} said no thanks`)
    case 'pass_removed': return L(`${nameOf(d.user_id)} angret «nei takk»`, `${nameOf(d.user_id)} undid «no thanks»`)
    case 'agreed_value_set': {
      const src = { ai: L('fra AI-anslaget', 'from the AI estimate'), heir: L('fra en arvings forslag', 'from an heir’s suggestion'), manual: L('manuelt', 'manually') }[d.source] || ''
      return d.value === null || d.value === undefined
        ? L(`${who} fjernet fordelingsverdien`, `${who} removed the distribution value`)
        : L(`${who} satte fordelingsverdi ${formatKr(d.value)} ${src}`, `${who} set the distribution value to ${formatKr(d.value)} ${src}`)
    }
    case 'heir_linked': return L(`${nameOf(d.user_id)} ble koblet til arvelisten ved å bli med via invitasjonen`, `${nameOf(d.user_id)} was linked to the list of heirs by joining via the invitation`)
    case 'shares_confirmed': return L(`${who} bekreftet at arveandelene gjelder fordelingen av innbo og løsøre`, `${who} confirmed that the inheritance shares apply to the household contents`)
    case 'shares_unconfirmed': return d.reason === 'heirs_changed'
      ? L('Bekreftelsen av arveandelene ble nullstilt fordi arvelisten ble endret', 'The confirmation of the shares was reset because the list of heirs changed')
      : L(`${who} trakk bekreftelsen av arveandelene`, `${who} withdrew the confirmation of the shares`)
    default: return L('Endring registrert', 'Change recorded')
  }
}
