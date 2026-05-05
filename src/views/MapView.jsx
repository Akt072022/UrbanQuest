import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_LABEL, DIMENSIONS,
  toolsForGate, toolsForGateDim,
  practicedForGate, practicedForGateDim,
  scoreForGateDim,
  isUnlocked, TOOLS,
} from '../data/tools'
import { ScrappyButton } from '../components/ScrappyButton'

// Dimension illustrations — shared with the workshop wizard.
import { DIM_ICON } from '../data/dimIcons'

// ── Visual constants ─────────────────────────────────────────
const INK     = '#1C2530'
const YELLOW  = '#FFC83D'
const TEAL    = '#14B8A6'
const CORAL   = '#FB7185'
const GATE_COL = ['', '#F97316', '#3B82F6', '#10B981', '#8B5CF6']

// ── Layout — each gate is a ROSETTE, not a path segment ─────
// • Each gate sits on the spine (vertical on mobile, horizontal on
//   desktop / tablet).
// • Its 6 dimensions sit on a circle around it at NODE_R_MAX radius,
//   spaced 60° apart. The angles are rotated by orientation so the
//   spine threads cleanly through the open clock positions:
//     - vertical layout   → dims at 1, 3, 5, 7, 9, 11; spine at 12+6
//     - horizontal layout → dims at 12, 2, 4, 6, 8, 10; spine at 3+9
// • The gate's openness drives the ring's radius: closed = 0 (nodes
//   collapsed onto the milestone, invisible), open = NODE_R_MAX.
// • Spine gap between gates compresses when adjacent gates close.
const PATH_W      = 360             // canvas width in vertical layout
const CX          = PATH_W / 2
const TOP         = 60
const NODE_R_MAX  = 150
const GATE_GAP    = 70
const MILESTONE_HALF = 52
// Horizontal layout: per-gate canvas height + side padding. CY_H is
// the constant Y of every gate's centre when laid out horizontally.
const PATH_H      = 360
const CY_H        = PATH_H / 2
const LEFT_PAD    = 60

// Two angle sets — one per orientation, rotated by 30° relative to
// each other so the spine never collides with a dim node.
const DIM_ANGLES_DEG_V = [30, 90, 150, 210, 270, 330]
const DIM_ANGLES_DEG_H = [0, 60, 120, 180, 240, 300]
const DIM_ANGLES_V = DIM_ANGLES_DEG_V.map(a => a * Math.PI / 180)
const DIM_ANGLES_H = DIM_ANGLES_DEG_H.map(a => a * Math.PI / 180)
// Default — kept under the legacy name so any external import resolves.
const DIM_ANGLES = DIM_ANGLES_V

// Rosette layout reserves ICON_HALF for step icons, LABEL_BLOCK for
// the dim names + counters under each icon (only when the rosette is
// open), and TITLE_BLOCK for the title pill + tool counter that sits
// below the gate radar regardless of state.
const ICON_HALF      = 40
const LABEL_BLOCK    = 32
const TITLE_BLOCK    = 56

function buildGates(opennessByGate, orientation = 'v') {
  const isH = orientation === 'h'
  const gates = []
  let cur = isH ? LEFT_PAD : TOP
  for (let g = 1; g <= 4; g++) {
    const o    = opennessByGate ? (opennessByGate[g - 1] ?? 0) : 1
    const ovis = Math.max(0, o)              // never negative
    const oc   = Math.min(1, ovis)           // clamp for layout (no overshoot)
    const radius = NODE_R_MAX * ovis         // visual position keeps overshoot
    // Spine reach: from gate centre to the outer edge of the dim icons
    // along the spine direction. Vertical spine: dims at 30°/150° → the
    // top/bottom extent is radius * cos(30°) = 0.866 r. Horizontal spine:
    // dims at 60°/120° → the left/right extent is radius * sin(60°) =
    // 0.866 r. Same factor either way, because the angle sets are
    // rotated mirror images.
    const halfStart = Math.max(MILESTONE_HALF + 8, NODE_R_MAX * oc * 0.866 + ICON_HALF)
    // Perpendicular reach (drawn outward from the spine): same as
    // halfStart + labels under the icons (only when rosette is open) +
    // title pill (vertical layout only — in horizontal it sits inside
    // the canvas because there's room).
    const halfEnd = halfStart + oc * LABEL_BLOCK + (isH ? 0 : TITLE_BLOCK)

    if (g === 1) {
      cur += halfStart + 20
    } else {
      cur += gates[g - 2].halfStart + GATE_GAP + halfStart
    }

    if (isH) {
      gates.push({
        g, cx: cur, cy: CY_H, radius,
        halfStart, halfEnd, halfTop: halfStart, halfBot: halfStart,
        halfLeft: halfStart, halfRight: halfStart,
      })
    } else {
      gates.push({
        g, cx: CX, cy: cur, radius,
        halfStart, halfEnd, halfTop: halfStart, halfBot: halfEnd,
        halfLeft: halfStart, halfRight: halfStart,
      })
    }
  }
  return gates
}

