// Arvefølgen etter loven (slektsarv), uten ektefelle/samboer.
// Returnerer hvem som arver og hvor stor brøkdel av «slektens del» hver får.
//
//   1. arvegang: livsarvinger (barn, og barnebarn i stedet for et dødt barn)
//   2. arvegang: foreldre og deres etterkommere (søsken, nevøer og nieser)
//   3. arvegang: besteforeldre og deres barn (tanter og onkler)
//
// Kilder: arveloven §§ 4, 5 og 6 (se sources.js). Finnes ingen arvinger, gjelder § 76.
//
// Navn og relasjoner lagres på norsk (de legges inn i boet). *_en er bare for visning i den engelske veiviseren.

export function childLines(children = []) {
  // En «stamme» er et barn som lever, eller et dødt barn som har etterlatt seg barn.
  return children
    .map((c, i) => ({ ...c, index: i, label: c.name?.trim() || `Barn ${i + 1}`, label_en: c.name?.trim() || `Child ${i + 1}` }))
    .filter(c => c.alive === 'yes' || (c.alive === 'no' && (Number(c.grandchildren) || 0) > 0))
}

function firstOrder(children, notes) {
  const lines = childLines(children)
  if (!lines.length) return null
  const heirs = []
  for (const line of lines) {
    const share = 1 / lines.length
    if (line.alive === 'yes') {
      heirs.push({
        id: `child-${line.id}`, lineId: line.id, label: line.label, label_en: line.label_en, relation: 'Barn', relation_en: 'Child',
        common: line.common, share, minor: Boolean(line.minor),
      })
    } else {
      const n = Number(line.grandchildren)
      for (let k = 0; k < n; k++) {
        heirs.push({
          id: `grandchild-${line.id}-${k}`, lineId: line.id,
          label: n > 1 ? `Barnebarn ${k + 1} (via ${line.label})` : `Barnebarn (via ${line.label})`,
          label_en: n > 1 ? `Grandchild ${k + 1} (via ${line.label_en})` : `Grandchild (via ${line.label_en})`,
          relation: 'Barnebarn', relation_en: 'Grandchild', common: line.common, share: share / n,
        })
      }
      notes.push('representation')
    }
  }
  return { order: 1, heirs }
}

// Fordeler mellom to foreldre (eller to besteforeldre) og deres etterkommere etter mønsteret i
// arveloven § 5: hver forelder halvparten; er en forelder død, går den halvparten til hans eller
// hennes barn (likt per gren, og videre til barnas barn). Har en forelder ingen arvinger, går alt til den andre.
//   parents:     [{ key, label, relation, alive, halfType }]
//   descendants: [{ id, name, type: 'full' | <halfType>, alive, children }]
function twoParentSplit(parents, descendants, words) {
  const branches = parents.map(p => {
    if (p.alive) return [{ id: `parent-${p.key}`, label: p.label, label_en: p.label_en, relation: p.relation, relation_en: p.relation_en, share: 1 }]
    const lines = descendants
      .map((d, i) => ({ ...d, label: d.name?.trim() || `${words.fallback} ${i + 1}`, label_en: d.name?.trim() || `${words.fallback_en} ${i + 1}` }))
      .filter(d => d.type === 'full' || d.type === p.halfType)
      .filter(d => d.alive === 'yes' || (Number(d.children) || 0) > 0)
    const heirs = []
    for (const d of lines) {
      const share = 1 / lines.length
      if (d.alive === 'yes') {
        heirs.push({ id: `${words.idPrefix}-${d.id}`, label: d.label, label_en: d.label_en, relation: d.type === 'full' ? words.full : words.half, relation_en: d.type === 'full' ? words.full_en : words.half_en, share })
      } else {
        const n = Number(d.children)
        for (let k = 0; k < n; k++) {
          heirs.push({
            id: `${words.idPrefix}-child-${d.id}-${k}`,
            label: n > 1 ? `${words.child} ${k + 1} (via ${d.label})` : `${words.child} (via ${d.label})`,
            label_en: n > 1 ? `${words.child_en} ${k + 1} (via ${d.label_en})` : `${words.child_en} (via ${d.label_en})`,
            relation: words.child, relation_en: words.child_en, share: share / n, viaDeadLine: true,
          })
        }
      }
    }
    return heirs
  })
  const active = branches.filter(b => b.length)
  const heirs = []
  for (const b of active) {
    for (const h of b) {
      const existing = heirs.find(x => x.id === h.id)
      if (existing) existing.share += h.share / active.length // helsøsken arver fra begge
      else heirs.push({ ...h, share: h.share / active.length })
    }
  }
  return heirs
}

