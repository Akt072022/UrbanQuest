import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'

// Animated XP floater
export function XPFloat({ onDone }) {
  return (
    <div
      className="anim-xpup absolute pointer-events-none font-black z-50"
      style={{
        top: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '18px',
        color: '#E8941A',
      }}
      onAnimationEnd={onDone}
    >
      +10 XP
    </div>
  )
}

// Toast notification
export function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div
      className="anim-toastin absolute z-50 whitespace-nowrap font-bold text-sm"
      style={{
        top: '58px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#07111E',
        border: '1.5px solid #E8941A',
        borderRadius: '16px',
        padding: '10px 20px',
        color: '#E8941A',
      }}
    >
      {message}
    </div>
  )
}
