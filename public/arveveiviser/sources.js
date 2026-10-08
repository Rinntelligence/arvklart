// Kildeoversikt. Hver juridisk regel, forklaring og neste steg i veiviseren peker hit,
// slik at brukeren kan se hvor reglene kommer fra – og slik at vi kan kontrollere dem når lovverket endres.
// Kontrollert mot lovtekst (Lovdata) og domstol.no 5. oktober 2026.
// Arveloven 2019 (lov 14. juni 2019 nr. 21) gjelder for dødsfall fra 1. januar 2021.
// Skifteloven av 1930 er opphevet – reglene om skifte står nå i arveloven del 3.

const AL = '2019-06-14-21'
const law = (p, title, extra = {}) => ({ title: `Arveloven § ${p} – ${title}`, short: `Arveloven § ${p}`, url: `https://lovdata.no/lov/${AL}/§${p}`, ...extra })
const ekt = (p, title) => ({ title: `Ekteskapsloven § ${p} – ${title}`, short: `Ekteskapsloven § ${p}`, url: `https://lovdata.no/lov/1991-07-04-47/§${p}` })
const DOMSTOL = 'https://www.domstol.no/no/dodsfall-arv-og-skifte'
const SKJEMA = 'https://www.domstol.no/globalassets/da/skjema/arv-og-skifte'

