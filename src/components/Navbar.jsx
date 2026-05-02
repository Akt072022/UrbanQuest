import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { getLevel, LEVELS } from '../data/tools'

const INK = '#1C2530'
const YELLOW = '#F5C84A'

// One emoji-style achievement badge per level
const LEVEL_BADGE = {
  Apprentice: { icon: '🌱', col: '#A8D080' },
  Planner:    { icon: '⚒',  col: '#6FCBC9' },
  Architect:  { icon: '🏛',  col: '#F5C84A' },
  Mayor:      { icon: '🏛',  col: '#E57E72' },
}

export function Navbar() {
  const { team, xp, goMap, view } = useStore(useShallow(s => ({
    team: s.team, xp: s.xp, goMap: s.goMap, view: s.view,
  })))

  const { min, max, label } = getLevel(xp)
  const pct = Math.min(100, Math.round(((xp - min) / (max - min)) * 100))
  const badge = LEVEL_BADGE[label] || LEVEL_BADGE.Apprentice

  return (
    <nav style={{
      background: '#FFFFFF',
      borderBottom: `2px solid ${INK}`,
      padding: '0 18px',
      height: 56,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    }}>
      {/* Logo */}
      <div
        onClick={() => view !== 'welcome' && goMap()}
        style={{
          cursor: view !== 'welcome' ? 'pointer' : 'default',
          flexShrink: 0,
        }}
      >
        <span style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 16, letterSpacing: '.04em',
          color: INK,
        }}>
          RECITY
        </span>
      </div>

      {/* Right side: badge + level pill */}
      {team && (
        <div style={{
          marginLeft: 'auto',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {/* Achievement badge — scrappy circular sticker */}
          <div title={`${label} · ${xp} XP`}
            style={{
              position: 'relative',
              width: 38, height: 38,
              flexShrink: 0,
              fontSize: 18, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {/* offset blob */}
            <span aria-hidden="true" style={{
              position: 'absolute',
              top: 3, left: 4, right: -2, bottom: -2,
              background: badge.col,
              borderRadius: '52% 48% 50% 52% / 50% 54% 48% 52%',
              zIndex: 0,
            }} />
            {/* ink outline */}
            <span aria-hidden="true" style={{
              position: 'absolute', inset: 0,
              border: `2.5px solid ${INK}`,
              borderRadius: '50%',
              zIndex: 1,
            }} />
            <span style={{ position: 'relative', zIndex: 2 }}>{badge.icon}</span>
          </div>

          {/* Level pill — scrappy chip with mini progress */}
          <div style={{
            position: 'relative',
            padding: '6px 12px',
            display: 'flex', alignItems: 'center', gap: 7,
            flexShrink: 0,
          }}>
            <span aria-hidden="true" style={{
              position: 'absolute',
              top: 3, left: 4, right: -2, bottom: -2,
              background: '#FFFDF8',
              borderRadius: '999px',
              zIndex: 0,
            }} />
            <span aria-hidden="true" style={{
              position: 'absolute', inset: 0,
              border: `2.5px solid ${INK}`,
              borderRadius: 999,
              zIndex: 1,
            }} />
            <span style={{
              position: 'relative', zIndex: 2,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 12,
              color: INK, letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}>
              {label}
            </span>
            <div style={{
              position: 'relative', zIndex: 2,
              width: 24, height: 5,
              borderRadius: 999,
              background: '#EAE5DB',
              overflow: 'hidden',
              border: `1px solid ${INK}`,
            }}>
              <div style={{ height: '100%', width: pct + '%', background: badge.col }} />
            </div>
            <span style={{
              position: 'relative', zIndex: 2,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontSize: 11, fontWeight: 900, color: INK,
            }}>{xp}</span>
          </div>
        </div>
      )}
    </nav>
  )
}
