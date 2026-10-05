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
import { fill, plain, kr, pct } from './text.js'

// ── Linjene fra eiendeler til det som skal arves ──
export function estateRows(skifte) {
  const e = skifte.estate
  const rows = []
  if (e.kind === 'married') {
    rows.push({ label: 'Det dere eide', amount: e.assets + Math.max(0, e.extraCommon) })
    rows.push({ label: '− Gjeld', amount: -e.debts })
    rows.push({ label: '= Felles formue etter gjeld', amount: e.commonNet, kind: 'sum' })
    rows.push({ label: 'Gjenlevendes egen halvdel – ikke arv', amount: -e.half, kind: 'keep' })
    rows.push({ label: '= Avdødes halvdel', amount: e.half, kind: 'sum' })
    if (e.deceasedSep) rows.push({ label: '+ Avdødes særeie', amount: e.deceasedSep })
  } else {
    rows.push({ label: 'Det avdøde eide', amount: e.assets })
    rows.push({ label: '− Gjeld', amount: -e.debts })
  }
  if (e.funeral) rows.push({ label: '− Begravelse', amount: -e.funeral })
  rows.push({ label: '= Dette skal arves', amount: skifte.E, kind: 'total' })
  return rows
}

// ── Svarene i lesbar form ──
export function answerText(q, answers, facts) {
  const v = answers[q.id]
  if (v === undefined || v === '' || v === null) return 'Ikke besvart'
  const n = x => Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')) || 0
  switch (q.type) {
    case 'single': return fill(q.options.find(o => o.value === v)?.label || v, facts)
    case 'multi': return (v || []).map(x => fill(q.options.find(o => o.value === x)?.label || x, facts)).join(', ')
    case 'date': return new Date(v).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
    case 'number': return kr(n(v))
    case 'children': return v.map((c, i) => {
      const name = c.name?.trim() || `Barn ${i + 1}`
      const bits = []
      if (facts.hasPartner) bits.push(c.common === 'yes' ? 'felles barn' : 'fra et annet forhold')
      if (c.alive === 'no') bits.push(`død, ${Number(c.grandchildren) || 0} barn`)
      else if (c.minor) bits.push('under 18 år')
      return `${name}${bits.length ? ` (${bits.join(', ')})` : ''}`
    }).join('; ')
    case 'siblings': return v.map((s, i) => {
      const name = s.name?.trim() || `Søsken ${i + 1}`
      const type = { full: 'samme mor og far', halfMother: 'samme mor', halfFather: 'samme far' }[s.type] || ''
      return `${name} (${type}${s.alive === 'no' ? `, død, ${Number(s.children) || 0} barn` : ''})`
    }).join('; ')
    case 'grandparents': return GRANDPARENT_SIDES.map(sd => {
      const g = v?.[sd.key] || {}
      const alive = [[sd.gp1, g.gp1], [sd.gp2, g.gp2]].filter(([, a]) => a === 'yes').map(([l]) => l)
      return `${sd.label}: ${alive.length ? alive.join(' og ') + ' lever' : 'ingen besteforeldre lever'}${g.relatives?.length ? `, ${g.relatives.length} tanter/onkler` : ''}`
    }).join('; ')
    case 'assets': {
      const total = Object.entries(v || {}).filter(([k]) => !['mortgage', 'otherDebt', 'funeral', 'sepDeceasedDebts'].includes(k)).reduce((s, [, x]) => s + n(x), 0)
      const debt = n(v?.mortgage) + n(v?.otherDebt) + n(v?.sepDeceasedDebts)
      return `Eiendeler ${kr(total)}, gjeld ${kr(debt)}${n(v?.funeral) ? `, begravelse ${kr(n(v.funeral))}` : ''}`
    }
    case 'amounts':
    case 'advancements': {
      const vals = Object.values(v || {}).map(n).filter(Boolean)
      return vals.length ? vals.map(kr).join(', ') : 'Ingen beløp'
    }
    default: return 'Lagt inn'
  }
}

export function answerSummary(answers, facts) {
  return visibleQuestions(answers).map(q => {
    const title = facts.survivor && q.titleSurvivor ? q.titleSurvivor : facts.married && q.titleMarried ? q.titleMarried : q.title
    return { id: q.id, section: SECTIONS.find(s => s.id === q.section)?.label || '', question: fill(title, facts), answer: answerText(q, answers, facts) }
  })
}

