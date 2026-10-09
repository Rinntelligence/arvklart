import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, getEstateMembers } from '../lib/supabase'
import { isOverdue, formatDateOnly } from '../lib/format'
import { L } from '../lib/lang'
import { Modal } from '../components/UI'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

// Standardoppgavene lagres alltid på norsk (delt innhold i boet, uavhengig av hvem som laster listen)
// og oversettes ved visning. Oppgaver brukerne skriver selv vises som de er skrevet.
const DEFAULT_TASKS = [
  { category: 'Umiddelbart', title: 'Registrer dødsfallet', description: 'Innhent dødsattest fra sykehus eller lege', title_en: 'Register the death', description_en: 'Obtain a death certificate from the hospital or doctor', priority: 1 },
  { category: 'Umiddelbart', title: 'Varsle nærmeste familie', description: 'Informer nærmeste familiemedlemmer og nære venner', title_en: 'Notify close family', description_en: 'Inform close family members and close friends', priority: 2 },
  { category: 'Umiddelbart', title: 'Kontakt begravelsesbyrå', description: 'Planlegg begravelse og gravferd eller kremasjon', title_en: 'Contact a funeral home', description_en: 'Plan the funeral and burial or cremation', priority: 3 },
  { category: 'Uke 1', title: 'Varsle banken', description: 'Informer alle banker og fryse eller overføre kontoer', title_en: 'Notify the bank', description_en: 'Inform all banks and freeze or transfer accounts', priority: 4 },
  { category: 'Uke 1', title: 'Finn testamentet', description: 'Finn original signert testament og relaterte dokumenter', title_en: 'Find the will', description_en: 'Find the original signed will and related documents', priority: 5 },
  { category: 'Uke 1', title: 'Kontakt livsforsikring', description: 'Meld krav til alle livsforsikringsleverandører', title_en: 'Contact life insurers', description_en: 'File claims with all life insurance providers', priority: 6 },
  { category: 'Uke 1', title: 'Sikre eiendommen', description: 'Sørg for at bolig og verdisaker er låst og sikret', title_en: 'Secure the property', description_en: 'Make sure the home and valuables are locked and secured', priority: 7 },
  { category: 'Måned 1', title: 'Start skiftebehandling', description: 'Start den juridiske prosessen for å fordele boet', title_en: 'Start the probate process', description_en: 'Start the legal process of distributing the estate', priority: 8 },
  { category: 'Måned 1', title: 'Kanseller abonnementer', description: 'Avslutt strømmetjenester, telefon, treningssenter og andre løpende tjenester', title_en: 'Cancel subscriptions', description_en: 'End streaming services, phone, gym and other recurring services', priority: 9 },
  { category: 'Måned 1', title: 'Videresend post', description: 'Sett opp postvideresending til bobestyrer', title_en: 'Forward mail', description_en: 'Set up mail forwarding to the estate administrator', priority: 10 },
  { category: 'Måned 1', title: 'Varsle NAV og pensjon', description: 'Informer relevante statlige og pensjonsinstanser', title_en: 'Notify NAV and pension providers', description_en: 'Inform the relevant government and pension bodies', priority: 11 },
  { category: 'Måned 1', title: 'Lever siste selvangivelse', description: 'Forbered og lever siste personlige selvangivelse', title_en: 'File the final tax return', description_en: 'Prepare and file the final personal tax return', priority: 12 },
  { category: 'Fordeling', title: 'Inventariser alle eiendeler', description: 'Lag fullstendig liste over eiendom, kontoer, kjøretøy og verdisaker', title_en: 'Inventory all assets', description_en: 'Make a complete list of property, accounts, vehicles and valuables', priority: 13 },
  { category: 'Fordeling', title: 'Betal utestående gjeld', description: 'Gjør opp eventuelle lån, kredittkort eller regninger', title_en: 'Pay outstanding debts', description_en: 'Settle any loans, credit cards or bills', priority: 14 },
  { category: 'Fordeling', title: 'Fordel boet til arvingene', description: 'Overfør eiendeler og gjenstander i henhold til testamentet', title_en: 'Distribute the estate to the heirs', description_en: 'Transfer assets and items according to the will', priority: 15 },
  { category: 'Fordeling', title: 'Lukk bokontoer', description: 'Avslutt eventuelle bokontoer og fullfør det siste papirarbeidet', title_en: 'Close estate accounts', description_en: 'Close any estate accounts and complete the final paperwork', priority: 16 },
]

