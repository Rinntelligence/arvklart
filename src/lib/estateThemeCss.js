// CSS for oversikten i boet og gjenstandslisten (fargene står i estateTheme.js).
// Sidene bruker en <style>-blokk med klasser (prefiks «bo-») i stedet for bare inline style: hover, fokus,
// <details>-gruppene og mobiloppsettet krever CSS. Alt er avgrenset til .bo-mork, så ingenting lekker ut.
import { C } from './estateTheme.js'

// Pil ned i nedtrekkslister (data-URI er tillatt av CSP-en: img-src data:)
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%23B9B4A8' stroke-width='1.6'/%3E%3C/svg%3E")`

export const darkCss = `
/* Lange ord («fordelingskalkulatoren») deles i stedet for å kuttes, også med ekstra stor tekst på smal skjerm */
.bo-mork { color: ${C.lin}; font-family: Karla, sans-serif; overflow-wrap: break-word; hyphens: auto; }
.bo-mork :focus-visible { outline: 3px solid ${C.mose}; outline-offset: 2px; }
.bo-mork h1, .bo-mork h2 { font-family: Fraunces, serif; font-weight: 400; color: ${C.lin}; text-wrap: balance; }
.bo-side { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1rem 4.5rem; display: flex; flex-direction: column; gap: 2rem; }
.bo-side.bred { max-width: 72rem; gap: 1.5rem; }
.bo-dempet { color: ${C.linDempet}; }

/* Lenker og knapper */
.bo-topplinje { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: -1rem; }
.bo-lenke { display: inline-flex; align-items: center; min-height: 44px; padding: 0; background: none; border: 0; color: ${C.linDempet}; font: inherit; font-size: 0.875rem; text-decoration: none; cursor: pointer; }
.bo-lenke:hover { color: ${C.lin}; text-decoration: underline; text-underline-offset: 3px; }
.bo-knapp { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; min-height: 44px; padding: 0 1.125rem; border-radius: 8px; border: 1px solid ${C.lin}; background: transparent; color: ${C.lin}; font: inherit; font-size: 0.9375rem; font-weight: 600; text-decoration: none; white-space: nowrap; cursor: pointer; }
.bo-knapp:hover { background: rgba(242, 238, 230, 0.08); }
.bo-knapp.stille { border-color: ${C.linje}; }
.bo-knapp.fylt { background: ${C.lin}; color: ${C.natt}; }
.bo-knapp.fylt:hover { background: #FFFFFF; }
.bo-knapp.messing { background: ${C.messing}; border-color: ${C.messing}; color: ${C.natt}; }
.bo-knapp.messing:hover { background: #D4A877; }
.bo-knapp.slett { background: ${C.rust}; border-color: ${C.rust}; color: ${C.natt}; }
.bo-knapp:disabled { opacity: 0.5; cursor: not-allowed; }

/* Oversikten */
.bo-hode { display: flex; flex-direction: column; gap: 0.75rem; }
.bo-hode h1 { font-size: clamp(1.875rem, 5vw, 2.5rem); line-height: 1.1; }
.bo-status { display: flex; align-items: center; gap: 0.875rem; flex-wrap: wrap; font-size: 0.875rem; color: ${C.linDempet}; font-variant-numeric: tabular-nums; }
.bo-spor { width: 11rem; max-width: 100%; height: 4px; border-radius: 2px; background: ${C.kant}; overflow: hidden; }
.bo-spor > span { display: block; height: 100%; background: ${C.mose}; }
.bo-melding { border: 1px solid ${C.linje}; border-radius: 12px; padding: 1rem 1.25rem; color: ${C.linDempet}; font-size: 0.875rem; line-height: 1.5; }
.bo-anbefalt { background: ${C.granskog}; border-radius: 14px; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem 1.5rem; flex-wrap: wrap; }
.bo-anbefalt .tekst { flex: 1 1 18rem; min-width: 0; display: flex; flex-direction: column; gap: 0.375rem; }
.bo-anbefalt h2 { font-size: 1.5rem; line-height: 1.2; }
.bo-anbefalt p { color: rgba(242, 238, 230, 0.86); line-height: 1.5; }
.bo-etikett { font-size: 0.75rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; color: ${C.lin}; }
.bo-mork .bo-seksjonstittel { font-family: Karla, sans-serif; font-size: 0.8125rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; color: ${C.linDempet}; margin-bottom: 0.75rem; }

/* Nedtrekksgruppene */
.bo-grupper { display: flex; flex-direction: column; gap: 0.625rem; }
.bo-gruppe { background: ${C.flate}; border: 1px solid ${C.kant}; border-radius: 12px; }
.bo-gruppe[open] { background: ${C.flateHoy}; }
.bo-gruppe > summary { list-style: none; display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto 1rem; align-items: center; gap: 0.875rem; padding: 1rem 1.125rem; border-radius: 12px; cursor: pointer; }
.bo-gruppe > summary::-webkit-details-marker { display: none; }
.bo-ikon { width: 2.5rem; height: 2.5rem; border-radius: 10px; background: ${C.granskog}; display: grid; place-items: center; }
.bo-ikon svg { width: 1.25rem; height: 1.25rem; }
.bo-gruppe .tittel { display: block; font-family: Fraunces, serif; font-size: 1.25rem; line-height: 1.2; }
.bo-gruppe .beskrivelse { display: block; font-size: 0.875rem; color: ${C.linDempet}; }
.bo-hint { font-size: 0.8125rem; font-weight: 600; color: ${C.mose}; white-space: nowrap; }
.bo-pil { width: 0.875rem; height: 0.875rem; color: ${C.linDempet}; transition: transform 0.15s ease; }
.bo-gruppe[open] > summary .bo-pil { transform: rotate(180deg); }
.bo-valg { list-style: none; margin: 0; padding: 0 0.625rem 0.625rem; }
.bo-valg a { display: grid; grid-template-columns: minmax(0, 1fr) auto 1.125rem; align-items: center; gap: 0.875rem; padding: 0.875rem 0.75rem 0.875rem 3.875rem; border-top: 1px solid ${C.kant}; color: ${C.lin}; text-decoration: none; }
.bo-valg li:first-child a { border-top-color: transparent; }
.bo-valg a:hover { background: rgba(242, 238, 230, 0.05); border-radius: 8px; }
.bo-valg a:hover .navn { text-decoration: underline; text-underline-offset: 3px; }
.bo-valg .navn { display: block; font-weight: 600; }
.bo-valg .forklaring { display: block; font-size: 0.875rem; color: ${C.linDempet}; }
.bo-valg .til { color: ${C.linDempet}; }
.bo-tall { font-size: 0.8125rem; font-weight: 600; border-radius: 999px; padding: 0.0625rem 0.625rem; min-width: 1.75rem; text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bo-tall.venter { background: ${C.mose}; color: ${C.natt}; }
.bo-tall.noytral { color: ${C.linDempet}; border: 1px solid ${C.kant}; font-weight: 500; }

/* Gjenstandslisten */
.bo-listehode { display: flex; justify-content: space-between; align-items: flex-end; gap: 1rem; flex-wrap: wrap; }
.bo-listehode h1 { font-size: clamp(1.75rem, 4.4vw, 2.25rem); line-height: 1.12; }
.bo-verktoy { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto; gap: 0.625rem; align-items: center; }
.bo-mork input[type="search"], .bo-mork select { width: 100%; min-width: 0; min-height: 48px; padding: 0.625rem 0.875rem; border-radius: 8px; border: 1px solid ${C.linje}; background-color: ${C.natt}; color: ${C.lin}; font: inherit; font-size: 1rem; }
.bo-mork select { appearance: none; -webkit-appearance: none; padding-right: 2.5rem; background-image: ${CHEVRON}; background-repeat: no-repeat; background-position: right 0.875rem center; background-size: 0.75rem; }
.bo-mork input::placeholder { color: rgba(185, 180, 168, 0.75); }
.bo-mork option { background: ${C.flateHoy}; color: ${C.lin}; }
.bo-bryter { display: inline-flex; justify-self: start; border: 1px solid ${C.linje}; border-radius: 999px; padding: 3px; gap: 2px; }
.bo-bryter button { min-height: 40px; padding: 0 0.875rem; border: 0; border-radius: 999px; background: none; color: ${C.linDempet}; font: inherit; font-size: 0.875rem; cursor: pointer; }
.bo-bryter button[aria-pressed="true"] { background: ${C.lin}; color: ${C.natt}; font-weight: 600; }
.bo-seksjon { display: flex; flex-direction: column; gap: 0.75rem; }
.bo-seksjon > h2 { font-family: Karla, sans-serif; font-size: 0.8125rem; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 600; color: ${C.linDempet}; }
.bo-rutenett { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 14rem), 1fr)); gap: 1rem; }
.bo-kort { position: relative; display: flex; flex-direction: column; min-width: 0; background: ${C.flate}; border: 1px solid ${C.kant}; border-radius: 12px; overflow: hidden; }
.bo-kort.mitt { border: 2px solid ${C.mose}; }
.bo-kort > a { display: flex; flex-direction: column; flex: 1; color: inherit; text-decoration: none; }
.bo-kort > a:hover .navn { text-decoration: underline; text-underline-offset: 3px; }
.bo-bilde { position: relative; aspect-ratio: 4 / 3; max-width: 100%; background: ${C.flateHoy}; display: grid; place-items: center; overflow: hidden; }
.bo-bilde img { width: 100%; height: 100%; object-fit: contain; }
.bo-plassholder { display: flex; flex-direction: column; align-items: center; gap: 0.25rem; color: ${C.linDempet}; font-size: 0.8125rem; padding: 0 0.5rem; text-align: center; }
.bo-plassholder .emoji { font-size: 2.5rem; line-height: 1; }
.bo-merke { position: absolute; left: 0.5rem; top: 0.5rem; font-size: 0.75rem; font-weight: 600; padding: 0.125rem 0.625rem; border-radius: 999px; }
.bo-merke.tildelt { background: ${C.mose}; color: ${C.natt}; }
.bo-merke.flere { background: ${C.jord}; color: ${C.lin}; box-shadow: inset 0 0 0 1px ${C.linje}; }
.bo-merke.disponert { background: ${C.natt}; color: ${C.lin}; box-shadow: inset 0 0 0 1px ${C.linje}; }
.bo-kort .tekst { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.75rem 0.875rem 0.875rem; }
.bo-kort .navn { font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; }
.bo-kort .verdi, .bo-kort .hvem { font-size: 0.8125rem; color: ${C.linDempet}; font-variant-numeric: tabular-nums; }
.bo-kort .hvem.ingen { font-style: italic; }
.bo-kort .begrunnelse { padding: 0.5rem 0.875rem 0.875rem; border-top: 1px solid ${C.kant}; }
/* «Slett» er dempet til den pekes på eller får fokus, så den ikke tar oppmerksomheten fra gjenstandene */
.bo-slett { position: absolute; right: 0.5rem; top: 0.5rem; z-index: 2; min-height: 36px; padding: 0 0.75rem; border: 0; border-radius: 8px; background: rgba(31, 34, 30, 0.88); color: ${C.linDempet}; font: inherit; font-size: 0.8125rem; font-weight: 600; cursor: pointer; }
.bo-slett:hover, .bo-slett:focus-visible { background: ${C.rust}; color: ${C.natt}; }
.bo-tom { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 4rem 1rem; text-align: center; color: ${C.linDempet}; }
.bo-panel { background: ${C.flate}; border: 1px solid ${C.kant}; border-radius: 14px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.bo-panel h2 { font-size: 1.25rem; }
.bo-analyse { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; }
.bo-stolper { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.625rem; }
.bo-stolper li { display: grid; grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 2rem; gap: 0.75rem; align-items: center; font-size: 0.875rem; }
.bo-stolper .navn { line-height: 1.3; }
.bo-stolper .stolpe { height: 0.75rem; border-radius: 3px; background: ${C.kant}; overflow: hidden; }
.bo-stolper .stolpe span { display: block; height: 100%; background: ${C.mose}; }
.bo-stolper .antall { text-align: right; color: ${C.linDempet}; font-variant-numeric: tabular-nums; }
.bo-stabel { display: flex; height: 0.875rem; border-radius: 4px; overflow: hidden; gap: 2px; background: ${C.kant}; }
.bo-tegnforklaring { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.375rem 1.25rem; font-size: 0.875rem; color: ${C.linDempet}; font-variant-numeric: tabular-nums; }
.bo-tegnforklaring i { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 2px; margin-right: 0.375rem; }

@media (max-width: 45rem) {
  .bo-verktoy { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .bo-verktoy > :first-child { grid-column: 1 / -1; }
  .bo-verktoy .bo-bryter { grid-column: 1 / -1; justify-self: start; }
}
/* Smal mobil: én nedtrekksliste per linje, så antallet i «Vis» («Alle gjenstander (8)») ikke kuttes */
@media (max-width: 30rem) {
  .bo-verktoy { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 40rem) {
  .bo-side { padding-top: 1rem; gap: 1.5rem; }
  .bo-anbefalt { padding: 1.25rem; }
  .bo-anbefalt .bo-knapp { flex: 1 1 100%; }
  .bo-gruppe > summary { grid-template-columns: minmax(0, 1fr) 1rem; padding: 0.875rem 1rem; gap: 0.25rem 0.75rem; }
  .bo-ikon { display: none; }
  .bo-gruppe > summary > :nth-child(2) { grid-column: 1; grid-row: 1; }
  .bo-gruppe > summary .bo-hint { grid-column: 1; grid-row: 2; white-space: normal; }
  .bo-gruppe > summary .bo-pil { grid-column: 2; grid-row: 1 / span 2; }
  .bo-valg a { padding-left: 0.75rem; }
}
@media (max-width: 37.5rem) {
  .bo-rutenett { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.625rem; }
  .bo-kort .tekst { padding: 0.625rem; }
  .bo-kort .begrunnelse { padding: 0.5rem 0.625rem 0.625rem; }
  .bo-stolper li { grid-template-columns: minmax(0, 6rem) minmax(0, 1fr) 1.75rem; }
}
@media (prefers-reduced-motion: reduce) { .bo-pil { transition: none; } }
`
