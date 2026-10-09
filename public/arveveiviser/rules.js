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
    title: 'Ektefellen arver en fjerdedel', title_en: 'The spouse inherits a quarter',
    text: 'Når avdøde hadde barn, arver gjenlevende ektefelle en fjerdedel av avdødes formue. Barna deler resten likt.', text_en: 'When the deceased had children, the surviving spouse inherits a quarter of the deceased\'s estate. The children share the rest equally.',
    more: 'Ektefellen har uansett rett til minst fire ganger grunnbeløpet ({g4}). Her er en fjerdedel mer enn det, så det er en fjerdedel som gjelder.', more_en: 'The spouse is in any case entitled to at least four times the basic amount ({g4}). Here a quarter is more than that, so the quarter applies.',
    sources: ['arveloven_ektefelle', 'domstol_hva_arver'],
  },
  {
    id: 'spouseMin4G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 1 }, { fact: 'partnerBasis', eq: 'min4G' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Ektefellen har rett til en minstearv', title_en: 'The spouse is entitled to a minimum inheritance',
    text: 'Ektefellen arver minst fire ganger grunnbeløpet ({g4}), selv om det er mer enn en fjerdedel. Denne [[minstearv|minstearven]] går foran barnas arv.', text_en: 'The spouse inherits at least four times the basic amount ({g4}), even if that is more than a quarter. This [[minstearv|minimum inheritance]] takes priority over the children\'s inheritance.',
    sources: ['arveloven_ektefelle', 'nav_g'],
  },
  {
    id: 'spouseTakesAllMin', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 1 }, { fact: 'partnerTakesAll' }] },
    title: 'Ektefellen arver alt', title_en: 'The spouse inherits everything',
    text: 'Det avdøde etterlot seg er mindre enn minstearven til ektefellen ({g4}). Derfor arver ektefellen alt, og barna arver ikke noe etter avdøde nå.', text_en: 'What the deceased left is less than the spouse\'s minimum inheritance ({g4}). The spouse therefore inherits everything, and the children inherit nothing from the deceased now.',
    more: 'Felles barn arver i stedet etter gjenlevende når hen dør. Barna har likevel enkelte rettigheter, for eksempel til å be om oversikt over formuen og å kreve proklama.', more_en: 'Joint children instead inherit from the survivor when the survivor dies. The children still have certain rights, for example to ask for an overview of the assets and to request a proklama.',
    sources: ['arveloven_ektefelle'],
  },
  {
    id: 'spouseTakesAllSeparateChildren', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'partnerTakesAll' }, { fact: 'hasSeparateChildren' }] },
    title: 'Særkullsbarna kan bli uten arv', title_en: 'Children from another relationship may receive no inheritance',
    text: 'Et [[saerkullsbarn|særkullsbarn]] arver ikke etter gjenlevende ektefelle eller samboer. Når gjenlevende arver alt, får særkullsbarna derfor ingen arv etter forelderen sin.', text_en: 'A [[saerkullsbarn|child from another relationship]] does not inherit from the surviving spouse or cohabitant. When the survivor inherits everything, such children therefore receive no inheritance from their parent.',
    sources: ['arveloven_ektefelle', 'arveloven_samboer_arv'],
  },
  {
    id: 'spouseHalf', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 2 }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Ektefellen arver halvparten', title_en: 'The spouse inherits half',
    text: 'Avdøde hadde ikke barn. Da arver ektefellen halvparten, men alltid minst seks ganger grunnbeløpet ({g6}). Resten går til avdødes foreldre – eller søsken, nevøer og nieser hvis en forelder er død.', text_en: 'The deceased had no children. The spouse then inherits half, but always at least six times the basic amount ({g6}). The rest goes to the deceased\'s parents – or to siblings, nephews and nieces if a parent has died.',
    sources: ['arveloven_ektefelle_uten_barn', 'arveloven_andre_arvegang'],
  },
  {
    id: 'spouseTakesAllMin6G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 2 }, { fact: 'partnerTakesAll' }] },
    title: 'Ektefellen arver alt', title_en: 'The spouse inherits everything',
    text: 'Det avdøde etterlot seg er mindre enn ektefellens minstearv på seks ganger grunnbeløpet ({g6}). Derfor arver ektefellen alt.', text_en: 'What the deceased left is less than the spouse\'s minimum inheritance of six times the basic amount ({g6}). The spouse therefore inherits everything.',
    sources: ['arveloven_ektefelle_uten_barn'],
  },
  {
    id: 'spouseAll', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'married' }, { fact: 'order', eq: 0 }] },
    title: 'Ektefellen arver alt', title_en: 'The spouse inherits everything',
    text: 'Avdøde etterlot seg verken barn, foreldre, søsken eller nevøer og nieser. Da arver ektefellen alt – besteforeldre, tanter og onkler arver ikke når det er en ektefelle.', text_en: 'The deceased left no children, parents, siblings, nephews or nieces. The spouse then inherits everything – grandparents, aunts and uncles do not inherit when there is a spouse.',
    sources: ['arveloven_ektefelle_uten_barn'],
  },
  {
    id: 'cohabitant4G', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Samboeren arver fire ganger grunnbeløpet', title_en: 'The cohabitant inherits four times the basic amount',
    text: 'Fordi {couple} har eller har hatt barn sammen, arver {partnerDu} {g4} (fire ganger grunnbeløpet). Resten går til avdødes barn, som deler likt.', text_en: 'Because {couple} have or have had children together, {partnerDu} inherit(s) {g4} (four times the basic amount). The rest goes to the deceased\'s children, who share equally.',
    more: 'Avdøde kunne bare begrense samboerens arv i et testament hvis samboeren fikk vite om testamentet mens avdøde levde.', more_en: 'The deceased could only limit the cohabitant\'s inheritance in a will if the cohabitant learned about the will while the deceased was alive.',
    sources: ['arveloven_samboer_arv', 'domstol_hva_arver'],
  },
  {
    id: 'cohabitantTakesAll', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { fact: 'partnerTakesAll' }] },
    title: 'Samboeren arver alt', title_en: 'The cohabitant inherits everything',
    text: 'Det avdøde etterlot seg er mindre enn samboerens arv på fire ganger grunnbeløpet ({g4}). Derfor arver samboeren alt.', text_en: 'What the deceased left is less than the cohabitant\'s inheritance of four times the basic amount ({g4}). The cohabitant therefore inherits everything.',
    sources: ['arveloven_samboer_arv'],
  },
  {
    id: 'cohabitantNoChildren', area: 'meaning', level: 'warning',
    when: { fact: 'cohabitantNoChildren' },
    title: 'Samboere uten felles barn arver ikke hverandre etter loven', title_en: 'Cohabitants without children together do not inherit from each other under the law',
    text: 'Uten felles barn har samboeren ikke rett til arv eller til å sitte i uskifte. Samboeren kan bare arve hvis det står i et testament.', text_en: 'Without children together, the cohabitant has no right to inherit or to keep an undivided estate. The cohabitant can only inherit if a will says so.',
    more: 'Har samboerne bodd sammen de siste fem årene, kan et testament gi samboeren inntil {g4} – også når det går ut over barnas pliktdelsarv. Etter minst to års samboerskap kan samboeren i noen tilfeller ha rett til å overta felles bolig og innbo mot å betale for det.', more_en: 'If the cohabitants have lived together for the last five years, a will can give the cohabitant up to {g4} – even when this reduces the children\'s compulsory share. After at least two years of cohabitation, the cohabitant may in some cases have the right to take over the joint home and contents against payment.',
    sources: ['arveloven_samboer_arv', 'arveloven_testament_samboer'],
  },
  {
    id: 'separated', area: 'meaning', level: 'warning',
    when: { q: 'maritalStatus', eq: 'separated' },
    title: 'Separerte ektefeller arver ikke hverandre', title_en: 'Separated spouses do not inherit from each other',
    text: 'Når det var søkt om separasjon eller skilsmisse før dødsfallet, har den andre ektefellen ikke rett til arv eller uskifte etter loven. Et testament til ektefellen faller normalt også bort.', text_en: 'When separation or divorce had been applied for before the death, the other spouse has no statutory right to inherit or to an undivided estate. A will in favour of the spouse normally also lapses.',
    more: 'Dette gjelder når begjæringen var mottatt av statsforvalteren eller retten før dødsfallet. Felles formue skal likevel deles mellom gjenlevende og dødsboet etter reglene i ekteskapsloven – snakk med tingretten om hvordan.', more_en: 'This applies when the application had been received by the County Governor or the court before the death. Joint property must still be divided between the survivor and the estate under the Marriage Act – talk to the district court about how.',
    sources: ['arveloven_separasjon'],
  },

  // ── Barn og slekt ──
  {
    id: 'childrenEqual', area: 'meaning', level: 'info',
    // Ved tidligere uskifte arver felles barn også etter den som døde først – forklares i previousUskifte.
    when: { all: [{ fact: 'order', eq: 1 }, { fact: 'lineCount', gt: 1 }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'previousUskifte' } }] },
    title: 'Barna arver likt', title_en: 'The children inherit equally',
    text: 'Alle barna til avdøde arver like mye – uansett om de er felles barn, særkullsbarn eller adoptivbarn.', text_en: 'All the deceased\'s children inherit the same amount – whether they are joint children, children from another relationship or adopted children.',
    sources: ['arveloven_livsarvinger'],
  },
  {
    id: 'representation', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'order', eq: 1 }, { fact: 'representation' }] },
    title: 'Barnebarn arver i stedet for et barn som er dødt', title_en: 'Grandchildren inherit in place of a child who has died',
    text: 'Er et av barna dødt, går den delen barnet ville fått, videre til barnets egne barn. De deler likt.', text_en: 'If one of the children has died, the share that child would have received passes on to the child\'s own children. They share equally.',
    more: 'Er også et barnebarn dødt, går delen videre til barnebarnets barn. Veiviseren regner bare ett ledd ned – gi beskjed til tingretten hvis det gjelder dere.', more_en: 'If a grandchild has also died, the share passes on to the grandchild\'s children. The guide only calculates one generation down – tell the district court if this applies to you.',
    sources: ['arveloven_livsarvinger'],
  },
  {
    id: 'separateChildren', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'hasSeparateChildren' }, { fact: 'partnerInherits' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Særkullsbarn har de samme rettighetene som felles barn', title_en: 'Children from another relationship have the same rights as joint children',
    text: 'Et [[saerkullsbarn|særkullsbarn]] arver like mye som de andre barna. Men særkullsbarn arver ikke etter gjenlevende senere. Derfor må de samtykke hvis gjenlevende vil sitte i uskifte.', text_en: 'A [[saerkullsbarn|child from another relationship]] inherits the same as the other children. But such children do not inherit from the survivor later. That is why they must consent if the survivor wants to keep an undivided estate.',
    sources: ['arveloven_uskifte_saerkull', 'domstol_hva_arver'],
  },
  {
    id: 'parentsInherit', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'order', eq: 2 }, { not: { fact: 'married' } }] },
    title: 'Foreldrene og deres familie arver', title_en: 'The parents and their family inherit',
    text: 'Avdøde hadde ikke barn. Da arver foreldrene halvparten hver. Er en forelder død, går den halvparten til avdødes søsken på den siden – og videre til nevøer og nieser hvis et søsken er dødt.', text_en: 'The deceased had no children. The parents then inherit half each. If a parent has died, that half goes to the deceased\'s siblings on that side – and on to nephews and nieces if a sibling has died.',
    more: 'Halvsøsken arver bare fra den siden de har felles med avdøde. Har den ene forelderen verken levende foreldre eller etterkommere, går alt til den andre siden.', more_en: 'Half-siblings only inherit from the side they share with the deceased. If one parent has neither living parents nor descendants, everything goes to the other side.',
    sources: ['arveloven_andre_arvegang', 'domstol_hvem_arver'],
  },
  {
    id: 'under25Parents', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'order', eq: 2 }, { fact: 'parentDead' }] },
    title: 'Særregel hvis avdøde var under 25 år', title_en: 'Special rule if the deceased was under 25',
    text: 'Var avdøde under 25 år, og foreldrene verken var gift eller samboere da en av dem døde, kan halvparten gå til besteforeldrene på den døde forelderens side i stedet. Veiviseren tar ikke hensyn til dette.', text_en: 'If the deceased was under 25, and the parents were neither married nor cohabiting when one of them died, half may go to the grandparents on the deceased parent\'s side instead. The guide does not take this into account.',
    sources: ['arveloven_andre_arvegang'],
  },
  {
    id: 'grandparentsInherit', area: 'meaning', level: 'info',
    when: { fact: 'order', eq: 3 },
    title: 'Besteforeldrene og deres familie arver', title_en: 'The grandparents and their family inherit',
    text: 'Når det verken finnes barn, foreldre, søsken, nevøer eller nieser, går arven halvt til farssiden og halvt til morssiden. Der arver besteforeldrene – eller tanter, onkler og søskenbarn i stedet for en besteforelder som er død.', text_en: 'When there are no children, parents, siblings, nephews or nieces, the inheritance goes half to the father\'s side and half to the mother\'s side. There the grandparents inherit – or aunts, uncles and cousins in place of a grandparent who has died.',
    sources: ['arveloven_tredje_arvegang', 'domstol_hvem_arver'],
  },
  {
    id: 'toCharity', area: 'meaning', level: 'warning',
    when: { fact: 'toCharity' },
    title: 'Det finnes ingen arvinger etter loven', title_en: 'There are no heirs under the law',
    text: 'Uten testament går arven til frivillig arbeid for barn og unge. Personer som sto avdøde nær, kan søke departementet om å få hele eller deler av arven.', text_en: 'Without a will, the inheritance goes to voluntary work for children and young people. People who were close to the deceased can apply to the ministry for all or part of the inheritance.',
    sources: ['arveloven_staten'],
  },

  // ── Testament ──
  {
    id: 'compulsoryShare', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'testament' }, { fact: 'order', eq: 1 }, { fact: 'E', gt: 0 }] },
    title: 'Barna har krav på en minstedel, uansett testament', title_en: 'The children are entitled to a minimum share, whatever the will says',
    text: 'Hvert barn har krav på minst {pliktPerLine}. Det er barnets [[pliktdel|pliktdelsarv]]. Testamentet kan bare bestemme fritt over {freePart}.', text_en: 'Each child is entitled to at least {pliktPerLine}. That is the child\'s [[pliktdel|compulsory share]]. The will can only freely decide over {freePart}.',
    more: 'Pliktdelsarven er to tredjedeler av det barna arver etter loven, men aldri mer enn 15 ganger grunnbeløpet ({g15}) per barn. Har et barn dødd, deler barnebarna den delen.', more_en: 'The compulsory share is two thirds of what the children inherit under the law, but never more than 15 times the basic amount ({g15}) per child. If a child has died, the grandchildren share that part.',
    sources: ['arveloven_pliktdel'],
  },
  {
    id: 'testamentExceeds', area: 'meaning', level: 'critical',
    when: { fact: 'testamentExceeds' },
    title: 'Testamentet gir bort mer enn loven tillater', title_en: 'The will gives away more than the law allows',
    text: 'Testamentet gir bort omtrent {testamentWanted}, men kan bare bestemme over {testamentMax}. I beregningen har vi redusert gavene til det som er lov. Mottakerne i testamentet bør få vite dette.', text_en: 'The will gives away about {testamentWanted}, but can only decide over {testamentMax}. In the calculation we have reduced the gifts to what is allowed. The beneficiaries under the will should be told about this.',
    sources: ['arveloven_pliktdel', 'arveloven_ektefelle'],
  },
  {
    id: 'testamentUneven', area: 'meaning', level: 'warning',
    when: { fact: 'testamentUneven' },
    title: 'Testamentet kan endre fordelingen mellom arvingene', title_en: 'The will can change the distribution between the heirs',
    text: 'Fordelingen vi viser, er lovens hovedregel. Testamentet kan gi noen mer eller gi dem bestemte ting, så lenge alle barna får minst pliktdelsarven sin, og ektefelle eller samboer får sin minstearv.', text_en: 'The distribution we show is the main rule of the law. The will can give someone more or give them specific items, as long as all the children receive at least their compulsory share, and the spouse or cohabitant receives their minimum inheritance.',
    sources: ['arveloven_pliktdel'],
  },
  {
    id: 'testamentLimitsPartnerKnew', area: 'meaning', level: 'info',
    when: { all: [{ fact: 'testamentLimitsPartner' }, { q: 'testamentPartnerKnew', eq: 'yes' }] },
    title: 'Testamentet begrenser arven til {partnerDeg}', title_en: 'The will limits the inheritance for {partnerDeg}',
    text: 'Fordi {partnerDu} visste om testamentet, kan det gi mindre enn loven ellers sier. Minstearven er likevel beskyttet, og her blir arven {partnerAmount}.', text_en: 'Because {partnerDu} knew about the will, it can give less than the law otherwise says. The minimum inheritance is still protected, and here the inheritance is {partnerAmount}.',
    sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'],
  },
  {
    id: 'testamentLimitsPartnerNotKnew', area: 'meaning', level: 'warning',
    when: { all: [{ fact: 'testamentLimitsPartner' }, { q: 'testamentPartnerKnew', ne: 'yes' }] },
    title: 'Testamentet kan trolig ikke redusere arven til {partnerDeg}', title_en: 'The will probably cannot reduce the inheritance for {partnerDeg}',
    text: 'Et testament kan bare gi ektefelle eller samboer mindre enn loven sier, hvis de fikk vite om testamentet mens avdøde levde. Vi har derfor regnet med full arv etter loven.', text_en: 'A will can only give a spouse or cohabitant less than the law says if they learned about the will while the deceased was alive. We have therefore calculated with the full statutory inheritance.',
    sources: ['arveloven_testament_ektefelle', 'arveloven_testament_samboer'],
  },
  {
    id: 'testamentCohabitant', area: 'meaning', level: 'info',
    when: { fact: 'testamentToCohabitant' },
    title: 'Testament til samboeren', title_en: 'Will in favour of the cohabitant',
    text: 'En samboer uten felles barn arver bare det testamentet gir. Har {couple} bodd sammen de siste fem årene, kan inntil {g4} gis selv om det går ut over barnas pliktdelsarv. Ellers kan samboeren bare få det testamentet fritt kan bestemme over.', text_en: 'A cohabitant without children together inherits only what the will gives. If {couple} have lived together for the last five years, up to {g4} can be given even if it reduces the children\'s compulsory share. Otherwise the cohabitant can only receive what the will can freely decide over.',
    sources: ['arveloven_testament_samboer', 'arveloven_pliktdel'],
  },
  {
    id: 'testamentSeparateClause', area: 'meaning', level: 'info',
    when: { fact: 'testamentSeparateClause' },
    title: 'Arv som særeie endrer ikke fordelingen', title_en: 'Inheritance as separate property does not change the distribution',
    text: 'At arven skal være mottakerens særeie, betyr at den holdes utenfor hvis mottakeren skiller seg. Det endrer ikke hvor mye hver arving får.', text_en: 'That the inheritance is to be the recipient\'s separate property means it is kept out if the recipient divorces. It does not change how much each heir receives.',
    sources: ['ekteskapsloven_saereie'],
  },
  {
    id: 'testamentOther', area: 'meaning', level: 'warning',
    when: { fact: 'testamentOther' },
    title: 'Testamentet kan påvirke beregningen', title_en: 'The will may affect the calculation',
    text: 'Er du usikker på hva testamentet betyr, bør du få juridisk hjelp eller spørre tingretten før dere fordeler arven. Beregningen vår bygger på lovens hovedregler.', text_en: 'If you are unsure what the will means, you should get legal help or ask the district court before you distribute the inheritance. Our calculation is based on the main rules of the law.',
    sources: ['domstol_testament'],
  },
  {
    id: 'testamentNotify', area: 'meaning', level: 'info',
    when: { any: [{ fact: 'testamentGiveaway' }, { fact: 'testamentToCohabitant' }] },
    title: 'Mottakere i testamentet bør melde seg til tingretten', title_en: 'Beneficiaries under the will should contact the district court',
    text: 'Den som får noe etter et testament, bør melde fra til tingretten innen seks måneder etter at de fikk vite om dødsfallet og testamentet. Ellers kan retten til arven falle bort.', text_en: 'Anyone who receives something under a will should notify the district court within six months of learning about the death and the will. Otherwise the right to the inheritance may be lost.',
    sources: ['arveloven_testament_melding'],
  },

  // ── Ektepakt og deling ──
  {
    id: 'separateProperty', area: 'meaning', level: 'info',
    when: { fact: 'separateProperty' },
    title: 'Særeie holdes utenfor delingen', title_en: 'Separate property is kept out of the division',
    text: 'Avdødes særeie går i sin helhet inn i dødsboet. Gjenlevendes særeie beholder gjenlevende. Bare felles formue deles i to.', text_en: 'The deceased\'s separate property goes in full into the estate. The survivor keeps their own separate property. Only joint property is split in two.',
    sources: ['ekteskapsloven_saereie', 'ekteskapsloven_deling'],
  },
  {
    id: 'separatePropertyUnknown', area: 'meaning', level: 'warning',
    when: { fact: 'separatePropertyUnknown' },
    title: 'Sjekk om det finnes en ektepakt', title_en: 'Check whether there is a marital agreement',
    text: 'Vi har regnet som om alt var felles formue. Finnes det en ektepakt om særeie, kan fordelingen bli en annen. Ektepakter er registrert i Ektepaktregisteret.', text_en: 'We have calculated as if everything was joint property. If there is a marital agreement about separate property, the distribution may be different. Marital agreements are registered in the Register of Marriage Settlements.',
    sources: ['ektepaktregisteret', 'ekteskapsloven_saereie'],
  },
  {
    id: 'skjevdeling', area: 'meaning', level: 'warning',
    when: { fact: 'skjevdelingResult' },
    title: 'Skjevdeling kan endre fordelingen', title_en: 'Skjevdeling may change the distribution',
    text: 'Hvis verdiene fra før ekteskapet, arv og gaver holdes utenfor delingen, blir det som skal arves omtrent {skjevE} i stedet for {E}. Både gjenlevende og arvingene kan kreve skjevdeling.', text_en: 'If the assets from before the marriage, inheritance and gifts are kept out of the division, what is inherited becomes about {skjevE} instead of {E}. Both the survivor and the heirs can claim skjevdeling.',
    more: 'Det må kunne dokumenteres at verdiene fortsatt finnes, for eksempel i den samme boligen. Skjevdeling må kreves – det skjer ikke av seg selv. Det kan ikke kreves når et uskiftebo deles senere.', more_en: 'It must be possible to document that the assets still exist, for example in the same home. Skjevdeling must be claimed – it does not happen by itself. It cannot be claimed when an undivided estate is divided later.',
    sources: ['ekteskapsloven_skjevdeling', 'ekteskapsloven_dodsfall'],
  },
  {
    id: 'skjevdelingNoAmount', area: 'meaning', level: 'warning',
    when: { any: [{ fact: 'skjevdelingUnknown' }, { all: [{ fact: 'skjevdeling' }, { not: { fact: 'skjevdelingResult' } }] }] },
    title: 'Verdier fra før ekteskapet kan påvirke delingen', title_en: 'Assets from before the marriage may affect the division',
    text: 'Verdier en av dere hadde før ekteskapet, eller har arvet eller fått i gave, kan i mange tilfeller holdes utenfor delingen ([[skjevdeling]]). Vi har ikke tatt hensyn til dette i beregningen.', text_en: 'Assets one of you had before the marriage, or has inherited or received as a gift, can in many cases be kept out of the division ([[skjevdeling]]). We have not taken this into account in the calculation.',
    sources: ['ekteskapsloven_skjevdeling', 'ekteskapsloven_dodsfall'],
  },
  {
    id: 'commonNegative', area: 'meaning', level: 'warning',
    when: { fact: 'commonNegative' },
    title: 'Felles formue er mindre enn gjelden', title_en: 'Joint property is less than the debt',
    text: 'Hver ektefelle skal i utgangspunktet dekke sin egen gjeld. Er det avdøde som hadde det meste av gjelden, er ikke gjenlevende ansvarlig for den – med mindre gjenlevende har skrevet under på lånet. Beregningen her er derfor usikker.', text_en: 'As a starting point, each spouse covers their own debt. If the deceased had most of the debt, the survivor is not liable for it – unless the survivor signed the loan. The calculation here is therefore uncertain.',
    sources: ['ekteskapsloven_deling'],
  },

  // ── Forskudd og tidligere uskifte ──
  {
    id: 'advancements', area: 'meaning', level: 'info',
    when: { fact: 'advancementsApplied' },
    title: 'Forskudd på arv er trukket fra', title_en: 'Advances on inheritance have been deducted',
    text: 'Forskuddene er lagt til det barna skal dele, og deretter trukket fra hos den som fikk dem. Har noen fått mer enn sin del, må de ikke betale tilbake.', text_en: 'The advances have been added to what the children share, and then deducted from the person who received them. If someone has received more than their share, they do not have to pay it back.',
    more: 'Forskudd påvirker bare fordelingen mellom barna – ikke hva ektefelle eller samboer arver.', more_en: 'Advances only affect the distribution between the children – not what the spouse or cohabitant inherits.',
    sources: ['arveloven_avkorting'],
  },
  {
    id: 'advancementGifts', area: 'meaning', level: 'info',
    when: { fact: 'advancementGifts' },
    title: 'Vanlige gaver trekkes ikke fra arven', title_en: 'Ordinary gifts are not deducted from the inheritance',
    text: 'En gave trekkes bare fra arven hvis avdøde gjorde det til en betingelse at det var forskudd på arv. Det bør helst ha vært skriftlig og kjent for de andre barna.', text_en: 'A gift is only deducted from the inheritance if the deceased made it a condition that it was an advance on inheritance. Ideally this should have been in writing and known to the other children.',
    sources: ['arveloven_avkorting'],
  },
  {
    id: 'previousUskifte', area: 'meaning', level: 'warning',
    when: { fact: 'previousUskifte' },
    title: 'Uskifteboet deles mellom arvingene etter begge', title_en: 'The undivided estate is divided between the heirs of both',
    text: 'Fordi avdøde satt i uskifte, går {firstAmount} til arvingene etter {first}. Bare resten er arv etter avdøde. Felles barn arver fra begge deler, mens barn som bare en av dem hadde, arver fra sin forelders del.', text_en: 'Because the deceased kept an undivided estate, {firstAmount} goes to the heirs of {first}. Only the rest is inheritance from the deceased. Joint children inherit from both parts, while children only one of them had inherit from their own parent\'s part.',
    more: 'Arvingene etter {first}, må være i live nå for å arve – er et barn dødt, arver barnets barn i stedet. {splitRule} Har {first} skrevet testament, kan det endre fordelingen av hens del.', more_en: 'The heirs of {first} must be alive now to inherit – if a child has died, that child\'s children inherit instead. {splitRule} If {first} wrote a will, it can change the distribution of their part.',
    sources: ['arveloven_uskifte_deling', 'arveloven_uskifte_samboer_deling', 'arveloven_uskifte_arvinger'],
  },

  // ── Barn under 18 ──
  {
    id: 'minorHeir', area: 'meaning', level: 'info',
    when: { fact: 'minorHeir' },
    title: 'Arving under 18 år', title_en: 'Heir under 18',
    text: 'Barn under 18 år representeres av vergen sin, vanligvis foreldrene. Arv til barn forvaltes som hovedregel av [[statsforvalteren]] til barnet blir 18, hvis beløpet er over en viss grense.', text_en: 'Children under 18 are represented by their guardian, usually the parents. Inheritance to children is as a main rule managed by [[statsforvalteren|the County Governor]] until the child turns 18, if the amount is above a certain limit.',
    more: 'Forsørget avdøde et barn, kan barnet ha krav på et beløp til underhold og utdanning før arven fordeles ellers.', more_en: 'If the deceased supported a child, the child may be entitled to an amount for maintenance and education before the inheritance is otherwise distributed.',
    sources: ['arveloven_forsorgelse', 'arveloven_skifteattest'],
  },

  // ── Risiko ved skifte ──
  {
    id: 'insolvent', area: 'skifte', level: 'critical',
    when: { fact: 'insolvent' },
    title: 'Gjelden er større enn det avdøde eide', title_en: 'The debts are larger than what the deceased owned',
    text: 'Dere arver ikke gjeld automatisk. Men overtar dere boet ved [[privatSkifte|privat skifte]], blir dere personlig ansvarlige for gjelden. Vurder heller [[offentligSkifte|offentlig skifte]] – eller å ikke overta boet.', text_en: 'You do not inherit debts automatically. But if you take over the estate in a [[privatSkifte|private settlement]], you become personally liable for the debts. Consider [[offentligSkifte|public administration]] instead – or not taking over the estate.',
    more: 'Er verdiene i boet under tre ganger grunnbeløpet ({g3}), er ansvaret ved privat skifte begrenset til det boet eier etter at begravelsen er betalt. Tingretten kan veilede dere gratis.', more_en: 'If the values in the estate are below three times the basic amount ({g3}), liability in a private settlement is limited to what the estate owns after the funeral has been paid. The district court can guide you free of charge.',
    sources: ['arveloven_privat_skifte', 'arveloven_offentlig', 'domstol_skifteformer'],
  },
  {
    id: 'smallEstate', area: 'skifte', level: 'info',
    when: { fact: 'smallEstate' },
    title: 'Boet er lite', title_en: 'The estate is small',
    text: 'Når det er lite igjen etter at begravelsen er betalt, kan tingretten gi den som ordnet begravelsen lov til å ta hånd om eiendelene, uten at noen blir ansvarlig for mer gjeld enn verdiene.', text_en: 'When little is left after the funeral has been paid, the district court can allow the person who arranged the funeral to take care of the belongings, without anyone becoming liable for more debt than the values.',
    more: 'Dette kalles bo av liten verdi. Tingretten bruker i praksis en grense rundt 170 000 kroner i samlede verdier.', more_en: 'This is called an estate of small value. In practice the district court uses a limit of around NOK 170,000 in total values.',
    sources: ['arveloven_liten_verdi', 'skjema_liten_verdi'],
  },
  {
    id: 'debtLiability', area: 'skifte', level: 'info',
    when: { all: [{ not: { fact: 'insolvent' } }, { fact: 'E', gt: 0 }] },
    title: 'Den som overtar boet, tar ansvar for gjelden', title_en: 'Whoever takes over the estate takes responsibility for the debts',
    text: 'Ved privat skifte må minst én voksen arving påta seg ansvaret for avdødes gjeld. Har dere god oversikt over gjelden, er det sjelden et problem.', text_en: 'In a private settlement, at least one adult heir must take on responsibility for the deceased\'s debts. If you have a good overview of the debts, this is rarely a problem.',
    more: 'Flere som påtar seg ansvaret, er ansvarlige sammen for hele gjelden. De andre arvingene er bare ansvarlige opp til verdien av det de arver.', more_en: 'Several people who take on the responsibility are jointly liable for all the debts. The other heirs are only liable up to the value of what they inherit.',
    sources: ['arveloven_privat_skifte'],
  },
  {
    id: 'debtUncertain', area: 'skifte', level: 'warning',
    when: { fact: 'debtUncertain' },
    title: 'Få oversikt over gjelden før dere overtar boet', title_en: 'Get an overview of the debts before you take over the estate',
    text: 'Be tingretten om et [[proklama]]. Da må kreditorene melde kravene sine innen seks uker – krav som ikke meldes, faller i utgangspunktet bort. Det koster 2 959 kr i gebyr, i tillegg til annonsekostnader.', text_en: 'Ask the district court for a [[proklama]]. Creditors must then report their claims within six weeks – claims not reported in principle lapse. It costs a fee of NOK 2,959, plus advertising costs.',
    sources: ['skifteloven_proklama', 'skjema_proklama', 'domstol_gebyr'],
  },
  {
    id: 'disagreement', area: 'skifte', level: 'warning',
    when: { fact: 'disagreement' },
    title: 'Når arvingene er uenige', title_en: 'When the heirs disagree',
    text: 'Ved privat skifte må arvingene være enige om alle beslutninger. Blir dere ikke enige, kan hver enkelt arving kreve [[offentligSkifte|offentlig skifte]]. Da oppnevner tingretten en [[bostyrer]] som gjør oppgjøret.', text_en: 'In a private settlement, the heirs must agree on all decisions. If you cannot agree, each heir can demand [[offentligSkifte|public administration]]. The district court then appoints an [[bostyrer|administrator]] who carries out the settlement.',
    more: 'Offentlig skifte koster mer og tar lengre tid. Gebyret til retten og bostyrerens salær betales av boet, så det blir mindre igjen til arvingene. Ofte holder tingretten først et møte for å se om dere kan bli enige.', more_en: 'Public administration costs more and takes longer. The court fee and the administrator\'s fee are paid by the estate, so less is left for the heirs. The district court often first holds a meeting to see whether you can agree.',
    sources: ['arveloven_offentlig', 'domstol_skifteformer', 'domstol_gebyr'],
  },
  {
    id: 'unreachable', area: 'skifte', level: 'warning',
    when: { fact: 'unreachableHeir' },
    title: 'Alle arvingene må være med', title_en: 'All the heirs must take part',
    text: 'En arving som er ukjent eller vanskelig å nå, kan gjøre privat skifte vanskelig. Tingretten kan hjelpe med å finne arvinger, og i noen tilfeller må boet skiftes offentlig.', text_en: 'An heir who is unknown or hard to reach can make a private settlement difficult. The district court can help find heirs, and in some cases the estate must be administered publicly.',
    sources: ['domstol_privat_skifte', 'arveloven_offentlig'],
  },
  {
    id: 'guardianship', area: 'skifte', level: 'info',
    when: { fact: 'guardianship' },
    title: 'Arving med verge', title_en: 'Heir with a guardian',
    text: 'En arving som har verge, representeres av vergen i oppgjøret. Statsforvalteren må i enkelte tilfeller godkjenne avtaler.', text_en: 'An heir who has a guardian is represented by the guardian in the settlement. In some cases the County Governor must approve agreements.',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'livedAbroad', area: 'meaning', level: 'critical',
    when: { fact: 'livedAbroad' },
    title: 'Et annet lands arveregler kan gjelde', title_en: 'Another country\'s inheritance rules may apply',
    text: 'Bodde avdøde fast i et annet land, er det som hovedregel det landets arvelov som gjelder. Beregningen vår viser bare hva som gjelder etter norsk lov.', text_en: 'If the deceased was permanently resident in another country, as a main rule that country\'s inheritance law applies. Our calculation only shows what applies under Norwegian law.',
    more: 'Når avdøde bodde i utlandet, er det Oslo tingrett som behandler saken hvis den skal behandles i Norge.', more_en: 'When the deceased lived abroad, Oslo District Court handles the case if it is to be handled in Norway.',
    sources: ['arveloven_internasjonal', 'domstol_privat_skifte'],
  },

  // ── Uskifte ──
  {
    id: 'uskifteSeparateProperty', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'deceasedSeparateProperty' }, { fact: 'uskifteAvailable' }] },
    title: 'Særeie er ikke automatisk med i uskifte', title_en: 'Separate property is not automatically part of an undivided estate',
    text: 'Avdødes særeie kan bare være med i uskifte hvis ektepakten sier det, eller alle arvingene samtykker. Ellers må særeiet gjøres opp nå. Gjenlevende arver da som hovedregel en del av det.', text_en: 'The deceased\'s separate property can only be part of an undivided estate if the marital agreement says so, or all the heirs consent. Otherwise the separate property must be settled now. The survivor then as a main rule inherits part of it.',
    more: 'Sitter gjenlevende i uskifte, går også gjenlevendes eget særeie inn i uskifteboet, med mindre noe annet er avtalt. Når uskifteboet deles senere, deles det etter verdiene ektefellene hadde da uskiftet startet.', more_en: 'If the survivor keeps an undivided estate, the survivor\'s own separate property also goes into the undivided estate, unless otherwise agreed. When the undivided estate is divided later, it is divided according to the values the spouses had when it started.',
    sources: ['arveloven_uskifte', 'arveloven_uskifte_deling'],
  },
  {
    id: 'uskifteMinorConsent', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'separateChildrenMinor' }, { fact: 'uskifteAvailable' }] },
    title: 'Særkullsbarn under 18 år', title_en: 'Children from another relationship under 18',
    text: 'For særkullsbarn under 18 år må både vergen og [[statsforvalteren]] samtykke til uskifte. Statsforvalteren samtykker som regel bare hvis det er til fordel for barnet.', text_en: 'For such children under 18, both the guardian and [[statsforvalteren|the County Governor]] must consent to an undivided estate. The County Governor usually only consents if it benefits the child.',
    sources: ['arveloven_uskifte_saerkull'],
  },
  {
    id: 'uskifteTestament', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'testamentUskifte' }, { fact: 'uskifteAvailable' }] },
    title: 'Testamentet sier noe om uskifte', title_en: 'The will says something about an undivided estate',
    text: 'Et testament kan begrense retten til uskifte bare hvis gjenlevende fikk vite om testamentet mens avdøde levde. Spør tingretten hvis dere er usikre på hva testamentet betyr.', text_en: 'A will can only limit the right to an undivided estate if the survivor learned about the will while the deceased was alive. Ask the district court if you are unsure what the will means.',
    sources: ['arveloven_uskifte_testament'],
  },
  {
    id: 'uskifteCohabitantRest', area: 'uskifte', level: 'warning',
    when: { all: [{ fact: 'cohabitantWithChildren' }, { fact: 'uskifteAvailable' }] },
    title: 'Det er uklart om {partnerDu} også kan få 4 G nå', title_en: 'It is unclear whether {partnerDu} can also receive 4 G now',
    text: 'Loven sier ikke klart om en samboer som sitter i uskifte, i tillegg kan kreve arven på {g4} av eiendelene som ikke er med i uskifte. Spør tingretten før dere bestemmer dere.', text_en: 'The law does not say clearly whether a cohabitant who keeps an undivided estate can also claim the inheritance of {g4} from the assets not included in the undivided estate. Ask the district court before you decide.',
    sources: ['arveloven_uskifte_samboer', 'arveloven_uskifte_samboer_deling'],
  },
]

