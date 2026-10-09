// Gjør resultatet fra motoren om til:
//  - en rapport (dokumentmodell) som brukes til PDF-nedlasting
//  - oppsummering av svarene (skjerm og PDF)
//  - data som lagres i boet i Arvklart (arvinger, verdier og oppgaver)
// Rene funksjoner uten DOM, slik at alt kan testes.

import { analyze } from './engine.js'
import { visibleQuestions } from './flow.js'
import { SECTIONS } from './questions.js'
import { GRANDPARENT_SIDES } from './heirs.js'
import { SOURCES } from './sources.js'
import { TERMS, termsIn } from './glossary.js'
import { fill, plain, kr, pct } from './text.js'
import { tr, field, getLang, setLang, dateLocale } from './i18n.js'

// ── Linjene fra eiendeler til det som skal arves ──
export function estateRows(skifte) {
  const e = skifte.estate
  const rows = []
  if (e.kind === 'married') {
    rows.push({ label: tr('Det dere eide', 'What you owned'), amount: e.assets + Math.max(0, e.extraCommon) })
    rows.push({ label: tr('− Gjeld', '− Debts'), amount: -e.debts })
    rows.push({ label: tr('= Felles formue etter gjeld', '= Joint property after debts'), amount: e.commonNet, kind: 'sum' })
    rows.push({ label: tr('Gjenlevendes egen halvdel – ikke arv', "The survivor's own half – not inheritance"), amount: -e.half, kind: 'keep' })
    rows.push({ label: tr('= Avdødes halvdel', "= The deceased's half"), amount: e.half, kind: 'sum' })
    if (e.deceasedSep) rows.push({ label: tr('+ Avdødes særeie', "+ The deceased's separate property"), amount: e.deceasedSep })
  } else {
    rows.push({ label: tr('Det avdøde eide', 'What the deceased owned'), amount: e.assets })
    rows.push({ label: tr('− Gjeld', '− Debts'), amount: -e.debts })
  }
  if (e.funeral) rows.push({ label: tr('− Begravelse', '− Funeral'), amount: -e.funeral })
  // Satt avdøde i uskifte, deles boet mellom arvingene etter begge.
  if (skifte.previous) {
    rows.push({ label: tr('= Dette skal fordeles', '= To be distributed'), amount: skifte.fullE, kind: 'total' })
    rows.push({ label: tr('Herav til arvingene etter den som døde først', 'Of which to the heirs of the first to die'), amount: skifte.previous.amount })
    rows.push({ label: tr('Herav arv etter avdøde', 'Of which inheritance from the deceased'), amount: skifte.fullE - skifte.previous.amount })
    return rows
  }
  rows.push({ label: tr('= Dette skal arves', '= To be inherited'), amount: skifte.E, kind: 'total' })
  return rows
}

