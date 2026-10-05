// Beregningsmotoren: regner ut dødsboet og fordelingen ved skifte og uskifte.
// Ren logikk uten DOM – alle tall her kan testes direkte (se test/arveveiviser).

import { ASSET_FIELDS, DEBT_FIELDS } from './questions.js'
import { determineRelatives, childLines } from './heirs.js'

export const num = v => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}
const sumFields = (obj, fields) => fields.reduce((s, f) => s + num(obj?.[f.key]), 0)
const round = n => Math.round(n)

// ── 1. Dødsboet ────────────────────────────────────────────────
// Ektefeller: netto felleseie deles likt (ekteskapsloven § 58). Avdødes halvdel og
// avdødes særeie utgjør dødsboet. Gjenlevendes halvdel og særeie er ikke arv.
export function computeEstate(a, f) {
  const as = a.assets || {}
  const assets = sumFields(as, ASSET_FIELDS)
  const debts = sumFields(as, DEBT_FIELDS)
  const funeral = num(as.funeral)
  const lines = []

  if (!f.married) {
    const net = assets - debts
    const deceasedEstate = net - funeral
    return {
      kind: 'single', assets, debts, funeral, net, deceasedEstate,
      insolvent: net < 0, coversOnlyFuneral: net >= 0 && deceasedEstate <= 0,
    }
  }

  const sepDeceasedNet = num(as.sepDeceasedAssets) - num(as.sepDeceasedDebts)
  const sepSurvivorNet = num(as.sepSurvivor)
  // «Særeie i live, felleseie ved død»: særeiet regnes som felleseie.
  const sepBecomesCommon = a.separateProperty === 'yes' && a.separatePropertyAtDeath === 'yes'
  const deceasedSep = f.deceasedSeparateProperty ? sepDeceasedNet : 0
  const survivorSep = f.survivorSeparateProperty ? sepSurvivorNet : 0
  const extraCommon = sepBecomesCommon ? sepDeceasedNet + sepSurvivorNet : 0

  const commonNet = assets - debts + extraCommon
  const half = commonNet / 2
  const deceasedEstate = half + deceasedSep - funeral

  // Alternativ med skjevdeling: verdiene holdes utenfor før felleseiet deles.
  let skjevdeling = null
  if (f.skjevdeling) {
    const sd = num(a.skjevdelingAmounts?.deceased)
    const ss = num(a.skjevdelingAmounts?.survivor)
    if (sd || ss) {
      const shareable = Math.max(0, commonNet - sd - ss)
      const exceeds = sd + ss > commonNet
      skjevdeling = {
        deceased: sd, survivor: ss, exceeds,
        deceasedEstate: shareable / 2 + Math.min(sd, Math.max(0, commonNet)) + deceasedSep - funeral,
        survivorKeeps: shareable / 2 + Math.min(ss, Math.max(0, commonNet - sd)) + survivorSep,
      }
    }
  }

  return {
    kind: 'married', assets, debts, funeral, commonNet, half,
    deceasedSep, survivorSep, sepBecomesCommon, extraCommon,
    deceasedEstate, survivorKeeps: half + survivorSep,
    insolvent: half + deceasedSep < 0, coversOnlyFuneral: half + deceasedSep >= 0 && deceasedEstate <= 0,
    commonNegative: commonNet < 0, skjevdeling, lines,
  }
}

// ── 2. Ektefelle/samboer ──────────────────────────────────────
// Returnerer lovbestemt arv (`legal`) og den delen et testament aldri kan ta bort (`protected`).
export function partnerInheritance(E, order, f, G) {
  if (E <= 0) return { legal: 0, protected: 0, basis: null }
  if (f.married) {
    if (order === 1) {
      const min = Math.min(4 * G, E)
      return { legal: Math.max(E / 4, min), protected: min, basis: E / 4 >= min ? 'quarter' : 'min4G' }
    }
    if (order === 2) {
      const min = Math.min(6 * G, E)
      return { legal: Math.max(E / 2, min), protected: min, basis: E / 2 >= min ? 'half' : 'min6G' }
    }
    return { legal: E, protected: Math.min(6 * G, E), basis: 'all' }
  }
  if (f.cohabitantWithChildren) {
    const amount = Math.min(4 * G, E)
    return { legal: amount, protected: 0, basis: 'cohabitant4G' }
  }
  return { legal: 0, protected: 0, basis: null }
}

// ── 3. Pliktdelsarv ───────────────────────────────────────────
// 2/3 av det som er igjen etter ektefellens/samboerens arv, likt per stamme,
// men høyst 15 G per barn (for barnebarn: per stamme).
export function compulsoryShare(rest, lineCount, G) {
  if (!lineCount || rest <= 0) return { perLine: 0, total: 0, capped: false }
  const uncapped = (2 / 3) * rest / lineCount
  const perLine = Math.min(uncapped, 15 * G)
  return { perLine, total: perLine * lineCount, capped: uncapped > 15 * G }
}

