// Generic swipe-gesture wrapper for cards. Wraps any child element;
// fires onSwipe('left') or onSwipe('right') when the user drags past
// SWIPE_THRESH px and releases. Touch + mouse, with a vertical-lock
// fallback so down-drag scrolls the inner card natively.
//
// Why this exists: Phase 2a removed the old swipe gesture in favour
// of single-tap rating buttons, but real users keep trying to swipe
// (Tinder muscle memory). We bring the gesture back as a *shortcut*
// for the two extreme actions while leaving the buttons as the
// precision affordance for the middle options.
import { useRef, useState } from 'react'

const SWIPE_THRESH = 90
const LOCK_PX      = 10

export function SwipeWrap({
  children, onSwipe, enabled = true,
  leftHint  = null, leftColor  = '#9C958A',
  rightHint = null, rightColor = '#10B981',
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  const startRef = useRef(null)
  // 'pending' before first move > LOCK_PX, then either 'swipe' (we
  // own the gesture) or 'scroll' (let inner card scroll natively).
  const modeRef  = useRef(null)

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
    const { x, y } = drag
    let dir = null
    let off = { x: 0, y: 0 }
    if (x > SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      dir = 'right'; off = { x: 700, y }
    } else if (x < -SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      dir = 'left'; off = { x: -700, y }
    }
    if (dir) {
      setDrag({ x: off.x, y: off.y, exiting: true })
      setTimeout(() => {
        onSwipe?.(dir)
        // Reset so the next card renders centred. Without this the
        // wrapper stays translated off-screen.
        setDrag({ x: 0, y: 0, exiting: false })
      }, 220)
    } else {
      setDrag({ x: 0, y: 0, exiting: false })
    }
    startRef.current = null
    modeRef.current  = null
  }

  const onTouchStart = (e) => begin(e.touches[0].clientX, e.touches[0].clientY)
  const onTouchMove  = (e) => move(e.touches[0].clientX, e.touches[0].clientY)
  const onTouchEnd   = () => end()
  const onMouseDown  = (e) => begin(e.clientX, e.clientY)
  const onMouseMove  = (e) => { if (startRef.current) move(e.clientX, e.clientY) }
  const onMouseUp    = () => end()
  const onMouseLeave = () => { if (startRef.current) end() }

  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))
  const showRight = drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  const showLeft  = drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
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
