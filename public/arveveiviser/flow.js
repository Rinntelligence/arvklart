// Beslutningstreet: hvilke spørsmål som er relevante, om de er besvart, og
// opprydding av svar som ikke lenger gjelder når brukeren endrer et tidligere svar.

import { QUESTIONS } from './questions.js'
import { deriveFacts } from './facts.js'
import { evaluate } from './conditions.js'
import { tr } from './i18n.js'

export function visibleQuestions(answers = {}) {
  const facts = deriveFacts(answers)
  return QUESTIONS.filter(q => evaluate(q.showIf, { answers, facts }))
}

// Fjerner svar på spørsmål som er skjult med dagens svar, og valg i flervalg som ikke lenger
// vises (for eksempel «Gir noe til samboeren» når avdøde var gift). Spørsmålene gås gjennom i
// rekkefølge, og hvert spørsmål vurderes bare mot svarene som er beholdt foran det – slik kan et
// skjult svar aldri styre hvilke andre spørsmål som vises.
// Alle svarene beholdes i UI-et (state.answers), slik at brukeren ikke mister dem ved å gå frem og
// tilbake. Navigasjon, validering og beregning skal likevel alltid bruke resultatet herfra.
export function pruneAnswers(answers = {}) {
  const kept = {}
  for (const q of QUESTIONS) {
    if (answers[q.id] === undefined) continue
    const ctx = { answers: kept, facts: deriveFacts(kept) }
    if (!evaluate(q.showIf, ctx)) continue
    const v = visibleChoice(q, answers[q.id], ctx)
    if (v !== undefined) kept[q.id] = v
  }
  // Sikkerhetsnett hvis en betingelse en gang skulle avhenge av et senere spørsmål
  for (let i = 0; i < 10; i++) {
    const visible = new Set(visibleQuestions(kept).map(q => q.id))
    const hidden = Object.keys(kept).filter(k => !visible.has(k))
    if (!hidden.length) break
    for (const k of hidden) delete kept[k]
  }
  return kept
}

// Tar bort valg brukeren ikke lenger ser (alternativer med egen `showIf`). Står det ingen valg
// igjen i et flervalg, regnes spørsmålet som ubesvart.
function visibleChoice(q, v, ctx) {
  if (!Array.isArray(q.options) || !q.options.some(o => o.showIf)) return v
  const hidden = new Set(q.options.filter(o => o.showIf && !evaluate(o.showIf, ctx)).map(o => o.value))
  if (!hidden.size) return v
  if (q.type === 'multi') {
    if (!Array.isArray(v)) return v
    const left = v.filter(x => !hidden.has(x))
    return left.length ? left : undefined
  }
  return hidden.has(v) ? undefined : v
}

// Dagens dato (ÅÅÅÅ-MM-DD) i brukerens tidssone. toISOString() gir UTC, som er gårsdagen
// mellom midnatt og kl. 01/02 norsk tid.
export function localToday(now = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// Sammenligner to sett svar uavhengig av rekkefølgen på nøklene (jsonb i Postgres sorterer dem om).
export function sameAnswers(a, b) {
  const canon = v => Array.isArray(v) ? v.map(canon)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => [k, canon(v[k])]))
      : v
  return JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null))
}

