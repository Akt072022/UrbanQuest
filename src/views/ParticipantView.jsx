import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { openChannel, sendMsg, subscribe, closeChannel, onStatus } from '../lib/session'
import {
  TOOLS, GATE_LABEL, DIMENSIONS, DIM_BY_ID,
  toolsForGate, toolsForGateDim, SKILL_LEVELS,
  scoreForGateDim,
} from '../data/tools'
import {
  CardStack, CardDeepModal, ProgressDots, RatingRow, DeckFooter,
  playTTS, stopTTS,
} from './ExploreView'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { SwipeWrap } from '../components/SwipeWrap'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)
const INK    = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL   = '#14B8A6'
const PAGE   = '#F2EDE4'
const CARD   = '#FFFDF8'
const GATE_COL = ['','#F97316','#3B82F6','#10B981','#8B5CF6']

const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

// Triage right-swipe rating zones — kept in sync with the same set
// used by the personal Explore deck so the gesture means the same
// thing whether the user is rating solo or in a workshop.
const TRIAGE_RIGHT_ZONES = [
  { threshold: 25,  label: 'READ ABOUT', hint: 'In theory only',  color: '#5A5550', value: 'theory' },
  { threshold: 80,  label: 'TRIED IT',   hint: 'A few times',     color: '#F97316', value: 'occasional' },
  { threshold: 140, label: 'I RUN IT',   hint: 'Routine practice', color: '#10B981', value: 'regular' },
]
const TRIAGE_LEFT_ZONE = { threshold: 60, value: 'new' }

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

// ── Connection-state pill — floats in the top-right corner ─────
// Was a full bar with the RECITY wordmark + session id, but for a
// participant who joined via QR / link there's nothing actionable
// in either string and the bar ate vertical space the cards needed.
// Reduced to just the live / connecting / offline chip, fixed to
// the corner so it stays visible without consuming layout height.
function Header({ status }) {
  const colour = status === 'live' ? '#10B981'
    : status === 'error' ? '#C0452A' : '#F97316'
  const bg = status === 'live' ? '#E6F4EC'
    : status === 'error' ? '#FCE8E2' : '#FFF4D8'
  const label = status === 'live' ? '● LIVE'
    : status === 'error' ? '⚠ OFFLINE' : '◌ CONNECTING…'
  return (
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
      right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
      padding: '4px 10px', borderRadius: 999,
      background: bg, border: `2px solid ${colour}`,
      fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
      color: colour, letterSpacing: '.06em',
      zIndex: 50,
      pointerEvents: 'none',
    }}>{label}</div>
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
          : 'The session opens as soon as the facilitator launches it. You can leave this page open. Your spot is reserved.'}
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
                width: 18, height: 18, borderRadius: '50%',
                background: d.color, border: `2px solid ${INK}`,
              }} />
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
      <ScrappyButton onClick={onFinish} color={allDone ? '#10B981' : YELLOW} full>
        {allDone ? 'SUBMIT MY ANSWERS →' : (totalTouched > 0 ? 'SUBMIT WHAT I HAVE →' : 'PASS, I HAVE NOTHING')}
      </ScrappyButton>
      <div style={{
        marginTop: 8, fontSize: 10, color: '#9C958A', textAlign: 'center', lineHeight: 1.45,
      }}>
        You can come back to evaluate more dimensions any time.
      </div>
    </div>
  )
}

