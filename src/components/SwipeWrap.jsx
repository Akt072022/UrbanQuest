// Swipe-gesture wrapper for cards. Wraps any child element; fires
// onSwipe(value) when the user drags past the appropriate threshold
// and releases.
//
// Two modes:
//   1. Binary (default): drag right past SWIPE_THRESH → onSwipe('right'),
//      drag left past SWIPE_THRESH → onSwipe('left').
//   2. Multi-zone right: pass a `rightZones` array of
//      [{ threshold, label, color, value }, …] sorted by threshold
//      ascending. The zone whose threshold the user has most-recently
//      crossed lights up; releasing in that band fires onSwipe(zone.value).
//
// We intentionally use native touch events (passive:false touchmove)
// for mobile and native mouse events for desktop — *not* Pointer
// Events. The unified Pointer Events API is theoretically nicer but
// iOS Safari has long-standing bugs around setPointerCapture, hit-
// testing through 3D-transformed children, and pointercancel firing
// spuriously near the screen edges. The split implementation is
// 30 lines longer but actually works on phones.
import { useRef, useState, useEffect } from 'react'

const SWIPE_THRESH = 90
const LOCK_PX      = 6
const Y_CLAMP      = 18

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
  leftZone = null,
  onZoneChange = null,
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  // Synchronously-tracked drag mirror. setState is async so end()
  // reading from React state can race against the last move (release
  // ~immediately after the final move). The ref always holds the
  // most-recent position, so the threshold check at release time is
  // correct.
  const dragRef      = useRef({ x: 0, y: 0 })
  const startRef     = useRef(null)
  const modeRef      = useRef(null)   // 'pending' | 'swipe'
  const exitTimerRef = useRef(null)
  const mountedRef   = useRef(true)
  // Active touch identifier — multi-touch sometimes happens on
  // mobile (palm rest, second finger), and we want to track only
  // the original finger. null when no gesture is in flight.
  const activeTouchRef = useRef(null)
  const wrapRef        = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    }
  }, [])

  // ── Gesture core ──────────────────────────────────────────────
  const begin = (cx, cy) => {
    if (!enabled) return
    startRef.current = { x: cx, y: cy }
    modeRef.current  = 'pending'
    dragRef.current  = { x: 0, y: 0 }
    setDrag({ x: 0, y: 0, exiting: false })
  }

  const move = (cx, cy) => {
    if (!startRef.current) return
    const dx = cx - startRef.current.x
    const dy = cy - startRef.current.y
    if (modeRef.current === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return
      modeRef.current = 'swipe'
    }
    dragRef.current = { x: dx, y: dy }
    setDrag({ x: dx, y: dy, exiting: false })
  }

  const end = () => {
    if (!startRef.current) {
      modeRef.current = null
      activeTouchRef.current = null
      return
    }
    const x = dragRef.current.x, y = dragRef.current.y
    let value = null
    let off   = { x: 0, y: 0 }

    if (Math.abs(x) > Math.abs(y)) {
      if (x > 0) {
        if (rightZones && rightZones.length > 0) {
          const z = activeRightZone(rightZones, x)
          if (z) { value = z.value; off = { x: 700, y } }
        } else if (x > SWIPE_THRESH) {
          value = 'right'; off = { x: 700, y }
        }
      } else if (x < 0) {
        if (leftZone && -x >= leftZone.threshold) {
          value = leftZone.value; off = { x: -700, y }
        } else if (!leftZone && x < -SWIPE_THRESH) {
          value = 'left'; off = { x: -700, y }
        }
      }
    }

    startRef.current      = null
    modeRef.current       = null
    activeTouchRef.current = null

    if (value) {
      dragRef.current = { x: off.x, y: off.y }
      setDrag({ x: off.x, y: off.y, exiting: true })
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null
        onSwipe?.(value)
        if (mountedRef.current) {
          dragRef.current = { x: 0, y: 0 }
          setDrag({ x: 0, y: 0, exiting: false })
        }
      }, 220)
    } else {
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      dragRef.current = { x: 0, y: 0 }
      setDrag({ x: 0, y: 0, exiting: false })
    }
  }

  // ── Touch path (mobile) ───────────────────────────────────────
  // Attached natively so we can preventDefault non-passively. With
  // touch-action:none alone, iOS sometimes still tries to do its
  // own thing (rubber-band, edge-swipe-back) and we want to win.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const onTouchStart = (e) => {
      if (!enabled) return
      const t = e.changedTouches[0]
      if (!t) return
      // Defensive reset: if a previous gesture was orphaned (touchend
      // missed because of a fast unmount, OS interruption, or any
      // other glitch), the activeTouchRef sentinel could be stuck on
      // a stale identifier. That would silently swallow this new
      // touch without ever calling begin(). Force-claim the new
      // finger instead — the worst case is we ignore a still-down
      // previous touch, which the user couldn't see anyway.
      activeTouchRef.current = t.identifier
      begin(t.clientX, t.clientY)
    }

    const onTouchMove = (e) => {
      const id = activeTouchRef.current
      if (id === null) return
      // Find our finger among the changed touches.
      let t = null
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === id) { t = e.changedTouches[i]; break }
      }
      if (!t) return
      move(t.clientX, t.clientY)
      // Once we've committed to a swipe, stop the page from doing
      // anything else with the gesture (rubber-band, back-swipe,
      // pinch-zoom). preventDefault during 'pending' would break
      // taps on inner elements (the accordion text), so we gate it.
      if (modeRef.current === 'swipe') {
        e.preventDefault()
      }
    }

    const onTouchEnd = (e) => {
      const id = activeTouchRef.current
      if (id === null) return
      // Only end if our finger is in changedTouches (it should be).
      let found = false
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === id) { found = true; break }
      }
      if (!found) return
      end()
    }

    const onTouchCancel = () => { end() }

    // touchstart can be passive — we don't preventDefault on it.
    el.addEventListener('touchstart',  onTouchStart,  { passive: true })
    // touchmove must NOT be passive: we sometimes preventDefault.
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })

    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [enabled])

  // ── Mouse path (desktop) ──────────────────────────────────────
  // mousemove / mouseup attached at the window level so the user
  // can release the click outside the card and still finalise the
  // gesture. Otherwise off-card releases left the card stranded
  // mid-drag in earlier versions.
  const onMouseDown = (e) => {
    if (!enabled) return
    if (e.button !== 0) return
    // Tracked via activeTouchRef = 'mouse' so the mouse path doesn't
    // fight the touch path (e.g. some hybrid devices fire both on a
    // tap; whichever started first wins until it ends).
    if (activeTouchRef.current !== null) return
    activeTouchRef.current = 'mouse'
    begin(e.clientX, e.clientY)
  }

  // Window listeners for mouse drag — attached for the lifetime
  // of the component but no-op when no gesture is in flight (the
  // first thing they check is the active-touch sentinel). Window
  // level so the user can release the mouse off-card and still
  // finalise the gesture; in-element listeners would strand the
  // card mid-drag if the cursor exited.
  useEffect(() => {
    const onMouseMove = (e) => {
      if (activeTouchRef.current !== 'mouse') return
      move(e.clientX, e.clientY)
    }
    const onMouseUp = () => {
      if (activeTouchRef.current !== 'mouse') return
      end()
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [])

  // ── Render ────────────────────────────────────────────────────
  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))
  const yOff = Math.max(-Y_CLAMP, Math.min(Y_CLAMP, drag.y))
  const dragging = startRef.current !== null
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
  const lastZoneRef = useRef(null)
  useEffect(() => {
    if (lastZoneRef.current !== liveValue) {
      lastZoneRef.current = liveValue
      onZoneChange?.(liveValue)
    }
  })
  const showLegacyRight = !rightZones && drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  const showLeft        = !leftZone  && drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

  return (
    <div
      ref={wrapRef}
      onMouseDown={onMouseDown}
      style={{
        position: 'relative',
        transform: `translate(${drag.x}px, ${yOff}px) rotate(${rot}deg)`,
        transition: dragging ? 'none' : 'transform .22s ease-out',
        cursor: enabled ? 'grab' : 'default',
        // touchAction:none claims every touch so the browser doesn't
        // try to scroll / zoom mid-gesture. Pair this with the
        // non-passive touchmove above for full coverage.
        touchAction: 'none',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
      }}>
      {children}

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
