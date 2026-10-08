// Juridiske forklaringer, advarsler og neste steg – som data.
// Hver regel har en betingelse (`when`, se conditions.js), enkel tekst, en utdypning
// («Les mer om hvorfor») og kilder. Nye situasjoner legges til her, ikke i UI-et.
//
// Plassholdere i tekst fylles inn av engine.js:
//   {g3} {g4} {g6} {g15}  beløp i G       {E} det som skal arves
//   {partnerAmount}       ektefelle/samboers arv
//   {pliktPerLine}        pliktdelsarv per barn   {freePart} det testamentet kan bestemme over
//   {skjevE}              avdødes bo med skjevdeling
//   {testamentWanted}     beløp testamentet gir bort
//   {survivorKeeps}       gjenlevendes egen del av felles formue
//   {testamentMax}        det testamentet lovlig kan gi bort
//   {firstAmount}         delen av uskifteboet som går til arvingene etter den som døde først
//   {splitRule}           hvordan uskifteboet deles (ekteskap eller samboerskap)
// Fylles inn av text.js: {partner} {partnerDu} {partnerDeg} {couple} {first} {First}
//
// level: 'info' (forklaring), 'warning' (bør undersøkes), 'critical' (juridisk risiko)
// area:  'meaning' (Hva betyr dette), 'skifte', 'uskifte'

