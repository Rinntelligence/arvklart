// Lastes i <head> i index.html (vanlig skript, ikke modul, så det kjører før siden vises). Egen fil fordi
// innholdsreglene (CSP i vercel.json) ikke tillater skript direkte i HTML-en.
// Forhåndsrendrede sider (src/seo/vitePlugin.js) er på norsk for en besøkende uten innlogging. For den som har
// valgt engelsk, er innlogget eller kommer fra en e-postlenke med økten i adressen, skjules den teksten til appen har rendret riktig versjon (main.jsx fjerner
// klassen). Søkemotorer og nye besøkende ser alltid teksten. Samme øktsjekk som src/seo/clientState.js.
(function () {
  try {
    var client = localStorage.getItem('hs_lang') === 'en'
      || /[#&?](access_token|refresh_token|error_description|code)=/.test(location.search + location.hash)
    for (var i = 0; !client && i < localStorage.length; i++) client = /^sb-.+-auth-token$/.test(localStorage.key(i) || '')
    if (client) document.documentElement.classList.add('pr-client')
  } catch (e) { /* ingen localStorage: vis siden som den er */ }
})()
