// Kildeoversikt. Hver juridisk regel, forklaring og neste steg i veiviseren peker hit,
// slik at brukeren kan se hvor reglene kommer fra – og slik at vi kan kontrollere dem når lovverket endres.
// Kontrollert mot lovtekst (Lovdata) og domstol.no 5. oktober 2026.
// Arveloven 2019 (lov 14. juni 2019 nr. 21) gjelder for dødsfall fra 1. januar 2021.
// Skifteloven av 1930 er opphevet – reglene om skifte står nå i arveloven del 3.

const AL = '2019-06-14-21'
// Lovtekstene finnes bare på norsk; den engelske tittelen forklarer hva paragrafen handler om
const law = (p, title, titleEn, extra = {}) => ({ title: `Arveloven § ${p} – ${title}`, title_en: `Inheritance Act § ${p} – ${titleEn} (in Norwegian)`, short: `Arveloven § ${p}`, short_en: `Inheritance Act § ${p}`, url: `https://lovdata.no/lov/${AL}/§${p}`, ...extra })
const ekt = (p, title, titleEn) => ({ title: `Ekteskapsloven § ${p} – ${title}`, title_en: `Marriage Act § ${p} – ${titleEn} (in Norwegian)`, short: `Ekteskapsloven § ${p}`, short_en: `Marriage Act § ${p}`, url: `https://lovdata.no/lov/1991-07-04-47/§${p}` })
const DOMSTOL = 'https://www.domstol.no/no/dodsfall-arv-og-skifte'
const SKJEMA = 'https://www.domstol.no/globalassets/da/skjema/arv-og-skifte'