const CATEGORY_ORDER = ['Umiddelbart', 'Uke 1', 'Måned 1', 'Fordeling']
// Kategoriene lagres på norsk i databasen og oversettes bare ved visning
const CATEGORY_EN = { 'Umiddelbart': 'Immediately', 'Uke 1': 'Week 1', 'Måned 1': 'Month 1', 'Fordeling': 'Distribution', 'Annet': 'Other' }
const catLabel = c => L(c, CATEGORY_EN[c] || c)

// Standardoppgavene vises på brukerens språk, også i bo der de ble lagret på engelsk før dette ble endret.
// Teksten oversettes bare når den fortsatt er standardteksten (ikke hvis noen har endret den).
const DEFAULT_TEXT = new Map()
for (const t of DEFAULT_TASKS) {
  for (const [no, en] of [[t.title, t.title_en], [t.description, t.description_en]]) {
    DEFAULT_TEXT.set(no, { no, en })
    DEFAULT_TEXT.set(en, { no, en })
  }
}
const taskText = text => {
  const d = text && DEFAULT_TEXT.get(text)
  return d ? L(d.no, d.en) : text
}
const CATEGORY_COLORS = {
  'Umiddelbart': { bg: '#DCE3D2', border: '#B8C8A8', text: '#3A5A30', dot: '#5F6E52' },
  'Uke 1':       { bg: '#E8EAD8', border: '#C4C8A8', text: '#4A5230', dot: '#8B9A7D' },
  'Måned 1':     { bg: '#DCE3D2', border: '#B8C8A8', text: '#3A5A30', dot: '#8B9A7D' },
  'Fordeling':   { bg: '#E8E4D4', border: '#C8BEA0', text: '#5C4530', dot: '#9C8267' },
}

