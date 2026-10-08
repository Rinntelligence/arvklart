// Sletter kontoen til den innloggede brukeren og personopplysningene om hen (GDPR art. 17).
//
// • Bo der brukeren er eneste medlem slettes helt, med filer og tilbakemeldinger knyttet til boet.
// • I bo som deles med andre beholdes boet. Var brukeren eneste admin, blir det medlemmet som har
//   vært lengst med admin (og eier), slik at boet ikke blir stående uten noen som kan administrere det.
// • Navnet fjernes fra gjenstander brukeren la inn og fra verdiforslag.
import { adminClient, getUser, isDemoEmail, json, preflight } from '../_shared/http.ts'
import { deleteEstate } from '../_shared/estateFiles.ts'

const must = <T>(res: { data: T; error: unknown }) => {
  if (res.error) throw res.error
  return res.data
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  try {
    const user = await getUser(req)
    if (!user) return json({ success: false, error: 'Du må være logget inn' }, 401)
    if (isDemoEmail(user.email)) return json({ success: false, error: 'Demokontoen kan ikke slettes' }, 403)

    const userId = user.id
    const admin = adminClient()

    const memberships = must(await admin.from('estate_members').select('estate_id, role').eq('user_id', userId)) || []
    const sharedEstateIds: string[] = []

    for (const { estate_id: estateId } of memberships) {
      const members = must(await admin.from('estate_members')
        .select('user_id, role, joined_at').eq('estate_id', estateId).order('joined_at')) || []
      const others = members.filter(m => m.user_id !== userId)

      if (!others.length) {
        await deleteEstate(admin, estateId)
        continue
      }

      sharedEstateIds.push(estateId)
      if (!others.some(m => m.role === 'admin')) {
        must(await admin.from('estate_members').update({ role: 'admin' }).eq('estate_id', estateId).eq('user_id', others[0].user_id))
      }
      const estate = must(await admin.from('estates').select('owner_id').eq('id', estateId).single())
      if (estate?.owner_id === userId) {
        const nextOwner = others.find(m => m.role === 'admin') || others[0]
        must(await admin.from('estates').update({ owner_id: nextOwner.user_id }).eq('id', estateId))
      }
    }

    if (sharedEstateIds.length) {
      must(await admin.from('items').update({ added_by_name: null }).eq('added_by', userId).in('estate_id', sharedEstateIds))
      const items = must(await admin.from('items').select('id, value_suggestions')
        .in('estate_id', sharedEstateIds).not('value_suggestions', 'is', null)) || []
      for (const item of items) {
        const list = Array.isArray(item.value_suggestions) ? item.value_suggestions : []
        if (!list.some((s: { user_id?: string }) => s?.user_id === userId)) continue
        const scrubbed = list.map((s: { user_id?: string }) => (s?.user_id === userId ? { ...s, user_id: null, name: 'Slettet bruker' } : s))
        must(await admin.from('items').update({ value_suggestions: scrubbed }).eq('id', item.id))
      }
    }

    must(await admin.from('interests').delete().eq('user_id', userId))
    must(await admin.from('item_passes').delete().eq('user_id', userId))
    must(await admin.from('comments').delete().eq('user_id', userId))
    must(await admin.from('feedback').delete().eq('user_id', userId))
    must(await admin.from('estate_members').delete().eq('user_id', userId))
    must(await admin.from('profiles').delete().eq('user_id', userId))

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw deleteError

    return json({ success: true })
  } catch (e) {
    console.error('delete-account:', e)
    return json({ success: false, error: e instanceof Error ? e.message : String((e as { message?: string })?.message || e) }, 500)
  }
})
