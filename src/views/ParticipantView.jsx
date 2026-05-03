import { useState, useEffect, useRef } from 'react'
import { openChannel, sendMsg, subscribe, closeChannel, onStatus } from '../lib/session'
import {
  TOOLS, GATE_LABEL, DIMENSIONS, DIM_BY_ID,
  toolsForGate, toolsForGateDim, SKILL_LEVELS,
  scoreForGateDim,
} from '../data/tools'
import {
  CardStack, SwipeWrap, EvaluationModal, ProgressDots, ActionButtons,
  playTTS, stopTTS,
} from './ExploreView'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)
const INK    = '#1C2530'
const YELLOW = '#F5C84A'
const TEAL   = '#6FCBC9'
const PAGE   = '#F2EDE4'
const CARD   = '#FFFDF8'
const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

// Map skill level → legacy triage_card payload so the existing
// TriageHeatmap on the facilitator side still works without changes.
const LEVEL_TO_PAYLOAD = {
  regular:    { status: 'practiced', level: 5 },
  occasional: { status: 'practiced', level: 3 },
  theory:     { status: 'known',     level: 0 },
}

// ── Hexagonal mini-radar — same visual language as the map ────
function HexBadge({ gate, dimsData, size = 100 }) {
  const angles = [30, 90, 150, 210, 270, 330].map(a => a * Math.PI / 180)
  const RAD = size * 0.42
  const cx = size / 2, cy = size / 2
  const polyAt = (radii) => radii.map((r, i) => {
    const a = angles[i]
    return `${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`
  }).join(' ')
  const outerPts = polyAt(angles.map(() => RAD))
  const ratios = dimsData.map(d => d.total > 0 ? d.score / d.total : 0)
  const progressPts = polyAt(ratios.map(r => RAD * r))
  const col = GATE_COL[gate]
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block', overflow: 'visible' }}>
      <polygon points={outerPts}
        fill={CARD} stroke={INK} strokeWidth={3}
        strokeLinejoin="round" />
      {angles.map((a, i) => (
        <line key={i} x1={cx} y1={cy}
          x2={(cx + RAD * Math.sin(a)).toFixed(1)}
          y2={(cy - RAD * Math.cos(a)).toFixed(1)}
          stroke={INK} strokeWidth={1} opacity={0.18} />
      ))}
      <polygon points={progressPts}
        fill={col} fillOpacity={0.55}
        stroke={col} strokeWidth={2}
        strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={2.5} fill={INK} />
    </svg>
  )
}