// ── Tool deck — same CardStack as the solo board, with the new
//   single-tap RatingRow (Phase 2a). No swipe gestures, no modal.
function ToolDeck({ tools, gate, evals, skipped, onPick, onSkip, onDone }) {
  // Resume at the first tool the user hasn't yet evaluated nor skipped.
  const startIdx = tools.findIndex(t => !evals[t.n] && !skipped.includes(t.n))
  const [idx, setIdx]               = useState(Math.max(0, startIdx))
  // Dive-deeper opens a full-screen modal now (see CardDeepModal),
  // not a back-of-card flip. deepTool is null when closed.
  const [deepTool, setDeepTool]     = useState(null)
  const [lastAction, setLastAction] = useState(null)
  const [previewLevel, setPreviewLevel] = useState(null)

  // Close the modal on card change so a stale one doesn't sit over
  // the next tool.
  useEffect(() => { setDeepTool(null) }, [idx])

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
          background: '#E6F4EC', border: `3px solid #10B981`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#10B981" strokeWidth="3"
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

  // Single-tap rating, same as the solo board. Banner flashes for
  // Tap path: 700 ms beat so the user sees their choice land.
  // Swipe path: 0 ms because the SwipeWrap's exit animation is the
  // beat. lastAction is set together with the index advance inside
  // the setTimeout so the wrapper's slide-in keyframe only ever
  // applies to the new card; setting it before the key change
  // would compose with the SwipeWrap's exit translate on the same
  // node and leave the card stuck in a weird position.
  const handleRating = (id, source = 'tap') => {
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    if (id === 'new') {
      onSkip(tool)
    } else {
      onPick(tool, id)
    }
    const advance = () => {
      setLastAction(id === 'new' ? 'skip' : 'practice')
      setIdx(i => i + 1)
    }
    if (source === 'swipe') advance()
    else setTimeout(advance, 700)
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {/* Header — back button + phase / dimension eyebrow only.
          Counter, dots and prev/next live in the DeckFooter below
          the card. Matches the personal Explore deck. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 12,
      }}>
        <ScrappyButton onClick={onDone} color="#FFFFFF" size="sm">
          ← DONE
        </ScrappyButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
            color: GATE_COL[gate], letterSpacing: '.02em',
            lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{GATE_LABEL[gate]}</div>
          {tool.d?.[0] && DIM_BY_ID[tool.d[0]] && (
            <div style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
              color: DIM_BY_ID[tool.d[0]].color, marginTop: 3,
              letterSpacing: '.05em', textTransform: 'uppercase',
              lineHeight: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{DIM_BY_ID[tool.d[0]].label}</div>
          )}
        </div>
      </div>

      {/* Rating buttons ABOVE the card — also act as drop-zone
          previews during a right-swipe. */}
      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <RatingRow
          show={true}
          currentLevel={evals[tool.n] || null}
          currentSkipped={skipped.includes(tool.n)}
          previewLevel={previewLevel}
          onPick={handleRating} />
      </div>

      {/* Card — swipe shortcuts: left → "New to me", right → drag-to-rate.
          Ghost cards behind give the deck weight. */}
      <div style={{
        position: 'relative',
        display: 'flex', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <div key={idx}
          style={{
            position: 'relative',
            zIndex: 1,
            animation:
              lastAction === 'skip' || lastAction === 'next'
                ? 'card-from-right .22s cubic-bezier(.4,0,.2,1)'
                : lastAction === 'practice' || lastAction === 'prev'
                ? 'card-from-left .22s cubic-bezier(.4,0,.2,1)'
                : 'card-fade-in .18s ease-out',
            // Safari needs the GPU-layer hint to avoid mid-keyframe
            // freezes — see ExploreView for the full rationale.
            willChange: 'transform, opacity',
          }}>
          <SwipeWrap
            enabled={!deepTool}
            onSwipe={(value) => {
              setPreviewLevel(null)
              handleRating(value, 'swipe')
            }}
            onZoneChange={setPreviewLevel}
            leftZone={TRIAGE_LEFT_ZONE}
            rightZones={TRIAGE_RIGHT_ZONES}>
            <CardStack
              tool={tool} gate={gate}
              onDive={() => setDeepTool(tool)}
              alreadyLevel={evals[tool.n] || null}
              alreadySkipped={skipped.includes(tool.n)}
            />
          </SwipeWrap>
        </div>
      </div>

      {/* Footer — chevrons + dots + counter on one row below the
          card. Counter sits at the end of the dashes. Prev / next
          move the local cursor without committing. */}
      <DeckFooter
        idx={idx} total={tools.length}
        onPrev={() => { setLastAction('prev'); setIdx(i => Math.max(0, i - 1)) }}
        onNext={() => { setLastAction('next'); setIdx(i => Math.min(tools.length - 1, i + 1)) }} />

{/* Keyframes live in index.css now — see the matching note in
    ExploreView for why. */}

      {deepTool && (
        <CardDeepModal
          tool={deepTool} gate={gate}
          onClose={() => setDeepTool(null)} />
      )}
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
          color: '#10B981', letterSpacing: '.08em', textTransform: 'uppercase',
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
          { key: 'regular',    label: SKILL_LEVELS.regular.label,    col: '#10B981' },
          { key: 'occasional', label: SKILL_LEVELS.occasional.label, col: '#F97316' },
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
          background: '#E6F4EC', border: `3px solid #10B981`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
            <path d="M5 13l4 4L19 7" stroke="#10B981" strokeWidth="3"
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

  // Dive-deeper opens a full-screen modal now (see CardDeepModal),
  // which has its own internal scroll so the question screen below
  // can still be scrolled with the page.
  const [deepTool, setDeepTool] = useState(null)
  useEffect(() => { setDeepTool(null) }, [tool?.n])

  return (
    <div style={{ padding: '20px 16px' }}>
      {/* Question first — it's the action the facilitator is asking for */}
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        letterSpacing: '.08em', color: '#5A5550',
        textTransform: 'uppercase', marginBottom: 6,
      }}>Facilitator question</div>
      <p style={{
        fontSize: 17, fontWeight: 700, color: INK,
        lineHeight: 1.4, margin: '0 0 18px',
      }}>{question.text}</p>

      {/* Method card — same visual as the journey-board card so the
          participant has the full tool context (canvas thumb, dims,
          definition, tip) and can dive deeper for steps & refs. */}
      {tool && (
        <>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
            letterSpacing: '.08em', color: GATE_COL[gate] || '#5A5550',
            textTransform: 'uppercase', marginBottom: 8,
          }}>
            About the method{gate ? ` · ${GATE_LABEL[gate]}` : ''}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'center',
            marginBottom: 18,
          }}>
            <CardStack
              tool={tool} gate={gate || 1}
              onDive={() => setDeepTool(tool)}
            />
          </div>
        </>
      )}
      {deepTool && (
        <CardDeepModal
          tool={deepTool} gate={gate || 1}
          onClose={() => setDeepTool(null)} />
      )}

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
            ['Yes, priority',     '#10B981'],
            ['Maybe',             '#F97316'],
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

