// Generic swipe-gesture wrapper for cards. Wraps any child element;
// fires onSwipe('left') or onSwipe('right') when the user drags past
// SWIPE_THRESH px and releases.
//
// Implementation note — uses Pointer Events with setPointerCapture so
// the browser keeps delivering pointermove / pointerup / pointercancel
// to this element even when the cursor leaves its bounds. The earlier
// mouse-event version got stuck on desktop when users released the
// button off-screen: neither mouseup nor mouseleave fired after the
// release point, so end() never ran and the card stayed translated.
//
// Vertical-lock fallback so down-drag scrolls the inner card natively.
import { useRef, useState, useEffect } from 'react'

const SWIPE_THRESH = 90
const LOCK_PX      = 10

export function SwipeWrap({
  children, onSwipe, enabled = true,
  leftHint  = null, leftColor  = '#9C958A',
  rightHint = null, rightColor = '#10B981',
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  const startRef    = useRef(null)
  // 'pending' before first move > LOCK_PX, then either 'swipe' (we
  // own the gesture) or 'scroll' (let inner card scroll natively).
  const modeRef     = useRef(null)
  const exitTimerRef = useRef(null)
  const mountedRef   = useRef(true)

  // Cancel any in-flight exit timer if the component unmounts mid
  // animation, otherwise the timeout would call setDrag on an
  // already-gone component and React warns.
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
  const end = (committedDrag) => {
    if (!startRef.current) { modeRef.current = null; return }
    // Take drag from the latest committed value when caller passes it
    // (avoids stale-closure reads when end runs from a captured event
    // handler that fires several ticks after the last move).
    const cur = committedDrag || drag
    const x = cur.x, y = cur.y
    let dir = null
    let off = { x: 0, y: 0 }
    if (x > SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      dir = 'right'; off = { x: 700, y }
    } else if (x < -SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      dir = 'left'; off = { x: -700, y }
    }
    startRef.current = null
    modeRef.current  = null
    if (dir) {
      setDrag({ x: off.x, y: off.y, exiting: true })
      exitTimerRef.current = setTimeout(() => {
        exitTimerRef.current = null
        onSwipe?.(dir)
        if (mountedRef.current) setDrag({ x: 0, y: 0, exiting: false })
      }, 220)
    } else {
      // Snap back. Clear any prior exit timer in case a previous
      // gesture left one pending and the user grabbed the card again.
      if (exitTimerRef.current) {
        clearTimeout(exitTimerRef.current)
        exitTimerRef.current = null
      }
      setDrag({ x: 0, y: 0, exiting: false })
    }
  }

  // Pointer event handlers — capture the pointer so up/cancel reach
  // us even when the cursor leaves the element's bounds.
  const onPointerDown = (e) => {
    if (!enabled) return
    if (e.button !== undefined && e.button !== 0) return  // primary button only
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* noop */ }
    begin(e.clientX, e.clientY)
  }
  const onPointerMove = (e) => {
    if (!startRef.current) return
    move(e.clientX, e.clientY)
  }
  const onPointerUp = (e) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    end()
  }
  const onPointerCancel = () => {
    end()
  }
  // Lost capture — e.g. the user agent stole the pointer. Treat it as
  // a release so we never get stuck mid-gesture.
  const onLostPointerCapture = () => {
    end()
  }

  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))
  const showRight = drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  const showLeft  = drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

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
        transition: startRef.current ? 'none' : 'transform .22s ease-out',
        cursor: enabled ? 'grab' : 'default',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}>
      {children}
      {showRight && rightHint && <SwipeTag color={rightColor} pos="left">{rightHint}</SwipeTag>}
      {showLeft  && leftHint  && <SwipeTag color={leftColor}  pos="right">{leftHint}</SwipeTag>}
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