export const NOTICES = [
  // ── Ektefelle og samboer ──
  {
    id: 'spouseQuarter', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 1 }, { fact: 'partnerBasis', eq: 'quarter' }] },
    title: 'Ektefellen arver en fjerdedel',
    text: 'Når avdøde hadde barn, arver gjenlevende ektefelle en fjerdedel av avdødes formue. Barna deler resten likt.',
    more: 'Ektefellen har uansett rett til minst fire ganger grunnbeløpet ({g4}). Her er en fjerdedel mer enn det, så det er en fjerdedel som gjelder.',
    sources: ['arveloven_ektefelle', 'domstol_hva_arver'],
  },
  {
    id: 'spouseMin4G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 1 }, { fact: 'partnerBasis', eq: 'min4G' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Ektefellen har rett til en minstearv',
    text: 'Ektefellen arver minst fire ganger grunnbeløpet ({g4}), selv om det er mer enn en fjerdedel. Denne [[minstearv|minstearven]] går foran barnas arv.',
    sources: ['arveloven_ektefelle', 'nav_g'],
  },
  {
    id: 'spouseTakesAllMin', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 1 }, { fact: 'partnerTakesAll' }] },
    title: 'Ektefellen arver alt',
    text: 'Det avdøde etterlot seg er mindre enn minstearven til ektefellen ({g4}). Derfor arver ektefellen alt, og barna arver ikke noe etter avdøde nå.',
    more: 'Felles barn arver i stedet etter gjenlevende når hen dør. Barna har likevel enkelte rettigheter, for eksempel til å be om oversikt over formuen og å kreve proklama.',
    sources: ['arveloven_ektefelle'],
  },
  {
    id: 'spouseTakesAllSeparateChildren', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'partnerTakesAll' }, { fact: 'hasSeparateChildren' }] },
    title: 'Særkullsbarna kan bli uten arv',
    text: 'Et [[saerkullsbarn|særkullsbarn]] arver ikke etter gjenlevende ektefelle eller samboer. Når gjenlevende arver alt, får særkullsbarna derfor ingen arv etter forelderen sin.',
    sources: ['arveloven_ektefelle', 'arveloven_samboer_arv'],
  },
  {
    id: 'spouseHalf', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 2 }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Ektefellen arver halvparten',
    text: 'Avdøde hadde ikke barn. Da arver ektefellen halvparten, men alltid minst seks ganger grunnbeløpet ({g6}). Resten går til avdødes foreldre – eller søsken, nevøer og nieser hvis en forelder er død.',
    sources: ['arveloven_ektefelle_uten_barn', 'arveloven_andre_arvegang'],
  },
  {
    id: 'spouseTakesAllMin6G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 2 }, { fact: 'partnerTakesAll' }] },
    title: 'Ektefellen arver alt',
    text: 'Det avdøde etterlot seg er mindre enn ektefellens minstearv på seks ganger grunnbeløpet ({g6}). Derfor arver ektefellen alt.',
    sources: ['arveloven_ektefelle_uten_barn'],
  },
  {
    id: 'spouseAll', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 0 }] },
    title: 'Ektefellen arver alt',
    text: 'Avdøde etterlot seg verken barn, foreldre, søsken eller nevøer og nieser. Da arver ektefellen alt – besteforeldre, tanter og onkler arver ikke når det er en ektefelle.',
    sources: ['arveloven_ektefelle_uten_barn'],
  },
  {
    id: 'cohabitant4G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Samboeren arver fire ganger grunnbeløpet',
    text: 'Fordi {couple} har eller har hatt barn sammen, arver {partnerDu} {g4} (fire ganger grunnbeløpet). Resten går til avdødes barn, som deler likt.',
    more: 'Avdøde kunne bare begrense samboerens arv i et testament hvis samboeren fikk vite om testamentet mens avdøde levde.',
    sources: ['arveloven_samboer_arv', 'domstol_hva_arver'],
  },
  {
    id: 'cohabitantTakesAll', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { fact: 'partnerTakesAll' }] },
    title: 'Samboeren arver alt',
    text: 'Det avdøde etterlot seg er mindre enn samboerens arv på fire ganger grunnbeløpet ({g4}). Derfor arver samboeren alt.',
    sources: ['arveloven_samboer_arv'],
  },
  {
    id: 'cohabitantNoChildren', area: 'meaning', level: 'warning',
    when: { fact: 'cohabitantNoChildren' },
    title: 'Samboere uten felles barn arver ikke hverandre etter loven',
    text: 'Uten felles barn har samboeren ikke rett til arv eller til å sitte i uskifte. Samboeren kan bare arve hvis det står i et testament.',
    more: 'Har samboerne bodd sammen de siste fem årene, kan et testament gi samboeren inntil {g4} – også når det går ut over barnas pliktdelsarv. Etter minst to års samboerskap kan samboeren i noen tilfeller ha rett til å overta felles bolig og innbo mot å betale for det.',
    sources: ['arveloven_samboer_arv', 'arveloven_testament_samboer'],
  },
  {
    id: 'separated', area: 'meaning', level: 'warning',
    when: { q: 'maritalStatus', eq: 'separated' },
    title: 'Separerte ektefeller arver ikke hverandre',
    text: 'Når det var søkt om separasjon eller skilsmisse før dødsfallet, har den andre ektefellen ikke rett til arv eller uskifte etter loven. Et testament til ektefellen faller normalt også bort.',
    more: 'Dette gjelder når begjæringen var mottatt av statsforvalteren eller retten før dødsfallet. Felles formue skal likevel deles mellom gjenlevende og dødsboet etter reglene i ekteskapsloven – snakk med tingretten om hvordan.',
    sources: ['arveloven_separasjon'],
  },

  // ── Barn og slekt ──
  {
    id: 'childrenEqual', area: 'meaning', level: 'info',
    // Ved tidligere uskifte arver felles barn også etter den som døde først – forklares i previousUskifte.
    when: { all: [{ fact: 'order', eq: 1 }, { fact: 'lineCount', gt: 1 }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'previousUskifte' } }] },
    title: 'Barna arver likt',
    text: 'Alle barna til avdøde arver like mye – uansett om de er felles barn, særkullsbarn eller adoptivbarn.',
    sources: ['arveloven_livsarvinger'],
  },
  {
    id: 'representation', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'order', eq: 1 }, { fact: 'representation' }] },
    title: 'Barnebarn arver i stedet for et barn som er dødt',
    text: 'Er et av barna dødt, går den delen barnet ville fått, videre til barnets egne barn. De deler likt.',
    more: 'Er også et barnebarn dødt, går delen videre til barnebarnets barn. Veiviseren regner bare ett ledd ned – gi beskjed til tingretten hvis det gjelder dere.',
    sources: ['arveloven_livsarvinger'],
  },
  {
    id: 'separateChildren', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'hasSeparateChildren' }, { fact: 'partnerInherits' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Særkullsbarn har de samme rettighetene som felles barn',
    text: 'Et [[saerkullsbarn|særkullsbarn]] arver like mye som de andre barna. Men særkullsbarn arver ikke etter gjenlevende senere. Derfor må de samtykke hvis gjenlevende vil sitte i uskifte.',
    sources: ['arveloven_uskifte_saerkull', 'domstol_hva_arver'],
  },
  {
    id: 'parentsInherit', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'order', eq: 2 }, { not: { fact: 'married' } }] },
    title: 'Foreldrene og deres familie arver',
    text: 'Avdøde hadde ikke barn. Da arver foreldrene halvparten hver. Er en forelder død, går den halvparten til avdødes søsken på den siden – og videre til nevøer og nieser hvis et søsken er dødt.',
    more: 'Halvsøsken arver bare fra den siden de har felles med avdøde. Har den ene forelderen verken levende foreldre eller etterkommere, går alt til den andre siden.',
    sources: ['arveloven_andre_arvegang', 'domstol_hvem_arver'],
  },
  {
    id: 'under25Parents', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'order', eq: 2 }, { fact: 'parentDead' }] },
    title: 'Særregel hvis avdøde var under 25 år',
    text: 'Var avdøde under 25 år, og foreldrene verken var gift eller samboere da en av dem døde, kan halvparten gå til besteforeldrene på den døde forelderens side i stedet. Veiviseren tar ikke hensyn til dette.',
    sources: ['arveloven_andre_arvegang'],
  },
  {
    id: 'grandparentsInherit', area: 'meaning', level: 'info',
    when: { fact: 'order', eq: 3 },
    title: 'Besteforeldrene og deres familie arver',
    text: 'Når det verken finnes barn, foreldre, søsken, nevøer eller nieser, går arven halvt til farssiden og halvt til morssiden. Der arver besteforeldrene – eller tanter, onkler og søskenbarn i stedet for en besteforelder som er død.',
    sources: ['arveloven_tredje_arvegang', 'domstol_hvem_arver'],
  },
  {
    id: 'toCharity', area: 'meaning', level: 'warning',
    when: { fact: 'toCharity' },
    title: 'Det finnes ingen arvinger etter loven',
    text: 'Uten testament går arven til frivillig arbeid for barn og unge. Personer som sto avdøde nær, kan søke departementet om å få hele eller deler av arven.',
    sources: ['arveloven_staten'],
  },

  // ── Testament ──
  {
    id: 'compulsoryShare', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'testament' }, { fact: 'order', eq: 1 }, { fact: 'E', gt: 0 }] },
    title: 'Barna har krav på en minstedel, uansett testament',
    text: 'Hvert barn har krav på minst {pliktPerLine}. Det er barnets [[pliktdel|pliktdelsarv]]. Testamentet kan bare bestemme fritt over {freePart}.',
    more: 'Pliktdelsarven er to tredjedeler av det barna arver etter loven, men aldri mer enn 15 ganger grunnbeløpet ({g15}) per barn. Har et barn dødd, deler barnebarna den delen.',
    sources: ['arveloven_pliktdel'],
  },
  {
    id: 'testamentExceeds', area: 'meaning', level: 'critical',
    when: { fact: 'testamentExceeds' },
    title: 'Testamentet gir bort mer enn loven tillater',
    text: 'Testamentet gir bort omtrent {testamentWanted}, men kan bare bestemme over {testamentMax}. I beregningen har vi redusert gavene til det som er lov. Mottakerne i testamentet bør få vite dette.',
    sources: ['arveloven_pliktdel', 'arveloven_ektefelle'],
  },
  {
    id: 'testamentUneven', area: 'meaning', level: 'warning',
    when: { fact: 'testamentUneven' },
    title: 'Testamentet kan endre fordelingen mellom arvingene',
    text: 'Fordelingen vi viser, er lovens hovedregel. Testamentet kan gi noen mer eller gi dem bestemte ting, så lenge alle barna får minst pliktdelsarven sin, og ektefelle eller samboer får sin minstearv.',
    sources: ['arveloven_pliktdel'],
  },
  {
    id: 'testamentLimitsPartnerKnew', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'testamentLimitsPartner' }, { q: 'testamentPartnerKnew', eq: 'yes' }] },
    title: 'Testamentet begrenser arven til {partnerDeg}',
    text: 'Fordi {partnerDu} visste om testamentet, kan det gi mindre enn loven ellers sier. Minstearven er likevel beskyttet, og her blir arven {partnerAmount}.',
    sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'],
  },
  {
    id: 'testamentLimitsPartnerNotKnew', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'testamentLimitsPartner' }, { q: 'testamentPartnerKnew', ne: 'yes' }] },
    title: 'Testamentet kan trolig ikke redusere arven til {partnerDeg}',
    text: 'Et testament kan bare gi ektefelle eller samboer mindre enn loven sier, hvis de fikk vite om testamentet mens avdøde levde. Vi har derfor regnet med full arv etter loven.',
    sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'],
  },
  {
    id: 'testamentCohabitant', area: 'meaning', level: 'info',
    when: { fact: 'testamentToCohabitant' },
    title: 'Testament til samboeren',
    text: 'En samboer uten felles barn arver bare det testamentet gir. Har {couple} bodd sammen de siste fem årene, kan inntil {g4} gis selv om det går ut over barnas pliktdelsarv. Ellers kan samboeren bare få det testamentet fritt kan bestemme over.',
    sources: ['arveloven_testament_samboer', 'arveloven_pliktdel'],
  },
  {
    id: 'testamentSeparateClause', area: 'meaning', level: 'info',
    when: { fact: 'testamentSeparateClause' },
    title: 'Arv som særeie endrer ikke fordelingen',
    text: 'At arven skal være mottakerens særeie, betyr at den holdes utenfor hvis mottakeren skiller seg. Det endrer ikke hvor mye hver arving får.',
    sources: ['ekteskapsloven_saereie'],
  },
  {
    id: 'testamentOther', area: 'meaning', level: 'warning',
    when: { fact: 'testamentOther' },
    title: 'Testamentet kan påvirke beregningen',
    text: 'Er du usikker på hva testamentet betyr, bør du få juridisk hjelp eller spørre tingretten før dere fordeler arven. Beregningen vår bygger på lovens hovedregler.',
    sources: ['domstol_testament'],
  },
  {
    id: 'testamentNotify', area: 'meaning', level: 'info',
    when: { any: [{ fact: 'testamentGiveaway' }, { fact: 'testamentToCohabitant' }] },
    title: 'Mottakere i testamentet bør melde seg til tingretten',
    text: 'Den som får noe etter et testament, bør melde fra til tingretten innen seks måneder etter at de fikk vite om dødsfallet og testamentet. Ellers kan retten til arven falle bort.',
    sources: ['arveloven_testament_melding'],
  },

  // ── Ektepakt og deling ──
  {
    id: 'separateProperty', area: 'meaning', level: 'info',
    when: { fact: 'separateProperty' },
    title: 'Særeie holdes utenfor delingen',
    text: 'Avdødes særeie går i sin helhet inn i dødsboet. Gjenlevendes særeie beholder gjenlevende. Bare felles formue deles i to.',
    sources: ['ekteskapsloven_saereie', 'ekteskapsloven_deling'],
  },
  {
    id: 'separatePropertyUnknown', area: 'meaning', level: 'warning',
    when: { fact: 'separatePropertyUnknown' },
    title: 'Sjekk om det finnes en ektepakt',
    text: 'Vi har regnet som om alt var felles formue. Finnes det en ektepakt om særeie, kan fordelingen bli en annen. Ektepakter er registrert i Ektepaktregisteret.',
    sources: ['ektepaktregisteret', 'ekteskapsloven_saereie'],
  },
  {
    id: 'skjevdeling', area: 'meaning', level: 'warning',
    when: { fact: 'skjevdelingResult' },
    title: 'Skjevdeling kan endre fordelingen',
    text: 'Hvis verdiene fra før ekteskapet, arv og gaver holdes utenfor delingen, blir det som skal arves omtrent {skjevE} i stedet for {E}. Både gjenlevende og arvingene kan kreve skjevdeling.',
    more: 'Det må kunne dokumenteres at verdiene fortsatt finnes, for eksempel i den samme boligen. Skjevdeling må kreves – det skjer ikke av seg selv. Det kan ikke kreves når et uskiftebo deles senere.',
    sources: ['ekteskapsloven_skjevdeling', 'ekteskapsloven_dodsfall'],
  },
  {
    id: 'skjevdelingNoAmount', area: 'meaning', level: 'warning',
    when: { any: [{ fact: 'skjevdelingUnknown' }, { all: [{ fact: 'skjevdeling' }, { not: { fact: 'skjevdelingResult' } }] }] },
    title: 'Verdier fra før ekteskapet kan påvirke delingen',
    text: 'Verdier en av dere hadde før ekteskapet, eller har arvet eller fått i gave, kan i mange tilfeller holdes utenfor delingen ([[skjevdeling]]). Vi har ikke tatt hensyn til dette i beregningen.',
    sources: ['ekteskapsloven_skjevdeling', 'ekteskapsloven_dodsfall'],
  },
  {
    id: 'commonNegative', area: 'meaning', level: 'warning',
    when: { fact: 'commonNegative' },
    title: 'Felles formue er mindre enn gjelden',
    text: 'Hver ektefelle skal i utgangspunktet dekke sin egen gjeld. Er det avdøde som hadde det meste av gjelden, er ikke gjenlevende ansvarlig for den – med mindre gjenlevende har skrevet under på lånet. Beregningen her er derfor usikker.',
    sources: ['ekteskapsloven_deling'],
  },

  // ── Forskudd og tidligere uskifte ──
  {
    id: 'advancements', area: 'meaning', level: 'info',
    when: { fact: 'advancementsApplied' },
    title: 'Forskudd på arv er trukket fra',
    text: 'Forskuddene er lagt til det barna skal dele, og deretter trukket fra hos den som fikk dem. Har noen fått mer enn sin del, må de ikke betale tilbake.',
    more: 'Forskudd påvirker bare fordelingen mellom barna – ikke hva ektefelle eller samboer arver.',
    sources: ['arveloven_avkorting'],
  },
  {
    id: 'advancementGifts', area: 'meaning', level: 'info',
    when: { fact: 'advancementGifts' },
    title: 'Vanlige gaver trekkes ikke fra arven',
    text: 'En gave trekkes bare fra arven hvis avdøde gjorde det til en betingelse at det var forskudd på arv. Det bør helst ha vært skriftlig og kjent for de andre barna.',
    sources: ['arveloven_avkorting'],
  },
  {
    id: 'previousUskifte', area: 'meaning', level: 'warning',
    when: { fact: 'previousUskifte' },
    title: 'Uskifteboet deles mellom arvingene etter begge',
    text: 'Fordi avdøde satt i uskifte, går {firstAmount} til arvingene etter {first}. Bare resten er arv etter avdøde. Felles barn arver fra begge deler, mens barn som bare en av dem hadde, arver fra sin forelders del.',
    more: 'Arvingene etter {first}, må være i live nå for å arve – er et barn dødt, arver barnets barn i stedet. {splitRule} Har {first} skrevet testament, kan det endre fordelingen av hens del.',
    sources: ['arveloven_uskifte_deling', 'arveloven_uskifte_samboer_deling', 'arveloven_uskifte_arvinger'],
  },

  // ── Barn under 18 ──
  {
    id: 'minorHeir', area: 'meaning', level: 'info',
    when: { fact: 'minorHeir' },
    title: 'Arving under 18 år',
    text: 'Barn under 18 år representeres av vergen sin, vanligvis foreldrene. Arv til barn forvaltes som hovedregel av [[statsforvalteren]] til barnet blir 18, hvis beløpet er over en viss grense.',
    more: 'Forsørget avdøde et barn, kan barnet ha krav på et beløp til underhold og utdanning før arven fordeles ellers.',
    sources: ['arveloven_forsorgelse', 'arveloven_skifteattest'],
  },

  // ── Risiko ved skifte ──
  {
    id: 'insolvent', area: 'skifte', level: 'critical',
    when: { fact: 'insolvent' },
    title: 'Gjelden er større enn det avdøde eide',
    text: 'Dere arver ikke gjeld automatisk. Men overtar dere boet ved [[privatSkifte|privat skifte]], blir dere personlig ansvarlige for gjelden. Vurder heller [[offentligSkifte|offentlig skifte]] – eller å ikke overta boet.',
    more: 'Er verdiene i boet under tre ganger grunnbeløpet ({g3}), er ansvaret ved privat skifte begrenset til det boet eier etter at begravelsen er betalt. Tingretten kan veilede dere gratis.',
    sources: ['arveloven_privat_skifte', 'arveloven_offentlig', 'domstol_skifteformer'],
  },
  {
    id: 'smallEstate', area: 'skifte', level: 'info',
    when: { fact: 'smallEstate' },
    title: 'Boet er lite',
    text: 'Når det er lite igjen etter at begravelsen er betalt, kan tingretten gi den som ordnet begravelsen lov til å ta hånd om eiendelene, uten at noen blir ansvarlig for mer gjeld enn verdiene.',
    more: 'Dette kalles bo av liten verdi. Tingretten bruker i praksis en grense rundt 170 000 kroner i samlede verdier.',
    sources: ['arveloven_liten_verdi', 'skjema_liten_verdi'],
  },
  {
    id: 'debtLiability', area: 'skifte', level: 'info',
    when: { all: [{ not: { fact: 'insolvent' } }, { fact: 'E', gt: 0 }] },
    title: 'Den som overtar boet, tar ansvar for gjelden',
    text: 'Ved privat skifte må minst én voksen arving påta seg ansvaret for avdødes gjeld. Har dere god oversikt over gjelden, er det sjelden et problem.',
    more: 'Flere som påtar seg ansvaret, er ansvarlige sammen for hele gjelden. De andre arvingene er bare ansvarlige opp til verdien av det de arver.',
    sources: ['arveloven_privat_skifte'],
  },
  {
    id: 'debtUncertain', area: 'skifte', level: 'warning',
    when: { fact: 'debtUncertain' },
    title: 'Få oversikt over gjelden før dere overtar boet',
    text: 'Be tingretten om et [[proklama]]. Da må kreditorene melde kravene sine innen seks uker – krav som ikke meldes, faller i utgangspunktet bort. Det koster 2 959 kr i gebyr, i tillegg til annonsekostnader.',
    sources: ['skifteloven_proklama', 'skjema_proklama', 'domstol_gebyr'],
  },
  {
    id: 'disagreement', area: 'skifte', level: 'warning',
    when: { fact: 'disagreement' },
    title: 'Når arvingene er uenige',
    text: 'Ved privat skifte må arvingene være enige om alle beslutninger. Blir dere ikke enige, kan hver enkelt arving kreve [[offentligSkifte|offentlig skifte]]. Da oppnevner tingretten en [[bostyrer]] som gjør oppgjøret.',
    more: 'Offentlig skifte koster mer og tar lengre tid. Gebyret til retten og bostyrerens salær betales av boet, så det blir mindre igjen til arvingene. Ofte holder tingretten først et møte for å se om dere kan bli enige.',
    sources: ['arveloven_offentlig', 'domstol_skifteformer', 'domstol_gebyr'],
  },
  {
    id: 'unreachable', area: 'skifte', level: 'warning',
    when: { fact: 'unreachableHeir' },
    title: 'Alle arvingene må være med',
    text: 'En arving som er ukjent eller vanskelig å nå, kan gjøre privat skifte vanskelig. Tingretten kan hjelpe med å finne arvinger, og i noen tilfeller må boet skiftes offentlig.',
    sources: ['domstol_privat_skifte', 'arveloven_offentlig'],
  },
  {
    id: 'guardianship', area: 'skifte', level: 'info',
    when: { fact: 'guardianship' },
    title: 'Arving med verge',
    text: 'En arving som har verge, representeres av vergen i oppgjøret. Statsforvalteren må i enkelte tilfeller godkjenne avtaler.',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'livedAbroad', area: 'meaning', level: 'critical',
    when: { fact: 'livedAbroad' },
    title: 'Et annet lands arveregler kan gjelde',
    text: 'Bodde avdøde fast i et annet land, er det som hovedregel det landets arvelov som gjelder. Beregningen vår viser bare hva som gjelder etter norsk lov.',
    more: 'Når avdøde bodde i utlandet, er det Oslo tingrett som behandler saken hvis den skal behandles i Norge.',
    sources: ['arveloven_internasjonal', 'domstol_privat_skifte'],
  },

  // ── Uskifte ──
  {
    id: 'uskifteSeparateProperty', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'deceasedSeparateProperty' }, { fact: 'uskifteAvailable' }] },
    title: 'Særeie er ikke automatisk med i uskifte',
    text: 'Avdødes særeie kan bare være med i uskifte hvis ektepakten sier det, eller alle arvingene samtykker. Ellers må særeiet gjøres opp nå. Gjenlevende arver da som hovedregel en del av det.',
    more: 'Sitter gjenlevende i uskifte, går også gjenlevendes eget særeie inn i uskifteboet, med mindre noe annet er avtalt. Når uskifteboet deles senere, deles det etter verdiene ektefellene hadde da uskiftet startet.',
    sources: ['arveloven_uskifte', 'arveloven_uskifte_deling'],
  },
  {
    id: 'uskifteMinorConsent', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'separateChildrenMinor' }, { fact: 'uskifteAvailable' }] },
    title: 'Særkullsbarn under 18 år',
    text: 'For særkullsbarn under 18 år må både vergen og [[statsforvalteren]] samtykke til uskifte. Statsforvalteren samtykker som regel bare hvis det er til fordel for barnet.',
    sources: ['arveloven_uskifte_saerkull'],
  },
  {
    id: 'uskifteTestament', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'testamentUskifte' }, { fact: 'uskifteAvailable' }] },
    title: 'Testamentet sier noe om uskifte',
    text: 'Et testament kan begrense retten til uskifte bare hvis gjenlevende fikk vite om testamentet mens avdøde levde. Spør tingretten hvis dere er usikre på hva testamentet betyr.',
    sources: ['arveloven_uskifte_testament'],
  },
  {
    id: 'uskifteCohabitantRest', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { fact: 'uskifteAvailable' }] },
    title: 'Det er uklart om {partnerDu} også kan få 4 G nå',
    text: 'Loven sier ikke klart om en samboer som sitter i uskifte, i tillegg kan kreve arven på {g4} av eiendelene som ikke er med i uskifte. Spør tingretten før dere bestemmer dere.',
    sources: ['arveloven_uskifte_samboer', 'arveloven_uskifte_samboer_deling'],
  },
]

