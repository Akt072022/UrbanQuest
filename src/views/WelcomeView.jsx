// Welcome screen — single focused question ("what are you working
// on?") that runs an AI shortlist immediately. Sign-in is offered
// later (on ProjectFitView) as an opt-in to save the shortlist
// across devices, never as a gate before generating it.
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { suggestMethods, hasMistral } from '../lib/mistral'
import { hasSupabase } from '../lib/supabase'

const INK = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL = '#14B8A6'
const CORAL = '#FB7185'

// ── Decorative ink strokes — kept; they're part of the brand. ──
function InkCorners() {
  return (
    <>
      <svg viewBox="0 0 220 220"
        style={{
          position: 'absolute', top: -20, left: -40,
          width: 240, height: 240,
          zIndex: 0, pointerEvents: 'none',
        }}>
        <path d="M -10 70 C 30 30, 90 60, 110 110 S 70 200, 30 220"
          fill="none" stroke={INK} strokeWidth="14" strokeLinecap="round" />
      </svg>
      <svg viewBox="0 0 220 220"
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
  const {
    userEmail,
    setProjectContext, setAiSuggestions,
    goProjectFit, goMap, goDashboard,
    ensureDefaultTeam,
    aiSuggestions, projectContext,
  } = useStore(useShallow(s => ({
    userEmail:         s.userEmail,
    setProjectContext: s.setProjectContext,
    setAiSuggestions:  s.setAiSuggestions,
    goProjectFit:      s.goProjectFit,
    goMap:             s.goMap,
    goDashboard:       s.goDashboard,
    ensureDefaultTeam: s.ensureDefaultTeam,
    aiSuggestions:     s.aiSuggestions,
    projectContext:    s.projectContext,
  })))

  const [name, setName] = useState(projectContext?.name || '')
  const [desc, setDesc] = useState(projectContext?.desc || '')
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  // Re-sync the form fields when projectContext arrives or changes —
  // handles the case where rehydration / auth restore happens AFTER
  // mount, so the initial useState(projectContext?.name || '') reads
  // an empty store but it later fills in.
  useEffect(() => {
    if (!projectContext) return
    setName(prev => prev || projectContext.name || '')
    setDesc(prev => prev || projectContext.desc || '')
  }, [projectContext])

  const descReady = desc.trim().length >= 20
  const canSubmit = descReady && hasMistral && !busy

  // Run the AI analysis directly. No email gate — sign-in is offered
  // later (on ProjectFitView) as an opt-in to save the shortlist
  // across devices.
  const runAnalysis = async ({ pName, pDesc }) => {
    setBusy(true); setErr('')
    try {
      const out = await suggestMethods({ name: pName, desc: pDesc })
      if (!out.length) throw new Error('No matching methods returned. Try rephrasing.')
      setAiSuggestions(out)
      ensureDefaultTeam()
      goProjectFit()
    } catch (e2) {
      setErr(e2?.message || 'Analysis failed. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const submit = async (e) => {
    e?.preventDefault?.()
    if (busy) return
    if (!descReady) {
      setErr('A few sentences would help — what is the project about, where, who is it for?')
      return
    }
    if (!hasMistral) {
      setErr('AI is not configured on this build. Use the catalogue link below.')
      return
    }
    const pName = name.trim() || 'Your project'
    const pDesc = desc.trim()
    // Persist the project + clear any stale shortlist before running.
    setProjectContext({ name: pName, desc: pDesc })
    setAiSuggestions([])
    await runAnalysis({ pName, pDesc })
  }

  const skipToBrowse = () => {
    ensureDefaultTeam()
    goMap()
  }

  return (
    <div className="anim-fadein" style={{
      position: 'relative',
      minHeight: '100vh',
      padding: '40px 22px 32px',
      overflow: 'hidden',
    }}>
      <InkCorners />

      <div style={{
        position: 'relative', zIndex: 1,
        maxWidth: 460, margin: '0 auto',
      }}>
        {/* ── Wordmark + tagline ───────────────────── */}
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 18 }}>
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
            marginTop: 14, lineHeight: 1.45,
            maxWidth: 360, margin: '14px auto 0',
          }}>
            What's your urban project?
            <br/>We'll pick the right methods to use.
          </div>
        </div>

        {/* ── The one input card — name + description + CTA ── */}
        <form onSubmit={submit}
          style={{
            background: '#FFFFFF', borderRadius: 18, padding: 18,
            border: `2.5px solid ${INK}`,
            marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 12,
          }}>
          <div>
            <label style={LABEL}>Project name <span style={OPT}>(optional)</span></label>
            <input style={INP}
              placeholder="e.g. Lyon Part-Dieu redesign"
              value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={LABEL}>What are you working on?</label>
            <textarea
              placeholder="A few sentences about the site, the ambition, the constraints, who it's for…"
              value={desc} onChange={e => setDesc(e.target.value)}
              rows={5}
              style={{ ...INP, resize: 'vertical', lineHeight: 1.45 }} />
            <div style={{
              fontSize: 10, color: '#9C958A', marginTop: 4,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>
              {desc.trim().length < 20
                ? `${20 - desc.trim().length} more characters before we can analyse`
                : '✓ ready to analyse'}
            </div>
          </div>
          {/* Signed-in users see a small status chip — sign-in stays
              optional and lives on ProjectFitView (Save these →). */}
          {hasSupabase && userEmail && (
            <div style={{
              padding: '8px 10px',
              background: '#FFFDF8', border: `1.5px solid ${INK}33`,
              borderRadius: 10,
            }}>
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 10,
                color: '#5A5550', letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}>✓ Signed in as {userEmail}</div>
            </div>
          )}

          {err && (
            <div style={{
              padding: '8px 10px',
              background: '#FCE8E2', border: `1.5px solid #C0452A`,
              borderRadius: 8, fontSize: 12, color: '#7A1F0E', lineHeight: 1.4,
            }}>{err}</div>
          )}

          <ScrappyButton type="submit"
            onClick={submit}
            color={canSubmit ? YELLOW : '#E0DAD2'}
            size="lg" full>
            {busy ? '✨ ANALYSING…' : '✨ ANALYSE MY PROJECT →'}
          </ScrappyButton>
        </form>

        {/* If a previous shortlist exists, surface it explicitly */}
        {aiSuggestions.length > 0 && projectContext && (
          <button onClick={goProjectFit}
            style={{
              width: '100%', padding: '10px 12px', marginBottom: 16,
              background: 'transparent',
              border: `1.5px dashed ${INK}55`, borderRadius: 10,
              cursor: 'pointer', textAlign: 'left',
            }}>
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 10, color: '#5A5550',
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>Continue your last project</div>
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 14, color: INK,
              marginTop: 2,
            }}>{projectContext.name} — {aiSuggestions.length} methods picked →</div>
          </button>
        )}

        {/* ── Secondary doors ─────────────────────── */}
        <div style={{
          textAlign: 'center', marginTop: 6,
        }}>
          <button onClick={skipToBrowse}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 12,
              color: '#5A5550', letterSpacing: '.05em',
              textTransform: 'uppercase',
              padding: '6px 12px',
            }}>
            Or browse all 133 methods →
          </button>
          {userEmail && (
            <button onClick={() => { ensureDefaultTeam(); goDashboard() }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 12,
                color: '#5A5550', letterSpacing: '.05em',
                textTransform: 'uppercase',
                padding: '6px 12px', marginLeft: 4,
              }}>
              · Open my dashboard
            </button>
          )}
        </div>

        {/* ── Tiny credibility strip — kept low-key ── */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 8,
          marginTop: 28, flexWrap: 'wrap',
        }}>
          <ScrappyChip color={YELLOW} size="sm">133 methods</ScrappyChip>
          <ScrappyChip color={TEAL}   size="sm">4 phases</ScrappyChip>
          <ScrappyChip color={CORAL}  size="sm">6 lenses</ScrappyChip>
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
const OPT = {
  color: '#9C958A', fontWeight: 700, fontSize: 10,
  textTransform: 'none', letterSpacing: 0,
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
