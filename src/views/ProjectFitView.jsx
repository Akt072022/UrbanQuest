// Phase 1 of the UX revamp — the new value-first surface. The user
// arrives here right after telling the app what their project is;
// they see a concrete shortlist of methods picked for that project
// before they're ever asked to rate, sign in, or browse the
// catalogue. Everything else (journey, dashboard, workshops) is one
// link away but not the main course.
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton } from '../components/ScrappyButton'
import {
  TOOLS, GATE_LABEL, GATE_COLOR, DIM_BY_ID,
} from '../data/tools'
import { hasSupabase, sendMagicLink } from '../lib/supabase'
import { suggestMethods, hasMistral } from '../lib/mistral'

const INK    = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL   = '#14B8A6'
const PAGE   = '#F2EDE4'
const CARD   = '#FFFDF8'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

export function ProjectFitView() {
  const {
    projectContext, aiSuggestions,
    currentProjectId, updateCurrentProject,
    userEmail,
    goWelcome, goMap, goFacilitator, goDashboard,
    setProjectContext, setAiSuggestions,
  } = useStore(useShallow(s => ({
    projectContext: s.projectContext,
    aiSuggestions: s.aiSuggestions,
    currentProjectId:     s.currentProjectId,
    updateCurrentProject: s.updateCurrentProject,
    userEmail:      s.userEmail,
    goWelcome:      s.goWelcome,
    goMap:          s.goMap,
    goFacilitator:  s.goFacilitator,
    goDashboard:    s.goDashboard,
    setProjectContext: s.setProjectContext,
    setAiSuggestions:  s.setAiSuggestions,
  })))

  // Magic-link sign-in is offered AFTER the user has seen value,
  // not before. Hidden until the user opts in.
  const [authOpen, setAuthOpen] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authStatus, setAuthStatus] = useState('idle')
  const [authMsg, setAuthMsg] = useState('')

  // "Find more methods" — second pass on the AI shortlist that
  // appends 10-12 fresh picks excluding what's already shown.
  const [moreBusy, setMoreBusy] = useState(false)
  const [moreErr,  setMoreErr]  = useState('')
  const findMoreMethods = async () => {
    if (moreBusy || !projectContext) return
    setMoreBusy(true); setMoreErr('')
    try {
      const exclude = aiSuggestions.map(s => s.tool?.n).filter(Boolean)
      const more = await suggestMethods({
        name: projectContext.name,
        desc: projectContext.desc,
        exclude,
      })
      if (!more.length) {
        setMoreErr('No additional methods to suggest — try rephrasing the brief.')
      } else {
        const merged = [...aiSuggestions, ...more]
        // If a saved project is active, persist the appended list
        // through it so the bigger shortlist syncs to Supabase and
        // survives a reload. Falls back to the legacy mirror setter
        // for the unsaved-browse path (no current project yet).
        if (currentProjectId) {
          updateCurrentProject({ suggestions: merged })
        } else {
          setAiSuggestions(merged)
        }
      }
    } catch (err) {
      setMoreErr(err?.message || 'Could not fetch more methods.')
    } finally {
      setMoreBusy(false)
    }
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

  // No suggestions in store → bounce back to the welcome screen.
  // This protects against direct nav / stale state.
  if (!projectContext || aiSuggestions.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#5A5550', marginBottom: 18 }}>
          No project on file yet.
        </div>
        <ScrappyButton onClick={goWelcome} color={YELLOW}>
          ← Tell me about your project
        </ScrappyButton>
      </div>
    )
  }

  return (
    <div className="anim-fadein" style={{ paddingBottom: 32 }}>
      {/* ── Top bar — back to project input ───────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 18,
      }}>
        <ScrappyButton
          onClick={goWelcome}
          color="#FFFFFF" size="sm">
          ← MY PROJECTS
        </ScrappyButton>
        <div style={{ flex: 1 }} />
        {!userEmail && hasSupabase && !authOpen && (
          <button onClick={() => setAuthOpen(true)}
            style={{
              padding: '5px 12px', borderRadius: 999,
              background: 'transparent', border: `1.5px solid ${INK}33`,
              color: '#5A5550', cursor: 'pointer',
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
            Save these →
          </button>
        )}
      </div>

      {/* ── Hero — the value, front and centre ─────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 6,
      }}>
        <div style={{
          fontSize: 24, lineHeight: 1, marginTop: 4,
        }}>✨</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
            color: '#5A5550', letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}>Your method shortlist</div>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900,
            fontSize: 'clamp(28px, 8vw, 38px)',
            color: INK, lineHeight: 1.05, letterSpacing: '.005em',
            marginTop: 2,
          }}>
            {projectContext.name || 'Your project'}
          </div>
        </div>
      </div>
      {projectContext.desc && (
        <div style={{
          fontSize: 13, color: '#3F3A36', lineHeight: 1.5,
          margin: '10px 0 18px', padding: '10px 12px',
          background: PAGE, border: `1.5px dashed ${INK}33`,
          borderRadius: 12,
        }}>
          {projectContext.desc}
        </div>
      )}

      {/* ── Inline sign-in panel — only visible when opened */}
      {authOpen && !userEmail && (
        <div style={{
          background: CARD, border: `2.5px solid ${INK}`, borderRadius: 14,
          padding: 14, marginBottom: 18, boxShadow: '2px 2px 0 ' + INK,
        }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
            color: '#5A5550', letterSpacing: '.06em',
            textTransform: 'uppercase', marginBottom: 8,
          }}>Save your project</div>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <ScrappyButton type="button"
                onClick={() => setAuthOpen(false)}
                color="#FFFFFF" size="sm">
                LATER
              </ScrappyButton>
              <ScrappyButton type="submit"
                onClick={submitMagicLink}
                color={authStatus === 'sending' ? '#E0DAD2' : YELLOW}
                size="sm" full>
                {authStatus === 'sending' ? 'SENDING…'
                  : authStatus === 'sent'  ? 'EMAIL SENT ✓'
                  : 'SEND MAGIC LINK'}
              </ScrappyButton>
            </div>
            {authMsg && (
              <div style={{
                fontSize: 11,
                color: authStatus === 'error' ? '#C0452A' : '#10B981',
              }}>{authMsg}</div>
            )}
          </form>
        </div>
      )}

      {/* ── The shortlist ──────────────────────────────── */}
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: '#5A5550', letterSpacing: '.08em',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        {aiSuggestions.length} methods picked for this project
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        marginBottom: 14,
      }}>
        {aiSuggestions.map(({ tool, why }, i) => (
          <SuggestionCard key={tool.n} index={i + 1}
            tool={tool} why={why} />
        ))}
      </div>

      {/* ── Find-more — appends another 10-12 picks that don't
              overlap with what's already on the list. Hidden when
              Mistral isn't configured (the initial call would have
              failed too in that case). */}
      {hasMistral && (
        <div style={{ marginBottom: 18 }}>
          <button onClick={findMoreMethods}
            disabled={moreBusy}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: moreBusy ? '#E0DAD2' : 'transparent',
              border: `1.5px dashed ${INK}55`, borderRadius: 12,
              cursor: moreBusy ? 'default' : 'pointer',
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12,
              color: moreBusy ? '#9C958A' : INK,
              letterSpacing: '.06em', textTransform: 'uppercase',
            }}>
            {moreBusy ? '✨ Finding more methods…' : '+ Find more methods'}
          </button>
          {moreErr && (
            <div style={{
              marginTop: 8, padding: '6px 10px',
              background: '#FCE8E2', border: `1.5px solid #C0452A`,
              borderRadius: 8, fontSize: 11, color: '#7A1F0E', lineHeight: 1.4,
            }}>{moreErr}</div>
          )}
        </div>
      )}

      {/* ── Big "use these in a workshop" CTA ──────────── */}
      <ScrappyButton
        onClick={goFacilitator}
        color={YELLOW} size="lg" full>
        RUN THESE WITH MY TEAM →
      </ScrappyButton>
      <div style={{
        fontSize: 11, color: '#5A5550',
        textAlign: 'center', marginTop: 6, lineHeight: 1.5,
      }}>
        Opens a live workshop — your team scans a QR and rates
        these methods together, with results in real time.
      </div>

      {/* ── Secondary doors ─────────────────────────────── */}
      <div style={{
        marginTop: 24, paddingTop: 18,
        borderTop: `1px dashed ${INK}33`,
      }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
          color: '#9C958A', letterSpacing: '.08em',
          textTransform: 'uppercase', marginBottom: 8,
        }}>Or do something different</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SecondaryLink onClick={goMap}
            label="Browse all 133 methods" />
          <SecondaryLink onClick={goDashboard}
            label="See my capability map" />
        </div>
      </div>
    </div>
  )
}