export default function TasksPage({ session, onToast, isDemo }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [confirmTask, setConfirmTask] = useState(null)
  const [newTask, setNewTask] = useState({ title: '', description: '', category: 'Uke 1', due_date: '' })
  const [myRole, setMyRole] = useState('member')

  const load = async () => {
    const [{ data: ts }, { data: mems }, { data: mem }] = await Promise.all([
      // tasks.assigned_to peker ikke på profiles, så profilen hentes fra medlemslisten i stedet for en join
      supabase.from('tasks').select('*').eq('estate_id', id).order('priority').order('created_at'),
      getEstateMembers(id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
    ])
    setTasks((ts || []).map(t => ({ ...t, assigned_to_profile: mems?.find(m => m.user_id === t.assigned_to)?.profiles || null })))
    setMembers(mems || [])
    setMyRole(mem?.role || 'member')
    setLoading(false)
  }

  // Viser feilen og laster listen på nytt uansett, så skjermen stemmer med databasen.
  const run = async (query, errMsg) => {
    const { error } = await query
    if (error) onToast(errMsg, 'error')
    load()
    return !error
  }

  const seedTasks = () => run(
    // Sjekklisten lagres på norsk; title_en/description_en er ikke kolonner i tasks
    supabase.from('tasks').insert(DEFAULT_TASKS.map(({ title_en, description_en, ...t }) => ({
      ...t,
      estate_id: id, completed: false, added_by: session.user.id,
    }))),
    L('Kunne ikke laste sjekklisten', 'Could not load the checklist'),
  )

  useEffect(() => { load() }, [id])

  const toggleTask = (task) => run(
    supabase.from('tasks').update({ completed: !task.completed, completed_by: !task.completed ? session.user.id : null, completed_at: !task.completed ? new Date().toISOString() : null }).eq('id', task.id),
    L('Kunne ikke oppdatere oppgaven', 'Could not update the task'),
  )

  const assignTask = (taskId, userId) => run(
    supabase.from('tasks').update({ assigned_to: userId || null }).eq('id', taskId),
    L('Kunne ikke tildele oppgaven', 'Could not assign the task'),
  )

  const addTask = async () => {
    if (!newTask.title.trim()) return
    const ok = await run(supabase.from('tasks').insert({
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      category: newTask.category,
      due_date: newTask.due_date || null, // tom streng er ikke en gyldig dato
      estate_id: id, completed: false, added_by: session.user.id, priority: 99,
    }), L('Kunne ikke legge til oppgaven', 'Could not add the task'))
    if (!ok) return
    setNewTask({ title: '', description: '', category: 'Uke 1', due_date: '' })
    setShowAdd(false)
  }

  const deleteTask = (taskId) => run(supabase.from('tasks').delete().eq('id', taskId), L('Kunne ikke slette oppgaven', 'Could not delete the task'))

  const completed = tasks.filter(t => t.completed).length
  const total = tasks.length
  const progress = total ? Math.round((completed / total) * 100) : 0

  if (loading) return <Loader />

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    acc[cat] = tasks.filter(t => t.category === cat)
    return acc
  }, {})
  const otherCats = [...new Set(tasks.map(t => t.category))].filter(c => !CATEGORY_ORDER.includes(c))
  otherCats.forEach(cat => { grouped[cat] = tasks.filter(t => t.category === cat) })
  const allCats = [...CATEGORY_ORDER, ...otherCats].filter(cat => (grouped[cat] || []).length > 0)

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 16px', fontFamily: 'Karla, sans-serif' }}>
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#75604B', cursor: 'pointer', fontSize: '0.8125rem', padding: '0 0 20px', fontFamily: 'Karla, sans-serif' }}>{L('← Tilbake til boet', '← Back to the estate')}</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.625rem', fontWeight: '400', color: '#3A2F26', marginBottom: '4px' }}>{L('Oppgaveliste', 'Task list')}</h1>
          <p style={{ color: '#75604B', fontSize: '0.875rem' }}>{L('Steg-for-steg-veiledning gjennom arveprosessen', 'Step-by-step guidance through the inheritance process')}</p>
        </div>
        {!isDemo && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tasks.length === 0 && (
            <button onClick={seedTasks} style={{ padding: '9px 18px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', whiteSpace: 'nowrap' }}>
              {L('Last standard sjekkliste', 'Load standard checklist')}
            </button>
          )}
          <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '9px 18px', background: '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif', whiteSpace: 'nowrap' }}>
            {L('+ Legg til oppgave', '+ Add task')}
          </button>
        </div>}
      </div>

      {/* Fremdriftslinje */}
      {total > 0 && (
        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '0.875rem', color: '#3A2F26', fontWeight: '500' }}>{L('Samlet fremdrift', 'Overall progress')}</span>
            <span style={{ fontSize: '1.375rem', fontFamily: 'Fraunces, serif', color: progress === 100 ? '#5F6E52' : '#3A2F26' }}>{progress}%</span>
          </div>
          <div style={{ height: '8px', background: '#E8DFD0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#8B9A7D' : '#5F6E52', borderRadius: '4px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#75604B', marginTop: '8px' }}>{L(`${completed} av ${total} oppgaver fullført`, `${completed} of ${total} tasks completed`)}</div>
        </div>
      )}

      {/* Legg til oppgave */}
      {showAdd && (
        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1rem', color: '#3A2F26', marginBottom: '16px', fontFamily: 'Fraunces, serif', fontWeight: '400' }}>{L('Legg til egendefinert oppgave', 'Add a custom task')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder={L('Oppgavetittel *', 'Task title *')} maxLength={200}
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #9A8B78', borderRadius: '8px', fontSize: '0.875rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
            <input value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder={L('Beskrivelse (valgfri)', 'Description (optional)')} maxLength={1000}
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #9A8B78', borderRadius: '8px', fontSize: '0.875rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid #9A8B78', borderRadius: '8px', fontSize: '0.875rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif' }}>
                {[...CATEGORY_ORDER, 'Annet'].map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
              <input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid #9A8B78', borderRadius: '8px', fontSize: '0.875rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', color: '#5C4530', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={addTask} disabled={!newTask.title.trim()} style={{ flex: 2, padding: '10px', background: newTask.title.trim() ? '#3A2F26' : '#D9CFC0', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: newTask.title.trim() ? 'pointer' : 'not-allowed', fontSize: '0.875rem', fontFamily: 'Karla, sans-serif' }}>{L('Legg til oppgave', 'Add task')}</button>
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#75604B' }}>
          <p style={{ marginBottom: '20px', fontSize: '0.9375rem' }}>{L('Ingen oppgaver ennå. Last standard sjekkliste for å komme i gang.', 'No tasks yet. Load the standard checklist to get started.')}</p>
          {!isDemo && <button onClick={seedTasks} style={{ padding: '12px 28px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9375rem', fontFamily: 'Karla, sans-serif' }}>{L('Last standard sjekkliste', 'Load standard checklist')}</button>}
        </div>
      ) : (
        allCats.map(cat => {
          const catTasks = grouped[cat] || []
          const colors = CATEGORY_COLORS[cat] || { bg: '#FBF9F5', border: '#D9CFC0', text: '#5C4530', dot: '#9C8267' }
          const catDone = catTasks.filter(t => t.completed).length
          return (
            <div key={cat} style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '1.0625rem', fontWeight: '400', color: '#3A2F26' }}>{catLabel(cat)}</h2>
                <span style={{ fontSize: '0.75rem', color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, padding: '2px 8px', borderRadius: '20px' }}>{catDone}/{catTasks.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {catTasks.map(task => (
                  <TaskRow key={task.id} task={task} members={members} session={session} myRole={myRole} readOnly={isDemo}
                    onToggle={() => toggleTask(task)}
                    onAssign={(uid) => assignTask(task.id, uid)}
                    onDelete={() => setConfirmTask(task)} />
                ))}
              </div>
            </div>
          )
        })
      )}
      {confirmTask && (
        <Modal onClose={() => setConfirmTask(null)} labelledBy="delete-task-title" maxWidth={400}>
            <h3 id="delete-task-title" style={{ fontFamily:'Fraunces, serif', fontSize:'1.125rem', fontWeight:'400', color:'#3A2F26', marginBottom:'8px' }}>{L('Slette oppgaven?', 'Delete the task?')}</h3>
            <p style={{ fontSize:'0.875rem', color:'#5C4530' }}>«{taskText(confirmTask.title)}»</p>
            <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
              <button onClick={() => setConfirmTask(null)} style={{ flex:1, minHeight:'44px', padding:'11px', background:'none', border:'1px solid #9A8B78', borderRadius:'8px', cursor:'pointer', color:'#5C4530', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Avbryt', 'Cancel')}</button>
              <button onClick={() => { deleteTask(confirmTask.id); setConfirmTask(null) }} style={{ flex:1, minHeight:'44px', padding:'11px', background:'#8B3A3A', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontSize:'0.875rem', fontFamily:'Karla, sans-serif' }}>{L('Slett', 'Delete')}</button>
            </div>
        </Modal>
      )}
    </div>
  )
}

