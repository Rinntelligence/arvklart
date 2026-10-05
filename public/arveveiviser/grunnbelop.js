// Grunnbeløpet i folketrygden (G). Justeres 1. mai hvert år.
// Minstearv og grensen for pliktdelsarv beregnes med G på dødsdagen.
// Kilde: NAV – «Grunnbeløpet i folketrygden» (se sources.js: nav_g).
// NB: Legg inn nytt beløp hvert år etter trygdeoppgjøret.

export const G_TABLE = [
  { from: '2020-05-01', value: 101351 },
  { from: '2021-05-01', value: 106399 },
  { from: '2022-05-01', value: 111477 },
  { from: '2023-05-01', value: 118620 },
  { from: '2024-05-01', value: 124028 },
  { from: '2025-05-01', value: 130160 },
  { from: '2026-05-01', value: 136549 },
]

export function grunnbelop(date) {
  const d = date || new Date().toISOString().slice(0, 10)
  let current = G_TABLE[0]
  for (const row of G_TABLE) if (d >= row.from) current = row
  return current
}
