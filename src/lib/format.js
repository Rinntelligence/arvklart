// Tall, kroner og datoer. Ren logikk uten Supabase, slik at den kan testes med node --test.
import { locale } from './lang.js'

// Leser et kronebeløp slik folk skriver det: «1 500 kr», «1.500», «1500,50», «kr 2000».
// Et intervall («1000–2000 kr») gir midtpunktet. Returnerer null hvis det ikke er et beløp.
export function parseNOK(value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).toLowerCase().replace(/kr\.?|nok|,-/g, '').trim()
  const parts = text.split(/\s*[–—-]\s*/).filter(Boolean)
  if (parts.length === 2) {
    const [a, b] = parts.map(parseNOK)
    return a !== null && b !== null ? Math.round((a + b) / 2) : null
  }
  let s = text.replace(/[\s ]/g, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '') // 1.500 eller 1.500,50
  s = s.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  return Number(s)
}

// Formaterer et beløp som «kr 1 500». Tekst som ikke kan leses som beløp vises som den er.
export function formatNOK(value, fallback = '—') {
  const n = parseNOK(value)
  if (n !== null) return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)
  return value ? String(value) : fallback
}

// Dagens dato som YYYY-MM-DD i brukerens tidssone (toISOString gir UTC-dato).
export function localDateString(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// En frist (YYYY-MM-DD) er forfalt først dagen etter.
export const isOverdue = (dueDate, today = localDateString()) => Boolean(dueDate) && dueDate < today

// Viser en dato uten klokkeslett riktig uansett tidssone.
export function formatDateOnly(dateString, options = { day: 'numeric', month: 'short' }) {
  const [y, m, d] = String(dateString).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), options)
}
