// Brukergrensesnittet for arveveiviseren. Her ligger ingen juridiske regler –
// alt slikt hentes fra questions.js, flow.js og engine.js.

import { QUESTION_BY_ID, SECTIONS, ASSET_FIELDS, DEBT_FIELDS } from './questions.js'
import { visibleQuestions, validationError } from './flow.js'
import { deriveFacts } from './facts.js'
import { evaluate } from './conditions.js'
import { analyze } from './engine.js'
import { SOURCES } from './sources.js'
import { TERMS } from './glossary.js'
import { GRANDPARENT_SIDES, childLines } from './heirs.js'
import { fill, kr as krPlain, pct } from './text.js'
import { estateRows, answerSummary, toEstatePayload } from './report.js'

const STORAGE_KEY = 'arvklart-arveveiviser-v1'
const root = document.getElementById('arvWizard')

// ── Tilstand og lagring ──────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* privat modus o.l. */ }
}
const fresh = () => ({ answers: {}, current: null, view: 'intro', resultView: null, returnTo: null })
let state = { ...fresh(), ...(load() || {}) }
let error = null

// Kontakt med Arvklart-appen rundt veiviseren (iframe i GuidePage). Appen tar seg av
// innlogging og lagring i boet; veiviseren sender bare svarene og ferdig beregnede data.
const embedded = window.parent !== window
const host = { ready: false, loggedIn: false, estate: null, saved: null, saving: false, message: null }
let pdfBusy = false
let pdfError = null
const toHost = msg => { if (embedded) window.parent.postMessage(msg, window.location.origin) }

// ── Hjelpere ─────────────────────────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const kr = krPlain
const uid = () => Math.random().toString(36).slice(2, 9)

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
}

