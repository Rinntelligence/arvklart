// Sletting av en konto og personopplysningene om brukeren (GDPR art. 17). Brukes av delete-account.
// Testes i test/functions/deleteAccount.test.js.
//
// • Bo der brukeren er eneste medlem slettes helt, med filer og tilbakemeldinger knyttet til boet.
// • I bo som deles med andre beholdes boet (det er de andre arvingenes data). Var brukeren eneste admin,
//   blir medlemmet som har vært lengst med admin (og eier), så boet ikke står uten administrator.
// • I delte bo fjernes brukerens navn og id fra gjenstander: «lagt inn av», verdiforslag, stemmer og
//   rettelser av AI-opplysninger. Gjenstandene og bildene brukeren la inn, blir værende i boet.
// • Ønsker (med begrunnelse), «nei takk», kommentarer, tilbakemeldinger, medlemskap og profil slettes.
//   AI-bruk (ai_usage), poeng og founder-rader slettes av databasen når brukeren slettes (on delete cascade);
//   tildelinger, oppgaver og dokumenter beholdes uten kobling til brukeren (on delete set null).
// • Arvingslisten i et delt bo (navn/e-post lagt inn av administrator) er boets data og beholdes.
// • Brukeren slettes til slutt. Feiler noe underveis, kan sletting prøves på nytt med samme resultat.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { deleteEstate } from './estateFiles.ts'

const must = <T>(res: { data: T; error: unknown }) => {
  if (res.error) throw res.error
  return res.data
}

type Suggestion = { user_id?: string | null; name?: string }
type Correction = { value?: unknown; by?: string | null; at?: string }

// Fjerner brukeren fra én gjenstand. Returnerer endringene, eller null hvis ingenting gjelder brukeren.
export function scrubItem(item: Record<string, unknown>, userId: string) {
  const patch: Record<string, unknown> = {}
  const suggestions = Array.isArray(item.value_suggestions) ? item.value_suggestions as Suggestion[] : []
  if (suggestions.some(s => s?.user_id === userId)) {
    patch.value_suggestions = suggestions.map(s => (s?.user_id === userId ? { ...s, user_id: null, name: 'Slettet bruker' } : s))
  }
  const voters = Array.isArray(item.value_voter_ids) ? item.value_voter_ids as string[] : []
  if (voters.includes(userId)) patch.value_voter_ids = voters.filter(v => v !== userId) // stemmen telles fortsatt, anonymt
  const ai = item.ai_analysis as { corrections?: Record<string, Correction> } | null
  if (ai?.corrections && Object.values(ai.corrections).some(c => c?.by === userId)) {
    patch.ai_analysis = { ...ai, corrections: Object.fromEntries(Object.entries(ai.corrections).map(([k, c]) => [k, c?.by === userId ? { ...c, by: null } : c])) }
  }
  return Object.keys(patch).length ? patch : null
}

export async function deleteAccountData(admin: SupabaseClient, userId: string) {
  const memberships = must(await admin.from('estate_members').select('estate_id, role').eq('user_id', userId)) || []
  const shared: string[] = []
  let deletedEstates = 0

  for (const { estate_id: estateId } of memberships as { estate_id: string }[]) {
    const members = must(await admin.from('estate_members').select('user_id, role, joined_at').eq('estate_id', estateId).order('joined_at')) || []
    const others = (members as { user_id: string; role: string }[]).filter(m => m.user_id !== userId)
    if (!others.length) {
      await deleteEstate(admin, estateId)
      deletedEstates++
      continue
    }
    shared.push(estateId)
    if (!others.some(m => m.role === 'admin')) {
      must(await admin.from('estate_members').update({ role: 'admin' }).eq('estate_id', estateId).eq('user_id', others[0].user_id))
      others[0].role = 'admin'
    }
    const estate = must(await admin.from('estates').select('owner_id').eq('id', estateId).maybeSingle()) as { owner_id?: string } | null
    if (estate?.owner_id === userId) {
      const next = others.find(m => m.role === 'admin') || others[0]
      must(await admin.from('estates').update({ owner_id: next.user_id }).eq('id', estateId))
    }
  }

  let scrubbed = 0
  if (shared.length) {
    must(await admin.from('items').update({ added_by_name: null }).eq('added_by', userId).in('estate_id', shared))
    const items = must(await admin.from('items').select('id, value_suggestions, value_voter_ids, ai_analysis').in('estate_id', shared)) || []
    for (const item of items as Record<string, unknown>[]) {
      const patch = scrubItem(item, userId)
      if (!patch) continue
      must(await admin.from('items').update(patch).eq('id', item.id as string))
      scrubbed++
    }
  }

  for (const table of ['interests', 'item_passes', 'comments', 'feedback', 'estate_members', 'profiles']) {
    must(await admin.from(table).delete().eq('user_id', userId))
  }
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw error
  return { deleted_estates: deletedEstates, shared_estates: shared.length, items_scrubbed: scrubbed }
}