function buildStops(gates, practiced, orientation = 'v') {
  const stops = []
  const angles = orientation === 'h' ? DIM_ANGLES_H : DIM_ANGLES_V
  for (const gate of gates) {
    const gateUnlocked = isUnlocked(gate.g, practiced)
    const gateStarted  = practicedForGate(gate.g, practiced) > 0
    // A gate that is technically locked by progression but the user
    // has already started gets the same visual treatment as unlocked
    // — encourages the "I'd rather work on Anchoring first" path.
    const gateLockedVisual = !gateUnlocked && !gateStarted

    DIMENSIONS.forEach((dim, i) => {
      const a = angles[i]
      const nx = gate.cx + gate.radius * Math.sin(a)
      const ny = gate.cy - gate.radius * Math.cos(a)
      const total = toolsForGateDim(gate.g, dim.id).length
      const done  = practicedForGateDim(gate.g, dim.id, practiced)
      stops.push({
        kind: 'node', gate: gate.g, dim,
        x: nx, y: ny,
        total, done,
        empty:    total === 0,
        complete: total > 0 && done === total,
        // Dim stops follow the gate's visual lock state. They remain
        // tappable regardless — `locked` now drives styling only.
        locked:   gateLockedVisual,
        started:  done > 0,
      })
    })
    const gT = toolsForGate(gate.g).length
    const gD = practicedForGate(gate.g, practiced)
    // Per-dimension done/score — drives the radar gauge polygon.
    // `score` is the weighted depth (0..1 per tool) while `done` is
    // the raw evaluation count.
    const dims = DIMENSIONS.map(dim => ({
      id:    dim.id,
      total: toolsForGateDim(gate.g, dim.id).length,
      done:  practicedForGateDim(gate.g, dim.id, practiced),
      score: scoreForGateDim(gate.g, dim.id, practiced),
    }))
    stops.push({
      kind: 'milestone', gate: gate.g,
      x: gate.cx, y: gate.cy,
      halfTop: gate.halfTop,
      total: gT, done: gD,
      dims,
      complete: gD === gT,
      locked:   gateLockedVisual,
      started:  gateStarted,
    })
  }
  return stops
}

function buildPathD(gates, orientation = 'v') {
  if (!gates.length) return ''
  // Spine connects all gate CENTRES. Vertical: a single line at x=CX
  // running top-to-bottom. Horizontal: a single line at y=CY_H running
  // left-to-right. Each hexagon's fill covers the segment that runs
  // behind it either way.
  if (orientation === 'h') {
    const left  = gates[0].cx
    const right = gates[gates.length - 1].cx
    return `M ${left.toFixed(1)} ${CY_H} L ${right.toFixed(1)} ${CY_H}`
  }
  const top = gates[0].cy
  const bot = gates[gates.length - 1].cy
  return `M ${CX} ${top.toFixed(1)} L ${CX} ${bot.toFixed(1)}`
}