// Erstatter plassholdere og gjør [[fagord]] om til klikkbare forklaringer.
function rich(text, facts) {
  return esc(fill(text, facts))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, key, label) => {
      const t = TERMS[key]
      if (!t) return label || key
      return `<button type="button" class="aw-term" data-def="${esc(t.def)}" aria-expanded="false">${label || t.term}</button>`
    })
}
function titleFor(q, facts) {
  if (facts.survivor && q.titleSurvivor) return fill(q.titleSurvivor, facts)
  if (facts.married && q.titleMarried) return fill(q.titleMarried, facts)
  return fill(q.title, facts)
}
// Kompakt kildelinje, brukt der mange kilder ellers ville gjort teksten tung å lese.
function sourceLine(ids = []) {
  const list = ids.map(id => SOURCES[id]).filter(Boolean)
  if (!list.length) return ''
  return `<p class="aw-src-line">Kilde: ${list.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.short || s.title)}</a>`).join(' · ')}</p>`
}
function sourceLinks(ids = []) {
  const list = ids.map(id => SOURCES[id]).filter(Boolean)
  if (!list.length) return ''
  return `<div class="aw-sources">${list.map(s => `<a class="item-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.short || s.title)}${ICON.ext}</a>`).join('')}</div>`
}

function setAnswer(id, value) {
  state.answers = { ...state.answers, [id]: value }
  error = null
  save()
}

// ── Navigasjon ───────────────────────────────────────────────
function go(view, current) {
  state.view = view
  if (current !== undefined) state.current = current
  error = null
  save()
  render()
  root.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function nextQuestion() {
  const qs = visibleQuestions(state.answers)
  const q = QUESTION_BY_ID[state.current]
  if (q) {
    const err = validationError(q, state.answers)
    if (err) { error = err; render(); return }
  }
  // Ved endring fra oversikten eller resultatet: gå tilbake dit – men først til spørsmål
  // som endringen har gjort relevante og som ikke er besvart ennå.
  if (state.returnTo) {
    const open = visibleQuestions(state.answers).find(x => validationError(x, state.answers))
    if (open && open.id !== state.current) return go('question', open.id)
    const to = state.returnTo
    state.returnTo = null
    return go(to)
  }
  const idx = qs.findIndex(x => x.id === state.current)
  const next = qs[idx + 1]
  if (next) go('question', next.id)
  else go('result')
}
// Hopp til et spørsmål for å endre det, og kom tilbake dit brukeren var.
function editQuestion(id) {
  state.returnTo = state.view === 'review' || state.view === 'result' ? state.view : state.returnTo
  go('question', id)
}
function prevQuestion() {
  const qs = visibleQuestions(state.answers)
  const idx = qs.findIndex(x => x.id === state.current)
  if (idx > 0) go('question', qs[idx - 1].id)
  else go('intro')
}

// ── Visninger ────────────────────────────────────────────────
function render() {
  const facts = deriveFacts(state.answers)
  let html = ''
  if (state.view === 'question' && QUESTION_BY_ID[state.current]) html = renderQuestion(QUESTION_BY_ID[state.current], facts)
  else if (state.view === 'review') html = renderReview(facts)
  else if (state.view === 'result') html = renderResult()
  else html = renderIntro()
  root.innerHTML = html
  const focusTarget = root.querySelector('[data-autofocus]')
  if (focusTarget) focusTarget.focus({ preventScroll: true })
}

function renderIntro() {
  const hasProgress = Object.keys(state.answers).length > 0
  return `
  <div class="aw-card aw-intro">
    <span class="eyebrow">Arveveiviser</span>
    <h2>Hvem arver – og hvor mye?</h2>
    <p>Svar på noen enkle spørsmål om familien og økonomien. Du får en oversikt over hvem som arver, omtrent hvor mye hver får, og hva dere bør gjøre nå.</p>
    <ul class="aw-intro-list">
      <li>${ICON.check}<span>Du trenger ikke kunne noe om arveregler – vi forklarer underveis.</span></li>
      <li>${ICON.check}<span>Det tar omtrent 5 minutter. Omtrentlige tall holder.</span></li>
      <li>${ICON.check}<span>Svarene lagres bare i din egen nettleser.</span></li>
    </ul>
    <div class="aw-actions">
      ${hasProgress
        ? `<button type="button" class="aw-btn primary" data-action="resume">Fortsett der du slapp ${ICON.arrow}</button>
           <button type="button" class="aw-btn ghost" data-action="restart">Start på nytt</button>`
        : `<button type="button" class="aw-btn primary" data-action="start">Start ${ICON.arrow}</button>`}
    </div>
  </div>`
}

function renderProgress(qs, idx, q) {
  const activeSections = SECTIONS.filter(s => qs.some(x => x.section === s.id))
  const pctDone = Math.round((idx / qs.length) * 100)
  const openIdx = qs.findIndex(x => validationError(x, state.answers))
  const firstOpen = openIdx === -1 ? qs.length : openIdx
  return `
  <div class="aw-progress" aria-label="Fremdrift">
    <div class="aw-progress-top">
      <span>Steg ${idx + 1} av ${qs.length}</span>
      <span class="aw-progress-section">${esc(SECTIONS.find(s => s.id === q.section)?.label || '')}</span>
    </div>
    <div class="aw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctDone}"><span style="width:${pctDone}%"></span></div>
    <ol class="aw-steps">${activeSections.map(s => {
      const sIdx = SECTIONS.findIndex(x => x.id === s.id)
      const curIdx = SECTIONS.findIndex(x => x.id === q.section)
      const first = qs.findIndex(x => x.section === s.id)
      // Brukeren kan hoppe til alle deler som er nådd – også fremover når alt før er besvart.
      const reachable = first <= firstOpen && s.id !== q.section
      const cls = s.id === q.section ? 'current' : sIdx < curIdx ? 'done' : ''
      return `<li class="${cls}">${reachable ? `<button type="button" data-action="edit" data-q="${qs[first].id}" data-keep="1">${esc(s.label)}</button>` : esc(s.label)}</li>`
    }).join('')}</ol>
  </div>`
}

function renderLearnMore(q, facts) {
  const lm = q.learnMore
  if (!lm || (!lm.text && !lm.sources?.length)) return ''
  return `
  <details class="aw-more">
    <summary>${esc(fill(lm.title || 'Les mer', facts))}</summary>
    ${lm.text ? `<p>${rich(lm.text, facts)}</p>` : ''}
    ${sourceLinks(lm.sources)}
  </details>`
}

function renderQuestion(q, facts) {
  const qs = visibleQuestions(state.answers)
  let idx = qs.findIndex(x => x.id === q.id)
  if (idx === -1) { state.current = qs[0]?.id; return renderQuestion(qs[0], facts) }
  const isLast = idx === qs.length - 1
  return `
  <div class="aw-card aw-question" data-q="${q.id}">
    ${renderProgress(qs, idx, q)}
    <h3 class="aw-title" tabindex="-1" data-autofocus>${esc(titleFor(q, facts))}</h3>
    <p class="aw-why"><span>Hvorfor spør vi om dette?</span> ${rich(q.why, facts)}</p>
    <div class="aw-input">${renderInput(q, facts)}</div>
    ${error ? `<p class="aw-error" role="alert">${esc(error)}</p>` : ''}
    ${renderLearnMore(q, facts)}
    <div class="aw-nav">
      <button type="button" class="aw-btn ghost" data-action="prev">${ICON.back} Tilbake</button>
      <button type="button" class="aw-btn primary" data-action="next">${state.returnTo ? 'Lagre endringen' : isLast ? 'Se resultatet' : 'Neste'} ${ICON.arrow}</button>
    </div>
    <div class="aw-quicklinks">
      ${idx > 0 ? '<button type="button" class="aw-link" data-action="review">Se over og endre alle svarene</button>' : ''}
      ${!state.returnTo && qs.every(x => !validationError(x, state.answers)) ? '<button type="button" class="aw-link" data-action="result">Gå rett til resultatet</button>' : ''}
    </div>
  </div>`
}

// ── Inndata ──────────────────────────────────────────────────
function seg(path, value, options) {
  return `<div class="aw-seg" role="group">${options.map(o =>
    `<button type="button" class="${value === o.value ? 'on' : ''}" data-action="set" data-path="${path}" data-value="${o.value}" aria-pressed="${value === o.value}">${esc(o.label)}</button>`).join('')}</div>`
}
function moneyInput(path, value, label, hint) {
  return `<label class="aw-money">
    <span class="aw-money-label">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
    <span class="aw-money-field"><input type="text" inputmode="numeric" autocomplete="off" data-path="${path}" value="${esc(value ?? '')}" placeholder="0"><span>kr</span></span>
  </label>`
}
function countInput(path, value) {
  return `<input class="aw-count" type="number" min="0" max="50" step="1" inputmode="numeric" data-path="${path}" value="${esc(value ?? '')}">`
}

function renderInput(q, facts) {
  const v = state.answers[q.id]
  const ctx = { answers: state.answers, facts }
  switch (q.type) {
    case 'single':
      return `<div class="aw-options">${q.options.filter(o => evaluate(o.showIf, ctx)).map(o => `
        <button type="button" class="aw-option ${v === o.value ? 'selected' : ''}" data-action="choose" data-value="${o.value}" aria-pressed="${v === o.value}">
          <span class="aw-radio"></span><span><span class="aw-option-label">${esc(fill(o.label, facts))}</span>${o.hint ? `<span class="aw-option-hint">${esc(fill(o.hint, facts))}</span>` : ''}</span>
        </button>`).join('')}</div>`
    case 'multi': {
      const arr = Array.isArray(v) ? v : []
      return `<div class="aw-options">${q.options.filter(o => evaluate(o.showIf, ctx)).map(o => `
        <button type="button" class="aw-option multi ${arr.includes(o.value) ? 'selected' : ''}" data-action="toggle" data-value="${o.value}" aria-pressed="${arr.includes(o.value)}">
          <span class="aw-checkbox">${ICON.check}</span><span><span class="aw-option-label">${esc(fill(o.label, facts))}</span>${o.hint ? `<span class="aw-option-hint">${esc(fill(o.hint, facts))}</span>` : ''}</span>
        </button>`).join('')}</div>`
    }
    case 'date':
      return `<input class="aw-date" type="date" data-path="${q.id}" value="${esc(v || '')}" max="${new Date().toISOString().slice(0, 10)}" min="1900-01-01">`
    case 'number':
      return moneyInput(q.id, v, 'Beløp')
    case 'amounts':
      return q.fields.map(f => moneyInput(`${q.id}.${f.key}`, v?.[f.key], f.label)).join('')
    case 'children': return renderChildren(v, facts)
    case 'siblings': return renderSiblings(v)
    case 'grandparents': return renderGrandparents(v)
    case 'assets': return renderAssets(v || {}, facts)
    case 'advancements': {
      const lines = childLines(state.answers.children || [])
      return lines.map(l => moneyInput(`${q.id}.${l.id}`, v?.[l.id], l.label)).join('') +
        '<p class="aw-hint">La feltet stå tomt for barn som ikke fikk forskudd.</p>'
    }
    default: return ''
  }
}

function renderChildren(list, facts) {
  const children = Array.isArray(list) && list.length ? list : null
  if (!children) {
    // Start med ett tomt barn, så brukeren ser hva vi spør om.
    state.answers.children = [{ id: uid() }]
    return renderChildren(state.answers.children, facts)
  }
  const commonQ = facts.survivor ? 'Er dette også ditt barn?' : `Er dette også barnet til ${fill('{partner}', facts)}?`
  return `<div class="aw-rows">${children.map((c, i) => `
    <div class="aw-row">
      <div class="aw-row-head">
        <input class="aw-name" type="text" maxlength="40" placeholder="Barn ${i + 1} (navn er valgfritt)" data-path="children.${i}.name" value="${esc(c.name || '')}">
        ${children.length > 1 ? `<button type="button" class="aw-remove" data-action="remove" data-path="children" data-index="${i}" aria-label="Fjern barn ${i + 1}">Fjern</button>` : ''}
      </div>
      ${facts.hasPartner ? `<div class="aw-field"><span>${esc(commonQ)}</span>${seg(`children.${i}.common`, c.common, [{ value: 'yes', label: 'Ja, felles barn' }, { value: 'no', label: 'Nei, fra et annet forhold' }])}</div>` : ''}
      <div class="aw-field"><span>Lever barnet?</span>${seg(`children.${i}.alive`, c.alive, [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nei, er død' }])}</div>
      ${c.alive === 'no' ? `<div class="aw-field"><span>Hvor mange barn etterlot barnet seg? <small>Skriv 0 hvis ingen</small></span>${countInput(`children.${i}.grandchildren`, c.grandchildren)}</div>` : ''}
      ${c.alive === 'yes' ? `<label class="aw-check"><input type="checkbox" data-path="children.${i}.minor" ${c.minor ? 'checked' : ''}> Barnet er under 18 år</label>` : ''}
    </div>`).join('')}
    <button type="button" class="aw-add" data-action="add" data-path="children">${ICON.plus} Legg til barn</button>
    <p class="aw-hint">Venter dere barn? Legg det inn som et barn som lever.</p>
  </div>`
}

function renderSiblings(list) {
  const siblings = Array.isArray(list) && list.length ? list : (state.answers.siblings = [{ id: uid() }])
  return `<div class="aw-rows">${siblings.map((s, i) => `
    <div class="aw-row">
      <div class="aw-row-head">
        <input class="aw-name" type="text" maxlength="40" placeholder="Søsken ${i + 1} (navn er valgfritt)" data-path="siblings.${i}.name" value="${esc(s.name || '')}">
        ${siblings.length > 1 ? `<button type="button" class="aw-remove" data-action="remove" data-path="siblings" data-index="${i}" aria-label="Fjern søsken ${i + 1}">Fjern</button>` : ''}
      </div>
      <div class="aw-field"><span>Hvilke foreldre hadde de felles?</span>${seg(`siblings.${i}.type`, s.type, [{ value: 'full', label: 'Samme mor og far' }, { value: 'halfMother', label: 'Bare samme mor' }, { value: 'halfFather', label: 'Bare samme far' }])}</div>
      <div class="aw-field"><span>Lever søskenet?</span>${seg(`siblings.${i}.alive`, s.alive, [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nei, er død' }])}</div>
      ${s.alive === 'no' ? `<div class="aw-field"><span>Hvor mange barn har søskenet som lever? <small>Skriv 0 hvis ingen</small></span>${countInput(`siblings.${i}.children`, s.children)}</div>` : ''}
    </div>`).join('')}
    <button type="button" class="aw-add" data-action="add" data-path="siblings">${ICON.plus} Legg til søsken</button>
  </div>`
}

function renderGrandparents(v = {}) {
  return `<div class="aw-rows">${GRANDPARENT_SIDES.map(side => {
    const g = v[side.key] || {}
    const relatives = Array.isArray(g.relatives) ? g.relatives : []
    const someoneDead = g.gp1 === 'no' || g.gp2 === 'no'
    const base = `grandparents.${side.key}`
    return `<div class="aw-row">
      <div class="aw-row-title">${side.label}</div>
      <div class="aw-field"><span>Lever ${side.gp1.toLowerCase()}?</span>${seg(`${base}.gp1`, g.gp1, [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nei' }])}</div>
      <div class="aw-field"><span>Lever ${side.gp2.toLowerCase()}?</span>${seg(`${base}.gp2`, g.gp2, [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nei' }])}</div>
      ${someoneDead ? `<div class="aw-sub">
        <p class="aw-hint">Tanter og onkler på ${side.label.toLowerCase()} – altså barna til ${side.gp1.toLowerCase()} og ${side.gp2.toLowerCase()}, bortsett fra avdødes ${side.key === 'father' ? 'far' : 'mor'}. La listen være tom hvis det ikke finnes noen.</p>
        ${relatives.map((r, i) => `<div class="aw-subrow">
          <div class="aw-row-head"><input class="aw-name" type="text" maxlength="40" placeholder="Tante/onkel ${i + 1}" data-path="${base}.relatives.${i}.name" value="${esc(r.name || '')}">
          <button type="button" class="aw-remove" data-action="removeNested" data-path="${base}.relatives" data-index="${i}">Fjern</button></div>
          <div class="aw-field"><span>Hvem er foreldrene?</span>${seg(`${base}.relatives.${i}.type`, r.type, [{ value: 'full', label: `Både ${side.gp1.toLowerCase()} og ${side.gp2.toLowerCase()}` }, { value: 'half1', label: `Bare ${side.gp1.toLowerCase()}` }, { value: 'half2', label: `Bare ${side.gp2.toLowerCase()}` }])}</div>
          <div class="aw-field"><span>Lever hen?</span>${seg(`${base}.relatives.${i}.alive`, r.alive, [{ value: 'yes', label: 'Ja' }, { value: 'no', label: 'Nei' }])}</div>
          ${r.alive === 'no' ? `<div class="aw-field"><span>Hvor mange barn (avdødes søskenbarn) lever?</span>${countInput(`${base}.relatives.${i}.children`, r.children)}</div>` : ''}
        </div>`).join('')}
        <button type="button" class="aw-add" data-action="addNested" data-path="${base}.relatives">${ICON.plus} Legg til tante eller onkel</button>
      </div>` : ''}
    </div>`
  }).join('')}</div>`
}

function renderAssets(v, facts) {
  const married = facts.married
  const sep = facts.married && state.answers.separateProperty === 'yes'
  const sepDeceased = sep && ['deceased', 'both'].includes(state.answers.separatePropertyWho)
  const sepSurvivor = sep && ['survivor', 'both'].includes(state.answers.separatePropertyWho)
  const intro = married
    ? `<p class="aw-hint aw-hint-box">Ta med alt <strong>dere eide til sammen</strong> – både det som sto på avdøde og på gjenlevende. Ektefellers felles formue deles først i to like deler. Bare avdødes halvdel er arv.${sep ? ' Det som etter ektepakten skal holdes utenfor, fører du opp nederst.' : ''}</p>`
    : facts.cohabitant
      ? '<p class="aw-hint aw-hint-box">Ta bare med det <strong>avdøde eide</strong>. Eide dere noe sammen, for eksempel boligen, fører du opp avdødes andel. Det samboeren eier selv, er ikke en del av arven.</p>'
      : '<p class="aw-hint aw-hint-box">Ta med det avdøde eide og skyldte. Omtrentlige beløp holder.</p>'
  return `${intro}
  <fieldset class="aw-group"><legend>${married ? 'Det dere eide' : 'Det avdøde eide'}</legend>
    ${ASSET_FIELDS.map(f => moneyInput(`assets.${f.key}`, v[f.key], f.label, f.hint)).join('')}
  </fieldset>
  <fieldset class="aw-group"><legend>${married ? 'Det dere skyldte' : 'Det avdøde skyldte'}</legend>
    ${DEBT_FIELDS.map(f => moneyInput(`assets.${f.key}`, v[f.key], f.label, f.hint)).join('')}
  </fieldset>
  ${sepDeceased ? `<fieldset class="aw-group"><legend>Avdødes eiendeler som skal holdes utenfor (særeie)</legend>
    ${moneyInput('assets.sepDeceasedAssets', v.sepDeceasedAssets, 'Verdi', 'Ikke ta det med i feltene over også')}
    ${moneyInput('assets.sepDeceasedDebts', v.sepDeceasedDebts, 'Gjeld knyttet til dette')}
  </fieldset>` : ''}
  ${sepSurvivor ? `<fieldset class="aw-group"><legend>Gjenlevendes eiendeler som skal holdes utenfor (særeie)</legend>
    ${moneyInput('assets.sepSurvivor', v.sepSurvivor, 'Verdi etter gjeld', 'Ikke ta det med i feltene over også')}
  </fieldset>` : ''}
  <fieldset class="aw-group"><legend>Utgifter etter dødsfallet</legend>
    ${moneyInput('assets.funeral', v.funeral, 'Begravelse og gravstein', 'Dekkes av boet før arven fordeles')}
  </fieldset>
  <div class="aw-live" aria-live="polite">${liveTotal(v, facts)}</div>`
}

function liveTotal(v, facts) {
  const n = x => { const k = Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(k) && k > 0 ? k : 0 }
  const assets = ASSET_FIELDS.reduce((s, f) => s + n(v[f.key]), 0)
  const debts = DEBT_FIELDS.reduce((s, f) => s + n(v[f.key]), 0)
  return `<span>Eiendeler ${kr(assets)}</span><span>− Gjeld ${kr(debts)}</span><strong>= ${kr(assets - debts)}</strong>`
}

// ── Oversikt over svar ──────────────────────────────────────
function renderReview(facts) {
  const rows = answerSummary(state.answers, facts)
  const groups = []
  for (const r of rows) {
    if (!groups.length || groups[groups.length - 1].section !== r.section) groups.push({ section: r.section, rows: [] })
    groups[groups.length - 1].rows.push(r)
  }
  const missing = visibleQuestions(state.answers).find(q => validationError(q, state.answers))
  return `
  <div class="aw-card">
    <span class="eyebrow">Dine svar</span>
    <h3 class="aw-title" tabindex="-1" data-autofocus>Se over og endre svarene dine</h3>
    <p class="aw-why">Trykk på «Endre» ved et svar for å rette det. Du kommer tilbake hit etterpå, og resultatet oppdateres automatisk.</p>
    ${groups.map(g => `
      <h4 class="aw-review-section">${esc(g.section)}</h4>
      <dl class="aw-review">${g.rows.map(r => `
        <div><dt>${esc(r.question)}</dt><dd>${r.answer === 'Ikke besvart' ? '<em>Ikke besvart</em>' : esc(r.answer)}</dd>
        <button type="button" class="aw-link" data-action="edit" data-q="${r.id}" aria-label="Endre: ${esc(r.question)}">${ICON.edit} Endre</button></div>`).join('')}
      </dl>`).join('')}
    <div class="aw-nav">
      <button type="button" class="aw-btn ghost" data-action="restart">Start på nytt</button>
      ${missing
        ? `<button type="button" class="aw-btn primary" data-action="edit" data-q="${missing.id}">Svar på det som mangler ${ICON.arrow}</button>`
        : `<button type="button" class="aw-btn primary" data-action="result">Se resultatet ${ICON.arrow}</button>`}
    </div>
  </div>`
}

// ── Resultat ────────────────────────────────────────────────
function notice(n, facts) {
  return `<div class="aw-notice ${n.level}">
    <div class="aw-notice-icon">${n.level === 'info' ? ICON.info : ICON.warn}</div>
    <div>
      <h4>${esc(fill(n.title, facts))}</h4>
      <p>${rich(n.text, facts)}</p>
      ${n.more || n.sources?.length ? `<details class="aw-more"><summary>Les mer om hvorfor</summary>${n.more ? `<p>${rich(n.more, facts)}</p>` : ''}${sourceLinks(n.sources)}</details>` : ''}
    </div>
  </div>`
}

function waterfall(r) {
  return `<div class="aw-flow">${estateRows(r.skifte).map(x => `<div class="aw-flow-row ${x.kind || ''}"><span>${esc(x.label)}</span><strong>${kr(Math.abs(x.amount))}</strong></div>`).join('')}</div>`
}

function heirCards(people, E, facts, opts = {}) {
  const max = Math.max(...people.map(p => p.amount), 1)
  return `<div class="aw-heirs">${people.map(p => `
    <div class="aw-heir ${p.isPartner ? 'partner' : ''} ${p.isTestament ? 'testament' : ''}">
      <div class="aw-heir-top">
        <div><div class="aw-heir-name">${esc(p.label)}</div><div class="aw-heir-rel">${esc(p.relation)}${p.side ? ' · ' + esc(p.side) : ''}${p.common === 'no' ? ' · særkullsbarn' : ''}${p.fromFirst ? ' · inkl. ' + kr(p.fromFirst) + ' etter førstavdøde' : ''}${p.advance ? ' · forskudd ' + kr(p.advance) + ' trukket fra' : ''}</div></div>
        <div class="aw-heir-amount">${kr(p.amount)}<small>${E > 0 ? pct(p.amount / E) + ' av arven' : ''}</small></div>
      </div>
      <div class="aw-heir-bar"><span style="width:${Math.max(2, (p.amount / max) * 100)}%"></span></div>
      ${opts.note?.(p) || ''}
    </div>`).join('')}</div>`
}

function renderSkifte(r, facts) {
  const s = r.skifte
  const e = s.estate
  return `
  <div class="aw-block">
    <h3>Slik fordeles boet hvis dere skifter nå</h3>
    ${s.E <= 0
      ? `<p class="aw-lead">Etter at gjelden${e.funeral ? ' og begravelsen' : ''} er betalt, er det ingenting igjen å arve.</p>`
      : `<p class="aw-lead">${rich(r.howMuch, facts)}</p>`}
    ${waterfall(r)}
    ${s.E > 0 && s.people.length ? heirCards(s.people, s.fullE, facts) : ''}
    ${s.toCharity > 0 ? `<div class="aw-flow"><div class="aw-flow-row total"><span>Til frivillig arbeid for barn og unge</span><strong>${kr(s.toCharity)}</strong></div></div>` : ''}
    ${e.kind === 'married' && s.people.some(p => p.isPartner) ? `<p class="aw-hint">I tillegg beholder gjenlevende sin egen halvdel av felles formue (${kr(e.half)})${e.survivorSep ? ` og sitt særeie (${kr(e.survivorSep)})` : ''}. Det er ikke arv. Til sammen sitter gjenlevende igjen med <strong>${kr(e.half + e.survivorSep + s.partner.amount)}</strong>.</p>` : ''}
    ${r.skifteNotices.map(n => notice(n, facts)).join('')}
  </div>`
}

function renderUskifte(r, facts) {
  const u = r.uskifte
  if (!u) return ''
  return `
  <div class="aw-block">
    <h3>${esc(u.headline)}</h3>
    <p class="aw-lead">${rich(u.lead, facts)}</p>
    <div class="aw-flow">${u.rows.map(row => `<div class="aw-flow-row ${row.kind || ''}"><span>${esc(row.label)}</span><strong>${kr(row.amount)}</strong></div>`).join('')}</div>
    <div class="aw-cols">
      <div><h4>Hva skjer nå</h4><ul class="aw-list">${u.now.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul></div>
      <div><h4>Hva skjer senere</h4><ul class="aw-list">${u.later.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul></div>
    </div>
    <h4>Dette bør du vite før du velger uskifte</h4>
    <ul class="aw-list">${u.consequences.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul>
    ${r.uskifteNotices.map(n => notice(n, facts)).join('')}
    ${sourceLine(u.sources)}
  </div>`
}

function renderCompare(r, facts) {
  const s = r.skifte
  const u = r.uskifte
  return `
  <div class="aw-block">
    <h3>Skifte nå eller uskifte – forskjellen kort fortalt</h3>
    <div class="aw-compare">
      <div class="aw-compare-col">
        <h4>Skifte nå</h4>
        <ul class="aw-list">
          ${s.people.map(p => `<li><strong>${esc(p.label)}</strong> får ${kr(p.amount)} nå.</li>`).join('')}
          <li>Boet gjøres opp, og hver arving disponerer sin egen arv.</li>
          <li>Arvingene som overtar boet, tar ansvar for avdødes gjeld.</li>
        </ul>
      </div>
      <div class="aw-compare-col">
        <h4>Uskifte</h4>
        <ul class="aw-list">${u.compare.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul>
      </div>
    </div>
    <p class="aw-hint">Velg «Skifte nå» eller «Uskifte» over for å se detaljene.</p>
  </div>`
}

function isDirty() {
  return Boolean(host.saved) && JSON.stringify(host.saved.answers) !== JSON.stringify(state.answers)
}
function renderSaveCard(r) {
  const date = d => new Date(d).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const what = r.skifte
    ? 'arvingene med beregnet fordeling, boets verdi og stegene dere bør gjøre'
    : 'stegene dere bør gjøre'
  let body
  if (!embedded) {
    body = `<p>Opprett en gratis bruker i Arvklart, så tar vi vare på svarene og legger ${what} inn i et eget bo. Du kan når som helst komme tilbake og endre svarene.</p>
      <a class="aw-btn primary" href="/veiviser" target="_top">${ICON.save} Opprett bruker og lagre</a>`
  } else if (!host.loggedIn) {
    body = `<p>Opprett en gratis bruker, så legger vi ${what} inn i et eget bo i Arvklart. Svarene tas vare på, og du kan når som helst gå tilbake og endre dem.</p>
      <div class="aw-actions">
        <button type="button" class="aw-btn primary" data-action="saveToEstate">${ICON.save} Opprett bruker og lagre</button>
        <button type="button" class="aw-link" data-action="saveToEstate" data-login="1">Har du allerede bruker? Logg inn</button>
      </div>`
  } else if (host.estate && host.estate.role !== 'admin') {
    body = `<p>Bare administratorer av boet <strong>${esc(host.estate.name)}</strong> kan lagre resultatet der. Du kan likevel laste ned PDF-en og dele den.</p>`
  } else if (host.estate) {
    const status = host.saving ? 'Lagrer …'
      : isDirty() ? 'Du har endret svarene etter at de sist ble lagret i boet.'
        : host.saved ? `Sist lagret ${date(host.saved.savedAt)}.` : ''
    body = `<p>Lagre resultatet i boet <strong>${esc(host.estate.name)}</strong>. Vi legger inn ${what}. Lagrer du på nytt etter å ha endret svarene, blir det som kom fra veiviseren oppdatert.</p>
      ${status ? `<p class="aw-save-status ${isDirty() ? 'dirty' : ''}">${esc(status)}</p>` : ''}
      <div class="aw-actions">
        <button type="button" class="aw-btn primary" data-action="saveToEstate" ${host.saving ? 'disabled' : ''}>${ICON.save} ${host.saved ? 'Oppdater boet' : 'Lagre i boet'}</button>
        ${host.saved ? `<button type="button" class="aw-link" data-action="open" data-path="/estate/${esc(host.estate.id)}/heirs">Se arvinger</button>
        <button type="button" class="aw-link" data-action="open" data-path="/estate/${esc(host.estate.id)}/tasks">Se oppgaver</button>` : ''}
      </div>`
  } else {
    body = `<p>Lagre resultatet i et av boene dine, eller opprett et nytt. Vi legger inn ${what}.</p>
      <button type="button" class="aw-btn primary" data-action="saveToEstate" ${host.saving ? 'disabled' : ''}>${ICON.save} ${host.saving ? 'Lagrer …' : 'Lagre i et bo'}</button>`
  }
  return `<div class="aw-block aw-save" id="awSave">
    <h3>Ta vare på resultatet</h3>
    ${host.message ? `<p class="aw-save-msg ${host.message.type}" role="status">${esc(host.message.text)}</p>` : ''}
    ${body}
  </div>`
}

function renderResult() {
  const r = analyze(state.answers)
  const facts = r.facts
  const blocked = r.blockers.length > 0

  const head = `
    <span class="eyebrow">Resultat</span>
    <h3 class="aw-title" tabindex="-1" data-autofocus>${blocked ? 'Vi trenger litt mer informasjon' : 'Slik blir arveoppgjøret – basert på svarene dine'}</h3>
    <p class="aw-disclaimer">Dette er en veiledende beregning etter gjeldende regler, basert på opplysningene du har gitt. Det kan finnes forhold vi ikke har tatt hensyn til.</p>
    <div class="aw-toolbar">
      <button type="button" class="aw-btn ghost small-ghost" data-action="review">${ICON.edit} Endre svar</button>
      <button type="button" class="aw-btn ghost small-ghost" data-action="pdf" ${pdfBusy ? 'disabled' : ''}>${ICON.download} ${pdfBusy ? 'Lager PDF …' : 'Last ned PDF'}</button>
      <button type="button" class="aw-btn ghost small-ghost" data-action="gotoSave">${ICON.save} ${host.estate ? 'Lagre i boet' : 'Lagre i Arvklart'}</button>
    </div>
    ${pdfError ? `<p class="aw-error" role="alert">${esc(pdfError)}</p>` : ''}`

  const blockers = blocked ? `
    <div class="aw-block">
      ${r.blockers.map(b => `<div class="aw-notice critical"><div class="aw-notice-icon">${ICON.warn}</div><div>
        <h4>${esc(b.title)}</h4><p>${rich(b.text, facts)}</p>
        ${b.questionId ? `<button type="button" class="aw-btn small" data-action="edit" data-q="${b.questionId}">Gå til spørsmålet</button>` : ''}
        ${sourceLinks(b.sources)}
      </div></div>`).join('')}
    </div>` : ''

  const summary = `
    <div class="aw-summary">
      <div class="aw-summary-item"><span class="aw-num">1</span><div><h4>Hvem arver?</h4><p>${rich(r.who, facts)}</p></div></div>
      ${blocked ? '' : `<div class="aw-summary-item"><span class="aw-num">2</span><div><h4>Hvor mye?</h4><p>${rich(r.howMuchShort, facts)}</p></div></div>`}
      <div class="aw-summary-item"><span class="aw-num">${blocked ? 2 : 3}</span><div><h4>Hva gjør jeg nå?</h4><p>${rich(r.firstStep, facts)}</p></div></div>
    </div>`

  const situation = `
    <div class="aw-block">
      <h3>Din situasjon</h3>
      ${r.situation.map(t => `<p>${rich(t, facts)}</p>`).join('')}
      ${r.assumptions.length ? `<div class="aw-assumptions"><h4>Dette har vi lagt til grunn</h4><ul>${r.assumptions.map(a => `<li>${rich(a.text, facts)}${a.questionId ? ` <button type="button" class="aw-link inline" data-action="edit" data-q="${a.questionId}">Endre svar</button>` : ''}</li>`).join('')}</ul></div>` : ''}
    </div>`

  let distribution = ''
  if (!blocked) {
    if (r.uskifte) {
      const view = state.resultView || 'choose'
      distribution = `
      <div class="aw-block">
        <h3>Hva ønsker du å se nærmere på?</h3>
        <p>${rich(r.uskifte.choiceIntro, facts)}</p>
        <div class="aw-choice">
          <button type="button" class="${view === 'skifte' ? 'on' : ''}" data-action="resultView" data-value="skifte"><strong>Skifte nå</strong><span>Se hvordan arven fordeles hvis dere gjør opp nå</span></button>
          <button type="button" class="${view === 'uskifte' ? 'on' : ''}" data-action="resultView" data-value="uskifte"><strong>Uskifte</strong><span>Se hvordan uskifte fungerer for dere</span></button>
          <button type="button" class="${view === 'compare' ? 'on' : ''}" data-action="resultView" data-value="compare"><strong>Jeg er usikker</strong><span>Se forskjellen side om side</span></button>
        </div>
      </div>
      ${view === 'skifte' ? renderSkifte(r, facts) : view === 'uskifte' ? renderUskifte(r, facts) : view === 'compare' ? renderCompare(r, facts) : ''}`
    } else {
      distribution = renderSkifte(r, facts)
    }
  }

  const meaning = r.notices.length ? `
    <div class="aw-block">
      <h3>Hva betyr dette for dere?</h3>
      ${r.notices.map(n => notice(n, facts)).join('')}
    </div>` : ''

  const steps = `
    <div class="aw-block">
      <h3>Dette bør dere gjøre nå</h3>
      <ol class="aw-timeline">${r.nextSteps.map(s => `<li><div><h4>${esc(fill(s.title, facts))}</h4><p>${rich(s.text, facts)}</p>${sourceLine(s.sources)}</div></li>`).join('')}</ol>
    </div>`

  const method = `
    <details class="aw-block aw-method">
      <summary><h3>Slik har vi kommet frem til dette</h3></summary>
      <ol class="aw-method-list">${r.method.map(m => `<li>${rich(m.text, facts)}${sourceLinks(m.sources)}</li>`).join('')}</ol>
      <h4>Kilder</h4>
      <ul class="aw-source-list">${r.sourcesUsed.map(id => SOURCES[id]).filter(Boolean).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>${s.note ? ` <small>${esc(s.note)}</small>` : ''}</li>`).join('')}</ul>
      <p class="aw-hint">Grunnbeløpet (G) som er brukt: ${kr(r.G.value)} (gjelder fra ${new Date(r.G.from).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}).</p>
    </details>`

  return `
  <div class="aw-card aw-result">
    ${head}
    ${summary}
    ${blockers}
    ${situation}
    ${distribution}
    ${meaning}
    ${steps}
    ${method}
    ${r.complex ? `<div class="aw-notice warning"><div class="aw-notice-icon">${ICON.warn}</div><div><h4>Situasjonen deres kan være mer sammensatt enn veiviseren kan beregne</h4><p>${rich('Vurder å kontakte [[tingretten]] (gratis veiledning) eller en advokat før dere bestemmer dere.', facts)}</p>${sourceLinks(['domstol_kontakt'])}</div></div>` : ''}
    ${renderSaveCard(r)}
    <div class="aw-nav aw-result-nav">
      <button type="button" class="aw-btn ghost" data-action="review">${ICON.edit} Endre svar</button>
      <button type="button" class="aw-btn ghost" data-action="pdf" ${pdfBusy ? 'disabled' : ''}>${ICON.download} Last ned PDF</button>
      <button type="button" class="aw-btn ghost" data-action="restart">Start på nytt</button>
    </div>
  </div>`
}

// ── Hendelser ────────────────────────────────────────────────
function getPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), state.answers)
}
function setPath(path, value) {
  const parts = path.split('.')
  const top = parts[0]
  if (parts.length === 1) return setAnswer(top, value)
  const base = Array.isArray(state.answers[top]) ? [...state.answers[top]] : { ...(state.answers[top] || {}) }
  let obj = base
  for (let i = 1; i < parts.length - 1; i++) {
    const k = parts[i]
    obj[k] = Array.isArray(obj[k]) ? [...obj[k]] : { ...(obj[k] || {}) }
    obj = obj[k]
  }
  obj[parts[parts.length - 1]] = value
  setAnswer(top, base)
}

root.addEventListener('click', e => {
  const term = e.target.closest('.aw-term')
  if (term) {
    const open = term.getAttribute('aria-expanded') === 'true'
    root.querySelectorAll('.aw-term-pop').forEach(p => p.remove())
    root.querySelectorAll('.aw-term').forEach(t => t.setAttribute('aria-expanded', 'false'))
    if (!open) {
      term.setAttribute('aria-expanded', 'true')
      term.insertAdjacentHTML('afterend', `<span class="aw-term-pop" role="note">${esc(term.dataset.def)}</span>`)
    }
    return
  }
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const { action, value, path } = btn.dataset
  const q = QUESTION_BY_ID[state.current]
  switch (action) {
    case 'start': state.answers = {}; go('question', visibleQuestions({})[0].id); break
    case 'resume': {
      const qs = visibleQuestions(state.answers)
      const firstOpen = qs.find(x => validationError(x, state.answers))
      if (firstOpen) go('question', firstOpen.id)
      else go('result')
      break
    }
    case 'restart':
      if (!Object.keys(state.answers).length || confirm('Vil du slette svarene dine og starte på nytt?')) { state = fresh(); save(); go('intro') }
      break
    case 'next': nextQuestion(); break
    case 'prev': prevQuestion(); break
    case 'review': go('review'); break
    case 'result': state.resultView = null; go('result'); break
    case 'edit': if (btn.dataset.keep) go('question', btn.dataset.q); else editQuestion(btn.dataset.q); break
    case 'pdf': {
      pdfBusy = true; pdfError = null; render()
      import('./pdf.js')
        .then(m => m.downloadPdf(state.answers))
        .catch(() => { pdfError = 'Vi klarte ikke å lage PDF-en. Sjekk nettforbindelsen og prøv igjen.' })
        .finally(() => { pdfBusy = false; render() })
      break
    }
    case 'gotoSave': document.getElementById('awSave')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break
    case 'saveToEstate':
      host.saving = true; host.message = null; render()
      toHost({ type: 'veiviser-save', login: Boolean(btn.dataset.login), answers: state.answers, payload: toEstatePayload(state.answers) })
      break
    case 'open': toHost({ type: 'veiviser-navigate', path }); break
    case 'resultView': state.resultView = value; save(); render(); break
    case 'choose':
      setAnswer(q.id, value)
      render()
      // Ett klikk holder: gå videre automatisk etter et kort øyeblikk
      setTimeout(() => { if (state.view === 'question' && state.current === q.id) nextQuestion() }, 220)
      break
    case 'toggle': {
      let arr = Array.isArray(state.answers[q.id]) ? [...state.answers[q.id]] : []
      if (arr.includes(value)) arr = arr.filter(x => x !== value)
      else if (q.exclusive && value === q.exclusive) arr = [value]
      else arr = [...arr.filter(x => x !== q.exclusive), value]
      setAnswer(q.id, arr)
      render()
      break
    }
    case 'set': setPath(path, value); render(); break
    case 'add': setAnswer(path, [...(state.answers[path] || []), { id: uid() }]); render(); break
    case 'remove': setAnswer(path, (state.answers[path] || []).filter((_, i) => i !== Number(btn.dataset.index))); render(); break
    case 'addNested': setPath(path, [...(getPath(path) || []), { id: uid() }]); render(); break
    case 'removeNested': setPath(path, (getPath(path) || []).filter((_, i) => i !== Number(btn.dataset.index))); render(); break
  }
})

root.addEventListener('input', e => {
  const el = e.target.closest('[data-path]')
  if (!el || el.type === 'checkbox') return
  setPath(el.dataset.path, el.value)
  if (el.dataset.path.startsWith('assets.')) {
    const live = root.querySelector('.aw-live')
    if (live) live.innerHTML = liveTotal(state.answers.assets || {}, deriveFacts(state.answers))
  }
})
root.addEventListener('change', e => {
  const el = e.target.closest('[data-path]')
  if (!el) return
  if (el.type === 'checkbox') { setPath(el.dataset.path, el.checked); render() }
  // Antall barnebarn o.l. kan endre hvilke felt som vises
  else if (el.classList.contains('aw-count')) render()
})
root.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input[type="text"], input[type="number"], input[type="date"]')) { e.preventDefault(); nextQuestion() }
})
document.addEventListener('click', e => {
  if (!e.target.closest('.aw-term')) {
    root.querySelectorAll('.aw-term-pop').forEach(p => p.remove())
    root.querySelectorAll('.aw-term').forEach(t => t.setAttribute('aria-expanded', 'false'))
  }
})

