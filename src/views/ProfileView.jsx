import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { getLevel, TOOLS, DIMENSIONS, GATE_LABEL, SKILL_LEVELS } from '../data/tools'
import { computeBadges } from '../data/badges'
import { ScrappyButton } from '../components/ScrappyButton'
import {
  hasSupabase, sendMagicLink, signOut,
  createTeam, joinTeamByCode, leaveTeam, fetchTeamMembers,
} from '../lib/supabase'
import { refreshTeams } from '../lib/syncSupabase'

const INK    = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL   = '#14B8A6'
const CARD   = '#FFFDF8'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

const LEVEL_BADGE = {
  Apprentice: { icon: '🌱', col: '#A8D080' },
  Planner:    { icon: '⚒',  col: '#14B8A6' },
  Architect:  { icon: '🏛',  col: '#FFC83D' },
  Mayor:      { icon: '👑',  col: '#FB7185' },
}

const CAT_LABEL = {
  progression: 'Progression',
  gate:        'Phase clearances',
  dimension:   'Dimension mastery',
  depth:       'Depth & breadth',
}

export function ProfileView() {
  const {
    team, xp, practiced, skipped, userEmail, goMap,
    teams, currentTeamId, setCurrentTeamId,
  } = useStore(useShallow(s => ({
    team:             s.team,
    xp:               s.xp,
    practiced:        s.practiced,
    skipped:          s.skipped,
    userEmail:        s.userEmail,
    goMap:            s.goMap,
    teams:            s.teams,
    currentTeamId:    s.currentTeamId,
    setCurrentTeamId: s.setCurrentTeamId,
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

  // Team-management state — local to this view; the canonical state
  // lives in the store (teams, currentTeamId).
  const [teamFormOpen, setTeamFormOpen] = useState(null)  // null | 'create' | 'join'
  const [teamName, setTeamName] = useState('')
  const [teamCity, setTeamCity] = useState('')
  const [teamProj, setTeamProj] = useState('mobility')
  const [joinCode, setJoinCode] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamErr,  setTeamErr]  = useState('')
  // Ref-based re-entry guard. setState updates aren't synchronous,
  // so two near-simultaneous submits (e.g. button click + form
  // submit) both see teamBusy as `false` and race two INSERTs,
  // leaving the UI stuck on "CREATING…" while one of them fails
  // silently. The ref flips synchronously and shuts the second
  // call down before it touches Supabase.
  const teamBusyRef = useRef(false)
  const [memberCounts, setMemberCounts] = useState({})  // { teamId: n }
  // After a successful create, show a "share invite code" panel
  // instead of dropping the user back into the team list with no
  // feedback. They likely want to invite teammates next.
  const [teamJustCreated, setTeamJustCreated] = useState(null)
  const [copyState, setCopyState] = useState('idle')   // 'idle' | 'copied'
  // Fetch member counts for the cached teams. Cheap query, gated to
  // the user's actual memberships by RLS.
  useEffect(() => {
    let cancelled = false
    if (!userEmail || teams.length === 0) { setMemberCounts({}); return }
    Promise.all(teams.map(async t => {
      const rows = await fetchTeamMembers(t.id)
      return [t.id, rows.length]
    })).then(pairs => {
      if (!cancelled) setMemberCounts(Object.fromEntries(pairs))
    })
    return () => { cancelled = true }
  }, [teams, userEmail])

  // Wrap a Supabase op in a 20 s timeout so we never sit on
  // "CREATING…" / "JOINING…" forever when the network or RLS gets
  // weird. Logs the original error to the console with full detail
  // so the user can copy-paste it back to us if needed.
  const withTimeout = async (promise, ms = 20000, label = 'op') => {
    let timer
    const timeoutP = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms / 1000}s — try again. ` +
          `If it keeps timing out, check your Supabase project (RLS, network).`))
      }, ms)
    })
    try {
      return await Promise.race([promise, timeoutP])
    } finally {
      clearTimeout(timer)
    }
  }

  const submitCreateTeam = async (e) => {
    e?.preventDefault?.()
    // Synchronous re-entry guard, see teamBusyRef declaration.
    if (teamBusyRef.current) return
    if (!teamName.trim()) return
    teamBusyRef.current = true
    setTeamBusy(true); setTeamErr('')
    try {
      const created = await withTimeout(
        createTeam({ name: teamName, city: teamCity, proj: teamProj }),
        20000, 'Create team',
      )
      await withTimeout(refreshTeams(), 10000, 'Refresh teams')
      setCurrentTeamId(created.id)
      // Land on a success panel showing the invite code so the user
      // can immediately share it with teammates.
      setTeamJustCreated(created)
      setTeamFormOpen(null)
      setTeamName(''); setTeamCity('')
    } catch (err) {
      console.error('[team] createTeam failed:', err)
      const detail = err?.code ? `[${err.code}] ` : ''
      setTeamErr(detail + (err?.message || 'Could not create team.'))
    } finally {
      teamBusyRef.current = false
      setTeamBusy(false)
    }
  }

  const submitJoinTeam = async (e) => {
    e?.preventDefault?.()
    if (teamBusyRef.current) return
    if (!joinCode.trim()) return
    teamBusyRef.current = true
    setTeamBusy(true); setTeamErr('')
    try {
      const joined = await withTimeout(
        joinTeamByCode(joinCode), 20000, 'Join team',
      )
      await withTimeout(refreshTeams(), 10000, 'Refresh teams')
      setCurrentTeamId(joined.id)
      setTeamFormOpen(null)
      setJoinCode('')
    } catch (err) {
      console.error('[team] joinTeamByCode failed:', err)
      const detail = err?.code ? `[${err.code}] ` : ''
      setTeamErr(detail + (err?.message || 'Could not join team.'))
    } finally {
      teamBusyRef.current = false
      setTeamBusy(false)
    }
  }
  const copyInviteCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch { /* clipboard might not be available */ }
  }
  const handleLeave = async (teamId) => {
    if (!confirm('Leave this team? Your evaluations stay tagged with it but you lose team-dashboard access.')) return
    try {
      await leaveTeam(teamId)
      await refreshTeams()
      // refreshTeams() already drops the currentTeamId if the user
      // just left their active team.
    } catch (err) {
      alert(err?.message || 'Could not leave team.')
    }
  }
  const copyInvite = (code) => copyInviteCode(code)

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
              <ScrappyButton
                onClick={async () => {
                  await signOut()
                  // Force-clear store auth + team state in case the
                  // Supabase auth listener missed the event, then
                  // route the user to the dedicated login surface so
                  // they can switch accounts (rather than leaving them
                  // staring at a profile that says "signed out").
                  useStore.setState({
                    userId: null, userEmail: null,
                    teams: [], currentTeamId: null,
                  })
                  useStore.getState().goLogin()
                }}
                color="#FFFFFF" size="sm">
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
                  background: authStatus === 'sent' ? '#10B981' : INK,
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
                  color: authStatus === 'error' ? '#C0452A' : '#10B981',
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

      {/* ── Teams ─────────────────────────────────────── */}
      {hasSupabase && userEmail && (
        <div style={{
          background: CARD,
          border: `2.5px solid ${INK}`,
          borderRadius: 18,
          boxShadow: '3px 3px 0 ' + INK,
          padding: '14px 14px',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'flex', alignItems: 'baseline',
            justifyContent: 'space-between', gap: 8,
            marginBottom: 10,
          }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
              color: '#5A5550', letterSpacing: '.08em',
              textTransform: 'uppercase',
            }}>Teams</div>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
              color: '#9C958A',
            }}>{teams.length}</div>
          </div>

          {teams.length === 0 && (
            <div style={{
              fontSize: 12, color: '#5A5550', lineHeight: 1.45, marginBottom: 10,
            }}>
              Teams let you share evaluations with co-workers and unlock the
              team dashboard. Create one to start, or join with an invite code.
            </div>
          )}

          {/* Team list */}
          {teams.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {teams.map(t => {
                const active = t.id === currentTeamId
                const count  = memberCounts[t.id]
                return (
                  <div key={t.id} style={{
                    padding: '10px 12px',
                    background: active ? '#E6F4EC' : '#F2EDE4',
                    border: `2px solid ${active ? '#10B981' : INK + '33'}`,
                    borderRadius: 12,
                    boxShadow: active ? '2px 2px 0 #10B981' : 'none',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          marginBottom: 2,
                        }}>
                          {active && (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
                              <path d="M5 13l4 4L19 7" stroke="#10B981" strokeWidth="3"
                                strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          <span style={{
                            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
                            color: INK, letterSpacing: '.04em',
                            textTransform: 'uppercase', lineHeight: 1.1,
                          }}>{t.name}</span>
                          {t.role === 'facilitator' && (
                            <span style={{
                              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 8,
                              padding: '1px 5px', background: YELLOW,
                              border: `1.5px solid ${INK}`, borderRadius: 4,
                              color: INK, letterSpacing: '.06em',
                            }}>FACILITATOR</span>
                          )}
                        </div>
                        <div style={{
                          fontSize: 11, color: '#5A5550',
                        }}>
                          {t.city ? `${t.city} · ` : ''}{count != null ? `${count} member${count !== 1 ? 's' : ''}` : '…'}
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-end', gap: 4, flexShrink: 0,
                      }}>
                        {!active && (
                          <button onClick={() => setCurrentTeamId(t.id)}
                            style={{
                              padding: '4px 10px',
                              background: '#FFFFFF', color: INK,
                              border: `2px solid ${INK}`, borderRadius: 999,
                              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                              letterSpacing: '.06em', cursor: 'pointer',
                            }}>SET ACTIVE</button>
                        )}
                        {t.invite_code && (
                          <button onClick={() => copyInvite(t.invite_code)}
                            title="Click to copy invite code"
                            style={{
                              padding: '3px 8px',
                              background: '#FFFFFF', color: '#5A5550',
                              border: `1.5px dashed ${INK}55`, borderRadius: 6,
                              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                              letterSpacing: '.1em', cursor: 'pointer',
                            }}>{t.invite_code} ⧉</button>
                        )}
                      </div>
                    </div>
                    {active && (
                      <button onClick={() => handleLeave(t.id)}
                        style={{
                          marginTop: 6, padding: 0,
                          background: 'transparent', border: 'none',
                          fontSize: 10, color: '#9C958A', fontWeight: 800,
                          letterSpacing: '.06em', textTransform: 'uppercase',
                          cursor: 'pointer',
                        }}>· leave team</button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Just-created success panel — invite-code share with
              prominent copy. Replaces the silent "form closes, no
              feedback" UX from before. */}
          {teamJustCreated && (
            <div style={{
              padding: '14px 14px 12px',
              background: '#E6F4EC',
              border: `2.5px solid #10B981`,
              borderRadius: 14,
              boxShadow: '2px 2px 0 #10B981',
              marginBottom: 10,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                  <circle cx="12" cy="12" r="10" fill="#10B981" />
                  <path d="M7 12.5l3.2 3.2L17 9" stroke="#FFFFFF"
                    strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12,
                  color: '#1F4E32', letterSpacing: '.06em',
                  textTransform: 'uppercase',
                }}>Team created</span>
              </div>
              <div style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
                color: INK, marginBottom: 10, lineHeight: 1.15,
              }}>{teamJustCreated.name}</div>
              <div style={{
                fontSize: 12, color: '#3F3A36', lineHeight: 1.45,
                marginBottom: 12,
              }}>
                Share this invite code with your teammates so they can
                join and contribute their evaluations:
              </div>
              <div style={{
                display: 'flex', gap: 8, alignItems: 'stretch',
                marginBottom: 10,
              }}>
                <div style={{
                  flex: 1,
                  padding: '12px 14px',
                  background: '#FFFFFF',
                  border: `2.5px solid ${INK}`, borderRadius: 12,
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
                  color: INK, letterSpacing: '.18em', textAlign: 'center',
                }}>{teamJustCreated.invite_code}</div>
                <button onClick={() => copyInviteCode(teamJustCreated.invite_code)}
                  title="Copy invite code"
                  style={{
                    flexShrink: 0,
                    padding: '0 14px',
                    background: copyState === 'copied' ? '#10B981' : '#FFFFFF',
                    border: `2.5px solid ${INK}`, borderRadius: 12,
                    cursor: 'pointer',
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                    color: copyState === 'copied' ? '#FFFFFF' : INK,
                    letterSpacing: '.06em', textTransform: 'uppercase',
                  }}>
                  {copyState === 'copied' ? '✓ COPIED' : 'COPY'}
                </button>
              </div>
              <ScrappyButton
                onClick={() => setTeamJustCreated(null)}
                color={YELLOW} size="sm" full>
                DONE — INVITE LATER
              </ScrappyButton>
            </div>
          )}

          {/* Create / Join controls */}
          {teamFormOpen === null && !teamJustCreated && (
            <div style={{ display: 'flex', gap: 8 }}>
              <ScrappyButton onClick={() => { setTeamFormOpen('create'); setTeamErr('') }}
                color={YELLOW} size="sm" full>
                + CREATE TEAM
              </ScrappyButton>
              <ScrappyButton onClick={() => { setTeamFormOpen('join'); setTeamErr('') }}
                color="#FFFFFF" size="sm" full>
                JOIN BY CODE
              </ScrappyButton>
            </div>
          )}

          {teamFormOpen === 'create' && (
            <form onSubmit={submitCreateTeam}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="Team name (e.g. Lyon Urbanism Lab)"
                style={{
                  padding: '9px 11px',
                  border: `2px solid ${INK}`, borderRadius: 10,
                  fontSize: 13, fontWeight: 700, color: INK,
                  outline: 'none',
                  fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                }} />
              <input value={teamCity}
                onChange={e => setTeamCity(e.target.value)}
                placeholder="City (optional)"
                style={{
                  padding: '9px 11px',
                  border: `2px solid ${INK}`, borderRadius: 10,
                  fontSize: 13, color: INK,
                  outline: 'none',
                  fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                }} />
              <select value={teamProj}
                onChange={e => setTeamProj(e.target.value)}
                style={{
                  padding: '9px 11px',
                  border: `2px solid ${INK}`, borderRadius: 10,
                  fontSize: 13, color: INK, background: '#FFFFFF',
                  outline: 'none', cursor: 'pointer',
                  fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                }}>
                <option value="heritage">Heritage & rehabilitation</option>
                <option value="mobility">Mobility & public space</option>
                <option value="resilience">Climate resilience</option>
                <option value="econdev">Economic development</option>
                <option value="social">Social cohesion</option>
                <option value="mixed">Mixed-use project</option>
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <ScrappyButton type="button"
                  onClick={() => { setTeamFormOpen(null); setTeamErr('') }}
                  color="#FFFFFF" size="sm" full>
                  CANCEL
                </ScrappyButton>
                <ScrappyButton type="submit"
                  color={teamBusy || !teamName.trim() ? '#E0DAD2' : YELLOW}
                  size="sm" full>
                  {teamBusy ? 'CREATING…' : 'CREATE'}
                </ScrappyButton>
              </div>
            </form>
          )}

          {teamFormOpen === 'join' && (
            <form onSubmit={submitJoinTeam}
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Invite code (e.g. AB3D5K)"
                style={{
                  padding: '9px 11px',
                  border: `2px solid ${INK}`, borderRadius: 10,
                  fontSize: 14, fontWeight: 700, color: INK,
                  letterSpacing: '.1em',
                  outline: 'none',
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  textTransform: 'uppercase',
                }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <ScrappyButton type="button"
                  onClick={() => { setTeamFormOpen(null); setTeamErr('') }}
                  color="#FFFFFF" size="sm" full>
                  CANCEL
                </ScrappyButton>
                <ScrappyButton type="submit"
                  color={teamBusy || !joinCode.trim() ? '#E0DAD2' : YELLOW}
                  size="sm" full>
                  {teamBusy ? 'JOINING…' : 'JOIN'}
                </ScrappyButton>
              </div>
            </form>
          )}

          {teamErr && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: '#FCE8E2', border: `1.5px solid #C0452A`,
              borderRadius: 8, fontSize: 11, color: '#7A1F0E', lineHeight: 1.4,
            }}>{teamErr}</div>
          )}
        </div>
      )}

      {/* ── Stats strip ───────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 8, marginBottom: 18,
      }}>
        <Stat label="Methods" value={totalEvaluated} sub={`/${TOOLS.length}`} col={INK} />
        <Stat label="Routine" value={byLevel.regular} col="#10B981" />
        <Stat label="Theory" value={byLevel.theory} col="#5A5550" />
        <Stat label="Phases" value={gatesCleared} sub="/4" col={YELLOW} />
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
      {/* Icon — image when the badge has an iconSrc (the dim PNGs),
          emoji otherwise. Locked badges show a flat silhouette (the
          colour is hidden until the badge is earned); unlocked
          badges reveal the full-colour illustration sitting on a
          tinted disc that picks up the dim's accent. */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%',
        margin: '0 auto 6px',
        background: on ? '#FFFFFF' : '#D6CFC1',
        border: `2px solid ${on ? b.col : '#9C958A'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: on ? INK : '#9C958A',
        overflow: 'hidden',
      }}>
        {b.iconSrc ? (
          <img src={b.iconSrc} alt=""
            draggable={false}
            style={{
              width: '88%', height: '88%', objectFit: 'contain',
              // Locked: flatten to a single grey silhouette so the
              // illustration's colours don't spoil the achievement.
              // Unlocked: full-colour, no filter. Crop to a circle
              // and multiply so the PNG's rounded-rect corners don't
              // leak through into the badge tile.
              clipPath: 'circle(50%)',
              mixBlendMode: 'multiply',
              filter: on ? 'none' : 'brightness(0) opacity(.4)',
              userSelect: 'none', pointerEvents: 'none',
            }} />
        ) : b.icon}
      </div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: on ? INK : '#7B746A', letterSpacing: '.04em',
        textTransform: 'uppercase', lineHeight: 1.15,
        marginBottom: 4,
      }}>{b.name}</div>
      <div style={{
        fontSize: 9, color: on ? '#5A5550' : '#9C958A', lineHeight: 1.3,
      }}>{b.desc}</div>
      {/* Tier dots — visible for tiered badges (1-4 dots filled to
          show progression within a dimension). */}
      {b.tier && (
        <div style={{
          marginTop: 5, display: 'flex', justifyContent: 'center', gap: 3,
        }}>
          {[1,2,3,4].map(n => (
            <span key={n} style={{
              width: 5, height: 5, borderRadius: '50%',
              background: n <= b.tier && on ? b.col : '#D6CFC1',
              border: n === b.tier ? `1px solid ${on ? INK : '#9C958A'}` : 'none',
            }} />
          ))}
        </div>
      )}
      {!on && (
        <div aria-hidden="true" style={{
          position: 'absolute', top: 6, right: 6,
          fontSize: 11, color: '#9C958A',
        }}>🔒</div>
      )}
    </div>
  )
}
