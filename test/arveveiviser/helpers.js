// Felles hjelpere for testene av arveveiviseren.
import { analyze } from '../../public/arveveiviser/engine.js'

export const G = 136549 // fra 1. mai 2026
export const DATE = '2026-06-01'

let n = 0
export const child = (props = {}) => ({ id: `c${++n}`, alive: 'yes', ...props })
export const sibling = (props = {}) => ({ id: `s${++n}`, alive: 'yes', type: 'full', ...props })

// Et komplett sett svar med nøytrale standarder; overstyr det som er relevant i hver test.
export function base(overrides = {}) {
  return {
    role: 'relative', deathDate: DATE, residence: 'yes',
    testament: 'no', debtOverview: 'yes', circumstances: ['none'],
    // Sikkerhetsspørsmålene om flere ledd (F11) vises bare når noen er døde; «Nei» gir samme resultat som før
    deeperDescendants: 'no', deeperSiblingDescendants: 'no', deeperFirstSpouseDescendants: 'no',
    ...overrides,
  }
}

export function married(overrides = {}) {
  return base({ maritalStatus: 'married', separateProperty: 'no', skjevdeling: 'no', advancements: 'no', ...overrides })
}

export function single(overrides = {}) {
  return base({ maritalStatus: 'none', previousUskifte: 'no', advancements: 'no', ...overrides })
}

export function run(answers) {
  return analyze(answers)
}

export const amountOf = (r, id) => r.skifte.people.find(p => p.id === id)?.amount
export const byRelation = (r, rel) => r.skifte.people.filter(p => p.relation === rel)
export const sumPeople = r => r.skifte.people.reduce((s, p) => s + p.amount, 0) + r.skifte.toCharity

// Forskudd (F14) der vilkårene for avkorting er oppfylt: betydelig gave gitt før 2021, og avdøde sa det
export const ADVANCE_OK = { advancements: 'yes', advancementTiming: 'before2021', advancementSubstantial: 'yes' }