const isYesNo = v => v === 'yes' || v === 'no'
const isCount = v => v !== '' && v !== undefined && v !== null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 50
const isAmount = v => v === '' || v === undefined || v === null || (Number.isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.'))) && Number(String(v).replace(/\s/g, '').replace(',', '.')) >= 0)

export function validateChild(c, needsCommon, needsFirstCommon = false) {
  if (!c || !isYesNo(c.alive)) return false
  if (needsCommon && !isYesNo(c.common)) return false
  if (needsFirstCommon && !isYesNo(c.firstCommon)) return false
  if (c.alive === 'no' && !isCount(c.grandchildren)) return false
  return true
}

// Returnerer en feilmelding (string) hvis svaret ikke er gyldig/komplett, ellers null.
export function validationError(q, answers) {
  const v = answers[q.id]
  const facts = deriveFacts(answers)
  switch (q.type) {
    case 'single':
      return v ? null : tr('Velg et av alternativene for å gå videre.', 'Choose one of the options to continue.')
    case 'multi':
      return Array.isArray(v) && v.length ? null : tr('Velg minst ett alternativ.', 'Choose at least one option.')
    case 'date': {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return tr('Skriv inn datoen for dødsfallet.', 'Enter the date of death.')
      if (v > localToday()) return tr('Datoen kan ikke være frem i tid.', 'The date cannot be in the future.')
      if (v < '1900-01-01') return tr('Sjekk at årstallet er riktig.', 'Check that the year is correct.')
      return null
    }
    case 'number':
      if (q.optional && (v === undefined || v === '')) return null
      return v !== undefined && v !== '' && isAmount(v) ? null : tr('Skriv inn et beløp (bruk 0 hvis du ikke vet).', 'Enter an amount (use 0 if you do not know).')
    case 'percent': {
      if (q.optional && (v === undefined || v === '')) return null
      const n = Number(String(v ?? '').replace(',', '.'))
      return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 && n <= 100 ? null : tr('Skriv inn et tall mellom 0 og 100.', 'Enter a number between 0 and 100.')
    }
    case 'children': {
      if (!Array.isArray(v) || !v.length) return tr('Legg inn minst ett barn.', 'Add at least one child.')
      if (!v.every(c => validateChild(c, facts.hasPartner, facts.previousUskifte))) return tr('Svar på spørsmålene for hvert barn.', 'Answer the questions for each child.')
      if (answers.cohabitantChildren === 'yes' && !v.some(c => c.common === 'yes')) return tr('Du har svart at dere hadde barn sammen. Marker minst ett barn som felles barn.', 'You have answered that there were children together. Mark at least one child as a joint child.')
      return null
    }
    case 'otherChildren': {
      if (!Array.isArray(v) || !v.length) return tr('Legg inn minst ett barn.', 'Add at least one child.')
      return v.every(c => validateChild(c, false)) ? null : tr('Svar på spørsmålene for hvert barn.', 'Answer the questions for each child.')
    }
    case 'siblings': {
      if (!Array.isArray(v) || !v.length) return tr('Legg inn minst ett søsken.', 'Add at least one sibling.')
      const ok = v.every(s => ['full', 'halfMother', 'halfFather'].includes(s.type) && isYesNo(s.alive) && (s.alive === 'yes' || isCount(s.children)))
      return ok ? null : tr('Svar på spørsmålene for hvert søsken.', 'Answer the questions for each sibling.')
    }
    case 'grandparents': {
      const sides = ['father', 'mother']
      const ok = v && sides.every(k => {
        const g = v[k]
        if (!g || !isYesNo(g.gp1) || !isYesNo(g.gp2)) return false
        const relatives = (g.gp1 === 'no' || g.gp2 === 'no') && Array.isArray(g.relatives) ? g.relatives : []
        return relatives.every(r => ['full', 'half1', 'half2'].includes(r.type) && isYesNo(r.alive) && (r.alive === 'yes' || isCount(r.children)))
      })
      return ok ? null : tr('Svar på spørsmålene for begge sider av familien.', 'Answer the questions for both sides of the family.')
    }
    case 'assets': {
      const vals = Object.values(v || {})
      return vals.every(isAmount) ? null : tr('Beløpene må være tall.', 'The amounts must be numbers.')
    }
    case 'amounts':
    case 'advancements':
      return Object.values(v || {}).every(isAmount) ? null : tr('Beløpene må være tall.', 'The amounts must be numbers.')
    default:
      return null
  }
}

// Første spørsmål som mangler et gyldig svar, regnet ut fra svarene slik motoren ser dem.
export function firstUnanswered(answers) {
  const a = pruneAnswers(answers)
  return visibleQuestions(a).find(q => validationError(q, a)) || null
}
