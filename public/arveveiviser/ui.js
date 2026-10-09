// Brukergrensesnittet for arveveiviseren. Her ligger ingen juridiske regler –
// alt slikt hentes fra questions.js, flow.js og engine.js.

import { QUESTION_BY_ID, SECTIONS, ASSET_FIELDS, DEBT_FIELDS } from './questions.js'
import { visibleQuestions, validationError, pruneAnswers, firstUnanswered, localToday, sameAnswers } from './flow.js'
import { deriveFacts } from './facts.js'
import { evaluate } from './conditions.js'
import { analyze, answerFlags, flagsForQuestion } from './engine.js'
import { SOURCES } from './sources.js'
import { TERMS, linkTerms } from './glossary.js'
import { GRANDPARENT_SIDES, childLines } from './heirs.js'
import { fill, kr as krPlain, pct } from './text.js'
import { estateRows, answerSummary, toEstatePayload } from './report.js'
import { tr, field, isEn, dateLocale } from './i18n.js'

const root = document.getElementById('arvWizard')
document.documentElement.lang = isEn() ? 'en' : 'no'

// ── Tilstand og lagring ──────────────────────────────────────
// Svarene lagres i nettleseren per bruker og per bo. Da får et bo aldri svarene til et annet bo,
// og svarene i et bo overskriver ikke det brukeren holder på med i veiviseren utenfor boet.
// I Arvklart-appen (iframe i GuidePage) venter vi med å laste svarene til appen har fortalt
// hvem som er logget inn og hvilket bo veiviseren er åpnet fra (se veiviser-context).
const STORAGE_PREFIX = 'arvklart-arveveiviser-v2'
const LEGACY_KEY = 'arvklart-arveveiviser-v1' // felles for alle bo og brukere før
const store = {
  get: key => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null } },
  set: (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* privat modus o.l. */ } },
  remove: key => { try { localStorage.removeItem(key) } catch { /* ignorer */ } },
}
const scopeKey = (userId, estateId) => `${STORAGE_PREFIX}:${userId || 'anonym'}:${estateId ? 'bo-' + estateId : 'veiviser'}`
let storageKey = null

function save() {
  if (storageKey) store.set(storageKey, state)
}
// `acks`: varsler brukeren har bekreftet med «OK», per spørsmål (se renderFlags).
// `synced`: svarene er uendret siden de sist ble hentet fra eller lagret i boet.
const fresh = () => ({ answers: {}, current: null, view: 'intro', resultView: null, returnTo: null, acks: {} })
let state = fresh()
let error = null
const hasAnswers = () => Object.keys(state.answers || {}).length > 0

// Bytter til svarene for en bruker og et bo. Returnerer true hvis det ble byttet.
function switchScope(userId, estateId) {
  const key = scopeKey(userId, estateId)
  if (key === storageKey) return false
  storageKey = key
  let stored = store.get(key)
  if (!stored) {
    // Svar lagret før lagringen ble delt opp: flyttes bare til samme bo (eller veiviseren utenfor bo)
    const legacy = store.get(LEGACY_KEY)
    if (legacy && (legacy.estateId || null) === estateId) {
      stored = legacy
      store.remove(LEGACY_KEY)
      store.set(key, stored)
    }
  }
  state = { ...fresh(), ...(stored || {}) }
  delete state.estateId
  error = null
  needsAck = false
  return true
}

// Brukeren har nettopp logget inn for å lagre svar hen fylte ut uten å være innlogget (appen har
// sjekket e-posten). Svarene flyttes over til brukeren, så de ikke blir liggende synlige for andre
// som bruker nettleseren uten å logge inn. Har brukeren egne svar her fra før, beholdes de.
function adoptAnonymous() {
  const anonKey = scopeKey(null, null)
  const anon = store.get(anonKey)
  if (!anon?.answers || !Object.keys(anon.answers).length || hasAnswers()) return
  state = { ...fresh(), ...anon }
  delete state.estateId
  store.remove(anonKey)
  save()
}

// Kontakt med Arvklart-appen rundt veiviseren (iframe i GuidePage). Appen tar seg av
// innlogging og lagring i boet; veiviseren sender bare svarene og ferdig beregnede data.
const embedded = window.parent !== window
const host = { ready: false, loggedIn: false, estate: null, saved: null, saving: false, message: null }
let pdfBusy = false
// Gir et svar et varsel, må brukeren trykke «OK» på det før veiviseren går videre.
// Bekreftelsen gjelder akkurat de varslene som ble vist; kommer det et nytt, må det bekreftes på nytt.
let needsAck = false
const flagKey = flags => flags.map(f => f.id).join(',')
const unacked = q => {
  const key = flagKey(flagsForQuestion(state.answers, q.id))
  return key && state.acks?.[q.id] !== key ? key : ''
}
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

// Erstatter plassholdere og gjør fagord om til klikkbare forklaringer – både ord som er
// markert med [[fagord]], og kjente fagord som står i teksten (se linkTerms i glossary.js).
function rich(text, facts) {
  return esc(linkTerms(fill(text, facts)))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, key, label) => {
      const t = TERMS[key]
      if (!t) return label || key
      return `<button type="button" class="aw-term" data-def="${esc(field(t, 'def'))}" aria-expanded="false">${label || field(t, 'term')}</button>`
    })
}
function titleFor(q, facts) {
  if (facts.survivor && q.titleSurvivor) return field(q, 'titleSurvivor')
  if (facts.married && q.titleMarried) return field(q, 'titleMarried')
  return field(q, 'title')
}
// Kompakt kildelinje, brukt der mange kilder ellers ville gjort teksten tung å lese.
function sourceLine(ids = []) {
  const list = ids.map(id => SOURCES[id]).filter(Boolean)
  if (!list.length) return ''
  return `<p class="aw-src-line">${tr('Kilde', 'Source')}: ${list.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(field(s, 'short') || field(s, 'title'))}</a>`).join(' · ')}</p>`
}
function sourceLinks(ids = []) {
  const list = ids.map(id => SOURCES[id]).filter(Boolean)
  if (!list.length) return ''
  return `<div class="aw-sources">${list.map(s => `<a class="item-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(field(s, 'short') || field(s, 'title'))}${ICON.ext}</a>`).join('')}</div>`
}

function setAnswer(id, value) {
  state.answers = { ...state.answers, [id]: value }
  state.synced = false
  error = null
  needsAck = false
  save()
}

// ── Navigasjon ───────────────────────────────────────────────
function go(view, current) {
  state.view = view
  if (current !== undefined) state.current = current
  error = null
  needsAck = false
  save()
  render()
  root.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
// Navigasjon, validering og fremdrift bruker svarene slik motoren ser dem (pruneAnswers):
// svar på spørsmål som er skjult nå, skal ikke styre hvilke spørsmål som vises.
function nextQuestion() {
  const a = pruneAnswers(state.answers)
  const qs = visibleQuestions(a)
  const q = QUESTION_BY_ID[state.current]
  if (q) {
    const err = validationError(q, a)
    if (err) { error = err; render(); return }
    if (unacked(q)) {
      needsAck = true
      render()
      root.querySelector('[data-action="ack"]')?.focus()
      return
    }
  }
  // Ved endring fra oversikten eller resultatet: gå tilbake dit – men først til spørsmål
  // som endringen har gjort relevante og som ikke er besvart ennå.
  if (state.returnTo) {
    const open = qs.find(x => validationError(x, a))
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
  const qs = visibleQuestions(pruneAnswers(state.answers))
  const idx = qs.findIndex(x => x.id === state.current)
  if (idx > 0) go('question', qs[idx - 1].id)
  else go('intro')
}

// ── Visninger ────────────────────────────────────────────────
function render() {
  if (!storageKey) {
    root.innerHTML = `<div class="aw-card"><p class="aw-why">${tr('Laster veiviseren …', 'Loading the guide …')}</p></div>`
    return
  }
  const a = pruneAnswers(state.answers)
  const facts = deriveFacts(a)
  let html = ''
  if (state.view === 'question' && QUESTION_BY_ID[state.current]) html = renderQuestion(QUESTION_BY_ID[state.current], facts, a)
  else if (state.view === 'review') html = renderReview(facts, a)
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
    <span class="eyebrow">${tr('Arveveiviser', 'Inheritance guide')}</span>
    <h2>${tr('Hvem arver – og hvor mye?', 'Who inherits – and how much?')}</h2>
    <p>${tr('Svar på noen enkle spørsmål om familien og økonomien. Du får en oversikt over hvem som arver, omtrent hvor mye hver får, og hva dere bør gjøre nå.', 'Answer a few simple questions about the family and finances. You get an overview of who inherits, roughly how much each person gets, and what you should do now.')}</p>
    ${isEn() ? '<p class="aw-hint aw-hint-box">This guide explains Norwegian inheritance law. It is a translation for guidance only; the Norwegian version is the authoritative one.</p>' : ''}
    <ul class="aw-intro-list">
      <li>${ICON.check}<span>${tr('Du trenger ikke kunne noe om arveregler – vi forklarer underveis.', 'You do not need to know anything about inheritance rules – we explain as we go.')}</span></li>
      <li>${ICON.check}<span>${tr('Det tar omtrent 5 minutter. Omtrentlige tall holder.', 'It takes about 5 minutes. Approximate figures are fine.')}</span></li>
      <li>${ICON.check}<span>${tr('Svarene lagres bare i din egen nettleser.', 'Your answers are only stored in your own browser.')}</span></li>
    </ul>
    <div class="aw-actions">
      ${hasProgress
        ? `<button type="button" class="aw-btn primary" data-action="resume">${tr('Fortsett der du slapp', 'Continue where you left off')} ${ICON.arrow}</button>
           <button type="button" class="aw-btn ghost" data-action="restart">${tr('Start på nytt', 'Start again')}</button>`
        : `<button type="button" class="aw-btn primary" data-action="start">${tr('Start', 'Start')} ${ICON.arrow}</button>`}
    </div>
  </div>`
}

