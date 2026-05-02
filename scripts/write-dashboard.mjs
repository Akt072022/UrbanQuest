import { writeFileSync } from 'fs'

writeFileSync('src/views/DashboardView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { TOOLS, FAMILY_STYLE, GATE_LABEL } from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#3A6FD8','#2DBD76','#9B59E8']

// ── 6 radar dimensions mapped to FAMILY_STYLE keys ───────────
const DIMENSIONS = [
  { id: 'spatial',      label: 'Spatial',       families: ['Spatial/Urbain'] },
  { id: 'heritage',     label: 'Héritage',      families: ['Héritage', 'Conservation'] },
  { id: 'social',       label: 'Social/User',   families: ['User/Participatif'] },
  { id: 'env',          label: 'Environnement', families: ['Environnement'] },
  { id: 'eco',          label: 'Économie',      families: ['Économie'] },
  { id: 'gouv',         label: 'Gouvernance',   families: ['Gouvernance', 'EU/International'] },
]

// ── Compute radar score per dimension (0-100) ─────────────────
function computeScores(practiced) {
  const pr = new Set(practiced)
  return DIMENSIONS.map(dim => {
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f))
    if (!dimTools.length) return { ...dim, score: 0, count: 0, total: 0 }
    const count = dimTools.filter(t => pr.has(t.n)).length
    const score = Math.round((count / dimTools.length) * 100)
    return { ...dim, score, count, total: dimTools.length }
  })
}

// ── Compute gate coverage ─────────────────────────────────────
function gateStats(practiced) {
  const pr = new Set(practiced)
  return [1,2,3,4].map(g => {
    const tools = TOOLS.filter(t => t.g.includes(g))
    const done  = tools.filter(t => pr.has(t.n))
    return { gate: g, done: done.length, total: tools.length, pct: Math.round((done.length/tools.length)*100) }
  })
}

// ── 5 algorithmic suggestions ─────────────────────────────────
function makeSuggestions(scores, practiced) {
  const pr = new Set(practiced)
  const sorted = [...scores].sort((a,b) => a.score - b.score)
  const suggestions = []

  for (const dim of sorted) {
    if (suggestions.length >= 5) break
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f) && !pr.has(t.n))
    if (!dimTools.length) continue
    // Pick the tool present in the most gates (broadest leverage)
    const top = dimTools.sort((a,b) => b.g.length - a.g.length)[0]
    suggestions.push({
      dim: dim.label,
      tool: top,
      reason: 'Votre couverture "' + dim.label + '" est faible (' + dim.score + '%). Essayez cette méthode.',
    })
  }
  return suggestions
}

