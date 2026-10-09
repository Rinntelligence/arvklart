// Engelske versjoner av tekstene motoren lager (din situasjon, hvem arver, hvor mye, uskifte og metode).
// Logikken er den samme som i engine.js; bare språket er annerledes. Brukes bare med ?lang=en.
// Den norske versjonen er den gjeldende; denne er en oversettelse til veiledning.
import { num } from './calculate.js'

const kr = n => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' kr'
const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const count = n => NUM_WORDS[n] || String(n)
const listJoin = items => items.length <= 1 ? (items[0] || '') : items.length === 2 ? `${items[0]} and ${items[1]}` : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1]
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

// ── Din situasjon ──
export function describeSituation(a, f, calc) {
  const s = []
  const you = f.survivor
  if (f.married) s.push(you ? 'You were married to the deceased.' : 'The deceased was married.')
  else if (f.cohabitantWithChildren) s.push(you ? 'You and the deceased were cohabitants and have children together.' : 'The deceased was cohabiting and had children with the cohabitant.')
  else if (f.cohabitantNoChildren) s.push(you ? 'You and the deceased were cohabitants without children together.' : 'The deceased was cohabiting, without children together.')
  else if (f.separated) s.push('The deceased was separated, or separation or divorce had been applied for.')
  else if (a.maritalStatus === 'none') s.push('The deceased was neither married nor cohabiting.')

  const children = Array.isArray(a.children) ? a.children : []
  const hasChildren = a.cohabitantChildren === 'yes' ? 'yes' : a.hasChildren
  if (hasChildren === 'yes' && children.length) {
    const n = children.length
    let t = `The deceased had ${count(n)} ${n === 1 ? 'child' : 'children'}`
    if (f.hasPartner) {
      const sep = children.filter(c => c.common === 'no').length
      const common = n - sep
      const all = n === 2 ? 'both' : 'all'
      if (sep === 0) t += n === 1 ? (you ? ', who is also your child' : ', who is also the child of the survivor') : (you ? ` – ${all} are also your children` : ` – ${all} are joint children with the survivor`)
      else if (common === 0) t += n === 1 ? ' from another relationship (særkullsbarn)' : ' from other relationships (særkullsbarn)'
      else t += ` – ${count(common)} joint and ${count(sep)} from another relationship (særkullsbarn)`
    }
    s.push(t + '.')
    for (const c of children.filter(x => x.alive === 'no')) {
      const k = Number(c.grandchildren) || 0
      const name = c.name?.trim() || 'One of the children'
      s.push(k > 0 ? `${cap(name)} has died, and ${k === 1 ? 'their child inherits' : `their ${count(k)} children inherit`} instead.` : `${cap(name)} has died without leaving children.`)
    }
  } else if (hasChildren === 'no') {
    s.push('The deceased had no children.')
    const p = { both: 'Both parents are alive.', mother: 'The mother is alive, but not the father.', father: 'The father is alive, but not the mother.', none: 'Neither parent is alive.' }[a.parents]
    if (p) s.push(p)
    if (a.hasSiblings === 'yes' && a.siblings?.length) s.push(`The deceased had ${count(a.siblings.length)} ${a.siblings.length === 1 ? 'sibling' : 'siblings'}.`)
  }

  if (f.previousUskifte) s.push('The deceased kept an undivided estate after {first}. The undivided estate is therefore to be divided between the heirs of both of them.')

  if (a.testament === 'no') s.push('There is no will.')
  else if (a.testament === 'yes') s.push('There is a will.')
  else if (a.testament === 'unknown') s.push('You do not know whether there is a will.')

  if (f.married) {
    if (a.separateProperty === 'no') s.push(you ? 'You have stated that you did not have a marital agreement on separate property.' : 'It has been stated that there was no marital agreement on separate property.')
    else if (f.separateProperty) s.push('There is separate property under a marital agreement.')
  }

  if (calc && calc.estate.assets + calc.estate.debts > 0) {
    const e = calc.estate
    const owners = you ? 'you' : 'the deceased and the spouse'
    if (e.kind === 'married' && e.commonNet < 0) s.push(`The debts are ${kr(-e.commonNet)} larger than what ${owners} owned together.`)
    else if (e.kind === 'married') s.push(`After debts, ${owners} owned ${kr(e.commonNet)} together. The deceased's half is ${kr(e.half)}${e.deceasedSep ? `, in addition to separate property of ${kr(e.deceasedSep)}` : ''}.`)
    if (calc.fullE > 0) s.push(calc.previous
      ? `After debts${e.funeral ? ' and the funeral' : ''}, **${kr(calc.fullE)}** is to be distributed – between the heirs of the deceased and the heirs of {first}.`
      : `After debts${e.funeral ? ' and the funeral' : ''}, **${kr(calc.fullE)}** is to be distributed after the deceased.`)
    else s.push('After the debts have been paid, there is nothing left to inherit.')
  }
  if (calc && f.uskifteAvailable && !calc.estate.insolvent) s.push('In this situation, the key question is whether to **settle now or keep an undivided estate**.')
  return s
}