// ── Per-gate elastic spring (0..1 with overshoot) ─────────────
// Drives both the road's bezier "amp" (the bulge of each arc) and
// the step nodes' scale/opacity, so opening a gate looks like a
// dark arm stretching out while the previous one snaps shut.
function useGateSprings(openGate, count = 4) {
  const initial = () =>
    Array.from({ length: count }, (_, i) => (i + 1 === openGate ? 1 : 0))
  const [values, setValues] = useState(initial)
  const ref = useRef({ values: initial(), vels: new Array(count).fill(0) })

  useEffect(() => {
    const targets = Array.from(
      { length: count },
      (_, i) => (i + 1 === openGate ? 1 : 0),
    )
    const stiffness = 0.18
    const damping   = 0.74          // < 1 → springy oscillation
    let raf
    const tick = () => {
      const s = ref.current
      let settled = true
      for (let i = 0; i < count; i++) {
        const dx = targets[i] - s.values[i]
        s.vels[i] = (s.vels[i] + dx * stiffness) * damping
        s.values[i] += s.vels[i]
        if (Math.abs(dx) > 0.0008 || Math.abs(s.vels[i]) > 0.0008) {
          settled = false
        }
      }
      if (settled) {
        for (let i = 0; i < count; i++) {
          s.values[i] = targets[i]
          s.vels[i] = 0
        }
        setValues(s.values.slice())
        return
      }
      setValues(s.values.slice())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [openGate, count])

  return values
}

function findActiveIdx(stops) {
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]
    if (s.kind !== 'node') continue
    if (s.locked) continue
    if (s.empty) continue
    if (!s.complete) return i
  }
  for (let i = stops.length - 1; i >= 0; i--) {
    if (stops[i].kind === 'node' && !stops[i].empty) return i
  }
  return 0
}