// ── Svarene i lesbar form ──
export function answerText(q, answers, facts) {
  const v = answers[q.id]
  if (v === undefined || v === '' || v === null) return tr('Ikke besvart', 'Not answered')
  const n = x => Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')) || 0
  switch (q.type) {
    case 'single': return fill(field(q.options.find(o => o.value === v), 'label') || v, facts)
    case 'multi': return (v || []).map(x => fill(field(q.options.find(o => o.value === x), 'label') || x, facts)).join(', ')
    case 'date': return new Date(v).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })
    case 'number': return kr(n(v))
    case 'percent': return `${String(v).replace('.', ',')} %`
    case 'children': return v.map((c, i) => {
      const name = c.name?.trim() || tr(`Barn ${i + 1}`, `Child ${i + 1}`)
      const bits = []
      if (facts.hasPartner) bits.push(c.common === 'yes' ? tr('felles barn', 'joint child') : tr('fra et annet forhold', 'from another relationship'))
      if (facts.previousUskifte) bits.push(c.firstCommon === 'yes' ? tr('også barn av den som døde først', 'also a child of the first to die') : tr('ikke barn av den som døde først', 'not a child of the first to die'))
      if (c.alive === 'no') bits.push(tr(`død, ${Number(c.grandchildren) || 0} barn`, `deceased, ${Number(c.grandchildren) || 0} children`))
      else if (c.minor) bits.push(tr('under 18 år', 'under 18'))
      return `${name}${bits.length ? ` (${bits.join(', ')})` : ''}`
    }).join('; ')
    case 'otherChildren': return v.map((c, i) => {
      const name = c.name?.trim() || tr(`Barn ${i + 1}`, `Child ${i + 1}`)
      return c.alive === 'no' ? tr(`${name} (død, ${Number(c.grandchildren) || 0} barn)`, `${name} (deceased, ${Number(c.grandchildren) || 0} children)`) : name
    }).join('; ')
    case 'siblings': return v.map((s, i) => {
      const name = s.name?.trim() || tr(`Søsken ${i + 1}`, `Sibling ${i + 1}`)
      const type = { full: tr('samme mor og far', 'same mother and father'), halfMother: tr('samme mor', 'same mother'), halfFather: tr('samme far', 'same father') }[s.type] || ''
      return `${name} (${type}${s.alive === 'no' ? tr(`, død, ${Number(s.children) || 0} barn`, `, deceased, ${Number(s.children) || 0} children`) : ''})`
    }).join('; ')
    case 'grandparents': return GRANDPARENT_SIDES.map(sd => {
      const g = v?.[sd.key] || {}
      const alive = [[field(sd, 'gp1'), g.gp1], [field(sd, 'gp2'), g.gp2]].filter(([, a]) => a === 'yes').map(([l]) => l)
      return `${field(sd, 'label')}: ${alive.length ? alive.join(tr(' og ', ' and ')) + tr(' lever', ' alive') : tr('ingen besteforeldre lever', 'no grandparents alive')}${g.relatives?.length ? tr(`, ${g.relatives.length} tanter/onkler`, `, ${g.relatives.length} aunts/uncles`) : ''}`
    }).join('; ')
    case 'assets': {
      const total = Object.entries(v || {}).filter(([k]) => !['mortgage', 'otherDebt', 'funeral', 'sepDeceasedDebts'].includes(k)).reduce((s, [, x]) => s + n(x), 0)
      const debt = n(v?.mortgage) + n(v?.otherDebt) + n(v?.sepDeceasedDebts)
      return tr(`Eiendeler ${kr(total)}, gjeld ${kr(debt)}`, `Assets ${kr(total)}, debts ${kr(debt)}`) + (n(v?.funeral) ? tr(`, begravelse ${kr(n(v.funeral))}`, `, funeral ${kr(n(v.funeral))}`) : '')
    }
    case 'amounts':
    case 'advancements': {
      const vals = Object.values(v || {}).map(n).filter(Boolean)
      return vals.length ? vals.map(kr).join(', ') : tr('Ingen beløp', 'No amounts')
    }
    default: return tr('Lagt inn', 'Entered')
  }
}

export function answerSummary(answers, facts) {
  return visibleQuestions(answers).map(q => {
    const title = facts.survivor && q.titleSurvivor ? field(q, 'titleSurvivor') : facts.married && q.titleMarried ? field(q, 'titleMarried') : field(q, 'title')
    const v = answers[q.id]
    return { id: q.id, section: field(SECTIONS.find(s => s.id === q.section), 'label') || '', question: plain(title, facts), answer: answerText(q, answers, facts), unanswered: v === undefined || v === '' || v === null }
  })
}