function renderProgress(qs, idx, q, a) {
  const activeSections = SECTIONS.filter(s => qs.some(x => x.section === s.id))
  const pctDone = Math.round((idx / qs.length) * 100)
  const openIdx = qs.findIndex(x => validationError(x, a))
  const firstOpen = openIdx === -1 ? qs.length : openIdx
  return `
  <div class="aw-progress" aria-label="${tr('Fremdrift', 'Progress')}">
    <div class="aw-progress-top">
      <span>${tr(`Steg ${idx + 1} av ${qs.length}`, `Step ${idx + 1} of ${qs.length}`)}</span>
      <span class="aw-progress-section">${esc(field(SECTIONS.find(s => s.id === q.section), 'label') || '')}</span>
    </div>
    <div class="aw-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctDone}"><span style="width:${pctDone}%"></span></div>
    <ol class="aw-steps">${activeSections.map(s => {
      const sIdx = SECTIONS.findIndex(x => x.id === s.id)
      const curIdx = SECTIONS.findIndex(x => x.id === q.section)
      const first = qs.findIndex(x => x.section === s.id)
      // Brukeren kan hoppe til alle deler som er nådd – også fremover når alt før er besvart.
      const reachable = first <= firstOpen && s.id !== q.section
      const cls = s.id === q.section ? 'current' : sIdx < curIdx ? 'done' : ''
      return `<li class="${cls}">${reachable ? `<button type="button" data-action="edit" data-q="${qs[first].id}" data-keep="1">${esc(field(s, 'label'))}</button>` : esc(field(s, 'label'))}</li>`
    }).join('')}</ol>
  </div>`
}

function renderLearnMore(q, facts, a) {
  const lm = q.learnMore
  if (!lm || (!lm.text && !lm.sources?.length)) return ''
  if (lm.showIf && !evaluate(lm.showIf, { answers: a, facts })) return ''
  return `
  <details class="aw-more">
    <summary>${esc(fill(field(lm, 'title') || tr('Les mer', 'Read more'), facts))}</summary>
    ${lm.text ? `<p>${rich(field(lm, 'text'), facts)}</p>` : ''}
    ${sourceLinks(lm.sources)}
  </details>`
}

function renderQuestion(q, facts, a) {
  const qs = visibleQuestions(a)
  let idx = qs.findIndex(x => x.id === q.id)
  if (idx === -1) { state.current = qs[0]?.id; return renderQuestion(qs[0], facts, a) }
  const isLast = idx === qs.length - 1
  const flags = flagsForQuestion(state.answers, q.id)
  const acked = !unacked(q)
  return `
  <div class="aw-card aw-question" data-q="${q.id}">
    ${renderProgress(qs, idx, q, a)}
    <h3 class="aw-title" tabindex="-1" data-autofocus>${rich(titleFor(q, facts), facts)}</h3>
    <p class="aw-why"><span>${tr('Hvorfor spør vi om dette?', 'Why do we ask this?')}</span> ${rich((w => typeof w === 'function' ? w(facts) : w)(field(q, 'why')), facts)}</p>
    <div class="aw-input">${renderInput(q, facts, a)}</div>
    ${error ? `<p class="aw-error" role="alert">${esc(error)}</p>` : ''}
    ${renderFlags(flags, facts, acked)}
    ${renderLearnMore(q, facts, a)}
    <div class="aw-nav">
      <button type="button" class="aw-btn ghost" data-action="prev">${ICON.back} ${tr('Tilbake', 'Back')}</button>
      <button type="button" class="aw-btn primary" data-action="next">${state.returnTo ? tr('Lagre endringen', 'Save the change') : isLast ? tr('Se resultatet', 'See the result') : tr('Neste', 'Next')} ${ICON.arrow}</button>
    </div>
    <div class="aw-quicklinks">
      ${idx > 0 ? `<button type="button" class="aw-link" data-action="review">${tr('Se over og endre alle svarene', 'Review and change all answers')}</button>` : ''}
      ${!state.returnTo && qs.every(x => !validationError(x, a)) ? `<button type="button" class="aw-link" data-action="result">${tr('Gå rett til resultatet', 'Go straight to the result')}</button>` : ''}
    </div>
  </div>`
}

