import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { hasSupabase, sendMagicLink, signOut } from '../lib/supabase'

const INK = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL = '#14B8A6'
const CORAL = '#FB7185'

const PROJECT_TYPES = [
  { value: 'heritage',   label: 'Heritage & rehabilitation' },
  { value: 'mobility',   label: 'Mobility & public space' },
  { value: 'resilience', label: 'Climate resilience' },
  { value: 'econdev',    label: 'Economic development' },
  { value: 'social',     label: 'Social cohesion' },
  { value: 'mixed',      label: 'Mixed-use project' },
]

const LABEL = {
  fontFamily: 'Barlow Condensed, Impact, sans-serif',
  fontWeight: 900,
  fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
  color: INK, display: 'block', marginBottom: 6,
}
const INP = {
  width: '100%', padding: '11px 14px',
  borderRadius: 12,
  border: `2.5px solid ${INK}`,
  background: '#FFFFFF',
  color: INK, fontSize: 14, outline: 'none',
  fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 600,
}

// ── Decorative ink strokes — confined to the screen edges so they
//    never run through the title or the form. The two corners
//    (top-left, bottom-right) frame the page without crossing text.
function InkCorners() {
  return (
    <>
      {/* Top-left corner curl */}
      <svg
        viewBox="0 0 220 220"
        style={{
          position: 'absolute', top: -20, left: -40,
          width: 240, height: 240,
          zIndex: 0, pointerEvents: 'none',
        }}>
        <path d="M -10 70 C 30 30, 90 60, 110 110 S 70 200, 30 220"
          fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      </svg>
      {/* Bottom-right corner curl */}
      <svg
        viewBox="0 0 220 220"
        style={{
          position: 'absolute', bottom: -20, right: -40,
          width: 240, height: 240,
          zIndex: 0, pointerEvents: 'none',
        }}>
        <path d="M 230 150 C 190 190, 130 160, 110 110 S 150 20, 190 0"
          fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      </svg>
    </>
  )
}

export function WelcomeView() {
  const { startGame, userEmail } = useStore(useShallow(s => ({
    startGame: s.startGame,
    userEmail: s.userEmail,
  })))
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [proj, setProj] = useState('heritage')
  // Magic-link state
  const [authOpen, setAuthOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authStatus, setAuthStatus] = useState('idle') // 'idle' | 'sending' | 'sent' | 'error'
  const [authMsg, setAuthMsg] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    startGame({ name: name.trim() || 'My team', city: city.trim() || 'My city', proj })
  }

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

  return (
    <div className="anim-fadein" style={{
      position: 'relative',
      minHeight: '100vh',
      padding: '40px 22px 32px',
      overflow: 'hidden',
    }}>
      <InkCorners />

      {/* All content sits above the ink corners */}
      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 420, margin: '0 auto',
      }}>
        {/* ── Wordmark ───────────────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 30, marginBottom: 14 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900,
            fontSize: 'clamp(56px,18vw,88px)',
            color: INK, lineHeight: .92,
            letterSpacing: '.005em',
          }}>
            ReCity
          </div>
          <div style={{
            fontFamily: '-apple-system, Helvetica Neue, sans-serif',
            fontSize: 14, color: '#3F3A36',
            marginTop: 14, lineHeight: 1.4,
            maxWidth: 320, margin: '14px auto 0',
          }}>
            Self-diagnose your urban planning methods —
            <br/>map your team's strengths and blind spots.
          </div>
        </div>

        {/* ── Stats chips ────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 10,
          marginTop: 18, marginBottom: 22, flexWrap: 'wrap',
        }}>
          <ScrappyChip color={YELLOW}>133 methods</ScrappyChip>
          <ScrappyChip color={TEAL}>4 gates</ScrappyChip>
          <ScrappyChip color={CORAL}>6 lenses</ScrappyChip>
        </div>

        {/* ── Form card ──────────────────────────── */}
        <div style={{
          background: '#FFFFFF', borderRadius: 18, padding: 18,
          border: `2.5px solid ${INK}`,
          marginBottom: 22,
        }}>
          <form onSubmit={handleSubmit} style={{
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
            }}>
              <div>
                <label style={LABEL}>Team</label>
                <input style={INP} placeholder="Team A…"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <label style={LABEL}>City</label>
                <input style={INP} placeholder="Lyon…"
                  value={city} onChange={e => setCity(e.target.value)} />
              </div>
            </div>

            <div>
              <label style={LABEL}>Project type</label>
              <select style={{ ...INP, cursor: 'pointer' }}
                value={proj} onChange={e => setProj(e.target.value)}>
                {PROJECT_TYPES.map(pt => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'center' }}>
              <ScrappyButton size="lg" color={YELLOW} type="submit"
                onClick={handleSubmit} full>
                ENTER THE CITY →
              </ScrappyButton>
            </div>
          </form>
        </div>

        {/* ── Gate strip ─────────────────────────── */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap',
        }}>
          <ScrappyChip color={YELLOW}>Proof of Impact</ScrappyChip>
          <ScrappyChip color={TEAL}>Proof of Fit</ScrappyChip>
          <ScrappyChip color="#A8D080">Proof of Anchoring</ScrappyChip>
          <ScrappyChip color={CORAL}>Proof of Sustainability</ScrappyChip>
        </div>

        {/* ── Sign-in (optional) — magic-link to sync across devices */}
        {hasSupabase && (
          <div style={{ marginTop: 18, textAlign: 'center' }}>
            {userEmail ? (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px',
                background: '#FFFFFF',
                border: `2px solid ${INK}`, borderRadius: 999,
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 11, letterSpacing: '.05em',
                color: INK,
              }}>
                Signed in · {userEmail}
                <button onClick={() => signOut()}
                  style={{
                    border: 'none', background: 'transparent',
                    color: '#9C958A', cursor: 'pointer',
                    fontSize: 11, fontWeight: 900, padding: 0,
                  }}>SIGN OUT</button>
              </div>
            ) : !authOpen ? (
              <button onClick={() => setAuthOpen(true)}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontWeight: 900, fontSize: 11, letterSpacing: '.05em',
                  color: '#5A5550', textTransform: 'uppercase',
                  textDecoration: 'underline',
                }}>
                Sign in to sync across devices
              </button>
            ) : (
              <form onSubmit={submitMagicLink}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  background: '#FFFFFF',
                  border: `2.5px solid ${INK}`, borderRadius: 14,
                  padding: 14, marginTop: 6,
                }}>
                <label style={{
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
                  textTransform: 'uppercase', color: INK,
                }}>Sign in with magic link</label>
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
                    fontFamily: 'Barlow Condensed, Impact, sans-serif',
                    fontWeight: 900, fontSize: 13, letterSpacing: '.05em',
                    cursor: authStatus === 'sending' ? 'wait' : 'pointer',
                  }}>
                  {authStatus === 'sending' ? 'SENDING…'
                    : authStatus === 'sent' ? 'EMAIL SENT ✓'
                    : 'SEND MAGIC LINK'}
                </button>
                {authMsg && (
                  <div style={{
                    fontSize: 11, color: authStatus === 'error' ? '#C0452A' : '#10B981',
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
      </div>
    </div>
  )
}