// ── Rapport til PDF ──
export function buildReport(answers, { date = new Date() } = {}) {
  const r = analyze(answers)
  const f = r.facts
  const P = t => plain(t, f)
  const sections = []

  sections.push({
    heading: tr('Kort fortalt', 'In brief'),
    blocks: [{ type: 'kv', rows: [
      [tr('Hvem arver?', 'Who inherits?'), P(r.who)],
      ...(r.skifte ? [[tr('Hvor mye?', 'How much?'), P(r.howMuchShort)]] : []),
      [tr('Hva gjør jeg nå?', 'What do I do now?'), P(r.firstStep)],
    ] }],
  })

  if (r.blockers.length) {
    sections.push({ heading: tr('Dette må avklares først', 'This must be clarified first'), blocks: r.blockers.map(b => ({ type: 'note', level: 'critical', title: P(field(b, 'title')), text: P(field(b, 'text')) })) })
  }

  if (r.complexReasons.length) {
    sections.push({
      heading: tr('Derfor kan fordelingen bli annerledes', 'Why the distribution may be different'),
      blocks: [
        { type: 'p', text: tr('Situasjonen deres kan være mer sammensatt enn veiviseren kan beregne. Disse svarene gjør at fordelingen kan bli feil for dere:', 'Your situation may be more complex than the guide can calculate. These answers mean the distribution may be wrong for you:') },
        ...r.complexReasons.map(x => ({ type: 'note', level: 'warning', title: P(field(x, 'title')), text: P(field(x, 'text')) })),
        { type: 'p', text: tr('Vurder å kontakte tingretten (gratis veiledning) eller en advokat før dere bestemmer dere.', 'Consider contacting the district court (free guidance) or a lawyer before you decide.') },
      ],
    })
  }

  const situation = { heading: tr('Din situasjon', 'Your situation'), blocks: r.situation.map(t => ({ type: 'p', text: P(t) })) }
  if (r.assumptions.length) situation.blocks.push({ type: 'note', level: 'warning', title: tr('Dette har vi lagt til grunn', 'What we have assumed'), text: r.assumptions.map(a => '• ' + P(field(a, 'text'))).join('\n') })
  sections.push(situation)

  if (r.skifte) {
    const s = r.skifte
    const blocks = [
      { type: 'p', text: P(r.howMuch) },
      { type: 'table', columns: ['', tr('Beløp', 'Amount')], align: ['left', 'right'], rows: estateRows(s).map(x => ({ cells: [x.label, kr(Math.abs(x.amount))], strong: x.kind === 'total' || x.kind === 'sum' })) },
    ]
    if (s.people.length && s.fullE > 0) {
      blocks.push({
        type: 'table', columns: [tr('Arving', 'Heir'), tr('Forhold', 'Relation'), tr('Beløp', 'Amount'), tr('Andel', 'Share')], align: ['left', 'left', 'right', 'right'],
        rows: [
          ...s.people.map(p => ({ cells: [field(p, 'label'), [field(p, 'relation'), field(p, 'side'), p.common === 'no' ? tr('særkullsbarn', 'child from another relationship') : ''].filter(Boolean).join(', '), kr(p.amount), pct(p.amount / s.fullE)] })),
          ...(s.toCharity ? [{ cells: [tr('Frivillig arbeid for barn og unge', 'Voluntary work for children and young people'), tr('Ingen arvinger', 'No heirs'), kr(s.toCharity), pct(s.toCharity / s.fullE)] }] : []),
          { cells: [tr('Sum', 'Total'), '', kr(s.fullE), '100 %'], strong: true },
        ],
      })
    }
    if (s.estate.kind === 'married' && s.people.some(p => p.isPartner)) {
      blocks.push({ type: 'p', text: tr(
        `I tillegg beholder gjenlevende sin egen halvdel av felles formue (${kr(s.estate.half)})${s.estate.survivorSep ? ` og sitt særeie (${kr(s.estate.survivorSep)})` : ''}. Det er ikke arv. Til sammen sitter gjenlevende igjen med ${kr(s.estate.half + s.estate.survivorSep + s.partner.amount)}.`,
        `In addition, the survivor keeps their own half of the joint property (${kr(s.estate.half)})${s.estate.survivorSep ? ` and their separate property (${kr(s.estate.survivorSep)})` : ''}. That is not inheritance. In total the survivor is left with ${kr(s.estate.half + s.estate.survivorSep + s.partner.amount)}.`) })
    }
    for (const n of r.skifteNotices) blocks.push({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) })
    sections.push({ heading: r.uskifte ? tr('Hvis dere skifter nå', 'If you settle now') : tr('Slik fordeles boet', 'How the estate is divided'), blocks })
  }

  if (r.uskifte) {
    const u = r.uskifte
    sections.push({
      heading: P(u.headline),
      blocks: [
        { type: 'p', text: P(u.lead) },
        { type: 'table', columns: ['', tr('Beløp', 'Amount')], align: ['left', 'right'], rows: u.rows.map(x => ({ cells: [x.label, kr(x.amount)], strong: x.kind === 'total' })) },
        { type: 'subheading', text: tr('Hva skjer nå', 'What happens now') }, { type: 'list', items: u.now.map(P) },
        { type: 'subheading', text: tr('Hva skjer senere', 'What happens later') }, { type: 'list', items: u.later.map(P) },
        { type: 'subheading', text: P(u.consequencesTitle) }, { type: 'list', items: u.consequences.map(P) },
        ...r.uskifteNotices.map(n => ({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) })),
      ],
    })
  }

  if (r.notices.length) {
    sections.push({ heading: tr('Hva betyr dette for dere?', 'What does this mean for you?'), blocks: r.notices.map(n => ({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) + (n.more ? '\n' + P(n.more) : '') })) })
  }

  sections.push({ heading: tr('Dette bør dere gjøre nå', 'What you should do now'), blocks: [{ type: 'steps', items: r.nextSteps.map(s => ({ title: P(s.title), text: P(s.text) })) }] })

  if (r.method.length) {
    sections.push({ heading: tr('Slik har vi kommet frem til dette', 'How we arrived at this'), blocks: [{ type: 'list', items: r.method.map(m => P(m.text)) }] })
  }

  sections.push({
    heading: tr('Dine svar', 'Your answers'),
    blocks: [{ type: 'table', columns: [tr('Spørsmål', 'Question'), tr('Svar', 'Answer')], align: ['left', 'left'], widths: [0.55, 0.45], rows: answerSummary(r.answers, f).map(a => ({ cells: [a.question, a.answer] })) }],
  })

  // Ordliste over fagordene som er brukt i rapporten – i PDF-en kan de ikke klikkes på.
  const raw = JSON.stringify([r.who, r.howMuch, r.firstStep, r.situation, r.blockers, r.notices, r.skifteNotices, r.uskifteNotices, r.nextSteps, r.method, r.complexReasons, r.uskifte, r.assumptions].map(x => x ?? ''))
  const used = termsIn(fill(raw, f))
  if (used.length) {
    sections.push({ heading: tr('Ordforklaringer', 'Glossary'), blocks: [{ type: 'list', items: used.map(k => { const t = field(TERMS[k], 'term'); return `${t.charAt(0).toUpperCase() + t.slice(1)}: ${field(TERMS[k], 'def')}` }) }] })
  }

  sections.push({
    heading: tr('Kilder', 'Sources'),
    blocks: [{ type: 'list', items: r.sourcesUsed.map(id => SOURCES[id]).filter(Boolean).map(s => `${field(s, 'title')}: ${s.url}`) }],
  })

  return {
    title: tr('Arveoppgjøret – oversikt', 'Inheritance settlement – overview'),
    subtitle: tr('Laget med Arvklart sin arveveiviser', "Made with Arvklart's inheritance guide") + ' ' + date.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }),
    disclaimer: tr('Dette er en veiledende beregning etter gjeldende regler, basert på opplysningene som er gitt. Det er ikke juridisk rådgivning, og det kan finnes forhold som ikke er tatt hensyn til. Ta kontakt med tingretten eller en advokat ved tvil.',
      'This is an indicative calculation under the current Norwegian rules, based on the information given. It is not legal advice, and there may be circumstances that have not been taken into account. Contact the district court or a lawyer if in doubt. This English version is a translation for guidance; the Norwegian version is the authoritative one.'),
    sections,
    result: r,
  }
}

