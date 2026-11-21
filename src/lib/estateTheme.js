// Mørkt uttrykk for oversikten i boet (EstatePage) og gjenstandslisten (EstateItemsPage).
// Fargene er fra fargepaletten «Landingssiden (mørk)», pluss Granskog fra produktpaletten. Resten av appen
// bruker fortsatt de lyse fargene i CLAUDE.md; sidene løypene leder til (sveip, fordeling osv.) er lyse.
//
// Denne filen er liten med vilje: App.jsx bruker den, og den havner da i hovedfilen som også lastes på de
// offentlige sidene. CSS-en for sidene ligger i estateThemeCss.js, som bare lastes med bo-sidene.

export const C = {
  natt: '#1F221E',      // bakgrunn
  jord: '#3A3129',      // merket «vil ha» på kortene
  granskog: '#2F4A43',  // «Anbefalt nå» og ikonene til gruppene
  flate: '#272A25',     // kort og grupper (Natt løftet litt)
  flateHoy: '#30342D',  // åpen gruppe, dialoger og bildebakgrunn
  lin: '#F2EEE6',       // tekst og knappekanter
  linDempet: '#B9B4A8', // sekundærtekst (8,5:1 mot Natt)
  linje: 'rgba(242, 238, 230, 0.4)',  // feltkanter (3,4:1 mot Natt)
  kant: 'rgba(242, 238, 230, 0.14)',  // hårstreker, bare pynt
  mose: '#9DAA8C',      // aksent og fokusring (6,9:1 mot Natt)
  messing: '#C79A6B',   // sjelden: den anbefalte handlingen, høyst én gang per skjerm
  rust: '#E08A7A',      // sletting og feil
}

// Sidene med mørk bakgrunn: /estate/:id og /estate/:id/gjenstander. App.jsx farger hele siden etter dette,
// så det ikke blir en lys stripe under innholdet.
export const isDarkEstatePath = pathname => /^\/estate\/[^/]+(\/gjenstander)?\/?$/.test(pathname)
