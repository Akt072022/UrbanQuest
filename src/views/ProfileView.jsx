import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { getLevel, TOOLS, DIMENSIONS, GATE_LABEL, SKILL_LEVELS } from '../data/tools'
import { computeBadges } from '../data/badges'
import { ScrappyButton } from '../components/ScrappyButton'
import { hasSupabase, sendMagicLink, signOut } from '../lib/supabase'

const INK    = '#1C2530'
const YELLOW = '#F5C84A'
const TEAL   = '#6FCBC9'
const CARD   = '#FFFDF8'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

const LEVEL_BADGE = {
  Apprentice: { icon: '🌱', col: '#A8D080' },
  Planner:    { icon: '⚒',  col: '#6FCBC9' },
  Architect:  { icon: '🏛',  col: '#F5C84A' },
  Mayor:      { icon: '👑',  col: '#E57E72' },
}

const CAT_LABEL = {
  progression: 'Progression',
  gate:        'Gate clearances',
  dimension:   'Dimension mastery',
  depth:       'Depth & breadth',
}

export function ProfileView() {
  const { team, xp, practiced, skipped, userEmail, goMap } = useStore(useShallow(s => ({
    team:      s.team,
    xp:        s.xp,
    practiced: s.practiced,
    skipped:   s.skipped,
    userEmail: s.userEmail,
    goMap:     s.goMap,
  })))

  const lvl     = getLevel(xp)
  const lvlPct  = Math.min(100, Math.round(((xp - lvl.min) / (lvl.max - lvl.min)) * 100))
  const lvlMeta = LEVEL_BADGE[lvl.label] || LEVEL_BADGE.Apprentice

  const badges   = computeBadges({ practiced, skipped })
  const unlocked = badges.filter(b => b.unlocked).length

  // Stats
  const totalEvaluated = Object.keys(practiced).length
  const byLevel = {
    regular:    Object.values(practiced).filter(l => l === 'regular').length,
    occasional: Object.values(practiced).filter(l => l === 'occasional').length,
    theory:     Object.values(practiced).filter(l => l === 'theory').length,
  }
  const skippedCount = (skipped || []).length
  const gatesCleared = [1, 2, 3, 4].filter(g => {
    const tools = TOOLS.filter(t => t.g.includes(g))
    const skipSet = new Set(skipped || [])
    return tools.length > 0 && tools.every(t => practiced[t.n] || skipSet.has(t.n))
  }).length

  // Magic-link state — Profile is the canonical place to sign in/out
  const [authOpen,   setAuthOpen]   = useState(false)
  const [authEmail,  setAuthEmail]  = useState('')
  const [authStatus, setAuthStatus] = useState('idle')
  const [authMsg,    setAuthMsg]    = useState('')

  const submitMagicLink = async (e) => {
    e.preventDefault()
    if (!authEmail.trim()) return
    setAuthStatus('sending'); setAuthMsg('')
    try {
      await sendMagicLink(authEmail.trim())
      setAuthStatus('sent')
      setAuthMsg('Check your email — open the link to sign in.')
    } catch (err) {
      setAuthStatus('error')
      setAuthMsg(err?.message || 'Could not send link.')
    }
  }

  // Group badges by category for the grid
  const grouped = ['progression', 'gate', 'dimension', 'depth'].map(cat => ({
    cat,
    items: badges.filter(b => b.cat === cat),
  }))

  // Initial for the avatar — prefer team name, then email, else "?"
  const avatarChar =
    (team?.name?.trim()?.[0] ||
     userEmail?.trim()?.[0] ||
     '?').toUpperCase()

  return (
    <div className="anim-fadein" style={{ paddingBottom: 32 }}>
      {/* ── Back ─────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}>
        <ScrappyButton onClick={goMap} color="#FFFFFF" size="sm">
          ← MAP
        </ScrappyButton>
      </div>

      {/* ── Identity card ─────────────────────────────── */}
      <div style={{
        background: CARD,
        border: `2.5px solid ${INK}`,
        borderRadius: 18,
        boxShadow: '3px 3px 0 ' + INK,
        padding: '18px 16px',
        marginBottom: 16,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Avatar — scrappy circle with initial */}
          <div style={{
            position: 'relative',
            width: 64, height: 64, flexShrink: 0,
          }}>
            <span aria-hidden="true" style={{
              position: 'absolute',
              top: 4, left: 5, right: -3, bottom: -3,
              background: lvlMeta.col,
              borderRadius: '52% 48% 50% 52% / 50% 54% 48% 52%',
            }} />
            <span aria-hidden="true" style={{
              position: 'absolute', inset: 0,
              border: `3px solid ${INK}`,
              borderRadius: '50%',
              background: '#FFFFFF',
            }} />
            <span style={{
              position: 'relative', zIndex: 1,
              width: '100%', height: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 28,
              color: INK,
            }}>{avatarChar}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
              color: INK, lineHeight: 1.05,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{team?.name || 'My team'}</div>
            <div style={{
              fontSize: 12, color: '#5A5550', marginTop: 4, fontWeight: 700,
            }}>
              {team?.city ? `${team.city} · ` : ''}{userEmail || 'Local progress (not synced)'}
            </div>
          </div>
        </div>

        {/* Level + progress */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          background: '#F2EDE4',
          border: `2px solid ${INK}`,
          borderRadius: 12,
        }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{lvlMeta.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
              color: INK, letterSpacing: '.04em', textTransform: 'uppercase',
              lineHeight: 1.05,
            }}>{lvl.label}</div>
            <div style={{
              marginTop: 5, height: 7, borderRadius: 999,
              background: '#FFFFFF',
              border: `1.5px solid ${INK}`, overflow: 'hidden',
            }}>
              <div style={{
                width: lvlPct + '%', height: '100%',
                background: lvlMeta.col, transition: 'width .4s',
              }} />
            </div>
          </div>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16,
            color: INK, flexShrink: 0,
          }}>
            {xp}
            <span style={{ fontSize: 11, color: '#9C958A' }}>
              /{lvl.max} XP
            </span>
          </div>
        </div>
      </div>

      {/* ── Sign-in card — magic link ─────────────────── */}
      {hasSupabase && (
        <div style={{
          background: CARD,
          border: `2.5px solid ${INK}`,
          borderRadius: 18,
          boxShadow: '3px 3px 0 ' + INK,
          padding: '14px 14px',
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
            color: '#5A5550', letterSpacing: '.08em', textTransform: 'uppercase',
            marginBottom: 6,
          }}>Account</div>
          {userEmail ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{
                  fontSize: 14, color: INK, fontWeight: 700,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{userEmail}</div>
                <div style={{ fontSize: 11, color: '#5A5550', marginTop: 2 }}>
                  Progress synced across devices.
                </div>
              </div>
              <ScrappyButton onClick={() => signOut()} color="#FFFFFF" size="sm">
                SIGN OUT
              </ScrappyButton>
            </div>
          ) : !authOpen ? (
            <div>
              <div style={{ fontSize: 12, color: '#5A5550', marginBottom: 10 }}>
                Sign in with your email to keep your progress and badges
                across devices. We send a magic link — no password needed.
              </div>
              <ScrappyButton onClick={() => setAuthOpen(true)} color={YELLOW} size="md" full>
                SIGN IN WITH MAGIC LINK
              </ScrappyButton>
            </div>
          ) : (
            <form onSubmit={submitMagicLink}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="email" required
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  padding: '10px 12px', borderRadius: 10,
                  border: `2px solid ${INK}`, outline: 'none',
                  fontSize: 14,
                }} />
              <button type="submit"
                disabled={authStatus === 'sending'}
                style={{
                  padding: '10px',
                  background: authStatus === 'sent' ? '#2A6B45' : INK,
                  color: '#FFFFFF',
                  border: 'none', borderRadius: 10,
                  fontFamily: FONT_HEAD,
                  fontWeight: 900, fontSize: 13, letterSpacing: '.05em',
                  cursor: authStatus === 'sending' ? 'wait' : 'pointer',
                }}>
                {authStatus === 'sending' ? 'SENDING…'
                  : authStatus === 'sent' ? 'EMAIL SENT ✓'
                  : 'SEND MAGIC LINK'}
              </button>
              {authMsg && (
                <div style={{
                  fontSize: 11,
                  color: authStatus === 'error' ? '#C0452A' : '#2A6B45',
                }}>{authMsg}</div>
              )}
              <button type="button" onClick={() => setAuthOpen(false)}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', alignSelf: 'flex-end',
                  fontSize: 10, color: '#9C958A',
                  fontWeight: 800, textTransform: 'uppercase',
                }}>cancel</button>
            </form>
          )}
        </div>
      )}

      {/* ── Stats strip ───────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8, marginBottom: 18,
      }}>
        <Stat label="Methods" value={totalEvaluated} sub={`/${TOOLS.length}`} col={INK} />
        <Stat label="Routine" value={byLevel.regular} col="#2A6B45" />
        <Stat label="Theory" value={byLevel.theory} col="#5A5550" />
        <Stat label="Gates"  value={gatesCleared} sub="/4" col={YELLOW} />
      </div>

      {/* ── Badges grid ───────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
          color: INK, letterSpacing: '.06em', textTransform: 'uppercase',
        }}>Badges</div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12, color: '#5A5550',
        }}>{unlocked}<span style={{ color: '#9C958A' }}> / {badges.length}</span></div>
      </div>

      {grouped.map(({ cat, items }) => (
        items.length > 0 && (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
              color: '#5A5550', letterSpacing: '.08em',
              textTransform: 'uppercase', marginBottom: 6,
            }}>{CAT_LABEL[cat]}</div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: 8,
            }}>
              {items.map(b => <BadgeTile key={b.id} b={b} />)}
            </div>
          </div>
        )
      ))}
    </div>
  )
}

function Stat({ label, value, sub, col }) {
  return (
    <div style={{
      background: CARD,
      border: `2.5px solid ${INK}`,
      borderRadius: 12,
      padding: '8px 6px',
      textAlign: 'center',
      boxShadow: '2px 2px 0 ' + INK,
    }}>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
        color: col, lineHeight: 1,
      }}>
        {value}{sub && <span style={{ fontSize: 11, color: '#9C958A' }}>{sub}</span>}
      </div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
        color: '#5A5550', letterSpacing: '.06em',
        textTransform: 'uppercase', marginTop: 3,
      }}>{label}</div>
    </div>
  )
}

function BadgeTile({ b }) {
  const on = b.unlocked
  return (
    <div title={b.desc}
      style={{
        position: 'relative',
        background: on ? CARD : '#EFEAE0',
        border: `2.5px solid ${on ? INK : '#C8C0B5'}`,
        borderRadius: 14,
        padding: '12px 8px 10px',
        textAlign: 'center',
        boxShadow: on ? '2px 2px 0 ' + INK : 'none',
        opacity: on ? 1 : 0.65,
        transition: 'transform .15s',
      }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        margin: '0 auto 6px',
        background: on ? b.col : '#C8C0B5',
        border: `2px solid ${on ? INK : '#9C958A'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: '#FFFFFF',
        filter: on ? 'none' : 'grayscale(.7)',
      }}>{b.icon}</div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: on ? INK : '#7B746A', letterSpacing: '.04em',
        textTransform: 'uppercase', lineHeight: 1.15,
        marginBottom: 4,
      }}>{b.name}</div>
      <div style={{
        fontSize: 9, color: on ? '#5A5550' : '#9C958A', lineHeight: 1.3,
      }}>{b.desc}</div>
      {!on && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: 11, color: '#9C958A',
        }}>🔒</div>
      )}
    </div>
  )
}
