import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  TOOLS, GATE_LABEL, DIMENSIONS, DIM_BY_ID, SKILL_LEVELS,
  toolsForGate, toolsForGateDim,
  scoreForGate, scoreForGateDim,
} from '../data/tools'
import { supabase, hasSupabase } from '../lib/supabase'
import { listSessionsForTeam, loadSessionFull } from '../lib/sessionStore'
import { TriageHeatmap } from '../components/TriageHeatmap'
import { MethodfitMatrix } from '../components/MethodfitMatrix'
import { analyzeTeamCapability, hasMistral } from '../lib/mistral'

const INK      = '#1C2530'
const GATE_COL = ['','#F97316','#3B82F6','#10B981','#8B5CF6']

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

// Classify the dashboard state into one of three modes — sparse,
// mixed, rich — and return the right kind of recommendations for
// each. The previous implementation only suggested next tools to
// rate, which made no sense when the user had barely told us
// anything yet (sparse) or already had enough data to act on (rich).
//
// Sparse  → "Map your knowledge" — workshops + light evaluation prompts
// Mixed   → "Build out your map" — top tool suggestions + 1 deepening prompt
// Rich    → "Apply your toolkit" — two columns: Apply now / Learn next
function classifyDashboard(scores, gates, practiced) {
  const total = Object.keys(practiced).length

  // Find weakest-covered dim (lowest pct, but ignore dims with 0 tools)
  const dimsByScore = [...scores]
    .filter(s => s.total > 0)
    .sort((a, b) => (a.count / a.total) - (b.count / b.total))
  const weakestDim = dimsByScore[0] || null

  // Find weakest-covered gate (lowest pct)
  const gatesByPct = [...gates].sort((a, b) => a.pct - b.pct)
  const weakestGate = gatesByPct[0] || null

  // Rich-mode pools
  const regularTools = TOOLS.filter(t => practiced[t.n] === 'regular')
  const theoryTools  = TOOLS.filter(t => practiced[t.n] === 'theory')

  if (total < 15) {
    // SPARSE: encourage data collection over per-tool suggestions.
    const challenges = []
    if (weakestGate) {
      challenges.push({
        kind: 'workshop',
        title: `Run a 30-min team scan on ${GATE_LABEL[weakestGate.gate]}`,
        rationale:
          `Get the team to rate the ${weakestGate.total} methods of this phase together. ` +
          `The live heatmap surfaces convergence and blind spots in real time.`,
        action: { type: 'facilitator' },
      })
    }
    if (weakestDim) {
      challenges.push({
        kind: 'evaluate',
        title: `Rate 5 ${weakestDim.label} methods`,
        rationale:
          `${weakestDim.label} has only ${weakestDim.count} method${weakestDim.count === 1 ? '' : 's'} ` +
          `evaluated so far. A solo pass adds depth without needing a workshop.`,
        action: { type: 'exploreDim', gate: weakestGate?.gate || 1, dim: weakestDim.id },
      })
    }
    challenges.push({
      kind: 'team',
      title: 'Invite a teammate',
      rationale:
        'Multiple ratings on the same method reveal disagreement, which is where the most ' +
        'useful conversations start. Share an invite code from your Profile.',
      action: { type: 'profile' },
    })
    return { mode: 'sparse', challenges }
  }

  if (total < 50) {
    // MIXED: a few tool suggestions in the weakest dim + one deepening prompt.
    const used = new Set()
    const tools = []
    for (const dim of dimsByScore) {
      if (tools.length >= 3) break
      const candidates = TOOLS.filter(t =>
        t.d?.includes(dim.id) && !practiced[t.n] && !used.has(t.n)
      )
      if (!candidates.length) continue
      const top = candidates.sort((a, b) =>
        (b.g.length * 2 + (b.d?.length || 0)) -
        (a.g.length * 2 + (a.d?.length || 0))
      )[0]
      used.add(top.n)
      tools.push({
        dim, tool: top,
        rationale: `${dim.label} is at ${dim.score}%. This method covers ${top.d.length} ` +
                   `dimension${top.d.length === 1 ? '' : 's'} and ${top.g.length} phase${top.g.length === 1 ? '' : 's'}.`,
      })
    }
    const deepenPrompt = weakestGate ? {
      kind: 'workshop',
      title: `Deepen ${GATE_LABEL[weakestGate.gate]}`,
      rationale: `${weakestGate.pct}% covered. Run a focused workshop to fill the gap.`,
      action: { type: 'facilitator' },
    } : null
    return { mode: 'mixed', tools, deepenPrompt }
  }

  // RICH: apply now + learn next.
  // Apply now: top regular-level tools, weighted by reach (how many
  // gates × dims a tool spans — the more universal, the better an
  // opening move on a typical project).
  const apply = [...regularTools]
    .sort((a, b) =>
      (b.g.length + (b.d?.length || 0)) -
      (a.g.length + (a.d?.length || 0))
    )
    .slice(0, 3)

  // Learn next: theory-only OR untouched, prioritised by weakest dim.
  const weakDimId = weakestDim?.id
  const learnPool = TOOLS.filter(t => {
    const lvl = practiced[t.n]
    if (lvl === 'regular' || lvl === 'occasional') return false
    return weakDimId ? t.d?.includes(weakDimId) : true
  })
  const learn = learnPool
    .sort((a, b) =>
      (b.g.length + (b.d?.length || 0)) -
      (a.g.length + (a.d?.length || 0))
    )
    .slice(0, 3)

  return { mode: 'rich', apply, learn, weakestDim }
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
          { key: 'regular',    label: SKILL_LEVELS.regular.label,    col: '#10B981' },
          { key: 'occasional', label: SKILL_LEVELS.occasional.label, col: '#F97316' },
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
    ok:    { bg: '#E6F4EC', border: '#10B981', label: '#1F4E32' },
    gold:  { bg: '#FFF4D8', border: '#F97316', label: '#7B4A12' },
    bench: { bg: '#E6EEF8', border: '#3B82F6', label: '#0F3A66' },
    muted: { bg: '#F2EDE4', border: '#9C958A', label: '#5A5550' },
  }
  const t = tones[tone] || tones.muted
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
        marginBottom: 8, lineHeight: 1.3,
      }}>{subtitle}</div>
      {/* Method names — not just dim counts. The previous "Spatial · 11"
          summary was abstract; readers couldn't tell WHICH 11 methods
          they had mastered. Now we list the actual tools, with a
          coloured dot for each one's primary dimension and a tail
          link for any overflow. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {tools.slice(0, 8).map(tl => {
          const d = DIM_BY_ID[tl.d?.[0]]
          return (
            <div key={tl.n} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, color: t.label, lineHeight: 1.3,
            }}>
              {d && (
                <span aria-hidden="true" style={{
                  flexShrink: 0,
                  width: 8, height: 8, borderRadius: '50%',
                  background: d.color,
                }} />
              )}
              <span style={{
                fontFamily: 'Georgia, serif',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
                minWidth: 0, flex: 1,
              }}>{tl.n}</span>
            </div>
          )
        })}
        {tools.length > 8 && (
          <div style={{
            fontSize: 10, color: t.label, opacity: 0.7,
            marginTop: 2, fontStyle: 'italic',
          }}>
            +{tools.length - 8} more
          </div>
        )}
      </div>
    </div>
  )
}

// Overall view — tab "Overall"
// ──────────────────────────────────────────────────────────────
function OverallView({
  practiced, scores, gates, recommendations, xp,
  goExplore, goExploreDim, goFacilitator, goProfile,
}) {
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
          { label: 'Evaluated', val: evaluatedCount, col: '#3B82F6' },
          { label: 'Cleared',   val: gates.filter(g => g.pct === 100).length, col: '#10B981' },
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

      {/* Recommended actions — state-aware. Sparse maps grow into
          workshops; rich maps surface tools to apply now or learn
          next. The "AI insights" button is opt-in; the heuristic
          renders without it. */}
      <RecommendedActions
        recommendations={recommendations}
        practiced={practiced}
        scores={scores}
        gates={gates}
        goExplore={goExplore}
        goExploreDim={goExploreDim}
        goFacilitator={goFacilitator}
        goProfile={goProfile} />
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// Recommended actions — state-aware (sparse / mixed / rich) plus
// optional AI insights enriching the heuristic. The previous flat
// "next tool to evaluate" list didn't scale with the user's stage:
// when the map was empty it surfaced random tools; when full it
// kept pushing more tools to rate instead of how to act on them.
// ──────────────────────────────────────────────────────────────
function RecommendedActions({
  recommendations, practiced, scores, gates,
  goExplore, goExploreDim, goFacilitator, goProfile,
}) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [aiResult,  setAiResult]  = useState(null)

  const runAi = async () => {
    setAiLoading(true); setAiError(''); setAiResult(null)
    try {
      const out = await analyzeTeamCapability({
        practiced,
        scoresByDim: scores,
        gateStats:   gates,
      })
      setAiResult(out)
    } catch (e) {
      setAiError(e?.message || 'Analysis failed.')
    } finally { setAiLoading(false) }
  }

  // Action dispatcher — translates a recommendation's `action` into
  // a navigation call. Null-safe so any unknown type is a no-op.
  const dispatch = (action) => {
    if (!action) return
    if (action.type === 'facilitator') goFacilitator?.()
    else if (action.type === 'profile') goProfile?.()
    else if (action.type === 'explore'    && action.gate) goExplore?.(action.gate)
    else if (action.type === 'exploreDim' && action.gate && action.dim) goExploreDim?.(action.gate, action.dim)
  }

  // ── Header (title + tagline + AI button) ────────────────────
  const header = (
    <div style={{
      display: 'flex', alignItems: 'flex-start',
      justifyContent: 'space-between', gap: 12, marginBottom: 14,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>Recommended actions</div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 18, color: INK,
          lineHeight: 1.15, marginTop: 4,
          letterSpacing: '.02em',
        }}>
          {recommendations.mode === 'sparse'  && 'Map your knowledge'}
          {recommendations.mode === 'mixed'   && 'Build out your map'}
          {recommendations.mode === 'rich'    && 'Apply your toolkit'}
        </div>
        <div style={{
          fontSize: 12, color: '#8B8074',
          lineHeight: 1.45, marginTop: 4,
        }}>
          {recommendations.mode === 'sparse' &&
            'Run a workshop or do a quick solo pass. Both grow the diagnostic.'}
          {recommendations.mode === 'mixed' &&
            'A few targeted evaluations now will unlock the rich-stage recommendations.'}
          {recommendations.mode === 'rich' &&
            'Methods to deploy on a typical urban transformation project, plus the gaps worth closing.'}
        </div>
      </div>
      {hasMistral && (
        <button onClick={runAi} disabled={aiLoading}
          style={{
            flexShrink: 0,
            padding: '6px 10px', borderRadius: 999,
            background: aiLoading ? '#E0DAD2' : '#FFFFFF',
            border: `2px solid ${INK}`,
            cursor: aiLoading ? 'wait' : 'pointer',
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 10,
            color: INK, letterSpacing: '.06em',
          }}>
          {aiLoading ? 'ANALYSING…' : aiResult ? '↻ RE-RUN' : '✨ AI INSIGHTS'}
        </button>
      )}
    </div>
  )

  return (
    <div style={{
      borderRadius: 14, background: '#FFFFFF',
      border: '1px solid #E0DAD2', padding: 16,
    }}>
      {header}

      {recommendations.mode === 'sparse' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recommendations.challenges.map((c, i) => (
            <ChallengeRow key={i} challenge={c} onAction={() => dispatch(c.action)} />
          ))}
        </div>
      )}

      {recommendations.mode === 'mixed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recommendations.tools.map((t, i) => (
            <ToolSuggestionRow key={i}
              dim={t.dim} tool={t.tool} rationale={t.rationale}
              onClick={() => goExploreDim?.(t.tool.g[0], t.dim.id)} />
          ))}
          {recommendations.deepenPrompt && (
            <ChallengeRow
              challenge={recommendations.deepenPrompt}
              onAction={() => dispatch(recommendations.deepenPrompt.action)} />
          )}
        </div>
      )}

      {recommendations.mode === 'rich' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
        }}>
          <RichColumn title="APPLY NOW"
            subtitle="Methods you run regularly. Go-to picks for the next project."
            tone="ok"
            tools={recommendations.apply} />
          <RichColumn title="LEARN NEXT"
            subtitle={recommendations.weakestDim
              ? `Coverage gap: ${recommendations.weakestDim.label}.`
              : 'Methods to grow into.'}
            tone="gold"
            tools={recommendations.learn} />
        </div>
      )}

      {/* AI overlay — narrative + actions, rendered below the
          heuristic recommendations so the user sees both. */}
      {aiError && (
        <div style={{
          marginTop: 12, padding: '8px 10px',
          background: '#FCE8E2', border: '1.5px solid #C0452A',
          borderRadius: 8, fontSize: 11, color: '#7A1F0E', lineHeight: 1.4,
        }}>{aiError}</div>
      )}
      {aiResult && (
        <div style={{
          marginTop: 14, padding: '12px 12px 10px',
          background: '#F2EDE4', borderRadius: 12,
          border: '2px solid ' + INK,
          boxShadow: '2px 2px 0 ' + INK,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
          }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11, color: INK,
              letterSpacing: '.08em', textTransform: 'uppercase',
            }}>AI insights</span>
          </div>
          {aiResult.narrative && (
            <p style={{
              fontSize: 12, color: '#3F3A36', lineHeight: 1.5,
              margin: '0 0 10px',
            }}>{aiResult.narrative}</p>
          )}
          {aiResult.actions.map((a, i) => (
            <AiActionRow key={i} action={a}
              onClick={() => {
                if (a.tool) {
                  // Open the tool in its own gate/dim
                  const gate = a.tool.g?.[0] || 1
                  const dim  = a.tool.d?.[0]
                  if (dim) goExploreDim?.(gate, dim)
                  else goExplore?.(gate)
                } else if (a.type === 'workshop') {
                  goFacilitator?.()
                }
              }} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Challenge row (sparse + mixed deepen prompt) ───────────────
function ChallengeRow({ challenge, onAction }) {
  const ICON = {
    workshop: '🗂',
    evaluate: '✏',
    team:     '👥',
  }
  return (
    <button onClick={onAction}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px',
        background: '#F2EDE4',
        border: `2px solid ${INK}33`, borderRadius: 12,
        textAlign: 'left', cursor: 'pointer', width: '100%',
        transition: 'transform .08s, border-color .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = INK }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = INK + '33' }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        background: '#FFFFFF', border: `2px solid ${INK}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>{ICON[challenge.kind] || '◆'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 14, color: INK,
          letterSpacing: '.04em', textTransform: 'uppercase',
          lineHeight: 1.15, marginBottom: 4,
        }}>{challenge.title}</div>
        <div style={{
          fontSize: 11, color: '#5A5550', lineHeight: 1.5,
        }}>{challenge.rationale}</div>
      </div>
      <div style={{
        flexShrink: 0, alignSelf: 'center',
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 18, color: '#9C958A',
      }}>›</div>
    </button>
  )
}

// ── Tool suggestion (mixed mode) ───────────────────────────────
function ToolSuggestionRow({ dim, tool, rationale, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '10px 12px',
        background: '#FFFFFF',
        border: `2px solid ${dim.color}33`, borderRadius: 12,
        textAlign: 'left', cursor: 'pointer', width: '100%',
      }}>
      <div style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        background: dim.color + '22',
        border: '1.5px solid ' + dim.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, marginTop: 1,
      }}>{dim.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: 14, fontWeight: 700,
          color: INK, marginBottom: 2,
        }}>{tool.n}</div>
        <div style={{ fontSize: 11, color: '#8B8074', lineHeight: 1.5 }}>
          {rationale}
        </div>
      </div>
    </button>
  )
}

