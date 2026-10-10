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
    case 'disposition_set': {
      const label = { sell: L('selges', 'be sold'), donate: L('gis bort', 'be given away'), discard: L('kastes', 'be discarded') }[d.disposition]
      if (d.reason === 'assigned') return L('Disponeringen ble fjernet fordi gjenstanden ble tildelt en arving', 'The disposition was removed because the item was assigned to an heir')
      return label ? L(`${who} foreslo at gjenstanden skal ${label}`, `${who} proposed that the item should ${label}`) : L(`${who} satte gjenstanden tilbake til «ikke bestemt»`, `${who} set the item back to «not decided»`)
    }
    case 'heir_added': return L(`${who} la ${d.name} til på arvelisten${d.must_approve ? '' : ' (godkjenner ikke)'}`, `${who} added ${d.name} to the list of heirs${d.must_approve ? '' : ' (does not approve)'}`)
    case 'heir_removed': return L(`${who} fjernet ${d.name} fra arvelisten`, `${who} removed ${d.name} from the list of heirs`)
    case 'heir_changed': return L(`${who} endret ${d.name} på arvelisten`, `${who} changed ${d.name} on the list of heirs`)
    case 'decider_added': return L(`${who} gjorde ${d.name} til beslutningstaker`, `${who} made ${d.name} a decision-maker`)
    case 'decider_removal_requested': return L(`${who} ba om at ${d.name} ikke skal godkjenne fordelingen («${d.reason}»)`, `${who} requested that ${d.name} should not approve the distribution («${d.reason}»)`)
    case 'decider_removed': return d.by_self
      ? L(`${d.name} valgte å ikke godkjenne fordelingen («${d.reason}»)`, `${d.name} chose not to approve the distribution («${d.reason}»)`)
      : L(`${who} bekreftet at ${d.name} ikke skal godkjenne fordelingen`, `${who} confirmed that ${d.name} should not approve the distribution`)
    case 'representative_added': return L(`${who} registrerte ${nameOf(d.user_id)} som ${d.kind === 'verge' ? 'verge' : 'fullmektig'} for ${d.name} (ubekreftet)`, `${who} registered ${nameOf(d.user_id)} as ${d.kind === 'verge' ? 'guardian' : 'proxy'} for ${d.name} (unconfirmed)`)
    case 'representative_verified': return L(`${who} bekreftet representasjonen for ${nameOf(d.user_id)}`, `${who} confirmed the representation for ${nameOf(d.user_id)}`)
    case 'representative_revoked': return L(`${who} trakk representasjonen for ${nameOf(d.user_id)}`, `${who} withdrew the representation for ${nameOf(d.user_id)}`)
    case 'distribution_proposed': return L(`${who} la frem forslag til fordeling (versjon ${d.version_no})`, `${who} proposed the distribution (version ${d.version_no})`)
    case 'distribution_approved_by': return L(`Godkjenning registrert for ${d.name}${d.via_representative ? ' (via representant)' : ''}`, `Approval registered for ${d.name}${d.via_representative ? ' (via representative)' : ''}`)
    case 'distribution_objected_by': return L(`${d.name} er ikke enig i forslaget`, `${d.name} disagrees with the proposal`)
    case 'distribution_approved': return L(`Fordelingen (versjon ${d.version_no}) er godkjent av alle beslutningstakerne`, `The distribution (version ${d.version_no}) has been approved by all decision-makers`)
    default: return L('Endring registrert', 'Change recorded')
  }
}
