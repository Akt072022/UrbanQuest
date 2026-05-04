// Badge definitions for the Profile view.
//
// Badges are derived purely from `practiced` + `skipped` state — no
// schema changes needed. When the user signs in with their magic link
// on a new device, syncSupabase pulls the same evaluations and the
// same badges unlock automatically.
import { TOOLS, DIMENSIONS, GATE_LABEL } from './tools'
import { DIM_ICON } from './dimIcons'

const GATE_COL = ['', '#C17B2A', '#1B3A6B', '#1F6B3A', '#5C2B8E']

// ── Predicates over store state ───────────────────────────────
function gateCleared(gate, practiced, skipped) {
  const tools = TOOLS.filter(t => t.g.includes(gate))
  if (!tools.length) return false
  const skipSet = new Set(skipped || [])
  return tools.every(t => practiced[t.n] || skipSet.has(t.n))
}

// Per-dim helpers — used by the four tiers below to show progress
// towards mastery without making "Master" the only achievable badge.
function dimToolsAt(dimId, practiced, levelFilter) {
  const tools = TOOLS.filter(t => t.d?.includes(dimId))
  if (!tools.length) return 0
  return tools.filter(t => {
    const lvl = practiced[t.n]
    if (!lvl) return false
    return levelFilter ? lvl === levelFilter : true
  }).length
}
function dimMastered(dimId, practiced) {
  const tools = TOOLS.filter(t => t.d?.includes(dimId))
  if (!tools.length) return false
  const regular = tools.filter(t => practiced[t.n] === 'regular').length
  return regular / tools.length >= 0.5
}

function allDimsTouched(practiced) {
  const touched = new Set()
  for (const name of Object.keys(practiced)) {
    const t = TOOLS.find(t => t.n === name)
    if (!t) continue
    for (const d of (t.d || [])) touched.add(d)
  }
  return touched.size >= DIMENSIONS.length
}

const countByLevel = (practiced, level) =>
  Object.values(practiced).filter(l => l === level).length

// ── Catalogue ─────────────────────────────────────────────────
// Order matters — it's the display order in the badges grid.
export const BADGES = [
  // Counts (progression)
  { id: 'first_steps',   name: 'First Steps',   icon: '👣', col: '#5A5550',
    cat: 'progression',
    desc: 'Evaluate your first method.',
    pred: ({ practiced }) => Object.keys(practiced).length >= 1 },
  { id: 'pathfinder_10', name: 'Pathfinder',    icon: '🧭', col: '#1B3A6B',
    cat: 'progression',
    desc: 'Evaluate 10 methods.',
    pred: ({ practiced }) => Object.keys(practiced).length >= 10 },
  { id: 'veteran_30',    name: 'Veteran',       icon: '🎖', col: '#7C2D12',
    cat: 'progression',
    desc: 'Evaluate 30 methods.',
    pred: ({ practiced }) => Object.keys(practiced).length >= 30 },
  { id: 'completionist', name: 'Completionist', icon: '🏆', col: '#C17B2A',
    cat: 'progression',
    desc: 'Touch every one of the 133 methods.',
    pred: ({ practiced, skipped }) => {
      const skipSet = new Set(skipped || [])
      return TOOLS.every(t => practiced[t.n] || skipSet.has(t.n))
    } },

  // Gate clearances
  { id: 'gate1', name: `${GATE_LABEL[1]} Cleared`, icon: '🎯', col: GATE_COL[1],
    cat: 'gate',
    desc: `Decide on every method in ${GATE_LABEL[1]}.`,
    pred: ({ practiced, skipped }) => gateCleared(1, practiced, skipped) },
  { id: 'gate2', name: `${GATE_LABEL[2]} Cleared`, icon: '🧩', col: GATE_COL[2],
    cat: 'gate',
    desc: `Decide on every method in ${GATE_LABEL[2]}.`,
    pred: ({ practiced, skipped }) => gateCleared(2, practiced, skipped) },
  { id: 'gate3', name: `${GATE_LABEL[3]} Cleared`, icon: '⚓', col: GATE_COL[3],
    cat: 'gate',
    desc: `Decide on every method in ${GATE_LABEL[3]}.`,
    pred: ({ practiced, skipped }) => gateCleared(3, practiced, skipped) },
  { id: 'gate4', name: `${GATE_LABEL[4]} Cleared`, icon: '♾', col: GATE_COL[4],
    cat: 'gate',
    desc: `Decide on every method in ${GATE_LABEL[4]}.`,
    pred: ({ practiced, skipped }) => gateCleared(4, practiced, skipped) },

  // Dimension tiers — four ladders per dim so beginners see early
  // wins and don't have to hit 50% regular practice before unlocking
  // anything in a lens. Tiers escalate: touch one → cover five →
  // run three regularly → master the lens.
  ...DIMENSIONS.flatMap(d => [
    { id: `dim_${d.id}_curious`,
      name: `${d.label} · Curious`,
      icon: d.icon || '◆', iconSrc: DIM_ICON[d.id] || null,
      col: d.color, cat: 'dimension', tier: 1,
      desc: `Evaluate your first ${d.label} method.`,
      pred: ({ practiced }) => dimToolsAt(d.id, practiced) >= 1 },
    { id: `dim_${d.id}_familiar`,
      name: `${d.label} · Familiar`,
      icon: d.icon || '◆', iconSrc: DIM_ICON[d.id] || null,
      col: d.color, cat: 'dimension', tier: 2,
      desc: `Evaluate 5+ ${d.label} methods.`,
      pred: ({ practiced }) => dimToolsAt(d.id, practiced) >= 5 },
    { id: `dim_${d.id}_practitioner`,
      name: `${d.label} · Practitioner`,
      icon: d.icon || '◆', iconSrc: DIM_ICON[d.id] || null,
      col: d.color, cat: 'dimension', tier: 3,
      desc: `Run 3+ ${d.label} methods regularly.`,
      pred: ({ practiced }) => dimToolsAt(d.id, practiced, 'regular') >= 3 },
    { id: `dim_${d.id}_master`,
      name: `${d.label} · Master`,
      icon: d.icon || '◆', iconSrc: DIM_ICON[d.id] || null,
      col: d.color, cat: 'dimension', tier: 4,
      desc: `Run 50%+ of ${d.label} methods regularly.`,
      pred: ({ practiced }) => dimMastered(d.id, practiced) },
  ]),

  // Depth / breadth
  { id: 'theorist',     name: 'Theorist',     icon: '📚', col: '#5A5550',
    cat: 'depth',
    desc: 'Mark 5+ methods as theoretical knowledge.',
    pred: ({ practiced }) => countByLevel(practiced, 'theory') >= 5 },
  { id: 'practitioner', name: 'Practitioner', icon: '🛠', col: '#2A6B45',
    cat: 'depth',
    desc: 'Mark 10+ methods as routine practice.',
    pred: ({ practiced }) => countByLevel(practiced, 'regular') >= 10 },
  { id: 'all_rounder',  name: 'All-Rounder',  icon: '🌐', col: '#1B5FA0',
    cat: 'depth',
    desc: 'Practice at least one method in every dimension.',
    pred: ({ practiced }) => allDimsTouched(practiced) },
]

export function computeBadges(state) {
  return BADGES.map(b => ({ ...b, unlocked: !!b.pred(state) }))
}
