// Oversikten i et bo (EstatePage): tallene, «Anbefalt nå» og nedtrekksgruppene med valgene.
// Ren logikk uten Supabase og React, slik at den kan testes med node --test (test/estate/overview.test.js).
//
// Oversikten viser bare hva brukeren kan gjøre. Hvert valg leder videre til en egen side (en «løype»):
// sveiping, legg til, alle gjenstander, løsningsmetoder, fordelingen osv. Detaljene står der, ikke her.
import { getUndecided, isContested } from './estateProgress.js'
import { L } from './lang.js'

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
const items = n => count(n, L('gjenstand', 'item'), L('gjenstander', 'items'))

// Tallene oversikten bygger på. extras er { members, passes, heirs, tasks } fra loadStatusExtras(), eller null
// mens de lastes; da er tallene som avhenger av dem null eller 0.
export function overviewCounts({ items: all, userId, extras }) {
  const mine = all.filter(i => i.interests?.some(x => x.user_id === userId))
  const undecided = extras ? getUndecided(all, extras.members, extras.passes, extras.heirs) : []
  return {
    total: all.length,
    assigned: all.filter(i => i.status === 'assigned').length,
    contested: all.filter(isContested).length,
    // Samme regel som filteret «Ingen vil ha» i gjenstandslisten (itemFilters.js) og unwantedItems()
    unwanted: all.filter(i => i.status !== 'assigned' && !i.interests?.length).length,
    mine: mine.length,
    myContested: mine.filter(isContested).length,
    myUndecided: undecided.find(u => u.member.user_id === userId)?.items.length || 0,
    undecidedMembers: undecided.length,
    members: extras ? extras.members.length : null,
    openTasks: extras ? extras.tasks.filter(t => !t.completed).length : null,
  }
}

// «Anbefalt nå»: den ene tingen som er viktigst for denne brukeren akkurat nå, med én knapp.
// steps er buildRemainingSteps(...) (null mens det lastes). Returnerer null når det ikke er noe å anbefale.
// Resultat: { key, title, text, path, action }
export function recommendation({ estateId, estate, counts, steps, isAdmin, isDemo }) {
  const base = `/estate/${estateId}`
  if (estate?.status === 'closed') return null

  // Tomt bo: kom i gang. Demoen har alltid gjenstander, og kan ikke lagre nye.
  if (counts.total === 0) {
    if (isDemo) return null
    return {
      key: 'add',
      title: L('Legg inn det som er i boet', 'Add what is in the estate'),
      text: L('Ta bilder av gjenstandene, rom for rom. Arvklart foreslår navn, kategori og verdi.', 'Take photos of the items, room by room. Arvklart suggests a name, category and value.'),
      path: `${base}/add-many`,
      action: L('Legg til gjenstander', 'Add items'),
    }
  }

  // Et forslag til fordeling venter på svar fra meg
  const respond = steps?.find(s => s.key === 'respond')
  if (respond) return { key: 'respond', title: respond.title, text: respond.detail, path: respond.path, action: L('Svar på forslaget', 'Respond to the proposal') }

  // Egne svar kommer først: fordelingen kan ikke starte før alle har tatt stilling
  if (counts.myUndecided > 0) {
    return {
      key: 'decide',
      title: L(`Du har ${items(counts.myUndecided)} du ikke har tatt stilling til`, `You have ${items(counts.myUndecided)} you have not decided on`),
      text: L('Si ja eller nei takk til hver av dem, så kan fordelingen starte.', 'Say yes or no thanks to each of them so the distribution can start.'),
      path: `${base}/swipe`,
      action: L('Gå gjennom nå', 'Review now'),
    }
  }

  // En arving med ønsker som andre også har: snakk sammen før noe bestemmes
  if (!isAdmin && counts.myContested > 0) {
    return {
      key: 'talk',
      title: L(`${counts.myContested} av ønskene dine ønskes også av andre`, `${counts.myContested} of your wishes ${counts.myContested === 1 ? 'is' : 'are'} also wanted by others`),
      text: L('Les hvorfor de andre ønsker dem, og snakk sammen før noe blir bestemt.', 'Read why the others want them, and talk before anything is decided.'),
      path: `${base}/gjenstander?vis=ettertraktede`,
      action: L('Se gjenstandene', 'See the items'),
    }
  }

  if (!steps) return null // resten avhenger av hva som gjenstår, som fortsatt lastes

  // Administrator: det første steget som gjenstår og som hen kan gjøre noe med
  if (isAdmin) {
    const next = steps.find(s => s.path && s.key !== 'tasks')
    if (next) return { key: next.key, title: next.title, text: next.detail || '', path: next.path, action: next.pathLabel || L('Åpne', 'Open') }
  }

  // Venter på at andre tar stilling
  const decide = steps.find(s => s.key === 'decide')
  if (decide) {
    return {
      key: 'waiting',
      title: L('Du har svart på alt', 'You have answered everything'),
      text: L(`Venter på at de andre tar stilling. ${decide.detail}`, `Waiting for the others to decide. ${decide.detail}`),
      path: `${base}/status`,
      action: L('Se hva som gjenstår', 'See what remains'),
    }
  }

  const left = steps.filter(s => s.key !== 'tasks')
  if (left.length) {
    return {
      key: 'remaining',
      title: L(`${count(left.length, 'steg', 'steg')} gjenstår før fordelingen er ferdig`, `${count(left.length, 'step', 'steps')} left before the distribution is finished`),
      text: isAdmin
        ? L('Se hva som gjenstår, og hva du kan gjøre nå.', 'See what remains, and what you can do now.')
        : L('Administrator tar de neste stegene. Du kan følge med her.', 'The administrator takes the next steps. You can follow along here.'),
      path: `${base}/status`,
      action: L('Se hva som gjenstår', 'See what remains'),
    }
  }

  return {
    key: 'done',
    title: L('Alle gjenstandene er avklart', 'All the items are settled'),
    text: L('Se hvem som får hva, og last ned protokollen.', 'See who gets what, and download the record.'),
    path: `${base}/fordeling`,
    action: L('Se fordelingen', 'See the distribution'),
  }
}

