import { writeFileSync } from 'fs'

writeFileSync('src/views/DashboardView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { TOOLS, FAMILY_STYLE, GATE_LABEL } from '../data/tools'

const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

const DIMENSIONS = [
  { id: 'spatial',  label: 'Spatial',   families: ['Spatial/Urbain'] },
  { id: 'heritage', label: 'Héritage',  families: ['Héritage', 'Conservation'] },
  { id: 'social',   label: 'Social',    families: ['User/Participatif'] },
  { id: 'env',      label: 'Environn.', families: ['Environnement'] },
  { id: 'eco',      label: 'Économie',  families: ['Économie'] },
  { id: 'gouv',     label: 'Gouvern.',  families: ['Gouvernance', 'EU/International'] },
]

function computeScores(practiced) {
  const pr = new Set(practiced)
  return DIMENSIONS.map(dim => {
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f))
    if (!dimTools.length) return { ...dim, score: 0, count: 0, total: 0 }
    const count = dimTools.filter(t => pr.has(t.n)).length
    return { ...dim, score: Math.round((count / dimTools.length) * 100), count, total: dimTools.length }
  })
}

function gateStats(practiced) {
  const pr = new Set(practiced)
  return [1,2,3,4].map(g => {
    const tools = TOOLS.filter(t => t.g.includes(g))
    const done  = tools.filter(t => pr.has(t.n))
    return { gate: g, done: done.length, total: tools.length,
      pct: Math.round((done.length / tools.length) * 100) }
  })
}

function makeSuggestions(scores, practiced) {
  const pr = new Set(practiced)
  const suggestions = []
  for (const dim of [...scores].sort((a,b) => a.score - b.score)) {
    if (suggestions.length >= 5) break
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f) && !pr.has(t.n))
    if (!dimTools.length) continue
    const top = dimTools.sort((a,b) => b.g.length - a.g.length)[0]
    const scoreStr = dim.score > 0 ? ' (' + dim.score + '% couvert)' : ''
    suggestions.push({
      dim: dim.label, tool: top,
      reason: 'Dimension "' + dim.label + '" à renforcer' + scoreStr + '. Cette méthode offre le meilleur levier.',
    })
  }
  return suggestions
}