// ── Data som lagres i boet ──
const RELATIONSHIP = {
  Ektefelle: 'Ektefelle / Partner', Samboer: 'Ektefelle / Partner', Barn: 'Barn', Barnebarn: 'Barnebarn',
  Forelder: 'Forelder', Søsken: 'Søsken', Halvsøsken: 'Søsken',
}
// Kategoriene som brukes på oppgavesiden i boet
const TASK_CATEGORY = {
  findTestament: 'Uke 1', overview: 'Uke 1', proklama: 'Uke 1',
  decideUskifte: 'Måned 1', consent: 'Måned 1', uskifteNotice: 'Måned 1', soleHeir: 'Måned 1',
  smallEstate: 'Måned 1', noHeirs: 'Måned 1', publicSkifte: 'Måned 1', privateSkifte: 'Måned 1', clarify: 'Umiddelbart',
  divide: 'Fordeling', register: 'Fordeling',
}
export const WIZARD_TAG = 'Fra arveveiviseren'

// Arvinger og oppgaver lagres alltid på norsk: de er delt innhold i boet, og skal ikke få språket til den
// som tilfeldigvis lagret (appen oversetter ved visning).
export function toEstatePayload(answers) {
  const lang = getLang()
  setLang('no')
  try { return estatePayload(answers) } finally { setLang(lang) }
}

function estatePayload(answers) {
  const r = analyze(answers)
  const f = r.facts
  const s = r.skifte
  const heirs = []
  if (s && s.fullE > 0) {
    for (const p of s.people) {
      const notes = [
        `${WIZARD_TAG}: ${kr(p.amount)} (${pct(p.amount / s.fullE)}) ved skifte nå.`,
        p.common === 'no' ? 'Særkullsbarn.' : '',
        p.side ? `Arver fra ${p.side}.` : '',
        p.advance ? `Forskudd på ${kr(p.advance)} er trukket fra.` : '',
        p.isPartner && s.estate.kind === 'married' ? `Beholder i tillegg sin halvdel av felles formue (${kr(s.estate.half)}).` : '',
      ].filter(Boolean).join(' ')
      heirs.push({
        // Fast id for personen i veiviseren (endres ikke når navnet endres), se ui.js og wizardEstate.js
        key: p.id,
        name: p.isPartner && f.survivor ? 'Meg (gjenlevende)' : p.label,
        relationship: RELATIONSHIP[p.relation] || 'Annen',
        percentage: Math.round((p.amount / s.fullE) * 10000) / 100,
        notes,
      })
    }
  }
  const tasks = r.nextSteps.map((st, i) => ({
    title: plain(st.title, f).slice(0, 200),
    description: `${plain(st.text, f)} · ${WIZARD_TAG}`,
    category: TASK_CATEGORY[st.id] || 'Måned 1',
    priority: 50 + i,
  }))
  return {
    totalValue: s ? s.fullE : null,
    heirs,
    tasks,
    summary: { who: plain(r.who, f), howMuch: s ? plain(r.howMuchShort, f) : null, blocked: r.blocked },
  }
}
