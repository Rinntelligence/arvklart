// Lagring av arveveiviseren i et bo: arvinger med beregnet fordeling, boets verdi,
// oppgaver (neste steg) og selve svarene, slik at brukeren kan gå tilbake og endre dem.
// Rader som kommer fra veiviseren merkes med WIZARD_TAG, slik at de kan erstattes ved ny lagring
// uten å røre det brukeren har lagt inn selv.
import { supabase, createEstate, ensureDefaultCategories } from './supabase'

export const WIZARD_TAG = 'Fra arveveiviseren'
const PENDING_KEY = 'arvklart-veiviser-pending-save'
const localAnswersKey = estateId => `arvklart-veiviser-estate-${estateId}`

const store = {
  get: key => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null } catch { return null } },
  set: (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* privat modus */ } },
  remove: key => { try { localStorage.removeItem(key) } catch { /* ignorer */ } },
}

// Lagring som venter på at brukeren har opprettet bruker eller logget inn.
export const getPendingSave = () => store.get(PENDING_KEY)
export const setPendingSave = data => store.set(PENDING_KEY, { ...data, createdAt: Date.now() })
export const clearPendingSave = () => store.remove(PENDING_KEY)

const genCode = () => Math.random().toString(36).substring(2, 8).toUpperCase()
const str = (v, max) => String(v ?? '').slice(0, max)
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

// Data fra iframen kontrolleres før de skrives til databasen.
function sanitize(payload = {}) {
  return {
    totalValue: payload.totalValue == null ? null : Math.max(0, num(payload.totalValue)),
    heirs: (Array.isArray(payload.heirs) ? payload.heirs : []).slice(0, 100).map(h => ({
      name: str(h.name, 100) || 'Arving',
      relationship: str(h.relationship, 50) || 'Annen',
      percentage: Math.min(100, Math.max(0, num(h.percentage))),
      notes: str(h.notes, 1000),
    })),
    tasks: (Array.isArray(payload.tasks) ? payload.tasks : []).slice(0, 50).map(t => ({
      title: str(t.title, 200),
      description: str(t.description, 2000),
      category: ['Umiddelbart', 'Uke 1', 'Måned 1', 'Fordeling'].includes(t.category) ? t.category : 'Måned 1',
      priority: Math.round(num(t.priority)) || 99,
    })).filter(t => t.title),
  }
}

export async function createWizardEstate(userId, name) {
  const { data, error } = await createEstate({
    name: str(name, 200).trim() || 'Arveoppgjør',
    description: 'Opprettet fra arveveiviseren',
    owner_id: userId, invite_code: genCode(), branding_color: '#3A2F26', status: 'active',
  })
  if (error) return { error }
  const { error: memberError } = await supabase.from('estate_members').insert({ estate_id: data.id, user_id: userId, role: 'admin' })
  if (memberError) return { error: memberError }
  await ensureDefaultCategories(data.id)
  return { data }
}

export async function listAdminEstates(userId) {
  const { data } = await supabase.from('estate_members')
    .select('estate_id, role, estates(id, name)')
    .eq('user_id', userId).eq('role', 'admin')
  return (data || []).map(m => m.estates).filter(Boolean)
}

// Henter boets navn, brukerens rolle og eventuelle lagrede svar.
export async function loadWizardContext(estateId, userId) {
  const [{ data: estate }, { data: member }] = await Promise.all([
    supabase.from('estates').select('id, name').eq('id', estateId).single(),
    supabase.from('estate_members').select('role').eq('estate_id', estateId).eq('user_id', userId).single(),
  ])
  if (!estate) return { estate: null, saved: null }
  // Kolonnen for svar finnes bare når migrasjonen er kjørt – ellers brukes lokal lagring.
  const { data: w, error } = await supabase.from('estates').select('wizard_answers, wizard_updated_at').eq('id', estateId).single()
  const saved = !error && w?.wizard_answers
    ? { answers: w.wizard_answers, savedAt: w.wizard_updated_at }
    : store.get(localAnswersKey(estateId))
  return { estate: { id: estate.id, name: estate.name, role: member?.role || 'member' }, saved }
}

export async function saveWizardToEstate(estateId, userId, { answers, payload }) {
  const p = sanitize(payload)
  const savedAt = new Date().toISOString()

  if (p.totalValue != null) {
    const { error } = await supabase.from('estates').update({ total_value: p.totalValue, split_mode: 'custom' }).eq('id', estateId)
    if (error) return { error }
  }
  const { error: answersError } = await supabase.from('estates').update({ wizard_answers: answers, wizard_updated_at: savedAt }).eq('id', estateId)
  store.set(localAnswersKey(estateId), { answers, savedAt })

  // Arvinger: erstatt de som kom fra veiviseren sist, men behold e-post som er lagt inn
  // på dem (trengs for at arvingen skal kunne bli med i boet).
  const { data: prevHeirs } = await supabase.from('heirs').select('name, email').eq('estate_id', estateId).like('notes', `${WIZARD_TAG}%`)
  const emailByName = new Map((prevHeirs || []).filter(h => h.email).map(h => [h.name, h.email]))
  const { error: delHeirs } = await supabase.from('heirs').delete().eq('estate_id', estateId).like('notes', `${WIZARD_TAG}%`)
  if (delHeirs) return { error: delHeirs }
  if (p.heirs.length) {
    const { error } = await supabase.from('heirs').insert(p.heirs.map(h => ({ ...h, email: emailByName.get(h.name) || null, estate_id: estateId })))
    if (error) return { error }
  }

  // Oppgaver: erstatt de ufullførte fra veiviseren, og hopp over steg som allerede er gjort.
  const { error: delTasks } = await supabase.from('tasks').delete()
    .eq('estate_id', estateId).eq('completed', false).like('description', `%· ${WIZARD_TAG}`)
  if (delTasks) return { error: delTasks }
  const { data: existing } = await supabase.from('tasks').select('title').eq('estate_id', estateId)
  const have = new Set((existing || []).map(t => t.title))
  const newTasks = p.tasks.filter(t => !have.has(t.title))
  if (newTasks.length) {
    const { error } = await supabase.from('tasks').insert(newTasks.map(t => ({ ...t, estate_id: estateId, completed: false, added_by: userId })))
    if (error) return { error }
  }

  return { savedAt, answersInDatabase: !answersError, heirs: p.heirs.length, tasks: newTasks.length }
}