function Radar({ scores, size = 240 }) {
  const n = scores.length
  const cx = size / 2, cy = size / 2
  const R  = size * 0.34
  const labelR = size * 0.46

  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2
  const gridPts = (r) => scores.map((_, i) => {
    const a = angle(i)
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
  const dataPts = scores.map((s, i) => {
    const a = angle(i)
    const r = (s.score / 100) * R
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
  const toPath = (pts) => pts.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z'
  const grids = [0.25, 0.5, 0.75, 1].map(f => gridPts(R * f))
  const labelPts = scores.map((s, i) => {
    const a = angle(i)
    return { x: cx + labelR * Math.cos(a), y: cy + labelR * Math.sin(a), label: s.label, score: s.score }
  })

  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      {/* Grid rings */}
      {grids.map((pts, gi) => (
        <polygon key={gi} points={pts.map(p=>p.join(',')).join(' ')}
          fill="none" stroke={gi === 3 ? 'rgba(28,37,48,.15)' : 'rgba(28,37,48,.07)'}
          strokeWidth={gi === 3 ? '1.5' : '1'} />
      ))}
      {/* Axes */}
      {scores.map((_, i) => {
        const outerPt = gridPts(R)[i]
        return <line key={i} x1={cx} y1={cy} x2={outerPt[0]} y2={outerPt[1]}
          stroke="rgba(28,37,48,.08)" strokeWidth="1" />
      })}
      {/* Data polygon */}
      <path d={toPath(dataPts)}
        fill="rgba(27,61,111,.12)" stroke="#1B3D6F" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3.5}
          fill="#1B3D6F" stroke="#F2EDE4" strokeWidth="1.5" />
      ))}
      {/* Labels */}
      {labelPts.map((lp, i) => (
        <g key={i}>
          <text x={lp.x} y={lp.y - 4} textAnchor="middle"
            style={{ fontSize: '8.5px', fontFamily: 'Barlow Condensed, sans-serif',
              fontWeight: 800, fill: '#8B8074', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {lp.label.toUpperCase()}
          </text>
          <text x={lp.x} y={lp.y + 10} textAnchor="middle"
            style={{ fontSize: '11px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
              fill: lp.score >= 50 ? '#1B3D6F' : (lp.score > 0 ? '#B8742A' : '#C8C0B8') }}>
            {lp.score}%
          </text>
        </g>
      ))}
    </svg>
  )
}

export function DashboardView() {
  const { practiced: practicedArr, flagged, xp, goMap, goFacilitator } = useStore(useShallow(s => ({
    practiced: s.practiced,
    flagged: s.flagged,
    xp: s.xp,
    goMap: s.goMap,
    goFacilitator: s.goFacilitator,
  })))

  const scores      = computeScores(practicedArr)
  const gates       = gateStats(practicedArr)
  const suggestions = makeSuggestions(scores, practicedArr)

  return (
    <div className="anim-fadein" style={{ paddingBottom: '32px' }}>

      {/* Nav row — compact, ne domine pas */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '12px' }}>
        <button onClick={goMap}
          style={{ padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
            background: '#FFFFFF', border: '1px solid #E0DAD2',
            color: '#6B6460', fontSize: '11px', fontWeight: 800 }}>
          ← CARTE
        </button>
        <button onClick={goFacilitator}
          style={{ padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
            background: 'transparent', border: '1px solid #CCC5BA',
            color: '#8B8074', fontSize: '11px', fontWeight: 800 }}>
          ATELIER LIVE →
        </button>
      </div>

      {/* Titre — une seule ligne, taille maîtrisée */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: '28px', color: '#1C2530', textTransform: 'uppercase',
          letterSpacing: '.02em', lineHeight: 1 }}>
          Tableau de bord
        </div>
        <div style={{ fontSize: '11px', color: '#8B8074', marginTop: '3px' }}>
          Votre progression · {practicedArr.length} méthode{practicedArr.length > 1 ? 's' : ''} pratiquée{practicedArr.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* KPI strip — surface unifiée */}
      <div style={{ display: 'flex', borderRadius: '12px', background: '#FFFFFF',
        border: '1px solid #E0DAD2', overflow: 'hidden', marginBottom: '20px' }}>
        {[
          { label: 'XP total',    val: xp,                col: '#B8742A' },
          { label: 'Pratiquées',  val: practicedArr.length, col: '#1B5FA0' },
          { label: 'À intégrer',  val: flagged.length,      col: '#7A3A8E' },
        ].map((k, i) => (
          <div key={k.label} style={{ flex: 1, padding: '14px 8px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid #E8E3DA' : 'none' }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
              fontSize: '28px', color: k.col, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: '9px', color: '#8B8074', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.05em', marginTop: '3px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Radar */}
      <div style={{ borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E0DAD2',
        padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
          Couverture par dimension
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Radar scores={scores} size={260} />
        </div>
      </div>

      {/* Gate progress */}
      <div style={{ borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E0DAD2',
        padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
          Avancement par gate
        </div>
        {gates.map((g, i) => (
          <div key={g.gate} style={{ marginBottom: i < gates.length - 1 ? '12px' : 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: '5px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                  background: GATE_COL[g.gate],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 900, color: '#fff' }}>{g.gate}</div>
                <span style={{ fontSize: '12px', color: '#4A4540', fontWeight: 600 }}>
                  {GATE_LABEL[g.gate]}
                </span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 800,
                color: g.pct >= 50 ? GATE_COL[g.gate] : '#B0A898',
                fontFamily: 'Barlow Condensed, sans-serif' }}>
                {g.done}/{g.total}
              </span>
            </div>
            <div style={{ height: '5px', borderRadius: '3px', background: '#EAE5DB', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px',
                width: g.pct + '%', background: GATE_COL[g.gate], transition: 'width .6s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div style={{ borderRadius: '14px', background: '#FFFFFF', border: '1px solid #E0DAD2',
        padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
          Actions recommandées
        </div>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
              fontSize: '18px', color: '#2A6B45', marginBottom: '4px' }}>
              TOUTES LES DIMENSIONS COUVERTES
            </div>
            <div style={{ fontSize: '12px', color: '#8B8074' }}>Excellent travail !</div>
          </div>
        ) : suggestions.map((s, i) => {
          const fam = FAMILY_STYLE[s.tool.f] || {}
          return (
            <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start',
              paddingTop: i > 0 ? '12px' : 0,
              borderTop: i > 0 ? '1px solid #F0EBE4' : 'none' }}>
              {/* Number */}
              <div style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%',
                background: '#E8EDF5', border: '1px solid rgba(27,61,111,.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '12px', color: '#1B3D6F', marginTop: '1px' }}>
                {i+1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700,
                  color: '#1C2530', marginBottom: '2px' }}>{s.tool.n}</div>
                <div style={{ fontSize: '11px', color: '#8B8074', lineHeight: 1.4,
                  marginBottom: '5px' }}>{s.reason}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {s.tool.g.map(g => (
                    <div key={g} style={{ width: '14px', height: '14px', borderRadius: '50%',
                      background: GATE_COL[g],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '7px', fontWeight: 900, color: '#fff' }}>{g}</div>
                  ))}
                  {fam.icon && (
                    <span style={{ fontSize: '10px', color: '#B0A898', marginLeft: '3px' }}>
                      {fam.icon} {s.tool.f}
                    </span>
                  )}
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
console.log('DashboardView v2 OK')
