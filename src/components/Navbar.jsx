import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { getLevel } from '../data/tools'

const INK = '#1C2530'
const YELLOW = '#FFC83D'

// One emoji-style achievement badge per level. Used in the Navbar
// as a small "tap to open Profile" indicator — the full level pill
// (label + XP progress + raw XP number) lives on Profile only, so
// the navbar stays focused on navigation rather than gamification.
const LEVEL_BADGE = {
  Apprentice: { icon: '🌱', col: '#A8D080' },
  Planner:    { icon: '⚒',  col: '#14B8A6' },
  Architect:  { icon: '🏛',  col: '#FFC83D' },
  Mayor:      { icon: '🏛',  col: '#FB7185' },
}

export function Navbar() {
  const {
    team, xp, view,
    projectContext, aiSuggestions,
    goMap, goProfile, goProjectFit,
  } = useStore(useShallow(s => ({
    team:           s.team,
    xp:             s.xp,
    view:           s.view,
    projectContext: s.projectContext,
    aiSuggestions:  s.aiSuggestions,
    goMap:          s.goMap,
    goProfile:      s.goProfile,
    goProjectFit:   s.goProjectFit,
  })))

  const hasShortlist = !!(projectContext && aiSuggestions?.length > 0)
  const onProjectFit = view === 'projectFit'
  const projectLabel = (projectContext?.name || 'Your project').trim()

  const { label } = getLevel(xp)
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

      {/* Project shortlist pill — only when an AI shortlist exists.
          Always-on entry point back to ProjectFitView so the user can
          leave the shortlist, browse / dashboard, and come back. */}
      {hasShortlist && (
        <button
          onClick={goProjectFit}
          aria-label={`Open project shortlist: ${projectLabel}`}
          aria-current={onProjectFit ? 'page' : undefined}
          style={{
            position: 'relative',
            padding: '6px 11px 6px 9px',
            display: 'flex', alignItems: 'center', gap: 6,
            minWidth: 0, maxWidth: 200,
            background: 'transparent', border: 'none',
            cursor: 'pointer',
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 12,
            color: INK, letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}>
          <span aria-hidden="true" style={{
            position: 'absolute',
            top: 3, left: 4, right: -2, bottom: -2,
            background: onProjectFit ? YELLOW : '#FFFDF8',
            borderRadius: 999,
            zIndex: 0,
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', inset: 0,
            border: `2px solid ${INK}`,
            borderRadius: 999,
            zIndex: 1,
          }} />
          <span style={{ position: 'relative', zIndex: 2, fontSize: 13 }}>✨</span>
          <span style={{
            position: 'relative', zIndex: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{projectLabel}</span>
        </button>
      )}

      {/* Profile entry — small achievement badge only. The level pill
          (label + XP progress + raw number) used to live here too;
          Phase 4 demotes it to Profile so the navbar focuses on
          navigation rather than gamification. The badge still
          changes icon by level, so progression remains visible. */}
      {team && (
        <button
          onClick={goProfile}
          aria-label="Open profile"
          title={`${label} · open profile`}
          style={{
            marginLeft: 'auto',
            position: 'relative',
            width: 38, height: 38,
            flexShrink: 0,
            padding: 0,
            background: 'transparent', border: 'none',
            cursor: 'pointer',
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
        </button>
      )}
    </nav>
  )
}