// Nedtrekksgruppene under «Hva vil du gjøre?». Hver lenke går til en egen side.
// Demoen viser bare det demokontoen kan bruke: sidene som er sperret for den i App.jsx (notForDemo:
// administrer, dokumenter, oppgaver og bidrag) vises ikke, og gjenstander kan prøves med AI, men ikke lagres.
// Lenke: { key, path, title, desc, badge?, count?, countLabel? }. badge er noe som venter på deg (uthevet tall),
// count er et nøytralt antall, og countLabel en kort nøytral tekst («3 igjen»).
export function overviewGroups({ estateId, counts, steps, isAdmin, isDemo }) {
  const base = `/estate/${estateId}`
  const groups = [
    {
      key: 'gjenstander',
      title: L('Gjenstander', 'Items'),
      desc: L('Ta stilling, legg til og se alt i boet', 'Decide, add and see everything in the estate'),
      hint: counts.myUndecided ? L(`${counts.myUndecided} venter på deg`, `${counts.myUndecided} waiting for you`) : '',
      links: [
        { key: 'swipe', path: `${base}/swipe`, title: L('Ta stilling til gjenstander', 'Decide on items'), desc: L('Si ja eller nei takk, én og én', 'Say yes or no thanks, one at a time'), badge: counts.myUndecided },
        isDemo
          ? { key: 'add-ai', path: `${base}/add`, title: L('Prøv AI-verdivurdering', 'Try AI valuation'), desc: L('Ta et bilde og se hva AI-en foreslår. Ingenting lagres i demoen', 'Take a photo and see what the AI suggests. Nothing is saved in the demo') }
          : { key: 'add-many', path: `${base}/add-many`, title: L('Legg til gjenstander', 'Add items'), desc: L('Ta bilder av flere gjenstander, rom for rom', 'Photograph several items, room by room') },
        !isDemo && { key: 'add-one', path: `${base}/add`, title: L('Legg til én gjenstand', 'Add one item'), desc: L('Med AI-forslag til navn, kategori og verdi', 'With AI suggestions for name, category and value') },
        { key: 'items', path: `${base}/gjenstander`, title: L('Alle gjenstander', 'All items'), desc: L('Bilder, søk, filter og analyse', 'Photos, search, filters and analytics'), count: counts.total },
        { key: 'mine', path: `${base}/gjenstander?vis=mine`, title: L('Mine ønsker', 'My wishes'), desc: L('Det du ønsker, med begrunnelsene dine', 'What you want, with your reasons'), count: counts.mine },
      ],
    },
    {
      key: 'fordeling',
      title: L('Fordeling', 'Distribution'),
      desc: L('Løs uenighet, tildel og godkjenn', 'Resolve disagreements, assign and approve'),
      hint: counts.contested ? L(`${counts.contested} ettertraktede`, `${counts.contested} contested`) : '',
      links: [
        {
          key: 'conflicts', path: `${base}/conflicts`, title: L('Løsningsmetoder', 'Resolution methods'),
          desc: counts.undecidedMembers
            ? L(`Når flere ønsker det samme. Venter på ${count(counts.undecidedMembers, 'arving', 'arvinger')}`, `When several want the same. Waiting for ${count(counts.undecidedMembers, 'heir', 'heirs')}`)
            : L('Når flere ønsker det samme: snakk sammen, loddtrekning eller valgrunder', 'When several want the same: talk, draw lots or take turns'),
          badge: counts.contested,
        },
        {
          key: 'distribution', path: `${base}/fordeling`, title: L('Fordelingen', 'The distribution'),
          desc: isAdmin
            ? L('Tildel, se hvem som får hva, og last ned protokollen', 'Assign, see who gets what, and download the record')
            : L('Se hvem som får hva, og godkjenn fordelingen', 'See who gets what, and approve the distribution'),
        },
        {
          key: 'unwanted', path: `${base}/ingen-vil-ha`, title: L('Ingen vil ha', 'Unwanted'),
          desc: isAdmin
            ? L('Bestem om det skal selges, gis bort eller kastes', 'Decide whether to sell, give away or discard')
            : L('Se hva som skjer med det ingen ønsker', 'See what happens to what no one wants'),
          count: counts.unwanted,
        },
        {
          key: 'status', path: `${base}/status`, title: L('Hva gjenstår', 'What remains'),
          desc: L('Alt som må på plass før boet er fordelt', 'Everything that must be done before the estate is distributed'),
          countLabel: !steps ? undefined : steps.length ? L(`${steps.length} steg`, `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`) : L('Alt klart', 'All done'),
        },
      ],
    },
    {
      key: 'arvinger',
      title: L('Arvinger', 'Heirs'),
      desc: isAdmin
        ? L('Hvem som arver, andeler og invitasjoner', 'Who inherits, shares and invitations')
        : L('Hvem som er med, og hvem som godkjenner', 'Who is involved, and who approves'),
      hint: '',
      links: [
        {
          key: 'heirs', path: `${base}/heirs`,
          title: isAdmin ? L('Arvinger og fordelingskalkulator', 'Heirs and distribution calculator') : L('Arvingene', 'The heirs'),
          desc: isAdmin
            ? L('Andeler, hvem som kan få gjenstander og hvem som må godkjenne', 'Shares, who can receive items and who must approve')
            : L('Hvem som er med, og hvem som må godkjenne fordelingen', 'Who is involved, and who must approve the distribution'),
        },
        isAdmin && !isDemo && { key: 'invite', path: `${base}/admin`, title: L('Inviter arvinger', 'Invite heirs'), desc: L('Send invitasjoner, eller kopier lenken', 'Send invitations, or copy the link') },
      ],
    },
    {
      key: 'praktisk',
      title: L('Praktisk', 'Practical'),
      desc: isDemo
        ? L('Sjekkliste og veiviser', 'Checklist and guide')
        : L('Sjekkliste, oppgaver, dokumenter og veiviser', 'Checklist, tasks, documents and guide'),
      hint: '',
      links: [
        { key: 'tasks', path: `${base}/tasks`, title: L('Sjekkliste', 'Checklist'), desc: L('Praktiske oppgaver etter dødsfallet', 'Practical tasks after the death'), countLabel: counts.openTasks ? L(`${counts.openTasks} igjen`, `${counts.openTasks} left`) : undefined },
        !isDemo && { key: 'goodwill', path: `${base}/goodwill`, title: L('Oppgaver og bidrag', 'Tasks and contributions'), desc: L('Hvem tar hva, som rydding og kjøring', 'Who does what, like clearing and driving') },
        !isDemo && { key: 'documents', path: `${base}/documents`, title: L('Dokumenter', 'Documents'), desc: L('Testament, skjøter og verdivurderinger', 'Wills, deeds and valuations') },
        { key: 'guide', path: `${base}/guide`, title: L('Veiviser', 'Guide'), desc: L('Steg for steg gjennom arveoppgjøret', 'Step by step through the estate settlement') },
      ],
    },
  ]
  return groups.map(g => ({ ...g, links: g.links.filter(Boolean) }))
}