// ── 4. Avkorting av forskudd mellom livsarvingene ─────────────
// Forskudd legges til det som skal fordeles og trekkes fra hos mottakeren.
// Har noen fått mer enn sin andel, må de ikke betale tilbake, og holdes utenfor.
export function applyAdvancements(pool, lineIds, advances = {}) {
  let active = [...lineIds]
  const zero = new Set()
  for (;;) {
    const total = pool + active.reduce((s, id) => s + num(advances[id]), 0)
    const per = total / active.length
    const over = active.filter(id => num(advances[id]) >= per)
    if (!over.length || over.length === active.length) {
      const result = {}
      for (const id of lineIds) result[id] = zero.has(id) ? 0 : Math.max(0, per - num(advances[id]))
      return result
    }
    over.forEach(id => zero.add(id))
    active = active.filter(id => !zero.has(id))
  }
}

// Runder alle beløp til hele kroner slik at summen stemmer med det som fordeles
// (største-rest-metoden). Hver person har et nøyaktig beløp i `exact`.
function roundAll(people) {
  const target = Math.round(people.reduce((s, p) => s + p.exact, 0))
  for (const p of people) p.amount = Math.floor(p.exact + 1e-9)
  let remainder = target - people.reduce((s, p) => s + p.amount, 0)
  const order = [...people].sort((x, y) => (y.exact - y.amount) - (x.exact - x.amount))
  for (const p of order) { if (remainder <= 0) break; p.amount += 1; remainder -= 1 }
  for (const p of people) delete p.exact
  return people
}

