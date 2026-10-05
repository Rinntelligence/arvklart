// Avleder fakta om saken fra brukerens svar. Fakta brukes i betingelser for
// spørsmål, regler og neste steg (se conditions.js). Funksjonen må tåle
// delvis utfylte svar, siden den brukes underveis i veiviseren.

import { childLines } from './heirs.js'

export function deriveFacts(a = {}) {
  const f = {}
  f.role = a.role
  f.survivor = a.role === 'survivor'

  f.oldLaw = Boolean(a.deathDate) && a.deathDate < '2021-01-01'
  f.livedAbroad = a.residence === 'no' || a.residence === 'unknown'

  f.married = a.maritalStatus === 'married'
  f.cohabitant = a.maritalStatus === 'cohabitant'
  f.separated = a.maritalStatus === 'separated'
  f.maritalUnknown = a.maritalStatus === 'unknown'
  f.cohabitantWithChildren = f.cohabitant && a.cohabitantChildren === 'yes'
  f.cohabitantNoChildren = f.cohabitant && a.cohabitantChildren === 'no'
  f.cohabitantChildrenUnknown = f.cohabitant && a.cohabitantChildren === 'unknown'
  f.hasPartner = f.married || f.cohabitant
  f.partnerInherits = f.married || f.cohabitantWithChildren
  f.uskifteRelevant = f.partnerInherits

  const hasChildren = a.cohabitantChildren === 'yes' ? 'yes' : a.hasChildren
  const lines = hasChildren === 'yes' && Array.isArray(a.children) ? childLines(a.children) : []
  const childrenKnown = hasChildren === 'no' || (hasChildren === 'yes' && Array.isArray(a.children) && a.children.length > 0)
  f.childrenUnknown = hasChildren === 'unknown'
  f.hasDescendants = hasChildren === 'yes' && (!childrenKnown || lines.length > 0)
  f.descendantsKnownNone = hasChildren === 'no' || (childrenKnown && hasChildren === 'yes' && lines.length === 0)
  f.lineCount = lines.length
  f.hasCommonChildren = lines.some(l => l.common === 'yes')
  f.hasSeparateChildren = f.hasPartner && lines.some(l => l.common === 'no')
  f.separateChildrenMinor = f.hasPartner && lines.some(l => l.common === 'no' && l.alive === 'yes' && l.minor)
  f.minorChildren = lines.some(l => l.alive === 'yes' && l.minor)
  f.representation = lines.some(l => l.alive === 'no')

  f.needsParents = f.descendantsKnownNone
  f.parentDead = ['mother', 'father', 'none'].includes(a.parents)
  f.needsSiblings = f.needsParents && ['mother', 'father', 'none'].includes(a.parents)
  const anySiblingLine = (a.siblings || []).some(s => s.alive === 'yes' || (Number(s.children) || 0) > 0)
  f.secondOrderKnownNone = f.needsParents && a.parents === 'none' && (a.hasSiblings === 'no' || (a.hasSiblings === 'yes' && !anySiblingLine))
  // Ektefelle arver alt når det ikke finnes arvinger i første eller andre arvegang.
  f.needsGrandparents = f.secondOrderKnownNone && !f.married

  f.separateProperty = f.married && a.separateProperty === 'yes' && a.separatePropertyAtDeath !== 'yes'
  f.separatePropertyUnknown = f.married && a.separateProperty === 'unknown'
  f.separatePropertyAtDeathUnknown = f.married && a.separateProperty === 'yes' && a.separatePropertyAtDeath === 'unknown'
  f.deceasedSeparateProperty = f.separateProperty && ['deceased', 'both'].includes(a.separatePropertyWho)
  f.survivorSeparateProperty = f.separateProperty && ['survivor', 'both'].includes(a.separatePropertyWho)
  f.skjevdeling = f.married && a.skjevdeling === 'yes'
  f.skjevdelingUnknown = f.married && a.skjevdeling === 'unknown'

  f.testament = a.testament === 'yes'
  f.testamentUnknown = a.testament === 'unknown'
  const tc = Array.isArray(a.testamentContent) ? a.testamentContent : []
  f.testamentGiveaway = f.testament && tc.includes('giveaway')
  f.testamentUneven = f.testament && tc.includes('uneven')
  f.testamentToCohabitant = f.testament && tc.includes('toCohabitant')
  f.testamentLimitsPartner = f.testament && tc.includes('limitsPartner')
  f.testamentSeparateClause = f.testament && tc.includes('separateClause')
  f.testamentUskifte = f.testament && tc.includes('uskifte')
  f.testamentOther = f.testament && tc.includes('other')

  f.advancements = f.hasDescendants && a.advancements === 'yes'
  f.advancementGifts = f.hasDescendants && a.advancements === 'gift'
  f.advancementsUnknown = f.hasDescendants && a.advancements === 'unknown'

  f.askPreviousUskifte = Boolean(a.maritalStatus) && a.maritalStatus !== 'married'
  f.previousUskifte = f.askPreviousUskifte && a.previousUskifte === 'yes'
  f.previousUskifteUnknown = f.askPreviousUskifte && a.previousUskifte === 'unknown'

  f.debtUncertain = a.debtOverview === 'no'
  const circ = Array.isArray(a.circumstances) ? a.circumstances : []
  f.disagreement = circ.includes('disagreement')
  f.unreachableHeir = circ.includes('unreachable')
  f.minorHeir = circ.includes('minor') || f.minorChildren
  f.guardianship = circ.includes('guardianship')

  f.consent = a.separateChildrenConsent
  return f
}