// ── Rapport til PDF ──
export function buildReport(answers, { date = new Date() } = {}) {
  const r = analyze(answers)
  const f = r.facts
  const P = t => plain(t, f)
  const sections = []

  sections.push({
    heading: 'Kort fortalt',
    blocks: [{ type: 'kv', rows: [
      ['Hvem arver?', P(r.who)],
      ...(r.skifte ? [['Hvor mye?', P(r.howMuchShort)]] : []),
      ['Hva gjør jeg nå?', P(r.firstStep)],
    ] }],
  })

  if (r.blockers.length) {
    sections.push({ heading: 'Dette må avklares først', blocks: r.blockers.map(b => ({ type: 'note', level: 'critical', title: b.title, text: P(b.text) })) })
  }

  if (r.complexReasons.length) {
    sections.push({
      heading: 'Derfor kan fordelingen bli annerledes',
      blocks: [
        { type: 'p', text: 'Situasjonen deres kan være mer sammensatt enn veiviseren kan beregne. Disse svarene gjør at fordelingen kan bli feil for dere:' },
        ...r.complexReasons.map(x => ({ type: 'note', level: 'warning', title: P(x.title), text: P(x.text) })),
        { type: 'p', text: 'Vurder å kontakte tingretten (gratis veiledning) eller en advokat før dere bestemmer dere.' },
      ],
    })
  }

  const situation = { heading: 'Din situasjon', blocks: r.situation.map(t => ({ type: 'p', text: P(t) })) }
  if (r.assumptions.length) situation.blocks.push({ type: 'note', level: 'warning', title: 'Dette har vi lagt til grunn', text: r.assumptions.map(a => '• ' + P(a.text)).join('\n') })
  sections.push(situation)

  if (r.skifte) {
    const s = r.skifte
    const blocks = [
      { type: 'p', text: P(r.howMuch) },
      { type: 'table', columns: ['', 'Beløp'], align: ['left', 'right'], rows: estateRows(s).map(x => ({ cells: [x.label, kr(Math.abs(x.amount))], strong: x.kind === 'total' || x.kind === 'sum' })) },
    ]
    if (s.people.length && s.E > 0) {
      blocks.push({
        type: 'table', columns: ['Arving', 'Forhold', 'Beløp', 'Andel'], align: ['left', 'left', 'right', 'right'],
        rows: [
          ...s.people.map(p => ({ cells: [p.label, [p.relation, p.side, p.common === 'no' ? 'særkullsbarn' : ''].filter(Boolean).join(', '), kr(p.amount), pct(p.amount / s.fullE)] })),
          ...(s.toCharity ? [{ cells: ['Frivillig arbeid for barn og unge', 'Ingen arvinger', kr(s.toCharity), pct(s.toCharity / s.fullE)] }] : []),
          { cells: ['Sum', '', kr(s.fullE), '100 %'], strong: true },
        ],
      })
    }
    if (s.estate.kind === 'married' && s.people.some(p => p.isPartner)) {
      blocks.push({ type: 'p', text: `I tillegg beholder gjenlevende sin egen halvdel av felles formue (${kr(s.estate.half)})${s.estate.survivorSep ? ` og sitt særeie (${kr(s.estate.survivorSep)})` : ''}. Det er ikke arv. Til sammen sitter gjenlevende igjen med ${kr(s.estate.half + s.estate.survivorSep + s.partner.amount)}.` })
    }
    for (const n of r.skifteNotices) blocks.push({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) })
    sections.push({ heading: r.uskifte ? 'Hvis dere skifter nå' : 'Slik fordeles boet', blocks })
  }

  if (r.uskifte) {
    const u = r.uskifte
    sections.push({
      heading: P(u.headline),
      blocks: [
        { type: 'p', text: P(u.lead) },
        { type: 'table', columns: ['', 'Beløp'], align: ['left', 'right'], rows: u.rows.map(x => ({ cells: [x.label, kr(x.amount)], strong: x.kind === 'total' })) },
        { type: 'subheading', text: 'Hva skjer nå' }, { type: 'list', items: u.now.map(P) },
        { type: 'subheading', text: 'Hva skjer senere' }, { type: 'list', items: u.later.map(P) },
        { type: 'subheading', text: 'Dette bør du vite før du velger uskifte' }, { type: 'list', items: u.consequences.map(P) },
        ...r.uskifteNotices.map(n => ({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) })),
      ],
    })
  }

  if (r.notices.length) {
    sections.push({ heading: 'Hva betyr dette for dere?', blocks: r.notices.map(n => ({ type: 'note', level: n.level, title: P(n.title), text: P(n.text) + (n.more ? '\n' + P(n.more) : '') })) })
  }

  sections.push({ heading: 'Dette bør dere gjøre nå', blocks: [{ type: 'steps', items: r.nextSteps.map(s => ({ title: P(s.title), text: P(s.text) })) }] })

  if (r.method.length) {
    sections.push({ heading: 'Slik har vi kommet frem til dette', blocks: [{ type: 'list', items: r.method.map(m => P(m.text)) }] })
  }

  sections.push({
    heading: 'Dine svar',
    blocks: [{ type: 'table', columns: ['Spørsmål', 'Svar'], align: ['left', 'left'], widths: [0.55, 0.45], rows: answerSummary(r.answers, f).map(a => ({ cells: [a.question, a.answer] })) }],
  })

  sections.push({
    heading: 'Kilder',
    blocks: [{ type: 'list', items: r.sourcesUsed.map(id => SOURCES[id]).filter(Boolean).map(s => `${s.title}: ${s.url}`) }],
  })

  return {
    title: 'Arveoppgjøret – oversikt',
    subtitle: `Laget med Arvklart sin arveveiviser ${date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    disclaimer: 'Dette er en veiledende beregning etter gjeldende regler, basert på opplysningene som er gitt. Det er ikke juridisk rådgivning, og det kan finnes forhold som ikke er tatt hensyn til. Ta kontakt med tingretten eller en advokat ved tvil.',
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
  smallEstate: 'Måned 1', publicSkifte: 'Måned 1', privateSkifte: 'Måned 1', clarify: 'Umiddelbart',
  divide: 'Fordeling', register: 'Fordeling',
}
export const WIZARD_TAG = 'Fra arveveiviseren'

export function toEstatePayload(answers) {
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
