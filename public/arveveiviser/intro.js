// Startkortet i arveveiviseren («Hvem arver – og hvor mye?»). Egen fil uten nettleser-API-er, så byggesteget
// (src/seo/veiviserHost.js) kan legge det samme kortet ferdig inn i /veiviser. Teksten er flyttet uendret fra ui.js.
import { tr, isEn } from './i18n.js'
import { ICON } from './icons.js'

export function introHtml(hasProgress = false) {
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