// ── Rich-mode column (apply now / learn next) ──────────────────
function RichColumn({ title, subtitle, tone, tools }) {
  const tones = {
    ok:   { bg: '#E6F4EC', border: '#10B981', label: '#1F4E32' },
    gold: { bg: '#FFF4D8', border: '#F97316', label: '#7B4A12' },
  }
  const t = tones[tone] || tones.ok
  return (
    <div style={{
      background: t.bg, borderRadius: 12,
      border: `2px solid ${t.border}`, padding: '12px 12px 10px',
      boxShadow: '2px 2px 0 ' + t.border,
    }}>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 12, color: t.label,
        letterSpacing: '.08em', marginBottom: 4,
      }}>{title}</div>
      <div style={{ fontSize: 11, color: t.label, opacity: 0.85, marginBottom: 10, lineHeight: 1.4 }}>
        {subtitle}
      </div>
      {tools.length === 0 && (
        <div style={{
          fontSize: 11, color: t.label, opacity: 0.6,
          fontStyle: 'italic',
        }}>none yet</div>
      )}
      {tools.map((tl, i) => (
        <div key={tl.n} style={{
          padding: '8px 0',
          borderTop: i > 0 ? `1px solid ${t.border}33` : 'none',
        }}>
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: 13, fontWeight: 700,
            color: INK, marginBottom: 3,
          }}>{tl.n}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(tl.d || []).map(did => {
              const d = DIM_BY_ID[did]
              if (!d) return null
              return (
                <span key={did} style={{
                  padding: '2px 6px', borderRadius: 5,
                  background: d.color + '22', color: d.color,
                  fontSize: 9, fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}>{d.label}</span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── AI action row (renders an AI-generated suggestion) ─────────
function AiActionRow({ action, onClick }) {
  const TONE = {
    workshop: { col: '#3B82F6', icon: '🗂', label: 'Workshop' },
    evaluate: { col: '#7C2D12', icon: '✏',  label: 'Evaluate' },
    apply:    { col: '#10B981', icon: '🚀', label: 'Apply now' },
    learn:    { col: '#F97316', icon: '📘', label: 'Learn next' },
  }
  const t = TONE[action.type] || TONE.evaluate
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: '8px 10px', marginTop: 6,
        background: '#FFFFFF',
        border: `1.5px solid ${t.col}55`, borderRadius: 10,
        textAlign: 'left', cursor: action.tool ? 'pointer' : 'default',
        width: '100%',
      }}>
      <div style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        background: t.col + '22', border: `1.5px solid ${t.col}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11,
      }}>{t.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline',
          justifyContent: 'space-between', gap: 8,
        }}>
          <span style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 12, color: INK,
            letterSpacing: '.04em', textTransform: 'uppercase',
            flex: 1, minWidth: 0, overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{action.title}</span>
          <span style={{
            flexShrink: 0,
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 9, color: t.col,
            letterSpacing: '.06em',
          }}>{t.label}</span>
        </div>
        {action.tool && (
          <div style={{
            fontFamily: 'Georgia, serif', fontSize: 12, fontWeight: 700,
            color: '#3F3A36', marginTop: 3,
          }}>{action.tool.n}</div>
        )}
        {action.rationale && (
          <div style={{
            fontSize: 11, color: '#5A5550', lineHeight: 1.45, marginTop: 3,
          }}>{action.rationale}</div>
        )}
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────
export function DashboardView() {
  const {
    practiced, dashboardGate, dashboardTab, xp,
    projectContext, aiSuggestions,
    projects, currentProjectId, selectProject, deleteProject,
    goMap, goFacilitator, goExplore, goExploreDim,
    goWelcome, goProjectFit,
    currentTeamId, teams, userId,
  } = useStore(useShallow(s => ({
    practiced:        s.practiced,
    dashboardGate:    s.dashboardGate,
    dashboardTab:     s.dashboardTab,
    xp:               s.xp,
    projectContext:   s.projectContext,
    aiSuggestions:    s.aiSuggestions,
    projects:         s.projects,
    currentProjectId: s.currentProjectId,
    selectProject:    s.selectProject,
    deleteProject:    s.deleteProject,
    goMap:            s.goMap,
    goFacilitator:    s.goFacilitator,
    goExplore:        s.goExplore,
    goExploreDim:     s.goExploreDim,
    goWelcome:        s.goWelcome,
    goProjectFit:     s.goProjectFit,
    currentTeamId:    s.currentTeamId,
    teams:            s.teams,
    userId:           s.userId,
  })))

  const hasShortlist = !!(projectContext && aiSuggestions?.length > 0)

  const currentTeam = teams.find(t => t.id === currentTeamId) || null

  // Tab defaults: honour `dashboardTab` if the navigator passed one
  // (e.g. WelcomeView's project pill explicitly asks for 'project').
  // Otherwise land on Overall — context before drilling down.
  const [tab, setTab] = useState(dashboardTab || 'overall')

  const scores      = dimScores(practiced)
  const gates       = gateStats(practiced)
  const recommendations = classifyDashboard(scores, gates, practiced)

  const tabs = [
    // Project tab only shows when the user has a saved AI shortlist.
    // It's the most action-oriented surface (recommended methods +
    // gaps + workshop CTAs), so when it exists it leads.
    ...(hasShortlist ? [{ id: 'project', label: 'Project', color: '#F97316' }] : []),
    { id: 'overall', label: 'Overall', color: INK },
    // Team tab only shows when the user is signed in *and* part of a
    // team. Hide it entirely otherwise — the overall tab already
    // covers personal progress.
    ...(currentTeam ? [{ id: 'team', label: 'Team', color: '#10B981' }] : []),
    ...[1,2,3,4].map(g => ({
      id: `gate-${g}`,
      label: GATE_LABEL[g],
      color: GATE_COL[g],
    })),
  ]

  return (
    <div className="anim-fadein" style={{ paddingBottom: 32 }}>
      {/* Nav row — quiet back-links only. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={goMap}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            background: '#FFFFFF', border: '1px solid #E0DAD2',
            color: '#6B6460', fontSize: 11, fontWeight: 800,
          }}>← MAP</button>
        <button onClick={goWelcome}
          style={{
            padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
            background: '#FFFFFF', border: '1px solid #E0DAD2',
            color: '#6B6460', fontSize: 11, fontWeight: 800,
          }}>← MY PROJECTS</button>
      </div>

      {/* Title + primary CTA — the dashboard's job after Phase 1 is to
          hand you back to a project (either the saved one, or a new
          one). Don't let it feel like a dead-end status screen. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        gap: 12, marginBottom: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div className="text-mega" style={{
            fontSize: 28, color: INK, textTransform: 'uppercase',
          }}>Dashboard</div>
          <div style={{ fontSize: 11, color: '#8B8074', marginTop: 3 }}>
            {Object.keys(practiced).length} method{Object.keys(practiced).length === 1 ? '' : 's'} evaluated out of {TOOLS.length}
          </div>
        </div>
        <button
          onClick={hasShortlist ? goProjectFit : goWelcome}
          style={{
            position: 'relative',
            padding: '10px 16px',
            background: '#FFC83D',
            color: INK,
            border: `2.5px solid ${INK}`,
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '3px 3px 0 ' + INK,
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 14,
            letterSpacing: '.04em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
          ✨ {hasShortlist ? 'Open my shortlist' : 'Analyse a project'} →
        </button>
      </div>

      {/* Saved-projects strip — only renders when the user has at
          least one saved analysis. Each pill switches the active
          project (loading its shortlist into the Project tab); the
          inline × deletes after a confirm. The trailing "+ NEW"
          pill drops into the Welcome chat to start another. */}
      {projects && projects.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 6, marginBottom: 12,
          flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 10, color: '#5A5550',
            letterSpacing: '.08em', textTransform: 'uppercase',
            marginRight: 4, flexShrink: 0,
          }}>
            Projects
          </div>
          {[...projects]
            .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
            .map(p => {
              const active = p.id === currentProjectId
              return (
                <div key={p.id} style={{
                  display: 'inline-flex', alignItems: 'stretch',
                  background: active ? '#FFFDF8' : '#FFFFFF',
                  border: `1.5px ${active ? 'solid' : 'dashed'} ${active ? INK : INK + '55'}`,
                  borderRadius: 999,
                  overflow: 'hidden',
                  fontSize: 12,
                }}>
                  <button type="button"
                    onClick={() => {
                      selectProject(p.id)
                      // Land them on the Project tab so the switch
                      // is visible (otherwise it's a silent state
                      // change with no feedback).
                      setTab('project')
                    }}
                    title={p.desc ? p.desc.slice(0, 140) : p.name}
                    style={{
                      padding: '5px 10px',
                      background: 'transparent', border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'Barlow Condensed, Impact, sans-serif',
                      fontWeight: 900, fontSize: 11,
                      color: INK, letterSpacing: '.04em',
                      textTransform: 'uppercase',
                      maxWidth: 220,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                    {active && (
                      <svg viewBox="0 0 24 24" width="11" height="11"
                        style={{ verticalAlign: '-1px', marginRight: 4 }}>
                        <path d="M5 13l4 4L19 7" fill="none" stroke={INK}
                          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {p.name}
                  </button>
                  <button type="button"
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? This can't be undone.`)) {
                        deleteProject(p.id)
                      }
                    }}
                    title="Delete this project"
                    style={{
                      padding: '0 9px',
                      background: 'transparent', border: 'none',
                      borderLeft: `1px ${active ? 'solid' : 'dashed'} ${INK}33`,
                      cursor: 'pointer',
                      fontSize: 13, color: '#9C958A', fontWeight: 900,
                      lineHeight: 1,
                    }}>×</button>
                </div>
              )
            })}
          <button type="button"
            onClick={goWelcome}
            style={{
              padding: '5px 12px',
              background: '#FFFFFF',
              border: `1.5px dashed ${INK}55`,
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11,
              color: '#5A5550', letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}>
            + New project
          </button>
        </div>
      )}

      {/* Tab strip */}
      <TabStrip tabs={tabs} activeId={tab} onPick={setTab} />

      {/* Tab content */}
      {tab === 'project' ? (
        <ProjectView
          project={projectContext}
          suggestions={aiSuggestions}
          practiced={practiced}
          methodfit={(projects.find(p => p.id === currentProjectId) || {}).methodfit || {}}
          goExploreDim={goExploreDim}
          goFacilitator={goFacilitator}
          goProjectFit={goProjectFit}
          goProjectMethodfit={() => useStore.getState().goProjectMethodfit()} />
      ) : tab === 'overall' ? (
        <OverallView practiced={practiced} scores={scores} gates={gates}
          recommendations={recommendations}
          xp={xp}
          goExplore={goExplore} goExploreDim={goExploreDim}
          goFacilitator={goFacilitator}
          goProfile={() => useStore.getState().goProfile()} />
      ) : tab === 'team' ? (
        <TeamView team={currentTeam} userId={userId} />
      ) : (
        <GateDetail
          gate={parseInt(tab.replace('gate-', ''), 10)}
          practiced={practiced}
          goExplore={goExplore}
          goExploreDim={goExploreDim} />
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Project view — dashboard tab focused on the user's current
// AI-analysed project. Pulls projectContext + aiSuggestions from
// the store and crosses them with the user's mastery state to
// surface (a) what's already covered, (b) what's still untouched
// and worth rating, (c) the gates / dimensions the project's
// recommended methods span, (d) workshop / action CTAs.
// ──────────────────────────────────────────────────────────────
const MASTERY_TONE = {
  regular:    { label: 'Mastered',  col: '#10B981', tag: 'I run it' },
  occasional: { label: 'In use',    col: '#3B82F6', tag: 'Tried it' },
  theory:     { label: 'Studied',   col: '#7B4A12', tag: 'Read about' },
  none:       { label: 'New',       col: '#9C958A', tag: 'Not yet rated' },
}

function ProjectView({
  project, suggestions, practiced,
  methodfit = {},
  goExploreDim, goFacilitator, goProjectFit, goProjectMethodfit,
}) {
  // Per-tool mastery
  const rows = (suggestions || []).map(s => {
    const lvl  = practiced[s.tool.n] || null
    const tone = MASTERY_TONE[lvl || 'none']
    return { ...s, level: lvl, tone }
  })
  const counts = rows.reduce((acc, r) => {
    const k = r.level || 'none'
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
  const untouched = rows.filter(r => !r.level)

  // Phase / dimension coverage of the project's shortlist.
  const phaseCount = {}
  const dimCount   = {}
  for (const r of rows) {
    for (const g of (r.tool.g || [])) phaseCount[g] = (phaseCount[g] || 0) + 1
    for (const did of (r.tool.d || [])) dimCount[did] = (dimCount[did] || 0) + 1
  }

  const firstUntouchedDim = (() => {
    for (const r of untouched) {
      const did = r.tool.d?.[0]
      const g   = r.tool.g?.[0]
      if (did && g) return { gate: g, dimId: did }
    }
    return null
  })()

  return (
    <>
      {/* Project header — name, description, "open shortlist" link */}
      <div style={{
        background: '#FFFDF8',
        border: `2.5px solid ${INK}`, borderRadius: 14,
        padding: '14px 16px', marginBottom: 16,
        boxShadow: '2px 2px 0 ' + INK,
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
          color: '#9C958A', textTransform: 'uppercase',
        }}>Project method-fit</div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 22, color: INK,
          lineHeight: 1.1, marginTop: 2,
        }}>{project?.name || 'Your project'}</div>
        {project?.desc && (
          <div style={{
            fontSize: 12, color: '#3F3A36', lineHeight: 1.5,
            marginTop: 8,
          }}>{project.desc}</div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={goProjectFit}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: `1.5px dashed ${INK}55`, borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11,
              color: INK, letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}>↗ Open shortlist</button>
          {goProjectMethodfit && (
            <button onClick={goProjectMethodfit}
              style={{
                padding: '6px 12px',
                background: '#FFC83D',
                border: `2px solid ${INK}`, borderRadius: 999,
                cursor: 'pointer',
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 11,
                color: INK, letterSpacing: '.06em',
                textTransform: 'uppercase',
                boxShadow: '2px 2px 0 ' + INK,
              }}>
              {Object.keys(methodfit).length > 0
                ? '↻ Re-rate methodfit'
                : '✦ Rate methodfit'}
            </button>
          )}
        </div>
      </div>

      {/* Methodfit matrix — only when the user has rated at least
          one method on this project. Synthesises a single-participant
          response set from project.methodfit so the same component
          we use for live workshops also drives the solo view. */}
      {Object.keys(methodfit).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <MethodfitMatrix
            responses={Object.entries(methodfit).map(([tool, v]) => ({
              tool, fit: v.fit, capability: v.capability,
              participantId: 'self',
            }))}
            toolList={(suggestions || []).map(s => s.tool).filter(Boolean)}
            participantCount={1}
            doneCount={1} />
        </div>
      )}

      {/* Mastery breakdown — how much of the recommended toolkit the
          user already runs. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        marginBottom: 16,
      }}>
        {['regular', 'occasional', 'theory', 'none'].map(k => {
          const tone = MASTERY_TONE[k]
          const n    = counts[k] || 0
          return (
            <div key={k} style={{
              background: tone.col + '12',
              border: `1.5px solid ${tone.col}55`,
              borderRadius: 10, padding: '10px 8px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 22, color: tone.col,
                lineHeight: 1,
              }}>{n}</div>
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 10, color: tone.col,
                letterSpacing: '.06em', textTransform: 'uppercase',
                marginTop: 4,
              }}>{tone.label}</div>
            </div>
          )
        })}
      </div>

      {/* Recommended-method list with per-tool mastery */}
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
        color: '#5A5550', textTransform: 'uppercase',
        marginBottom: 8,
      }}>{rows.length} methods picked for this project</div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        marginBottom: 18,
      }}>
        {rows.map(r => (
          <button key={r.tool.n}
            onClick={() => {
              const did = r.tool.d?.[0]
              const g   = r.tool.g?.[0]
              if (did && g) goExploreDim(g, did)
            }}
            style={{
              textAlign: 'left',
              padding: '10px 12px',
              background: '#FFFDF8',
              border: `1.5px solid ${r.tone.col}55`,
              borderRadius: 10, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <span aria-hidden="true" style={{
              flexShrink: 0,
              width: 10, height: 10, borderRadius: '50%',
              background: r.tone.col,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'Georgia, serif', fontWeight: 700,
                fontSize: 13, color: INK,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.tool.n}</div>
              <div style={{
                fontSize: 10, color: '#5A5550', marginTop: 2,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {(r.tool.g || []).map(g => GATE_LABEL[g]).join(' / ')}
                {r.tool.d?.[0] && DIM_BY_ID[r.tool.d[0]]
                  ? ' · ' + DIM_BY_ID[r.tool.d[0]].label
                  : ''}
              </div>
            </div>
            <span style={{
              flexShrink: 0,
              padding: '3px 8px', borderRadius: 999,
              background: r.tone.col, color: '#FFFFFF',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 10,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>{r.tone.label}</span>
          </button>
        ))}
      </div>

      {/* Coverage — phases + dimensions the shortlist spans. */}
      <div style={{
        background: '#F2EDE4',
        border: `1.5px dashed ${INK}33`, borderRadius: 12,
        padding: '12px 14px', marginBottom: 18,
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
          color: '#5A5550', textTransform: 'uppercase',
          marginBottom: 8,
        }}>Coverage</div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8,
        }}>
          {[1,2,3,4].map(g => (
            phaseCount[g] ? (
              <span key={g} style={{
                padding: '2px 8px', borderRadius: 999,
                background: GATE_COL[g] + '22', color: GATE_COL[g],
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 11,
                letterSpacing: '.04em',
              }}>{GATE_LABEL[g]} · {phaseCount[g]}</span>
            ) : null
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(dimCount).map(([did, n]) => {
            const d = DIM_BY_ID[did]
            if (!d) return null
            return (
              <span key={did} style={{
                padding: '2px 8px', borderRadius: 999,
                background: d.color + '22', color: d.color,
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 11,
                letterSpacing: '.04em',
              }}>{d.label} · {n}</span>
            )
          })}
        </div>
      </div>

      {/* Recommended actions — workshops + rating prompts. */}
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
        color: '#5A5550', textTransform: 'uppercase',
        marginBottom: 8,
      }}>Next steps</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ProjectActionRow
          icon="🗂"
          title="Run a project method-fit workshop"
          desc="Open the live workshop with this project's shortlist pre-loaded."
          onClick={goFacilitator} />
        {untouched.length > 0 && firstUntouchedDim && (
          <ProjectActionRow
            icon="✏"
            title={`Rate ${untouched.length} untouched method${untouched.length === 1 ? '' : 's'}`}
            desc={`${untouched.length} of the ${rows.length} recommended methods aren't rated yet. Start with the first one's dim to make the gap reachable.`}
            onClick={() => goExploreDim(firstUntouchedDim.gate, firstUntouchedDim.dimId)} />
        )}
        <ProjectActionRow
          icon="✨"
          title="Find more methods"
          desc="Re-run the AI shortlist to extend the toolkit beyond the initial 12."
          onClick={goProjectFit} />
      </div>
    </>
  )
}

function ProjectActionRow({ icon, title, desc, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '12px 14px',
        background: '#F2EDE4',
        border: `2px solid ${INK}33`, borderRadius: 12,
        textAlign: 'left', cursor: 'pointer', width: '100%',
        transition: 'border-color .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = INK }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = INK + '33' }}>
      <div style={{
        flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
        background: '#FFFFFF', border: `2px solid ${INK}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 14, color: INK,
          letterSpacing: '.04em', textTransform: 'uppercase',
          lineHeight: 1.15, marginBottom: 4,
        }}>{title}</div>
        <div style={{
          fontSize: 11, color: '#5A5550', lineHeight: 1.4,
        }}>{desc}</div>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Team view — aggregate Capability Map + session history + evolution
// ──────────────────────────────────────────────────────────────
function TeamView({ team, userId }) {
  const [aggPracticed, setAggPracticed] = useState({})
  const [memberCount,  setMemberCount]  = useState(0)
  const [sessions,     setSessions]     = useState([])
  const [openSession,  setOpenSession]  = useState(null)  // { session, responses }
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!hasSupabase || !team?.id) { setLoading(false); return }
    setLoading(true)
    Promise.all([
      // Team-aggregate evaluations: every member's row tagged with
      // this team_id. We collapse to one level per tool by taking
      // the *highest* (regular > occasional > theory) so the team
      // capability reflects the strongest available skill on each
      // method.
      supabase.from('evaluations')
        .select('tool_name, level, user_id')
        .eq('team_id', team.id),
      supabase.from('team_members')
        .select('user_id')
        .eq('team_id', team.id),
      listSessionsForTeam(team.id, { limit: 30 }),
    ]).then(([evalRes, memRes, sessionList]) => {
      if (cancelled) return
      const RANK = { regular: 3, occasional: 2, theory: 1 }
      const RANK_INV = ['', 'theory', 'occasional', 'regular']
      const best = {}  // toolName → highest rank seen
      for (const r of (evalRes.data || [])) {
        const cur = best[r.tool_name] || 0
        const nxt = RANK[r.level] || 0
        if (nxt > cur) best[r.tool_name] = nxt
      }
      const agg = Object.fromEntries(
        Object.entries(best).map(([t, rank]) => [t, RANK_INV[rank]])
      )
      setAggPracticed(agg)
      setMemberCount((memRes.data || []).length)
      setSessions(sessionList)
      setLoading(false)
    }).catch(err => {
      console.warn('[TeamView] load failed:', err?.message || err)
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [team?.id, userId])

  if (!team) {
    return (
      <div style={{
        background: '#FFFFFF', border: '1px solid #E0DAD2',
        borderRadius: 14, padding: 24, textAlign: 'center',
        color: '#6B6460', fontSize: 13, lineHeight: 1.5,
      }}>
        No team selected. Open your <b>Profile</b> to create or join one.
      </div>
    )
  }

  return (
    <>
      {/* Team header */}
      <div style={{
        background: '#FFFFFF', borderRadius: 14,
        border: '1px solid #E0DAD2', padding: 14, marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          flexShrink: 0, width: 40, height: 40, borderRadius: '50%',
          background: '#E6F4EC', border: '2.5px solid #10B981',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 18, color: '#10B981',
        }}>{(team.name?.[0] || 'T').toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 18, color: INK,
            letterSpacing: '.02em', textTransform: 'uppercase', lineHeight: 1.1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{team.name}</div>
          <div style={{ fontSize: 11, color: '#5A5550', marginTop: 2 }}>
            {team.city ? `${team.city} · ` : ''}
            {memberCount} member{memberCount !== 1 ? 's' : ''} ·
            {' '}{Object.keys(aggPracticed).length} method{Object.keys(aggPracticed).length === 1 ? '' : 's'} mapped
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{
          padding: 24, textAlign: 'center',
          color: '#9C958A', fontSize: 12, fontStyle: 'italic',
        }}>Loading team data…</div>
      ) : (
        <>
          {/* Team Capability Map — reuses CapabilityMap with the
              team-aggregate practiced object. Only renders when there
              IS data (CapabilityMap returns null on empty input). */}
          <CapabilityMap practiced={aggPracticed} />

          {/* Evolution chart — counts of completed sessions per week
              over the last ~3 months. */}
          {sessions.length > 1 && (
            <SessionEvolutionChart sessions={sessions} />
          )}

          {/* Session history */}
          <div style={{
            borderRadius: 14, background: '#FFFFFF',
            border: '1px solid #E0DAD2', padding: 16, marginBottom: 16,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 800, color: '#6B6460',
              textTransform: 'uppercase', letterSpacing: '.06em',
              marginBottom: 14,
            }}>Session history</div>
            {sessions.length === 0 && (
              <div style={{
                fontSize: 12, color: '#9C958A', fontStyle: 'italic',
                lineHeight: 1.5, padding: '8px 0',
              }}>
                No workshops yet. Launch one from the Live Workshop
                screen — it'll appear here once you start collecting
                responses.
              </div>
            )}
            {sessions.map(s => (
              <SessionRow key={s.id}
                session={s}
                expanded={openSession?.session?.id === s.id}
                detail={openSession?.session?.id === s.id ? openSession : null}
                onToggle={async () => {
                  if (openSession?.session?.id === s.id) {
                    setOpenSession(null)
                  } else {
                    setOpenSession({ session: s, responses: null })
                    const full = await loadSessionFull(s.id)
                    if (full) setOpenSession(full)
                  }
                }} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ── Session row + expansion ────────────────────────────────────
const MODE_META = {
  triage:    { label: 'Team scan',            col: '#3B82F6' },
  methodfit: { label: 'Project method-fit',   col: '#F97316' },
  question:  { label: 'Live question',        col: '#8B5CF6' },
}

function SessionRow({ session, expanded, detail, onToggle }) {
  const meta = MODE_META[session.mode] || { label: session.mode, col: INK }
  const date = new Date(session.started_at)
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
  const responses = detail?.responses
  const participantCount = responses
    ? new Set(responses.map(r => r.participant_anon_id)).size
    : null

  return (
    <div style={{
      borderTop: '1px solid #F0EBE4',
      padding: '10px 0',
    }}>
      <button onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left',
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 0,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
        <div style={{
          flexShrink: 0,
          width: 8, height: 8, borderRadius: '50%',
          background: meta.col,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 13, color: INK,
            letterSpacing: '.04em', textTransform: 'uppercase',
            lineHeight: 1.1,
          }}>
            {meta.label}
            {session.project_name && (
              <span style={{ color: meta.col }}> · {session.project_name}</span>
            )}
          </div>
          <div style={{
            fontSize: 10, color: '#9C958A', marginTop: 2,
          }}>
            {dateLabel}
            {session.gate ? ` · ${GATE_LABEL[session.gate]}` : ''}
            {session.dim && session.dim !== 'all'
              ? ` · ${DIM_BY_ID[session.dim]?.label || session.dim}` : ''}
            {session.ended_at ? '' : ' · in progress'}
          </div>
        </div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 16, color: '#9C958A',
          flexShrink: 0,
          transition: 'transform .15s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
        }}>›</div>
      </button>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {!responses ? (
            <div style={{
              fontSize: 11, color: '#9C958A', fontStyle: 'italic',
            }}>Loading responses…</div>
          ) : responses.length === 0 ? (
            <div style={{
              fontSize: 11, color: '#9C958A', fontStyle: 'italic',
            }}>No responses recorded.</div>
          ) : session.mode === 'triage' ? (
            <TriageHeatmap
              responses={responses.map(r => ({
                tool: r.tool_name,
                status: r.payload?.status,
                level: r.payload?.level,
                participantId: r.participant_anon_id,
              }))}
              toolList={triageDeckFromSession(session, responses)}
              participantCount={participantCount} />
          ) : session.mode === 'methodfit' ? (
            <MethodfitMatrix
              responses={responses.map(r => ({
                tool: r.tool_name,
                fit: r.payload?.fit,
                capability: r.payload?.capability,
                participantId: r.participant_anon_id,
              }))}
              toolList={methodfitDeckFromSession(session, responses)}
              participantCount={participantCount}
              doneCount={participantCount} />
          ) : (
            <QuestionResponsesList responses={responses} />
          )}
        </div>
      )}
    </div>
  )
}

// Recover a deck for the session — prefer the explicit method_names
// (AI-curated decks), fall back to gate/dim filters, and finally to
// the union of tools that actually appear in the responses.
function triageDeckFromSession(session, responses) {
  const fromResponses = unionToolsFromResponses(responses)
  if (session.method_names?.length > 0) {
    return TOOLS.filter(t => session.method_names.includes(t.n))
  }
  if (session.gate) {
    if (session.dim && session.dim !== 'all') return toolsForGateDim(session.gate, session.dim)
    return toolsForGate(session.gate)
  }
  return fromResponses
}

function methodfitDeckFromSession(session, responses) {
  return triageDeckFromSession(session, responses)
}

function unionToolsFromResponses(responses) {
  const names = new Set(responses.map(r => r.tool_name).filter(Boolean))
  return TOOLS.filter(t => names.has(t.n))
}

// ── Live-Q responses (minimal aggregation list) ────────────────
function QuestionResponsesList({ responses }) {
  // Group by questionId; show count per question + sample answers.
  const byQ = {}
  for (const r of responses) {
    const id = r.payload?.questionId || 'unknown'
    if (!byQ[id]) byQ[id] = { id, values: [] }
    byQ[id].values.push(r.payload?.value)
  }
  const groups = Object.values(byQ)
  return (
    <div>
      {groups.map(g => (
        <div key={g.id} style={{
          padding: '8px 10px', marginBottom: 6,
          background: '#FAF7F2', borderRadius: 8,
          border: '1px solid #E0DAD2',
        }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 11, color: INK,
            letterSpacing: '.04em', textTransform: 'uppercase',
            marginBottom: 4,
          }}>{g.id} · {g.values.length} responses</div>
          <div style={{ fontSize: 11, color: '#3F3A36', lineHeight: 1.4 }}>
            {g.values.slice(0, 8).map((v, i) =>
              <span key={i} style={{
                display: 'inline-block', marginRight: 6,
              }}>{String(v).slice(0, 32)}{i < g.values.length - 1 ? ' ·' : ''}</span>
            )}
            {g.values.length > 8 && <span> +{g.values.length - 8} more</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Evolution chart — sessions per week, simple SVG sparkline ──
function SessionEvolutionChart({ sessions }) {
  // Bucket sessions into ISO weeks for the last 12 weeks.
  const weeks = []
  const now = new Date()
  const startOfWeek = (d) => {
    const x = new Date(d)
    const day = x.getDay() || 7
    x.setHours(0, 0, 0, 0)
    x.setDate(x.getDate() - day + 1)
    return x
  }
  const here = startOfWeek(now)
  for (let i = 11; i >= 0; i--) {
    const w = new Date(here)
    w.setDate(w.getDate() - i * 7)
    weeks.push({ start: w, n: 0 })
  }
  for (const s of sessions) {
    const ws = startOfWeek(new Date(s.started_at))
    const idx = weeks.findIndex(w => w.start.getTime() === ws.getTime())
    if (idx >= 0) weeks[idx].n += 1
  }
  const maxN = Math.max(1, ...weeks.map(w => w.n))
  const W = 240, H = 60, PAD = 4
  const xStep = (W - PAD * 2) / (weeks.length - 1)
  const yFor = (n) => H - PAD - (n / maxN) * (H - PAD * 2)
  const points = weeks.map((w, i) => `${(PAD + i * xStep).toFixed(1)},${yFor(w.n).toFixed(1)}`)
  const polyline = points.join(' ')
  const totalLast = weeks.reduce((s, w) => s + w.n, 0)

  return (
    <div style={{
      borderRadius: 14, background: '#FFFFFF',
      border: '1px solid #E0DAD2', padding: 16, marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 8,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: '#6B6460',
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>Workshop activity</div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 13, color: '#10B981',
        }}>{totalLast} session{totalLast === 1 ? '' : 's'} · 12w</div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ display: 'block' }}>
        {/* baseline */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD}
          stroke={INK} strokeWidth="1" opacity="0.18" />
        <polyline points={polyline}
          fill="none" stroke={INK} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        {weeks.map((w, i) => (
          w.n > 0 && (
            <circle key={i}
              cx={PAD + i * xStep} cy={yFor(w.n)} r="3"
              fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
          )
        ))}
      </svg>
    </div>
  )
}
