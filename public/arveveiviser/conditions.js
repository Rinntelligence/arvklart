// Liten, datadrevet betingelsesmotor.
// Spørsmål, regler og neste steg beskriver NÅR de gjelder med objekter som disse,
// slik at juridisk logikk ikke spres rundt i UI-koden:
//
//   { q: 'maritalStatus', eq: 'married' }          svar på spørsmål
//   { q: 'maritalStatus', in: ['married', 'x'] }
//   { q: 'testament', answered: true }
//   { q: 'testamentContent', includes: 'giveaway' } flervalg inneholder verdi
//   { fact: 'hasSeparateChildren' }                 avledet fakta er sann
//   { fact: 'order', eq: 2 }                        avledet fakta har verdi
//   { all: [ ... ] }  { any: [ ... ] }  { not: { ... } }

export function evaluate(cond, ctx) {
  if (!cond) return true
  if (Array.isArray(cond)) return cond.every(c => evaluate(c, ctx))
  if (cond.all) return cond.all.every(c => evaluate(c, ctx))
  if (cond.any) return cond.any.some(c => evaluate(c, ctx))
  if (cond.not) return !evaluate(cond.not, ctx)

  let value
  if ('q' in cond) value = ctx.answers?.[cond.q]
  else if ('fact' in cond) value = ctx.facts?.[cond.fact]
  else throw new Error('Ukjent betingelse: ' + JSON.stringify(cond))

  if ('eq' in cond) return value === cond.eq
  if ('ne' in cond) return value !== cond.ne
  if ('in' in cond) return cond.in.includes(value)
  if ('includes' in cond) return Array.isArray(value) && value.includes(cond.includes)
  if ('gt' in cond) return typeof value === 'number' && value > cond.gt
  if ('answered' in cond) return (value !== undefined && value !== null && value !== '') === cond.answered
  return Boolean(value)
}
