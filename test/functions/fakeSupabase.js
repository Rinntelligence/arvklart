// Minimal Supabase-klient i minnet for testene av edge-funksjonenes slettelogikk.
// Støtter bare det de bruker: select/eq/lt/order/range/maybeSingle/single, count (head), insert, update, delete,
// og Storage list (sider sortert på navn, mapper og filer) og remove. Alle endringer logges i `mutations`.

export function fakeSupabase({ tables = {}, storage = {}, failRemove = () => false, onList = () => {}, failInsert = false } = {}) {
  const db = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, rows.map(r => ({ ...r }))]))
  const buckets = Object.fromEntries(Object.entries(storage).map(([b, files]) => [b, new Map(Object.entries(files))]))
  const mutations = []
  let nextId = 1

  // Som on delete cascade / set null i databasen
  const cascadeEstate = (id) => {
    for (const t of ['items', 'documents', 'estate_members', 'categories', 'tasks', 'heirs']) db[t] = (db[t] || []).filter(r => r.estate_id !== id)
    for (const r of db.feedback || []) if (r.estate_id === id) r.estate_id = null
  }

  function query(table) {
    const filters = []
    let op = 'select', payload = null, countHead = false, range = null, order = null, single = null, returning = false
    const rows = () => (db[table] ||= [])
    const match = r => filters.every(f => f(r))
    const run = async () => {
      if (op === 'insert') {
        if (failInsert) return { data: null, error: { message: 'insert feilet' } }
        const row = { id: nextId++, ...payload }
        rows().push(row)
        mutations.push({ op, table, row })
        return { data: returning ? (single ? row : [row]) : null, error: null }
      }
      if (op === 'update') {
        const hit = rows().filter(match)
        hit.forEach(r => Object.assign(r, payload))
        mutations.push({ op, table, n: hit.length })
        return { data: null, error: null }
      }
      if (op === 'delete') {
        const hit = rows().filter(match)
        db[table] = rows().filter(r => !match(r))
        if (table === 'estates') hit.forEach(r => cascadeEstate(r.id))
        mutations.push({ op, table, n: hit.length })
        return { data: null, error: null }
      }
      let out = rows().filter(match)
      if (order) out = [...out].sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0))
      if (countHead) return { data: null, count: out.length, error: null }
      if (range) out = out.slice(range[0], range[1] + 1)
      if (single === 'maybe') return { data: out[0] ?? null, error: null }
      if (single) return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'not single' } }
      return { data: out.map(r => ({ ...r })), error: null }
    }
    const b = {
      select(_cols, opts) { if (op === 'select') countHead = !!opts?.head; else returning = true; return b },
      insert(row) { op = 'insert'; payload = row; return b },
      update(patch) { op = 'update'; payload = patch; return b },
      delete() { op = 'delete'; return b },
      eq(col, val) { filters.push(r => r[col] === val); return b },
      lt(col, val) { filters.push(r => r[col] != null && r[col] < val); return b },
      order(col) { order = col; return b },
      range(a, z) { range = [a, z]; return b },
      maybeSingle() { single = 'maybe'; return run() },
      single() { single = true; return run() },
      then(res, rej) { return run().then(res, rej) },
    }
    return b
  }

  const storageApi = {
    from(bucket) {
      const files = (buckets[bucket] ||= new Map())
      return {
        async list(folder, { limit = 100, offset = 0 } = {}) {
          onList({ bucket, folder, offset, files })
          const prefix = folder ? folder + '/' : ''
          const entries = new Map()
          for (const [path, meta] of files) {
            if (!path.startsWith(prefix)) continue
            const rest = path.slice(prefix.length)
            const [name, ...deeper] = rest.split('/')
            if (deeper.length) entries.set(name, { name, id: null })
            else entries.set(name, { name, id: path, created_at: meta.created_at ?? '2026-01-01T00:00:00Z', metadata: { size: meta.size ?? 100 } })
          }
          const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name))
          return { data: sorted.slice(offset, offset + limit), error: null }
        },
        async remove(paths) {
          if (paths.some(p => failRemove(bucket, p) === 'error')) return { data: null, error: { message: `kunne ikke slette ${paths[0]}` } }
          const removed = []
          for (const p of paths) {
            if (failRemove(bucket, p) === 'silent') continue // som Storage: ingen feil, men filen blir
            if (files.delete(p)) removed.push(p)
          }
          mutations.push({ op: 'remove', bucket, n: paths.length })
          return { data: removed.map(name => ({ name })), error: null }
        },
      }
    },
  }

  return { client: { from: query, storage: storageApi }, db, buckets, mutations }
}

// Mange filer i en mappe: { 'mappe/f0000.jpg': {...}, ... }
export const manyFiles = (folder, n, meta = {}) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`${folder}/f${String(i).padStart(5, '0')}.jpg`, { ...meta }]))