// ── Header bar — RECITY wordmark + room + connection state ────
function Header({ roomId, status }) {
  // status: 'connecting' | 'live' | 'error'
  const colour = status === 'live' ? '#2A6B45'
    : status === 'error' ? '#C0452A' : '#C17B2A'
  const bg = status === 'live' ? '#E6F4EC'
    : status === 'error' ? '#FCE8E2' : '#FFF4D8'
  const label = status === 'live' ? '● LIVE'
    : status === 'error' ? '⚠ OFFLINE' : '◌ CONNECTING…'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '14px 16px',
      background: PAGE,
      borderBottom: `2px solid ${INK}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
          color: INK, letterSpacing: '.04em', lineHeight: 1,
        }}>RECITY</div>
        <div style={{ fontSize: 9, color: '#5A5550', fontWeight: 700, marginTop: 3 }}>
          Session {roomId} · #{PARTICIPANT_ID}
        </div>
      </div>
      <div style={{
        padding: '3px 10px', borderRadius: 999,
        background: bg, border: `2px solid ${colour}`,
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
        color: colour, letterSpacing: '.06em',
      }}>{label}</div>
    </div>
  )
}

// ── Waiting state ─────────────────────────────────────────────
function WaitingState({ status }) {
  const isError = status === 'error'
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: '40px 20px',
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: isError ? '#FCE8E2' : CARD,
        border: `3px solid ${isError ? '#C0452A' : INK}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 18,
        animation: isError ? 'none' : 'pulse-ink 2s ease-in-out infinite',
      }}>
        {isError ? (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
            <path d="M12 3l10 18H2L12 3z" stroke="#C0452A" strokeWidth="2"
              strokeLinejoin="round" fill="none" />
            <path d="M12 10v5M12 18v.01" stroke="#C0452A" strokeWidth="2.5"
              strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
            <circle cx="12" cy="12" r="9" stroke={INK} strokeWidth="2" />
            <path d="M12 7v5l3 2" stroke={INK} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
        color: isError ? '#C0452A' : INK,
        letterSpacing: '.04em', marginBottom: 6,
      }}>{isError ? 'CONNECTION FAILED' : 'WAITING FOR FACILITATOR'}</div>
      <div style={{
        color: '#5A5550', fontSize: 13, lineHeight: 1.45, maxWidth: 320,
      }}>
        {isError
          ? 'Couldn\'t reach the realtime server. Check the Wi-Fi and reload the page. If the problem persists, ask the facilitator to verify their Supabase Realtime settings.'
          : 'The session opens as soon as the facilitator launches it. You can leave this page open — your spot is reserved.'}
      </div>
      <style>{`
        @keyframes pulse-ink {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}

// ── Dimension picker (when sessionDim === 'all') ──────────────
//   Shows the gate's mini-radar + a list of dim cards. Each dim
//   shows the participant's local progress on that dim, and tapping
//   it opens the deck restricted to that dim.
function DimPicker({ gate, sessionDim, evals, skipped, onPickDim, onFinish }) {
  // For each dim: count tools touched (evaluated OR skipped)
  const dimRows = DIMENSIONS.map(d => {
    const tools = toolsForGateDim(gate, d.id)
    const total = tools.length
    const touched = tools.filter(t => evals[t.n] || skipped.includes(t.n)).length
    const score = scoreForGateDim(gate, d.id, evals)
    return { ...d, total, touched, score }
  })

  // Filter to allowed dims (if facilitator picked a single dim, only show it)
  const allowed = sessionDim === 'all'
    ? dimRows
    : dimRows.filter(d => d.id === sessionDim)

  // Build dimsData for the radar visual
  const dimsData = DIMENSIONS.map((d, i) => ({
    id: d.id,
    total: dimRows[i].total,
    score: dimRows[i].score,
  }))

  const totalTouched = dimRows.reduce((s, d) => s + d.touched, 0)
  const totalTools   = dimRows.reduce((s, d) => s + d.total, 0)
  const allDone = totalTouched >= totalTools

  return (
    <div style={{ padding: '20px 16px 32px' }}>
      {/* Hero — gate name + radar */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          color: GATE_COL[gate], letterSpacing: '.08em', textTransform: 'uppercase',
        }}>Workshop step</div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 28,
          color: INK, lineHeight: 1.1, letterSpacing: '.02em',
          margin: '4px 0 14px',
        }}>{GATE_LABEL[gate]}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
          <HexBadge gate={gate} dimsData={dimsData} size={140} />
        </div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
          color: INK,
        }}>
          {totalTouched}<span style={{ color: '#9C958A' }}>/{totalTools}</span>
          <span style={{ marginLeft: 6, fontSize: 11, color: '#5A5550' }}>
            tools evaluated
          </span>
        </div>
      </div>

      {/* Dimension list */}
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: INK, letterSpacing: '.08em', textTransform: 'uppercase',
        marginBottom: 8,
      }}>Pick a dimension to evaluate</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {allowed.map(d => {
          const pct = d.total > 0 ? Math.round((d.touched / d.total) * 100) : 0
          const done = d.touched >= d.total
          return (
            <button key={d.id}
              onClick={() => onPickDim(d.id)}
              disabled={d.total === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', textAlign: 'left',
                background: done ? `${d.color}15` : CARD,
                border: `2.5px solid ${done ? d.color : INK}`,
                borderRadius: 14,
                cursor: d.total === 0 ? 'default' : 'pointer',
                boxShadow: '2px 2px 0 ' + INK,
                width: '100%',
                opacity: d.total === 0 ? 0.5 : 1,
              }}>
              <div style={{
                flexShrink: 0,
                width: 30, height: 30, borderRadius: '50%',
                background: d.color, color: '#FFFFFF',
                border: `2px solid ${INK}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12,
              }}>{d.short}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 15,
                  color: INK, letterSpacing: '.04em', textTransform: 'uppercase',
                  lineHeight: 1.1,
                }}>{d.label}</div>
                <div style={{
                  marginTop: 4, height: 5, borderRadius: 3,
                  background: PAGE, overflow: 'hidden',
                }}>
                  <div style={{
                    width: pct + '%', height: '100%', background: d.color,
                    transition: 'width .4s',
                  }} />
                </div>
              </div>
              <div style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 13,
                color: done ? d.color : INK,
                flexShrink: 0,
              }}>{d.touched}<span style={{ color: '#9C958A' }}>/{d.total}</span></div>
            </button>
          )
        })}
      </div>

      {/* Submit / wrap-up */}
      <ScrappyButton onClick={onFinish} color={allDone ? '#2A6B45' : YELLOW} full>
        {allDone ? 'SUBMIT MY ANSWERS →' : (totalTouched > 0 ? 'SUBMIT WHAT I HAVE →' : 'PASS — I HAVE NOTHING')}
      </ScrappyButton>
      <div style={{
        marginTop: 8, fontSize: 10, color: '#9C958A', textAlign: 'center', lineHeight: 1.45,
      }}>
        You can come back to evaluate more dimensions any time.
      </div>
    </div>
  )
}

