import { useState } from 'react'

// ──────────────────────────────────────────────────────────────
// Per-gate progression symbol — 6 stages (0..5)
//   G1 Impact         → Hand (closed fist → 5 fingers spread)
//   G2 Fit            → Construction (foundation → finished building)
//   G3 Anchoring      → Tree (seed → mature canopy)
//   G4 Sustainability → Sun (dim → full radiant sun)
//
// PRIMARY: PNG illustrations from /illustrations/g{N}/stage-{N}.png
// FALLBACK: hand-drawn SVG (if image missing)
// ──────────────────────────────────────────────────────────────

export function stageFromRatio(practiced, total) {
  if (!total) return 0
  if (practiced >= total) return 5
  if (practiced === 0) return 0
  return Math.max(1, Math.min(5, Math.ceil((practiced / total) * 5)))
}

export const GATE_SYMBOL_LABEL = {
  1: 'Hand',
  2: 'Build',
  3: 'Tree',
  4: 'Sun',
}

// Try to load a PNG illustration first; if it 404s, fall back to SVG.
function imageSrc(gate, stage) {
  return `${import.meta.env.BASE_URL}illustrations/g${gate}/stage-${stage}.png`
}

export function GateSymbol({ gate, stage, color = '#1B3D6F', locked = false }) {
  const [hasImage, setHasImage] = useState(true)

  if (hasImage) {
    return (
      <img
        src={imageSrc(gate, stage)}
        alt=""
        onError={() => setHasImage(false)}
        style={{
          width: '100%', height: '100%',
          objectFit: 'contain',
          filter: locked ? 'grayscale(1) opacity(.5)' : 'none',
          display: 'block',
        }}
        draggable={false}
      />
    )
  }

  // Fallback to SVG
  const Sym = SYMBOLS[gate]
  if (!Sym) return null
  return <Sym stage={stage} color={color} locked={locked} />
}

// ──────────────────────────────────────────────────────────────
// SVG fallbacks (used when illustration PNG isn't yet provided)
// ──────────────────────────────────────────────────────────────

// Hand fallback — organic palm + tubular fingers with rounded tips.
// Each finger is its own SVG shape so it can grow/extend with stage.
//
// Stage progression:
//   0  closed fist  — palm + small bumps (knuckles)
//   1  thumb out    — thumb extends sideways
//   2  +pinky       — pinky pops up
//   3  +ring        — ring finger up
//   4  +index       — index up
//   5  open hand    — middle finger up (full open palm)
function HandSymbol({ stage, color, locked }) {
  const stroke = locked ? '#B5AEA3' : '#1C2530'
  const fill   = locked ? '#E5DFD3' : color
  const sw     = 2.4
  const f = stage

  // Helper: tubular finger path (rounded both ends).
  // (x,y) = bottom-center anchor, w = width, h = current length.
  const Finger = ({ x, y, w, h, key }) => {
    const r = w / 2
    if (h <= 0) return null
    return (
      <path
        key={key}
        d={`
          M ${x - r} ${y}
          L ${x - r} ${y - h + r}
          A ${r} ${r} 0 0 1 ${x + r} ${y - h + r}
          L ${x + r} ${y}
          Z
        `}
        fill={fill} stroke={stroke}
        strokeWidth={sw} strokeLinejoin="round"
        style={{ transition: 'all .35s' }}
      />
    )
  }

  // Thumb is angled (extends sideways from the side of the palm).
  // We rotate it from base point.
  const ThumbPath = ({ extended }) => {
    if (!extended) {
      // Tucked thumb knuckle bump
      return (
        <circle cx="14" cy="34" r="3.5"
          fill={fill} stroke={stroke} strokeWidth={sw}
          style={{ transition: 'all .35s' }} />
      )
    }
    return (
      <path
        d={`M 14 36
            C 8 36, 6 30, 7 24
            C 8 19, 14 18, 16 22
            L 16 32
            C 16 35, 16 36, 14 36 Z`}
        fill={fill} stroke={stroke}
        strokeWidth={sw} strokeLinejoin="round"
        style={{ transition: 'all .35s' }}
      />
    )
  }

  // Finger lengths grow with stage
  const lenPinky  = f >= 2 ? 16 : 0
  const lenRing   = f >= 3 ? 22 : 0
  const lenIndex  = f >= 4 ? 24 : 0
  const lenMiddle = f >= 5 ? 28 : 0

  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" style={{ display: 'block' }}>
      {/* Palm — rounded organic shape */}
      <path
        d={`M 16 36
            C 14 50, 22 54, 30 54
            C 38 54, 46 50, 44 36
            L 44 30
            C 44 26, 38 24, 30 24
            C 22 24, 16 26, 16 30 Z`}
        fill={fill} stroke={stroke}
        strokeWidth={sw} strokeLinejoin="round"
      />

      {/* Wrist cuff (small detail at bottom of palm) */}
      <path
        d="M 22 52 Q 30 56 38 52"
        fill="none" stroke={stroke} strokeWidth={sw - 0.4}
        strokeLinecap="round"
      />

      {/* Thumb */}
      <ThumbPath extended={f >= 1} />

      {/* Pinky (right side, slightly slanted out) */}
      <Finger x={43} y={28} w={6} h={lenPinky} />

      {/* Ring */}
      <Finger x={36} y={26} w={6.4} h={lenRing} />

      {/* Index */}
      <Finger x={24} y={26} w={6.4} h={lenIndex} />

      {/* Middle */}
      <Finger x={30} y={26} w={6.6} h={lenMiddle} />

      {/* When closed fist (stage 0): show 4 knuckle bumps */}
      {f === 0 && (
        <g style={{ transition: 'all .35s' }}>
          <circle cx="22" cy="28" r="2.4" fill={fill} stroke={stroke} strokeWidth={sw - 0.4} />
          <circle cx="28" cy="27" r="2.4" fill={fill} stroke={stroke} strokeWidth={sw - 0.4} />
          <circle cx="34" cy="27" r="2.4" fill={fill} stroke={stroke} strokeWidth={sw - 0.4} />
          <circle cx="40" cy="28" r="2.4" fill={fill} stroke={stroke} strokeWidth={sw - 0.4} />
        </g>
      )}
    </svg>
  )
}