// Neste steg. Vises i rekkefølge, bare når `when` er oppfylt.
// `uskifteOnly`/`skifteOnly` brukes til å merke steg som bare gjelder ett av valgene.
export const NEXT_STEPS = [
  {
    id: 'findTestament',
    when: { fact: 'testamentUnknown' },
    title: 'Finn ut om det finnes et testament', title_en: 'Find out whether there is a will',
    text: 'Se gjennom avdødes papirer, og spør advokat, bank og tingretten. Tingretten kan sjekke om avdøde har levert et testament til oppbevaring der.', text_en: 'Go through the deceased\'s papers, and ask the lawyer, bank and district court. The district court can check whether the deceased deposited a will there.',
    sources: ['domstol_testament'],
  },
  {
    id: 'overview',
    when: { not: { fact: 'oldLaw' } },
    title: 'Skaff oversikt over eiendeler og gjeld', title_en: 'Get an overview of assets and debts',
    text: 'Gå gjennom kontoutskrifter, post og avdødes siste skattemelding. Tingretten kan gi arvingene en fullmakt til å hente opplysninger fra banker og andre (formuesfullmakt).', text_en: 'Go through bank statements, mail and the deceased\'s latest tax return. The district court can give the heirs a power of attorney to obtain information from banks and others (formuesfullmakt).',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'proklama',
    when: { any: [{ fact: 'debtUncertain' }, { fact: 'insolvent' }] },
    title: 'Be om proklama hvis dere er usikre på gjelden', title_en: 'Request a proklama if you are unsure about the debts',
    text: 'Kreditorene får seks uker på å melde krav. Gjør dette før dere bestemmer dere for å overta boet.', text_en: 'Creditors get six weeks to report claims. Do this before you decide to take over the estate.',
    sources: ['skjema_proklama', 'skifteloven_proklama'],
  },
  {
    id: 'decideUskifte',
    when: { fact: 'uskifteAvailable' },
    title: 'Bestem om {partnerDu} vil sitte i uskifte eller skifte nå', title_en: 'Decide whether {partnerDu} will keep an undivided estate or settle now',
    text: 'Snakk sammen i familien. Uskifte gir trygghet i hverdagen, men betyr også ansvar for all gjelden, og at barna må vente på arven sin.', text_en: 'Talk it over in the family. An undivided estate gives security in everyday life, but also means responsibility for all the debts, and that the children must wait for their inheritance.',
    sources: ['domstol_uskifte', 'skjema_veiledning_uskifte'],
  },
  {
    id: 'consent',
    when: { all: [{ fact: 'uskifteAvailable' }, { fact: 'hasSeparateChildren' }, { not: { q: 'separateChildrenConsent', eq: 'notRelevant' } }] },
    title: 'Spør særkullsbarna om de samtykker', title_en: 'Ask the children from another relationship whether they consent',
    text: 'Særkullsbarna samtykker ved å skrive under i skjemaet om uskifte. Den som ikke samtykker, skriver under på en erklæring om arveoppgjør og får sin arv nå.', text_en: 'They consent by signing the undivided estate form. Anyone who does not consent signs a declaration about the inheritance settlement and receives their inheritance now.',
    sources: ['arveloven_uskifte_saerkull', 'skjema_uskifte_ektefelle'],
  },
  {
    id: 'uskifteNotice',
    when: { fact: 'uskifteAvailable' },
    title: 'Hvis {partnerDu} velger uskifte: meld fra til tingretten innen 60 dager', title_en: 'If {partnerDu} choose(s) an undivided estate: notify the district court within 60 days',
    text: 'Send skjemaet «Melding om uskiftet bo» til tingretten der avdøde bodde. Tingretten utsteder da en [[uskifteattest]], som viser at {partnerDu} kan disponere boet.', text_en: 'Send the form «Melding om uskiftet bo» to the district court where the deceased lived. The district court then issues an [[uskifteattest|undivided estate certificate]], showing that {partnerDu} can manage the estate.',
    sources: ['arveloven_uskifte_frist', 'skjema_uskifte_ektefelle', 'skjema_uskifte_samboer'],
  },
  {
    id: 'soleHeir',
    when: { fact: 'partnerTakesAll' },
    title: 'Send erklæring om at {partnerDu} er eneste arving', title_en: 'Send a declaration that {partnerDu} is the sole heir',
    text: 'Når ektefelle eller samboer arver alt, finnes det egne skjemaer for dette. Tingretten utsteder deretter skifteattest.', text_en: 'When the spouse or cohabitant inherits everything, there are special forms for this. The district court then issues a probate certificate.',
    sources: ['skjema_enearving_ektefelle', 'skjema_enearving_samboer'],
  },
  {
    id: 'smallEstate',
    when: { all: [{ fact: 'smallEstate' }, { not: { fact: 'partnerTakesAll' } }] },
    title: 'Vurder oppgjør som bo av liten verdi', title_en: 'Consider settlement as an estate of small value',
    text: 'Er det lite igjen etter begravelsen, kan den som ordnet begravelsen søke tingretten om å ta hånd om eiendelene på en enkel måte.', text_en: 'If little is left after the funeral, the person who arranged the funeral can apply to the district court to take care of the belongings in a simple way.',
    sources: ['skjema_liten_verdi', 'arveloven_liten_verdi'],
  },
  {
    id: 'noHeirs',
    when: { fact: 'toCharity' },
    title: 'Kontakt tingretten om oppgjøret', title_en: 'Contact the district court about the settlement',
    text: 'Når det ikke finnes arvinger, kan ingen overta boet ved privat skifte. Tingretten veileder om hvordan boet skal gjøres opp, og om hvordan personer som sto avdøde nær, kan søke om å få arven.', text_en: 'When there are no heirs, nobody can take over the estate in a private settlement. The district court gives guidance on how the estate is to be settled, and on how people who were close to the deceased can apply for the inheritance.',
    sources: ['arveloven_staten', 'domstol_skifteformer'],
  },
  {
    id: 'publicSkifte',
    when: { any: [{ fact: 'disagreement' }, { fact: 'insolvent' }, { fact: 'unreachableHeir' }] },
    title: 'Vurder offentlig skifte', title_en: 'Consider public administration',
    text: 'Er dere uenige, er gjelden for stor, eller er det vanskelig å samle alle arvingene, kan dere be tingretten om offentlig skifte. Ta gjerne kontakt med tingretten først – de veileder gratis.', text_en: 'If you disagree, the debts are too large, or it is difficult to gather all the heirs, you can ask the district court for public administration. Feel free to contact the district court first – they give free guidance.',
    sources: ['arveloven_offentlig', 'domstol_skifteformer'],
  },
  {
    id: 'privateSkifte',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'oldLaw' } }, { not: { fact: 'toCharity' } }] },
    title: 'Ved privat skifte: send erklæring innen 60 dager', title_en: 'For a private settlement: send a declaration within 60 days',
    text: 'Minst én voksen arving skriver under på «Erklæring om privat skifte av dødsbo» og påtar seg ansvaret for gjelden. Tingretten utsteder da en [[skifteattest]]. Det koster ingenting.', text_en: 'At least one adult heir signs «Erklæring om privat skifte av dødsbo» and takes on responsibility for the debts. The district court then issues a [[skifteattest|probate certificate]]. It costs nothing.',
    sources: ['skjema_privat_skifte', 'arveloven_privat_frist', 'arveloven_skifteattest'],
  },
  {
    id: 'divide',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'partnerTakesAll' } }, { not: { fact: 'toCharity' } }] },
    title: 'Fordel eiendelene og gjør opp boet', title_en: 'Distribute the belongings and settle the estate',
    text: 'Med skifteattesten kan dere betale gjeld, selge eller overta eiendeler og fordele resten. Skriv ned hvem som får hva i et skifteoppgjør som alle arvingene signerer. Arvklart kan hjelpe dere med å fordele eiendelene rettferdig.', text_en: 'With the probate certificate you can pay debts, sell or take over assets and distribute the rest. Write down who gets what in a settlement document that all the heirs sign. Arvklart can help you divide the belongings fairly.',
    sources: ['domstol_privat_skifte'],
  },
  {
    id: 'register',
    when: { all: [{ not: { fact: 'insolvent' } }, { not: { fact: 'toCharity' } }] },
    title: 'Overfør eierskap og avslutt', title_en: 'Transfer ownership and finish',
    text: 'Bolig og fritidsbolig må tinglyses på ny eier hos Kartverket, og kjøretøy omregistreres hos Statens vegvesen. Husk også avdødes skattemelding for dødsåret.', text_en: 'Homes and holiday homes must be registered to the new owner with the Norwegian Mapping Authority (Kartverket), and vehicles re-registered with the Norwegian Public Roads Administration. Also remember the deceased\'s tax return for the year of death.',
    sources: [],
  },
]