const SIBLING_WORDS = { fallback: 'Søsken', idPrefix: 'sibling', full: 'Søsken', half: 'Halvsøsken', child: 'Nevø/niese',
  fallback_en: 'Sibling', full_en: 'Sibling', half_en: 'Half-sibling', child_en: 'Nephew/niece' }
const AUNT_WORDS = { fallback: 'Tante/onkel', idPrefix: 'aunt', full: 'Tante/onkel', half: 'Tante/onkel (halv)', child: 'Søskenbarn',
  fallback_en: 'Aunt/uncle', full_en: 'Aunt/uncle', half_en: 'Aunt/uncle (half)', child_en: 'Cousin' }

function secondOrder(parents, siblings) {
  const heirs = twoParentSplit([
    { key: 'father', label: 'Far', label_en: 'Father', relation: 'Forelder', relation_en: 'Parent', alive: parents === 'both' || parents === 'father', halfType: 'halfFather' },
    { key: 'mother', label: 'Mor', label_en: 'Mother', relation: 'Forelder', relation_en: 'Parent', alive: parents === 'both' || parents === 'mother', halfType: 'halfMother' },
  ], siblings, SIBLING_WORDS)
  return heirs.length ? { order: 2, heirs } : null
}

// Besteforeldre per side: { father: { gp1, gp2, relatives: [...] }, mother: { ... } }
// gp1/gp2 = 'yes' | 'no' (lever). relatives = tanter og onkler på den siden.
export const GRANDPARENT_SIDES = [
  { key: 'father', label: 'Farssiden', gp1: 'Farfar', gp2: 'Farmor', label_en: "Father's side", gp1_en: 'Paternal grandfather', gp2_en: 'Paternal grandmother' },
  { key: 'mother', label: 'Morssiden', gp1: 'Morfar', gp2: 'Mormor', label_en: "Mother's side", gp1_en: 'Maternal grandfather', gp2_en: 'Maternal grandmother' },
]

function thirdOrder(grandparents = {}) {
  const perSide = GRANDPARENT_SIDES.map(side => {
    const g = grandparents[side.key] || {}
    const words = { ...AUNT_WORDS, idPrefix: `aunt-${side.key}` }
    const heirs = twoParentSplit([
      { key: `${side.key}-gp1`, label: side.gp1, label_en: side.gp1_en, relation: 'Besteforelder', relation_en: 'Grandparent', alive: g.gp1 === 'yes', halfType: 'half1' },
      { key: `${side.key}-gp2`, label: side.gp2, label_en: side.gp2_en, relation: 'Besteforelder', relation_en: 'Grandparent', alive: g.gp2 === 'yes', halfType: 'half2' },
    ], g.relatives || [], words)
    return heirs.map(h => ({ ...h, side: side.label.toLowerCase(), side_en: side.label_en.toLowerCase() }))
  })
  const active = perSide.filter(h => h.length)
  if (!active.length) return null
  return { order: 3, heirs: active.flatMap(side => side.map(h => ({ ...h, share: h.share / active.length }))) }
}

// Hovedfunksjon. `unknown` lister opplysninger som mangler før arvingene kan fastslås.
export function determineRelatives(a, { stopAtSecond = false } = {}) {
  const notes = []
  const unknown = []
  const hasChildren = a.cohabitantChildren === 'yes' ? 'yes' : a.hasChildren

  if (hasChildren === 'unknown' || hasChildren === undefined) {
    unknown.push('hasChildren')
    return { order: null, heirs: [], unknown, notes }
  }
  if (hasChildren === 'yes') {
    if (!Array.isArray(a.children) || !a.children.length) {
      unknown.push('children')
      return { order: null, heirs: [], unknown, notes }
    }
    const first = firstOrder(a.children, notes)
    if (first) return { ...first, unknown, notes }
  }

  if (!a.parents || a.parents === 'unknown') {
    unknown.push('parents')
    return { order: null, heirs: [], unknown, notes }
  }
  if (a.parents !== 'both') {
    if (!a.hasSiblings || a.hasSiblings === 'unknown') {
      unknown.push('siblings')
      return { order: null, heirs: [], unknown, notes }
    }
  }
  const second = secondOrder(a.parents, a.hasSiblings === 'yes' ? (a.siblings || []) : [])
  if (second) return { ...second, unknown, notes }
  if (stopAtSecond) return { order: 0, heirs: [], unknown, notes }

  if (!a.hasGrandparentLine || a.hasGrandparentLine === 'unknown') {
    unknown.push('grandparents')
    return { order: null, heirs: [], unknown, notes }
  }
  const third = a.hasGrandparentLine === 'yes' ? thirdOrder(a.grandparents) : null
  if (third) return { ...third, unknown, notes }
  return { order: 0, heirs: [], unknown, notes }
}