// ── Hvem arver? ──
export function describeWho(a, f, calc) {
  if (!calc) {
    if (f.oldLaw) return 'That depends on the old Inheritance Act. The district court can help you.'
    return 'We cannot say for sure until the information below has been clarified.'
  }
  const people = calc.people
  const parts = []
  const partner = people.find(p => p.isPartner)
  if (partner) parts.push(f.survivor ? 'you' : f.married ? 'the surviving spouse' : 'the surviving cohabitant')
  if (people.some(p => p.id === 'testament-cohabitant')) parts.push(f.survivor ? 'you (under the will)' : 'the cohabitant (under the will)')
  const children = people.filter(p => p.relation === 'Barn')
  const grand = people.filter(p => p.relation === 'Barnebarn')
  if (children.length) {
    const allCommon = children.every(c => c.common === 'yes')
    if (f.survivor && partner && allCommon) parts.push(children.length === 1 ? 'your child' : `your ${count(children.length)} children`)
    else parts.push(children.length === 1 ? "the deceased's child" : `the deceased's ${count(children.length)} children`)
  }
  if (grand.length) parts.push(grand.length === 1 ? 'one grandchild' : `${count(grand.length)} grandchildren`)
  const ORDER = ['Forelder', 'Søsken', 'Halvsøsken', 'Nevø/niese', 'Besteforelder', 'Tante/onkel', 'Tante/onkel (halv)', 'Søskenbarn']
  const rel = people.filter(p => ORDER.includes(p.relation))
  const groups = {}
  for (const r of ORDER) { const n = rel.filter(p => p.relation === r).length; if (n) groups[r] = n }
  const names = { Søsken: ['one sibling', 'siblings'], Halvsøsken: ['one half-sibling', 'half-siblings'], 'Nevø/niese': ['a nephew or niece', 'nephews and nieces'], Besteforelder: ['a grandparent', 'grandparents'], 'Tante/onkel': ['an aunt or uncle', 'aunts and uncles'], 'Tante/onkel (halv)': ['an aunt or uncle', 'aunts and uncles'], Søskenbarn: ['a cousin', 'cousins'] }
  for (const [r, n] of Object.entries(groups)) {
    if (r === 'Forelder') { parts.push(n === 2 ? 'the parents' : rel.find(p => p.relation === r).label === 'Mor' ? 'the mother' : 'the father'); continue }
    if (r === 'Besteforelder' && n === 1) { parts.push(`the ${(rel.find(p => p.relation === r).label_en || 'grandparent').toLowerCase()}`); continue }
    const [one, many] = names[r]
    parts.push(n === 1 ? one : `${count(n)} ${many}`)
  }
  if (people.some(p => p.id === 'testament')) parts.push('the beneficiaries under the will')
  const firstChildren = people.filter(p => p.relation === 'Barn av den som døde først').length
  const firstGrand = people.filter(p => p.relation === 'Barnebarn av den som døde først').length
  if (firstChildren) parts.push(`${firstChildren === 1 ? 'one child' : `${count(firstChildren)} children`} of {first}`)
  if (firstGrand) parts.push(`${firstGrand === 1 ? 'one grandchild' : `${count(firstGrand)} grandchildren`} of {first}`)
  if (people.some(p => p.id === 'firstDeceased')) parts.push('the relatives of {first}')
  if (!parts.length) {
    if (calc.toCharity > 0) return 'There are no heirs under the law. Without a will, the inheritance goes to voluntary work for children and young people.'
    return 'According to your answers, nobody inherits.'
  }
  if (partner && calc.partnerTakesAll) {
    const why = calc.partner.basis === 'all'
      ? 'because the deceased left no children, parents, siblings, nephews or nieces'
      : calc.partner.basis === 'cohabitant4G' ? "because the estate is smaller than the cohabitant's inheritance of four times the basic amount" : 'because the estate is smaller than the minimum inheritance'
    return `${f.survivor ? 'You inherit' : `${cap(parts[0])} inherits`} everything, ${why}.`
  }
  if (parts.length === 1 && parts[0] === 'you') return 'You are the only heir.'
  const plural = parts.length > 1 || /children|parents|siblings|grandparents|aunts|cousins|nephews|grandchildren|beneficiaries|relatives/.test(parts[0])
  return `${cap(listJoin(parts))} ${plural ? 'are the heirs' : 'is the only heir'}.`
}