// ── Single suggestion card ────────────────────────────────────
function SuggestionCard({ index, tool, why }) {
  const [expanded, setExpanded] = useState(false)
  const gate = tool.g?.[0] || 1
  const gateCol = GATE_COLOR[gate]

  return (
    <div style={{
      background: CARD, border: `2.5px solid ${INK}`,
      borderRadius: 14, padding: '12px 14px',
      boxShadow: '2px 2px 0 ' + INK,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 10, marginBottom: 4,
      }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
          color: gateCol, letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}>
          #{String(index).padStart(2, '0')} · {GATE_LABEL[gate]}
        </div>
        {tool.d?.length > 0 && (
          <div style={{
            display: 'flex', gap: 4, flexShrink: 0,
            flexWrap: 'wrap', justifyContent: 'flex-end',
          }}>
            {tool.d.slice(0, 3).map(did => {
              const d = DIM_BY_ID[did]
              if (!d) return null
              return (
                <span key={did} style={{
                  padding: '2px 7px', borderRadius: 5,
                  background: d.color + '22', color: d.color,
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}>{d.label}</span>
              )
            })}
          </div>
        )}
      </div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
        color: INK, lineHeight: 1.15, marginBottom: 8,
      }}>{tool.n}</div>
      {why && (
        <div style={{
          background: YELLOW + '40',
          border: `1.5px solid ${INK}33`, borderRadius: 8,
          padding: '8px 10px', marginBottom: expanded ? 12 : 8,
        }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
            color: INK, letterSpacing: '.06em',
            textTransform: 'uppercase', marginBottom: 3,
          }}>Why for this project</div>
          <div style={{
            fontSize: 12, color: '#3F3A36', lineHeight: 1.45,
          }}>{why}</div>
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 4 }}>
          {tool.def && (
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
              fontWeight: 700, fontSize: 12, color: '#3F3A36',
              lineHeight: 1.5, margin: '0 0 10px',
            }}>{tool.def}</p>
          )}
          {tool.t && (
            <div style={{
              padding: '8px 10px', background: PAGE,
              border: `1px solid ${INK}22`, borderRadius: 8,
              marginBottom: 10,
            }}>
              <div style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                color: INK, letterSpacing: '.06em',
                textTransform: 'uppercase', marginBottom: 3,
              }}>Practitioner tip</div>
              <div style={{
                fontSize: 12, color: '#3F3A36', lineHeight: 1.45,
              }}>{tool.t}</div>
            </div>
          )}
          {tool.duration && (
            <div style={{
              fontSize: 11, color: '#5A5550', lineHeight: 1.4,
            }}>
              <b style={{
                fontFamily: FONT_HEAD, fontSize: 9,
                letterSpacing: '.04em', color: gateCol,
              }}>DURATION · </b>
              {tool.duration}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setExpanded(e => !e)}
        style={{
          marginTop: 4, padding: 0,
          background: 'transparent', border: 'none',
          cursor: 'pointer',
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
          color: gateCol, letterSpacing: '.06em',
          textTransform: 'uppercase',
        }}>
        {expanded ? '▲ less' : '▼ more about this method'}
      </button>
    </div>
  )
}

// ── Secondary nav link ────────────────────────────────────────
function SecondaryLink({ onClick, label }) {
  return (
    <button onClick={onClick}
      style={{
        textAlign: 'left', padding: '8px 0',
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 13,
        color: INK, letterSpacing: '.04em',
        textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
      <span style={{ color: TEAL }}>›</span>
      {label}
    </button>
  )
}