// ── Tool deck — wraps the same CardStack/SwipeWrap/EvaluationModal
//   used in the solo journey board so the workshop UX is identical.
function ToolDeck({ tools, gate, evals, skipped, onPick, onSkip, onDone }) {
  // Resume at the first tool the user hasn't yet evaluated nor skipped.
  const startIdx = tools.findIndex(t => !evals[t.n] && !skipped.includes(t.n))
  const [idx, setIdx]               = useState(Math.max(0, startIdx))
  const [face, setFace]             = useState('synth')
  const [pendingEval, setPendingEval] = useState(false)
  const [lastAction, setLastAction] = useState(null)

  // Reset card flip state when card changes
  useEffect(() => { setFace('synth'); setPendingEval(false) }, [idx])

  // Done with this dim's deck → bubble back up
  if (idx >= tools.length || tools.length === 0) {
    return (
      <div style={{
        padding: '40px 20px', textAlign: 'center',
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#E6F4EC', border: `3px solid #2A6B45`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#2A6B45" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
          color: INK, marginBottom: 18, letterSpacing: '.04em',
        }}>DIMENSION COMPLETE</div>
        <ScrappyButton onClick={onDone} color={YELLOW}>
          ← BACK TO DIMENSIONS
        </ScrappyButton>
      </div>
    )
  }

  const tool = tools[idx]

  const handleAction = (action) => {
    setLastAction(action)
    if (action === 'practice') {
      setPendingEval(true)
      return
    }
    if (action === 'skip') onSkip(tool)
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setIdx(i => i + 1)
  }

  const commit = (level) => {
    onPick(tool, level)
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setPendingEval(false)
    setIdx(i => i + 1)
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {/* Header — back to picker + counter + progress dots */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 12,
      }}>
        <ScrappyButton onClick={onDone} color={CARD} size="sm">
          ← DONE
        </ScrappyButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16,
            color: GATE_COL[gate], letterSpacing: '.04em',
            textTransform: 'uppercase', lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{GATE_LABEL[gate]}</div>
          {tool.d?.[0] && DIM_BY_ID[tool.d[0]] && (
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
              color: DIM_BY_ID[tool.d[0]].color, marginTop: 3,
              letterSpacing: '.04em', textTransform: 'uppercase',
            }}>{tools[0].d?.[0] && DIM_BY_ID[tool.d[0]].label}</div>
          )}
        </div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
          color: INK, flexShrink: 0,
        }}>{idx + 1}<span style={{ color: '#9C958A' }}>/{tools.length}</span></div>
      </div>
      <ProgressDots tools={tools} idx={idx} />

      {/* Card */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, marginBottom: 12 }}>
        <SwipeWrap
          enabled={face === 'synth'}
          onAction={handleAction}>
          <div key={idx}
            style={{
              animation: lastAction === 'skip'
                ? 'card-from-right .35s cubic-bezier(.4,1.4,.5,1)'
                : lastAction === 'practice'
                ? 'card-from-left .35s cubic-bezier(.4,1.4,.5,1)'
                : 'none',
            }}>
            <CardStack
              tool={tool} gate={gate} face={face}
              onDive={() => setFace('deep')}
              onBack={() => setFace('synth')}
              alreadyLevel={evals[tool.n] || null}
              alreadySkipped={skipped.includes(tool.n)}
            />
          </div>
        </SwipeWrap>
      </div>

      <ActionButtons show={face !== 'cover'} onAction={handleAction} />

      {pendingEval && (
        <EvaluationModal
          tool={tool}
          onPick={commit}
          onCancel={() => setPendingEval(false)}
        />
      )}
      <style>{`
        @keyframes card-from-left {
          from { transform: translateX(-110%) rotate(-4deg); opacity: 0; }
          to   { transform: translateX(0)     rotate(0);     opacity: 1; }
        }
        @keyframes card-from-right {
          from { transform: translateX(110%)  rotate(4deg);  opacity: 0; }
          to   { transform: translateX(0)     rotate(0);     opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── Final summary ─────────────────────────────────────────────
function SummaryState({ gate, evals, skipped }) {
  const tools = toolsForGate(gate)
  const counts = { regular: 0, occasional: 0, theory: 0, skipped: 0, untouched: 0 }
  for (const t of tools) {
    if (evals[t.n]) counts[evals[t.n]]++
    else if (skipped.includes(t.n)) counts.skipped++
    else counts.untouched++
  }
  return (
    <div style={{ padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          color: '#2A6B45', letterSpacing: '.08em', textTransform: 'uppercase',
        }}>Submitted</div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 28,
          color: INK, lineHeight: 1.1, marginTop: 6,
        }}>Thanks for contributing!</div>
        <div style={{
          color: '#5A5550', fontSize: 13, lineHeight: 1.45,
          maxWidth: 320, margin: '12px auto 0',
        }}>
          Your responses are now visible to the facilitator. They will
          guide the next steps of the discussion.
        </div>
      </div>
      <div style={{
        background: CARD, border: `2.5px solid ${INK}`,
        borderRadius: 14, padding: 14, boxShadow: '2px 2px 0 ' + INK,
      }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          color: INK, letterSpacing: '.06em', textTransform: 'uppercase',
          marginBottom: 10,
        }}>What you reported</div>
        {[
          { key: 'regular',    label: SKILL_LEVELS.regular.label,    col: '#2A6B45' },
          { key: 'occasional', label: SKILL_LEVELS.occasional.label, col: '#C17B2A' },
          { key: 'theory',     label: SKILL_LEVELS.theory.label,     col: '#5A5550' },
          { key: 'skipped',    label: 'Skipped',                     col: '#9C958A' },
          { key: 'untouched',  label: 'Not evaluated',               col: '#C8C0B8' },
        ].map(r => (
          <div key={r.key} style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid #F0EBE4',
          }}>
            <span style={{ fontSize: 12, color: INK, fontWeight: 700 }}>{r.label}</span>
            <span style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
              color: r.col,
            }}>{counts[r.key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Live Question — now shows the tool context so participants
//   know what the question is *about* before answering. ────────
function QuestionMode({ question, channel, answered, setAnswered, revealed }) {
  const [sliderVal, setSliderVal] = useState(3)
  const [wordVal, setWordVal] = useState('')

  const submitResponse = (value) => {
    if (!channel || answered) return
    sendMsg(channel, {
      type: 'response',
      payload: { participantId: PARTICIPANT_ID, value, questionId: question?.questionId },
    })
    setAnswered(true)
  }

  // Look up the actual tool record from the local TOOLS bundle so we
  // can display its dimensions, definition and tip — the broadcast
  // only carries the tool name to keep the payload small.
  const toolName = question?.tool
  const tool = toolName ? TOOLS.find(t => t.n === toolName) : null
  const gate = question?.gate

  if (answered) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        padding: '40px 20px',
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: '#E6F4EC', border: `3px solid #2A6B45`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#2A6B45" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
          color: INK, marginBottom: 6, letterSpacing: '.04em',
        }}>RESPONSE SENT</div>
        <div style={{ color: '#5A5550', fontSize: 12 }}>
          {revealed ? 'The facilitator is revealing the results…' : 'Waiting for others…'}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Tool context — name, dimensions, definition, tip */}
      {tool && (
        <div style={{
          background: CARD, border: `2.5px solid ${INK}`,
          borderRadius: 14, padding: '12px 14px',
          boxShadow: '2px 2px 0 ' + INK,
          marginBottom: 16,
        }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
            letterSpacing: '.08em', color: GATE_COL[gate] || INK,
            textTransform: 'uppercase', marginBottom: 4,
          }}>
            About this tool{gate ? ` · ${GATE_LABEL[gate]}` : ''}
          </div>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 17,
            color: INK, lineHeight: 1.15, marginBottom: 8,
          }}>{tool.n}</div>
          {tool.d?.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              marginBottom: 8,
            }}>
              {tool.d.map(did => {
                const d = DIM_BY_ID[did]
                if (!d) return null
                return (
                  <span key={did} style={{
                    padding: '2px 8px', borderRadius: 6,
                    background: d.color + '22', color: d.color,
                    fontFamily: FONT_HEAD, fontWeight: 900,
                    fontSize: 9, letterSpacing: '.04em',
                    textTransform: 'uppercase',
                  }}>{d.label}</span>
                )
              })}
            </div>
          )}
          {tool.def && (
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
              fontSize: 12, color: '#3F3A36', lineHeight: 1.45,
              margin: 0,
            }}>{tool.def}</p>
          )}
          {tool.t && (
            <div style={{
              marginTop: 10, padding: '8px 10px',
              background: YELLOW + '40', borderRadius: 8,
              border: `1.5px solid ${INK}`,
            }}>
              <div style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                color: INK, letterSpacing: '.06em',
                textTransform: 'uppercase', marginBottom: 4,
              }}>Practitioner tip</div>
              <div style={{
                fontSize: 12, color: '#3F3A36', lineHeight: 1.4,
              }}>{tool.t}</div>
            </div>
          )}
        </div>
      )}

      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        letterSpacing: '.08em', color: '#5A5550',
        textTransform: 'uppercase', marginBottom: 6,
      }}>Facilitator question</div>
      <p style={{
        fontSize: 17, fontWeight: 700, color: INK,
        lineHeight: 1.4, margin: '0 0 18px',
      }}>{question.text}</p>

      {question.type === 'slider' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            textAlign: 'center', padding: 14, borderRadius: 14,
            background: CARD, border: `2.5px solid ${INK}`,
            boxShadow: '2px 2px 0 ' + INK,
          }}>
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 56,
              color: INK, lineHeight: 1,
            }}>{sliderVal}</div>
            <div style={{ fontSize: 12, color: '#5A5550', marginTop: 4 }}>
              {['','Not ready','Slightly ready','In development','Ready','Very ready'][sliderVal]}
            </div>
          </div>
          <input type="range" min={0} max={5} value={sliderVal}
            onChange={e => setSliderVal(Number(e.target.value))}
            style={{ width: '100%', accentColor: INK, cursor: 'pointer' }} />
          <ScrappyButton onClick={() => submitResponse(sliderVal)} color={YELLOW} size="lg" full>
            SEND
          </ScrappyButton>
        </div>
      )}

      {question.type === 'word' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea value={wordVal} onChange={e => setWordVal(e.target.value)}
            placeholder="Your answer…" rows={4}
            style={{
              width: '100%', padding: 12, borderRadius: 12,
              background: CARD, border: `2.5px solid ${INK}`,
              color: INK, fontSize: 14, outline: 'none', resize: 'none',
              boxSizing: 'border-box',
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
            }} />
          <ScrappyButton
            onClick={() => submitResponse(wordVal)}
            color={wordVal.trim() ? YELLOW : '#E0DAD2'}
            size="lg" full>
            SEND
          </ScrappyButton>
        </div>
      )}

      {question.type === 'vote' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Yes, priority',     '#2A6B45'],
            ['Maybe',             '#C17B2A'],
            ['Not for this phase','#9C958A'],
          ].map(([opt, col]) => (
            <button key={opt} onClick={() => submitResponse(opt)}
              style={{
                padding: 14, background: CARD,
                border: `2.5px solid ${INK}`, borderRadius: 12,
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
                color: col, textAlign: 'left', letterSpacing: '.04em',
                cursor: 'pointer', boxShadow: '2px 2px 0 ' + INK,
              }}>{opt}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────
export function ParticipantView({ roomId }) {
  const [chanStatus, setChanStatus] = useState('connecting') // 'connecting' | 'live' | 'error'
  const [mode, setMode]             = useState('waiting')
  const [sessionGate, setSessionGate] = useState(1)
  const [sessionDim, setSessionDim] = useState('all')
  const [activeDim, setActiveDim]   = useState(null)
  // Local participant evaluations: { toolName: 'regular'|'occasional'|'theory' }
  const [evals, setEvals]           = useState({})
  const [skipped, setSkipped]       = useState([])
  // Live question state (existing flow)
  const [question, setQuestion]     = useState(null)
  const [answered, setAnswered]     = useState(false)
  const [revealed, setRevealed]     = useState(false)

  const channelRef = useRef(null)

  // Latest state mirrors so the subscribe handler reads fresh values
  // instead of the closure that was active when it was registered.
  const stateRef = useRef({ mode, sessionGate, sessionDim, qId: null })
  useEffect(() => {
    stateRef.current.mode        = mode
    stateRef.current.sessionGate = sessionGate
    stateRef.current.sessionDim  = sessionDim
  }, [mode, sessionGate, sessionDim])

  useEffect(() => {
    const ch = openChannel(roomId)
    channelRef.current = ch
    subscribe(ch, (msg) => {
      if (msg.type === 'ping') {
        sendMsg(ch, { type: 'pong', payload: { participantId: PARTICIPANT_ID } })
      }
      if (msg.type === 'triage_start') {
        const { gate, dim } = msg.payload
        const newGate = gate || 1
        const newDim  = dim  || 'all'
        const cur = stateRef.current
        // IDEMPOTENT: if we're already locked into this exact
        // (gate, dim) configuration, ignore — don't reset the deck.
        const sameConfig = cur.sessionGate === newGate && cur.sessionDim === newDim
        const inDeckOrPick = cur.mode === 'deck' || cur.mode === 'pick' || cur.mode === 'done'
        if (sameConfig && inDeckOrPick) return
        setSessionGate(newGate)
        setSessionDim(newDim)
        if (newDim !== 'all') {
          setActiveDim(newDim)
          setMode('deck')
        } else {
          setActiveDim(null)
          setMode('pick')
        }
      }
      if (msg.type === 'question') {
        // IDEMPOTENT: don't replay the same question (heartbeat).
        if (stateRef.current.qId === msg.payload.questionId &&
            stateRef.current.mode === 'question') return
        stateRef.current.qId = msg.payload.questionId
        setQuestion(msg.payload)
        setMode('question')
        setAnswered(false)
        setRevealed(false)
      }
      if (msg.type === 'reveal') setRevealed(true)
    })
    onStatus(ch, (status, err) => {
      if (status === 'SUBSCRIBED') {
        setChanStatus('live')
        // Announce ourselves once the channel is actually live so
        // the facilitator can resync us with the current state.
        sendMsg(ch, { type: 'pong', payload: { participantId: PARTICIPANT_ID } })
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setChanStatus('error')
        if (err) console.warn('[participant] channel error:', err)
      } else if (status === 'CLOSED') {
        setChanStatus('error')
      }
    })
    return () => { stopTTS(); closeChannel(ch) }
  }, [roomId])

  // Re-announce ourselves periodically so the facilitator always
  // knows we're alive, even if a previous pong was dropped.
  useEffect(() => {
    const id = setInterval(() => {
      if (channelRef.current && chanStatus === 'live') {
        sendMsg(channelRef.current, {
          type: 'pong',
          payload: { participantId: PARTICIPANT_ID },
        })
      }
    }, 12000)
    return () => clearInterval(id)
  }, [chanStatus])

  // ── Handlers passed to the deck ───────────────────────────
  const handlePick = (tool, level) => {
    setEvals(prev => ({ ...prev, [tool.n]: level }))
    const mapped = LEVEL_TO_PAYLOAD[level] || { status: 'practiced', level: 3 }
    sendMsg(channelRef.current, {
      type: 'triage_card',
      payload: {
        participantId: PARTICIPANT_ID,
        tool: tool.n,
        status: mapped.status,
        level:  mapped.level,
        skillLevel: level,
      },
    })
  }

  const handleSkip = (tool) => {
    setSkipped(prev => prev.includes(tool.n) ? prev : [...prev, tool.n])
    sendMsg(channelRef.current, {
      type: 'triage_card',
      payload: {
        participantId: PARTICIPANT_ID,
        tool: tool.n,
        status: 'unknown',
        level:  0,
        skillLevel: null,
      },
    })
  }

  const handleDeckDone = () => {
    setActiveDim(null)
    setMode('pick')
  }

  const handleSubmitFinal = () => {
    sendMsg(channelRef.current, {
      type: 'triage_done',
      payload: { participantId: PARTICIPANT_ID },
    })
    setMode('done')
  }

  // ── Tools for the active dim ──────────────────────────────
  const deckTools = activeDim
    ? toolsForGateDim(sessionGate, activeDim)
    : []

  return (
    <div style={{
      background: PAGE, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      color: INK, fontFamily: '-apple-system, Helvetica Neue, sans-serif',
    }}>
      <Header roomId={roomId} status={chanStatus} />
      {/* Centred content column — narrow on phones, comfortable on
          desktop without going full-width which would feel oversized. */}
      <div style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
      }}>
        <div style={{
          width: '100%', maxWidth: 540,
          display: 'flex', flexDirection: 'column', flex: 1,
        }}>
          {mode === 'waiting' && <WaitingState status={chanStatus} />}

          {mode === 'pick' && (
            <DimPicker
              gate={sessionGate}
              sessionDim={sessionDim}
              evals={evals}
              skipped={skipped}
              onPickDim={(dimId) => { setActiveDim(dimId); setMode('deck') }}
              onFinish={handleSubmitFinal} />
          )}

          {mode === 'deck' && (
            <ToolDeck
              tools={deckTools}
              gate={sessionGate}
              evals={evals}
              skipped={skipped}
              onPick={handlePick}
              onSkip={handleSkip}
              onDone={handleDeckDone} />
          )}

          {mode === 'done' && (
            <SummaryState gate={sessionGate} evals={evals} skipped={skipped} />
          )}

          {mode === 'question' && question && (
            <QuestionMode
              question={question}
              channel={channelRef.current}
              answered={answered}
              setAnswered={setAnswered}
              revealed={revealed} />
          )}
        </div>
      </div>
    </div>
  )
}
