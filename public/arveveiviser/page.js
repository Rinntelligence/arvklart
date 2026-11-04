// Tidslinje, ordliste og ressurser i arveveiviseren: kobler på knappene. Innholdet og HTML-en står i sections.js.
// På /veiviser ligger HTML-en ferdig i siden fra byggesteget (src/seo/veiviserHost.js); i rammen
// (/arveveiviser/ramme.html, brukt fra et bo) fylles den inn her. Lastes som modul før /arveveiviser/ui.js.
// Ligger i egen fil fordi innholdsreglene (CSP i vercel.json) ikke tillater skript direkte i HTML-en.
import { pageSections } from './sections.js';

// Engelsk (?lang=en, sendes av appen bare når den engelske veiviseren er slått på): innholdet har *_en-felter som
// brukes i stedet for de norske. Norsk er standard og den gjeldende versjonen.
const EN = new URLSearchParams(window.location.search).get('lang') === 'en';
const { T, GS_QUESTIONS, GS_OPTION_EN, gsRenderIntro, gsVerdict, gsRenderResult, timelineHtml, glossaryHtml, resourcesHtml, phaseOverviewHtml, whoInheritsHtml, bylineHtml } = pageSections(EN);
// Appen rundt veiviseren: GuidePage i rammen over (iframe), eller i samme vindu på /veiviser (data-veiviser-host)
const HOST = window.parent !== window ? window.parent : (document.querySelector('[data-veiviser-host]') ? window : null);

function setupGravferdCheck(container){
  let step = 0;
  const answers = {};
  function renderQuestion(){
    const q = GS_QUESTIONS[step];
    container.innerHTML = '<div class="gs-quiz"><div class="gs-progress">' + T('Spørsmål ', 'Question ') + (step + 1) + T(' av ', ' of ') + GS_QUESTIONS.length + '</div><div class="gs-question">' + q.text + '</div><div class="gs-options">' + q.options.map(o => '<button type="button" class="gs-option-btn" data-answer="' + o + '">' + T(o, GS_OPTION_EN[o]) + '</button>').join('') + '</div></div>';
    container.querySelectorAll('.gs-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        answers[q.key] = btn.dataset.answer;
        if(q.key === 'under18' && answers.under18 === 'Ja'){ container.innerHTML = gsRenderResult(gsVerdict(answers)); wireReset(); return; }
        step++;
        if(step >= GS_QUESTIONS.length){ container.innerHTML = gsRenderResult(gsVerdict(answers)); wireReset(); } else { renderQuestion(); }
      });
    });
  }
  function wireReset(){
    const resetBtn = container.querySelector('[data-gs="reset"]');
    if(resetBtn){ resetBtn.addEventListener('click', () => { step = 0; Object.keys(answers).forEach(k => delete answers[k]); container.innerHTML = gsRenderIntro(); wireStart(); }); }
  }
  function wireStart(){
    const startBtn = container.querySelector('[data-gs="start"]');
    if(startBtn){ startBtn.addEventListener('click', renderQuestion); }
  }
  container.innerHTML = gsRenderIntro();
  wireStart();
}

// Fyller en beholder hvis den er tom (i rammen); på /veiviser står HTML-en der allerede fra byggesteget
const fillOnce = (id, html) => { const el = document.getElementById(id); if (el && !el.children.length) el.innerHTML = html(); return el; };
fillOnce('bylineWrap', bylineHtml);
fillOnce('whoWrap', whoInheritsHtml);
const overview = fillOnce('phaseOverviewWrap', phaseOverviewHtml);

const timelineWrap = document.getElementById('timelineWrap');
if (!timelineWrap.children.length) timelineWrap.innerHTML = timelineHtml();
timelineWrap.querySelectorAll('.phase').forEach(el => {
  const head = el.querySelector('.phase-head');
  head.addEventListener('click', () => {
    const willOpen = !el.classList.contains('open');
    el.classList.toggle('open', willOpen);
    head.setAttribute('aria-expanded', String(willOpen));
  });
  el.querySelectorAll('.item-info-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('li');
      const willOpen = !li.classList.contains('info-open');
      li.classList.toggle('info-open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    });
  });
});
setupGravferdCheck(document.getElementById('gsCheck'));
// En lenke i oversikten åpner fasen den peker til (nettleseren ruller dit selv)
overview?.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#fase-"]');
  const phase = link && document.getElementById(link.getAttribute('href').slice(1));
  if (!phase || phase.classList.contains('open')) return;
  phase.classList.add('open');
  phase.querySelector('.phase-head').setAttribute('aria-expanded', 'true');
});

const glossaryWrap = document.getElementById('glossaryWrap');
if (!glossaryWrap.children.length) glossaryWrap.innerHTML = glossaryHtml();
glossaryWrap.querySelectorAll('.term').forEach(wrap => {
  wrap.querySelector('.term-btn').addEventListener('click', () => {
    const isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.term.open').forEach(t => { if(t !== wrap) t.classList.remove('open'); });
    wrap.classList.toggle('open', !isOpen);
  });
});
document.addEventListener('click', (e) => {
  if(!e.target.closest('.term')){ document.querySelectorAll('.term.open').forEach(t => t.classList.remove('open')); }
});

const resourcesWrap = document.getElementById('resourcesWrap');
if (!resourcesWrap.children.length) resourcesWrap.innerHTML = resourcesHtml();

// Appen (GuidePage) bestemmer knappeteksten og tar seg av navigeringen. På /veiviser står teksten ferdig i HTML-en.
const ctaParams = new URLSearchParams(window.location.search);
if(ctaParams.get('back') === 'home') { const cta = document.getElementById('ctaLabel'); cta.textContent = 'Tilbake til hjemmesiden'; cta.dataset.en = 'Back to the home page'; }
document.getElementById('ctaBtn').addEventListener('click', () => {
  if(HOST) HOST.postMessage({ type: 'veiviser-back' }, window.location.origin);
  else window.history.back();
});
