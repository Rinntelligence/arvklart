// Tidslinje, ordliste og ressurser på veiviser.html. Lastes som vanlig skript før /arveveiviser/ui.js.
// Ligger i egen fil fordi innholdsreglene (CSP i vercel.json) ikke tillater skript direkte i HTML-en.
(function(){
  // Engelsk (?lang=en, sendes av appen bare når den engelske veiviseren er slått på): innholdet under har
  // *_en-felter som brukes i stedet for de norske. Norsk er standard og den gjeldende versjonen.
  const EN = new URLSearchParams(window.location.search).get('lang') === 'en';
  const T = (no, en) => (EN ? en : no);
  const localize = (o) => {
    if (Array.isArray(o)) return o.map(localize);
    if (!o || typeof o !== 'object') return o;
    const r = {};
    for (const k of Object.keys(o)) { if (!k.endsWith('_en')) r[k] = EN && o[k + '_en'] != null ? o[k + '_en'] : localize(o[k]); }
    return r;
  };
  const ICONS = {
    spouse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.2"/><circle cx="17" cy="8" r="3.2"/><path d="M2.5 20c.6-3.4 2.9-5.3 5.5-5.3s4.9 1.9 5.5 5.3"/><path d="M11.5 20c.6-3.4 2.9-5.3 5.5-5.3s4.9 1.9 5.5 5.3"/></svg>',
    partner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.6-9.3C1.2 8.2 3 5 6.3 5c1.9 0 3.4 1 4.2 2.4l1.5 2.6 1.5-2.6C14.3 6 15.8 5 17.7 5 21 5 22.8 8.2 21.6 11.2 19.5 15.9 12 20.5 12 20.5z"/></svg>',
    child: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6.5" r="2.8"/><path d="M6 21c.7-4 3-6.2 6-6.2s5.3 2.2 6 6.2"/></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3"/><path d="M4.5 20c.8-4.2 3.5-6.5 7.5-6.5s6.7 2.3 7.5 6.5"/><circle cx="19" cy="6" r="1.6"/><circle cx="5" cy="6" r="1.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V6a1.5 1.5 0 0 1 3 0v5"/><path d="M12 10.5V5a1.5 1.5 0 0 1 3 0v6"/><path d="M15 10.5V7a1.5 1.5 0 0 1 3 0v7c0 3-2 6-6 6h-1c-3 0-4.5-1-6-3l-2.2-3.5A1.4 1.4 0 0 1 5 11.3c.6-.5 1.5-.4 2 .2L9 14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M7 21h10M5 7h4M15 7h4M5 7L2.5 12a2.5 2.5 0 0 0 5 0L5 7zM19 7l-2.5 5a2.5 2.5 0 0 0 5 0L19 7z"/></svg>',
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6M9 12h.01M15 12h.01M9 8.5h.01M15 8.5h.01"/></svg>',
    coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/></svg>',
    externalArrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>',
    docReg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 13h6M9 17h4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H4v8l10.5 10.5a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8L12 2z"/><path d="M8 8h.01"/></svg>',
    split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M12 8L6 14M12 8l6 6M6 14v6M18 14v6"/></svg>',
    sign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17s2-1 4-1 3 1 5 1 3-2 5-2 4 1 4 1"/><path d="M7 13 15 5a2 2 0 0 1 3 3l-8 8-4 1 1-4z"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>',
    shieldCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 8h.01"/></svg>',
    feather: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 3.5c-4 0-13 2-15.5 9.5C3.7 16.7 4 19 4 19s2.3.3 6-1c7.5-2.5 9.5-11.5 9.5-15.5z"/><path d="M4 19l7-7M10 12l2.5-2.5M13.5 8.5 16 6"/></svg>'
  };

  const GS_MAKS_2026 = '30 898 kr';
  // Svarverdiene er norske (brukes i logikken under); bare visningen oversettes
  const GS_OPTION_EN = { 'Ja': 'Yes', 'Nei': 'No', 'Vet ikke': "Don't know" };
  const GS_QUESTIONS = [
    { key: 'under18', text: T('Var avdøde under 18 år?', 'Was the deceased under 18?'), options: ['Ja', 'Nei'] },
    { key: 'formue', text: T('Hadde avdøde bankinnskudd, verdipapirer eller annen lett tilgjengelig formue?', 'Did the deceased have bank deposits, securities or other readily available assets?'), options: ['Ja', 'Nei', 'Vet ikke'] },
    { key: 'forsikring', text: T('Ble det utbetalt forsikring (f.eks. livsforsikring) som følge av dødsfallet?', 'Was any insurance (e.g. life insurance) paid out as a result of the death?'), options: ['Ja', 'Nei', 'Vet ikke'] }
  ];

  function gsRenderIntro(){
    return '<div class="gs-head">' + ICONS.shieldCheck +
      '<div class="gs-head-text"><h4>' + T('Sjekk sjansen for gravferdsstønad', 'Check your chances of a funeral grant') + '</h4>' +
      '<p>' + T('Tre raske spørsmål gir en pekepinn — NAV fastsetter alltid det endelige beløpet.', 'Three quick questions give an indication — NAV always sets the final amount.') + '</p></div></div>' +
      '<button type="button" class="gs-start-btn" data-gs="start">' + T('Start sjekk', 'Start check') + '</button>';
  }

  function gsVerdict(answers){
    if(answers.under18 === 'Ja'){
      return { type: 'full', title: T('Trolig ingen behovsprøving', 'Probably no means test'), text: T('Når avdøde var under 18 år, blir ikke gravferdsstønaden behovsprøvd. Dokumenterte gravferdsutgifter dekkes i sin helhet, opptil ', 'When the deceased was under 18, the funeral grant is not means-tested. Documented funeral expenses are covered in full, up to ') + GS_MAKS_2026 + T(' (2026-sats).', ' (2026 rate).') };
    }
    const hasYes = answers.formue === 'Ja' || answers.forsikring === 'Ja';
    const hasUnknown = answers.formue === 'Vet ikke' || answers.forsikring === 'Vet ikke';
    if(hasYes){ return { type: 'partial', title: T('Trolig rett på et redusert beløp', 'Probably entitled to a reduced amount'), text: T('Gravferdsstønaden behovsprøves mot formue og forsikringsutbetalinger, så beløpet blir sannsynligvis lavere enn maksbeløpet. Dere kan likevel ha rett på en delvis stønad, opptil ', 'The funeral grant is means-tested against assets and insurance payouts, so the amount will probably be lower than the maximum. You may still be entitled to a partial grant, up to ') + GS_MAKS_2026 + T(' (2026-sats).', ' (2026 rate).') }; }
    if(hasUnknown){ return { type: 'uncertain', title: T('Usikkert — sjekk tallene først', 'Uncertain — check the figures first'), text: T('Svaret avhenger av faktisk formue og eventuelle forsikringsutbetalinger. Sjekk siste kontoutskrift og forsikringsbevis, eller ta direkte kontakt med NAV for en konkret vurdering.', 'The answer depends on the actual assets and any insurance payouts. Check the latest bank statement and insurance documents, or contact NAV directly for a specific assessment.') }; }
    return { type: 'full', title: T('Trolig rett på hele eller det meste', 'Probably entitled to all or most of it'), text: T('Uten formue eller forsikringsutbetaling som reduserer stønaden, har dere trolig rett på hele eller det meste av gravferdsstønaden, opptil ', 'Without assets or insurance payouts that reduce the grant, you are probably entitled to all or most of the funeral grant, up to ') + GS_MAKS_2026 + T(' (2026-sats).', ' (2026 rate).') };
  }

  function gsRenderResult(v){
    const icon = v.type === 'uncertain' ? ICONS.info : ICONS.shieldCheck;
    return '<div class="gs-result ' + v.type + '">' +
      '<div class="gs-result-title">' + icon + '<span>' + v.title + '</span></div>' +
      '<p>' + v.text + '</p>' +
      '<div class="gs-result-actions">' +
        '<a class="item-link" href="https://www.nav.no/gravferd" target="_blank" rel="noopener noreferrer">' + T('Les mer og søk hos NAV', 'Read more and apply at NAV') + ICONS.externalArrow + '</a>' +
        '<button type="button" class="gs-reset-btn" data-gs="reset">' + T('Sjekk på nytt', 'Check again') + '</button>' +
      '</div>' +
      '<div class="gs-disclaimer">' + T('Dette er en veiledende pekepinn, ikke et vedtak. NAV beregner det endelige beløpet ut fra faktisk dokumentasjon.', 'This is an indication only, not a decision. NAV calculates the final amount based on actual documentation.') + '</div>' +
    '</div>';
  }

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

  const PHASES = [
    { title: 'Rett etter dødsfallet', title_en: 'Right after the death', sub: 'Registrering og de første avklaringene', sub_en: 'Registration and the first clarifications', icon: ICONS.docReg, focus: false, griefNote: 'Sorg er en helt naturlig reaksjon, og den tar den tiden den tar. Mange opplever tretthet, uro eller skyldfølelse — det er vanlig. Erfaring viser at det hjelper å snakke med noen: familie, venner, fastlegen, eller et kirkekontor, som ofte tilbyr sorgsamtaler uavhengig av livssyn.', griefNote_en: 'Grief is a completely natural reaction, and it takes the time it takes. Many people feel tired, restless or guilty — that is common. Experience shows that it helps to talk to someone: family, friends, your GP, or a church office, which often offers grief conversations regardless of belief.',
      groups: [
        { label: 'Automatisk', label_en: 'Automatic', type: 'auto', items: [
          { text: 'Dødsfallet registreres automatisk i Folkeregisteret når legen melder det elektronisk.', text_en: 'The death is registered automatically in the National Population Register when the doctor reports it electronically.', what: 'Folkeregisteret er det offentlige registeret over alle bosatte i Norge. Legen eller sykehuset sender dødsmeldingen elektronisk, normalt i løpet av få dager.', what_en: 'The National Population Register is the public register of everyone resident in Norway. The doctor or hospital sends the death notification electronically, normally within a few days.' },
          { text: 'NAV og mange banker/forsikringsselskaper varsles automatisk via Folkeregisteret.', text_en: 'NAV and many banks/insurance companies are notified automatically via the National Population Register.', what: 'Når dødsfallet er registrert, går varselet automatisk videre til offentlige etater og de fleste norske banker og forsikringsselskaper. Utenlandske aktører er sjelden koblet til, og bør varsles direkte.', what_en: 'Once the death is registered, the notice automatically goes on to public agencies and most Norwegian banks and insurance companies. Foreign providers are rarely connected and should be notified directly.' },
          { text: 'Avdødes bankkonto sperres automatisk.', text_en: 'The deceased\'s bank account is frozen automatically.', what: 'Banken sperrer kontoen så snart dødsfallet er registrert i Folkeregisteret. Andre med disposisjonsrett til en felles konto mister denne retten samtidig.', what_en: 'The bank freezes the account as soon as the death is registered in the National Population Register. Others with authority over a joint account lose that right at the same time.' }
        ]},
        { label: 'Krever handling fra deg', label_en: 'Requires action from you', type: 'manual', items: [
          { text: 'Kontakte begravelsesbyrå — som ofte selv melder dødsfallet til retten.', text_en: 'Contact a funeral home — which often reports the death to the court itself.', what: 'Et begravelsesbyrå hjelper med det praktiske rundt selve begravelsen, og melder ofte dødsfallet videre til tingretten på deres vegne.', what_en: 'A funeral home helps with the practical side of the funeral itself, and often reports the death to the district court on your behalf.', how: 'Ta kontakt med et byrå i løpet av de første dagene. Spør spesifikt om de melder dødsfallet til tingretten, og hvilke skjemaer de kan bistå med.', how_en: 'Contact a funeral home within the first few days. Ask specifically whether they report the death to the district court, and which forms they can help with.' },
          { text: 'Avklare hvem som er ansvarlig for selve gravferden.', text_en: 'Clarify who is responsible for the funeral itself.', what: 'Ansvaret for å arrangere gravferden følger en egen rekkefølge — ikke det samme som hvem som arver: ektefelle/samboer, barn, foreldre, besteforeldre, søsken, deretter søskens barn. Blir de ansvarlige uenige, avgjør kommunen, og vedtaket kan ikke påklages.', what_en: 'Responsibility for arranging the funeral follows its own order — not the same as who inherits: spouse/cohabitant, children, parents, grandparents, siblings, then siblings\' children. If those responsible disagree, the municipality decides, and the decision cannot be appealed.', how: 'Den som faktisk sørger for gravferden kan kreve kostnadene dekket av boet før arven fordeles — uansett om vedkommende selv er arving eller ikke.', how_en: 'Whoever actually arranges the funeral can have the costs covered by the estate before the inheritance is distributed — whether or not they are an heir themselves.' },
          { text: 'Avklare om det finnes et testament (kan også inneholde ønsker for begravelsen).', text_en: 'Find out whether there is a will (it may also contain wishes for the funeral).', what: 'Et testament er avdødes skriftlige, undertegnede ønsker for hvordan arven — og noen ganger begravelsen — skal gjennomføres.', what_en: 'A will is the deceased\'s written, signed wishes for how the inheritance — and sometimes the funeral — is to be handled.', how: 'Sjekk hjemme hos avdøde og hos advokat eller bank, der testamenter ofte oppbevares. Del et eventuelt testament med de andre arvingene så tidlig som mulig.', how_en: 'Check the deceased\'s home and with a lawyer or bank, where wills are often kept. Share any will with the other heirs as early as possible.' },
          { text: 'Søke <strong>skifteattest</strong> hos tingretten — gir rett til å representere boet.', text_en: 'Apply for a <strong>probate certificate (skifteattest)</strong> from the district court — gives the right to represent the estate.', what: 'Skifteattest er dokumentet som viser hvem som har rett til å opptre på vegne av dødsboet overfor banker, Kartverket og andre.', what_en: 'The probate certificate is the document showing who is entitled to act on behalf of the estate with banks, the Mapping Authority and others.', how: 'Søk elektronisk eller på papir hos tingretten der avdøde bodde. Du trenger vanligvis dødsmelding, oversikt over arvinger og informasjon om et eventuelt testament.', how_en: 'Apply electronically or on paper to the district court where the deceased lived. You usually need the death notification, an overview of the heirs and information about any will.', link: { label: 'Domstol.no', url: 'https://www.domstol.no' } },
          { text: 'Sjekke pensjon og forsikringer hos Norsk Pensjon.', text_en: 'Check pensions and insurance with Norsk Pensjon.', what: 'Norsk Pensjon samler informasjon om avdødes pensjonsavtaler og enkelte forsikringer på ett sted.', what_en: 'Norsk Pensjon gathers information about the deceased\'s pension agreements and some insurance policies in one place.', how: 'Logg inn med BankID som etterlatt eller fullmektig, eller kontakt Norsk Pensjon direkte for veiledning om dødsbo.', how_en: 'Log in with BankID as a surviving relative or authorised representative, or contact Norsk Pensjon directly for guidance on estates.', link: { label: 'Norsk Pensjon', url: 'https://norskpensjon.no' } },
          { text: 'Vurdere å søke gravferdsstønad hos NAV.', text_en: 'Consider applying for a funeral grant from NAV.', what: 'Gravferdsstønad er en behovsprøvd støtte til gravferdsutgifter — se sjanse-sjekken under for en pekepinn. Vær også oppmerksom på båretransportstønad (dekker nødvendig transport av avdøde over 20 km) og fagforeningsstønad (utbetaling til pårørende dersom avdøde var medlem av en fagforening).', what_en: 'The funeral grant is means-tested support for funeral expenses — see the check below for an indication. Also note the transport grant (covers necessary transport of the deceased over 20 km) and union benefits (a payment to relatives if the deceased was a trade union member).', how: 'Søk elektronisk hos NAV, gjerne så snart utgiftene til gravferden er kjent. Sjekk også om avdøde var fagorganisert — ta i så fall kontakt med fagforeningen direkte.', how_en: 'Apply electronically to NAV, preferably as soon as the funeral costs are known. Also check whether the deceased was a union member — if so, contact the union directly.', link: { label: 'NAV', url: 'https://www.nav.no' } }
        ]}
      ]
    },
    { title: 'Kartlegging av boet', title_en: 'Mapping the estate', sub: 'Hva eide og skyldte avdøde', sub_en: 'What the deceased owned and owed', icon: ICONS.search, focus: false,
      groups: [
        { label: 'Krever handling fra deg', label_en: 'Requires action from you', type: 'manual', items: [
          { text: 'Avklare om boet skal skiftes privat eller offentlig.', text_en: 'Decide whether the estate is to be settled privately or publicly.', what: 'Privat skifte betyr at arvingene selv tar hånd om fordelingen. Offentlig skifte betyr at tingretten oppnevner en bostyrer som gjør det for dere. For små bo finnes også forenklede former: bo av liten verdi og summarisk skifte, der arvingene overtar boet mot å dekke gravferdsutgiftene.', what_en: 'A private settlement means the heirs handle the distribution themselves. Public administration means the district court appoints an administrator who does it for you. For small estates there are also simplified forms: estates of small value and summary settlement, where the heirs take over the estate in return for covering the funeral costs.', how: 'Ta gjerne kontakt med tingretten innen 60 dager etter dødsfallet — de gir råd og veiledning uten kostnad. Er dere usikre eller uenige, spør spesifikt om hvilken skifteform som passer boet deres.', how_en: 'Feel free to contact the district court within 60 days of the death — they give advice and guidance free of charge. If you are unsure or disagree, ask specifically which form of settlement suits your estate.', link: { label: 'Domstol.no', url: 'https://www.domstol.no' } },
          { text: 'Kartlegge eiendeler og gjeld — Skatteetaten kan bistå med en oversikt.', text_en: 'Map assets and debts — the Tax Administration can help with an overview.', what: 'En fullstendig oversikt over alt avdøde eide — bolig, bil, innbo, bankkonti, verdipapirer — og alt avdøde skyldte, som lån og ubetalte regninger.', what_en: 'A complete overview of everything the deceased owned — home, car, contents, bank accounts, securities — and everything the deceased owed, such as loans and unpaid bills.', how: 'Gå gjennom post og kontoutskrifter, sjekk Skatteetatens oversikt over formue og gjeld fra siste skattemelding, og kontakt bankene direkte. Er dere usikre på om det finnes skjult gjeld, kan dere be tingretten om formuesfullmakt for innsyn, eller be tingretten om proklama, slik at eventuelle kreditorer må melde krav innen seks uker.', how_en: 'Go through the mail and bank statements, check the Tax Administration\'s overview of assets and debts from the latest tax return, and contact the banks directly. If you are unsure whether there are hidden debts, you can ask the district court for a power of attorney to obtain information (formuesfullmakt), or ask for a proklama, so that any creditors must report claims within six weeks.', link: { label: 'Skatteetaten', url: 'https://www.skatteetaten.no' } }
        ]}
      ]
    },
    { title: 'Verdivurdering og avklaring', title_en: 'Valuation and clarification', sub: 'Hva er eiendelene faktisk verdt', sub_en: 'What the belongings are actually worth', icon: ICONS.tag, focus: true, helpNote: 'Arvklart lar dere registrere verdivurderinger og forskudd på arv på ett sted, slik at fordelingen senere bygger på et ryddig og omforent grunnlag.', helpNote_en: 'Arvklart lets you record valuations and advances on inheritance in one place, so that the distribution later rests on an orderly, agreed basis.',
      groups: [
        { label: 'Krever handling fra deg', label_en: 'Requires action from you', type: 'manual', items: [
          { text: 'Verdsette eiendeler, eventuelt med hjelp fra en takstmann.', text_en: 'Value the belongings, possibly with help from a professional valuer.', what: 'En vurdering av hva eiendelene faktisk er verdt i dag — ikke hva de kostet, og ikke den følelsesmessige verdien.', what_en: 'An assessment of what the belongings are actually worth today — not what they cost, and not their sentimental value.', how: 'For bolig, kunst og andre dyrere gjenstander, bestill en uavhengig takstmann. For vanlig innbo holder ofte en felles, skjønnsmessig vurdering mellom arvingene.', how_en: 'For homes, art and other more valuable items, book an independent valuer. For ordinary contents, a shared, discretionary assessment between the heirs is often enough.' },
          { text: 'Avklare om noen arvinger har mottatt forskudd på arv.', text_en: 'Clarify whether any heirs have received an advance on inheritance.', what: 'Forskudd på arv er penger eller gjenstander avdøde ga til en arving mens de levde, som normalt trekkes fra vedkommendes andel senere.', what_en: 'An advance on inheritance is money or items the deceased gave to an heir during their lifetime, which is normally deducted from that heir\'s share later.', how: 'Snakk åpent om dette i familien tidlig, og se etter gaver som er dokumentert i avdødes økonomi eller nevnt i testamentet.', how_en: 'Talk openly about this in the family early on, and look for gifts documented in the deceased\'s finances or mentioned in the will.' },
          { text: 'Kartlegge ønsker — hvem vil ha hva.', text_en: 'Map wishes — who wants what.', what: 'En uformell runde der hver arving forteller hvilke gjenstander som betyr mest for dem, før den formelle fordelingen.', what_en: 'An informal round where each heir says which items matter most to them, before the formal distribution.', how: 'Sett av tid til en samtale, gjerne i Arvklart, og noter ønskene skriftlig slik at de kan brukes som utgangspunkt i fordelingen.', how_en: 'Set aside time for a conversation, for example in Arvklart, and write the wishes down so they can be used as a starting point for the distribution.' }
        ]}
      ]
    },
    { title: 'Fordeling', title_en: 'Distribution', sub: 'Eiendelene fordeles mellom arvingene', sub_en: 'The belongings are divided between the heirs', icon: ICONS.split, focus: true, helpNote: 'Arvklart gjør selve fordelingen ryddig, sporbar og rettferdig for alle arvinger — også når dere er uenige.', helpNote_en: 'Arvklart makes the distribution itself orderly, traceable and fair for all heirs — also when you disagree.',
      groups: [
        { label: 'Krever handling fra deg', label_en: 'Requires action from you', type: 'manual', items: [
          { text: 'Fordele eiendelene mellom arvingene.', text_en: 'Divide the belongings between the heirs.', what: 'Selve prosessen der eiendelene formelt tildeles hver arving, basert på verdivurdering og ønsker.', what_en: 'The process in which the belongings are formally allocated to each heir, based on valuation and wishes.', how: 'Bruk Arvklart til å registrere eiendeler, ønsker og verdier, og la plattformen foreslå en rettferdig fordeling dere kan justere sammen.', how_en: 'Use Arvklart to record belongings, wishes and values, and let the platform suggest a fair distribution you can adjust together.' },
          { text: 'Ved uenighet: loddtrekning, mekling, eller i siste instans offentlig skifte.', text_en: 'In case of disagreement: drawing lots, mediation, or as a last resort public administration.', what: 'Tre trinn for å løse uenighet — fra det enkleste, loddtrekning om enkeltgjenstander, til det mest omfattende, offentlig skifte via tingretten.', what_en: 'Three steps to resolve disagreement — from the simplest, drawing lots for individual items, to the most extensive, public administration through the district court.', how: 'Prøv loddtrekning eller intern mekling først. Fører ikke det frem, kan tingretten oppnevne en bobestyrer til å gjennomføre et offentlig skifte.', how_en: 'Try drawing lots or internal mediation first. If that does not work, the district court can appoint an administrator to carry out a public administration.', link: { label: 'Domstol.no', url: 'https://www.domstol.no' } }
        ]}
      ]
    },
    { title: 'Avslutning', title_en: 'Completion', sub: 'Formalisering og overføring', sub_en: 'Formalising and transferring', icon: ICONS.sign, focus: false,
      groups: [
        { label: 'Krever handling fra deg', label_en: 'Requires action from you', type: 'manual', items: [
          { text: 'Signere fordelingsavtalen sammen med de andre arvingene.', text_en: 'Sign the distribution agreement together with the other heirs.', what: 'En skriftlig avtale der alle arvinger bekrefter hvordan boet er fordelt.', what_en: 'A written agreement in which all heirs confirm how the estate has been distributed.', how: 'Alle arvinger bør signere, gjerne med kopi til hver, og oppbevare avtalen sammen med skifteattesten.', how_en: 'All heirs should sign, ideally with a copy each, and keep the agreement together with the probate certificate.' },
          { text: 'Overføre eierskap på eiendeler og eiendom.', text_en: 'Transfer ownership of belongings and property.', what: 'Den formelle overføringen av eierskap — for eksempel tinglysing av bolig, omregistrering av bil, eller overføring av bankkonti.', what_en: 'The formal transfer of ownership — for example registering a home, re-registering a car, or transferring bank accounts.', how: 'For eiendom: send skjøte til Kartverket for tinglysing. For kjøretøy: meld eierskifte til Statens vegvesen. For konti: kontakt banken med skifteattesten.', how_en: 'For property: send the deed to the Mapping Authority (Kartverket) for registration. For vehicles: report the change of ownership to the Public Roads Administration. For accounts: contact the bank with the probate certificate.' },
          { text: 'Be om forhåndsligning av dødsboet hos Skatteetaten.', text_en: 'Ask the Tax Administration for an advance tax assessment of the estate.', what: 'En forhåndsligning avklarer boets skattemessige stilling før det avsluttes formelt, slik at arvingene slipper skatteoverraskelser i etterkant.', what_en: 'An advance assessment clarifies the estate\'s tax position before it is formally closed, so the heirs avoid tax surprises afterwards.', how: 'Ta kontakt med Skatteetaten i forbindelse med boets avslutning og be om forhåndsligning.', how_en: 'Contact the Tax Administration when the estate is being closed and ask for an advance assessment.', link: { label: 'Skatteetaten', url: 'https://www.skatteetaten.no' } },
          { text: 'Sende arvemelding til Skatteetaten.', text_en: 'Send an inheritance report to the Tax Administration.', what: 'En melding som gir Skatteetaten oversikt over hva hver arving har mottatt — viktig for korrekt skattlegging senere, for eksempel ved salg av arvet eiendom.', what_en: 'A report giving the Tax Administration an overview of what each heir has received — important for correct taxation later, for example when selling inherited property.', how: 'Fyll ut og send arvemelding elektronisk via Skatteetatens tjenester, senest tre måneder etter at fordelingen er klar.', how_en: 'Fill in and send the inheritance report electronically through the Tax Administration\'s services, no later than three months after the distribution is finalised.', link: { label: 'Skatteetaten', url: 'https://www.skatteetaten.no' } }
        ]}
      ]
    }
  ];

  const GLOSSARY = [
    { term: 'Pliktdelsarv', term_en: 'Compulsory share (pliktdelsarv)', def: 'Den delen av arven barn (livsarvinger) har krav på uansett testament: 2/3 av arven, men høyst 15 G per barn.', def_en: 'The part of the inheritance children (descendants) are entitled to regardless of any will: 2/3 of the inheritance, but at most 15 G per child.' },
    { term: 'Livsarving', term_en: 'Descendant (livsarving)', def: 'Direkte etterkommer — barn, barnebarn og videre nedover — med lovbestemt rett til pliktdelsarv.', def_en: 'Direct descendant — children, grandchildren and further down — with a statutory right to the compulsory share.' },
    { term: 'Skifteattest', term_en: 'Probate certificate (skifteattest)', def: 'Dokument fra tingretten som gir deg rett til å representere dødsboet overfor banker og andre.', def_en: 'A document from the district court giving you the right to represent the estate with banks and others.' },
    { term: 'Uskifteattest', term_en: 'Undivided estate certificate (uskifteattest)', def: 'Dokument fra tingretten som bekrefter at gjenlevende ektefelle eller samboer sitter i uskiftet bo.', def_en: 'A document from the district court confirming that the surviving spouse or cohabitant keeps an undivided estate.' },
    { term: 'Offentlig skifte', term_en: 'Public administration (offentlig skifte)', def: 'Når tingretten oppnevner en bostyrer som står for fordelingen — typisk ved uenighet eller når gjelden er større enn eiendelene.', def_en: 'When the district court appoints an administrator to handle the distribution — typically in case of disagreement or when the debts exceed the assets.' },
    { term: 'Bostyrer', term_en: 'Administrator (bostyrer)', def: 'Personen, ofte en advokat, som tingretten oppnevner til å styre et offentlig skifte og stå for det praktiske i bobehandlingen.', def_en: 'The person, often a lawyer, whom the district court appoints to manage a public administration and handle the practical work.' },
    { term: 'Bo av liten verdi', term_en: 'Estate of small value', def: 'Forenklet skifteform for dødsbo der eiendelene knapt dekker gravferdskostnadene og eventuell gjeld.', def_en: 'A simplified form of settlement for estates where the assets barely cover the funeral costs and any debts.' },
    { term: 'Summarisk skifte', term_en: 'Summary settlement', def: 'Forenklet skifteform der arvingene overtar et lite bo mot å dekke gravferdsutgiftene, uten et fullt privat eller offentlig skifte.', def_en: 'A simplified form where the heirs take over a small estate in return for covering the funeral costs, without a full private or public settlement.' },
    { term: 'Uskifte', term_en: 'Undivided estate (uskifte)', def: 'Gjenlevende ektefelle, eller samboer med felles barn, overtar boet udelt i stedet for å skifte med de andre arvingene nå. Barna arver senere.', def_en: 'The surviving spouse, or a cohabitant with joint children, takes over the estate undivided instead of settling with the other heirs now. The children inherit later.' },
    { term: 'Særkullsbarn', term_en: 'Child from another relationship (særkullsbarn)', def: 'Et barn avdøde har fra et annet forhold – altså ikke et felles barn med gjenlevende ektefelle eller samboer. Særkullsbarn må samtykke til uskifte.', def_en: 'A child the deceased has from another relationship – that is, not a joint child with the surviving spouse or cohabitant. Such children must consent to an undivided estate.' },
    { term: 'Særeie', term_en: 'Separate property (særeie)', def: 'Eiendeler som holdes utenfor delingen mellom ektefeller, fordi det er avtalt i en ektepakt eller bestemt av den som ga en gave eller arv.', def_en: 'Assets kept out of the division between spouses, because it was agreed in a marital agreement or decided by the person who gave a gift or inheritance.' },
    { term: 'Felleseie', term_en: 'Joint property (felleseie)', def: 'Utgangspunktet i et ekteskap: det ektefellene eier, deles likt når ekteskapet opphører – også ved dødsfall.', def_en: 'The starting point in a marriage: what the spouses own is divided equally when the marriage ends – also on death.' },
    { term: 'Minstearv', term_en: 'Minimum inheritance (minstearv)', def: 'Et minstebeløp ektefelle (4 G eller 6 G) eller samboer med felles barn (4 G) arver, uansett testament.', def_en: 'A minimum amount a spouse (4 G or 6 G) or a cohabitant with joint children (4 G) inherits, regardless of any will.' },
    { term: 'Forskudd på arv', term_en: 'Advance on inheritance', def: 'En gave til et barn som avdøde sa skulle trekkes fra barnets arv senere (avkorting).', def_en: 'A gift to a child that the deceased said should later be deducted from the child\'s inheritance (avkorting).' },
    { term: 'Formuesfullmakt', term_en: 'Power of attorney for assets (formuesfullmakt)', def: 'Fullmakt fra tingretten som gir en arving rett til å innhente opplysninger om avdødes formue og gjeld, som grunnlag for å velge skifteform.', def_en: 'Authorisation from the district court giving an heir the right to obtain information about the deceased\'s assets and debts, as a basis for choosing the form of settlement.' },
    { term: 'Proklama', term_en: 'Public notice to creditors (proklama)', def: 'Offentlig kunngjøring som ber avdødes kreditorer melde krav innen seks uker, slik at boets gjeld blir klarlagt før fordeling.', def_en: 'A public notice asking the deceased\'s creditors to report claims within six weeks, so that the estate\'s debts are clarified before distribution.' }
  ];

  const RESOURCES = [
    { cat: 'Juridisk hjelp', cat_en: 'Legal help', icon: ICONS.scale, items: [
      { name: 'Jussformidlingen i Bergen', blurb: 'Gratis juridisk bistand knyttet til arv og skifte.', blurb_en: 'Free legal assistance with inheritance and settlement.', url: 'https://jussformidlingen.no' },
      { name: 'Jusshjelpa i Nord-Norge / Midt-Norge', name_en: 'Jusshjelpa in Northern / Central Norway', blurb: 'Gratis rettshjelp for privatpersoner.', blurb_en: 'Free legal aid for individuals.', url: 'https://jusshjelpa.no' }
    ]},
    { cat: 'Offentlig informasjon', cat_en: 'Public information', icon: ICONS.building, items: [
      { name: 'Domstol.no — «Dødsfall, arv og skifte»', name_en: 'Domstol.no — «Dødsfall, arv og skifte» (in Norwegian)', blurb: 'Offisiell veiledning gjennom skifteprosessen.', blurb_en: 'Official guidance through the settlement process.', url: 'https://www.domstol.no/no/dodsfall-arv-og-skifte/' },
      { name: 'Lovdata — Arveloven', name_en: 'Lovdata — The Inheritance Act (in Norwegian)', blurb: 'Selve lovteksten om arv og skifte.', blurb_en: 'The law text itself on inheritance and settlement.', url: 'https://lovdata.no/dokument/NL/lov/2019-06-14-21' }
    ]},
    { cat: 'Økonomi', cat_en: 'Finances', icon: ICONS.coin, items: [
      { name: 'Skatteetaten', blurb: 'Oversikt over gjeld og formue, samt skatteoppgjør ved dødsfall.', blurb_en: 'An overview of debts and assets, and the tax settlement on death.', url: 'https://www.skatteetaten.no' },
      { name: 'NAV', blurb: 'Gravferdsstønad og støtte ved å miste noen i nær familie.', blurb_en: 'Funeral grant and support when losing someone in your close family.', url: 'https://www.nav.no' },
      { name: 'Norsk Pensjon', blurb: 'Samlet oversikt over pensjon og forsikringer.', blurb_en: 'A combined overview of pensions and insurance.', url: 'https://norskpensjon.no' }
    ]}
  ];

  const timelineWrap = document.getElementById('timelineWrap');
  localize(PHASES).forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'phase' + (p.focus ? ' is-focus' : '');
    const renderItem = (it) => {
      const detail = [];
      if(it.what) detail.push('<p><span class="detail-label">' + T('Hva er det:', 'What it is:') + '</span> ' + it.what + '</p>');
      if(it.how) detail.push('<p><span class="detail-label">' + T('Slik gjør du det:', 'How to do it:') + '</span> ' + it.how + '</p>');
      if(it.link) detail.push('<a class="item-link" href="' + it.link.url + '" target="_blank" rel="noopener noreferrer">' + it.link.label + ICONS.externalArrow + '</a>');
      return '<li><div class="item-row"><span class="item-text">' + it.text + '</span><button type="button" class="item-info-btn" aria-expanded="false" aria-label="' + T('Mer informasjon om dette punktet', 'More information about this item') + '">' + ICONS.info + '</button></div><div class="item-detail">' + detail.join('') + '</div></li>';
    };
    const groupsHtml = p.groups.map(g => '<div class="subgroup"><div class="subgroup-label ' + (g.type === 'auto' ? 'auto' : 'manual') + '">' + (g.type === 'auto' ? ICONS.check : ICONS.hand) + '<span>' + g.label + '</span></div><ul>' + g.items.map(renderItem).join('') + '</ul></div>').join('');
    const helpNoteHtml = p.helpNote ? '<div class="help-note">' + ICONS.split + '<p>' + p.helpNote + '</p></div>' : '';
    const gsSlotHtml = (i === 0) ? '<div class="gs-check" id="gsCheck"></div>' : '';
    const griefNoteHtml = p.griefNote ? '<div class="grief-note">' + ICONS.feather + '<div><h4>' + T('Ta vare på dere selv', 'Take care of yourselves') + '</h4><p>' + p.griefNote + '</p></div></div>' : '';

    el.innerHTML = '<button type="button" class="phase-head" aria-expanded="false"><div class="phase-num">' + (i + 1) + '</div><div class="phase-title-wrap"><div class="phase-title">' + p.title + '</div><div class="phase-sub">' + p.sub + '</div></div>' + (p.focus ? '<span class="phase-badge">' + T('Her hjelper Arvklart deg', 'Arvklart helps you here') + '</span>' : '') + '<span class="chevron">' + ICONS.chevron + '</span></button><div class="phase-body"><div class="phase-body-inner">' + helpNoteHtml + groupsHtml + gsSlotHtml + griefNoteHtml + '</div></div>';

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
    timelineWrap.appendChild(el);
  });
  setupGravferdCheck(document.getElementById('gsCheck'));

  const glossaryWrap = document.getElementById('glossaryWrap');
  localize(GLOSSARY).forEach(g => {
    const wrap = document.createElement('div');
    wrap.className = 'term';
    wrap.innerHTML = '<button type="button" class="term-btn" title="' + g.def.replace(/"/g,'&quot;') + '">' + g.term + '</button><div class="term-def">' + g.def + '</div>';
    wrap.querySelector('.term-btn').addEventListener('click', () => {
      const isOpen = wrap.classList.contains('open');
      document.querySelectorAll('.term.open').forEach(t => { if(t !== wrap) t.classList.remove('open'); });
      wrap.classList.toggle('open', !isOpen);
    });
    glossaryWrap.appendChild(wrap);
  });
  document.addEventListener('click', (e) => {
    if(!e.target.closest('.term')){ document.querySelectorAll('.term.open').forEach(t => t.classList.remove('open')); }
  });

  const resourcesWrap = document.getElementById('resourcesWrap');
  localize(RESOURCES).forEach(cat => {
    const catEl = document.createElement('div');
    catEl.className = 'resource-cat';
    const listHtml = cat.items.map(it => '<a class="resource-card" href="' + it.url + '" target="_blank" rel="noopener noreferrer"><div><div class="rc-name">' + it.name + '</div><div class="rc-blurb">' + it.blurb + '</div></div><span class="rc-arrow">' + ICONS.externalArrow + '</span></a>').join('');
    catEl.innerHTML = '<div class="resource-cat-title">' + cat.icon + '<span>' + cat.cat + '</span></div><div class="resource-list">' + listHtml + '</div>';
    resourcesWrap.appendChild(catEl);
  });

  // The embedding page (GuidePage) decides the button text and handles navigation
  const ctaParams = new URLSearchParams(window.location.search);
  if(ctaParams.get('back') === 'home') { const cta = document.getElementById('ctaLabel'); cta.textContent = 'Tilbake til hjemmesiden'; cta.dataset.en = 'Back to the home page'; }
  document.getElementById('ctaBtn').addEventListener('click', () => {
    if(window.parent !== window) window.parent.postMessage({ type: 'veiviser-back' }, window.location.origin);
    else window.history.back();
  });
})();
