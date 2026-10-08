// Hovedmotoren: tar brukerens svar og returnerer et komplett, forklart resultat.
//
//   svar → pruneAnswers → deriveFacts → calculateSkifte/calculateUskifte
//        → regler (rules.js) → oppsummering, forutsetninger, neste steg og kilder
//
// Motoren gjetter aldri. Mangler en opplysning som avgjør hvem som arver, returneres en
// «blocker» i stedet for tall. Svarer brukeren «vet ikke» på noe som bare justerer
// beregningen, vises det som en tydelig forutsetning brukeren kan endre.

import { pruneAnswers } from './flow.js'
import { deriveFacts } from './facts.js'
import { evaluate } from './conditions.js'
import { calculateSkifte, calculateUskifte, num } from './calculate.js'
import { childLines } from './heirs.js'
import { grunnbelop } from './grunnbelop.js'
import { NOTICES, NEXT_STEPS } from './rules.js'
import { ASSET_FIELDS } from './questions.js'

const kr = n => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' kr'
const NUM_WORDS = ['null', 'ett', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve', 'tolv']
const count = n => NUM_WORDS[n] || String(n)
const listJoin = items => items.length <= 1 ? (items[0] || '') : items.slice(0, -1).join(', ') + ' og ' + items[items.length - 1]
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// Grense domstolene bruker i praksis for «bo av liten verdi» (arveloven § 95 har ingen fast grense).
const SMALL_ESTATE_LIMIT = 170000

export function analyze(rawAnswers = {}) {
  const a = pruneAnswers(rawAnswers)
  const facts = deriveFacts(a)
  const G = grunnbelop(a.deathDate)
  const g = G.value

  const blockers = collectBlockers(a, facts)
  const skifte = blockers.some(b => b.hard) ? null : calculateSkifte(a, facts, g)
  if (skifte?.blocked) for (const m of skifte.missing) blockers.push(missingBlocker(m))

  const calc = skifte && !skifte.blocked ? skifte : null
  const uskifteCalc = calc ? calculateUskifte(a, facts, g, calc) : null

  // Fakta fra beregningen, slik at reglene kan bruke dem i betingelser.
  if (calc) {
    const e = calc.estate
    const deceasedGross = e.kind === 'married'
      ? e.assets / 2 + num(a.assets?.sepDeceasedAssets) * (facts.deceasedSeparateProperty ? 1 : 0)
      : e.assets
    Object.assign(facts, {
      order: calc.order,
      E: calc.E,
      partnerBasis: calc.partner.basis,
      partnerTakesAll: calc.partnerTakesAll,
      testamentExceeds: Boolean(calc.testament?.exceeds),
      toCharity: calc.toCharity > 0,
      skjevdelingResult: Boolean(e.skjevdeling),
      commonNegative: Boolean(e.commonNegative),
      advancementsApplied: Boolean(calc.advancementResult),
      insolvent: e.insolvent,
      smallEstate: !e.insolvent && deceasedGross - e.funeral <= SMALL_ESTATE_LIMIT && calc.E > 0,
      // Er gjelden større enn eiendelene, betyr uskifte bare å overta gjelden – vi viser det ikke som et valg.
      uskifteAvailable: Boolean(uskifteCalc && uskifteCalc.status !== 'notNeeded' && !e.insolvent),
    })
    if (e.insolvent || calc.E === 0) facts.smallEstate = false
  }
  const noValues = calc && calc.estate.assets === 0 && calc.estate.debts === 0 && !num(a.assets?.sepDeceasedAssets)
  if (noValues) blockers.push({ id: 'noValues', title: 'Legg inn formue og gjeld for å se beløpene', text: 'Du har ikke lagt inn hva avdøde eide eller skyldte. Vi kan vise hvem som arver, men ikke hvor mye.', questionId: 'assets' })

  const vars = {
    g3: kr(3 * g), g4: kr(4 * g), g6: kr(6 * g), g15: kr(15 * g),
    E: kr(calc?.E), partnerAmount: kr(calc?.partner.amount),
    pliktPerLine: kr(calc?.compulsory.perLine), freePart: kr(calc?.freePart),
    skjevE: kr(calc?.estate.skjevdeling?.deceasedEstate), testamentWanted: kr(calc?.testament?.wanted),
    // Det testamentet lovlig kan gi: fridelen, pluss inntil 4 G til samboer etter fem år (§ 13)
    testamentMax: kr((calc?.testament?.cohabitantProtected || 0) + (calc?.freePart || 0)),
    survivorKeeps: kr(calc?.estate.survivorKeeps), firstAmount: kr(calc?.previous?.amount),
    splitRule: facts.previousUskifteCohabitant ? 'Etter et samboerskap deles uskifteboet etter verdiene da uskiftet startet.' : 'Etter et ekteskap deles uskifteboet i to like deler.',
  }
  const fmt = t => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
  const ctx = { answers: a, facts }

  const hardBlocked = blockers.some(b => b.hard) || Boolean(skifte?.blocked)
  const notices = hardBlocked ? [] : NOTICES.filter(n => evaluate(n.when, ctx)).map(n => ({ ...n, title: fmt(n.title), text: fmt(n.text), more: fmt(n.more) }))
  const nextSteps = NEXT_STEPS.filter(s => evaluate(s.when, ctx)).map(s => ({ ...s, title: fmt(s.title), text: fmt(s.text) }))
  if (hardBlocked) {
    // Uten beregning gir bare de generelle stegene mening – ikke fordeling og skifteerklæring.
    const general = ['findTestament', 'overview', 'proklama', 'publicSkifte']
    nextSteps.splice(0, nextSteps.length, ...nextSteps.filter(s => general.includes(s.id)))
    nextSteps.unshift(facts.oldLaw
      ? { id: 'clarify', title: 'Kontakt tingretten for veiledning', text: 'Fordi dødsfallet skjedde før 2021, gjelder andre regler enn veiviseren regner med. Tingretten i kommunen der avdøde bodde, gir gratis veiledning.', sources: ['domstol_kontakt'] }
      : { id: 'clarify', title: 'Avklar det som mangler', text: 'Finn svaret på spørsmålene over, og kom tilbake til veiviseren. Tingretten i kommunen der avdøde bodde, gir gratis veiledning.', sources: ['domstol_kontakt'] })
  }

  const uskifte = facts.uskifteAvailable && !noValues ? describeUskifte(uskifteCalc, calc, facts, a) : null

  const sourcesUsed = new Set(['arveloven_ikraft', 'nav_g', 'domstol_hvem_arver', 'domstol_hva_arver', 'domstol_skifteformer'])
  for (const x of [...notices, ...nextSteps, ...blockers]) for (const s of x.sources || []) sourcesUsed.add(s)
  for (const s of uskifte?.sources || []) sourcesUsed.add(s)
  const complexList = complexReasons(a, facts, calc)

  return {
    answers: a, facts, G, blockers, blocked: blockers.length > 0,
    assumptions: collectAssumptions(a, facts),
    situation: describeSituation(a, facts, calc),
    who: describeWho(a, facts, calc),
    howMuch: calc ? describeHowMuch(calc, facts) : '',
    howMuchShort: calc ? describeHowMuch(calc, facts, true) : '',
    firstStep: nextSteps.length > 1 ? `${nextSteps[0].title}. Deretter: ${nextSteps[1].title.charAt(0).toLowerCase()}${nextSteps[1].title.slice(1)}.` : nextSteps[0] ? `${nextSteps[0].title}.` : '',
    skifte: calc && !noValues ? calc : null,
    uskifte,
    notices: notices.filter(n => n.area === 'meaning'),
    skifteNotices: notices.filter(n => n.area === 'skifte'),
    uskifteNotices: notices.filter(n => n.area === 'uskifte'),
    nextSteps,
    method: calc ? describeMethod(calc, facts, G, a) : [],
    sourcesUsed: [...sourcesUsed],
    complex: complexList.length > 0 || facts.oldLaw,
    complexReasons: complexList,
  }
}

// Svar som gjør fordelingen usikker eller umulig å beregne, ett varsel per årsak.
// Ubesvarte spørsmål og blokkeringer for manglende opplysninger (barn, beløp) gir ingen
// varsler, siden de bare betyr at brukeren ikke har fylt ut ennå.
export function answerFlags(answers) {
  const r = analyze(answers)
  const blockers = r.blockers
    .filter(b => b.questionId && r.answers[b.questionId] !== undefined && !['children', 'noValues'].includes(b.id))
    .map(b => ({ ...b, kind: 'blocker' }))
  return [...blockers, ...r.complexReasons.map(x => ({ ...x, kind: 'complex' }))]
}

// Varsler som hører til ett bestemt spørsmål – vises med en gang brukeren svarer.
export function flagsForQuestion(answers, questionId) {
  return answerFlags(answers).filter(x => x.questionId === questionId || x.alsoOn?.includes(questionId))
}

// ── Blokkeringer: opplysninger vi må ha før vi kan si hvem som arver ──
function collectBlockers(a, f) {
  const b = []
  if (f.oldLaw) b.push({
    id: 'oldLaw', hard: true, questionId: 'deathDate',
    title: 'Dødsfallet skjedde før 1. januar 2021',
    text: 'Da gjelder den gamle arveloven fra 1972. Reglene ligner, men det er viktige forskjeller – blant annet for pliktdelsarv. Vi beregner derfor ikke fordelingen. Satt gjenlevende i uskifte og skal det skiftes nå, gjelder likevel den nye loven for selve skiftet. Kontakt tingretten for veiledning.',
    sources: ['arveloven_ikraft'],
  })
  if (f.maritalUnknown) b.push({
    id: 'marital', hard: true, questionId: 'maritalStatus',
    title: 'Vi vet ikke om avdøde var gift eller samboer',
    text: 'Dette kan påvirke hvordan boet skal behandles og hvem som arver. Vi anbefaler at du undersøker det før du går videre. Sivilstand står i Folkeregisteret, og tingretten kan hjelpe.',
    sources: ['arveloven_ektefelle', 'arveloven_samboer_arv'],
  })
  if (f.cohabitantChildrenUnknown) b.push({
    id: 'cohabitantChildren', hard: true, questionId: 'cohabitantChildren',
    title: 'Vi vet ikke om samboerne hadde felles barn',
    text: 'Det avgjør om samboeren arver etter loven og kan sitte i uskifte. Vi anbefaler at du undersøker dette før du går videre.',
    sources: ['arveloven_samboer_arv'],
  })
  if (f.childrenUnknown) b.push(missingBlocker('hasChildren'))
  return b
}

function missingBlocker(key) {
  const map = {
    hasChildren: { questionId: 'hasChildren', title: 'Vi vet ikke om avdøde hadde barn', text: 'Barn arver før alle andre, så dette avgjør hvem som arver. Vi anbefaler at du undersøker det før du går videre – for eksempel i Folkeregisteret eller med hjelp fra tingretten.', sources: ['arveloven_livsarvinger'] },
    children: { questionId: 'children', title: 'Vi mangler opplysninger om barna', text: 'Legg inn barna til avdøde for å se fordelingen.' },
    parents: { questionId: 'parents', title: 'Vi vet ikke om avdødes foreldre lever', text: 'Når avdøde ikke hadde barn, avgjør dette hvem som arver – og hvor mye en eventuell ektefelle arver. Undersøk dette før du går videre.', sources: ['arveloven_andre_arvegang'] },
    siblings: { questionId: 'hasSiblings', title: 'Vi vet ikke om avdøde hadde søsken', text: 'Søsken arver i stedet for en forelder som er død. Undersøk dette før du går videre.', sources: ['arveloven_andre_arvegang'] },
    grandparents: { questionId: 'hasGrandparentLine', title: 'Vi vet ikke om det finnes besteforeldre, tanter, onkler eller søskenbarn', text: 'De kan være arvinger når det ikke finnes nærmere familie. Undersøk dette før du går videre – tingretten kan hjelpe med å finne arvinger.', sources: ['arveloven_tredje_arvegang'] },
  }
  return { id: key, hard: true, ...map[key] }
}

// ── Forutsetninger: «vet ikke» på spørsmål som bare justerer beregningen ──
function collectAssumptions(a, f) {
  const list = []
  if (f.testamentUnknown) list.push({ questionId: 'testament', text: 'Vi har regnet som om det **ikke finnes testament**, fordi du ikke vet. Et testament kan endre fordelingen.' })
  if (a.residence === 'unknown') list.push({ questionId: 'residence', text: 'Vi har regnet etter **norske regler**. Bodde avdøde fast i et annet land, kan andre regler gjelde.' })
  if (f.separatePropertyUnknown) list.push({ questionId: 'separateProperty', text: 'Vi har regnet som om **alt var felles formue**, fordi du ikke vet om det finnes en ektepakt.' })
  if (f.separatePropertyAtDeathUnknown) list.push({ questionId: 'separatePropertyAtDeath', text: 'Vi har regnet som om **særeiet også gjelder ved dødsfall**. Sjekk ektepakten.' })
  if (f.advancementsUnknown) list.push({ questionId: 'advancements', text: 'Vi har regnet som om **ingen har fått forskudd på arv**.' })
  if (f.previousUskifteUnknown) list.push({ questionId: 'previousUskifte', text: 'Vi har regnet som om avdøde **ikke satt i uskifte** etter en tidligere ektefelle eller samboer.' })
  if (f.previousUskifteCohabitant && (a.previousUskifteShare === undefined || a.previousUskifteShare === '')) list.push({ questionId: 'previousUskifteShare', text: 'Vi har regnet som om {first} eide **halvparten** av det som ble holdt i uskifte.' })
  if (f.firstOtherChildrenUnknown) list.push({ questionId: 'previousSpouseChildren', text: 'Vi har regnet som om {first} **ikke hadde barn med andre**.' })
  if (f.previousUskifte && !num(a.previousUskifteOutside)) list.push({ questionId: 'previousUskifteOutside', text: 'Vi har regnet som om **alt avdøde eide, hørte til uskifteboet**.' })
  if (f.testamentLimitsPartner && a.testamentPartnerKnew === 'unknown') list.push({ questionId: 'testamentPartnerKnew', text: 'Vi har regnet som om {partnerDu} **ikke visste om testamentet**, slik at full arv etter loven gjelder.' })
  if (f.testamentToCohabitant && a.cohabitantFiveYears === 'unknown') list.push({ questionId: 'cohabitantFiveYears', text: 'Vi har regnet som om dere **ikke hadde bodd sammen i fem år**.' })
  if (f.testamentGiveaway && !num(a.testamentAmount)) list.push({ questionId: 'testamentAmount', text: 'Du har ikke oppgitt hvor mye testamentet gir bort, så det er ikke trukket fra.' })
  return list
}

// ── Tekst: din situasjon ──
function describeSituation(a, f, calc) {
  const s = []
  const you = f.survivor
  if (f.married) s.push(you ? 'Du var gift med avdøde.' : 'Avdøde var gift.')
  else if (f.cohabitantWithChildren) s.push(you ? 'Du og avdøde var samboere og har barn sammen.' : 'Avdøde var samboer og hadde barn med samboeren.')
  else if (f.cohabitantNoChildren) s.push(you ? 'Du og avdøde var samboere uten felles barn.' : 'Avdøde var samboer, uten felles barn.')
  else if (f.separated) s.push('Avdøde var separert, eller det var søkt om separasjon eller skilsmisse.')
  else if (a.maritalStatus === 'none') s.push('Avdøde var verken gift eller samboer.')

  const children = Array.isArray(a.children) ? a.children : []
  const hasChildren = a.cohabitantChildren === 'yes' ? 'yes' : a.hasChildren
  if (hasChildren === 'yes' && children.length) {
    const n = children.length
    let t = `Avdøde hadde ${count(n)} barn`
    if (f.hasPartner) {
      const sep = children.filter(c => c.common === 'no').length
      const common = n - sep
      const all = n === 2 ? 'begge' : 'alle'
      if (sep === 0) t += n === 1 ? (you ? ', som også er ditt barn' : ', som også er barnet til gjenlevende') : (you ? ` – ${all} er også dine barn` : ` – ${all} er felles barn med gjenlevende`)
      else if (common === 0) t += n === 1 ? ' fra et annet forhold (særkullsbarn)' : ' fra andre forhold (særkullsbarn)'
      else t += ` – ${count(common)} felles og ${count(sep)} fra et annet forhold (særkullsbarn)`
    }
    s.push(t + '.')
    const dead = children.filter(c => c.alive === 'no')
    for (const c of dead) {
      const k = Number(c.grandchildren) || 0
      const name = c.name?.trim() || 'Ett av barna'
      const dead = c.name?.trim() ? 'død' : 'dødt' // «Kari er død», men «Ett av barna er dødt»
      s.push(k > 0 ? `${cap(name)} er ${dead}, og ${k === 1 ? 'barnet hans eller hennes' : `de ${count(k)} barna hans eller hennes`} arver i stedet.` : `${cap(name)} er ${dead} uten å etterlate seg barn.`)
    }
  } else if (hasChildren === 'no') {
    s.push('Avdøde hadde ikke barn.')
    const p = { both: 'Begge foreldrene lever.', mother: 'Moren lever, men ikke faren.', father: 'Faren lever, men ikke moren.', none: 'Ingen av foreldrene lever.' }[a.parents]
    if (p) s.push(p)
    if (a.hasSiblings === 'yes' && a.siblings?.length) s.push(`Avdøde hadde ${count(a.siblings.length)} søsken.`)
  }

  if (f.previousUskifte) s.push('Avdøde satt i uskifte etter {first}. Uskifteboet skal derfor deles mellom arvingene etter dem begge.')

  if (a.testament === 'no') s.push('Det finnes ikke testament.')
  else if (a.testament === 'yes') s.push('Det finnes et testament.')
  else if (a.testament === 'unknown') s.push('Du vet ikke om det finnes testament.')

  if (f.married) {
    if (a.separateProperty === 'no') s.push(you ? 'Du har oppgitt at dere ikke hadde ektepakt om særeie.' : 'Det er oppgitt at det ikke var ektepakt om særeie.')
    else if (f.separateProperty) s.push('Det er særeie etter ektepakt.')
  }

  if (calc && calc.estate.assets + calc.estate.debts > 0) {
    const e = calc.estate
    if (e.kind === 'married' && e.commonNet < 0) s.push(`Gjelden er ${kr(-e.commonNet)} større enn det ${you ? 'dere' : 'avdøde og ektefellen'} eide sammen.`)
    else if (e.kind === 'married') s.push(`Etter gjeld eide ${you ? 'dere' : 'avdøde og ektefellen'} ${kr(e.commonNet)} sammen. Avdødes halvdel er ${kr(e.half)}${e.deceasedSep ? `, i tillegg til særeie på ${kr(e.deceasedSep)}` : ''}.`)
    if (calc.fullE > 0) s.push(calc.previous
      ? `Etter gjeld${e.funeral ? ' og begravelse' : ''} er det **${kr(calc.fullE)}** som skal fordeles – mellom arvingene etter avdøde og arvingene etter {first}.`
      : `Etter gjeld${e.funeral ? ' og begravelse' : ''} er det **${kr(calc.fullE)}** som skal fordeles etter avdøde.`)
    else s.push('Etter at gjelden er betalt, er det ingenting igjen å arve.')
  }
  if (calc && f.uskifteAvailable && !calc.estate.insolvent) s.push(`I denne situasjonen er det særlig spørsmålet om **skifte eller uskifte** som er viktig.`)
  return s
}

// ── Tekst: hvem arver? ──
function describeWho(a, f, calc) {
  if (!calc) {
    if (f.oldLaw) return 'Det avhenger av den gamle arveloven. Tingretten kan hjelpe dere.'
    return 'Det kan vi ikke si sikkert før opplysningene under er avklart.'
  }
  const people = calc.people
  const parts = []
  const partner = people.find(p => p.isPartner)
  if (partner) parts.push(f.survivor ? 'du' : f.married ? 'gjenlevende ektefelle' : 'gjenlevende samboer')
  if (people.some(p => p.id === 'testament-cohabitant')) parts.push(f.survivor ? 'du (etter testamentet)' : 'samboeren (etter testamentet)')
  const children = people.filter(p => p.relation === 'Barn')
  const grand = people.filter(p => p.relation === 'Barnebarn')
  if (children.length) {
    const allCommon = children.every(c => c.common === 'yes')
    if (f.survivor && partner && allCommon) parts.push(children.length === 1 ? 'barnet ditt' : `dine ${count(children.length)} barn`)
    else parts.push(children.length === 1 ? 'barnet til avdøde' : `de ${count(children.length)} barna til avdøde`)
  }
  if (grand.length) parts.push(grand.length === 1 ? 'ett barnebarn' : `${count(grand.length)} barnebarn`)
  const ORDER = ['Forelder', 'Søsken', 'Halvsøsken', 'Nevø/niese', 'Besteforelder', 'Tante/onkel', 'Tante/onkel (halv)', 'Søskenbarn']
  const rel = people.filter(p => ORDER.includes(p.relation))
  const groups = {}
  for (const r of ORDER) { const n = rel.filter(p => p.relation === r).length; if (n) groups[r] = n }
  const names = { Søsken: ['ett søsken', 'søsken'], Halvsøsken: ['ett halvsøsken', 'halvsøsken'], 'Nevø/niese': ['en nevø eller niese', 'nevøer og nieser'], Besteforelder: ['en besteforelder', 'besteforeldre'], 'Tante/onkel': ['en tante eller onkel', 'tanter og onkler'], 'Tante/onkel (halv)': ['en tante eller onkel', 'tanter og onkler'], Søskenbarn: ['et søskenbarn', 'søskenbarn'] }
  for (const [r, n] of Object.entries(groups)) {
    if (r === 'Forelder') { parts.push(n === 2 ? 'foreldrene' : rel.find(p => p.relation === r).label === 'Mor' ? 'moren' : 'faren'); continue }
    if (r === 'Besteforelder' && n === 1) { parts.push(rel.find(p => p.relation === r).label.toLowerCase()); continue }
    const [one, many] = names[r]
    parts.push(n === 1 ? one : `${count(n)} ${many}`)
  }
  if (people.some(p => p.id === 'testament')) parts.push('mottakerne i testamentet')
  // Arvingene etter den som døde først, når avdøde satt i uskifte
  const firstChildren = people.filter(p => p.relation === 'Barn av den som døde først').length
  const firstGrand = people.filter(p => p.relation === 'Barnebarn av den som døde først').length
  if (firstChildren) parts.push(`${firstChildren === 1 ? 'ett barn' : `${count(firstChildren)} barn`} av {first}`)
  if (firstGrand) parts.push(`${firstGrand === 1 ? 'ett barnebarn' : `${count(firstGrand)} barnebarn`} av {first}`)
  if (people.some(p => p.id === 'firstDeceased')) parts.push('slekten til {first}')
  if (!parts.length) {
    if (calc.toCharity > 0) return 'Det finnes ingen arvinger etter loven. Uten testament går arven til frivillig arbeid for barn og unge.'
    return 'Etter svarene dine finnes det ingen som arver.'
  }
  if (partner && calc.partnerTakesAll) {
    const why = calc.partner.basis === 'all'
      ? 'fordi avdøde ikke etterlot seg barn, foreldre, søsken, nevøer eller nieser'
      : calc.partner.basis === 'cohabitant4G' ? 'fordi boet er mindre enn samboerens arv på fire ganger grunnbeløpet' : 'fordi boet er mindre enn minstearven'
    return `${f.survivor ? 'Du' : cap(parts[0])} arver alt, ${why}.`
  }
  if (parts.length === 1 && parts[0] === 'du') return 'Du er eneste arving.'
  const plural = parts.length > 1 || /barna|barn$|barn av|foreldrene|søsken|besteforeldre|tanter|søskenbarn|nevøer|barnebarn|mottakerne|slekten/.test(parts[0])
  return `${cap(listJoin(parts))} ${plural ? 'er arvingene' : 'er eneste arving'}.`
}

// ── Tekst: hvor mye? ──
function describeHowMuch(calc, f, short = false) {
  if (calc.fullE <= 0) return 'Det er ingenting igjen å arve etter at gjelden er betalt.'
  const people = calc.people
  const partner = people.find(p => p.isPartner)
  const rest = people.filter(p => !p.isPartner && !p.isTestament && !p.isOther)
  const sameAmount = rest.length > 1 && rest.every(p => Math.abs(p.amount - rest[0].amount) <= 1)
  const others = partner ? 'de andre arvingene' : 'arvingene'
  const bits = []
  if (partner) bits.push(`${f.survivor ? 'du' : f.married ? 'ektefellen' : 'samboeren'} får ${kr(partner.amount)}`)
  const viaTestament = people.find(p => p.id === 'testament-cohabitant')
  if (viaTestament) bits.push(`${f.survivor ? 'du' : 'samboeren'} får ${kr(viaTestament.amount)} etter testamentet`)
  if (rest.length === 1) bits.push(`${rest[0].relation === 'Barn' ? 'barnet' : rest[0].label} får ${kr(rest[0].amount)}`)
  else if (sameAmount) bits.push(`${rest.every(p => p.relation === 'Barn') ? 'hvert av barna' : `hver av ${others}`} får ${kr(rest[0].amount)}`)
  else if (rest.length) bits.push(`${others} får ulike beløp – se fordelingen under`)
  const recipients = people.find(p => p.id === 'testament')
  if (recipients) bits.push(`mottakerne i testamentet får ${kr(recipients.amount)} til sammen`)
  // Satt avdøde i uskifte: si først hvordan boet deles mellom de to sidene.
  if (calc.previous?.amount > 0) {
    const split = `${kr(calc.previous.amount)} går til arvingene etter {first}, og ${kr(calc.fullE - calc.previous.amount)} er arv etter avdøde.`
    const p = partner ? ` Av dette får ${f.survivor ? 'du' : f.married ? 'ektefellen' : 'samboeren'} ${kr(partner.amount)}.` : ''
    return `${short ? '' : 'Basert på opplysningene du har lagt inn: '}${split}${p} Se fordelingen under for hva hver enkelt får.`
  }
  if (!bits.length && calc.toCharity > 0) return `Hele arven (${kr(calc.toCharity)}) går til frivillig arbeid for barn og unge.`
  if (!bits.length) return 'Se fordelingen under.'
  return short ? cap(listJoin(bits)) + '.' : `Basert på opplysningene du har lagt inn, er fordelingen slik: ${listJoin(bits)}.`
}

// ── Uskifte: tekst og tall ──
function describeUskifte(u, calc, f, a) {
  const you = f.survivor
  const P = you ? 'du' : (f.married ? 'ektefellen' : 'samboeren')
  const Pc = cap(P)
  const heirsWord = calc.order === 1 ? 'barna' : 'de andre arvingene'
  const sin = you ? 'din' : 'sin'
  const seg = you ? 'deg' : 'seg'
  const rows = []
  const now = []
  const later = []
  const consequences = []
  const compare = []
  let lead = ''

  if (u.status === 'free') lead = calc.order === 1
    ? `${Pc} kan sitte i uskifte uten å spørre barna om lov, fordi alle er felles barn.`
    : `${Pc} kan sitte i uskifte uten samtykke fra avdødes foreldre eller søsken.`
  const one = calc.people.filter(p => p.common === 'no').length === 1
  if (u.status === 'consent') lead = one ? `Særkullsbarnet samtykker, så ${P} kan sitte i uskifte med hele boet.` : `Alle særkullsbarna samtykker, så ${P} kan sitte i uskifte med hele boet.`
  if (u.status === 'partial') lead = one
    ? `Fordi særkullsbarnet ikke samtykker, må hen få arven sin nå. ${Pc} kan sitte i uskifte med resten.`
    : `Fordi ikke alle særkullsbarna samtykker, må de få arven sin nå. ${Pc} kan sitte i uskifte med resten. Vi har regnet som om ingen av særkullsbarna samtykker.`
  if (u.status === 'unknown') lead = one
    ? `${Pc} kan bare sitte i uskifte med særkullsbarnets del hvis hen samtykker. Gjør hen ikke det, får hen arven sin nå, og ${P} kan sitte i uskifte med resten.`
    : `${Pc} kan bare sitte i uskifte med særkullsbarnas del hvis de samtykker. Gjør de ikke det, får de arven sin nå, og ${P} kan sitte i uskifte med resten.`

  if (u.kind === 'married') {
    rows.push({ label: `Uskifteboet – det ${P} overtar`, amount: u.uskifteValue, kind: 'total' })
    if (u.separateNow) {
      lead += ` Avdødes særeie (${kr(u.separateNow.value)}) er bare med hvis arvingene samtykker eller ektepakten sier det.`
      rows.push({ label: `Uten samtykke: særeiet gjøres opp nå – ${P} arver omtrent`, amount: u.separateNow.partner })
      rows.push({ label: `– og ${heirsWord} får omtrent`, amount: u.separateNow.others })
    }
    now.push(`${Pc} overtar hele felles formue – også den halvdelen som ellers ville vært avdødes – og kan bruke den som ${sin} egen.`)
    now.push(calc.order === 1 ? 'Felles barn får ikke arven sin nå.' : 'Avdødes foreldre eller søsken får ikke arven sin nå.')
    now.push(`${Pc} blir personlig ansvarlig for all gjelden til avdøde.`)
    now.push(`${Pc} får en [[uskifteattest]] fra tingretten.`)
    later.push(`Når ${P} dør, deles uskifteboet i to like deler: halvparten til arvingene etter avdøde og halvparten til arvingene etter ${you ? 'deg' : P}.`)
    later.push(`${Pc} kan når som helst velge å skifte. Da får ${P} arven ${sin} etter reglene, og ${heirsWord} får sin del.`)
    later.push(`Gifter ${P} ${seg} igjen, må uskifteboet skiftes først. Får ${P} ny samboer i minst to år, eller barn med en ny samboer, kan arvingene kreve skifte.`)
  } else {
    rows.push({ label: `Bolig, fritidsbolig, bil og innbo etter boliglån – det ${P} kan overta i uskifte`, amount: u.uskifteValue, kind: 'total' })
    if (u.restNow > 0) rows.push({ label: 'Resten skiftes nå mellom arvingene', amount: u.restNow })
    lead = `Som samboer med felles barn kan ${P} sitte i uskifte med felles bolig og innbo, bil og fritidsbolig. Annen formue, for eksempel bankinnskudd og aksjer, må gjøres opp nå. ` + lead
    now.push(`${Pc} beholder bolig, innbo, bil og fritidsbolig udelt.`)
    now.push('Barna får ikke sin del av disse eiendelene nå.')
    now.push(`${Pc} blir personlig ansvarlig for avdødes gjeld.`)
    later.push(`Når ${P} dør, deles uskifteboet etter verdiforholdet mellom ${you ? 'dere' : 'samboerne'} da uskiftet startet – ikke nødvendigvis likt.`)
    later.push(`${Pc} kan når som helst velge å skifte. Da kan ${P} kreve arven på fire ganger grunnbeløpet.`)
    later.push(`Gifter ${P} ${seg}, eller får ${P} ny samboer i minst to år eller barn med en ny samboer, kan arvingene kreve skifte.`)
  }
  for (const p of u.paidNow) rows.push({ label: `${p.label} får nå`, amount: p.amount })
  if (u.ifRefuse.length) for (const p of u.ifRefuse) rows.push({ label: `Hvis ${p.label} ikke samtykker, får hen nå`, amount: p.amount })

  consequences.push(`${Pc} kan ikke gi bort store gaver uten at arvingene samtykker. Gaver som står i misforhold til formuen, kan kreves omgjort.`)
  consequences.push('Verdien av boet kan endre seg. Arvingene kan få mer eller mindre senere enn de ville fått nå.')
  consequences.push(`${Pc} tar ansvar for all gjelden – også gjeld ingen visste om. Et [[proklama]] kan gi oversikt først.`)
  consequences.push(`Uskifte er ikke tillatt hvis ${you ? 'din' : 'gjenlevendes'} egen gjeld eller økonomi gjør det risikabelt for arvingene.`)
  consequences.push('Meldingen om uskifte må sendes tingretten innen 60 dager etter dødsfallet.')

  compare.push(u.paidNow.length ? `Bare ${listJoin(u.paidNow.map(p => p.label))} får arv utbetalt nå.` : 'Ingen får arv utbetalt nå.')
  compare.push(`${Pc} overtar ${u.kind === 'married' ? 'hele felles formue' : 'bolig, bil, fritidsbolig og innbo'} (${kr(u.uskifteValue)}).`)
  compare.push(`${cap(heirsWord)} arver senere – som regel når ${P} dør.`)
  compare.push(`${Pc} tar ansvar for all gjeld.`)

  return {
    status: u.status, kind: u.kind,
    headline: you ? 'Hvis du velger uskifte' : `Hvis ${P} velger uskifte`,
    consequencesTitle: you ? 'Dette bør du vite før du velger uskifte' : `Dette bør dere vite før ${P} velger uskifte`,
    lead, rows, now, later, consequences, compare,
    choiceIntro: `${you ? 'Du' : cap(P)} kan som hovedregel velge mellom å skifte med ${heirsWord} nå, eller å sitte i [[uskifte]].`,
    sources: u.kind === 'married'
      ? ['arveloven_uskifte', 'arveloven_uskifte_saerkull', 'arveloven_uskifte_delvis', 'arveloven_uskifte_gjeld', 'arveloven_uskifte_gaver', 'arveloven_uskifte_nytt_forhold', 'arveloven_uskifte_deling', 'domstol_uskifte']
      : ['arveloven_uskifte_samboer', 'arveloven_uskifte_saerkull', 'arveloven_uskifte_gjeld', 'arveloven_uskifte_samboer_deling', 'domstol_uskifte'],
  }
}

// ── Slik har vi kommet frem til dette ──
function describeMethod(calc, f, G, a) {
  const m = []
  const e = calc.estate
  m.push({ text: `Vi har brukt arveloven av 2019, som gjelder dødsfall fra 1. januar 2021, og grunnbeløpet (G) på dødsdagen: ${kr(G.value)}.`, sources: ['arveloven_ikraft', 'nav_g'] })
  if (e.kind === 'married') {
    m.push({ text: `Felles formue etter gjeld (${kr(e.commonNet)}) er delt i to like deler. Gjenlevende beholder sin halvdel. Avdødes halvdel (${kr(e.half)})${e.deceasedSep ? ` og avdødes særeie (${kr(e.deceasedSep)})` : ''} er dødsboet.`, sources: ['ekteskapsloven_deling', 'ekteskapsloven_dodsfall'] })
  } else {
    m.push({ text: `Avdødes eiendeler (${kr(e.assets)}) minus gjeld (${kr(e.debts)}) er dødsboet.`, sources: [] })
  }
  if (e.funeral) m.push({ text: `Begravelsen (${kr(e.funeral)}) er trukket fra før arven fordeles.`, sources: [] })
  if (calc.previous) {
    const p = calc.previous
    const share = p.ratio === 0.5 ? 'halvparten' : `${Math.round(p.ratio * 100)} prosent`
    const outside = p.outside ? ` Først er ${kr(p.outside)} som ikke hørte til uskifteboet, holdt utenfor – det er bare arv etter avdøde.` : ''
    const lines = p.commonLines.length + p.otherLines.length
    const split = lines ? ` Den delen er fordelt likt mellom ${lines === 1 ? 'barnet' : `de ${count(lines)} barna`} til {first}${p.otherLines.length ? ', også barn hen hadde med andre' : ''}.` : ''
    m.push({ text: `Fordi avdøde satt i uskifte etter {first}, går ${share} av uskifteboet (${kr(p.amount)}) til arvingene etter {first}.${outside}${split}`, sources: ['arveloven_uskifte_deling', ...(f.previousUskifteCohabitant ? ['arveloven_uskifte_samboer_deling'] : []), 'arveloven_uskifte_arvinger'] })
  }
  const basisText = {
    quarter: 'Ektefellen arver en fjerdedel fordi avdøde hadde barn.',
    min4G: `Ektefellen arver minstearven på fire ganger G (${kr(4 * G.value)}), fordi det er mer enn en fjerdedel.`,
    half: 'Ektefellen arver halvparten fordi avdøde ikke hadde barn, men foreldre eller søsken.',
    min6G: `Ektefellen arver minstearven på seks ganger G (${kr(6 * G.value)}).`,
    all: 'Ektefellen arver alt fordi det ikke finnes barn, foreldre eller søsken.',
    cohabitant4G: `Samboeren arver fire ganger G (${kr(4 * G.value)}), fordi samboerne hadde felles barn.`,
  }[calc.partner.basis]
  if (basisText && calc.partner.amount > 0) m.push({ text: `${basisText}${calc.partner.limitedByTestament ? ' Testamentet har redusert arven til minstearven.' : ''} Det blir ${kr(calc.partner.amount)}.`, sources: [f.married ? (calc.order === 1 ? 'arveloven_ektefelle' : 'arveloven_ektefelle_uten_barn') : 'arveloven_samboer_arv'] })
  if (calc.testament) m.push({ text: `Testamentet kan bestemme fritt over ${kr(calc.freePart)}. Vi har trukket fra ${kr(calc.testament.applied)} til mottakerne i testamentet.`, sources: ['arveloven_pliktdel', 'arveloven_testament_samboer'] })
  // «Resten» bare når noen har fått sin del først (ektefelle, samboer eller testament)
  const what = calc.partner.amount > 0 || calc.testament ? 'Resten' : calc.previous ? 'Arven etter avdøde' : 'Arven'
  const orderText = {
    1: `${what} er delt likt mellom barna til avdøde. Er et barn dødt, deler barnets barn den delen.`,
    2: `${what} er delt mellom foreldrene, halvparten hver. En død forelders del går til avdødes søsken på den siden.`,
    3: `${what} er delt halvt mellom farssiden og morssiden – besteforeldre, eller tanter, onkler og søskenbarn i deres sted.`,
  }[calc.order]
  if (orderText && calc.people.some(p => !p.isPartner && !p.isTestament && !p.isOther)) m.push({ text: orderText, sources: [{ 1: 'arveloven_livsarvinger', 2: 'arveloven_andre_arvegang', 3: 'arveloven_tredje_arvegang' }[calc.order]] })
  if (calc.advancementResult) m.push({ text: 'Forskudd på arv er lagt til det barna deler, og trukket fra hos den som mottok det.', sources: ['arveloven_avkorting'] })
  m.push({ text: 'Beløpene er rundet av til hele kroner. Verdiene du har lagt inn, er anslag – den endelige fordelingen avhenger av faktiske verdier ved oppgjøret.', sources: [] })
  return m
}

// ── Sammensatte situasjoner ──
// Svar som gjør at fordelingen vi viser, kan bli feil – fordi det finnes forhold veiviseren
// ikke kan regne på. Hver årsak peker på spørsmålet som utløste den, slik at UI-et kan varsle
// brukeren når svaret gis, og forklare nøyaktig hvorfor i resultatet.
// (Dødsfall før 2021 er ikke med her: det stopper hele beregningen og forklares som blokkering.)
function complexReasons(a, f, calc) {
  const r = []
  if (f.livedAbroad) r.push({
    id: 'livedAbroad', questionId: 'residence',
    title: a.residence === 'unknown' ? 'Du vet ikke om avdøde bodde fast i Norge' : 'Avdøde bodde ikke fast i Norge',
    text: 'Det er som hovedregel landet der avdøde bodde sist, som bestemmer hvilken arvelov som gjelder. Veiviseren regner bare etter norsk lov, så fordelingen kan bli en helt annen hvis et annet lands regler gjelder.',
  })
  if (f.skjevdeling) r.push({
    id: 'skjevdeling', questionId: 'skjevdeling',
    title: 'Det kan kreves skjevdeling',
    text: 'Om verdier fra før ekteskapet, arv og gaver kan holdes utenfor delingen, avhenger av om de kan dokumenteres og fortsatt finnes – og av om noen krever det. Det kan vi ikke vurdere, så dødsboet kan bli større eller mindre enn vi viser.',
  })
  if (f.commonNegative || calc?.estate.commonNegative) r.push({
    id: 'commonNegative', questionId: 'assets',
    title: 'Gjelden er større enn felles formue',
    text: 'Da kan felles formue ikke bare deles i to. Hvem som må dekke gjelden, avhenger av hvem av ektefellene som sto som låntaker – noe veiviseren ikke spør om.',
  })
  if (f.testamentUneven) r.push({
    id: 'testamentUneven', questionId: 'testamentContent',
    title: 'Testamentet gir noen arvinger mer enn andre, eller bestemte gjenstander',
    text: 'Vi vet ikke hvem som skal få hva, eller hva gjenstandene er verdt. Fordelingen vi viser, er derfor lovens hovedregel – ikke det testamentet faktisk bestemmer.',
  })
  if (f.testamentUskifte) r.push({
    id: 'testamentUskifte', questionId: 'testamentContent',
    title: 'Testamentet sier noe om uskifte',
    text: 'Et testament kan begrense retten til uskifte. Hva det betyr for dere, avhenger av ordlyden, som veiviseren ikke kan lese.',
  })
  if (f.testamentOther) r.push({
    id: 'testamentOther', questionId: 'testamentContent',
    title: 'Testamentet inneholder noe vi ikke kjenner',
    text: 'Du har svart «Noe annet, eller jeg er usikker». Vi kan ikke ta hensyn til innhold vi ikke vet hva er, så fordelingen bygger bare på loven.',
  })
  // Om testamentet gir bort for mye, vet vi først når formuen er lagt inn – derfor varsles det også der.
  if (calc?.testament?.exceeds && a.assets !== undefined && calc.E > 0) r.push({
    id: 'testamentExceeds', questionId: f.testamentGiveaway ? 'testamentAmount' : 'testamentCohabitantAmount', alsoOn: ['assets'],
    title: 'Testamentet gir bort mer enn loven tillater',
    text: 'Vi har redusert gavene til det testamentet lovlig kan bestemme over. Hvordan reduksjonen fordeles mellom mottakerne, og om arvingene krever den, kan vi ikke avgjøre.',
  })
  if (f.firstHeirsRelatives) r.push({
    id: 'previousUskifteRelatives', questionId: 'previousSpouseChildren',
    title: 'Vi kan ikke fordele delen som går til slekten til {first}',
    text: '{First} etterlot seg ingen barn eller barnebarn, så delen av uskifteboet som hører til hen, går til foreldrene, søsknene eller andre slektninger av hen. Veiviseren spør ikke om dem, så vi viser bare hvor mye de skal dele til sammen.',
  })
  if (calc?.estate.insolvent) r.push({
    id: 'insolvent', questionId: 'assets',
    title: 'Gjelden er større enn det avdøde eide',
    text: 'Da er det ingen arv å fordele. Hvilke krav som skal dekkes først, og om arvingene bør overta boet i det hele tatt, må avklares med tingretten.',
  })
  if (f.disagreement) r.push({
    id: 'disagreement', questionId: 'circumstances',
    title: 'Arvingene er uenige',
    text: 'Beregningen forutsetter at dere blir enige om et privat skifte. Ved uenighet kan hver arving kreve offentlig skifte, og da blir det bostyreren som avgjør oppgjøret – med kostnader som trekkes fra arven.',
  })
  if (f.unreachableHeir) r.push({
    id: 'unreachable', questionId: 'circumstances',
    title: 'En arving er ukjent eller vanskelig å nå',
    text: 'Alle arvingene må være med på et privat skifte. Vi vet ikke om det finnes flere arvinger enn de du har lagt inn, eller om boet må skiftes offentlig.',
  })
  return r
}

// Eksportert for bruk i UI og tester
export { ASSET_FIELDS, childLines }
