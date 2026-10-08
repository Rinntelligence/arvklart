// Rene hjelpefunksjoner for «Legg til gjenstand(er)» (testes i test/lib/itemAiHelpers.test.js).

// Finner boets kategori som passer til AI-ens forslag (boet kan ha egne kategorinavn)
export function matchCategory(categories, suggestion) {
  const s = (suggestion || '').trim().toLowerCase()
  if (!s) return null
  const exact = categories.find(c => c.label.toLowerCase() === s)
  if (exact) return exact
  return categories.find(c => {
    const label = c.label.toLowerCase()
    return label.includes(s) || s.includes(label)
  }) || null
}

// Kjører worker for hvert element med høyst `limit` samtidig. Stopper å starte nye når shouldStop() er sann.
export async function runPool(list, limit, worker, shouldStop = () => false) {
  let next = 0
  const run = async () => {
    while (next < list.length && !shouldStop()) {
      const i = next++
      await worker(list[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, run))
}
