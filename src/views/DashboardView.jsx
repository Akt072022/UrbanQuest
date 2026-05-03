import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  TOOLS, GATE_LABEL, DIMENSIONS, DIM_BY_ID, SKILL_LEVELS,
  toolsForGate, toolsForGateDim,
  scoreForGate, scoreForGateDim,
} from '../data/tools'

const INK      = '#1C2530'
const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

// ──────────────────────────────────────────────────────────────
// Score helpers
// ──────────────────────────────────────────────────────────────
const isEvaluated = (practiced, name) => !!practiced[name]
const levelOf = (practiced, name) => practiced[name] || null

function dimScores(practiced) {
  return DIMENSIONS.map(dim => {
    const dimTools = TOOLS.filter(t => t.d?.includes(dim.id))
    const total = dimTools.length
    const count = dimTools.filter(t => isEvaluated(practiced, t.n)).length
    const score = total ? Math.round((count / total) * 100) : 0
    return { ...dim, score, count, total }
  })
}

function gateStats(practiced) {
  return [1,2,3,4].map(g => {
    const tools = toolsForGate(g)
    const done  = tools.filter(t => isEvaluated(practiced, t.n)).length
    return {
      gate: g, done, total: tools.length,
      pct: tools.length ? Math.round((done / tools.length) * 100) : 0,
    }
  })
}

function makeSuggestions(scores, practiced) {
  const suggestions = []
  const used = new Set()
  for (const dim of [...scores].sort((a,b) => a.score - b.score)) {
    if (suggestions.length >= 5) break
    if (dim.total === 0) continue
    const candidates = TOOLS.filter(t =>
      t.d?.includes(dim.id) && !isEvaluated(practiced, t.n) && !used.has(t.n)
    )
    if (!candidates.length) continue
    const top = candidates.sort((a,b) =>
      (b.g.length * 2 + (b.d?.length || 0)) -
      (a.g.length * 2 + (a.d?.length || 0))
    )[0]
    used.add(top.n)
    suggestions.push({
      dim, tool: top,
      reason: `${dim.label} needs strengthening (${dim.score}% covered). This method activates ${top.d.length} dimension${top.d.length === 1 ? '' : 's'} and ${top.g.length} gate${top.g.length === 1 ? '' : 's'}.`,
    })
  }
  return suggestions
}