// Meldinger fra Arvklart-appen
window.addEventListener('message', e => {
  if (e.origin !== window.location.origin || e.source !== window.parent) return
  const m = e.data || {}
  if (m.type === 'veiviser-context') {
    Object.assign(host, { ready: true, loggedIn: Boolean(m.loggedIn), estate: m.estate || null, saved: m.saved || null })
    // Åpnet fra et bo med lagrede svar: bruk dem, med mindre vi allerede jobber med svarene til dette boet.
    if (m.saved?.answers && state.estateId !== m.estate?.id) {
      state = { ...fresh(), answers: m.saved.answers, view: 'result', estateId: m.estate.id }
      save()
    }
    render()
  }
  if (m.type === 'veiviser-saved') {
    host.saving = false
    if (m.ok) {
      host.estate = m.estate
      host.saved = { answers: JSON.parse(JSON.stringify(state.answers)), savedAt: m.savedAt || new Date().toISOString() }
      host.loggedIn = true
      state.estateId = m.estate.id
      save()
      host.message = { type: 'ok', text: m.text || 'Lagret! Arvingene og stegene er lagt inn i boet.' }
    } else if (m.cancelled) {
      host.message = null
    } else {
      host.message = { type: 'error', text: m.error || 'Noe gikk galt under lagringen. Prøv igjen.' }
    }
    render()
  }
})
toHost({ type: 'veiviser-ready' })

render()