// ── Project method-fit deck ───────────────────────────────────
//   Same CardStack as triage, but the action row is a 4-way
//   priority picker. After picking, a small modal asks "How well
//   can you run it?" so the facilitator's matrix has both axes.
//   If the user has already triaged the same tool earlier this
//   session, the capability follow-up is skipped automatically.
// Display order — least → most priority, left → right. Matches the
// swipe direction (left swipe = skip, far-right swipe = essential)
// so the row above the card reads as the same axis as the gesture.
const FIT_OPTIONS = [
  { id: 'skip',      label: 'Not for it', hint: 'Skip',          col: '#9C958A' },
  { id: 'optional',  label: 'Optional',   hint: 'Nice to have',  col: '#F97316' },
  { id: 'helpful',   label: 'Helpful',    hint: 'Good to use',   col: '#3B82F6' },
  { id: 'essential', label: 'Essential',  hint: 'Must use',      col: '#10B981' },
]
const FIT_LEFT_ZONE  = { threshold: 60, value: 'skip' }
const FIT_RIGHT_ZONES = [
  { threshold: 25,  label: 'OPTIONAL',  hint: 'Nice to have', color: '#F97316', value: 'optional' },
  { threshold: 80,  label: 'HELPFUL',   hint: 'Good to use',  color: '#3B82F6', value: 'helpful' },
  { threshold: 140, label: 'ESSENTIAL', hint: 'Must use',     color: '#10B981', value: 'essential' },
]

