import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const tc = c => { if(!c)return'#FBF9F5'; const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16); return(0.299*r+0.587*g+0.114*b)/255>0.55?'#3A2F26':'#FBF9F5' }

const DEFAULT_TASKS = [
  { category: 'Umiddelbart', title: 'Registrer dødsfallet', description: 'Innhent dødsattest fra sykehus eller lege', priority: 1 },
  { category: 'Umiddelbart', title: 'Varsle nærmeste familie', description: 'Informer nærmeste familiemedlemmer og nære venner', priority: 2 },
  { category: 'Umiddelbart', title: 'Kontakt begravelsesbyrå', description: 'Planlegg begravelse og gravferd eller kremasjon', priority: 3 },
  { category: 'Uke 1', title: 'Varsle banken', description: 'Informer alle banker og fryse eller overføre kontoer', priority: 4 },
  { category: 'Uke 1', title: 'Finn testamentet', description: 'Finn original signert testament og relaterte dokumenter', priority: 5 },
  { category: 'Uke 1', title: 'Kontakt livsforsikring', description: 'Meld krav til alle livsforsikringsleverandører', priority: 6 },
  { category: 'Uke 1', title: 'Sikre eiendommen', description: 'Sørg for at bolig og verdisaker er låst og sikret', priority: 7 },
  { category: 'Måned 1', title: 'Start skiftebehandling', description: 'Start den juridiske prosessen for å fordele boet', priority: 8 },
  { category: 'Måned 1', title: 'Kanseller abonnementer', description: 'Avslutt strømmetjenester, telefon, treningssenter og andre løpende tjenester', priority: 9 },
  { category: 'Måned 1', title: 'Videresend post', description: 'Sett opp postvideresending til bobestyrer', priority: 10 },
  { category: 'Måned 1', title: 'Varsle NAV og pensjon', description: 'Informer relevante statlige og pensjonsinstanser', priority: 11 },
  { category: 'Måned 1', title: 'Lever siste selvangivelse', description: 'Forbered og lever siste personlige selvangivelse', priority: 12 },
  { category: 'Fordeling', title: 'Inventariser alle eiendeler', description: 'Lag fullstendig liste over eiendom, kontoer, kjøretøy og verdisaker', priority: 13 },
  { category: 'Fordeling', title: 'Betal utestående gjeld', description: 'Gjør opp eventuelle lån, kredittkort eller regninger', priority: 14 },
  { category: 'Fordeling', title: 'Fordel boet til arvingene', description: 'Overfør eiendeler og gjenstander i henhold til testamentet', priority: 15 },
  { category: 'Fordeling', title: 'Lukk bokontoer', description: 'Avslutt eventuelle bokontoer og fullfør det siste papirarbeidet', priority: 16 },
]

const CATEGORY_ORDER = ['Umiddelbart', 'Uke 1', 'Måned 1', 'Fordeling']
const CATEGORY_COLORS = {
  'Umiddelbart': { bg: '#DCE3D2', border: '#B8C8A8', text: '#3A5A30', dot: '#5F6E52' },
  'Uke 1':       { bg: '#E8EAD8', border: '#C4C8A8', text: '#4A5230', dot: '#8B9A7D' },
  'Måned 1':     { bg: '#DCE3D2', border: '#B8C8A8', text: '#3A5A30', dot: '#8B9A7D' },
  'Fordeling':   { bg: '#E8E4D4', border: '#C8BEA0', text: '#5C4530', dot: '#9C8267' },
}