// ── Hvor mye? ──
export function describeHowMuch(calc, f, short = false) {
  if (calc.fullE <= 0) return 'There is nothing left to inherit after the debts have been paid.'
  const people = calc.people
  const partner = people.find(p => p.isPartner)
  const rest = people.filter(p => !p.isPartner && !p.isTestament && !p.isOther)
  const sameAmount = rest.length > 1 && rest.every(p => Math.abs(p.amount - rest[0].amount) <= 1)
  const others = partner ? 'the other heirs' : 'the heirs'
  const P = f.survivor ? 'you' : f.married ? 'the spouse' : 'the cohabitant'
  const gets = f.survivor ? 'get' : 'gets'
  const bits = []
  if (partner) bits.push(`${P} ${gets} ${kr(partner.amount)}`)
  const viaTestament = people.find(p => p.id === 'testament-cohabitant')
  if (viaTestament) bits.push(`${f.survivor ? 'you get' : 'the cohabitant gets'} ${kr(viaTestament.amount)} under the will`)
  if (rest.length === 1) bits.push(`${rest[0].relation === 'Barn' ? 'the child' : rest[0].label_en || rest[0].label} gets ${kr(rest[0].amount)}`)
  else if (sameAmount) bits.push(`${rest.every(p => p.relation === 'Barn') ? 'each of the children' : `each of ${others}`} gets ${kr(rest[0].amount)}`)
  else if (rest.length) bits.push(`${others} get different amounts – see the distribution below`)
  const recipients = people.find(p => p.id === 'testament')
  if (recipients) bits.push(`the beneficiaries under the will get ${kr(recipients.amount)} in total`)
  if (calc.previous?.amount > 0) {
    const split = `${kr(calc.previous.amount)} goes to the heirs of {first}, and ${kr(calc.fullE - calc.previous.amount)} is inheritance from the deceased.`
    const p = partner ? ` Of this, ${P} ${gets} ${kr(partner.amount)}.` : ''
    return `${short ? '' : 'Based on the information you have entered: '}${split}${p} See the distribution below for what each person gets.`
  }
  if (!bits.length && calc.toCharity > 0) return `The whole inheritance (${kr(calc.toCharity)}) goes to voluntary work for children and young people.`
  if (!bits.length) return 'See the distribution below.'
  return short ? cap(listJoin(bits)) + '.' : `Based on the information you have entered, the distribution is as follows: ${listJoin(bits)}.`
}

