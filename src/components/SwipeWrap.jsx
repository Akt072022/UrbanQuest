// Generic swipe-gesture wrapper for cards. Wraps any child element;
// fires onSwipe(value) when the user drags past the appropriate
// threshold and releases.
//
// Two modes:
//   1. Binary (default): drag right past SWIPE_THRESH → onSwipe('right'),
//      drag left past SWIPE_THRESH → onSwipe('left').
//   2. Multi-zone right: pass a `rightZones` array of
//      [{ threshold, label, color, value }, …] sorted by threshold
//      ascending. As the user drags right, the zone whose threshold
//      they have most-recently crossed lights up; releasing in that
//      band fires onSwipe(zone.value). Lets the user pick a level of
//      commitment in a single gesture (Phase: addresses the "buttons
//      below the card are hidden on mobile and we swipe by reflex"
//      problem — the swipe itself now carries the nuance).
//
// Implementation notes
//
//   • Pointer Events with setPointerCapture so the browser keeps
//     delivering pointermove / pointerup / pointercancel to this
//     element even when the cursor leaves its bounds. Earlier
//     mouse-event handlers got stuck on desktop releases off-card.
//   • Direction-locked: vertical drag falls through to native scroll.
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

const SWIPE_THRESH = 90
const LOCK_PX      = 10

// Pick the right-zone whose threshold the user has crossed.
function activeRightZone(zones, x) {
  if (!zones || zones.length === 0) return null
  let active = null
  for (const z of zones) {
    if (x >= z.threshold) active = z
  }
  return active
}

export function SwipeWrap({
  children, onSwipe, enabled = true,
  leftHint  = null, leftColor  = '#9C958A',
  rightHint = null, rightColor = '#10B981',
  rightZones = null,
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  const startRef     = useRef(null)
  const modeRef      = useRef(null)   // 'pending' | 'swipe' | 'scroll'
  const exitTimerRef = useRef(null)
  const mountedRef   = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  const begin = (cx, cy) => {
    if (!enabled) return
    startRef.current = { x: cx, y: cy }
    modeRef.current  = 'pending'
    setDrag({ x: 0, y: 0, exiting: false })
  }
  const move = (cx, cy) => {
    if (!startRef.current) return
    const dx = cx - startRef.current.x
    const dy = cy - startRef.current.y
    if (modeRef.current === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return
      if (Math.abs(dy) > Math.abs(dx)) {
        modeRef.current  = 'scroll'
        startRef.current = null
        return
      }
      modeRef.current = 'swipe'
    }
    if (modeRef.current !== 'swipe') return
    setDrag({ x: dx, y: dy, exiting: false })
  }
  const end = () => {
    if (!startRef.current) { modeRef.current = null; return }
    const x = drag.x, y = drag.y
    let value = null
    let off   = { x: 0, y: 0 }

    if (Math.abs(x) > Math.abs(y)) {
      if (x > 0) {
        // Right swipe
        if (rightZones && rightZones.length > 0) {
          const z = activeRightZone(rightZones, x)
          if (z) { value = z.value; off = { x: 700, y } }
        } else if (x > SWIPE_THRESH) {
          value = 'right'; off = { x: 700, y }
        }
      } else if (x < -SWIPE_THRESH) {
        // Left swipe — always binary
        value = 'left'; off = { x: -700, y }
      }
    }

    startRef.current = null
    modeRef.current  = null
    if (value) {
      setDrag({ x: off.x, y: off.y, exiting: true })
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null
        onSwipe?.(value)
        if (mountedRef.current) setDrag({ x: 0, y: 0, exiting: false })
      }, 220)
    } else {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      setDrag({ x: 0, y: 0, exiting: false })
    }
  }

  const onPointerDown = (e) => {
    if (!enabled) return
    if (e.button !== undefined && e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
    begin(e.clientX, e.clientY)
  }
  const onPointerMove   = (e) => { if (startRef.current) move(e.clientX, e.clientY) }
  const onPointerUp     = (e) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    end()
  }
  const onPointerCancel       = () => end()
  const onLostPointerCapture  = () => end()

  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))
  const dragging = startRef.current !== null
  // Live-zone preview during right drag — this drives the floating
  // "ghost zones" stack on the right side and the active SwipeTag.
  const liveZone = rightZones && drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
    ? activeRightZone(rightZones, drag.x)
    : null
  const showLegacyRight = !rightZones && drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  const showLeft        = drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      style={{
        position: 'relative',
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`,
        transition: dragging ? 'none' : 'transform .22s ease-out',
        cursor: enabled ? 'grab' : 'default',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}>
      {children}

      {/* Multi-zone preview — render the whole stack of right zones as
          a HORIZONTAL row of drop-target pills, fixed to the bottom
          of the viewport so they're out of the way of the card and
          its surrounding UI. Horizontal layout reinforces that
          horizontal drag distance is what switches zones; generous
          gap between pills makes each band visually distinct. ── */}
      {rightZones && drag.x > 20 && Math.abs(drag.x) > Math.abs(drag.y) && (
        createPortal(
          <div style={{
            position: 'fixed',
            left: 16, right: 16,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            display: 'flex', flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'stretch',
            gap: 16,
            pointerEvents: 'none',
            zIndex: 9999,
          }}>
            {rightZones.map((z) => {
              const active = liveZone && liveZone.value === z.value
              return (
                <div key={z.value} style={{
                  flex: 1,
                  padding: active ? '12px 14px' : '9px 12px',
                  borderRadius: 14,
                  border: `${active ? 3 : 2.5}px solid ${z.color}`,
                  background: active ? z.color : 'rgba(255,255,255,.97)',
                  color: active ? '#FFFFFF' : z.color,
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  boxShadow: active
                    ? '3px 3px 0 #1C2530'
                    : '2px 2px 0 rgba(28,37,48,0.18)',
                  transform: active ? 'translate(-1px, -1px) scale(1.04)' : 'none',
                  transition: 'all .1s',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontWeight: 900,
                    fontSize: active ? 15 : 13,
                    lineHeight: 1.05,
                  }}>{z.label}</div>
                  {z.hint && (
                    <div style={{
                      fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                      fontWeight: 600,
                      fontSize: 11,
                      marginTop: 4,
                      letterSpacing: 0,
                      textTransform: 'none',
                      opacity: active ? 0.95 : 0.78,
                      color: active ? '#FFFFFF' : '#5A5550',
                      lineHeight: 1.2,
                    }}>{z.hint}</div>
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )
      )}

      {/* Legacy single-zone right tag (only when rightZones not set). */}
      {showLegacyRight && rightHint && (
        <SwipeTag color={rightColor} pos="left">{rightHint}</SwipeTag>
      )}
      {showLeft && leftHint && (
        <SwipeTag color={leftColor} pos="right">{leftHint}</SwipeTag>
      )}
    </div>
  )
}

function SwipeTag({ children, color, pos }) {
  const base = {
    position: 'absolute',
    padding: '8px 14px',
    borderRadius: 10,
    border: `3px solid ${color}`,
    color, background: 'rgba(255,255,255,.92)',
    fontFamily: 'Barlow Condensed, Impact, sans-serif',
    fontWeight: 900, fontSize: 18, letterSpacing: '.06em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transform: pos === 'left' ? 'rotate(-12deg)' : 'rotate(12deg)',
  }
  const place = pos === 'left'
    ? { top: 24, left: 18 }
    : { top: 24, right: 18 }
  return <div style={{ ...base, ...place }}>{children}</div>
}
