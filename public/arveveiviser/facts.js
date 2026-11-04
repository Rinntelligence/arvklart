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
  // Sikkerhetskontroll (F11): veiviseren regner bare ett ledd under et barn som er dødt. Spørsmålet stilles
  // for alle barn som er døde, også når ingen barnebarn lever (da filtreres linjen ellers bort).
  f.deadChild = hasChildren === 'yes' && Array.isArray(a.children) && a.children.some(c => c.alive === 'no')
  f.deeperDescendantsUnresolved = f.deadChild && a.deeperDescendants !== 'no'

  f.needsParents = f.descendantsKnownNone
  f.parentDead = ['mother', 'father', 'none'].includes(a.parents)
  f.needsSiblings = f.needsParents && ['mother', 'father', 'none'].includes(a.parents)
  const anySiblingLine = (a.siblings || []).some(s => s.alive === 'yes' || (Number(s.children) || 0) > 0)
  f.secondOrderKnownNone = f.needsParents && a.parents === 'none' && (a.hasSiblings === 'no' || (a.hasSiblings === 'yes' && !anySiblingLine))
  // Ektefelle arver alt når det ikke finnes arvinger i første eller andre arvegang.
  f.needsGrandparents = f.secondOrderKnownNone && !f.married
  // F11 for søsken: bare ett ledd under et søsken som er dødt (arveloven § 5 har ingen grense nedover).
  f.deadSibling = f.needsSiblings && a.hasSiblings === 'yes' && (a.siblings || []).some(s => s.alive === 'no')
  f.deeperSiblingUnresolved = f.deadSibling && a.deeperSiblingDescendants !== 'no'

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

  // Forskudd (F14). Gavetidspunktet avgjør reglene (arveloven § 180 sjette ledd, HR-2025-1182-A):
  //   gitt fra 1.1.2021: § 75, avkorting må være satt som betingelse da gaven ble gitt (muntlig er nok)
  //   gitt før 2021: arveloven 1972 § 38, en betydelig gave uten at de andre fikk tilsvarende, og avdøde har
  //   bestemt det (også senere) eller det er godtgjort at det var avdødes forutsetning.
  // Avkorting påvirker bare fordelingen mellom livsarvingene (§ 75 andre ledd bokstav d, når ikke noe annet er satt som betingelse), så med én linje er alt som før.
  // Fradrag beregnes bare når vilkårene er avklart; ellers blokkeres beregningen (advancementsUnresolved).
  const advMatters = f.hasDescendants && lines.length > 1
  const adv = f.hasDescendants ? a.advancements : undefined
  const giftBefore = ['before2021', 'both'].includes(a.advancementTiming)
  const giftAfter = ['from2021', 'both'].includes(a.advancementTiming)
  let deduct = false, notMet = false, unresolved = null
  if (adv === 'yes' || adv === 'gift') {
    if (!advMatters) deduct = adv === 'yes'
    else if (!giftBefore && !giftAfter) unresolved = 'advancementTiming'
    else if (adv === 'yes') {
      if (giftAfter && a.advancementConditionAtGift !== 'yes') unresolved = 'advancementConditionAtGift'
      else if (giftBefore && a.advancementSubstantial === 'no' && !giftAfter) notMet = true
      else if (giftBefore && a.advancementSubstantial !== 'yes') unresolved = 'advancementSubstantial'
      else deduct = true
    } else if (giftBefore && a.advancementSubstantial !== 'no') unresolved = 'advancementSubstantial'
    else notMet = true
  } else if (adv === 'unknown' && advMatters) unresolved = 'advancements'
  f.advancements = deduct
  f.advancementGifts = notMet
  f.advancementsUnknown = adv === 'unknown' && !advMatters
  f.advancementsUnresolved = unresolved
  f.advancementsMatter = advMatters

  // Bare enslige og samboere kan ha sittet i uskifte: et nytt ekteskap krever at uskifteboet skiftes først.
  f.askPreviousUskifte = ['none', 'cohabitant'].includes(a.maritalStatus)
  f.previousUskifte = f.askPreviousUskifte && a.previousUskifte === 'yes'
  f.previousUskifteUnknown = f.askPreviousUskifte && a.previousUskifte === 'unknown'
  f.previousUskifteMarried = f.previousUskifte && a.previousUskifteType === 'married'
  f.previousUskifteCohabitant = f.previousUskifte && a.previousUskifteType === 'cohabitant'
  // Arvingene etter den som døde først: felles barn med avdøde, og egne barn fra andre forhold.
  f.firstCommonLines = f.previousUskifte ? lines.filter(l => l.firstCommon === 'yes').length : 0
  f.firstOtherLines = f.previousUskifte && a.previousSpouseChildren === 'yes' ? childLines(a.previousSpouseChildrenList || []).length : 0
  f.firstOtherChildrenUnknown = f.previousUskifte && a.previousSpouseChildren === 'unknown'
  // F11 for barna til den som døde først (uskifte)
  f.deadFirstSpouseChild = f.previousUskifte && a.previousSpouseChildren === 'yes' && (a.previousSpouseChildrenList || []).some(c => c.alive === 'no')
  f.deeperFirstSpouseUnresolved = f.deadFirstSpouseChild && a.deeperFirstSpouseDescendants !== 'no'
  f.firstHeirsRelatives = f.previousUskifte && Boolean(a.previousSpouseChildren) && f.firstCommonLines + f.firstOtherLines === 0

  f.debtUncertain = a.debtOverview === 'no'
  const circ = Array.isArray(a.circumstances) ? a.circumstances : []
  f.disagreement = circ.includes('disagreement')
  f.unreachableHeir = circ.includes('unreachable')
  f.minorHeir = circ.includes('minor') || f.minorChildren
  f.guardianship = circ.includes('guardianship')

  f.consent = a.separateChildrenConsent
  return f
}