// ── Uskifte ──
export function describeUskifte(u, calc, f) {
  const you = f.survivor
  const P = you ? 'you' : (f.married ? 'the spouse' : 'the cohabitant')
  const Pc = cap(P)
  const v = (youForm, otherForm) => (you ? youForm : otherForm) // «you can» / «the spouse can»
  const heirsWord = calc.order === 1 ? 'the children' : 'the other heirs'
  const their = you ? 'your' : 'their'
  const rows = [], now = [], later = [], consequences = [], compare = []
  let lead = ''

  if (u.status === 'free') lead = calc.order === 1
    ? `${Pc} can keep an undivided estate without asking the children for permission, because they are all joint children.`
    : `${Pc} can keep an undivided estate without consent from the deceased's parents or siblings.`
  const one = calc.people.filter(p => p.common === 'no').length === 1
  if (u.status === 'consent') lead = one ? `The child from another relationship consents, so ${P} can keep the whole estate undivided.` : `All the children from other relationships consent, so ${P} can keep the whole estate undivided.`
  if (u.status === 'partial') lead = one
    ? `Because the child from another relationship does not consent, they must receive their inheritance now. ${Pc} can keep the rest undivided.`
    : `Because not all the children from other relationships consent, they must receive their inheritance now. ${Pc} can keep the rest undivided. We have calculated as if none of them consent.`
  if (u.status === 'unknown') lead = one
    ? `${Pc} can only keep the share of the child from another relationship undivided if they consent. If they do not, they receive their inheritance now, and ${P} can keep the rest undivided.`
    : `${Pc} can only keep the share of the children from other relationships undivided if they consent. If they do not, they receive their inheritance now, and ${P} can keep the rest undivided.`

  if (u.kind === 'married') {
    rows.push({ label: `The undivided estate – what ${P} take${v('', 's')} over`, amount: u.uskifteValue, kind: 'total' })
    if (u.separateNow) {
      lead += ` The deceased's separate property (${kr(u.separateNow.value)}) is only included if the heirs consent or the marital agreement says so.`
      rows.push({ label: `Without consent: the separate property is settled now – ${P} inherit${v('', 's')} about`, amount: u.separateNow.partner })
      rows.push({ label: `– and ${heirsWord} get about`, amount: u.separateNow.others })
    }
    now.push(`${Pc} take${v('', 's')} over all the joint property – including the half that would otherwise have been the deceased's – and can use it as ${their} own.`)
    now.push(calc.order === 1 ? 'Joint children do not receive their inheritance now.' : "The deceased's parents or siblings do not receive their inheritance now.")
    now.push(`${Pc} become${v('', 's')} personally liable for all the deceased's debts.`)
    now.push(`${Pc} receive${v('', 's')} an [[uskifteattest|undivided estate certificate]] from the district court.`)
    later.push(`When ${P} die${v('', 's')}, the undivided estate is split into two equal halves: half to the heirs of the deceased and half to the heirs of ${you ? 'you' : P}.`)
    later.push(`${Pc} can choose to settle at any time. ${Pc} then receive${v('', 's')} ${their} inheritance under the rules, and ${heirsWord} receive their share.`)
    later.push(`If ${P} remarr${v('y', 'ies')}, the undivided estate must be settled first. If ${P} get${v('', 's')} a new cohabitant for at least two years, or a child${you ? '' : ''} with a new cohabitant, the heirs can demand a settlement.`)
  } else {
    rows.push({ label: `Home, holiday home, car and contents after the mortgage – what ${P} can take over undivided`, amount: u.uskifteValue, kind: 'total' })
    if (u.restNow > 0) rows.push({ label: 'The rest is settled now between the heirs', amount: u.restNow })
    lead = `As a cohabitant with joint children, ${P} can keep the joint home and contents, car and holiday home undivided. Other assets, for example bank deposits and shares, must be settled now. ` + lead
    now.push(`${Pc} keep${v('', 's')} the home, contents, car and holiday home undivided.`)
    now.push('The children do not receive their share of these assets now.')
    now.push(`${Pc} become${v('', 's')} personally liable for the deceased's debts.`)
    later.push(`When ${P} die${v('', 's')}, the undivided estate is divided according to the ratio of values between ${you ? 'you' : 'the cohabitants'} when the undivided estate started – not necessarily equally.`)
    later.push(`${Pc} can choose to settle at any time. ${Pc} can then claim the inheritance of four times the basic amount.`)
    later.push(`If ${P} marr${v('y', 'ies')}, or get${v('', 's')} a new cohabitant for at least two years or a child with a new cohabitant, the heirs can demand a settlement.`)
  }
  for (const p of u.paidNow) rows.push({ label: `${p.label_en || p.label} gets now`, amount: p.amount })
  if (u.ifRefuse.length) for (const p of u.ifRefuse) rows.push({ label: `If ${p.label_en || p.label} does not consent, they get now`, amount: p.amount })

  consequences.push(`${Pc} cannot give away large gifts without the heirs' consent. Gifts out of proportion to the assets can be demanded reversed.`)
  consequences.push('The value of the estate may change. The heirs may receive more or less later than they would have received now.')
  consequences.push(`${Pc} take${v('', 's')} responsibility for all the debts – including debts nobody knew about. A [[proklama]] can give an overview first.`)
  consequences.push(`An undivided estate is not permitted if ${you ? 'your' : "the survivor's"} own debts or finances make it risky for the heirs.`)
  consequences.push('The notice of an undivided estate must be sent to the district court within 60 days of the death.')

  compare.push(u.paidNow.length ? `Only ${listJoin(u.paidNow.map(p => p.label_en || p.label))} receive${u.paidNow.length === 1 ? 's' : ''} inheritance now.` : 'Nobody receives inheritance now.')
  compare.push(`${Pc} take${v('', 's')} over ${u.kind === 'married' ? 'all the joint property' : 'the home, car, holiday home and contents'} (${kr(u.uskifteValue)}).`)
  compare.push(`${cap(heirsWord)} inherit later – usually when ${P} die${v('', 's')}.`)
  compare.push(`${Pc} take${v('', 's')} responsibility for all debts.`)

  return {
    status: u.status, kind: u.kind,
    headline: you ? 'If you choose an undivided estate' : `If ${P} chooses an undivided estate`,
    consequencesTitle: you ? 'What you should know before choosing an undivided estate' : `What you should know before ${P} chooses an undivided estate`,
    lead, rows, now, later, consequences, compare,
    choiceIntro: `${you ? 'You' : cap(P)} can as a main rule choose between settling with ${heirsWord} now, or keeping an [[uskifte|undivided estate]].`,
  }
}