// Fit-row counterpart of the RatingRow used by Explore / ToolDeck.
// 4 buttons above the card; the matching one highlights mid-drag
// from the SwipeWrap below. previewLevel beats currentLevel
// visually so a returning user can tell their previously-committed
// fit apart from the live drop-target preview.
function FitRatingRow({ show, currentLevel, onPick, previewLevel = null }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : 'translateY(12px)',
      pointerEvents: show ? 'auto' : 'none',
      transition: 'all .3s',
    }}>
      {FIT_OPTIONS.map(opt => {
        const isCommitted = currentLevel === opt.id
        const isPreview   = previewLevel === opt.id
        const filled      = isCommitted || isPreview
        return (
          <button key={opt.id}
            onClick={() => onPick(opt.id)}
            title={opt.hint}
            style={{
              display: 'flex', flexDirection: 'column',
              alignItems: 'stretch', justifyContent: 'center',
              padding: '8px 6px',
              background: filled ? opt.col : '#FFFFFF',
              color:      filled ? '#FFFFFF' : INK,
              border: `${isPreview ? 3 : 2.5}px solid ${INK}`,
              borderRadius: 12,
              cursor: 'pointer',
              boxShadow: isPreview
                ? '3px 3px 0 ' + INK
                : isCommitted
                ? '2px 2px 0 ' + INK
                : 'none',
              transform: isPreview
                ? 'translate(-1px,-2px) scale(1.04)'
                : isCommitted
                ? 'translate(-1px,-1px)'
                : 'none',
              transition: 'transform .08s, box-shadow .08s',
            }}>
            <span style={{
              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12,
              letterSpacing: '.04em', textTransform: 'uppercase',
              lineHeight: 1.05,
            }}>{opt.label}</span>
            <span style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
              fontWeight: 600, fontSize: 9,
              color: filled ? 'rgba(255,255,255,.85)' : '#9C958A',
              marginTop: 3, lineHeight: 1.2,
            }}>{opt.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

export function FitDeck({ tools, gate, project, fits, evals, onPick, onDone }) {
  const startIdx = tools.findIndex(t => !fits[t.n])
  const [idx, setIdx]               = useState(Math.max(0, startIdx))
  const [deepTool, setDeepTool]     = useState(null)
  const [pendingFit, setPendingFit] = useState(null)   // 'essential' | …
  const [lastAction, setLastAction] = useState(null)
  const [descExpanded, setDescExpanded] = useState(false)
  // Live drop-target during a horizontal drag — drives the
  // FitRatingRow above the card (same pattern as RatingRow's
  // previewLevel in ToolDeck and Explore).
  const [previewLevel, setPreviewLevel] = useState(null)

  useEffect(() => { setDeepTool(null); setPendingFit(null) }, [idx])

  if (!tools.length) {
    return (
      <div style={{
        padding: '40px 20px', textAlign: 'center',
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: '#5A5550', fontSize: 13 }}>
          No methods in this deck.
        </div>
      </div>
    )
  }

  if (idx >= tools.length) {
    // Final summary before submit
    const counts = FIT_OPTIONS.reduce((acc, o) => {
      acc[o.id] = tools.filter(t => fits[t.n] === o.id).length
      return acc
    }, {})
    return (
      <div style={{ padding: '24px 16px 32px' }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          color: '#5A5550', letterSpacing: '.08em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>Project method-fit</div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
          color: INK, lineHeight: 1.1, marginBottom: 14,
        }}>{project?.name || 'Project'}</div>
        <div style={{
          background: CARD, border: `2.5px solid ${INK}`,
          borderRadius: 14, padding: 14, boxShadow: '2px 2px 0 ' + INK,
          marginBottom: 16,
        }}>
          {FIT_OPTIONS.map(o => (
            <div key={o.id} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '6px 0',
              borderBottom: '1px solid #F0EBE4',
            }}>
              <span style={{ fontSize: 12, color: INK, fontWeight: 700 }}>
                {o.label} <span style={{ color: '#9C958A' }}>· {o.hint}</span>
              </span>
              <span style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16, color: o.col,
              }}>{counts[o.id]}</span>
            </div>
          ))}
        </div>
        <ScrappyButton onClick={onDone} color={YELLOW} full>
          SUBMIT MY FIT →
        </ScrappyButton>
      </div>
    )
  }

  const tool = tools[idx]
  const priorCap = evals[tool.n] || null

  // Setting lastAction together with the index advance keeps the
  // wrapper's slide-in keyframe on the new card — see the comment
  // in ToolDeck above for the full rationale.
  const advanceTap = () => {
    setTimeout(() => {
      setLastAction('practice')
      setIdx(i => i + 1)
    }, 300)
  }
  const advanceSwipe = () => {
    setLastAction('practice')
    setIdx(i => i + 1)
  }

  const pickFit = (fitId, source = 'tap') => {
    if (fitId === 'skip') {
      onPick(tool, 'skip', null)
      if (source === 'swipe') advanceSwipe()
      else advanceTap()
      return
    }
    if (priorCap) {
      onPick(tool, fitId, priorCap)
      if (source === 'swipe') advanceSwipe()
      else advanceTap()
      return
    }
    setPendingFit(fitId)
  }

  const commitWithCapability = (capability) => {
    onPick(tool, pendingFit, capability)
    setPendingFit(null)
    advanceTap()
  }

  const currentFit = fits[tool.n] || null
  const onSwipeCommit = (value) => {
    setPreviewLevel(null)
    pickFit(value, 'swipe')
  }

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {/* Header — same shape as the personal Explore deck and the
          Team-scan ToolDeck so the workshop's card-sorting flow
          reads as one consistent interface. The gate-coloured
          eyebrow names the workshop mode + parent phase, the title
          is the project name. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        marginBottom: 12,
      }}>
        <ScrappyButton onClick={onDone} color="#FFFFFF" size="sm">
          ← DONE
        </ScrappyButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
            color: GATE_COL[gate] || '#5A5550', letterSpacing: '.08em',
            textTransform: 'uppercase', lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>Method-fit · {GATE_LABEL[gate]}</div>
          <div style={{
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
            color: INK, letterSpacing: '.02em',
            lineHeight: 1.05, marginTop: 3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{project?.name || 'Project'}</div>
          {/* Project description toggle sits directly below the
              title — collapsed by default; one tap to read. */}
          {project?.desc && (
            <button onClick={() => setDescExpanded(e => !e)}
              style={{
                marginTop: 4, padding: 0,
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
                color: GATE_COL[gate] || INK,
                letterSpacing: '.06em', textTransform: 'uppercase',
                display: 'block', textAlign: 'left',
              }}>
              {descExpanded ? '▼ Hide project description' : '▶ Read project description'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded description strip — full width below the header. */}
      {project?.desc && descExpanded && (
        <div style={{
          marginBottom: 12,
          padding: '8px 10px',
          background: PAGE,
          border: `1.5px dashed ${INK}33`, borderRadius: 10,
          fontSize: 11, color: '#3F3A36', lineHeight: 1.4,
        }}>{project.desc}</div>
      )}

      {/* Fit-rating row ABOVE the card — also acts as drop-zone
          previews while the user is mid-swipe. */}
      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <FitRatingRow
          show={true}
          currentLevel={currentFit}
          previewLevel={previewLevel}
          onPick={pickFit} />
      </div>

      {/* Card — multi-zone right swipe (optional / helpful /
          essential), single left zone for "skip". Ghost cards behind
          give the deck weight. */}
      <div style={{
        position: 'relative',
        display: 'flex', justifyContent: 'center',
        marginBottom: 12,
      }}>
        <div key={idx} style={{
          position: 'relative',
          zIndex: 1,
          animation:
            lastAction === 'next'
              ? 'card-from-right .22s cubic-bezier(.4,0,.2,1)'
              : (lastAction === 'practice' || lastAction === 'prev')
              ? 'card-from-left .22s cubic-bezier(.4,0,.2,1)'
              : 'card-fade-in .18s ease-out',
          willChange: 'transform, opacity',
        }}>
          <SwipeWrap
            enabled={!deepTool && !pendingFit}
            onSwipe={onSwipeCommit}
            onZoneChange={setPreviewLevel}
            leftZone={FIT_LEFT_ZONE}
            rightZones={FIT_RIGHT_ZONES}>
            <CardStack
              tool={tool} gate={gate}
              onDive={() => setDeepTool(tool)}
              alreadyLevel={priorCap || null}
            />
          </SwipeWrap>
        </div>
      </div>

      {/* Footer — chevrons + dots + counter on one row below the
          card. Counter sits at the end of the dashes. */}
      <DeckFooter
        idx={idx} total={tools.length}
        onPrev={() => { setLastAction('prev'); setIdx(i => Math.max(0, i - 1)) }}
        onNext={() => { setLastAction('next'); setIdx(i => Math.min(tools.length - 1, i + 1)) }} />

      {/* Capability modal — opens when fit is picked but capability
          isn't already known from a prior triage. Buttons mirror the
          regular evaluation modal so the visual language stays the
          same for the participant. */}
      {pendingFit && (
        <FitCapabilityModal
          tool={tool}
          fit={pendingFit}
          onPick={commitWithCapability}
          onCancel={() => setPendingFit(null)} />
      )}

      {/* Dive-deeper modal */}
      {deepTool && (
        <CardDeepModal
          tool={deepTool} gate={gate}
          onClose={() => setDeepTool(null)} />
      )}
    </div>
  )
}

