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
  // Single drop-target for left swipes — mirror of one rightZones
  // entry but on the negative axis. Shape: { threshold, value }.
  // When set, |drag.x| past `threshold` lights up the matching
  // value through onZoneChange (so a parent RatingRow can highlight
  // the "new to me" button instead of showing a SwipeTag overlay).
  leftZone = null,
  // Fires whenever the live drop-target changes during a drag (or
  // returns null when no zone is active / the gesture ends).
  // Consumers use it to drive an external preview UI — typically
  // the RatingRow above the card, which highlights the matching
  // button instead of relying on a separate drop-target strip.
  onZoneChange = null,
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  const startRef     = useRef(null)
  const modeRef      = useRef(null)   // 'pending' | 'swipe' | 'scroll'
  const exitTimerRef = useRef(null)
  const mountedRef   = useRef(true)
  // Pointer-capture is deferred until we know the gesture is a
  // horizontal swipe — capturing on pointerdown would steal the
  // vertical-scroll events that the card's inner scrollable
  // content needs. Stash the live pointer info so move() can
  // capture once direction-lock fires.
  const pointerRef   = useRef(null)   // { id, target } | null

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
        // Vertical drag → drop the gesture entirely so native
        // scroll inside the card can take over. We never captured
        // the pointer, so nothing to release.
        modeRef.current  = 'scroll'
        startRef.current = null
        pointerRef.current = null
        return
      }
      modeRef.current = 'swipe'
      // Now that we own the gesture, capture so up / cancel still
      // reach us if the cursor leaves the wrapper bounds.
      const p = pointerRef.current
      if (p && p.target) {
        try { p.target.setPointerCapture(p.id) } catch { /* noop */ }
      }
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
      } else if (x < 0) {
        // Left swipe — single drop-target if leftZone configured
        // (parents use it to highlight a "new to me"-style button),
        // otherwise the legacy binary 'left' commit.
        if (leftZone && -x >= leftZone.threshold) {
          value = leftZone.value; off = { x: -700, y }
        } else if (!leftZone && x < -SWIPE_THRESH) {
          value = 'left'; off = { x: -700, y }
        }
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
    // DON'T capture here — pre-capture would steal vertical-scroll
    // events. We capture later, inside move(), only once the
    // direction-lock confirms a horizontal swipe.
    pointerRef.current = { id: e.pointerId, target: e.currentTarget }
    begin(e.clientX, e.clientY)
  }
  const onPointerMove   = (e) => { if (startRef.current) move(e.clientX, e.clientY) }
  const onPointerUp     = (e) => {
    const p = pointerRef.current
    if (p && p.target) {
      try { p.target.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
    pointerRef.current = null
    end()
  }
  const onPointerCancel       = () => { pointerRef.current = null; end() }
  const onLostPointerCapture  = () => { pointerRef.current = null; end() }

  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))
  const dragging = startRef.current !== null
  // Live drop-target during a horizontal drag. Right side picks from
  // rightZones; left side activates leftZone if configured. Drives
  // onZoneChange so the parent's RatingRow can highlight the
  // matching button mid-gesture.
  const horizontalDrag = Math.abs(drag.x) > Math.abs(drag.y)
  const liveValue = (() => {
    if (!horizontalDrag) return null
    if (drag.x > 20 && rightZones) {
      const z = activeRightZone(rightZones, drag.x)
      return z ? z.value : null
    }
    if (drag.x < 0 && leftZone && -drag.x >= leftZone.threshold) {
      return leftZone.value
    }
    return null
  })()
  // Notify parent on every change. Stored in a ref so we don't fire
  // for the same value across consecutive renders.
  const lastZoneRef = useRef(null)
  useEffect(() => {
    if (lastZoneRef.current !== liveValue) {
      lastZoneRef.current = liveValue
      onZoneChange?.(liveValue)
    }
  })
  const showLegacyRight = !rightZones && drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  // Hide the left SwipeTag overlay when leftZone is configured —
  // the parent renders the preview as a highlighted button instead.
  const showLeft        = !leftZone && drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

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
        // touch-action: none — own every gesture on the card. The
        // previous "pan-y" let mobile browsers claim near-vertical
        // swipes before our pointer events could fire, leaving the
        // user wondering why their angled swipe did nothing. With the
        // tap-to-expand body the card has no native scroll anyway,
        // so handing all gestures to SwipeWrap is the right default.
        touchAction: 'none',
        userSelect: 'none',
      }}>
      {children}

      {/* Right-zone preview is now rendered EXTERNALLY by the parent
          (typically RatingRow above the card highlighting the matching
          button) via the onZoneChange callback. SwipeWrap itself only
          paints a left-side "skip" tag; right-side feedback flows up. */}
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