// ──────────────────────────────────────────────────────────────
// The spine — single line linking all 4 gate rosettes. Vertical
// on mobile (full width PATH_W, height = totalSize); horizontal on
// desktop/tablet (full width totalSize, height PATH_H).
// ──────────────────────────────────────────────────────────────
function RibbonPath({ gates, totalSize, orientation = 'v' }) {
  const d = buildPathD(gates, orientation)
  const isH = orientation === 'h'
  return (
    <svg
      width={isH ? totalSize : PATH_W}
      height={isH ? PATH_H : totalSize}
      style={{
        position: 'absolute', top: 0,
        left: isH ? 0 : '50%',
        transform: isH ? 'none' : 'translateX(-50%)',
        zIndex: 0, pointerEvents: 'none',
        overflow: 'visible',
      }}>
      <path d={d} fill="none" stroke={INK} strokeWidth="22"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────
// Viewport detection — switches the map between vertical (default)
// and horizontal at a 900 px breakpoint. We use JS rather than a
// pure CSS @media query because the gate / dim / spine positions
// are computed in JS with absolute positioning, so the layout
// function itself needs to know which axis it's rendering on.
// ──────────────────────────────────────────────────────────────
const HORIZONTAL_BREAKPOINT = 900
function useMapOrientation() {
  const [orientation, setOrientation] = useState(() => {
    if (typeof window === 'undefined') return 'v'
    return window.innerWidth >= HORIZONTAL_BREAKPOINT ? 'h' : 'v'
  })
  useEffect(() => {
    const onResize = () => {
      setOrientation(window.innerWidth >= HORIZONTAL_BREAKPOINT ? 'h' : 'v')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return orientation
}

// ──────────────────────────────────────────────────────────────
// Step circle — empty placeholder for a future illustration
// (drop a PNG in /public/illustrations/g{N}/stage-{N}.png OR
// inject your own <svg> here when you have the artwork)
// ──────────────────────────────────────────────────────────────
function PathNode({ stop, onClick, opn = 1 }) {
  const { dim, locked, empty, complete, done, total } = stop
  // No "active" highlight — every dim of the open gate is equally
  // available since players can fill several of them in parallel.
  const size = 76
  const iconSrc = DIM_ICON[dim.id]

  // Spring overshoots ~1.05; clamp negative side so the node never
  // flips through zero on close.
  const visScale = Math.max(0, opn)
  const visOpacity = Math.max(0, Math.min(1, opn))
  const interactive = visOpacity > 0.5

  return (
    <div style={{
      position: 'absolute',
      left: stop.x - size / 2, top: stop.y - size / 2,
      width: size, height: size,
      opacity: visOpacity,
      transform: `scale(${visScale})`,
      transformOrigin: 'center center',
      pointerEvents: interactive ? 'auto' : 'none',
      zIndex: 2,
    }}>
      <button onClick={onClick}
        disabled={empty}
        title={`${dim.label} · ${done}/${total}${locked ? ' · explore ahead' : ''}`}
        style={{
          width: '100%', height: '100%', padding: 0,
          background: locked ? '#E2DBCD' : '#F2EDE4',
          border: 'none',
          borderRadius: '50%',
          outline: 'none',
          cursor: empty ? 'default' : 'pointer',
          opacity: 1,
          overflow: 'visible',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform .12s',
        }}
        onMouseDown={e => { if (!empty) e.currentTarget.style.transform = 'scale(.95)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {iconSrc ? (
          <img src={iconSrc} alt=""
            draggable={false}
            style={{
              width: '95%', height: '95%',
              objectFit: 'contain',
              filter: locked ? 'grayscale(1) opacity(.55)' : 'none',
              userSelect: 'none', pointerEvents: 'none',
            }} />
        ) : (
          // Fallback for "economic" (no icon yet) — coloured dot with letter
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 36, color: locked ? '#9C958A' : dim.color,
            letterSpacing: '.04em',
          }}>{dim.short}</div>
        )}
      </button>

      {/* Star badge when complete — inline SVG so it renders on every
          font/browser (the Unicode "★" sometimes fell back to "?"). */}
      {complete && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 28, height: 28, borderRadius: '50%',
          background: '#FFD86B',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `3px solid ${INK}`,
          pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M12 2.5l3 6.2 6.8.6-5.1 4.5 1.6 6.7L12 17l-6.3 3.5 1.6-6.7L2.2 9.3l6.8-.6Z"
              fill={INK} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {/* Lock badge — inline SVG for the same reason. */}
      {locked && (
        <div style={{
          position: 'absolute', top: -6, right: -6,
          width: 26, height: 26, borderRadius: '50%',
          background: INK,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid #FFFFFF`,
          pointerEvents: 'none',
        }}>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <rect x="5" y="11" width="14" height="9" rx="2"
              fill="none" stroke="#FFFFFF" strokeWidth="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3"
              fill="none" stroke="#FFFFFF" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}

      {/* Full label + counter on its own line, centered under the icon.
          Wraps at ~100 px so even "Environmental" stays readable. */}
      <div style={{
        position: 'absolute',
        top: '100%', left: '50%',
        transform: 'translate(-50%, 6px)',
        width: 110,
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 12,
          color: locked ? '#7A746B' : INK,
          letterSpacing: '.04em', textTransform: 'uppercase',
          lineHeight: 1.05,
        }}>{dim.label}</div>
        <div style={{
          fontSize: 10, fontWeight: 700, color: '#5A5550',
          marginTop: 2, letterSpacing: '.03em',
        }}>{done}/{total}</div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Milestone — hexagonal radar gauge, one axis per dimension.
// • outer hexagon = the gate "shape" (replaces the old square)
// • progress polygon fills outward toward each dim as that dim's
//   tools get practiced → the gate visibly fills as completion grows
// • title ("Proof of Impact" etc.) sits below in plain type
// ──────────────────────────────────────────────────────────────
function PathMilestone({ stop, onClick }) {
  const { gate, complete, locked, dims } = stop
  const col       = locked ? '#9C958A' : GATE_COL[gate]
  const RAD       = 72
  const STROKE_W  = 3
  const VB        = (RAD + STROKE_W * 2) * 2

  const polyStr = (radii) => DIM_ANGLES.map((a, i) => {
    const r = radii[i]
    const x = r * Math.sin(a)
    const y = -r * Math.cos(a)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const outerPts = polyStr(DIM_ANGLES.map(() => RAD))
  // Polygon vertices use the WEIGHTED score (regular=1, occasional=0.6,
  // theory=0.3) so the radar reflects depth of capability, not just
  // headcount of evaluated tools.
  const progressPts = polyStr(dims.map(d => RAD * (d.total > 0 ? d.score / d.total : 0)))

  return (
    <div style={{
      position: 'absolute',
      left: stop.x - VB / 2, top: stop.y - VB / 2,
      width: VB, height: VB,
      zIndex: 2,
    }}>
      <button onClick={onClick}
        title={locked ? `${GATE_LABEL[gate]} · explore ahead` : `Open ${GATE_LABEL[gate]} details`}
        style={{
          width: '100%', height: '100%', padding: 0,
          background: 'transparent', border: 'none',
          cursor: 'pointer',
          transition: 'transform .12s',
        }}
        onMouseDown={e => { e.currentTarget.style.transform = 'scale(.96)' }}
        onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <svg width="100%" height="100%"
          viewBox={`${-VB/2} ${-VB/2} ${VB} ${VB}`}
          style={{ display: 'block', overflow: 'visible' }}>
          {/* Outer hexagon — the gate */}
          <polygon points={outerPts}
            fill={locked ? '#E2DBCD' : '#F2EDE4'}
            stroke={INK} strokeWidth={STROKE_W}
            strokeLinejoin="round" />

          {/* Light spokes — one per dimension */}
          {DIM_ANGLES.map((a, i) => (
            <line key={i}
              x1={0} y1={0}
              x2={(RAD * Math.sin(a)).toFixed(1)}
              y2={(-RAD * Math.cos(a)).toFixed(1)}
              stroke={INK} strokeWidth={1} opacity={0.18} />
          ))}

          {/* Progress polygon — grows toward each dim's completion */}
          <polygon points={progressPts}
            fill={col} fillOpacity={complete ? 0.85 : 0.5}
            stroke={col} strokeWidth={2}
            strokeLinejoin="round" />

          {/* Centre dot */}
          <circle cx={0} cy={0} r={2.5} fill={INK} />
        </svg>
      </button>

      {/* Title pill (button-like) sits right under the radar — pinned
          to the hexagon's bottom edge (vertices at angle 150°/210°
          → y = +RAD·cos(30°)) plus a small 6 px gap. */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: `translate(-50%, ${(RAD * 0.866 + 6).toFixed(1)}px)`,
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          display: 'inline-block',
          padding: '6px 14px',
          background: locked ? '#D9D2C7' : col,
          color: '#FFFFFF',
          border: `2px solid ${INK}`,
          borderRadius: 999,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 14,
          letterSpacing: '.06em', textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          boxShadow: locked ? 'none' : '2px 2px 0 ' + INK,
        }}>{GATE_LABEL[gate]}</div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Main Map view
// ──────────────────────────────────────────────────────────────
export function MapView() {
  const {
    practiced, xp,
    projectContext,
    goExplore, goExploreDim, goFacilitator, goDashboard, goProjectFit, goWelcome,
  } = useStore(useShallow(s => ({
    practiced:      s.practiced,
    xp:             s.xp,
    projectContext: s.projectContext,
    goExplore:      s.goExplore,
    goExploreDim:   s.goExploreDim,
    goFacilitator:  s.goFacilitator,
    goDashboard:    s.goDashboard,
    goProjectFit:   s.goProjectFit,
    goWelcome:      s.goWelcome,
  })))

  const tp = Object.keys(practiced).length
  const total = TOOLS.length
  const tpPct = Math.round((tp / total) * 100)
  const tg = [1,2,3,4].filter(g => practicedForGate(g, practiced) === toolsForGate(g).length).length

  // Layout orientation — vertical on mobile, horizontal on desktop /
  // tablet. The hook re-renders on viewport resize.
  const orientation = useMapOrientation()
  const isH = orientation === 'h'

  // Static (fully-open) snapshot — used only to identify the active gate.
  // Active gate logic depends on completion data, not positions, so the
  // snapshot is independent of the running animation. We still compute
  // it in the current orientation so x/y positions match the live render
  // (matters for the auto-scroll-to-active effect below).
  const staticGates = useMemo(() => buildGates([1, 1, 1, 1], orientation), [orientation])
  const staticStops = useMemo(
    () => buildStops(staticGates, practiced, orientation),
    [staticGates, practiced, orientation],
  )
  const activeIdx   = useMemo(() => findActiveIdx(staticStops), [staticStops])
  const activeGate  = staticStops[activeIdx]?.gate ?? 1

  // Rosette toggle ─ state-driven action (option C):
  //   • locked gate          → tap does nothing
  //   • in-progress gate     → tap toggles the rosette open/close
  //                            (only one rosette can be open at a time)
  //   • completed gate       → tap navigates straight to the dashboard
  //
  // peekGate tri-state:
  //   null  → follow the active gate (default)
  //   false → user explicitly closed everything
  //   <num> → that gate's rosette is open
  const [peekGate, setPeekGate] = useState(null)
  const openGate = peekGate === false
    ? null
    : (peekGate ?? activeGate)

  const togglePeek = (g) => {
    setPeekGate(prev => {
      const cur = prev === false ? null : (prev ?? activeGate)
      return cur === g ? false : g
    })
  }

  const opennessByGate = useGateSprings(openGate)

  // Live gates: each gate's radius + half-extents + node positions all
  // scale with openness, so closed gates physically pull toward each
  // other along whichever axis the spine runs.
  const gatesAnim = buildGates(opennessByGate, orientation)
  const stops     = buildStops(gatesAnim, practiced, orientation)

  const lastGate = gatesAnim[gatesAnim.length - 1]
  // Total span along the spine direction. In vertical layout the
  // canvas is PATH_W wide and totalSize tall; in horizontal it's
  // totalSize wide and PATH_H tall.
  const totalSize = isH
    ? lastGate.cx + lastGate.halfStart + 40
    : lastGate.cy + lastGate.halfBot + 40

  // Auto-scroll the parent to the active stop on first render. The
  // axis to scroll on depends on orientation. The vertical case keeps
  // its prior behaviour; the horizontal case skips auto-scroll on
  // page-load because we expect the whole strip to fit.
  const pathRef = useRef(null)
  useEffect(() => {
    if (isH) return
    if (pathRef.current && stops[activeIdx]) {
      const target = pathRef.current.offsetTop + stops[activeIdx].y - 240
      const scroller = pathRef.current.closest('div[style*="overflow"]') || window
      if (scroller === window) {
        window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      } else {
        scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStop = (stop) => {
    // Lock state is now purely cosmetic — every gate and every dim is
    // tappable so a user who feels stronger on, say, Anchoring can
    // dive in there first instead of being forced through Impact.
    if (stop.kind === 'milestone') {
      if (stop.complete) {
        goDashboard(stop.gate)        // jump to dashboard
      } else {
        togglePeek(stop.gate)         // expand/collapse its dim rosette
      }
      return
    }
    if (!stop.empty) {
      goExploreDim(stop.gate, stop.dim.id)
    }
  }

  const activeStop = stops[activeIdx]

  return (
    <div className="anim-fadein" style={{ position: 'relative' }}>
      {/* ── Title — kept lean post-Phase 1; the legacy team blob
              ("MY CITY · My team · mixed") was meaningless after the
              project-first welcome shipped, so it's gone. ────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 'clamp(28px,8vw,42px)', color: INK, lineHeight: .95,
        }}>
          BROWSE METHODS
        </div>
        <div style={{ fontSize: 12, color: '#5A5550', marginTop: 2 }}>
          All 133 methods grouped by phase and dimension. Tap any rosette to dive in.
        </div>
      </div>

      {/* ── Light progress strip (no card chrome) ───── */}
      <div style={{ marginBottom: 4, padding: '4px 2px 6px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 6,
        }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 12, color: INK, letterSpacing: '.06em',
          }}>QUEST PROGRESS</div>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 18, color: INK,
          }}>
            {tp}<span style={{ color: '#9C958A' }}>/{total}</span>
            <span style={{ fontSize: 12, color: CORAL, marginLeft: 6 }}>({tpPct}%)</span>
          </div>
        </div>
        <div style={{
          height: 14, background: '#F5F1EB',
          border: `2.5px solid ${INK}`,
          borderRadius: 999, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: tpPct + '%',
            background: `linear-gradient(90deg, ${YELLOW} 0%, ${TEAL} 50%, ${CORAL} 100%)`,
            transition: 'width .8s',
            borderRight: tpPct > 0 ? `2px solid ${INK}` : 'none',
          }} />
        </div>
        <div style={{
          display: 'flex', gap: 14, marginTop: 6,
          fontSize: 11, color: '#5A5550', fontWeight: 700,
        }}>
          <span><b style={{ color: INK }}>{tg}</b>/4 cleared</span>
          <span><b style={{ color: INK }}>{xp}</b> XP</span>
        </div>
      </div>

      {/* ── Primary CTA — single, focused. Always resumes at a single
              dim (smaller deck, ~5-7 cards) instead of the whole gate
              so the user gets a contained burst of rating with a clear
              end state. The dim chosen is whichever has un-rated tools
              first; falls through to a generic "OPEN THE FIRST PHASE"
              when nothing is mid-flight. ─────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        margin: '20px 0 28px',
      }}>
        <div style={{
          width: 240,
          animation: 'bob-cta 1.8s ease-in-out infinite',
        }}>
          {activeStop && activeStop.kind === 'node'
            && !activeStop.complete && !activeStop.locked && !activeStop.empty ? (
            <ScrappyButton onClick={() => goExploreDim(activeStop.gate, activeStop.dim.id)}
              color={YELLOW} size="md" full>
              ▼ {tp === 0 ? 'START WITH' : 'CONTINUE'} {activeStop.dim.label.toUpperCase()}
            </ScrappyButton>
          ) : (
            <ScrappyButton onClick={() => goExplore(1)}
              color={YELLOW} size="md" full>
              ▼ OPEN THE FIRST PHASE
            </ScrappyButton>
          )}
        </div>
      </div>

      {/* ── The path + rosettes on it. On mobile the canvas is
              PATH_W wide and grows tall. On desktop / tablet it's
              PATH_H tall and grows wide; the outer container scrolls
              horizontally if the strip overflows the viewport so we
              never clip the rightmost gate. ─────────────────────── */}
      <div ref={pathRef}
        style={{
          position: 'relative',
          marginLeft: '-18px', marginRight: '-18px',
          padding: '0 18px',
          overflowX: isH ? 'auto' : 'visible',
          overflowY: 'visible',
        }}>
        <div style={{
          position: 'relative',
          width: isH ? totalSize : '100%',
          height: isH ? PATH_H : totalSize,
          margin: isH ? '0 auto' : 0,
        }}>
          <RibbonPath gates={gatesAnim} totalSize={totalSize} orientation={orientation} />

          <div style={{
            position: 'absolute', top: 0,
            left: isH ? 0 : '50%',
            transform: isH ? 'none' : 'translateX(-50%)',
            width:  isH ? totalSize : PATH_W,
            height: isH ? PATH_H : totalSize,
          }}>
            {stops.map((stop, i) => {
              if (stop.kind === 'milestone') {
                return (
                  <PathMilestone
                    key={`m${i}`}
                    stop={stop}
                    onClick={() => handleStop(stop)}
                  />
                )
              }
              // Step nodes stay mounted; their scale/opacity follows the
              // gate's spring so they elastically pop in / snap shut.
              return (
                <PathNode
                  key={`n${i}`}
                  stop={stop}
                  opn={opennessByGate[stop.gate - 1] ?? 0}
                  onClick={() => handleStop(stop)}
                />
              )
            })}

          </div>
        </div>
      </div>

      {/* ── Demoted secondary doors — quiet text-link strip at the
              bottom of the page. Phase 2b: one CTA per screen, the
              rest are reachable but not competing. ───────────────── */}
      <div style={{
        marginTop: 24, paddingTop: 16,
        borderTop: `1px dashed ${INK}33`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 10,
          color: '#9C958A', letterSpacing: '.08em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>Or do something different</div>
        {projectContext ? (
          <SecondaryLink onClick={goProjectFit}
            label="Back to my project shortlist" />
        ) : (
          <SecondaryLink onClick={goWelcome}
            label="✨ Analyse a new project" />
        )}
        <SecondaryLink onClick={goDashboard}
          label="See my capability map" />
        <SecondaryLink onClick={goFacilitator}
          label="Run a live workshop" />
      </div>

      <style>{`
        @keyframes bob-cta {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}

// ── Secondary link — quiet, low-emphasis nav under the path ────
function SecondaryLink({ onClick, label }) {
  return (
    <button onClick={onClick}
      style={{
        textAlign: 'left', padding: '8px 0',
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 13,
        color: INK, letterSpacing: '.04em',
        textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      <span style={{ color: TEAL }}>›</span>
      {label}
    </button>
  )
}