// Neste steg. Vises i rekkefølge, bare når `when` er oppfylt.
// `uskifteOnly`/`skifteOnly` brukes til å merke steg som bare gjelder ett av valgene.
export const NEXT_STEPS = [
  {
    id: 'findTestament',
    when: { fact: 'testamentUnknown' },
    title: 'Finn ut om det finnes et testament',
    text: 'Se gjennom avdødes papirer, og spør advokat, bank og tingretten. Tingretten kan sjekke om avdøde har levert et testament til oppbevaring der.',
    sources: ['domstol_testament'],
  },
  {
    id: 'overview',
    when: { not: { fact: 'oldLaw' } },
    title: 'Skaff oversikt over eiendeler og gjeld',
    text: 'Gå gjennom kontoutskrifter, post og avdødes siste skattemelding. Tingretten kan gi arvingene en fullmakt til å hente opplysninger fra banker og andre (formuesfullmakt).',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'proklama',
    when: { any: [{ fact: 'debtUncertain' }, { fact: 'insolvent' }] },
    title: 'Be om proklama hvis dere er usikre på gjelden',
    text: 'Kreditorene får seks uker på å melde krav. Gjør dette før dere bestemmer dere for å overta boet.',
    sources: ['skjema_proklama', 'skifteloven_proklama'],
  },
  {
    id: 'decideUskifte',
    when: { fact: 'uskifteAvailable' },
    title: 'Bestem om {partnerDu} vil sitte i uskifte eller skifte nå',
    text: 'Snakk sammen i familien. Uskifte gir trygghet i hverdagen, men betyr også ansvar for all gjelden, og at barna må vente på arven sin.',
    sources: ['domstol_uskifte', 'skjema_veiledning_uskifte'],
  },
  {
    id: 'consent',
    when: { all: [{ fact: 'uskifteAvailable' }, { fact: 'hasSeparateChildren' }, { not: { q: 'separateChildrenConsent', eq: 'notRelevant' } }] },
    title: 'Spør særkullsbarna om de samtykker',
    text: 'Særkullsbarna samtykker ved å skrive under i skjemaet om uskifte. Den som ikke samtykker, skriver under på en erklæring om arveoppgjør og får sin arv nå.',
    sources: ['arveloven_uskifte_saerkull', 'skjema_uskifte_ektefelle'],
  },
  {
    id: 'uskifteNotice',
    when: { fact: 'uskifteAvailable' },
    title: 'Hvis {partnerDu} velger uskifte: meld fra til tingretten innen 60 dager',
    text: 'Send skjemaet «Melding om uskiftet bo» til tingretten der avdøde bodde. Tingretten utsteder da en [[uskifteattest]], som viser at {partnerDu} kan disponere boet.',
    sources: ['arveloven_uskifte_frist', 'skjema_uskifte_ektefelle', 'skjema_uskifte_samboer'],
  },
  {
    id: 'soleHeir',
    when: { fact: 'partnerTakesAll' },
    title: 'Send erklæring om at {partnerDu} er eneste arving',
    text: 'Når ektefelle eller samboer arver alt, finnes det egne skjemaer for dette. Tingretten utsteder deretter skifteattest.',
    sources: ['skjema_enearving_ektefelle', 'skjema_enearving_samboer'],
  },
  {
    id: 'smallEstate',
    when: { all: [{ fact: 'smallEstate' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Vurder oppgjør som bo av liten verdi',
    text: 'Er det lite igjen etter begravelsen, kan den som ordnet begravelsen søke tingretten om å ta hånd om eiendelene på en enkel måte.',
    sources: ['skjema_liten_verdi', 'arveloven_liten_verdi'],
  },
  {
    id: 'noHeirs',
    when: { fact: 'toCharity' },
    title: 'Kontakt tingretten om oppgjøret',
    text: 'Når det ikke finnes arvinger, kan ingen overta boet ved privat skifte. Tingretten veileder om hvordan boet skal gjøres opp, og om hvordan personer som sto avdøde nær, kan søke om å få arven.',
    sources: ['arveloven_staten', 'domstol_skifteformer'],
  },
  {
    id: 'publicSkifte',
    when: { any: [{ fact: 'disagreement' }, { fact: 'insolvent' }, { fact: 'unreachableHeir' }] },
    title: 'Vurder offentlig skifte',
    text: 'Er dere uenige, er gjelden for stor, eller er det vanskelig å samle alle arvingene, kan dere be tingretten om offentlig skifte. Ta gjerne kontakt med tingretten først – de veileder gratis.',
    sources: ['arveloven_offentlig', 'domstol_skifteformer'],
  },
  {
    id: 'privateSkifte',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'oldLaw' } }, { not: { fact: 'toCharity' } }] },
    title: 'Ved privat skifte: send erklæring innen 60 dager',
    text: 'Minst én voksen arving skriver under på «Erklæring om privat skifte av dødsbo» og påtar seg ansvaret for gjelden. Tingretten utsteder da en [[skifteattest]]. Det koster ingenting.',
    sources: ['skjema_privat_skifte', 'arveloven_privat_frist', 'arveloven_skifteattest'],
  },
  {
    id: 'divide',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'toCharity' } }] },
    title: 'Fordel eiendelene og gjør opp boet',
    text: 'Med skifteattesten kan dere betale gjeld, selge eller overta eiendeler og fordele resten. Skriv ned hvem som får hva i et skifteoppgjør som alle arvingene signerer. Arvklart kan hjelpe dere med å fordele eiendelene rettferdig.',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'register',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'toCharity' } }] },
    title: 'Overfør eierskap og avslutt',
    text: 'Bolig og fritidsbolig må tinglyses på ny eier hos Kartverket, og kjøretøy omregistreres hos Statens vegvesen. Husk også avdødes skattemelding for dødsåret.',
    sources: [],
  },
]
