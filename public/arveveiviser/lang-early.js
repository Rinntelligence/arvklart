// Lastes øverst i <body> på veiviser.html (vanlig skript, ikke modul, så det kjører før resten av siden).
// Ligger i egen fil fordi innholdsreglene (CSP i vercel.json) ikke tillater skript direkte i HTML-en.
// Engelsk versjon (?lang=en): statisk tekst har engelsk i data-en. Norsk er standard og juridisk gjeldende.
if (new URLSearchParams(window.location.search).get('lang') === 'en') {
  document.documentElement.lang = 'en';
  document.title = 'Guide — Arvklart';
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-en]').forEach(el => { el.textContent = el.dataset.en; });
  });
}
