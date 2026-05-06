// Welcome screen — single focused question ("what are you working
// on?") that runs an AI shortlist immediately. Sign-in is offered
// later (on ProjectFitView) as an opt-in to save the shortlist
// across devices, never as a gate before generating it.
import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { suggestMethods, interviewStep, hasMistral } from '../lib/mistral'
import { hasSupabase } from '../lib/supabase'

const INK = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL = '#14B8A6'
const CORAL = '#FB7185'

// (Decorative ink strokes removed — they were drawing curved
// black lines in the page corners that competed with the chat UI
// for visual weight.)

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
  // Default to the guided AI interview when Mistral is configured.
  // The free-form textarea stays available behind a "Just let me
  // type" link for users who already know exactly what they want
  // to say.
  const [mode, setMode] = useState(hasMistral ? 'chat' : 'form')

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

        {mode === 'chat' && hasMistral ? (
          <ProjectInterview
            busyParent={busy}
            onAnalyse={async ({ pName, pDesc }) => {
              setProjectContext({ name: pName, desc: pDesc })
              setAiSuggestions([])
              await runAnalysis({ pName, pDesc })
            }}
            onSwitchToForm={() => setMode('form')} />
        ) : (
          <>
            {/* ── Free-form fallback — name + description + CTA ── */}
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
              {hasMistral && (
                <button type="button"
                  onClick={() => setMode('chat')}
                  style={{
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', padding: '4px 0',
                    fontFamily: 'Barlow Condensed, Impact, sans-serif',
                    fontWeight: 900, fontSize: 11,
                    color: '#5A5550', letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    textAlign: 'center',
                  }}>
                  ✦ Or let the AI ask me about it
                </button>
              )}
            </form>
          </>
        )}

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

// ── Project interview — short AI-led chat that drafts the brief ──
//   Default mode on the welcome screen when Mistral is configured.
//   Walks the user through ~4-6 targeted questions about the
//   site / ambition / stakeholders / constraints / open questions,
//   then surfaces an "Analyse my project" CTA once the AI has
//   enough material to write the structured description that
//   suggestMethods consumes.
function ProjectInterview({ onAnalyse, onSwitchToForm, busyParent }) {
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: "Hi! Let's shape your urban project together. To start: what's the site or area you're working on, and what's there today?",
  }])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Final brief from the AI: { name, desc }. When set, the input
  // disappears and the "Analyse my project" CTA takes over.
  const [done, setDone] = useState(null)
  const scrollRef = useRef(null)

  // Auto-scroll the chat to the latest message.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, done])

  const send = async () => {
    if (busy || !input.trim()) return
    const userMsg = { role: 'user', content: input.trim() }
    const next    = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setBusy(true); setErr('')
    try {
      const r = await interviewStep({ messages: next })
      if (r.type === 'ask') {
        setMessages(m => [...m, { role: 'assistant', content: r.question }])
      } else {
        setDone({ name: r.name, desc: r.desc })
        setMessages(m => [...m, {
          role: 'assistant',
          content: `Got it. Here's how I'd describe your project:\n\n**${r.name}**\n\n${r.desc}\n\nIf this looks right, hit "Analyse my project" below.`,
        }])
      }
    } catch (e) {
      setErr(e?.message || 'Couldn\'t reach the AI. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e) => {
    // Enter sends, Shift+Enter inserts a newline (chat convention).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 18, padding: 16,
      border: `2.5px solid ${INK}`,
      marginBottom: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Conversation */}
      <div ref={scrollRef} style={{
        maxHeight: 360, minHeight: 220,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 10,
        paddingRight: 4,
      }}>
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>{m.content}</Bubble>
        ))}
        {busy && (
          <Bubble role="assistant">
            <span style={{ opacity: 0.6 }}>thinking…</span>
          </Bubble>
        )}
      </div>

      {err && (
        <div style={{
          padding: '8px 10px',
          background: '#FCE8E2', border: `1.5px solid #C0452A`,
          borderRadius: 8, fontSize: 12, color: '#7A1F0E', lineHeight: 1.4,
        }}>{err}</div>
      )}

      {/* Input area — disappears once the brief is ready and is
          replaced by the "Analyse my project" CTA. */}
      {!done ? (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={2}
              placeholder="Type your answer…"
              disabled={busy}
              style={{
                ...INP,
                resize: 'none',
                lineHeight: 1.4,
                flex: 1,
                fontSize: 14,
              }} />
            <ScrappyButton type="button"
              onClick={send}
              color={!busy && input.trim() ? YELLOW : '#E0DAD2'}
              size="md">
              {busy ? '…' : 'SEND'}
            </ScrappyButton>
          </div>
          <button type="button"
            onClick={onSwitchToForm}
            style={{
              background: 'transparent', border: 'none',
              cursor: 'pointer', padding: '4px 0',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11,
              color: '#5A5550', letterSpacing: '.06em',
              textTransform: 'uppercase',
              alignSelf: 'center',
            }}>
            · Or just let me type
          </button>
        </>
      ) : (
        <ScrappyButton type="button"
          onClick={() => onAnalyse({ pName: done.name, pDesc: done.desc })}
          color={busyParent ? '#E0DAD2' : YELLOW}
          size="lg" full>
          {busyParent ? '✨ ANALYSING…' : '✨ ANALYSE MY PROJECT →'}
        </ScrappyButton>
      )}
    </div>
  )
}

function Bubble({ role, children }) {
  const isUser = role === 'user'
  return (
    <div style={{
      alignSelf: isUser ? 'flex-end' : 'flex-start',
      maxWidth: '85%',
      padding: '10px 12px',
      borderRadius: 14,
      background: isUser ? INK : '#F2EDE4',
      color:      isUser ? '#FFFFFF' : INK,
      fontSize: 13, lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      border: isUser ? 'none' : `1.5px solid ${INK}22`,
    }}>{children}</div>
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