export const SOURCES = {
  // ── Arveloven: hvem arver ──
  arveloven_livsarvinger: law(4, 'Livsarvinger (barn og barnebarn) arver først'),
  arveloven_andre_arvegang: law(5, 'Foreldre, søsken, nevøer og nieser'),
  arveloven_tredje_arvegang: law(6, 'Besteforeldre, tanter, onkler og søskenbarn'),
  arveloven_ektefelle: law(8, 'Ektefellens arv når det finnes livsarvinger'),
  arveloven_ektefelle_uten_barn: law(9, 'Ektefellens arv når det ikke finnes livsarvinger'),
  arveloven_testament_ektefelle: law(10, 'Testament som begrenser ektefellens arv'),
  arveloven_separasjon: law(11, 'Ingen arv ved separasjon eller skilsmissesak'),
  arveloven_samboer_def: law(2, 'Hvem som regnes som samboer'),
  arveloven_samboer_arv: law(12, 'Samboerens arv (4 G) ved felles barn'),
  arveloven_testament_samboer: law(13, 'Testament til samboer etter fem års samboerskap'),
  arveloven_pliktdel: law(50, 'Pliktdelsarv: 2/3, høyst 15 G per barn'),
  arveloven_forsorgelse: law(56, 'Barn som avdøde forsørget'),
  arveloven_testament_form: law(42, 'Krav til testament'),
  arveloven_testament_melding: law(65, 'Testamentsarvinger må melde seg innen seks måneder'),
  arveloven_avkorting: law(75, 'Forskudd på arv (avkorting)'),
  arveloven_staten: law(76, 'Når det ikke finnes arvinger'),
  arveloven_internasjonal: law(78, 'Hvilket lands arvelov gjelder'),
  arveloven_ikraft: law(180, 'Hvilke dødsfall den nye arveloven gjelder for'),

  // ── Arveloven: uskifte ──
  arveloven_uskifte: law(14, 'Retten til å sitte i uskifte'),
  arveloven_uskifte_saerkull: law(15, 'Uskifte med særkullsbarn krever samtykke'),
  arveloven_uskifte_delvis: law(16, 'Uskifte med resten når noen arvinger får arven sin'),
  arveloven_uskifte_testament: law(17, 'Testament som begrenser retten til uskifte'),
  arveloven_uskifte_gjeld_vilkar: law(18, 'Når uskifte ikke er tillatt'),
  arveloven_uskifte_frist: law(19, 'Melding til tingretten innen 60 dager'),
  arveloven_uskifte_gjeld: law(20, 'Ansvar for avdødes gjeld i uskifte'),
  arveloven_uskifte_gaver: law(23, 'Gaver fra uskifteboet'),
  arveloven_uskifte_nytt_forhold: law(27, 'Nytt ekteskap eller samboerskap'),
  arveloven_uskifte_skifte_senere: law(28, 'Skifte av uskifteboet senere'),
  arveloven_uskifte_saereie: law(21, 'Hva som går inn i uskifteformuen'),
  arveloven_uskifte_arvinger: law(26, 'Arvingene etter førstavdøde må leve når uskiftet skiftes'),
  arveloven_uskifte_deling: law(29, 'Deling av uskifteboet når gjenlevende dør'),
  arveloven_uskifte_formue: law(31, 'Alt gjenlevende eier, hører til uskifteformuen'),
  arveloven_uskifte_samboer: law(32, 'Samboerens rett til uskifte'),
  arveloven_uskifte_samboer_deling: law(39, 'Deling av samboerens uskiftebo'),

  // ── Arveloven: skifte ──
  arveloven_liten_verdi: law(95, 'Dødsbo av liten verdi'),
  arveloven_overta: law(113, 'Ektefellens rett til å overta bolig og innbo'),
  skifteloven_proklama: law(102, 'Proklama: kreditorer må melde krav innen seks uker'),
  arveloven_privat_skifte: law(116, 'Privat skifte og ansvar for gjeld'),
  arveloven_privat_frist: law(117, 'Frist på 60 dager for privat skifte'),
  arveloven_skifteattest: law(118, 'Skifteattest'),
  arveloven_offentlig: law(127, 'Hvem som kan kreve offentlig skifte'),

  // ── Ekteskapsloven ──
  ekteskapsloven_saereie: ekt(42, 'Særeie'),
  ekteskapsloven_deling: ekt(58, 'Felleseiet deles likt'),
  ekteskapsloven_skjevdeling: ekt(59, 'Skjevdeling'),
  ekteskapsloven_dodsfall: ekt(77, 'Deling ved dødsfall'),

  // ── Domstol.no ──
  domstol_hvem_arver: { title: 'Domstol.no – Hvem er arvinger?', short: 'Domstol.no: Hvem arver', url: `${DOMSTOL}/hvem-er-arvinger/` },
  domstol_hva_arver: { title: 'Domstol.no – Hva arver du?', short: 'Domstol.no: Hva arver du', url: `${DOMSTOL}/hva-arver-du/` },
  domstol_skifteformer: { title: 'Domstol.no – Forskjellige former for skifte (privat skifte, uskifte, offentlig skifte, bo av liten verdi)', short: 'Domstol.no: Former for skifte', url: `${DOMSTOL}/forskjellige-former-for-skifte/` },
  domstol_uskifte: { title: 'Domstol.no – Uskifte (under «Forskjellige former for skifte»)', short: 'Domstol.no: Uskifte', url: `${DOMSTOL}/forskjellige-former-for-skifte/` },
  domstol_privat_skifte: { title: 'Domstol.no – Hva må arvinger gjøre etter et dødsfall?', short: 'Domstol.no: Hva må arvinger gjøre', url: `${DOMSTOL}/hva-ma-arvinger-gjore-etter-et-dodsfall/` },
  domstol_proklama: { title: 'Domstol.no – Proklama og formuesfullmakt (under «Hva må arvinger gjøre»)', short: 'Domstol.no: Proklama', url: `${DOMSTOL}/hva-ma-arvinger-gjore-etter-et-dodsfall/` },
  domstol_eksempler: { title: 'Domstol.no – Eksempler på utregning av arv', short: 'Domstol.no: Eksempler', url: `${DOMSTOL}/eksempler-pa-utregning-av-arv/`, note: 'Eksemplene bruker grunnbeløpet fra 2023.' },
  domstol_skjema: { title: 'Domstol.no – Skjemaer for dødsfall, arv og skifte', short: 'Domstol.no: Skjemaer', url: `${DOMSTOL}/skjema/` },
  domstol_testament: { title: 'Domstol.no – Testament', short: 'Domstol.no: Testament', url: 'https://www.domstol.no/no/testament/' },
  domstol_gebyr: { title: 'Domstol.no – Rettsgebyr og kostnader', short: 'Domstol.no: Gebyrer', url: 'https://www.domstol.no/no/rettsgebyr-og-kostnader/' },
  domstol_kontakt: { title: 'Domstol.no – Dødsfall, arv og skifte (finn din tingrett)', short: 'Domstol.no: Dødsfall og arv', url: `${DOMSTOL}/` },
  domstol_faq: { title: 'Domstol.no – Ofte stilte spørsmål om dødsfall og arv', short: 'Domstol.no: Spørsmål og svar', url: `${DOMSTOL}/ofte-stilte-sporsmal/` },

  // ── Skjemaer ──
  skjema_privat_skifte: { title: 'Skjema: Erklæring om privat skifte av dødsbo', short: 'Skjema: Privat skifte', url: `${SKJEMA}/privat-skifte--minst-en-myndig-arving.pdf` },
  skjema_uskifte_ektefelle: { title: 'Skjema: Melding om uskiftet bo for ektefeller', short: 'Skjema: Uskifte (ektefelle)', url: `${SKJEMA}/melding-om-uskiftet-bo-nb.pdf` },
  skjema_uskifte_samboer: { title: 'Skjema: Melding om uskiftet bo for samboere', short: 'Skjema: Uskifte (samboer)', url: `${SKJEMA}/melding-om-uskiftet-bo-for-samboere.pdf` },
  skjema_enearving_ektefelle: { title: 'Skjema: Erklæring fra gjenlevende ektefelle som er eneste arving', short: 'Skjema: Ektefelle arver alt', url: `${SKJEMA}/erklaring-fra-gjenlevende-ektefelle-som-oppgir-a-vare-enearving.pdf` },
  skjema_enearving_samboer: { title: 'Skjema: Erklæring fra gjenlevende samboer som er eneste arving', short: 'Skjema: Samboer arver alt', url: `${SKJEMA}/erklaring-fra-gjenlevende-samboer-som-oppgir-a-vare-enearving.pdf` },
  skjema_liten_verdi: { title: 'Skjema: Erklæring om privat oppgjør av dødsbo av liten verdi', short: 'Skjema: Bo av liten verdi', url: `${SKJEMA}/erklaring-om-privat-oppgjor-av-dodsbo-av-liten-verdi.pdf` },
  skjema_proklama: { title: 'Skjema: Begjæring om proklama', short: 'Skjema: Proklama', url: `${SKJEMA}/begjaring-om-proklama.pdf` },
  skjema_veiledning_uskifte: { title: 'Veiledning om uskifte (domstol.no)', short: 'Veiledning: Uskifte', url: `${SKJEMA}/veiledning-uskifte.pdf` },

  // ── Annet ──
  nav_g: { title: 'NAV – Grunnbeløpet i folketrygden (G)', short: 'NAV: Grunnbeløpet', url: 'https://www.nav.no/grunnbelopet' },
  ektepaktregisteret: { title: 'Brønnøysundregistrene – Ektepaktregisteret', short: 'Ektepaktregisteret', url: 'https://www.brreg.no/ektepakt/' },
}
