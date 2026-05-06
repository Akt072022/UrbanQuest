// Spontaneous badge celebration. Sits at the top of the viewport on
// every screen and pops a tile when the store's pendingBadgeToasts
// queue becomes non-empty — so a user mid-swipe gets a "✦ NEW BADGE"
// flash the moment a tier unlocks, instead of having to wait for
// the dim-complete screen.
//
//   • Reads the head of the queue, displays one badge at a time.
//   • Auto-dismisses after 3.4 s (long enough to read, short enough
//     not to compete with the next swipe), or on tap.
//   • Dismissing calls dequeueBadgeToast() which marks the badge as
//     seen — so subsequent celebration surfaces (DimComplete /
//     GateComplete) won't double-celebrate something already toasted.
//
// Rendered via a portal so the fixed-position container isn't
// relative to a parent with `transform` (the swipe deck uses 3D
// transforms, which would otherwise clip the toast).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { BADGES } from '../data/badges'

const INK = '#1C2530'
const BADGE_BY_ID = Object.fromEntries(BADGES.map(b => [b.id, b]))

const SHOW_MS = 3400
const SLIDE_MS = 260

export function BadgeToaster() {
  const { pending, dequeue } = useStore(useShallow(s => ({
    pending: s.pendingBadgeToasts || [],
    dequeue: s.dequeueBadgeToast,
  })))

  // Local "currently displayed" id, decoupled from the queue so the
  // exit animation can play out before we pop the next one. null
  // means nothing is on screen.
  const [active, setActive] = useState(null)
  // 'enter' | 'leave' — drives the slide direction.
  const [phase, setPhase] = useState('enter')

  // When the queue head changes (and nothing is animating), pick it
  // up. The dequeue happens at the end of the leave animation, so the
  // queue head only changes when we explicitly dequeue ourselves.
  useEffect(() => {
    if (active) return
    if (!pending.length) return
    const id = pending[0]
    if (!BADGE_BY_ID[id]) {
      // Unknown id — drop it silently so we don't get stuck.
      dequeue()
      return
    }
    setActive(id)
    setPhase('enter')
  }, [pending, active, dequeue])

  // Auto-hide after SHOW_MS once an active badge is showing.
  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => setPhase('leave'), SHOW_MS)
    return () => clearTimeout(t)
  }, [active])

  // After the leave animation, drop it from the queue + clear local
  // active state so the next item can flow in.
  useEffect(() => {
    if (phase !== 'leave') return
    const t = setTimeout(() => {
      dequeue()
      setActive(null)
      setPhase('enter')
    }, SLIDE_MS)
    return () => clearTimeout(t)
  }, [phase, dequeue])

  if (!active) return null
  const b = BADGE_BY_ID[active]
  if (!b) return null

  const dismiss = () => setPhase('leave')

  return createPortal((
    <div style={{
      position: 'fixed',
      top: 'max(env(safe-area-inset-top, 0px), 12px)',
      left: 0, right: 0,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 9997,
      padding: '0 14px',
    }}>
      <button onClick={dismiss}
        type="button"
        aria-label={`New badge: ${b.name}`}
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 420, width: '100%',
          padding: '10px 12px',
          background: '#FFFDF8',
          border: `2.5px solid ${INK}`,
          borderRadius: 14,
          boxShadow: '3px 3px 0 ' + INK,
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit', color: 'inherit',
          transform: phase === 'leave'
            ? 'translateY(-140%)'
            : 'translateY(0)',
          opacity: phase === 'leave' ? 0 : 1,
          transition: `transform ${SLIDE_MS}ms cubic-bezier(.4,1.4,.5,1), ` +
            `opacity ${SLIDE_MS}ms ease`,
        }}>
        {/* Icon disc */}
        <div style={{
          flexShrink: 0,
          width: 44, height: 44, borderRadius: '50%',
          background: '#FFFFFF',
          border: `2.5px solid ${b.col}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
          overflow: 'hidden',
        }}>
          {b.iconSrc ? (
            <img src={b.iconSrc} alt=""
              draggable={false}
              style={{
                width: '88%', height: '88%', objectFit: 'contain',
                clipPath: 'circle(50%)',
                mixBlendMode: 'multiply',
              }} />
          ) : b.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 10,
            color: b.col, letterSpacing: '.1em',
            textTransform: 'uppercase',
            lineHeight: 1, marginBottom: 3,
          }}>
            ✦ New badge
          </div>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 16,
            color: INK, letterSpacing: '.02em',
            lineHeight: 1.05,
            whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{b.name}</div>
          <div style={{
            fontSize: 11, color: '#5A5550',
            lineHeight: 1.3, marginTop: 2,
            whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{b.desc}</div>
        </div>
      </button>
    </div>
  ), document.body)
}