function TaskRow({ task, members, myRole, readOnly, onToggle, onAssign, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const overdue = !task.completed && isOverdue(task.due_date)

  return (
    <div style={{
      background: task.completed ? '#f9f9f9' : '#fff',
      border: `1px solid ${overdue ? '#C8BEA0' : '#D9CFC0'}`,
      borderRadius: '10px', overflow: 'hidden',
      opacity: task.completed ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <button onClick={e => { e.stopPropagation(); if (!readOnly) onToggle() }} disabled={readOnly} style={{
          width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
          background: task.completed ? '#8B9A7D' : '#fff',
          border: `2px solid ${task.completed ? '#8B9A7D' : '#D9CFC0'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', color: '#fff',
        }}>{task.completed ? '✓' : ''}</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.875rem', color: '#3A2F26', textDecoration: task.completed ? 'line-through' : 'none', lineHeight: '1.4' }}>{taskText(task.title)}</div>
          {task.description && !expanded && <div style={{ fontSize: '0.75rem', color: '#75604B', marginTop: '2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{taskText(task.description)}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {overdue && <span style={{ fontSize: '0.6875rem', background: '#E8DFD0', color: '#5C4530', padding: '2px 7px', borderRadius: '20px' }}>{L('Forfalt', 'Overdue')}</span>}
          {task.due_date && !overdue && <span style={{ fontSize: '0.6875rem', color: '#75604B' }}>{formatDateOnly(task.due_date)}</span>}
          {task.assigned_to_profile && (
            <div title={task.assigned_to_profile.display_name} style={{ width: '24px', height: '24px', borderRadius: '50%', background: task.assigned_to_profile.avatar_color || '#DCE3D2', border:tc(task.assigned_to_profile.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.625rem', color: tc(task.assigned_to_profile.avatar_color || '#DCE3D2'), fontWeight: '500' }}>
              {task.assigned_to_profile.display_name[0].toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: '0.75rem', color: '#75604B' }} aria-hidden="true">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #E8DFD0' }}>
          {task.description && <p style={{ fontSize: '0.8125rem', color: '#5C4530', lineHeight: '1.6', margin: '12px 0' }}>{taskText(task.description)}</p>}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#75604B' }}>{L('Tildel til:', 'Assign to:')}</span>
              <select value={task.assigned_to || ''} onChange={e => onAssign(e.target.value)} disabled={readOnly}
                style={{ padding: '5px 10px', border: '1px solid #9A8B78', borderRadius: '6px', fontSize: '0.8125rem', background: '#FBF9F5', color: '#3A2F26', fontFamily: 'Karla, sans-serif' }}>
                <option value="">{L('— ikke tildelt —', '— not assigned —')}</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
              </select>
            </div>
            {myRole === 'admin' && !readOnly && (
              <button onClick={onDelete} style={{ fontSize: '0.75rem', color: '#75604B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Karla, sans-serif', marginLeft: 'auto' }}>{L('Slett oppgave', 'Delete task')}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Loader() {
  return <div style={{ padding: '80px', textAlign: 'center', color: '#75604B', fontFamily: 'Karla, sans-serif' }}>{L('Laster…', 'Loading…')}</div>
}
