// Tekst-hjelpere som deles av skjerm, PDF og lagring til boet.

import { TERMS } from './glossary.js'

// Fyller inn plassholdere som avhenger av hvem brukeren er.
export function fill(text, facts = {}) {
  const partner = facts.married ? 'ektefellen' : facts.cohabitant ? 'samboeren' : 'ektefellen eller samboeren'
  // Ektefellen/samboeren som døde før avdøde, når avdøde satt i uskifte etter hen.
  const first = facts.previousUskifteCohabitant ? 'samboeren som døde først' : facts.previousUskifteMarried ? 'ektefellen som døde først' : 'ektefellen eller samboeren som døde først'
  return String(text ?? '')
    .replaceAll('{First}', capFirst(first))
    .replaceAll('{first}', first)
    .replaceAll('{couple}', facts.survivor ? 'dere' : `avdøde og ${partner}`)
    .replaceAll('{partnerDu}', facts.survivor ? 'du' : partner)
    .replaceAll('{partnerDeg}', facts.survivor ? 'deg' : partner)
    .replaceAll('{partner}', partner)
}

// Ren tekst uten markering: **fet** og [[fagord|visning]] blir vanlig tekst.
export function plain(text, facts) {
  return fill(text, facts)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, key, label) => label || TERMS[key]?.term || key)
}

export const capFirst = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Kroner med vanlige mellomrom (Intl bruker smale, harde mellomrom som ikke finnes i PDF-fontene).
export const kr = n => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n || 0)).replace(/\s/g, ' ') + ' kr'
export const pct = x => {
  const v = (x || 0) * 100
  return (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1).replace('.', ',')) + ' %'
}