// ──────────────────────────────────────────────────────────────
// Hexagonal radar — same visual language as the Map view
// ──────────────────────────────────────────────────────────────
function HexRadar({ dims, color = INK, size = 220, fillOpacity = 0.55, showLabels = true }) {
  // dims: [{ id, label, color, total, done, score }]
  const angles = [30, 90, 150, 210, 270, 330].map(a => a * Math.PI / 180)
  const RAD = size * 0.36
  const labelR = size * 0.46
  const cx = size / 2, cy = size / 2

  const ratios = dims.map(d => d.total > 0 ? d.score / d.total : 0)
  const totalScore = ratios.reduce((s, r) => s + r, 0)

  const polyAt = (radii) => radii.map((r, i) => {
    const a = angles[i]
    return `${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`
  }).join(' ')

  const outerPts    = polyAt(angles.map(() => RAD))
  const progressPts = polyAt(ratios.map(r => RAD * r))
  const labelPos = (i) => {
    const a = angles[i]
    return { x: cx + labelR * Math.sin(a), y: cy - labelR * Math.cos(a) }
  }
  const dataPos = (i) => {
    const a = angles[i]
    const r = RAD * ratios[i]
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) }
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', overflow: 'visible' }}>
      {/* Concentric rings for reference */}
      {[0.33, 0.66, 1].map(f => (
        <polygon key={f}
          points={polyAt(angles.map(() => RAD * f))}
          fill={f === 1 ? '#F2EDE4' : 'none'}
          stroke={f === 1 ? INK : 'rgba(28,37,48,.10)'}
          strokeWidth={f === 1 ? 3 : 1}
          strokeLinejoin="round" />
      ))}
      {/* Spokes */}
      {angles.map((a, i) => (
        <line key={i}
          x1={cx} y1={cy}
          x2={(cx + RAD * Math.sin(a)).toFixed(1)}
          y2={(cy - RAD * Math.cos(a)).toFixed(1)}
          stroke={INK} strokeWidth={1} opacity={0.18} />
      ))}
      {/* Progress polygon */}
      <polygon points={progressPts}
        fill={color} fillOpacity={fillOpacity}
        stroke={color} strokeWidth={2.5}
        strokeLinejoin="round" />
      {/* Visible data points — even tiny ratios get a noticeable dot
          so the user can confirm "yes, there's data on this axis". */}
      {ratios.map((r, i) => {
        if (r <= 0 || dims[i].total === 0) return null
        const p = dataPos(i)
        return (
          <circle key={dims[i].id}
            cx={p.x} cy={p.y} r={5}
            fill={dims[i].color}
            stroke="#FFFFFF" strokeWidth={2.2} />
        )
      })}
      <circle cx={cx} cy={cy} r={3} fill={INK} />
      {/* Empty state — discreet hint when nothing has been evaluated */}
      {totalScore === 0 && (
        <text x={cx} y={cy + 5} textAnchor="middle"
          style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 11,
            fill: '#9C958A', letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}>No data yet</text>
      )}
      {showLabels && dims.map((d, i) => {
        const p = labelPos(i)
        const pct = d.total > 0 ? Math.round((d.score / d.total) * 100) : 0
        return (
          <g key={d.id}>
            <text x={p.x} y={p.y - 2} textAnchor="middle"
              style={{
                fontSize: 10, fontFamily: 'Barlow Condensed, sans-serif',
                fontWeight: 900, fill: d.color, letterSpacing: '.04em',
                textTransform: 'uppercase',
              }}>{d.label}</text>
            <text x={p.x} y={p.y + 11} textAnchor="middle"
              style={{
                fontSize: 11, fontFamily: 'Barlow Condensed, sans-serif',
                fontWeight: 900,
                fill: pct >= 50 ? d.color : (pct > 0 ? '#8B8074' : '#C8C0B8'),
              }}>{pct}%</text>
          </g>
        )
      })}
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────
// Tab strip
// ──────────────────────────────────────────────────────────────
function TabStrip({ tabs, activeId, onPick }) {
  return (
    <div style={{
      display: 'flex', overflowX: 'auto',
      gap: 6, padding: '2px 0 12px',
      WebkitOverflowScrolling: 'touch',
    }}>
      {tabs.map(t => {
        const active = t.id === activeId
        return (
          <button key={t.id} onClick={() => onPick(t.id)}
            style={{
              flexShrink: 0,
              padding: '7px 12px',
              background: active ? (t.color || INK) : '#FFFFFF',
              color:      active ? '#FFFFFF'        : INK,
              border: `2px solid ${active ? INK : (t.color || '#C8C0B8')}`,
              borderRadius: 999,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 12,
              letterSpacing: '.05em', textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              boxShadow: active ? '2px 2px 0 ' + INK : 'none',
            }}>
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Per-gate detail view — opened when clicking a gate's radar on the
// map or a gate tab here.
// ──────────────────────────────────────────────────────────────
function GateDetail({ gate, practiced, goExplore, goExploreDim }) {
  const col = GATE_COL[gate]
  const tools = toolsForGate(gate)
  const evaluated = tools.filter(t => isEvaluated(practiced, t.n)).length

  const dimsData = DIMENSIONS.map(dim => ({
    id:    dim.id,
    label: dim.label,
    color: dim.color,
    short: dim.short,
    total: toolsForGateDim(gate, dim.id).length,
    done:  toolsForGateDim(gate, dim.id).filter(t => isEvaluated(practiced, t.n)).length,
    score: scoreForGateDim(gate, dim.id, practiced),
  }))

  // Aggregate skill-level breakdown for this gate
  const breakdown = { regular: 0, occasional: 0, theory: 0, none: 0 }
  for (const t of tools) {
    const lvl = levelOf(practiced, t.n) || 'none'
    breakdown[lvl] = (breakdown[lvl] || 0) + 1
  }

  return (
    <div>
      {/* Hero radar + headline */}
      <div style={{
        background: '#FFFDF8', border: `3px solid ${INK}`,
        borderRadius: 18, padding: '18px 16px 14px',
        boxShadow: '3px 3px 0 ' + INK,
        marginBottom: 16, textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 11, color: col,
          letterSpacing: '.08em', textTransform: 'uppercase',
        }}>Capability profile</div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 24, color: INK, marginBottom: 14,
          lineHeight: 1.05, letterSpacing: '.02em',
        }}>{GATE_LABEL[gate]}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <HexRadar dims={dimsData} color={col} size={260} />
        </div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 18, color: col,
        }}>{evaluated}<span style={{ color: '#9C958A' }}>/{tools.length}</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: '#5A5550' }}>
            tools evaluated
          </span>
        </div>
      </div>

      {/* Skill level breakdown */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E0DAD2',
        borderRadius: 14, padding: 14, marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          letterSpacing: '.06em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>Skill depth</div>
        {[
          { key: 'regular',    label: SKILL_LEVELS.regular.label,    col: '#2A6B45' },
          { key: 'occasional', label: SKILL_LEVELS.occasional.label, col: '#C17B2A' },
          { key: 'theory',     label: SKILL_LEVELS.theory.label,     col: '#5A5550' },
          { key: 'none',       label: 'Not evaluated yet',           col: '#C8C0B8' },
        ].map(row => {
          const n = breakdown[row.key] || 0
          const pct = tools.length ? Math.round((n / tools.length) * 100) : 0
          return (
            <div key={row.key} style={{ marginBottom: 8 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 12, marginBottom: 3,
              }}>
                <span style={{ color: INK, fontWeight: 700 }}>{row.label}</span>
                <span style={{ color: row.col, fontWeight: 900, fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {n}/{tools.length}
                </span>
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: '#F0EBE4', overflow: 'hidden',
              }}>
                <div style={{ width: pct + '%', height: '100%', background: row.col, transition: 'width .5s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Per-dim breakdown with tap → start with that dim */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E0DAD2',
        borderRadius: 14, padding: 14, marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          letterSpacing: '.06em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>Coverage by dimension</div>
        {dimsData.map(d => {
          const pct = d.total ? Math.round((d.score / d.total) * 100) : 0
          const done = d.done
          return (
            <button key={d.id}
              onClick={() => goExploreDim(gate, d.id)}
              disabled={d.total === 0}
              style={{
                display: 'block', width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 6,
                background: '#FFFDF8',
                border: `2px solid ${d.total === 0 ? '#E0DAD2' : d.color + '55'}`,
                borderRadius: 10,
                cursor: d.total === 0 ? 'default' : 'pointer',
              }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'baseline',
              }}>
                <span style={{
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontWeight: 900, fontSize: 13, color: d.color,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                }}>{d.label}</span>
                <span style={{
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontWeight: 900, fontSize: 13,
                  color: pct > 0 ? d.color : '#B0A898',
                }}>{done}/{d.total}{d.total > 0 && (
                  <span style={{ marginLeft: 6, fontSize: 11, color: '#5A5550' }}>· {pct}%</span>
                )}</span>
              </div>
              <div style={{
                marginTop: 5, height: 5, borderRadius: 3,
                background: '#F0EBE4', overflow: 'hidden',
              }}>
                <div style={{
                  width: pct + '%', height: '100%', background: d.color,
                  transition: 'width .5s',
                }} />
              </div>
            </button>
          )
        })}
      </div>

      <button onClick={() => goExplore(gate)}
        style={{
          display: 'block', width: '100%', padding: '12px',
          background: col, color: '#FFFFFF',
          border: `2.5px solid ${INK}`, borderRadius: 14,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 14,
          letterSpacing: '.06em', textTransform: 'uppercase',
          cursor: 'pointer',
          boxShadow: '2px 2px 0 ' + INK,
        }}>
        Continue evaluating →
      </button>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// ──────────────────────────────────────────────────────────────
// Capability map — 2×2 of knowledge × practice
// ──────────────────────────────────────────────────────────────
//
// Mapping skill levels to the matrix:
//   regular     → MASTERED (knows + practices)
//   occasional  → IN-USE   (knows + sometimes practices)
//   theory      → STUDIED  (knows + doesn't practice — latent)
//   unrated     → not plotted
//
// The "Studied" quadrant is the most useful diagnostic: it surfaces
// methods the user could lean on with a bit of practice. Cells are
// dim-coloured so the user can spot which lenses skew theoretical.
function CapabilityMap({ practiced }) {
  const buckets = { mastered: [], inuse: [], studied: [] }
  for (const t of TOOLS) {
    const lvl = practiced[t.n]
    if (!lvl) continue
    if      (lvl === 'regular')    buckets.mastered.push(t)
    else if (lvl === 'occasional') buckets.inuse.push(t)
    else if (lvl === 'theory')     buckets.studied.push(t)
  }
  const totalRated = buckets.mastered.length + buckets.inuse.length + buckets.studied.length

  if (totalRated === 0) return null

  return (
    <div style={{
      borderRadius: 14, background: '#FFFFFF',
      border: '1px solid #E0DAD2', padding: 16, marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>Capability map</div>
        <div style={{ fontSize: 10, color: '#9C958A', fontWeight: 700 }}>
          knowledge × practice
        </div>
      </div>

      {/* Grid with axis hints */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '14px 1fr 1fr',
        gridTemplateRows:    '1fr 1fr 14px',
        gap: 6,
      }}>
        {/* Y-axis label */}
        <div style={{
          gridRow: '1 / span 2',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 8, fontWeight: 800, color: '#9C958A',
          textTransform: 'uppercase', letterSpacing: '.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>practice →</div>

        {/* Top-left = MASTERED (high knowledge, high practice) */}
        <CapabilityCell title="MASTERED" subtitle="Run routinely"
          tone="ok" tools={buckets.mastered} />
        {/* Top-right = STUDIED — visually a bit "off" but conceptually:
            high knowledge / low practice (top-left in classic 2×2).
            We render mastered & studied along the top row and in-use
            on the bottom-left so the eye reads it as: top = "I know
            it well", bottom = "still learning". */}
        <CapabilityCell title="STUDIED" subtitle="Know it, don't run it"
          tone="gold" tools={buckets.studied} highlight />

        {/* Bottom-left = IN USE */}
        <CapabilityCell title="IN USE" subtitle="Sometimes" tone="bench"
          tools={buckets.inuse} />
        {/* Bottom-right = unrated/empty placeholder */}
        <div style={{
          minHeight: 80,
          background: '#FAF7F2',
          border: `1.5px dashed #DCD3C4`, borderRadius: 10,
          padding: '10px 10px 8px',
          fontSize: 10, color: '#9C958A', fontStyle: 'italic',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', lineHeight: 1.4,
        }}>
          Untouched methods — keep evaluating to populate.
        </div>

        {/* Filler corner */}
        <div />
        {/* X-axis label */}
        <div style={{
          gridColumn: '2 / span 2',
          fontSize: 8, fontWeight: 800, color: '#9C958A',
          textTransform: 'uppercase', letterSpacing: '.08em',
          textAlign: 'center',
        }}>knowledge →</div>
      </div>

      <div style={{
        marginTop: 10, fontSize: 11, color: '#5A5550', lineHeight: 1.4,
      }}>
        <b style={{ color: '#7B4A12' }}>Studied</b> is the latent-capacity
        zone — methods you could reach for with a little more hands-on time.
      </div>
    </div>
  )
}

function CapabilityCell({ title, subtitle, tone, tools, highlight = false }) {
  const tones = {
    ok:    { bg: '#E6F4EC', border: '#2A6B45', label: '#1F4E32' },
    gold:  { bg: '#FFF4D8', border: '#C17B2A', label: '#7B4A12' },
    bench: { bg: '#E6EEF8', border: '#1B5FA0', label: '#0F3A66' },
    muted: { bg: '#F2EDE4', border: '#9C958A', label: '#5A5550' },
  }
  const t = tones[tone] || tones.muted
  // Group tools by primary dimension for the per-dim color chip
  const byDim = {}
  for (const tl of tools) {
    const did = tl.d?.[0] || 'other'
    byDim[did] = (byDim[did] || 0) + 1
  }
  return (
    <div style={{
      minHeight: 80,
      background: t.bg,
      border: `${highlight ? 2.5 : 1.5}px solid ${t.border}`,
      borderRadius: 10,
      padding: '10px 10px 8px',
      boxShadow: highlight ? '2px 2px 0 ' + t.border : 'none',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 4,
      }}>
        <span style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 11,
          color: t.label, letterSpacing: '.06em',
        }}>{title}</span>
        <span style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 16, color: t.label,
        }}>{tools.length}</span>
      </div>
      <div style={{
        fontSize: 9, color: t.label, opacity: 0.85,
        marginBottom: 6, lineHeight: 1.3,
      }}>{subtitle}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {Object.entries(byDim).slice(0, 6).map(([did, n]) => {
          const d = DIM_BY_ID[did]
          if (!d) return null
          return (
            <span key={did} style={{
              padding: '1px 5px', borderRadius: 5,
              background: d.color + '22', color: d.color,
              fontSize: 9, fontWeight: 800,
              letterSpacing: '.04em',
            }}>{d.short}·{n}</span>
          )
        })}
      </div>
    </div>
  )
}

// Overall view — tab "Overall"
// ──────────────────────────────────────────────────────────────
function OverallView({ practiced, scores, gates, suggestions, xp }) {
  const evaluatedCount = Object.keys(practiced).length

  return (
    <>
      {/* KPI strip */}
      <div style={{
        display: 'flex', borderRadius: 12, background: '#FFFFFF',
        border: '1px solid #E0DAD2', overflow: 'hidden', marginBottom: 18,
      }}>
        {[
          { label: 'Total XP',  val: xp,             col: '#B8742A' },
          { label: 'Evaluated', val: evaluatedCount, col: '#1B5FA0' },
          { label: 'Cleared',   val: gates.filter(g => g.pct === 100).length, col: '#2A6B45' },
        ].map((k, i) => (
          <div key={k.label} style={{
            flex: 1, padding: '14px 8px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid #E8E3DA' : 'none',
          }}>
            <div className="text-mega" style={{ fontSize: 28, color: k.col, lineHeight: 1 }}>{k.val}</div>
            <div style={{
              fontSize: 9, color: '#8B8074', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3,
            }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Dimension radar */}
      <div style={{
        borderRadius: 14, background: '#FFFFFF',
        border: '1px solid #E0DAD2', padding: 16, marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12,
        }}>Coverage by dimension (all gates)</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <HexRadar dims={scores.map(s => ({
            id: s.id, label: s.label, color: s.color, short: s.short,
            total: s.total, done: s.count, score: s.count, // unweighted overall
          }))} color={INK} size={260} />
        </div>
      </div>

      {/* Progress per gate */}
      <div style={{
        borderRadius: 14, background: '#FFFFFF',
        border: '1px solid #E0DAD2', padding: 16, marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14,
        }}>Progress by gate</div>
        {gates.map((g, i) => (
          <div key={g.gate} style={{ marginBottom: i < gates.length - 1 ? 12 : 0 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 5,
            }}>
              <span style={{
                fontSize: 13, color: INK, fontWeight: 800,
                fontFamily: 'Barlow Condensed, sans-serif',
                textTransform: 'uppercase', letterSpacing: '.04em',
              }}>{GATE_LABEL[g.gate]}</span>
              <span style={{
                fontSize: 12, fontWeight: 800,
                color: g.pct >= 50 ? GATE_COL[g.gate] : '#B0A898',
                fontFamily: 'Barlow Condensed, sans-serif',
              }}>{g.done}/{g.total}</span>
            </div>
            <div style={{
              height: 5, borderRadius: 3,
              background: '#EAE5DB', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                width: g.pct + '%', background: GATE_COL[g.gate],
                transition: 'width .6s',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Capability map — 2×2 of knowledge × practice. Bins each
          rated method into one of four buckets so the user can see
          where their portfolio leans. The "Studied" cell (knows but
          doesn't run) is the latent-capacity signal: a training brief
          for themselves or for the team. */}
      <CapabilityMap practiced={practiced} />

      {/* Suggestions */}
      <div style={{
        borderRadius: 14, background: '#FFFFFF',
        border: '1px solid #E0DAD2', padding: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 14,
        }}>Recommended actions</div>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div className="text-mega" style={{ fontSize: 18, color: '#2A6B45', marginBottom: 4 }}>
              ALL DIMENSIONS COVERED
            </div>
            <div style={{ fontSize: 12, color: '#8B8074' }}>Excellent work!</div>
          </div>
        ) : suggestions.map((s, i) => (
          <div key={i} style={{
            display: 'flex', gap: 12, alignItems: 'flex-start',
            paddingTop: i > 0 ? 12 : 0,
            borderTop: i > 0 ? '1px solid #F0EBE4' : 'none',
          }}>
            <div style={{
              flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
              background: s.dim.color + '20',
              border: '1.5px solid ' + s.dim.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, marginTop: 1,
            }}>{s.dim.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700,
                color: INK, marginBottom: 2,
              }}>{s.tool.n}</div>
              <div style={{
                fontSize: 11, color: '#8B8074', lineHeight: 1.4, marginBottom: 5,
              }}>{s.reason}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                {s.tool.d?.map(did => {
                  const d = DIM_BY_ID[did]
                  if (!d) return null
                  return (
                    <span key={did} style={{
                      padding: '1px 6px', borderRadius: 6,
                      fontSize: 9, fontWeight: 700,
                      background: d.color + '15', color: d.color,
                    }}>{d.label}</span>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────
export function DashboardView() {
  const { practiced, dashboardGate, xp, goMap, goFacilitator, goExplore, goExploreDim } =
    useStore(useShallow(s => ({
      practiced:     s.practiced,
      dashboardGate: s.dashboardGate,
      xp: s.xp,
      goMap:         s.goMap,
      goFacilitator: s.goFacilitator,
      goExplore:     s.goExplore,
      goExploreDim:  s.goExploreDim,
    })))

  // Always land on Overall first — gives context before drilling down.
  // The per-gate tabs are one tap away.
  const [tab, setTab] = useState('overall')

  const scores      = dimScores(practiced)
  const gates       = gateStats(practiced)
  const suggestions = makeSuggestions(scores, practiced)

  const tabs = [
    { id: 'overall', label: 'Overall', color: INK },
    ...[1,2,3,4].map(g => ({
      id: `gate-${g}`,
      label: GATE_LABEL[g],
      color: GATE_COL[g],
    })),
  ]

  return (
    <div className="anim-fadein" style={{ paddingBottom: 32 }}>
      {/* Nav row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={goMap}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            background: '#FFFFFF', border: '1px solid #E0DAD2',
            color: '#6B6460', fontSize: 11, fontWeight: 800,
          }}>← MAP</button>
        <button onClick={goFacilitator}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            background: 'transparent', border: '1px solid #CCC5BA',
            color: '#8B8074', fontSize: 11, fontWeight: 800,
          }}>LIVE WORKSHOP →</button>
      </div>

      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <div className="text-mega" style={{
          fontSize: 28, color: INK, textTransform: 'uppercase',
        }}>Dashboard</div>
        <div style={{ fontSize: 11, color: '#8B8074', marginTop: 3 }}>
          {Object.keys(practiced).length} method{Object.keys(practiced).length === 1 ? '' : 's'} evaluated out of {TOOLS.length}
        </div>
      </div>

      {/* Tab strip */}
      <TabStrip tabs={tabs} activeId={tab} onPick={setTab} />

      {/* Tab content */}
      {tab === 'overall'
        ? <OverallView practiced={practiced} scores={scores} gates={gates}
            suggestions={suggestions} xp={xp} />
        : <GateDetail
            gate={parseInt(tab.replace('gate-', ''), 10)}
            practiced={practiced}
            goExplore={goExplore}
            goExploreDim={goExploreDim} />}
    </div>
  )
}