export const SOURCES = {
  // ── Arveloven: hvem arver ──
  arveloven_livsarvinger: law(4, 'Livsarvinger (barn og barnebarn) arver først', 'Descendants (children and grandchildren) inherit first'),
  arveloven_andre_arvegang: law(5, 'Foreldre, søsken, nevøer og nieser', 'Parents, siblings, nephews and nieces'),
  arveloven_tredje_arvegang: law(6, 'Besteforeldre, tanter, onkler og søskenbarn', 'Grandparents, aunts, uncles and cousins'),
  arveloven_ektefelle: law(8, 'Ektefellens arv når det finnes livsarvinger', 'The spouse\'s inheritance when there are descendants'),
  arveloven_ektefelle_uten_barn: law(9, 'Ektefellens arv når det ikke finnes livsarvinger', 'The spouse\'s inheritance when there are no descendants'),
  arveloven_testament_ektefelle: law(10, 'Testament som begrenser ektefellens arv', 'A will that limits the spouse\'s inheritance'),
  arveloven_separasjon: law(11, 'Ingen arv ved separasjon eller skilsmissesak', 'No inheritance in case of separation or divorce proceedings'),
  arveloven_samboer_def: law(2, 'Hvem som regnes som samboer', 'Who counts as a cohabitant'),
  arveloven_samboer_arv: law(12, 'Samboerens arv (4 G) ved felles barn', 'The cohabitant\'s inheritance (4 G) with joint children'),
  arveloven_testament_samboer: law(13, 'Testament til samboer etter fem års samboerskap', 'A will in favour of a cohabitant after five years\' cohabitation'),
  arveloven_pliktdel: law(50, 'Pliktdelsarv: 2/3, høyst 15 G per barn', 'Compulsory share: 2/3, at most 15 G per child'),
  arveloven_forsorgelse: law(56, 'Barn som avdøde forsørget', 'Children the deceased supported'),
  arveloven_testament_form: law(42, 'Krav til testament', 'Requirements for a will'),
  arveloven_testament_melding: law(65, 'Testamentsarvinger må melde seg innen seks måneder', 'Heirs under a will must come forward within six months'),
  arveloven_avkorting: law(75, 'Forskudd på arv (avkorting)', 'Advance on inheritance (avkorting)'),
  arveloven_staten: law(76, 'Når det ikke finnes arvinger', 'When there are no heirs'),
  arveloven_internasjonal: law(78, 'Hvilket lands arvelov gjelder', 'Which country\'s inheritance law applies'),
  arveloven_ikraft: law(180, 'Hvilke dødsfall den nye arveloven gjelder for', 'Which deaths the new Inheritance Act applies to'),

  // ── Arveloven: uskifte ──
  arveloven_uskifte: law(14, 'Retten til å sitte i uskifte', 'The right to keep an undivided estate'),
  arveloven_uskifte_saerkull: law(15, 'Uskifte med særkullsbarn krever samtykke', 'An undivided estate with children from another relationship requires consent'),
  arveloven_uskifte_delvis: law(16, 'Uskifte med resten når noen arvinger får arven sin', 'Undivided estate with the rest when some heirs receive their inheritance'),
  arveloven_uskifte_testament: law(17, 'Testament som begrenser retten til uskifte', 'A will that limits the right to an undivided estate'),
  arveloven_uskifte_gjeld_vilkar: law(18, 'Når uskifte ikke er tillatt', 'When an undivided estate is not permitted'),
  arveloven_uskifte_frist: law(19, 'Melding til tingretten innen 60 dager', 'Notice to the district court within 60 days'),
  arveloven_uskifte_gjeld: law(20, 'Ansvar for avdødes gjeld i uskifte', 'Liability for the deceased\'s debts in an undivided estate'),
  arveloven_uskifte_gaver: law(23, 'Gaver fra uskifteboet', 'Gifts from the undivided estate'),
  arveloven_uskifte_nytt_forhold: law(27, 'Nytt ekteskap eller samboerskap', 'New marriage or cohabitation'),
  arveloven_uskifte_skifte_senere: law(28, 'Skifte av uskifteboet senere', 'Dividing the undivided estate later'),
  arveloven_uskifte_saereie: law(21, 'Hva som går inn i uskifteformuen', 'What goes into the undivided estate'),
  arveloven_uskifte_arvinger: law(26, 'Arvingene etter førstavdøde må leve når uskiftet skiftes', 'The heirs of the first to die must be alive when the undivided estate is divided'),
  arveloven_uskifte_deling: law(29, 'Deling av uskifteboet når gjenlevende dør', 'Dividing the undivided estate when the survivor dies'),
  arveloven_uskifte_formue: law(31, 'Alt gjenlevende eier, hører til uskifteformuen', 'Everything the survivor owns belongs to the undivided estate'),
  arveloven_uskifte_samboer: law(32, 'Samboerens rett til uskifte', 'The cohabitant\'s right to an undivided estate'),
  arveloven_uskifte_samboer_deling: law(39, 'Deling av samboerens uskiftebo', 'Dividing the cohabitant\'s undivided estate'),

  // ── Arveloven: skifte ──
  arveloven_liten_verdi: law(95, 'Dødsbo av liten verdi', 'Estates of small value'),
  arveloven_overta: law(113, 'Ektefellens rett til å overta bolig og innbo', 'The spouse\'s right to take over the home and contents'),
  skifteloven_proklama: law(102, 'Proklama: kreditorer må melde krav innen seks uker', 'Proklama: creditors must report claims within six weeks'),
  arveloven_privat_skifte: law(116, 'Privat skifte og ansvar for gjeld', 'Private settlement and liability for debts'),
  arveloven_privat_frist: law(117, 'Frist på 60 dager for privat skifte', 'Deadline of 60 days for private settlement'),
  arveloven_skifteattest: law(118, 'Skifteattest', 'Probate certificate (skifteattest)'),
  arveloven_offentlig: law(127, 'Hvem som kan kreve offentlig skifte', 'Who can demand public administration of the estate'),

  // ── Ekteskapsloven ──
  ekteskapsloven_saereie: ekt(42, 'Særeie', 'Separate property'),
  ekteskapsloven_deling: ekt(58, 'Felleseiet deles likt', 'Joint property is divided equally'),
  ekteskapsloven_skjevdeling: ekt(59, 'Skjevdeling', 'Skewed division (skjevdeling)'),
  ekteskapsloven_dodsfall: ekt(77, 'Deling ved dødsfall', 'Division on death'),

  // ── Domstol.no ──
  domstol_hvem_arver: { title: 'Domstol.no – Hvem er arvinger?', title_en: 'Domstol.no – Who are the heirs? (in Norwegian)', short: 'Domstol.no: Hvem arver', short_en: 'Domstol.no: Who inherits', url: `${DOMSTOL}/hvem-er-arvinger/` },
  domstol_hva_arver: { title: 'Domstol.no – Hva arver du?', title_en: 'Domstol.no – What do you inherit? (in Norwegian)', short: 'Domstol.no: Hva arver du', short_en: 'Domstol.no: What you inherit', url: `${DOMSTOL}/hva-arver-du/` },
  domstol_skifteformer: { title: 'Domstol.no – Forskjellige former for skifte (privat skifte, uskifte, offentlig skifte, bo av liten verdi)', title_en: 'Domstol.no – Different forms of settlement (private, undivided, public, small estates) (in Norwegian)', short: 'Domstol.no: Former for skifte', short_en: 'Domstol.no: Forms of settlement', url: `${DOMSTOL}/forskjellige-former-for-skifte/` },
  domstol_uskifte: { title: 'Domstol.no – Uskifte (under «Forskjellige former for skifte»)', title_en: 'Domstol.no – Undivided estate (under «Forskjellige former for skifte») (in Norwegian)', short: 'Domstol.no: Uskifte', short_en: 'Domstol.no: Undivided estate', url: `${DOMSTOL}/forskjellige-former-for-skifte/` },
  domstol_privat_skifte: { title: 'Domstol.no – Hva må arvinger gjøre etter et dødsfall?', title_en: 'Domstol.no – What must heirs do after a death? (in Norwegian)', short: 'Domstol.no: Hva må arvinger gjøre', short_en: 'Domstol.no: What heirs must do', url: `${DOMSTOL}/hva-ma-arvinger-gjore-etter-et-dodsfall/` },
  domstol_proklama: { title: 'Domstol.no – Proklama og formuesfullmakt (under «Hva må arvinger gjøre»)', title_en: 'Domstol.no – Proklama and power of attorney for assets (under «Hva må arvinger gjøre») (in Norwegian)', short: 'Domstol.no: Proklama', short_en: 'Domstol.no: Proklama', url: `${DOMSTOL}/hva-ma-arvinger-gjore-etter-et-dodsfall/` },
  domstol_eksempler: { title: 'Domstol.no – Eksempler på utregning av arv', title_en: 'Domstol.no – Examples of inheritance calculations (in Norwegian)', short: 'Domstol.no: Eksempler', short_en: 'Domstol.no: Examples', url: `${DOMSTOL}/eksempler-pa-utregning-av-arv/`, note: 'Eksemplene bruker grunnbeløpet fra 2023.', note_en: 'The examples use the basic amount from 2023.' },
  domstol_skjema: { title: 'Domstol.no – Skjemaer for dødsfall, arv og skifte', title_en: 'Domstol.no – Forms for death, inheritance and settlement (in Norwegian)', short: 'Domstol.no: Skjemaer', short_en: 'Domstol.no: Forms', url: `${DOMSTOL}/skjema/` },
  domstol_testament: { title: 'Domstol.no – Testament', title_en: 'Domstol.no – Wills (in Norwegian)', short: 'Domstol.no: Testament', short_en: 'Domstol.no: Wills', url: 'https://www.domstol.no/no/testament/' },
  domstol_gebyr: { title: 'Domstol.no – Rettsgebyr og kostnader', title_en: 'Domstol.no – Court fees and costs (in Norwegian)', short: 'Domstol.no: Gebyrer', short_en: 'Domstol.no: Fees', url: 'https://www.domstol.no/no/rettsgebyr-og-kostnader/' },
  domstol_kontakt: { title: 'Domstol.no – Dødsfall, arv og skifte (finn din tingrett)', title_en: 'Domstol.no – Death, inheritance and settlement (find your district court) (in Norwegian)', short: 'Domstol.no: Dødsfall og arv', short_en: 'Domstol.no: Death and inheritance', url: `${DOMSTOL}/` },
  domstol_faq: { title: 'Domstol.no – Ofte stilte spørsmål om dødsfall og arv', title_en: 'Domstol.no – Frequently asked questions about death and inheritance (in Norwegian)', short: 'Domstol.no: Spørsmål og svar', short_en: 'Domstol.no: Questions and answers', url: `${DOMSTOL}/ofte-stilte-sporsmal/` },

  // ── Skjemaer ──
  skjema_privat_skifte: { title: 'Skjema: Erklæring om privat skifte av dødsbo', title_en: 'Form: Declaration of private settlement of an estate (in Norwegian)', short: 'Skjema: Privat skifte', short_en: 'Form: Private settlement', url: `${SKJEMA}/privat-skifte--minst-en-myndig-arving.pdf` },
  skjema_uskifte_ektefelle: { title: 'Skjema: Melding om uskiftet bo for ektefeller', title_en: 'Form: Notice of undivided estate for spouses (in Norwegian)', short: 'Skjema: Uskifte (ektefelle)', short_en: 'Form: Undivided estate (spouse)', url: `${SKJEMA}/melding-om-uskiftet-bo-nb.pdf` },
  skjema_uskifte_samboer: { title: 'Skjema: Melding om uskiftet bo for samboere', title_en: 'Form: Notice of undivided estate for cohabitants (in Norwegian)', short: 'Skjema: Uskifte (samboer)', short_en: 'Form: Undivided estate (cohabitant)', url: `${SKJEMA}/melding-om-uskiftet-bo-for-samboere.pdf` },
  skjema_enearving_ektefelle: { title: 'Skjema: Erklæring fra gjenlevende ektefelle som er eneste arving', title_en: 'Form: Declaration from a surviving spouse who is the sole heir (in Norwegian)', short: 'Skjema: Ektefelle arver alt', short_en: 'Form: Spouse inherits everything', url: `${SKJEMA}/erklaring-fra-gjenlevende-ektefelle-som-oppgir-a-vare-enearving.pdf` },
  skjema_enearving_samboer: { title: 'Skjema: Erklæring fra gjenlevende samboer som er eneste arving', title_en: 'Form: Declaration from a surviving cohabitant who is the sole heir (in Norwegian)', short: 'Skjema: Samboer arver alt', short_en: 'Form: Cohabitant inherits everything', url: `${SKJEMA}/erklaring-fra-gjenlevende-samboer-som-oppgir-a-vare-enearving.pdf` },
  skjema_liten_verdi: { title: 'Skjema: Erklæring om privat oppgjør av dødsbo av liten verdi', title_en: 'Form: Declaration of private settlement of an estate of small value (in Norwegian)', short: 'Skjema: Bo av liten verdi', short_en: 'Form: Estate of small value', url: `${SKJEMA}/erklaring-om-privat-oppgjor-av-dodsbo-av-liten-verdi.pdf` },
  skjema_proklama: { title: 'Skjema: Begjæring om proklama', title_en: 'Form: Request for proklama (in Norwegian)', short: 'Skjema: Proklama', short_en: 'Form: Proklama', url: `${SKJEMA}/begjaring-om-proklama.pdf` },
  skjema_veiledning_uskifte: { title: 'Veiledning om uskifte (domstol.no)', title_en: 'Guidance on undivided estates (domstol.no, in Norwegian)', short: 'Veiledning: Uskifte', short_en: 'Guidance: Undivided estate', url: `${SKJEMA}/veiledning-uskifte.pdf` },

  // ── Annet ──
  nav_g: { title: 'NAV – Grunnbeløpet i folketrygden (G)', title_en: 'NAV – The National Insurance basic amount (G) (in Norwegian)', short: 'NAV: Grunnbeløpet', short_en: 'NAV: The basic amount', url: 'https://www.nav.no/grunnbelopet' },
  ektepaktregisteret: { title: 'Brønnøysundregistrene – Ektepaktregisteret', title_en: 'Brønnøysund Register Centre – Register of Marriage Settlements', short: 'Ektepaktregisteret', short_en: 'Register of Marriage Settlements', url: 'https://www.brreg.no/ektepakt/' },
}