// Varsel rett under svaret når valget gjør situasjonen for sammensatt til en sikker beregning.
// Brukeren skal bare gjøres oppmerksom på det: «OK» bekrefter og går videre.
function renderFlags(flags, facts, acked) {
  if (!flags.length) return ''
  const blocker = flags.some(f => f.kind === 'blocker')
  const title = blocker
    ? tr('Med dette svaret kan vi ikke beregne fordelingen', 'With this answer we cannot calculate the distribution')
    : tr('Dette svaret gjør situasjonen mer sammensatt enn veiviseren kan beregne', 'This answer makes the situation more complex than the guide can calculate')
  const after = blocker
    ? tr('Du kan gå videre, men resultatet viser ikke hvordan arven fordeles før dette er avklart.', 'You can continue, but the result will not show how the inheritance is distributed until this has been clarified.')
    : tr('Du kan gå videre, og vi viser fortsatt en beregning – men den kan bli feil for dere. I resultatet forklarer vi nøyaktig hvorfor.', 'You can continue, and we still show a calculation – but it may be wrong for you. In the result we explain exactly why.')
  return `<div class="aw-notice ${blocker ? 'critical' : 'warning'} aw-flag ${needsAck && !acked ? 'attention' : ''}" role="${acked ? 'note' : 'alertdialog'}" aria-label="${esc(title)}">
    <div class="aw-notice-icon">${ICON.warn}</div>
    <div>
      <h4>${title}</h4>
      ${flags.map(f => `<p><strong>${esc(fill(field(f, 'title'), facts))}.</strong> ${rich(field(f, 'text'), facts)}</p>`).join('')}
      <p class="aw-flag-after">${after}</p>
      ${acked
        ? `<p class="aw-flag-done">${ICON.check} ${tr('Du har lest dette', 'You have read this')}</p>`
        : `${needsAck ? `<p class="aw-flag-need" role="alert">${tr('Trykk «OK» for å gå videre.', 'Press «OK» to continue.')}</p>` : ''}<button type="button" class="aw-btn primary small" data-action="ack">OK ${ICON.arrow}</button>`}
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

function optionHint(o, facts) {
  const hint = facts.survivor && o.hintSurvivor ? field(o, 'hintSurvivor') : field(o, 'hint')
  return hint ? `<span class="aw-option-hint">${esc(fill(hint, facts))}</span>` : ''
}

function renderInput(q, facts, a) {
  const v = a[q.id]
  const ctx = { answers: a, facts }
  switch (q.type) {
    case 'single':
      return `<div class="aw-options">${q.options.filter(o => evaluate(o.showIf, ctx)).map(o => `
        <button type="button" class="aw-option ${v === o.value ? 'selected' : ''}" data-action="choose" data-value="${o.value}" aria-pressed="${v === o.value}">
          <span class="aw-radio"></span><span><span class="aw-option-label">${esc(fill(field(o, 'label'), facts))}</span>${optionHint(o, facts)}</span>
        </button>`).join('')}</div>`
    case 'multi': {
      const arr = Array.isArray(v) ? v : []
      return `<div class="aw-options">${q.options.filter(o => evaluate(o.showIf, ctx)).map(o => `
        <button type="button" class="aw-option multi ${arr.includes(o.value) ? 'selected' : ''}" data-action="toggle" data-value="${o.value}" aria-pressed="${arr.includes(o.value)}">
          <span class="aw-checkbox">${ICON.check}</span><span><span class="aw-option-label">${esc(fill(field(o, 'label'), facts))}</span>${optionHint(o, facts)}</span>
        </button>`).join('')}</div>`
    }
    case 'date':
      return `<input class="aw-date" type="date" data-path="${q.id}" value="${esc(v || '')}" max="${localToday()}" min="1900-01-01">`
    case 'number':
      return moneyInput(q.id, v, tr('Beløp', 'Amount'), q.optional ? tr('La stå tomt hvis du ikke vet', 'Leave empty if you do not know') : '')
    case 'percent':
      return `<label class="aw-money">
        <span class="aw-money-label">${tr('Andel', 'Share')}${q.optional ? `<small>${tr('La stå tomt hvis du ikke vet – da regner vi med 50 %', 'Leave empty if you do not know – we then assume 50 %')}</small>` : ''}</span>
        <span class="aw-money-field"><input type="text" inputmode="decimal" autocomplete="off" data-path="${q.id}" value="${esc(v ?? '')}" placeholder="50"><span>%</span></span>
      </label>`
    case 'amounts':
      return q.fields.map(f => moneyInput(`${q.id}.${f.key}`, v?.[f.key], field(f, 'label'))).join('')
    case 'children': return renderChildren(v, facts)
    case 'otherChildren': return renderOtherChildren(v)
    case 'siblings': return renderSiblings(v)
    case 'grandparents': return renderGrandparents(v)
    case 'assets': return renderAssets(v || {}, facts, a)
    case 'advancements': {
      const lines = childLines(a.children || [])
      return lines.map(l => moneyInput(`${q.id}.${l.id}`, v?.[l.id], l.label)).join('') +
        `<p class="aw-hint">${tr('La feltet stå tomt for barn som ikke fikk forskudd.', 'Leave the field empty for children who did not receive an advance.')}</p>`
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
  const commonQ = facts.survivor ? tr('Er dette også ditt barn?', 'Is this also your child?') : tr(`Er dette også barnet til ${fill('{partner}', facts)}?`, `Is this also the child of ${fill('{partner}', facts)}?`)
  return `<div class="aw-rows">${children.map((c, i) => `
    <div class="aw-row">
      <div class="aw-row-head">
        <input class="aw-name" type="text" maxlength="40" placeholder="${tr(`Barn ${i + 1} (navn er valgfritt)`, `Child ${i + 1} (name is optional)`)}" data-path="children.${i}.name" value="${esc(c.name || '')}">
        ${children.length > 1 ? `<button type="button" class="aw-remove" data-action="remove" data-path="children" data-index="${i}" aria-label="${tr(`Fjern barn ${i + 1}`, `Remove child ${i + 1}`)}">${tr('Fjern', 'Remove')}</button>` : ''}
      </div>
      ${facts.hasPartner ? `<div class="aw-field"><span>${esc(commonQ)}</span>${seg(`children.${i}.common`, c.common, [{ value: 'yes', label: tr('Ja, felles barn', 'Yes, a joint child') }, { value: 'no', label: tr('Nei, fra et annet forhold', 'No, from another relationship') }])}</div>` : ''}
      ${facts.previousUskifte ? `<div class="aw-field"><span>${esc(fill(tr('Er dette også barnet til {first}?', 'Is this also the child of {first}?'), facts))}</span>${seg(`children.${i}.firstCommon`, c.firstCommon, [{ value: 'yes', label: tr('Ja', 'Yes') }, { value: 'no', label: tr('Nei, fra et annet forhold', 'No, from another relationship') }])}</div>` : ''}
      <div class="aw-field"><span>${tr('Lever barnet?', 'Is the child alive?')}</span>${seg(`children.${i}.alive`, c.alive, [{ value: 'yes', label: tr('Ja', 'Yes') }, { value: 'no', label: tr('Nei, er død', 'No, has died') }])}</div>
      ${c.alive === 'no' ? `<div class="aw-field"><span>${tr('Hvor mange barn etterlot barnet seg?', 'How many children did the child leave?')} <small>${tr('Skriv 0 hvis ingen', 'Enter 0 if none')}</small></span>${countInput(`children.${i}.grandchildren`, c.grandchildren)}</div>` : ''}
      ${c.alive === 'yes' ? `<label class="aw-check"><input type="checkbox" data-path="children.${i}.minor" ${c.minor ? 'checked' : ''}> ${tr('Barnet er under 18 år', 'The child is under 18')}</label>` : ''}
    </div>`).join('')}
    <button type="button" class="aw-add" data-action="add" data-path="children">${ICON.plus} ${tr('Legg til barn', 'Add child')}</button>
    <p class="aw-hint">${tr('Var et barn unnfanget, men ikke født ennå? Legg det inn som et barn som lever.', 'Was a child conceived but not yet born? Add it as a living child.')}</p>
  </div>`
}

// Barn den som døde først hadde med andre enn avdøde (tidligere uskifte).
function renderOtherChildren(list) {
  const path = 'previousSpouseChildrenList'
  const children = Array.isArray(list) && list.length ? list : (state.answers[path] = [{ id: uid() }])
  return `<div class="aw-rows">${children.map((c, i) => `
    <div class="aw-row">
      <div class="aw-row-head">
        <input class="aw-name" type="text" maxlength="40" placeholder="${tr(`Barn ${i + 1} (navn er valgfritt)`, `Child ${i + 1} (name is optional)`)}" data-path="${path}.${i}.name" value="${esc(c.name || '')}">
        ${children.length > 1 ? `<button type="button" class="aw-remove" data-action="remove" data-path="${path}" data-index="${i}" aria-label="${tr(`Fjern barn ${i + 1}`, `Remove child ${i + 1}`)}">${tr('Fjern', 'Remove')}</button>` : ''}
      </div>
      <div class="aw-field"><span>${tr('Lever barnet?', 'Is the child alive?')}</span>${seg(`${path}.${i}.alive`, c.alive, [{ value: 'yes', label: tr('Ja', 'Yes') }, { value: 'no', label: tr('Nei, er død', 'No, has died') }])}</div>
      ${c.alive === 'no' ? `<div class="aw-field"><span>${tr('Hvor mange barn etterlot barnet seg?', 'How many children did the child leave?')} <small>${tr('Skriv 0 hvis ingen', 'Enter 0 if none')}</small></span>${countInput(`${path}.${i}.grandchildren`, c.grandchildren)}</div>` : ''}
    </div>`).join('')}
    <button type="button" class="aw-add" data-action="add" data-path="${path}">${ICON.plus} ${tr('Legg til barn', 'Add child')}</button>
  </div>`
}

function renderSiblings(list) {
  const siblings = Array.isArray(list) && list.length ? list : (state.answers.siblings = [{ id: uid() }])
  return `<div class="aw-rows">${siblings.map((s, i) => `
    <div class="aw-row">
      <div class="aw-row-head">
        <input class="aw-name" type="text" maxlength="40" placeholder="${tr(`Søsken ${i + 1} (navn er valgfritt)`, `Sibling ${i + 1} (name is optional)`)}" data-path="siblings.${i}.name" value="${esc(s.name || '')}">
        ${siblings.length > 1 ? `<button type="button" class="aw-remove" data-action="remove" data-path="siblings" data-index="${i}" aria-label="${tr(`Fjern søsken ${i + 1}`, `Remove sibling ${i + 1}`)}">${tr('Fjern', 'Remove')}</button>` : ''}
      </div>
      <div class="aw-field"><span>${tr('Hvilke foreldre hadde de felles?', 'Which parents did they share?')}</span>${seg(`siblings.${i}.type`, s.type, [{ value: 'full', label: tr('Samme mor og far', 'Same mother and father') }, { value: 'halfMother', label: tr('Bare samme mor', 'Same mother only') }, { value: 'halfFather', label: tr('Bare samme far', 'Same father only') }])}</div>
      <div class="aw-field"><span>${tr('Lever søskenet?', 'Is the sibling alive?')}</span>${seg(`siblings.${i}.alive`, s.alive, [{ value: 'yes', label: tr('Ja', 'Yes') }, { value: 'no', label: tr('Nei, er død', 'No, has died') }])}</div>
      ${s.alive === 'no' ? `<div class="aw-field"><span>${tr('Hvor mange barn har søskenet som lever?', 'How many living children does the sibling have?')} <small>${tr('Skriv 0 hvis ingen', 'Enter 0 if none')}</small></span>${countInput(`siblings.${i}.children`, s.children)}</div>` : ''}
    </div>`).join('')}
    <button type="button" class="aw-add" data-action="add" data-path="siblings">${ICON.plus} ${tr('Legg til søsken', 'Add sibling')}</button>
  </div>`
}

function renderGrandparents(v = {}) {
  return `<div class="aw-rows">${GRANDPARENT_SIDES.map(side => {
    const g = v[side.key] || {}
    const relatives = Array.isArray(g.relatives) ? g.relatives : []
    const someoneDead = g.gp1 === 'no' || g.gp2 === 'no'
    const base = `grandparents.${side.key}`
    const label = field(side, 'label'), gp1 = field(side, 'gp1').toLowerCase(), gp2 = field(side, 'gp2').toLowerCase()
    const yesNo = [{ value: 'yes', label: tr('Ja', 'Yes') }, { value: 'no', label: tr('Nei', 'No') }]
    return `<div class="aw-row">
      <div class="aw-row-title">${label}</div>
      <div class="aw-field"><span>${tr(`Lever ${gp1}?`, `Is the ${gp1} alive?`)}</span>${seg(`${base}.gp1`, g.gp1, yesNo)}</div>
      <div class="aw-field"><span>${tr(`Lever ${gp2}?`, `Is the ${gp2} alive?`)}</span>${seg(`${base}.gp2`, g.gp2, yesNo)}</div>
      ${someoneDead ? `<div class="aw-sub">
        <p class="aw-hint">${tr(
          `Tanter og onkler på ${label.toLowerCase()} – altså barna til ${gp1} og ${gp2}, bortsett fra avdødes ${side.key === 'father' ? 'far' : 'mor'}. La listen være tom hvis det ikke finnes noen.`,
          `Aunts and uncles on the ${label.toLowerCase()} – that is, the children of the ${gp1} and the ${gp2}, apart from the deceased's ${side.key === 'father' ? 'father' : 'mother'}. Leave the list empty if there are none.`)}</p>
        ${relatives.map((r, i) => `<div class="aw-subrow">
          <div class="aw-row-head"><input class="aw-name" type="text" maxlength="40" placeholder="${tr(`Tante/onkel ${i + 1}`, `Aunt/uncle ${i + 1}`)}" data-path="${base}.relatives.${i}.name" value="${esc(r.name || '')}">
          <button type="button" class="aw-remove" data-action="removeNested" data-path="${base}.relatives" data-index="${i}">${tr('Fjern', 'Remove')}</button></div>
          <div class="aw-field"><span>${tr('Hvem er foreldrene?', 'Who are the parents?')}</span>${seg(`${base}.relatives.${i}.type`, r.type, [{ value: 'full', label: tr(`Både ${gp1} og ${gp2}`, `Both the ${gp1} and the ${gp2}`) }, { value: 'half1', label: tr(`Bare ${gp1}`, `Only the ${gp1}`) }, { value: 'half2', label: tr(`Bare ${gp2}`, `Only the ${gp2}`) }])}</div>
          <div class="aw-field"><span>${tr('Lever hen?', 'Are they alive?')}</span>${seg(`${base}.relatives.${i}.alive`, r.alive, yesNo)}</div>
          ${r.alive === 'no' ? `<div class="aw-field"><span>${tr('Hvor mange barn (avdødes søskenbarn) lever?', 'How many of their children (cousins of the deceased) are alive?')}</span>${countInput(`${base}.relatives.${i}.children`, r.children)}</div>` : ''}
        </div>`).join('')}
        <button type="button" class="aw-add" data-action="addNested" data-path="${base}.relatives">${ICON.plus} ${tr('Legg til tante eller onkel', 'Add aunt or uncle')}</button>
      </div>` : ''}
    </div>`
  }).join('')}</div>`
}

function renderAssets(v, facts, a) {
  const married = facts.married
  const sep = facts.married && a.separateProperty === 'yes'
  const sepDeceased = sep && ['deceased', 'both'].includes(a.separatePropertyWho)
  const sepSurvivor = sep && ['survivor', 'both'].includes(a.separatePropertyWho)
  const couple = fill('{couple}', facts)
  const intro = married
    ? `<p class="aw-hint aw-hint-box">${tr(
      `Ta med alt <strong>${couple} eide til sammen</strong> – både det som sto på avdøde og på gjenlevende. Ektefellers felles formue deles først i to like deler. Bare avdødes halvdel er arv.${sep ? ' Det som etter ektepakten skal holdes utenfor, fører du opp nederst.' : ''}`,
      `Include everything <strong>${couple} owned together</strong> – both what was in the deceased's name and in the surviving spouse's name. Spouses' joint property is first split into two equal halves. Only the deceased's half is inheritance.${sep ? ' What the prenuptial agreement keeps separate is entered at the bottom.' : ''}`)}</p>`
    : facts.cohabitant
      ? `<p class="aw-hint aw-hint-box">${tr('Ta bare med det <strong>avdøde eide</strong>. Eide dere noe sammen, for eksempel boligen, fører du opp avdødes andel. Det samboeren eier selv, er ikke en del av arven.', 'Only include what <strong>the deceased owned</strong>. If you owned something together, for example the home, enter the deceased\'s share. What the cohabitant owns themselves is not part of the inheritance.')}</p>`
      : `<p class="aw-hint aw-hint-box">${tr('Ta med det avdøde eide og skyldte. Omtrentlige beløp holder.', 'Include what the deceased owned and owed. Approximate amounts are fine.')}</p>`
  const money = f => moneyInput(`assets.${f.key}`, v[f.key], field(f, 'label'), field(f, 'hint'))
  const notAlsoAbove = tr('Ikke ta det med i feltene over også', 'Do not also include it in the fields above')
  return `${intro}
  <fieldset class="aw-group"><legend>${married ? tr(`Det ${couple} eide`, `What ${couple} owned`) : tr('Det avdøde eide', 'What the deceased owned')}</legend>
    ${ASSET_FIELDS.map(money).join('')}
  </fieldset>
  <fieldset class="aw-group"><legend>${married ? tr(`Det ${couple} skyldte`, `What ${couple} owed`) : tr('Det avdøde skyldte', 'What the deceased owed')}</legend>
    ${DEBT_FIELDS.map(money).join('')}
  </fieldset>
  ${sepDeceased ? `<fieldset class="aw-group"><legend>${tr('Avdødes eiendeler som skal holdes utenfor (særeie)', 'The deceased\'s assets to be kept separate (separate property)')}</legend>
    ${moneyInput('assets.sepDeceasedAssets', v.sepDeceasedAssets, tr('Verdi', 'Value'), notAlsoAbove)}
    ${moneyInput('assets.sepDeceasedDebts', v.sepDeceasedDebts, tr('Gjeld knyttet til dette', 'Debt related to this'))}
  </fieldset>` : ''}
  ${sepSurvivor ? `<fieldset class="aw-group"><legend>${tr('Gjenlevendes eiendeler som skal holdes utenfor (særeie)', 'The surviving spouse\'s assets to be kept separate (separate property)')}</legend>
    ${moneyInput('assets.sepSurvivor', v.sepSurvivor, tr('Verdi etter gjeld', 'Value after debt'), notAlsoAbove)}
  </fieldset>` : ''}
  <fieldset class="aw-group"><legend>${tr('Utgifter etter dødsfallet', 'Expenses after the death')}</legend>
    ${moneyInput('assets.funeral', v.funeral, tr('Begravelse og gravstein', 'Funeral and headstone'), tr('Dekkes av boet før arven fordeles', 'Paid by the estate before the inheritance is distributed'))}
  </fieldset>
  <div class="aw-live" aria-live="polite">${liveTotal(v)}</div>`
}

function liveTotal(v) {
  const n = x => { const k = Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(k) && k > 0 ? k : 0 }
  const assets = ASSET_FIELDS.reduce((s, f) => s + n(v[f.key]), 0)
  const debts = DEBT_FIELDS.reduce((s, f) => s + n(v[f.key]), 0)
  return `<span>${tr('Eiendeler', 'Assets')} ${kr(assets)}</span><span>− ${tr('Gjeld', 'Debt')} ${kr(debts)}</span><strong>= ${kr(assets - debts)}</strong>`
}

// ── Oversikt over svar ──────────────────────────────────────
function renderReview(facts, a) {
  const rows = answerSummary(a, facts)
  const groups = []
  for (const r of rows) {
    if (!groups.length || groups[groups.length - 1].section !== r.section) groups.push({ section: r.section, rows: [] })
    groups[groups.length - 1].rows.push(r)
  }
  const missing = visibleQuestions(a).find(q => validationError(q, a))
  const flags = answerFlags(state.answers)
  const flagTag = id => {
    const own = flags.filter(f => f.questionId === id)
    if (!own.length) return ''
    const label = own.some(f => f.kind === 'blocker') ? tr('Hindrer beregningen', 'Prevents the calculation') : tr('Gjør fordelingen usikker', 'Makes the distribution uncertain')
    return `<span class="aw-flag-tag" title="${esc(own.map(f => field(f, 'title')).join(' · '))}">${ICON.warn}${label}</span>`
  }
  return `
  <div class="aw-card">
    <span class="eyebrow">${tr('Dine svar', 'Your answers')}</span>
    <h3 class="aw-title" tabindex="-1" data-autofocus>${tr('Se over og endre svarene dine', 'Review and change your answers')}</h3>
    <p class="aw-why">${tr('Trykk på «Endre» ved et svar for å rette det. Du kommer tilbake hit etterpå, og resultatet oppdateres automatisk.', 'Press «Change» next to an answer to correct it. You will come back here afterwards, and the result is updated automatically.')}</p>
    ${groups.map(g => `
      <h4 class="aw-review-section">${esc(g.section)}</h4>
      <dl class="aw-review">${g.rows.map(r => `
        <div><dt>${esc(r.question)}</dt><dd>${r.unanswered ? `<em>${esc(r.answer)}</em>` : esc(r.answer)}${flagTag(r.id)}</dd>
        <button type="button" class="aw-link" data-action="edit" data-q="${r.id}" aria-label="${tr('Endre', 'Change')}: ${esc(r.question)}">${ICON.edit} ${tr('Endre', 'Change')}</button></div>`).join('')}
      </dl>`).join('')}
    <div class="aw-nav">
      <button type="button" class="aw-btn ghost" data-action="restart">${tr('Start på nytt', 'Start again')}</button>
      ${missing
        ? `<button type="button" class="aw-btn primary" data-action="edit" data-q="${missing.id}">${tr('Svar på det som mangler', 'Answer what is missing')} ${ICON.arrow}</button>`
        : `<button type="button" class="aw-btn primary" data-action="result">${tr('Se resultatet', 'See the result')} ${ICON.arrow}</button>`}
    </div>
  </div>`
}

// ── Resultat ────────────────────────────────────────────────
function notice(n, facts) {
  return `<div class="aw-notice ${n.level}">
    <div class="aw-notice-icon">${n.level === 'info' ? ICON.info : ICON.warn}</div>
    <div>
      <h4>${esc(fill(field(n, 'title'), facts))}</h4>
      <p>${rich(field(n, 'text'), facts)}</p>
      ${n.more || n.sources?.length ? `<details class="aw-more"><summary>${tr('Les mer om hvorfor', 'Read more about why')}</summary>${n.more ? `<p>${rich(field(n, 'more'), facts)}</p>` : ''}${sourceLinks(n.sources)}</details>` : ''}
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
        <div><div class="aw-heir-name">${esc(p.label)}</div><div class="aw-heir-rel">${esc(p.relation)}${p.side ? ' · ' + esc(p.side) : ''}${p.common === 'no' ? ' · ' + tr('særkullsbarn', 'child from another relationship') : ''}${p.fromFirst ? ' · ' + tr(`inkl. ${kr(p.fromFirst)} etter den som døde først`, `incl. ${kr(p.fromFirst)} from the first to die`) : ''}${p.advance ? ' · ' + tr(`forskudd ${kr(p.advance)} trukket fra`, `advance of ${kr(p.advance)} deducted`) : ''}</div></div>
        <div class="aw-heir-amount">${kr(p.amount)}<small>${E > 0 ? pct(p.amount / E) + tr(' av arven', ' of the inheritance') : ''}</small></div>
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
    <h3>${tr('Slik fordeles boet hvis dere skifter nå', 'How the estate is divided if you settle it now')}</h3>
    ${s.fullE <= 0
      ? `<p class="aw-lead">${tr(`Etter at gjelden${e.funeral ? ' og begravelsen' : ''} er betalt, er det ingenting igjen å arve.`, `After the debts${e.funeral ? ' and the funeral' : ''} have been paid, there is nothing left to inherit.`)}</p>`
      : `<p class="aw-lead">${rich(r.howMuch, facts)}</p>`}
    ${waterfall(r)}
    ${s.fullE > 0 && s.people.length ? heirCards(s.people, s.fullE, facts) : ''}
    ${s.toCharity > 0 ? `<div class="aw-flow"><div class="aw-flow-row total"><span>${tr('Til frivillig arbeid for barn og unge', 'To voluntary work for children and young people')}</span><strong>${kr(s.toCharity)}</strong></div></div>` : ''}
    ${e.kind === 'married' && s.people.some(p => p.isPartner) ? `<p class="aw-hint">${tr(
      `I tillegg beholder gjenlevende sin egen halvdel av felles formue (${kr(e.half)})${e.survivorSep ? ` og sitt særeie (${kr(e.survivorSep)})` : ''}. Det er ikke arv. Til sammen sitter gjenlevende igjen med <strong>${kr(e.half + e.survivorSep + s.partner.amount)}</strong>.`,
      `In addition, the surviving spouse keeps their own half of the joint property (${kr(e.half)})${e.survivorSep ? ` and their separate property (${kr(e.survivorSep)})` : ''}. That is not inheritance. In total the surviving spouse is left with <strong>${kr(e.half + e.survivorSep + s.partner.amount)}</strong>.`)}</p>` : ''}
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
      <div><h4>${tr('Hva skjer nå', 'What happens now')}</h4><ul class="aw-list">${u.now.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul></div>
      <div><h4>${tr('Hva skjer senere', 'What happens later')}</h4><ul class="aw-list">${u.later.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul></div>
    </div>
    <h4>${esc(u.consequencesTitle)}</h4>
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
    <h3>${tr('Skifte nå eller uskifte – forskjellen kort fortalt', 'Settle now or undivided estate – the difference in short')}</h3>
    <div class="aw-compare">
      <div class="aw-compare-col">
        <h4>${tr('Skifte nå', 'Settle now')}</h4>
        <ul class="aw-list">
          ${s.people.map(p => `<li>${tr(`<strong>${esc(p.label)}</strong> får ${kr(p.amount)} nå.`, `<strong>${esc(p.label)}</strong> gets ${kr(p.amount)} now.`)}</li>`).join('')}
          <li>${tr('Boet gjøres opp, og hver arving disponerer sin egen arv.', 'The estate is settled, and each heir manages their own inheritance.')}</li>
          <li>${tr('Arvingene som overtar boet, tar ansvar for avdødes gjeld.', 'The heirs who take over the estate take responsibility for the deceased\'s debts.')}</li>
        </ul>
      </div>
      <div class="aw-compare-col">
        <h4>${tr('Uskifte', 'Undivided estate (uskifte)')}</h4>
        <ul class="aw-list">${u.compare.map(t => `<li>${rich(t, facts)}</li>`).join('')}</ul>
      </div>
    </div>
    <p class="aw-hint">${tr('Velg «Skifte nå» eller «Uskifte» over for å se detaljene.', 'Choose «Settle now» or «Undivided estate» above to see the details.')}</p>
  </div>`
}

function isDirty() {
  return Boolean(host.saved) && !sameAnswers(host.saved.answers, state.answers)
}
function renderSaveCard(r) {
  const date = d => new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const what = r.skifte
    ? tr('arvingene med beregnet fordeling, boets verdi og stegene dere bør gjøre', 'the heirs with the calculated distribution, the value of the estate and the steps you should take')
    : tr('stegene dere bør gjøre', 'the steps you should take')
  const saving = tr('Lagrer …', 'Saving …')
  let body
  if (!embedded) {
    body = `<p>${tr(`Opprett en gratis bruker i Arvklart, så tar vi vare på svarene og legger ${what} inn i et eget bo. Du kan når som helst komme tilbake og endre svarene.`, `Create a free account in Arvklart, and we will keep your answers and add ${what} to an estate of its own. You can come back and change the answers at any time.`)}</p>
      <a class="aw-btn primary" href="/veiviser" target="_top">${ICON.save} ${tr('Opprett bruker og lagre', 'Create account and save')}</a>`
  } else if (!host.loggedIn) {
    body = `<p>${tr(`Opprett en gratis bruker, så legger vi ${what} inn i et eget bo i Arvklart. Svarene tas vare på, og du kan når som helst gå tilbake og endre dem.`, `Create a free account, and we will add ${what} to an estate of its own in Arvklart. Your answers are kept, and you can go back and change them at any time.`)}</p>
      <div class="aw-actions">
        <button type="button" class="aw-btn primary" data-action="saveToEstate">${ICON.save} ${tr('Opprett bruker og lagre', 'Create account and save')}</button>
        <button type="button" class="aw-link" data-action="saveToEstate" data-login="1">${tr('Har du allerede bruker? Logg inn', 'Already have an account? Log in')}</button>
      </div>`
  } else if (host.estate && host.estate.role !== 'admin') {
    body = `<p>${tr(`Bare administratorer av boet <strong>${esc(host.estate.name)}</strong> kan lagre resultatet der. Du kan likevel laste ned PDF-en og dele den.`, `Only administrators of the estate <strong>${esc(host.estate.name)}</strong> can save the result there. You can still download the PDF and share it.`)}</p>`
  } else if (host.estate) {
    const status = host.saving ? saving
      : isDirty() ? tr('Du har endret svarene etter at de sist ble lagret i boet.', 'You have changed the answers since they were last saved to the estate.')
        : host.saved ? tr(`Sist lagret ${date(host.saved.savedAt)}.`, `Last saved ${date(host.saved.savedAt)}.`) : ''
    body = `<p>${tr(`Lagre resultatet i boet <strong>${esc(host.estate.name)}</strong>. Vi legger inn ${what}. Lagrer du på nytt etter å ha endret svarene, blir det som kom fra veiviseren oppdatert.`, `Save the result to the estate <strong>${esc(host.estate.name)}</strong>. We add ${what}. If you save again after changing the answers, what came from the guide is updated.`)}</p>
      ${status ? `<p class="aw-save-status ${isDirty() ? 'dirty' : ''}">${esc(status)}</p>` : ''}
      <div class="aw-actions">
        <button type="button" class="aw-btn primary" data-action="saveToEstate" ${host.saving ? 'disabled' : ''}>${ICON.save} ${host.saved ? tr('Oppdater boet', 'Update the estate') : tr('Lagre i boet', 'Save to the estate')}</button>
        ${host.saved ? `<button type="button" class="aw-link" data-action="open" data-path="/estate/${esc(host.estate.id)}/heirs">${tr('Se arvinger', 'See heirs')}</button>
        <button type="button" class="aw-link" data-action="open" data-path="/estate/${esc(host.estate.id)}/tasks">${tr('Se oppgaver', 'See tasks')}</button>` : ''}
      </div>`
  } else {
    body = `<p>${tr(`Lagre resultatet i et av boene dine, eller opprett et nytt. Vi legger inn ${what}.`, `Save the result to one of your estates, or create a new one. We add ${what}.`)}</p>
      <button type="button" class="aw-btn primary" data-action="saveToEstate" ${host.saving ? 'disabled' : ''}>${ICON.save} ${host.saving ? saving : tr('Lagre i et bo', 'Save to an estate')}</button>`
  }
  return `<div class="aw-block aw-save" id="awSave">
    <h3>${tr('Ta vare på resultatet', 'Keep the result')}</h3>
    ${host.message ? `<p class="aw-save-msg ${host.message.type}" role="status">${esc(host.message.text)}</p>` : ''}
    ${body}
  </div>`
}

function renderResult() {
  const r = analyze(state.answers)
  const facts = r.facts
  const blocked = r.blockers.length > 0

  const head = `
    <span class="eyebrow">${tr('Resultat', 'Result')}</span>
    <h3 class="aw-title" tabindex="-1" data-autofocus>${blocked ? tr('Vi trenger litt mer informasjon', 'We need a little more information') : tr('Slik blir arveoppgjøret – basert på svarene dine', 'Your inheritance settlement – based on your answers')}</h3>
    <p class="aw-disclaimer">${tr('Dette er en veiledende beregning etter gjeldende regler, basert på opplysningene du har gitt. Det kan finnes forhold vi ikke har tatt hensyn til.', 'This is an indicative calculation under the current Norwegian rules, based on the information you have given. There may be circumstances we have not taken into account.')}${isEn() ? ' The Norwegian version of this guide is the authoritative one.' : ''}</p>
    <div class="aw-toolbar">
      <button type="button" class="aw-btn ghost small-ghost" data-action="review">${ICON.edit} ${tr('Endre svar', 'Change answers')}</button>
      <button type="button" class="aw-btn ghost small-ghost" data-action="pdf" ${pdfBusy ? 'disabled' : ''}>${ICON.download} ${pdfBusy ? tr('Lager PDF …', 'Creating PDF …') : tr('Last ned PDF', 'Download PDF')}</button>
      <button type="button" class="aw-btn ghost small-ghost" data-action="gotoSave">${ICON.save} ${host.estate ? tr('Lagre i boet', 'Save to the estate') : tr('Lagre i Arvklart', 'Save in Arvklart')}</button>
    </div>
    ${pdfError ? `<p class="aw-error" role="alert">${esc(pdfError)}</p>` : ''}`

  const blockers = blocked ? `
    <div class="aw-block">
      ${r.blockers.map(b => `<div class="aw-notice critical"><div class="aw-notice-icon">${ICON.warn}</div><div>
        <h4>${esc(field(b, 'title'))}</h4><p>${rich(field(b, 'text'), facts)}</p>
        ${b.questionId ? `<button type="button" class="aw-btn small" data-action="edit" data-q="${b.questionId}">${tr('Gå til spørsmålet', 'Go to the question')}</button>` : ''}
        ${sourceLinks(b.sources)}
      </div></div>`).join('')}
    </div>` : ''

  // Hvorfor situasjonen er for sammensatt: ett punkt per svar, med lenke tilbake til spørsmålet.
  const complexity = r.complexReasons.length ? `
    <div class="aw-block">
      <div class="aw-notice warning aw-complex">
        <div class="aw-notice-icon">${ICON.warn}</div>
        <div>
          <h4>${tr('Situasjonen deres kan være mer sammensatt enn veiviseren kan beregne', 'Your situation may be more complex than the guide can calculate')}</h4>
          <p>${blocked
            ? tr('Når det som mangler er avklart, vil disse svarene i tillegg gjøre beregningen usikker:', 'Once what is missing has been clarified, these answers will also make the calculation uncertain:')
            : tr('Fordelingen vi viser, bygger på lovens hovedregler. Disse svarene gjør at den kan bli feil for dere:', 'The distribution we show is based on the main rules of the law. These answers mean it may be wrong for you:')}</p>
          <ol class="aw-reasons">${r.complexReasons.map(x => `<li>
            <strong>${esc(fill(field(x, 'title'), facts))}</strong>
            <p>${rich(field(x, 'text'), facts)}</p>
            <button type="button" class="aw-link inline" data-action="edit" data-q="${x.questionId}">${ICON.edit} ${tr('Se svaret ditt', 'See your answer')}</button>
          </li>`).join('')}</ol>
          <p>${rich(tr('Vurder å kontakte [[tingretten]] (gratis veiledning) eller en advokat før dere bestemmer dere.', 'Consider contacting the [[tingretten]] (free guidance) or a lawyer before you decide.'), facts)}</p>
          ${sourceLinks(['domstol_kontakt'])}
        </div>
      </div>
    </div>` : ''

  const summary = `
    <div class="aw-summary">
      <div class="aw-summary-item"><span class="aw-num">1</span><div><h4>${tr('Hvem arver?', 'Who inherits?')}</h4><p>${rich(r.who, facts)}</p></div></div>
      ${blocked ? '' : `<div class="aw-summary-item"><span class="aw-num">2</span><div><h4>${tr('Hvor mye?', 'How much?')}</h4><p>${rich(r.howMuchShort, facts)}</p></div></div>`}
      <div class="aw-summary-item"><span class="aw-num">${blocked ? 2 : 3}</span><div><h4>${tr('Hva gjør jeg nå?', 'What do I do now?')}</h4><p>${rich(r.firstStep, facts)}</p></div></div>
    </div>`

  const situation = `
    <div class="aw-block">
      <h3>${tr('Din situasjon', 'Your situation')}</h3>
      ${r.situation.map(t => `<p>${rich(t, facts)}</p>`).join('')}
      ${r.assumptions.length ? `<div class="aw-assumptions"><h4>${tr('Dette har vi lagt til grunn', 'What we have assumed')}</h4><ul>${r.assumptions.map(a => `<li>${rich(field(a, 'text'), facts)}${a.questionId ? ` <button type="button" class="aw-link inline" data-action="edit" data-q="${a.questionId}">${tr('Endre svar', 'Change answer')}</button>` : ''}</li>`).join('')}</ul></div>` : ''}
    </div>`

  let distribution = ''
  if (!blocked) {
    if (r.uskifte) {
      const view = state.resultView || 'choose'
      distribution = `
      <div class="aw-block">
        <h3>${tr('Hva ønsker du å se nærmere på?', 'What would you like to look at more closely?')}</h3>
        <p>${rich(r.uskifte.choiceIntro, facts)}</p>
        <div class="aw-choice">
          <button type="button" class="${view === 'skifte' ? 'on' : ''}" data-action="resultView" data-value="skifte"><strong>${tr('Skifte nå', 'Settle now')}</strong><span>${tr('Se hvordan arven fordeles hvis dere gjør opp nå', 'See how the inheritance is divided if you settle now')}</span></button>
          <button type="button" class="${view === 'uskifte' ? 'on' : ''}" data-action="resultView" data-value="uskifte"><strong>${tr('Uskifte', 'Undivided estate')}</strong><span>${tr('Se hvordan uskifte fungerer for dere', 'See how an undivided estate works for you')}</span></button>
          <button type="button" class="${view === 'compare' ? 'on' : ''}" data-action="resultView" data-value="compare"><strong>${tr('Jeg er usikker', 'I am not sure')}</strong><span>${tr('Se forskjellen side om side', 'See the difference side by side')}</span></button>
        </div>
      </div>
      ${view === 'skifte' ? renderSkifte(r, facts) : view === 'uskifte' ? renderUskifte(r, facts) : view === 'compare' ? renderCompare(r, facts) : ''}`
    } else {
      distribution = renderSkifte(r, facts)
    }
  }

  const meaning = r.notices.length ? `
    <div class="aw-block">
      <h3>${tr('Hva betyr dette for dere?', 'What does this mean for you?')}</h3>
      ${r.notices.map(n => notice(n, facts)).join('')}
    </div>` : ''

  const steps = `
    <div class="aw-block">
      <h3>${tr('Dette bør dere gjøre nå', 'What you should do now')}</h3>
      <ol class="aw-timeline">${r.nextSteps.map(s => `<li><div><h4>${esc(fill(field(s, 'title'), facts))}</h4><p>${rich(field(s, 'text'), facts)}</p>${sourceLine(s.sources)}</div></li>`).join('')}</ol>
    </div>`

  const method = `
    <details class="aw-block aw-method">
      <summary><h3>${tr('Slik har vi kommet frem til dette', 'How we arrived at this')}</h3></summary>
      <ol class="aw-method-list">${r.method.map(m => `<li>${rich(field(m, 'text'), facts)}${sourceLinks(m.sources)}</li>`).join('')}</ol>
      <h4>${tr('Kilder', 'Sources')}</h4>
      <ul class="aw-source-list">${r.sourcesUsed.map(id => SOURCES[id]).filter(Boolean).map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(field(s, 'title'))}</a>${s.note ? ` <small>${esc(field(s, 'note'))}</small>` : ''}</li>`).join('')}</ul>
      <p class="aw-hint">${tr('Grunnbeløpet (G) som er brukt', 'The basic amount (G) used')}: ${kr(r.G.value)} (${tr('gjelder fra', 'valid from')} ${new Date(r.G.from).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' })}).</p>
    </details>`

  return `
  <div class="aw-card aw-result">
    ${head}
    ${summary}
    ${blockers}
    ${complexity}
    ${situation}
    ${distribution}
    ${meaning}
    ${steps}
    ${method}
    ${renderSaveCard(r)}
    <div class="aw-nav aw-result-nav">
      <button type="button" class="aw-btn ghost" data-action="review">${ICON.edit} ${tr('Endre svar', 'Change answers')}</button>
      <button type="button" class="aw-btn ghost" data-action="pdf" ${pdfBusy ? 'disabled' : ''}>${ICON.download} ${tr('Last ned PDF', 'Download PDF')}</button>
      <button type="button" class="aw-btn ghost" data-action="restart">${tr('Start på nytt', 'Start again')}</button>
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
      const firstOpen = firstUnanswered(state.answers)
      if (firstOpen) go('question', firstOpen.id)
      else go('result')
      break
    }
    case 'restart':
      if (!Object.keys(state.answers).length || confirm(tr('Vil du slette svarene dine og starte på nytt?', 'Do you want to delete your answers and start again?'))) { state = fresh(); save(); go('intro') }
      break
    case 'next': nextQuestion(); break
    case 'ack': {
      state.acks = { ...(state.acks || {}), [q.id]: flagKey(flagsForQuestion(state.answers, q.id)) }
      needsAck = false
      save()
      nextQuestion()
      break
    }
    case 'prev': prevQuestion(); break
    case 'review': go('review'); break
    case 'result': state.resultView = null; go('result'); break
    case 'edit': if (btn.dataset.keep) go('question', btn.dataset.q); else editQuestion(btn.dataset.q); break
    case 'pdf': {
      pdfBusy = true; pdfError = null; render()
      import('./pdf.js')
        .then(m => m.downloadPdf(state.answers))
        .catch(() => { pdfError = tr('Vi klarte ikke å lage PDF-en. Sjekk nettforbindelsen og prøv igjen.', 'We could not create the PDF. Check your connection and try again.') })
        .finally(() => { pdfBusy = false; render() })
      break
    }
    case 'gotoSave': document.getElementById('awSave')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); break
    case 'saveToEstate': {
      host.saving = true; host.message = null; render()
      const payload = toEstatePayload(state.answers)
      // Navnet hver arving hadde sist resultatet ble lagret i boet, slik at appen finner igjen
      // raden – og e-posten som er lagt inn på den – selv om navnet er endret siden.
      if (host.saved?.answers) {
        const before = new Map(toEstatePayload(host.saved.answers).heirs.map(h => [h.key, h.name]))
        for (const h of payload.heirs) h.previousName = before.get(h.key) || null
      }
      toHost({ type: 'veiviser-save', login: Boolean(btn.dataset.login), answers: state.answers, payload })
      break
    }
    case 'open': toHost({ type: 'veiviser-navigate', path }); break
    case 'resultView': state.resultView = value; save(); render(); break
    case 'choose':
      setAnswer(q.id, value)
      render()
      // Gir svaret et varsel, blir brukeren stående til hen har trykket «OK» på det
      if (unacked(q)) break
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
    if (live) live.innerHTML = liveTotal(state.answers.assets || {})
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
    const estateId = m.estateId || m.estate?.id || null
    if (switchScope(m.userId || null, estateId)) Object.assign(host, { saving: false, message: null })
    Object.assign(host, { ready: true, loggedIn: Boolean(m.loggedIn), estate: m.estate || null, saved: m.saved || null })
    if (m.adoptAnonymous && m.userId && !estateId) adoptAnonymous()
    // Åpnet fra et bo med lagrede svar: bruk dem hvis vi ikke har svar for dette boet her fra før,
    // eller hvis noen har lagret andre svar i boet siden og brukeren ikke har endret noe her.
    const saved = estateId ? m.saved : null
    if (saved?.answers && (!hasAnswers() || (state.synced && !sameAnswers(saved.answers, state.answers)))) {
      state = { ...fresh(), answers: JSON.parse(JSON.stringify(saved.answers)), view: 'result', synced: true }
      save()
    }
    render()
  }
  if (m.type === 'veiviser-saved') {
    host.saving = false
    if (m.ok) {
      if (m.estate) host.estate = m.estate
      host.saved = { answers: JSON.parse(JSON.stringify(state.answers)), savedAt: m.savedAt || new Date().toISOString() }
      host.loggedIn = true
      state.synced = true
      save()
      host.message = { type: 'ok', text: m.text || tr('Lagret! Arvingene og stegene er lagt inn i boet.', 'Saved! The heirs and the steps have been added to the estate.') }
    } else if (m.cancelled) {
      host.message = null
    } else {
      host.message = { type: 'error', text: m.error || tr('Noe gikk galt under lagringen. Prøv igjen.', 'Something went wrong while saving. Please try again.') }
    }
    render()
  }
})

toHost({ type: 'veiviser-ready' })
// Utenfor appen brukes svarene for ikke-innloggede. Svarer ikke appen, bruker vi boet i adressen.
if (!embedded) switchScope(null, null)
else setTimeout(() => { if (!storageKey) { switchScope(null, new URLSearchParams(window.location.search).get('bo')); render() } }, 5000)

render()