// ── SVG Radar ─────────────────────────────────────────────────
function Radar({ scores, size = 240 }) {
  const n = scores.length
  const cx = size / 2, cy = size / 2
  const R  = size * 0.38
  const labelR = size * 0.48

  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2

  const gridPts = (r) =>
    scores.map((_, i) => {
      const a = angle(i)
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
    })

  const dataPts = scores.map((s, i) => {
    const a = angle(i)
    const r = (s.score / 100) * R
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })

  const toPath = (pts) => pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ') + ' Z'

  const grids = [0.25, 0.5, 0.75, 1].map(f => gridPts(R * f))
  const axes  = scores.map((_, i) => ({ from: [cx, cy], to: gridPts(R)[i] }))
  const labelPts = scores.map((s, i) => {
    const a = angle(i)
    return { x: cx + labelR * Math.cos(a), y: cy + labelR * Math.sin(a), label: s.label, score: s.score }
  })

  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      {/* Grid circles */}
      {grids.map((pts, gi) => (
        <polygon key={gi} points={pts.map(p=>p.join(',')).join(' ')}
          fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="1" />
      ))}
      {/* Axes */}
      {axes.map((a, i) => (
        <line key={i} x1={a.from[0]} y1={a.from[1]} x2={a.to[0]} y2={a.to[1]}
          stroke="rgba(255,255,255,.1)" strokeWidth="1" />
      ))}
      {/* Data polygon */}
      <path d={toPath(dataPts)} fill="rgba(200,241,53,.18)" stroke="#C8F135" strokeWidth="2" strokeLinejoin="round" />
      {/* Data dots */}
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#C8F135" />
      ))}
      {/* Labels */}
      {labelPts.map((lp, i) => (
        <g key={i}>
          <text x={lp.x} y={lp.y - 6} textAnchor="middle"
            style={{ fontSize: '10px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800, fill: 'rgba(255,255,255,.55)' }}>
            {lp.label.toUpperCase()}
          </text>
          <text x={lp.x} y={lp.y + 8} textAnchor="middle"
            style={{ fontSize: '12px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
              fill: lp.score >= 50 ? '#C8F135' : 'rgba(255,255,255,.3)' }}>
            {lp.score}%
          </text>
        </g>
      ))}
    </svg>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
export function DashboardView() {
  const { practiced: practicedArr, flagged, xp, goMap, goFacilitator } = useStore(useShallow(s => ({
    practiced:     s.practiced,
    flagged:       s.flagged,
    xp:            s.xp,
    goMap:         s.goMap,
    goFacilitator: s.goFacilitator,
  })))

  const scores      = computeScores(practicedArr)
  const gates       = gateStats(practicedArr)
  const suggestions = makeSuggestions(scores, practicedArr)

  return (
    <div className="anim-fadein" style={{ paddingTop: '4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <button onClick={goMap} style={{ padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
          background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
          color: 'rgba(255,255,255,.4)', fontSize: '11px', fontWeight: 800 }}>← CARTE</button>
        <div className="text-mega" style={{ fontSize: 'clamp(28px,9vw,42px)', color: '#fff', flex: 1 }}>
          DASHBOARD
        </div>
        <button onClick={goFacilitator}
          style={{ padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
            background: 'rgba(200,241,53,.12)', border: '1px solid rgba(200,241,53,.3)',
            color: '#C8F135', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 900 }}>
          ATELIER LIVE →
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'XP Total', val: xp, col: '#C8F135' },
          { label: 'Pratiquées', val: practicedArr.length, col: '#2DBD76' },
          { label: 'À intégrer', val: flagged.length, col: '#9B59E8' },
        ].map(k => (
          <div key={k.label} style={{ padding: '12px 10px', borderRadius: '12px', textAlign: 'center',
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
            <div className="text-mega" style={{ fontSize: '28px', color: k.col }}>{k.val}</div>
            <div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
              textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Radar chart */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px', borderRadius: '16px', marginBottom: '20px',
        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px', alignSelf: 'flex-start' }}>
          Couverture par dimension
        </div>
        <Radar scores={scores} size={260} />
      </div>

      {/* Gate progress bars */}
      <div style={{ padding: '14px', borderRadius: '14px', marginBottom: '20px',
        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>
          Avancement par gate
        </div>
        {gates.map(g => (
          <div key={g.gate} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  background: GATE_VOLT[g.gate], display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 900, color: '#fff' }}>{g.gate}</div>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.55)', fontWeight: 700 }}>
                  {GATE_LABEL[g.gate]}
                </span>
              </div>
              <span className="text-mega" style={{ fontSize: '16px', color: g.pct >= 50 ? '#C8F135' : 'rgba(255,255,255,.35)' }}>
                {g.done}/{g.total}
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px', width: g.pct + '%',
                background: GATE_VOLT[g.gate], transition: 'width .6s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Algorithmic suggestions */}
      <div style={{ padding: '14px', borderRadius: '14px', marginBottom: '24px',
        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>
          5 actions recommandées
        </div>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#C8F135', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '20px', fontWeight: 900, padding: '16px 0' }}>
            TOUTES LES DIMENSIONS COUVERTES 🏆
          </div>
        ) : suggestions.map((s, i) => {
          const fam = FAMILY_STYLE[s.tool.f] || {}
          return (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px', borderRadius: '10px', marginBottom: '6px',
              background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '6px',
                background: '#C8F135', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: '14px', color: '#0D0D0D' }}>
                {i+1}
              </div>
              <div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700,
                  color: '#fff', marginBottom: '2px' }}>{s.tool.n}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.35)', lineHeight: 1.4 }}>{s.reason}</div>
                <div style={{ marginTop: '4px', display: 'flex', gap: '4px' }}>
                  {s.tool.g.map(g => (
                    <div key={g} style={{ width: '14px', height: '14px', borderRadius: '50%',
                      background: GATE_VOLT[g], fontSize: '7px', fontWeight: 900, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g}</div>
                  ))}
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,.25)', marginLeft: '4px' }}>
                    {fam.icon} {s.tool.f}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
`.trimStart())
console.log('DashboardView OK')