// ── 5. Skifte nå ──────────────────────────────────────────────
export function calculateSkifte(a, f, G) {
  const estate = computeEstate(a, f)
  // Ektefelle arver alt når det ikke finnes arvinger i første eller andre arvegang (§ 9).
  const rel = determineRelatives(a, { stopAtSecond: f.married })
  if (rel.unknown.length) return { estate, blocked: true, missing: rel.unknown }

  // Satt avdøde i uskifte, deles uskifteboet mellom arvingene etter begge (§ 29): likt etter
  // ektefeller, etter verdiforholdet da uskiftet startet etter samboere (§ 39). Det som ikke
  // hørte til uskifteboet (§§ 21 og 31), er bare arv etter avdøde.
  const fullE = Math.max(0, estate.deceasedEstate)
  const previous = f.previousUskifte ? previousUskifteSplit(a, f, fullE) : null
  let firstDeceasedShare = previous ? previous.exact : 0
  const E = fullE - firstDeceasedShare
  const partner = partnerInheritance(E, rel.order, f, G)
  const partnerLimited = f.testamentLimitsPartner && a.testamentPartnerKnew === 'yes'
  const partnerAmount = partnerLimited ? partner.protected : partner.legal

  // Testament til samboer etter fem års samboerskap: inntil 4 G går foran pliktdelsarven (§ 13).
  const cohabitantWanted = f.testamentToCohabitant ? num(a.testamentCohabitantAmount) : 0
  const s13 = cohabitantWanted && a.cohabitantFiveYears === 'yes' ? Math.min(4 * G, cohabitantWanted, E - partnerAmount) : 0
  const rest = E - partnerAmount - s13

  const lines = rel.order === 1 ? childLines(a.children) : []
  const plikt = rel.order === 1 ? compulsoryShare(rest, lines.length, G) : { perLine: 0, total: 0, capped: false }
  const freePart = Math.max(0, rest - plikt.total)

  // Testamentariske gaver dekkes av den delen testamentet fritt kan bestemme over.
  // Er gavene større, reduseres de forholdsmessig.
  let testament = null
  let pool = rest
  const otherWanted = f.testamentGiveaway ? num(a.testamentAmount) : 0
  const freeWanted = otherWanted + (cohabitantWanted - s13)
  if (f.testamentGiveaway || f.testamentToCohabitant) {
    const applied = Math.min(freeWanted, freePart)
    const ratio = freeWanted > 0 ? applied / freeWanted : 0
    testament = {
      wanted: otherWanted + cohabitantWanted, applied: applied + s13, exceeds: freeWanted > freePart, freePart,
      other: otherWanted * ratio, cohabitant: s13 + (cohabitantWanted - s13) * ratio, cohabitantProtected: s13,
    }
    pool = rest - applied
  }

  // Ingen arvinger etter loven: arven går til frivillig virksomhet for barn og unge (§ 76).
  // Satt avdøde i uskifte, går den i stedet til arvingene etter den som døde først (§ 29 siste ledd).
  const noHeirs = rel.order === 0 && partnerAmount === 0
  const toCharity = noHeirs && !previous ? pool : 0
  if (noHeirs && previous) { firstDeceasedShare += pool; pool = 0 }

  const people = []
  if (partnerAmount > 0 || (f.partnerInherits && E === 0)) {
    people.push({ id: 'partner', label: f.married ? 'Gjenlevende ektefelle' : 'Gjenlevende samboer', relation: f.married ? 'Ektefelle' : 'Samboer', exact: partnerAmount, isPartner: true })
  }
  if (testament?.cohabitant > 0) {
    people.push({ id: 'testament-cohabitant', label: 'Samboeren', relation: 'Etter testament', exact: testament.cohabitant, isTestament: true })
  }
  if (testament?.other > 0) {
    people.push({ id: 'testament', label: 'Mottakere i testamentet', relation: 'Etter testament', exact: testament.other, isTestament: true })
  }

  // Delen til arvingene etter den som døde først, fordelt likt per barn (stamme) hen etterlot seg.
  // Felles barn med avdøde får den i tillegg til arven etter avdøde. Uten barn går delen til
  // slekten til den som døde først, som veiviseren ikke spør om – da vises den samlet.
  const fromFirstByLine = {}
  if (previous) {
    const firstLines = [...previous.commonLines, ...previous.otherLines]
    const perLine = firstLines.length ? firstDeceasedShare / firstLines.length : 0
    for (const l of previous.commonLines) fromFirstByLine[l.id] = perLine
    for (const l of previous.otherLines) {
      if (l.alive === 'yes') {
        people.push({ id: `first-${l.id}`, label: l.label, relation: 'Barn av den som døde først', exact: perLine, isOther: true, isFirstHeir: true })
      } else {
        const n = Number(l.grandchildren)
        for (let k = 0; k < n; k++) people.push({ id: `first-${l.id}-${k}`, label: n > 1 ? `Barnebarn ${k + 1} (via ${l.label})` : `Barnebarn (via ${l.label})`, relation: 'Barnebarn av den som døde først', exact: perLine / n, isOther: true, isFirstHeir: true })
      }
    }
    if (!firstLines.length && firstDeceasedShare > 0) {
      people.unshift({ id: 'firstDeceased', label: 'Slekten til den som døde først', relation: 'Foreldre, søsken eller andre slektninger', exact: firstDeceasedShare, isOther: true, isFirstHeir: true })
    }
  }

  let advancementResult = null
  if (rel.order === 1) {
    const lineIds = lines.map(l => l.id)
    const advances = f.advancements ? (a.advancementAmounts || {}) : {}
    const perLine = applyAdvancements(pool, lineIds, advances)
    if (f.advancements && Object.values(advances).some(v => num(v) > 0)) advancementResult = { advances, perLine }
    for (const line of lines) {
      const inLine = rel.heirs.filter(h => h.lineId === line.id)
      const lineTotal = inLine.reduce((s, h) => s + h.share, 0)
      for (const h of inLine) {
        const w = h.share / lineTotal
        const fromFirst = (fromFirstByLine[line.id] || 0) * w
        people.push({
          id: h.id, label: h.label, relation: h.relation, lineId: line.id,
          exact: perLine[line.id] * w + fromFirst, fromFirst: round(fromFirst),
          common: line.common, minor: h.minor,
          compulsory: round(plikt.perLine * w),
          advance: num(advances[line.id]) || 0,
        })
      }
    }
  } else {
    for (const h of rel.heirs) people.push({ id: h.id, label: h.label, relation: h.relation, side: h.side, exact: pool * h.share })
  }
  roundAll(people)
  if (previous) Object.assign(previous, { amount: round(firstDeceasedShare), relatives: !previous.commonLines.length && !previous.otherLines.length })

  return {
    estate, blocked: false, order: rel.order, notes: rel.notes, previous,
    fullE: round(fullE), E: round(E), partner: { ...partner, amount: round(partnerAmount), limitedByTestament: partnerLimited },
    partnerTakesAll: partnerAmount > 0 && round(partnerAmount) >= round(E),
    compulsory: plikt, freePart: round(freePart), testament, toCharity: round(toCharity),
    advancementResult, people,
    total: people.reduce((s, p) => s + p.amount, 0) + round(toCharity),
  }
}