function BuildingSymbol({ stage, color, locked }) {
  const stroke = locked ? '#B5AEA3' : '#1C2530'
  const fillCol = locked ? '#E5DFD3' : color
  const f = stage
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" style={{ display: 'block' }}>
      <line x1="6" y1="50" x2="54" y2="50" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <rect x="14" y={50 - (f >= 1 ? 6 : 0)} width="32" height={f >= 1 ? 6 : 0}
        fill={f >= 1 ? fillCol : 'transparent'} stroke={f >= 1 ? stroke : 'transparent'} strokeWidth="2.2"
        style={{ transition: 'all .35s' }} />
      <rect x="14" y={f >= 2 ? 30 : 44} width="6" height={f >= 2 ? 14 : 0}
        fill={f >= 2 ? fillCol : 'transparent'} stroke={f >= 2 ? stroke : 'transparent'} strokeWidth="2.2" />
      <rect x="40" y={f >= 3 ? 30 : 44} width="6" height={f >= 3 ? 14 : 0}
        fill={f >= 3 ? fillCol : 'transparent'} stroke={f >= 3 ? stroke : 'transparent'} strokeWidth="2.2" />
      <rect x="22" y={f >= 4 ? 32 : 44} width="16" height={f >= 4 ? 12 : 0}
        fill={f >= 4 ? '#FAF7F0' : 'transparent'} stroke={f >= 4 ? stroke : 'transparent'} strokeWidth="2.2" />
      <path d={f >= 5 ? `M 10 30 L 30 14 L 50 30 Z` : `M 30 30 L 30 30 L 30 30 Z`}
        fill={f >= 5 ? fillCol : 'transparent'} stroke={f >= 5 ? stroke : 'transparent'}
        strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  )
}

function TreeSymbol({ stage, color, locked }) {
  const stroke = locked ? '#B5AEA3' : '#1C2530'
  const fillCol = locked ? '#E5DFD3' : color
  const f = stage
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" style={{ display: 'block' }}>
      <line x1="8" y1="52" x2="52" y2="52" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="30" cy={f >= 1 ? 50 : 52} r={f >= 1 ? 3 : 0}
        fill={f >= 1 ? fillCol : 'transparent'} stroke={f >= 1 ? stroke : 'transparent'} strokeWidth="2" />
      <rect x="27" y={f >= 2 ? 40 : 50} width="6" height={f >= 2 ? 12 : 0}
        fill={f >= 2 ? fillCol : 'transparent'} stroke={f >= 2 ? stroke : 'transparent'} strokeWidth="2" />
      <circle cx="30" cy={f >= 3 ? 32 : 50} r={f >= 3 ? 8 : 0}
        fill={f >= 3 ? fillCol : 'transparent'} stroke={f >= 3 ? stroke : 'transparent'} strokeWidth="2" />
      <circle cx={f >= 4 ? 18 : 30} cy={f >= 4 ? 26 : 50} r={f >= 4 ? 7 : 0}
        fill={f >= 4 ? fillCol : 'transparent'} stroke={f >= 4 ? stroke : 'transparent'} strokeWidth="2" />
      <circle cx={f >= 5 ? 42 : 30} cy={f >= 5 ? 26 : 50} r={f >= 5 ? 7 : 0}
        fill={f >= 5 ? fillCol : 'transparent'} stroke={f >= 5 ? stroke : 'transparent'} strokeWidth="2" />
    </svg>
  )
}

function SunSymbol({ stage, color, locked }) {
  const stroke = locked ? '#B5AEA3' : '#1C2530'
  const fillCol = locked ? '#E5DFD3' : color
  const f = stage
  const cx = 30, cy = 30
  const rayAngles = [0, 45, 90, 135, 180, 225, 270, 315]
  const rayShown = (s) => {
    if (s <= 0) return []
    if (s === 1) return [90, 270]
    if (s === 2) return [0, 90, 180, 270]
    if (s === 3) return [0, 45, 90, 180, 225, 270]
    return rayAngles
  }
  const rays = rayShown(f)
  return (
    <svg viewBox="0 0 60 60" width="100%" height="100%" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={f >= 1 ? 9 : 0}
        fill={f >= 1 ? fillCol : 'transparent'}
        stroke={f >= 1 ? stroke : 'transparent'} strokeWidth="2.2" />
      {rayAngles.map(a => {
        const visible = rays.includes(a)
        const rad = (a * Math.PI) / 180
        const x1 = cx + 13 * Math.cos(rad)
        const y1 = cy + 13 * Math.sin(rad)
        const x2 = cx + 21 * Math.cos(rad)
        const y2 = cy + 21 * Math.sin(rad)
        return (
          <line key={a}
            x1={visible ? x1 : cx} y1={visible ? y1 : cy}
            x2={visible ? x2 : cx} y2={visible ? y2 : cy}
            stroke={visible ? stroke : 'transparent'} strokeWidth="2.5" strokeLinecap="round" />
        )
      })}
      <path d={f >= 5 ? `M 25 30 Q 30 35 35 30` : `M 30 30 L 30 30`}
        fill="none" stroke={f >= 5 ? '#1C2530' : 'transparent'}
        strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const SYMBOLS = { 1: HandSymbol, 2: BuildingSymbol, 3: TreeSymbol, 4: SunSymbol }