function FitCapabilityModal({ tool, fit, onPick, onCancel }) {
  const OPTIONS = [
    { level: 'regular',    label: 'I run it routinely',  col: '#10B981' },
    { level: 'occasional', label: 'I have run it sometimes', col: '#F97316' },
    { level: 'theory',     label: 'I know it in theory only', col: '#5A5550' },
    { level: null,         label: "I don't know it",     col: '#9C958A' },
  ]
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal((
    <div onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      role="dialog" aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(28,37,48,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, touchAction: 'manipulation',
      }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#FFFDF8', border: `3px solid ${INK}`,
        borderRadius: 18, padding: '20px 18px 16px',
        boxShadow: '4px 4px 0 ' + INK,
      }}>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          color: '#9C958A', letterSpacing: '.08em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>How well can you run it?</div>
        <div style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 18,
          color: INK, lineHeight: 1.2, marginBottom: 14,
        }}>{tool.n}</div>
        {OPTIONS.map((opt, i) => (
          <button key={i} type="button"
            onClick={() => onPick(opt.level)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '12px 14px', marginBottom: 10,
              background: '#FFFFFF',
              border: `2.5px solid ${INK}`, borderRadius: 14,
              cursor: 'pointer', boxShadow: '2px 2px 0 ' + INK,
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              pointerEvents: 'none',
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: '50%',
                background: opt.col, border: `2px solid ${INK}`,
              }} />
              <span style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
                color: INK, letterSpacing: '.04em', textTransform: 'uppercase',
              }}>{opt.label}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  ), document.body)
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
  // Project method-fit
  const [project, setProject]       = useState(null)         // { name, desc }
  const [fits, setFits]             = useState({})           // { toolName: 'essential'|'helpful'|'optional'|'skip' }
  // When the facilitator picked an AI-curated shortlist, the
  // methodfit_start payload carries an explicit `methodNames` array.
  // Otherwise we fall back to gate/dim filtering as before.
  const [sessionTools, setSessionTools] = useState(null)     // TOOL[] | null

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
      if (msg.type === 'methodfit_start') {
        const { gate, dim, project: proj, methodNames } = msg.payload
        const newGate = gate || 1
        const newDim  = dim  || 'all'
        const cur = stateRef.current
        // IDEMPOTENT: same project + (gate, dim) → ignore (heartbeat resync).
        const sameConfig = cur.sessionGate === newGate
                        && cur.sessionDim  === newDim
                        && cur.projectName === proj?.name
        const inMethodfit = cur.mode === 'methodfit' || cur.mode === 'methodfit_done'
        if (sameConfig && inMethodfit) return
        cur.projectName = proj?.name
        setSessionGate(newGate)
        setSessionDim(newDim)
        setProject(proj || null)
        // Resolve curated names against the local catalogue. Anything
        // we can't find is dropped so the deck never has phantom cards.
        if (Array.isArray(methodNames) && methodNames.length > 0) {
          const tools = methodNames
            .map(n => TOOLS.find(t => t.n === n))
            .filter(Boolean)
          setSessionTools(tools)
        } else {
          setSessionTools(null)
        }
        setMode('methodfit')
      }
      if (msg.type === 'reveal') setRevealed(true)
    })
    onStatus(ch, (status, err) => {
      if (status === 'SUBSCRIBED') {
        setChanStatus('live')
        // Catch-up burst: a single pong can be dropped during the
        // first second of a fresh broadcast channel. Send 4 pongs
        // staggered over the first 6 s so the facilitator gets one,
        // triggers broadcastState, and the participant reaches the
        // active view fast (worst case ~6 s instead of 12 s).
        const burst = [0, 1500, 3000, 4500]
        for (const delay of burst) {
          setTimeout(() => {
            if (channelRef.current) {
              sendMsg(channelRef.current,
                { type: 'pong', payload: { participantId: PARTICIPANT_ID } })
            }
          }, delay)
        }
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

  // Method-fit: each card emits { tool, fit, capability } when a
  // participant has picked both a project priority and a self-rated
  // capability. Capability falls back to a prior triage rating in this
  // session if the participant has already triaged the same tool.
  const handleFit = (tool, fit, capability) => {
    setFits(prev => ({ ...prev, [tool.n]: fit }))
    const finalCap = capability || evals[tool.n] || null
    sendMsg(channelRef.current, {
      type: 'methodfit_card',
      payload: {
        participantId: PARTICIPANT_ID,
        tool: tool.n,
        fit,
        capability: finalCap,
      },
    })
  }
  const handleFitDone = () => {
    sendMsg(channelRef.current, {
      type: 'methodfit_done',
      payload: { participantId: PARTICIPANT_ID },
    })
    setMode('methodfit_done')
  }

  // ── Tools for the active dim ──────────────────────────────
  const deckTools = activeDim
    ? toolsForGateDim(sessionGate, activeDim)
    : []

  // For method-fit, the deck is either the AI-curated shortlist sent
  // by the facilitator (sessionTools !== null) or the whole gate /
  // picked dim — same model as triage.
  const fitDeckTools = sessionTools && sessionTools.length > 0
    ? sessionTools
    : sessionDim === 'all'
      ? toolsForGate(sessionGate)
      : toolsForGateDim(sessionGate, sessionDim)

  return (
    <div style={{
      background: PAGE, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      color: INK, fontFamily: '-apple-system, Helvetica Neue, sans-serif',
    }}>
      <Header status={chanStatus} />
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

          {mode === 'methodfit' && (
            <FitDeck
              tools={fitDeckTools}
              gate={sessionGate}
              project={project}
              fits={fits}
              evals={evals}
              onPick={handleFit}
              onDone={handleFitDone} />
          )}

          {mode === 'methodfit_done' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center',
              padding: '40px 20px',
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#E6F4EC', border: `3px solid #10B981`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14,
              }}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#10B981" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
                color: INK, letterSpacing: '.04em', marginBottom: 6,
              }}>METHOD-FIT SUBMITTED</div>
              <div style={{ fontSize: 12, color: '#5A5550', maxWidth: 320, lineHeight: 1.5 }}>
                The facilitator now sees how the team weighs each method
                against {project?.name || 'this project'}.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