// ── Slik har vi kommet frem til dette ──
export function describeMethod(calc, f, G) {
  const m = []
  const e = calc.estate
  m.push({ text: `We have used the Inheritance Act of 2019, which applies to deaths from 1 January 2021, and the basic amount (G) on the date of death: ${kr(G.value)}.`, sources: ['arveloven_ikraft', 'nav_g'] })
  if (e.kind === 'married') {
    m.push({ text: `The joint property after debts (${kr(e.commonNet)}) has been split into two equal halves. The survivor keeps their half. The deceased's half (${kr(e.half)})${e.deceasedSep ? ` and the deceased's separate property (${kr(e.deceasedSep)})` : ''} is the estate.`, sources: ['ekteskapsloven_deling', 'ekteskapsloven_dodsfall'] })
  } else {
    m.push({ text: `The deceased's assets (${kr(e.assets)}) minus debts (${kr(e.debts)}) make up the estate.`, sources: [] })
  }
  if (e.funeral) m.push({ text: `The funeral (${kr(e.funeral)}) has been deducted before the inheritance is distributed.`, sources: [] })
  if (calc.previous) {
    const p = calc.previous
    const share = p.ratio === 0.5 ? 'half' : `${Math.round(p.ratio * 100)} per cent`
    const outside = p.outside ? ` First, ${kr(p.outside)} that did not belong to the undivided estate has been kept out – that is inheritance from the deceased only.` : ''
    const lines = p.commonLines.length + p.otherLines.length
    const split = lines ? ` That part has been divided equally between ${lines === 1 ? 'the child' : `the ${count(lines)} children`} of {first}${p.otherLines.length ? ', including children they had with others' : ''}.` : ''
    m.push({ text: `Because the deceased kept an undivided estate after {first}, ${share} of the undivided estate (${kr(p.amount)}) goes to the heirs of {first}.${outside}${split}`, sources: ['arveloven_uskifte_deling', ...(f.previousUskifteCohabitant ? ['arveloven_uskifte_samboer_deling'] : []), 'arveloven_uskifte_arvinger'] })
  }
  const basisText = {
    quarter: 'The spouse inherits a quarter because the deceased had children.',
    min4G: `The spouse inherits the minimum inheritance of four times G (${kr(4 * G.value)}), because that is more than a quarter.`,
    half: 'The spouse inherits half because the deceased had no children, but had parents or siblings.',
    min6G: `The spouse inherits the minimum inheritance of six times G (${kr(6 * G.value)}).`,
    all: 'The spouse inherits everything because there are no children, parents or siblings.',
    cohabitant4G: `The cohabitant inherits four times G (${kr(4 * G.value)}), because the cohabitants had joint children.`,
  }[calc.partner.basis]
  if (basisText && calc.partner.amount > 0) m.push({ text: `${basisText}${calc.partner.limitedByTestament ? ' The will has reduced the inheritance to the minimum inheritance.' : ''} That comes to ${kr(calc.partner.amount)}.`, sources: [f.married ? (calc.order === 1 ? 'arveloven_ektefelle' : 'arveloven_ektefelle_uten_barn') : 'arveloven_samboer_arv'] })
  if (calc.testament) m.push({ text: `The will can freely decide over ${kr(calc.freePart)}. We have deducted ${kr(calc.testament.applied)} for the beneficiaries under the will.`, sources: ['arveloven_pliktdel', 'arveloven_testament_samboer'] })
  const what = calc.partner.amount > 0 || calc.testament ? 'The rest' : calc.previous ? 'The inheritance from the deceased' : 'The inheritance'
  const orderText = {
    1: `${what} has been divided equally between the deceased's children. If a child has died, that child's children share that part.`,
    2: `${what} has been divided between the parents, half each. A deceased parent's share goes to the deceased's siblings on that side.`,
    3: `${what} has been divided half to the father's side and half to the mother's side – grandparents, or aunts, uncles and cousins in their place.`,
  }[calc.order]
  if (orderText && calc.people.some(p => !p.isPartner && !p.isTestament && !p.isOther)) m.push({ text: orderText, sources: [{ 1: 'arveloven_livsarvinger', 2: 'arveloven_andre_arvegang', 3: 'arveloven_tredje_arvegang' }[calc.order]] })
  if (calc.advancementResult) m.push({ text: 'Advances on inheritance have been added to what the children share, and deducted from the person who received them.', sources: ['arveloven_avkorting'] })
  m.push({ text: 'Amounts have been rounded to whole kroner. The values you entered are estimates – the final distribution depends on actual values at the settlement.', sources: [] })
  return m
}

export { num }