export default function TasksPage({ session, profile }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', category: 'Uke 1', due_date: '' })
  const [myRole, setMyRole] = useState('member')

  const load = async () => {
    const [{ data: ts }, { data: mems }, { data: mem }] = await Promise.all([
      // tasks.assigned_to peker ikke på profiles, så profilen hentes fra medlemslisten i stedet for en join
      supabase.from('tasks').select('*').eq('estate_id', id).order('priority').order('created_at'),
      supabase.from('estate_members').select('user_id, profiles(display_name, avatar_color)').eq('estate_id', id),
      supabase.from('estate_members').select('role').eq('estate_id', id).eq('user_id', session.user.id).single(),
    ])
    setTasks((ts || []).map(t => ({ ...t, assigned_to_profile: mems?.find(m => m.user_id === t.assigned_to)?.profiles || null })))
    setMembers(mems || [])
    setMyRole(mem?.role || 'member')
    setLoading(false)
  }

  const seedTasks = async () => {
    const toInsert = DEFAULT_TASKS.map(t => ({ ...t, estate_id: id, completed: false, added_by: session.user.id }))
    await supabase.from('tasks').insert(toInsert)
    load()
  }

  useEffect(() => { load() }, [id])

  const toggleTask = async (task) => {
    await supabase.from('tasks').update({ completed: !task.completed, completed_by: !task.completed ? session.user.id : null, completed_at: !task.completed ? new Date().toISOString() : null }).eq('id', task.id)
    load()
  }

  const assignTask = async (taskId, userId) => {
    await supabase.from('tasks').update({ assigned_to: userId || null }).eq('id', taskId)
    load()
  }

  const addTask = async () => {
    if (!newTask.title.trim()) return
    await supabase.from('tasks').insert({ ...newTask, estate_id: id, completed: false, added_by: session.user.id, priority: 99 })
    setNewTask({ title: '', description: '', category: 'Uke 1', due_date: '' })
    setShowAdd(false)
    load()
  }

  const deleteTask = async (taskId) => {
    await supabase.from('tasks').delete().eq('id', taskId)
    load()
  }

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
      <button onClick={() => navigate(`/estate/${id}`)} style={{ background: 'none', border: 'none', color: '#9C8267', cursor: 'pointer', fontSize: '13px', padding: '0 0 20px', fontFamily: 'Karla, sans-serif' }}>← Tilbake til boet</button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: '26px', fontWeight: '400', color: '#3A2F26', marginBottom: '4px' }}>Oppgaveliste</h1>
          <p style={{ color: '#9C8267', fontSize: '14px' }}>Steg-for-steg-veiledning gjennom arveprosessen</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tasks.length === 0 && (
            <button onClick={seedTasks} style={{ padding: '9px 18px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
              Last standard sjekkliste
            </button>
          )}
          <button onClick={() => setShowAdd(!showAdd)} style={{ padding: '9px 18px', background: '#3A2F26', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>
            + Legg til oppgave
          </button>
        </div>
      </div>

      {/* Fremdriftslinje */}
      {total > 0 && (
        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '14px', color: '#3A2F26', fontWeight: '500' }}>Samlet fremdrift</span>
            <span style={{ fontSize: '22px', fontFamily: 'Fraunces, serif', color: progress === 100 ? '#5F6E52' : '#3A2F26' }}>{progress}%</span>
          </div>
          <div style={{ height: '8px', background: '#E8DFD0', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#8B9A7D' : '#5F6E52', borderRadius: '4px', transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: '13px', color: '#9C8267', marginTop: '8px' }}>{completed} av {total} oppgaver fullført</div>
        </div>
      )}

      {/* Legg til oppgave */}
      {showAdd && (
        <div style={{ background: '#fff', border: '1px solid #D9CFC0', borderRadius: '12px', padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', color: '#3A2F26', marginBottom: '16px', fontFamily: 'Fraunces, serif', fontWeight: '400' }}>Legg til egendefinert oppgave</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <input value={newTask.title} onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))} placeholder="Oppgavetittel *" maxLength={200}
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #D9CFC0', borderRadius: '8px', fontSize: '14px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
            <input value={newTask.description} onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))} placeholder="Beskrivelse (valgfri)" maxLength={1000}
              style={{ width: '100%', padding: '11px 14px', border: '1px solid #D9CFC0', borderRadius: '8px', fontSize: '14px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <select value={newTask.category} onChange={e => setNewTask(p => ({ ...p, category: e.target.value }))}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid #D9CFC0', borderRadius: '8px', fontSize: '14px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif' }}>
                {[...CATEGORY_ORDER, 'Annet'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={newTask.due_date} onChange={e => setNewTask(p => ({ ...p, due_date: e.target.value }))}
                style={{ flex: 1, padding: '11px 14px', border: '1px solid #D9CFC0', borderRadius: '8px', fontSize: '14px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '10px', background: 'none', border: '1px solid #D9CFC0', borderRadius: '8px', cursor: 'pointer', color: '#5C4530', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>Avbryt</button>
              <button onClick={addTask} disabled={!newTask.title.trim()} style={{ flex: 2, padding: '10px', background: newTask.title.trim() ? '#3A2F26' : '#D9CFC0', color: '#FBF9F5', border: 'none', borderRadius: '8px', cursor: newTask.title.trim() ? 'pointer' : 'not-allowed', fontSize: '14px', fontFamily: 'Karla, sans-serif' }}>Legg til oppgave</button>
            </div>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: '#9C8267' }}>
          <p style={{ marginBottom: '20px', fontSize: '15px' }}>Ingen oppgaver ennå. Last standard sjekkliste for å komme i gang.</p>
          <button onClick={seedTasks} style={{ padding: '12px 28px', background: '#5F6E52', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontFamily: 'Karla, sans-serif' }}>Last standard sjekkliste</button>
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
                <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: '400', color: '#3A2F26' }}>{cat}</h2>
                <span style={{ fontSize: '12px', color: colors.text, background: colors.bg, border: `1px solid ${colors.border}`, padding: '2px 8px', borderRadius: '20px' }}>{catDone}/{catTasks.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {catTasks.map(task => (
                  <TaskRow key={task.id} task={task} members={members} session={session} myRole={myRole}
                    onToggle={() => toggleTask(task)}
                    onAssign={(uid) => assignTask(task.id, uid)}
                    onDelete={() => deleteTask(task.id)} />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function TaskRow({ task, members, session, myRole, onToggle, onAssign, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const isOverdue = task.due_date && !task.completed && new Date(task.due_date) < new Date()

  return (
    <div style={{
      background: task.completed ? '#f9f9f9' : '#fff',
      border: `1px solid ${isOverdue ? '#C8BEA0' : '#D9CFC0'}`,
      borderRadius: '10px', overflow: 'hidden',
      opacity: task.completed ? 0.75 : 1,
      transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <button onClick={e => { e.stopPropagation(); onToggle() }} style={{
          width: '22px', height: '22px', borderRadius: '6px', flexShrink: 0,
          background: task.completed ? '#8B9A7D' : '#fff',
          border: `2px solid ${task.completed ? '#8B9A7D' : '#D9CFC0'}`,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: '#fff',
        }}>{task.completed ? '✓' : ''}</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', color: '#3A2F26', textDecoration: task.completed ? 'line-through' : 'none', lineHeight: '1.4' }}>{task.title}</div>
          {task.description && !expanded && <div style={{ fontSize: '12px', color: '#9C8267', marginTop: '2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{task.description}</div>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {isOverdue && <span style={{ fontSize: '11px', background: '#E8DFD0', color: '#5C4530', padding: '2px 7px', borderRadius: '20px' }}>Forfalt</span>}
          {task.due_date && !isOverdue && <span style={{ fontSize: '11px', color: '#9C8267' }}>{new Date(task.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</span>}
          {task.assigned_to_profile && (
            <div title={task.assigned_to_profile.display_name} style={{ width: '24px', height: '24px', borderRadius: '50%', background: task.assigned_to_profile.avatar_color || '#DCE3D2', border:tc(task.assigned_to_profile.avatar_color||'#DCE3D2')==='#3A2F26'?'1px solid #D9CFC0':'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: tc(task.assigned_to_profile.avatar_color || '#DCE3D2'), fontWeight: '500' }}>
              {task.assigned_to_profile.display_name[0].toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: '12px', color: '#D9CFC0' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #E8DFD0' }}>
          {task.description && <p style={{ fontSize: '13px', color: '#5C4530', lineHeight: '1.6', margin: '12px 0' }}>{task.description}</p>}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#9C8267' }}>Tildel til:</span>
              <select value={task.assigned_to || ''} onChange={e => onAssign(e.target.value)}
                style={{ padding: '5px 10px', border: '1px solid #D9CFC0', borderRadius: '6px', fontSize: '13px', background: '#FBF9F5', color: '#3A2F26', outline: 'none', fontFamily: 'Karla, sans-serif' }}>
                <option value="">— ikke tildelt —</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profiles?.display_name}</option>)}
              </select>
            </div>
            {myRole === 'admin' && (
              <button onClick={onDelete} style={{ fontSize: '12px', color: '#9C8267', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Karla, sans-serif', marginLeft: 'auto' }}>Slett oppgave</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Loader() {
  return <div style={{ padding: '80px', textAlign: 'center', color: '#9C8267', fontFamily: 'Karla, sans-serif' }}>Laster…</div>
}
