// Sign-in / switch-account surface. Reached by:
//   • Profile → SIGN OUT → goLogin
//   • Welcome → "Sign in" link for users who already have an account
// Lets the user request a magic link to a fresh email so a different
// account can take over the same browser. There's also a quiet
// "Continue without an account" exit for users who'd rather skip it.
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton } from '../components/ScrappyButton'
import { hasSupabase, sendMagicLink } from '../lib/supabase'

const INK    = '#1C2530'
const YELLOW = '#FFC83D'

export function LoginView() {
  const { userEmail, goWelcome } = useStore(useShallow(s => ({
    userEmail:  s.userEmail,
    goWelcome:  s.goWelcome,
  })))

  const [email, setEmail]   = useState('')
  const [busy,  setBusy]    = useState(false)
  const [sent,  setSent]    = useState(false)
  const [err,   setErr]     = useState('')
  // When the user is already signed in (e.g. landed here from a
  // magic-link callback, or hit goLogin while still authed), we
  // hide the email form behind a "switch account" toggle. Prevents
  // the closed loop where the page says "✓ Signed in" *and* asks
  // you to sign in again.
  const [switching, setSwitching] = useState(false)
  const inputRef = useRef(null)
  // Auto-focus only when the form is actually visible (not when the
  // "you're signed in, continue" panel is showing).
  useEffect(() => {
    if (!userEmail || switching) inputRef.current?.focus?.()
  }, [userEmail, switching])

  const validEmail = /\S+@\S+\.\S+/.test(email.trim())
  // What the form should be doing right now:
  //   • signed in + not switching → show the "Continue / switch" panel
  //   • signed in + switching     → show the email form (so they can
  //                                 send a link to a different inbox)
  //   • not signed in             → show the email form
  const showForm = !userEmail || switching

  const submit = async (e) => {
    e?.preventDefault?.()
    if (busy || !validEmail) return
    setBusy(true); setErr('')
    try {
      await sendMagicLink(email.trim())
      setSent(true)
    } catch (err2) {
      console.error('[login] sendMagicLink failed:', err2)
      const msg    = err2?.message || ''
      const status = err2?.status ?? err2?.statusCode ?? null
      const code   = err2?.code   ?? null
      if (/rate limit (?:reached|exceeded)/i.test(msg)) {
        setErr('Email rate limit reached on this Supabase project. Wait a few minutes or wire a custom SMTP provider.')
      } else {
        setErr(
          (status ? `[${status}] ` : '') +
          (code   ? `(${code}) `   : '') +
          (msg || 'Could not send the link.')
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="anim-fadein" style={{
      position: 'relative',
      minHeight: '100vh',
      padding: '40px 22px 32px',
    }}>
      <div style={{
        maxWidth: 460, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        {/* Wordmark + hero cityscape — same fused-into-canvas
            illustration as the Welcome screen, so the two sign-in
            entry points read as the same brand surface. */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{
            width: 'min(40vw, 150px)',
            aspectRatio: '6 / 5',
            margin: '0 auto -18px',
            overflow: 'hidden',
            background: '#F2EDE4',
          }}>
            <img
              src={`${import.meta.env.BASE_URL}illustrations/cityscape.png`}
              alt=""
              draggable={false}
              onError={(e) => { e.currentTarget.style.display = 'none' }}
              style={{
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: '50% 32%',
                display: 'block',
                mixBlendMode: 'multiply',
                userSelect: 'none', pointerEvents: 'none',
              }} />
          </div>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900,
            fontSize: 'clamp(36px,11vw,56px)',
            color: INK, lineHeight: .92,
          }}>ReCity</div>
          <div style={{
            fontFamily: '-apple-system, Helvetica Neue, sans-serif',
            fontSize: 14, color: '#3F3A36', marginTop: 12,
          }}>
            Sign in with your email — we send a one-tap link, no password.
          </div>
        </div>

        {/* Already signed in — primary action is "Continue", with
            a quiet toggle to swap accounts. Hides the email form
            entirely so the user can't end up on a screen that says
            "you're signed in" *and* demands an email at the same
            time. */}
        {userEmail && !switching && !sent && (
          <div style={{
            background: '#FFFFFF', borderRadius: 16, padding: 18,
            border: `2.5px solid ${INK}`,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{
              padding: '10px 12px',
              background: '#E6F4EC',
              border: `1.5px solid #10B981`, borderRadius: 10,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontSize: 12, color: '#1F4E32',
              letterSpacing: '.04em',
              textAlign: 'center',
              wordBreak: 'break-all',
            }}>
              ✓ Signed in as <b>{userEmail}</b>
            </div>
            <ScrappyButton
              onClick={goWelcome}
              color={YELLOW} size="lg" full>
              CONTINUE TO RECITY →
            </ScrappyButton>
            <button type="button"
              onClick={() => { setSwitching(true); setEmail('') }}
              style={{
                background: 'transparent', border: 'none',
                cursor: 'pointer', padding: '4px 0',
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 11,
                color: '#5A5550', letterSpacing: '.06em',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}>
              · Or sign in with a different email
            </button>
          </div>
        )}

        {/* Form — visible when nobody's signed in OR the signed-in
            user explicitly clicked "switch account". */}
        {showForm && (
        <form onSubmit={submit}
          style={{
            background: '#FFFFFF', borderRadius: 16, padding: 18,
            border: `2.5px solid ${INK}`,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
          {sent ? (
            <div style={{
              padding: '12px 14px',
              background: '#E6F4EC', border: `1.5px solid #10B981`,
              borderRadius: 10, fontSize: 13, color: '#1F4E32', lineHeight: 1.5,
            }}>
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 12, letterSpacing: '.06em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>✓ Check your email</div>
              We sent a sign-in link to <b>{email}</b>. Click it to come
              back here as that account.
              <div style={{ marginTop: 10 }}>
                <button type="button"
                  onClick={() => { setSent(false); setEmail('') }}
                  style={{
                    background: 'transparent', border: 'none',
                    padding: 0, cursor: 'pointer',
                    fontFamily: 'Barlow Condensed, Impact, sans-serif',
                    fontWeight: 900, fontSize: 11, color: '#1F4E32',
                    letterSpacing: '.06em', textTransform: 'uppercase',
                    textDecoration: 'underline',
                  }}>· Use a different email</button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label style={LABEL}>Email</label>
                <input ref={inputRef}
                  type="email" required autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={INP} />
              </div>
              {err && (
                <div style={{
                  padding: '8px 10px',
                  background: '#FCE8E2', border: `1.5px solid #C0452A`,
                  borderRadius: 8, fontSize: 12, color: '#7A1F0E', lineHeight: 1.4,
                }}>{err}</div>
              )}
              <ScrappyButton type="submit"
                onClick={submit}
                color={!busy && validEmail ? YELLOW : '#E0DAD2'}
                size="lg" full>
                {busy ? 'SENDING LINK…' : '✨ EMAIL ME A SIGN-IN LINK →'}
              </ScrappyButton>
              {!hasSupabase && (
                <div style={{
                  fontSize: 11, color: '#9C958A',
                  textAlign: 'center', lineHeight: 1.4,
                }}>
                  Supabase isn't configured on this build, so sign-in is
                  disabled. Continue without an account below.
                </div>
              )}
            </>
          )}
        </form>
        )}

        {/* Quiet exit — go back to anonymous use. */}
        <div style={{ textAlign: 'center' }}>
          <button type="button"
            onClick={goWelcome}
            style={{
              background: 'transparent', border: 'none',
              cursor: 'pointer', padding: '6px 12px',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 12,
              color: '#5A5550', letterSpacing: '.05em',
              textTransform: 'uppercase',
            }}>
            ← Continue without an account
          </button>
        </div>
      </div>
    </div>
  )
}

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
  boxSizing: 'border-box',
}