// Hvor mye av avdødes bo som hører til den som døde først, og hvem hens arvinger er.
function previousUskifteSplit(a, f, fullE) {
  const outside = Math.min(num(a.previousUskifteOutside), fullE)
  const pctRaw = Number(String(a.previousUskifteShare ?? '').replace(',', '.'))
  const ratio = f.previousUskifteCohabitant && a.previousUskifteShare !== '' && a.previousUskifteShare !== undefined && Number.isFinite(pctRaw)
    ? Math.min(100, Math.max(0, pctRaw)) / 100
    : 0.5
  const hasChildren = a.cohabitantChildren === 'yes' ? 'yes' : a.hasChildren
  const commonLines = hasChildren === 'yes' ? childLines(a.children).filter(l => l.firstCommon === 'yes') : []
  const otherLines = a.previousSpouseChildren === 'yes' ? childLines(a.previousSpouseChildrenList || []) : []
  return { exact: (fullE - outside) * ratio, ratio, outside: round(outside), uskifteValue: round(fullE - outside), commonLines, otherLines }
}

// ── 6. Uskifte ────────────────────────────────────────────────
// Returnerer tallene for uskifte, eller null når uskifte ikke er aktuelt.
//   status: 'free'     – kan sitte i uskifte uten samtykke (felles barn / foreldre / søsken)
//           'consent'  – alle særkullsbarn samtykker
//           'partial'  – særkullsbarn som ikke samtykker, får arven sin nå; resten i uskifte (§ 16)
//           'unknown'  – samtykke er ikke avklart; vi viser begge utfall
//           'notNeeded'– gjenlevende arver uansett alt
export function calculateUskifte(a, f, G, skifte) {
  if (!f.uskifteRelevant || !skifte || skifte.blocked) return null
  const e = skifte.estate
  if (skifte.order === 0 || skifte.partnerTakesAll) return { status: 'notNeeded', kind: f.married ? 'married' : 'cohabitant' }

  const separatePeople = skifte.people.filter(p => p.common === 'no')
  const consent = a.separateChildrenConsent
  const needsConsent = separatePeople.length > 0
  let status = 'free'
  if (needsConsent) status = consent === 'yes' ? 'consent' : consent === 'no' ? 'partial' : 'unknown'

  // Det som må gjøres opp nå, selv om gjenlevende velger uskifte.
  const refusing = status === 'partial' ? separatePeople : []
  const paidNow = refusing.map(p => ({ id: p.id, label: p.label, amount: p.amount, reason: 'noConsent' }))
  const ifRefuse = status === 'unknown' ? separatePeople.map(p => ({ id: p.id, label: p.label, amount: p.amount })) : []
  if (skifte.testament?.other > 0) paidNow.push({ id: 'testament', label: 'Mottakere i testamentet', amount: round(skifte.testament.other), reason: 'testament' })
  const paidSum = paidNow.reduce((s, p) => s + p.amount, 0)

  if (f.married) {
    // Avdødes særeie inngår bare i uskifte hvis ektepakten sier det eller arvingene samtykker (§ 14 annet ledd).
    // Ellers skiftes særeiet nå. Ektefellen arver da som hovedregel 1/4 av det når det er barn.
    const sep = Math.max(0, e.deceasedSep)
    const sepNow = sep > 0 ? {
      value: round(sep),
      partner: round(skifte.order === 1 ? sep / 4 : sep / 2),
      others: round(sep - (skifte.order === 1 ? sep / 4 : sep / 2)),
    } : null
    const common = Math.max(0, e.commonNet) - e.funeral
    return {
      status, kind: 'married', needsConsent, paidNow, ifRefuse,
      separateNow: sepNow,
      // Hele felleseiet (begge halvdeler) blir uskiftebo, minus det som betales ut nå.
      uskifteValue: round(Math.max(0, common - paidSum)),
      uskifteValueWithSeparate: sepNow ? round(Math.max(0, common - paidSum + sep)) : null,
      laterSplit: 'equal',
    }
  }

  // Samboer: bare felles bolig og innbo, bil og fritidsbolig kan holdes i uskifte (§ 32).
  const as = a.assets || {}
  const eligibleGross = num(as.home) + num(as.cabin) + num(as.car) + num(as.contents)
  const eligibleNet = Math.max(0, eligibleGross - num(as.mortgage))
  const uskifteValue = Math.min(eligibleNet, skifte.E)
  const restNow = Math.max(0, skifte.E - uskifteValue)
  // Særkullsbarn som ikke samtykker, får sin andel av det som holdes i uskifte, nå.
  const refusingShare = refusing.reduce((s, p) => s + (skifte.E > 0 ? p.amount / skifte.E : 0), 0)
  return {
    status, kind: 'cohabitant', needsConsent, paidNow, ifRefuse,
    uskifteValue: round(uskifteValue * (1 - refusingShare)),
    restNow: round(restNow),
    laterSplit: 'ratio',
  }
}
