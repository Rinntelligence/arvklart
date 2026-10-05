// Beslutningstreet: hvilke spørsmål som er relevante, om de er besvart, og
// opprydding av svar som ikke lenger gjelder når brukeren endrer et tidligere svar.

import { QUESTIONS } from './questions.js'
import { deriveFacts } from './facts.js'
import { evaluate } from './conditions.js'

export function visibleQuestions(answers = {}) {
  const facts = deriveFacts(answers)
  return QUESTIONS.filter(q => evaluate(q.showIf, { answers, facts }))
}

// Fjerner svar på spørsmål som er skjult med dagens svar. Gjentas til svarene er stabile,
// fordi et skjult svar kan ha påvirket hvilke andre spørsmål som vises.
// Selve lagrede svar beholdes i UI-et, slik at brukeren ikke mister dem ved å gå frem og tilbake.
export function pruneAnswers(answers = {}) {
  let current = { ...answers }
  for (let i = 0; i < 10; i++) {
    const visible = new Set(visibleQuestions(current).map(q => q.id))
    const next = {}
    for (const [k, v] of Object.entries(current)) if (visible.has(k)) next[k] = v
    if (Object.keys(next).length === Object.keys(current).length) return next
    current = next
  }
  return current
}

const isYesNo = v => v === 'yes' || v === 'no'
const isCount = v => v !== '' && v !== undefined && v !== null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 50
const isAmount = v => v === '' || v === undefined || v === null || (Number.isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.'))) && Number(String(v).replace(/\s/g, '').replace(',', '.')) >= 0)

export function validateChild(c, needsCommon) {
  if (!c || !isYesNo(c.alive)) return false
  if (needsCommon && !isYesNo(c.common)) return false
  if (c.alive === 'no' && !isCount(c.grandchildren)) return false
  return true
}

// Returnerer en feilmelding (string) hvis svaret ikke er gyldig/komplett, ellers null.
export function validationError(q, answers) {
  const v = answers[q.id]
  const facts = deriveFacts(answers)
  switch (q.type) {
    case 'single':
      return v ? null : 'Velg et av alternativene for å gå videre.'
    case 'multi':
      return Array.isArray(v) && v.length ? null : 'Velg minst ett alternativ.'
    case 'date': {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Skriv inn datoen for dødsfallet.'
      const today = new Date().toISOString().slice(0, 10)
      if (v > today) return 'Datoen kan ikke være frem i tid.'
      if (v < '1900-01-01') return 'Sjekk at årstallet er riktig.'
      return null
    }
    case 'number':
      return v !== undefined && v !== '' && isAmount(v) ? null : 'Skriv inn et beløp (bruk 0 hvis du ikke vet).'
    case 'children': {
      if (!Array.isArray(v) || !v.length) return 'Legg inn minst ett barn.'
      if (!v.every(c => validateChild(c, facts.hasPartner))) return 'Svar på spørsmålene for hvert barn.'
      if (answers.cohabitantChildren === 'yes' && !v.some(c => c.common === 'yes')) return 'Du har svart at dere hadde barn sammen. Marker minst ett barn som felles barn.'
      return null
    }
    case 'siblings': {
      if (!Array.isArray(v) || !v.length) return 'Legg inn minst ett søsken.'
      const ok = v.every(s => ['full', 'halfMother', 'halfFather'].includes(s.type) && isYesNo(s.alive) && (s.alive === 'yes' || isCount(s.children)))
      return ok ? null : 'Svar på spørsmålene for hvert søsken.'
    }
    case 'grandparents': {
      const sides = ['father', 'mother']
      const ok = v && sides.every(k => {
        const g = v[k]
        if (!g || !isYesNo(g.gp1) || !isYesNo(g.gp2)) return false
        const relatives = (g.gp1 === 'no' || g.gp2 === 'no') && Array.isArray(g.relatives) ? g.relatives : []
        return relatives.every(r => ['full', 'half1', 'half2'].includes(r.type) && isYesNo(r.alive) && (r.alive === 'yes' || isCount(r.children)))
      })
      return ok ? null : 'Svar på spørsmålene for begge sider av familien.'
    }
    case 'assets': {
      const vals = Object.values(v || {})
      return vals.every(isAmount) ? null : 'Beløpene må være tall.'
    }
    case 'amounts':
    case 'advancements':
      return Object.values(v || {}).every(isAmount) ? null : 'Beløpene må være tall.'
    default:
      return null
  }
}

export function firstUnanswered(answers) {
  return visibleQuestions(answers).find(q => validationError(q, answers)) || null
}
