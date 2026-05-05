import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { QRCode } from '../components/QRCode'
import { makeRoomId, openChannel, sendMsg, subscribe, participantUrl, onStatus } from '../lib/session'
import { TOOLS, GATE_LABEL, GATE_DESC, DIMENSIONS, DIM_BY_ID } from '../data/tools'
import { DIM_ICON } from '../data/dimIcons'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'
import { suggestMethods, hasMistral } from '../lib/mistral'
import { TriageHeatmap } from '../components/TriageHeatmap'
import { MethodfitMatrix } from '../components/MethodfitMatrix'
import { createSession, recordResponse, endSession } from '../lib/sessionStore'

const INK    = '#1C2530'
const YELLOW = '#FFC83D'
const TEAL   = '#14B8A6'
const CORAL  = '#FB7185'
const PAGE   = '#F2EDE4'
const CARD   = '#FFFDF8'
const GATE_COL = ['','#F97316','#3B82F6','#10B981','#8B5CF6']

const QUESTIONS = [
  { id: 'q1', text: 'What is your main blocker on this method?',         type: 'word' },
  { id: 'q2', text: 'How ready is your organization to adopt it?',       type: 'slider' },
  { id: 'q3', text: 'Should this method be prioritized for the next phase?', type: 'vote' },
]

const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

// ── Reusable shells with the project's "scrappy" identity ──────
const SectionCard = ({ children, style }) => (
  <div style={{
    background: CARD,
    border: `2.5px solid ${INK}`,
    borderRadius: 18,
    padding: '14px 14px 16px',
    boxShadow: '3px 3px 0 ' + INK,
    marginBottom: 14,
    ...style,
  }}>{children}</div>
)

const Eyebrow = ({ color = INK, children }) => (
  <div style={{
    fontFamily: FONT_HEAD,
    fontWeight: 900, fontSize: 11,
    letterSpacing: '.08em', textTransform: 'uppercase',
    color, marginBottom: 8,
  }}>{children}</div>
)

// ── Stacked progress bar w/ ink-style label ───────────────────
function ResponseBar({ label, value, max, col }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
          letterSpacing: '.04em', textTransform: 'uppercase', color: INK,
        }}>{label}</span>
        <span style={{
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 13, color: col,
        }}>{value}</span>
      </div>
      <div style={{
        height: 8, borderRadius: 999,
        background: PAGE, border: `1.5px solid ${INK}`, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: pct + '%', background: col,
          borderRight: pct > 0 && pct < 100 ? `1.5px solid ${INK}` : 'none',
          transition: 'width .4s',
        }} />
      </div>
    </div>
  )
}

// ── Hexagon glyph — small visual for the gate selector tiles ──
function GateGlyph({ gate, active }) {
  const RAD = 14
  const angles = [30, 90, 150, 210, 270, 330].map(a => a * Math.PI / 180)
  const pts = angles.map(a => `${(RAD * Math.sin(a)).toFixed(1)},${(-RAD * Math.cos(a)).toFixed(1)}`).join(' ')
  return (
    <svg width={RAD * 2 + 4} height={RAD * 2 + 4}
      viewBox={`${-RAD - 2} ${-RAD - 2} ${RAD * 2 + 4} ${RAD * 2 + 4}`}
      style={{ display: 'block', flexShrink: 0 }}>
      <polygon points={pts}
        fill={active ? GATE_COL[gate] : 'transparent'}
        stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

// ── Mode-picker icons — line art that matches the project's
//   hand-drawn ink language. All three render at the same visual
//   weight so the tiles read as siblings instead of competing.
//   `active` swaps the stroke colour so they remain legible against
//   the coloured tile background. ──────────────────────────────
function ModeIcon({ id, active, size = 28 }) {
  const c = active ? '#FFFFFF' : INK
  if (id === 'triage') {
    // Three stacked cards with a check on the front one — the
    // visual metaphor for sorting / triaging a deck.
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none"
        style={{ display: 'block' }}>
        {/* back card */}
        <rect x="9" y="5" width="13" height="16" rx="2"
          stroke={c} strokeWidth="1.8" strokeLinejoin="round"
          transform="rotate(8 15.5 13)" fill="none" />
        {/* middle card */}
        <rect x="6" y="6" width="13" height="16" rx="2"
          stroke={c} strokeWidth="1.8" strokeLinejoin="round"
          fill="none" />
        {/* front card */}
        <rect x="3" y="7" width="13" height="16" rx="2"
          stroke={c} strokeWidth="2" strokeLinejoin="round"
          fill="none" />
        {/* check mark on front */}
        <path d="M6 14.5 l2.4 2.4 L13 12"
          stroke={c} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    )
  }
  if (id === 'question') {
    // Speech bubble with a question mark inside.
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none"
        style={{ display: 'block' }}>
        <path d="M4 6 H24 V19 H13 L7 24 V19 H4 Z"
          stroke={c} strokeWidth="2" strokeLinejoin="round" fill="none" />
        <path d="M11 11 Q11 8 14 8 Q17 8 17 11 Q17 13 14 14"
          stroke={c} strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="14" cy="17" r="1" fill={c} />
      </svg>
    )
  }
  if (id === 'methodfit') {
    // Concentric target — the bullseye for project-fit.
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none"
        style={{ display: 'block' }}>
        <circle cx="14" cy="14" r="10" stroke={c} strokeWidth="2" fill="none" />
        <circle cx="14" cy="14" r="6"  stroke={c} strokeWidth="1.8" fill="none" />
        <circle cx="14" cy="14" r="2"  fill={c} />
        {/* hand-drawn cross-hair ticks at N, S, E, W */}
        <path d="M14 1.5 V4 M14 24 V26.5 M1.5 14 H4 M24 14 H26.5"
          stroke={c} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  return null
}

// ── Wizard summary row — label · value, used in Step 4 ────────
function SummaryRow({ label, value, col }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px',
      background: PAGE,
      border: `2px solid ${INK}`, borderRadius: 10,
    }}>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
        color: '#5A5550', letterSpacing: '.06em',
        textTransform: 'uppercase', flexShrink: 0, width: 96,
      }}>{label}</div>
      <div style={{
        flex: 1,
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14,
        color: col, letterSpacing: '.02em',
        textAlign: 'right',
      }}>{value}</div>
    </div>
  )
}

// ── Dim tile — picture-on-top selector for the wizard's Step 2.
//   Reuses the same illustrations the journey map shows on each
//   dim node so the two surfaces feel like the same product.
//   The "All" tile uses a 6-dot hexagon glyph instead of a single
//   illustration since it stands for the union. ────────────────
function DimTile({ active, color, label, iconSrc, dotGlyph, onClick }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-start', gap: 4,
        padding: '10px 4px 8px',
        background: active ? color : CARD,
        border: `2.5px solid ${INK}`,
        borderRadius: 12,
        cursor: 'pointer',
        boxShadow: active ? '2px 2px 0 ' + INK : 'none',
        transform: active ? 'translate(-1px,-1px)' : 'none',
        transition: 'transform .08s',
        minHeight: 96,
      }}>
      <div style={{
        width: 56, height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {iconSrc ? (
          <img src={iconSrc} alt=""
            draggable={false}
            style={{
              width: '100%', height: '100%',
              objectFit: 'contain',
              filter: active ? 'brightness(0) invert(1)' : 'none',
              userSelect: 'none', pointerEvents: 'none',
            }} />
        ) : (
          dotGlyph
        )}
      </div>
      <span style={{
        fontFamily: FONT_HEAD,
        fontWeight: 900, fontSize: 11,
        letterSpacing: '.04em', textTransform: 'uppercase',
        color: active ? '#FFFFFF' : INK, lineHeight: 1.05, textAlign: 'center',
      }}>{label}</span>
    </button>
  )
}

// Six-dot hexagon for the "All" tile. Each dot is the canonical
// dimension colour, so the meaning is "every lens at once".
function AllDimsGlyph({ active }) {
  const RAD = 18
  const dots = DIMENSIONS.map((d, i) => {
    const angle = (30 + i * 60) * Math.PI / 180
    return {
      cx: RAD * Math.sin(angle),
      cy: -RAD * Math.cos(angle),
      fill: active ? '#FFFFFF' : d.color,
    }
  })
  return (
    <svg width={56} height={56} viewBox="-28 -28 56 56" style={{ display: 'block' }}>
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={5}
          fill={d.fill}
          stroke={active ? '#FFFFFF' : INK}
          strokeWidth={1.5} />
      ))}
      <circle cx={0} cy={0} r={2.5} fill={active ? '#FFFFFF' : INK} />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────
// Main view
// ──────────────────────────────────────────────────────────────
export function FacilitatorView() {
  const {
    goMap, setSession, sessionId: savedRoomId,
    currentTeamId, userId,
  } = useStore(useShallow(s => ({
    goMap:         s.goMap,
    setSession:    s.setSession,
    sessionId:     s.sessionId,
    currentTeamId: s.currentTeamId,
    userId:        s.userId,
  })))

  const [roomId] = useState(savedRoomId || makeRoomId())
  const [started, setStarted] = useState(false)
  const [tab, setTab] = useState('triage')
  const [chanStatus, setChanStatus] = useState('idle') // 'idle' | 'connecting' | 'live' | 'error'

  const [filterGate, setFilterGate] = useState(1)
  const [filterDim,  setFilterDim]  = useState('all')

  // Pre-start wizard: 1 process step → 2 dimension+deck → 3 mode → 4 launch.
  // The session page (post-launch) still lets the facilitator switch
  // between modes — `initialMode` only seeds `tab` on launch.
  const [wizardStep, setWizardStep] = useState(1)
  const [initialMode, setInitialMode] = useState('triage')
  // Project method-fit needs a project context — collected on Step 4
  // when that mode is picked, broadcast as part of the methodfit_start
  // payload so participants see what they're rating against.
  const [projectName, setProjectName] = useState('')
  const [projectDesc, setProjectDesc] = useState('')

  // Method-fit responses & completion tracking (live session)
  const [methodfitResponses, setMethodfitResponses] = useState([])
  const [methodfitStarted,   setMethodfitStarted]   = useState(false)
  const [methodfitDone,      setMethodfitDone]      = useState([])

  // Mistral AI suggestions for the project — { tool, why } rows.
  // When `useAiDeck` is on, the active deck swaps from gate/dim filter
  // to the AI shortlist (sent to participants verbatim by name).
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [aiSugg,    setAiSugg]    = useState([])
  const [useAiDeck, setUseAiDeck] = useState(false)

  // Session state
  const [participants, setParticipants]     = useState([])
  const [triageResponses, setTriageResponses] = useState([])
  const [triageStarted, setTriageStarted]   = useState(false)
  const [triageDone,    setTriageDone]      = useState([])

  // Question mode
  const [responses,  setResponses]  = useState([])
  const [currentQ,   setCurrentQ]   = useState(QUESTIONS[0])
  const [revealed,   setRevealed]   = useState(false)
  const [activeTool, setActiveTool] = useState(null)
  // Free-form custom question
  const [customText, setCustomText] = useState('')
  const [customType, setCustomType] = useState('word') // 'word' | 'slider' | 'vote'

  const channelRef = useRef(null)
  // ID of the persisted workshop_sessions row for whichever mode is
  // currently active. recordResponse calls are no-ops while this is
  // null, so unsigned facilitators still get a working live UI
  // without persistence.
  const sessionDbIdRef = useRef(null)
  // All persisted sessions created during this view's lifetime —
  // collected so endSession can stamp `ended_at` on each when the
  // facilitator leaves.
  const allSessionIdsRef = useRef([])
  // Latest broadcastable state — read by the resync helpers below
  // without relying on stale closures inside subscribe().
  const stateRef = useRef({
    triageActive: false,
    gate: 1, dim: 'all',
    questionActive: false,
    question: null,
    methodfitActive: false,
    project: null,
  })
  const seenIdsRef = useRef(new Set())   // dedup pong → resync
  const url = participantUrl(roomId)

  // Filtered tool list — gate × dim by default. When the AI deck is
  // toggled on (Step 4 / methodfit), it overrides the filters with the
  // curated shortlist so every downstream UI (deck preview, launch
  // payload, results matrix) sees the same set.
  const baseToolList = TOOLS.filter(t => {
    const gateOk = t.g.includes(filterGate)
    const dimOk  = filterDim === 'all' || (t.d?.includes(filterDim))
    return gateOk && dimOk
  })
  const aiToolList = aiSugg.map(s => s.tool).filter(Boolean)
  const toolList = useAiDeck && aiToolList.length > 0
    ? aiToolList
    : baseToolList

  const runAiAnalysis = async () => {
    if (!projectName.trim()) return
    setAiLoading(true); setAiError(''); setAiSugg([])
    try {
      const out = await suggestMethods({ name: projectName, desc: projectDesc })
      if (out.length === 0) {
        setAiError('No matching methods returned. Try a longer description.')
      } else {
        setAiSugg(out)
        setUseAiDeck(true)   // opt the facilitator into the AI deck by default
      }
    } catch (e) {
      setAiError(e?.message || 'Analysis failed. Try again in a moment.')
    } finally {
      setAiLoading(false)
    }
  }

  // Push the current session state to anyone who reconnects or joins
  // late. Idempotent on the participant side so re-emitting is safe.
  const broadcastState = () => {
    const ch = channelRef.current
    if (!ch) return
    const s = stateRef.current
    if (s.triageActive) {
      sendMsg(ch, { type: 'triage_start', payload: { gate: s.gate, dim: s.dim } })
    }
    if (s.questionActive && s.question) {
      sendMsg(ch, { type: 'question', payload: s.question })
    }
    if (s.methodfitActive && s.project) {
      sendMsg(ch, { type: 'methodfit_start', payload: {
        gate: s.gate, dim: s.dim, project: s.project,
        methodNames: s.methodNames || null,
      } })
    }
  }

  const openChan = () => {
    const ch = openChannel(roomId)
    channelRef.current = ch
    subscribe(ch, (msg) => {
      if (msg.type === 'pong') {
        const id = msg.payload.participantId
        setParticipants(prev => prev.includes(id) ? prev : [...prev, id])
        // Resync the late-joiner immediately. Always rebroadcast on
        // first-seen pong; for known IDs (probably reconnect) also
        // rebroadcast — cheap insurance.
        const isNew = !seenIdsRef.current.has(id)
        seenIdsRef.current.add(id)
        if (stateRef.current.triageActive
         || stateRef.current.questionActive
         || stateRef.current.methodfitActive) {
          broadcastState()
        }
      }
      if (msg.type === 'triage_card') {
        setTriageResponses(prev => [...prev, msg.payload])
        recordResponse(sessionDbIdRef.current, {
          kind:              'triage',
          participantAnonId: msg.payload.participantId,
          toolName:          msg.payload.tool,
          payload: {
            status:     msg.payload.status,
            level:      msg.payload.level,
            skillLevel: msg.payload.skillLevel,
          },
        })
      }
      if (msg.type === 'triage_done') {
        setTriageDone(prev => prev.includes(msg.payload.participantId)
          ? prev : [...prev, msg.payload.participantId])
      }
      if (msg.type === 'response') {
        setResponses(prev => [...prev, msg.payload])
        recordResponse(sessionDbIdRef.current, {
          kind:              'question',
          participantAnonId: msg.payload.participantId,
          toolName:          stateRef.current.question?.tool || null,
          payload: {
            questionId: msg.payload.questionId,
            value:      msg.payload.value,
          },
        })
      }
      if (msg.type === 'methodfit_card') {
        setMethodfitResponses(prev => [...prev, msg.payload])
        recordResponse(sessionDbIdRef.current, {
          kind:              'methodfit',
          participantAnonId: msg.payload.participantId,
          toolName:          msg.payload.tool,
          payload: {
            fit:        msg.payload.fit,
            capability: msg.payload.capability,
          },
        })
      }
      if (msg.type === 'methodfit_done') {
        setMethodfitDone(prev => prev.includes(msg.payload.participantId)
          ? prev : [...prev, msg.payload.participantId])
      }
    })
    onStatus(ch, (status, err) => {
      if (status === 'SUBSCRIBED') {
        setChanStatus('live')
        // Channel just (re)connected — push a state tick so any
        // already-connected participant who missed the previous beat
        // is back in sync.
        broadcastState()
      } else if (status === 'CHANNEL_ERROR') setChanStatus('error')
      else if (status === 'TIMED_OUT')      setChanStatus('error')
      else if (status === 'CLOSED')         setChanStatus('idle')
      if (err) console.warn('[facilitator] channel error:', err)
    })
  }

  // Heartbeat — every 3 s, rebroadcast the current state if any
  // mode is active. Tightened from 8 s because participants who
  // joined late or had a brief drop felt the wait.
  useEffect(() => {
    if (!started) return
    const id = setInterval(() => {
      if (stateRef.current.triageActive
       || stateRef.current.questionActive
       || stateRef.current.methodfitActive) {
        broadcastState()
      }
    }, 3000)
    return () => clearInterval(id)
  }, [started])

  const startSession = () => {
    // Block launch if methodfit was picked but no project name typed.
    if (initialMode === 'methodfit' && !projectName.trim()) return
    // Seed the active tab with what the facilitator picked at step 3,
    // but keep the toggle on the session page so they can switch later.
    setTab(initialMode)
    // Switch the UI immediately so the user sees feedback even if the
    // realtime channel takes a moment to connect (or never does).
    setStarted(true)
    setChanStatus('connecting')
    setSession(roomId, 'facilitator')
    try {
      openChan()
      // ping is queued internally if not yet SUBSCRIBED
      sendMsg(channelRef.current, { type: 'ping' })
    } catch (err) {
      console.error('[facilitator] startSession failed:', err)
      setChanStatus('error')
    }
  }

  // Wrap createSession so every successfully-created session id is
  // recorded for cleanup. Returns the new id (or null on failure /
  // when the user is signed out).
  const trackedCreateSession = async (args) => {
    const id = await createSession(args)
    if (id) allSessionIdsRef.current.push(id)
    return id
  }

  const launchTriage = async () => {
    if (!channelRef.current) return
    setTriageResponses([])
    setTriageDone([])
    setTriageStarted(true)
    // Update the resync state so heartbeat/late-join re-pushes work.
    stateRef.current.triageActive = true
    stateRef.current.methodfitActive = false
    stateRef.current.gate = filterGate
    stateRef.current.dim  = filterDim
    // Persist a new workshop_sessions row for the team dashboard.
    // No-op when the facilitator is signed out (returns null).
    sessionDbIdRef.current = await trackedCreateSession({
      teamId:         currentTeamId,
      facilitatorId:  userId,
      roomId,
      mode:           'triage',
      gate:           filterGate,
      dim:            filterDim,
    })
    sendMsg(channelRef.current, {
      type: 'triage_start',
      payload: { gate: filterGate, dim: filterDim },
    })
  }

  const launchMethodfit = async () => {
    if (!channelRef.current) return
    if (!projectName.trim()) return
    setMethodfitResponses([])
    setMethodfitDone([])
    setMethodfitStarted(true)
    const project = { name: projectName.trim(), desc: projectDesc.trim() }
    // Curated AI deck overrides gate/dim — broadcast the explicit list
    // so participants see the same shortlist instead of inferring from
    // the gate filter.
    const methodNames = (useAiDeck && aiToolList.length > 0)
      ? aiToolList.map(t => t.n)
      : null
    stateRef.current.methodfitActive = true
    stateRef.current.triageActive    = false
    stateRef.current.gate    = filterGate
    stateRef.current.dim     = filterDim
    stateRef.current.project = project
    stateRef.current.methodNames = methodNames
    sessionDbIdRef.current = await trackedCreateSession({
      teamId:         currentTeamId,
      facilitatorId:  userId,
      roomId,
      mode:           'methodfit',
      gate:           filterGate,
      dim:            filterDim,
      project,
      methodNames,
    })
    sendMsg(channelRef.current, {
      type: 'methodfit_start',
      payload: { gate: filterGate, dim: filterDim, project, methodNames },
    })
  }

  const broadcast = async (q) => {
    if (!channelRef.current || !activeTool) return
    setCurrentQ(q)
    setResponses([])
    setRevealed(false)
    const payload = {
      questionId: q.id, text: q.text, type: q.type,
      tool: activeTool.n, gate: filterGate,
    }
    stateRef.current.questionActive = true
    stateRef.current.question = payload
    // First question of this Live Q workshop creates the persisted
    // session row. Subsequent questions append to the same row so the
    // session timeline holds them together.
    if (!stateRef.current.questionSessionDbId) {
      const dbId = await trackedCreateSession({
        teamId:         currentTeamId,
        facilitatorId:  userId,
        roomId,
        mode:           'question',
        gate:           filterGate,
        dim:            filterDim,
      })
      stateRef.current.questionSessionDbId = dbId
      sessionDbIdRef.current = dbId
    } else {
      sessionDbIdRef.current = stateRef.current.questionSessionDbId
    }
    sendMsg(channelRef.current, { type: 'question', payload })
  }

  const revealResults = () => {
    setRevealed(true)
    if (channelRef.current) sendMsg(channelRef.current, { type: 'reveal' })
  }

  const speakQ = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    window.speechSynthesis.speak(u)
  }

  const sliderAvg = responses.length
    ? (responses.reduce((a, r) => a + (Number(r.value) || 0), 0) / responses.length).toFixed(1)
    : '—'

  const wordFreq = {}
  responses.forEach(r => {
    String(r.value).toLowerCase().split(/\s+/).forEach(w => {
      if (w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1
    })
  })
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 8)

  useEffect(() => () => {
    channelRef.current?.close()
    // Stamp ended_at on every persisted session this view created.
    // Fire-and-forget: cleanup shouldn't block unmount.
    for (const id of allSessionIdsRef.current) endSession(id)
  }, [])

  // ── Pre-start wizard ───────────────────────────────────────────
  if (!started) {
    const STEP_LABELS = ['Process step', 'Design dimension', 'Mode', 'Launch']
    const totalMin = Math.ceil(toolList.length * 0.4)

    return (
      <div className="anim-fadein" style={{ padding: '6px 0 32px' }}>
        {/* Nav */}
        <ScrappyButton onClick={goMap} color={CARD} size="sm">← MAP</ScrappyButton>

        {/* Title */}
        <div style={{ marginTop: 18, marginBottom: 6 }}>
          <div style={{
            fontFamily: FONT_HEAD,
            fontWeight: 900, fontSize: 'clamp(36px,12vw,60px)',
            color: INK, lineHeight: .9, letterSpacing: '.005em',
          }}>NEW</div>
          <div style={{
            fontFamily: FONT_HEAD,
            fontWeight: 900, fontSize: 'clamp(36px,12vw,60px)',
            color: GATE_COL[filterGate], lineHeight: .9, letterSpacing: '.005em',
          }}>WORKSHOP</div>
        </div>

        {/* Wizard breadcrumb — 4 steps, current highlighted */}
        <div style={{
          display: 'flex', gap: 6, margin: '18px 0 14px', alignItems: 'center',
        }}>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
            const active = wizardStep === n
            const done   = wizardStep >  n
            return (
              <button key={n}
                onClick={() => { if (n < wizardStep) setWizardStep(n) }}
                disabled={n > wizardStep}
                style={{
                  flex: 1, padding: '7px 4px',
                  background: active ? INK : (done ? GATE_COL[filterGate] : CARD),
                  color: active || done ? '#FFFFFF' : '#9C958A',
                  border: `2px solid ${INK}`,
                  borderRadius: 999,
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 9,
                  letterSpacing: '.04em', textTransform: 'uppercase',
                  cursor: n < wizardStep ? 'pointer' : (active ? 'default' : 'not-allowed'),
                  boxShadow: active ? '2px 2px 0 ' + INK : 'none',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                {n}. {label}
              </button>
            )
          })}
        </div>

        {/* ── STEP 1 — Process step (gate) ──────────────────── */}
        {wizardStep === 1 && (
          <SectionCard>
            <Eyebrow color={GATE_COL[filterGate]}>Step 1 · Process step</Eyebrow>
            <div style={{ fontSize: 12, color: '#5A5550', marginBottom: 12, lineHeight: 1.45 }}>
              Which gate of the journey is this workshop about?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3,4].map(g => {
                const active = filterGate === g
                return (
                  <button key={g} onClick={() => setFilterGate(g)}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                      padding: '14px 16px', textAlign: 'left',
                      background: active ? GATE_COL[g] : CARD,
                      border: `2.5px solid ${INK}`,
                      borderRadius: 14,
                      cursor: 'pointer',
                      boxShadow: active ? '2px 2px 0 ' + INK : 'none',
                      transform: active ? 'translate(-1px,-1px)' : 'none',
                      transition: 'transform .08s',
                    }}>
                    <span style={{
                      flexShrink: 0,
                      width: 28, height: 28, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <GateGlyph gate={g} active={active} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 8,
                      }}>
                        <span style={{
                          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16,
                          letterSpacing: '.04em', textTransform: 'uppercase',
                          color: active ? '#FFFFFF' : INK, lineHeight: 1.1,
                        }}>{GATE_LABEL[g]}</span>
                        <span style={{
                          flexShrink: 0,
                          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                          letterSpacing: '.06em',
                          color: active ? 'rgba(255,255,255,.85)' : '#9C958A',
                        }}>STEP {g}</span>
                      </span>
                      <span style={{
                        display: 'block', marginTop: 6,
                        fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                        fontSize: 12, lineHeight: 1.4, fontWeight: 600,
                        color: active ? 'rgba(255,255,255,.92)' : '#5A5550',
                      }}>{GATE_DESC[g]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* ── STEP 2 — Design dimension + deck preview ───────── */}
        {wizardStep === 2 && (
          <>
            <SectionCard>
              <Eyebrow color={filterDim === 'all' ? INK : DIM_BY_ID[filterDim].color}>
                Step 2 · Design dimension <span style={{ color: '#9C958A' }}>(optional)</span>
              </Eyebrow>
              <div style={{ fontSize: 12, color: '#5A5550', marginBottom: 12, lineHeight: 1.45 }}>
                Narrow the deck to one lens — or keep "All" to triage every method in this gate.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                <DimTile
                  active={filterDim === 'all'}
                  color={INK}
                  label="All"
                  iconSrc={null}
                  dotGlyph={<AllDimsGlyph active={filterDim === 'all'} />}
                  onClick={() => setFilterDim('all')} />
                {DIMENSIONS.map(d => (
                  <DimTile key={d.id}
                    active={filterDim === d.id}
                    color={d.color}
                    label={d.label}
                    iconSrc={DIM_ICON[d.id] || null}
                    onClick={() => setFilterDim(d.id)} />
                ))}
              </div>
            </SectionCard>

            <SectionCard>
              <Eyebrow color={INK}>Deck preview</Eyebrow>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: 10,
              }}>
                <span style={{
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14, color: INK,
                  textTransform: 'uppercase', letterSpacing: '.04em',
                }}>
                  {GATE_LABEL[filterGate]}
                  {filterDim !== 'all' && (
                    <span style={{ color: DIM_BY_ID[filterDim].color, marginLeft: 8 }}>
                      · {DIM_BY_ID[filterDim].label}
                    </span>
                  )}
                </span>
                <span style={{
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22, color: GATE_COL[filterGate],
                }}>{toolList.length} tools</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {toolList.slice(0, 6).map(t => (
                  <ScrappyChip key={t.n} color={CARD} textColor={INK}>{t.n}</ScrappyChip>
                ))}
                {toolList.length > 6 && (
                  <ScrappyChip color={GATE_COL[filterGate]} textColor="#FFFFFF">
                    +{toolList.length - 6} more
                  </ScrappyChip>
                )}
              </div>
              <div style={{
                marginTop: 10, fontSize: 11, color: '#9C958A', fontStyle: 'italic',
              }}>
                ≈ {totalMin} min for participants to complete the deck.
              </div>
            </SectionCard>
          </>
        )}

        {/* ── STEP 3 — Mode picker ───────────────────────────── */}
        {wizardStep === 3 && (
          <SectionCard>
            <Eyebrow color={INK}>Step 3 · How will the workshop run?</Eyebrow>
            <div style={{ fontSize: 12, color: '#5A5550', marginBottom: 12, lineHeight: 1.45 }}>
              You can switch modes any time during the session.
            </div>
            <div style={{
              display: 'grid', gap: 10,
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            }}>
              {[
                { id: 'triage',
                  title: 'Collective triage',
                  desc:  'Each participant rates every method on their own phone. Live heatmap shows where the team converges or diverges.' },
                { id: 'question',
                  title: 'Live question',
                  desc:  'Pick one method at a time and broadcast a question. Free text / slider / 3-way vote — aggregated live.' },
                { id: 'methodfit',
                  title: 'Project method-fit',
                  desc:  'Pin a real project. Participants rate each method as Essential / Helpful / Optional — crossed with capability to surface train-vs-run gaps.' },
              ].map(m => {
                const active = initialMode === m.id
                return (
                  <button key={m.id} onClick={() => setInitialMode(m.id)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 14px',
                      background: active ? GATE_COL[filterGate] : CARD,
                      color: active ? '#FFFFFF' : INK,
                      border: `2.5px solid ${INK}`,
                      borderRadius: 14,
                      cursor: 'pointer',
                      boxShadow: active ? '3px 3px 0 ' + INK : '2px 2px 0 ' + INK + '33',
                      transform: active ? 'translate(-1px,-1px)' : 'none',
                      transition: 'transform .08s',
                    }}>
                    <div style={{ marginBottom: 8 }}>
                      <ModeIcon id={m.id} active={active} size={32} />
                    </div>
                    <div style={{
                      fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16,
                      letterSpacing: '.04em', textTransform: 'uppercase',
                      lineHeight: 1.1, marginBottom: 6,
                    }}>{m.title}</div>
                    <div style={{
                      fontSize: 12, lineHeight: 1.4,
                      color: active ? 'rgba(255,255,255,.92)' : '#5A5550',
                      fontWeight: 600,
                    }}>{m.desc}</div>
                  </button>
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* ── STEP 4 — Launch summary ────────────────────────── */}
        {wizardStep === 4 && (
          <SectionCard>
            <Eyebrow color={GATE_COL[filterGate]}>Step 4 · Ready to launch</Eyebrow>
            <div style={{
              display: 'grid', gap: 10, marginBottom: 16,
            }}>
              <SummaryRow label="Process step"
                value={GATE_LABEL[filterGate]} col={GATE_COL[filterGate]} />
              <SummaryRow label="Dimension"
                value={filterDim === 'all' ? 'All dimensions' : DIM_BY_ID[filterDim].label}
                col={filterDim === 'all' ? INK : DIM_BY_ID[filterDim].color} />
              <SummaryRow label="Initial mode"
                value={
                  initialMode === 'triage'    ? 'Collective triage'
                  : initialMode === 'question' ? 'Live question'
                  : 'Project method-fit'
                } col={INK} />
              <SummaryRow label="Deck"
                value={`${toolList.length} tools · ≈ ${totalMin} min`}
                col={INK} />
            </div>

            {/* Project context — only for the Project method-fit mode.
                Participants see the project name + description in the
                header of the deck while rating, so it's worth a few
                lines of explanation rather than a single placeholder. */}
            {initialMode === 'methodfit' && (
              <>
                <div style={{
                  background: PAGE,
                  border: `2px solid ${INK}`, borderRadius: 12,
                  padding: '12px 12px 10px',
                  marginBottom: 12,
                }}>
                  <div style={{
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                    color: INK, letterSpacing: '.06em',
                    textTransform: 'uppercase', marginBottom: 8,
                  }}>Project context</div>
                  <input
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Project name (e.g. Lyon Part-Dieu redesign)"
                    style={{
                      width: '100%', padding: '8px 10px', marginBottom: 8,
                      border: `2px solid ${INK}`, borderRadius: 10,
                      fontSize: 13, fontWeight: 700, color: INK,
                      background: '#FFFFFF', outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                    }} />
                  <textarea
                    value={projectDesc}
                    onChange={e => setProjectDesc(e.target.value)}
                    placeholder="One or two lines of context — site, ambition, key constraint."
                    rows={3}
                    style={{
                      width: '100%', padding: '8px 10px',
                      border: `2px solid ${INK}`, borderRadius: 10,
                      fontSize: 12, color: INK,
                      background: '#FFFFFF', outline: 'none', resize: 'none',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                    }} />
                </div>

                {/* AI shortlist — Mistral analyzes the project and
                    suggests 10-12 methods. Hidden if Mistral isn't
                    configured (no env key). The toggle below the
                    suggestions opts into using them as the deck. */}
                {hasMistral && (
                  <div style={{
                    background: CARD,
                    border: `2.5px solid ${INK}`, borderRadius: 14,
                    padding: '12px 12px 10px',
                    marginBottom: 14,
                    boxShadow: '2px 2px 0 ' + INK,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 8, marginBottom: 8,
                    }}>
                      <div style={{
                        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                        color: INK, letterSpacing: '.06em',
                        textTransform: 'uppercase',
                      }}>✨ AI shortlist</div>
                      {aiSugg.length > 0 && (
                        <span style={{
                          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                          color: TEAL,
                        }}>{aiSugg.length} methods</span>
                      )}
                    </div>

                    {aiSugg.length === 0 && (
                      <div style={{
                        fontSize: 11, color: '#5A5550', lineHeight: 1.45, marginBottom: 10,
                      }}>
                        Let the AI read your project description and
                        suggest the most relevant methods from the catalogue.
                      </div>
                    )}

                    <ScrappyButton
                      onClick={runAiAnalysis}
                      color={
                        aiLoading || !projectName.trim() || !projectDesc.trim()
                          ? '#E0DAD2' : TEAL
                      }
                      size="md" full>
                      {aiLoading ? 'ANALYZING…'
                        : aiSugg.length > 0 ? '↻ RE-ANALYZE'
                        : '✨ ANALYZE PROJECT'}
                    </ScrappyButton>

                    {aiError && (
                      <div style={{
                        marginTop: 8, padding: '6px 10px',
                        background: '#FCE8E2', border: `1.5px solid #C0452A`,
                        borderRadius: 8,
                        fontSize: 11, color: '#7A1F0E', lineHeight: 1.4,
                      }}>{aiError}</div>
                    )}

                    {aiSugg.length > 0 && (
                      <>
                        <div style={{
                          marginTop: 12,
                          display: 'grid', gap: 6,
                        }}>
                          {aiSugg.map(({ tool, why }) => (
                            <div key={tool.n} style={{
                              padding: '8px 10px',
                              background: PAGE,
                              border: `1.5px solid ${INK}33`, borderRadius: 10,
                            }}>
                              <div style={{
                                display: 'flex', alignItems: 'baseline',
                                justifyContent: 'space-between', gap: 8,
                              }}>
                                <span style={{
                                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 13,
                                  color: INK, letterSpacing: '.02em',
                                  flex: 1, minWidth: 0,
                                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>{tool.n}</span>
                                <span style={{
                                  flexShrink: 0, fontSize: 9, color: '#9C958A',
                                  fontWeight: 700, letterSpacing: '.04em',
                                  textTransform: 'uppercase',
                                }}>{(tool.g || []).map(g => GATE_LABEL[g]).join('/')}</span>
                              </div>
                              {why && (
                                <div style={{
                                  fontSize: 11, color: '#3F3A36',
                                  lineHeight: 1.4, marginTop: 4,
                                }}>{why}</div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Use AI deck toggle */}
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          marginTop: 12,
                          padding: '10px 12px',
                          background: useAiDeck ? '#E6F4EC' : PAGE,
                          border: `2px solid ${useAiDeck ? '#10B981' : INK}33`,
                          borderRadius: 10,
                          cursor: 'pointer',
                        }}>
                          <input type="checkbox"
                            checked={useAiDeck}
                            onChange={e => setUseAiDeck(e.target.checked)}
                            style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 12,
                              color: INK, letterSpacing: '.04em',
                              textTransform: 'uppercase', lineHeight: 1.1,
                            }}>Use this AI deck</div>
                            <div style={{
                              fontSize: 11, color: '#5A5550', marginTop: 2, lineHeight: 1.35,
                            }}>
                              {useAiDeck
                                ? `Participants will rate ${aiSugg.length} curated methods.`
                                : `Otherwise the gate/dim deck (${baseToolList.length} methods) is used.`}
                            </div>
                          </div>
                        </label>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <div style={{
              fontSize: 11, color: '#5A5550', lineHeight: 1.5,
              padding: '8px 10px', background: PAGE,
              border: `1.5px dashed ${INK}33`, borderRadius: 10,
              marginBottom: 14,
            }}>
              Once launched, the QR code and the join link will appear on the
              session page — share them with participants then.
            </div>
            <ScrappyButton
              onClick={startSession}
              color={
                initialMode === 'methodfit' && !projectName.trim()
                  ? '#E0DAD2' : YELLOW
              }
              size="lg" full>
              LAUNCH SESSION →
            </ScrappyButton>
          </SectionCard>
        )}

        {/* Wizard footer — Back / Next (Launch is in Step 4 above) */}
        {wizardStep < 4 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <ScrappyButton
              onClick={() => setWizardStep(s => Math.max(1, s - 1))}
              color={CARD} size="md" full>
              ← BACK
            </ScrappyButton>
            <ScrappyButton
              onClick={() => setWizardStep(s => s + 1)}
              color={YELLOW} size="md" full>
              NEXT →
            </ScrappyButton>
          </div>
        )}
        {wizardStep === 4 && (
          <ScrappyButton
            onClick={() => setWizardStep(s => s - 1)}
            color={CARD} size="md" full>
            ← BACK
          </ScrappyButton>
        )}
      </div>
    )
  }

  // ── Active session ─────────────────────────────────────────────
  return (
    <div className="anim-fadein" style={{ padding: '6px 0 32px' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <ScrappyButton onClick={goMap} color={CARD} size="sm">← MAP</ScrappyButton>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: FONT_HEAD,
            fontWeight: 900, fontSize: 18,
            color: INK, letterSpacing: '.06em', lineHeight: 1,
          }}>SESSION {roomId}</div>
          <div style={{ fontSize: 10, color: '#5A5550', fontWeight: 700, marginTop: 3 }}>
            {participants.length} connected
            {triageDone.length > 0 ? ' · ' + triageDone.length + ' completed' : ''}
          </div>
        </div>
        <div style={{
          padding: '4px 10px', borderRadius: 999,
          background: chanStatus === 'live' ? '#E6F4EC'
            : chanStatus === 'error' ? '#FCE8E2'
            : '#FFF4D8',
          border: `2px solid ${
            chanStatus === 'live' ? '#10B981'
            : chanStatus === 'error' ? '#C0452A'
            : '#F97316'}`,
          fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
          color: chanStatus === 'live' ? '#10B981'
            : chanStatus === 'error' ? '#C0452A'
            : '#F97316',
          letterSpacing: '.06em',
        }}>
          {chanStatus === 'live'       ? '● LIVE'
            : chanStatus === 'error'    ? '⚠ OFFLINE'
            : '◌ CONNECTING…'}
        </div>
      </div>

      {/* Channel error banner — surfaces the most common reason
          participants stay stuck on "waiting for facilitator" */}
      {chanStatus === 'error' && (
        <SectionCard style={{ marginBottom: 14, background: '#FCE8E2', borderColor: '#C0452A' }}>
          <Eyebrow color="#C0452A">⚠ Realtime channel failed</Eyebrow>
          <div style={{ fontSize: 12, color: INK, lineHeight: 1.5 }}>
            The session UI is open but messages aren't reaching
            participants. Most often: <b>Realtime is disabled</b> on the
            Supabase project, or <b>Private channels</b> require an auth
            policy. Open the project's Realtime settings and enable
            "Broadcast" without the private flag, then click{' '}
            <button onClick={() => { channelRef.current?.close(); openChan() }}
              style={{
                background: '#FFFFFF', border: `2px solid ${INK}`,
                borderRadius: 8, padding: '2px 8px', cursor: 'pointer',
                fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
                letterSpacing: '.04em', textTransform: 'uppercase',
              }}>retry</button>.
          </div>
        </SectionCard>
      )}

      {/* QR + URL — centred and capped on desktop so the facilitator
          can keep it on-screen for late joiners without it dominating. */}
      <SectionCard style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10,
        }}>
          <div style={{
            padding: 8, background: '#FFFFFF',
            border: `3px solid ${INK}`, borderRadius: 12,
            boxShadow: '2px 2px 0 ' + INK,
            width: '100%', maxWidth: 360,
          }}>
            <QRCode value={url} />
          </div>
          <div style={{ textAlign: 'center', width: '100%' }}>
            <Eyebrow color="#5A5550">Join via</Eyebrow>
            <div style={{
              fontSize: 11, color: INK, fontWeight: 600,
              wordBreak: 'break-all',
            }}>{url}</div>
          </div>
        </div>
      </SectionCard>

      {/* Tabs (scrappy pills) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['triage',    'TRIAGE'],
          ['question',  'LIVE Q'],
          ['methodfit', 'METHOD-FIT'],
        ].map(([id, label]) => {
          const active = tab === id
          return (
            <button key={id} onClick={() => setTab(id)}
              style={{
                flex: 1, padding: '9px 8px',
                background: active ? INK : CARD,
                color:      active ? '#FFFFFF' : INK,
                border: `2.5px solid ${INK}`,
                borderRadius: 999,
                fontFamily: FONT_HEAD,
                fontWeight: 900, fontSize: 12,
                letterSpacing: '.06em', textTransform: 'uppercase',
                cursor: 'pointer',
                boxShadow: active ? '2px 2px 0 ' + INK : 'none',
              }}>{label}</button>
          )
        })}
      </div>

      {/* ── TAB TRIAGE ────────────────────────────────────────── */}
      {tab === 'triage' && (
        <div>
          {!triageStarted ? (
            <>
              <SectionCard>
                <Eyebrow color={GATE_COL[filterGate]}>Selected deck</Eyebrow>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: 10, gap: 8,
                }}>
                  <span style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 900, fontSize: 14, color: INK,
                    textTransform: 'uppercase', letterSpacing: '.04em',
                  }}>
                    {GATE_LABEL[filterGate]}
                    {filterDim !== 'all' && (
                      <span style={{ color: DIM_BY_ID[filterDim].color, marginLeft: 8 }}>
                        · {DIM_BY_ID[filterDim].label}
                      </span>
                    )}
                  </span>
                  <span style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 900, fontSize: 22,
                    color: GATE_COL[filterGate], flexShrink: 0,
                  }}>{toolList.length}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {toolList.slice(0, 6).map(t => (
                    <ScrappyChip key={t.n} color={CARD} textColor={INK}>{t.n}</ScrappyChip>
                  ))}
                  {toolList.length > 6 && (
                    <ScrappyChip color={GATE_COL[filterGate]} textColor="#FFFFFF">
                      +{toolList.length - 6} more
                    </ScrappyChip>
                  )}
                </div>
              </SectionCard>

              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                fontSize: 12, color: '#5A5550', lineHeight: 1.55,
                marginBottom: 14, padding: '0 2px',
              }}>
                Each participant will rate the {toolList.length} tools as
                <strong> Unknown / Known / I practice (level 1-5)</strong>.
                Estimated duration: {Math.ceil(toolList.length * 0.4)} min.
              </p>

              <ScrappyButton
                onClick={launchTriage}
                color={participants.length === 0 ? '#E0DAD2' : YELLOW}
                size="lg" full>
                {participants.length === 0 ? 'WAITING FOR PARTICIPANTS…' : 'LAUNCH TRIAGE →'}
              </ScrappyButton>
            </>
          ) : (
            <>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 10,
              }}>
                <Eyebrow color="#10B981">● Triage in progress</Eyebrow>
                <button onClick={launchTriage}
                  style={{
                    padding: '5px 12px',
                    background: CARD, border: `2px solid ${INK}`,
                    borderRadius: 999,
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
                    letterSpacing: '.06em', color: INK,
                    cursor: 'pointer',
                  }}>RESTART</button>
              </div>
              <SectionCard>
                <TriageHeatmap
                  responses={triageResponses}
                  toolList={toolList}
                  participantCount={participants.length}
                />
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* ── TAB QUESTION ──────────────────────────────────────── */}
      {tab === 'question' && (
        <div>
          {/* Tool selection — select + rich preview pane */}
          <SectionCard>
            <Eyebrow color={INK}>Tool in discussion</Eyebrow>
            <select
              value={activeTool?.n || ''}
              onChange={e => {
                const t = TOOLS.find(t => t.n === e.target.value)
                setActiveTool(t || null)
              }}
              style={{
                width: '100%', padding: '10px 12px',
                background: PAGE, color: INK,
                border: `2px solid ${INK}`, borderRadius: 12,
                fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                fontSize: 13, fontWeight: 700, outline: 'none',
                appearance: 'none', WebkitAppearance: 'none',
                cursor: 'pointer',
                marginBottom: activeTool ? 12 : 0,
              }}>
              <option value="">— Choose a tool —</option>
              {toolList.map(t => <option key={t.n} value={t.n}>{t.n}</option>)}
              {filterDim !== 'all' && <option disabled>── All tools ──</option>}
              {filterDim !== 'all' && TOOLS.filter(t => !toolList.find(tl => tl.n === t.n))
                .map(t => <option key={t.n} value={t.n}>{t.n}</option>)}
            </select>

            {/* Preview — gives the facilitator enough context to pick
                the right tool without flipping screens. */}
            {activeTool && (
              <div style={{
                background: PAGE,
                border: `2px solid ${INK}`, borderRadius: 12,
                padding: '12px 14px',
              }}>
                <div style={{
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 16,
                  color: INK, lineHeight: 1.15, marginBottom: 8,
                }}>{activeTool.n}</div>
                {activeTool.d?.length > 0 && (
                  <div style={{
                    display: 'flex', flexWrap: 'wrap', gap: 4,
                    marginBottom: 8,
                  }}>
                    {activeTool.d.map(did => {
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
                {activeTool.def && (
                  <p style={{
                    fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                    fontSize: 12, color: '#3F3A36', lineHeight: 1.45,
                    margin: 0,
                  }}>{activeTool.def}</p>
                )}
                {activeTool.t && (
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
                    }}>{activeTool.t}</div>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Questions — 3 presets */}
          <SectionCard>
            <Eyebrow color={INK}>Send a quick question</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUESTIONS.map(q => {
                const active = currentQ.id === q.id
                return (
                  <div key={q.id} style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => broadcast(q)} disabled={!activeTool}
                      style={{
                        flex: 1, padding: '11px 12px', textAlign: 'left',
                        background: active ? '#FFF4D8' : (activeTool ? CARD : '#F5F1EB'),
                        border: `2px solid ${active ? '#F97316' : INK + '33'}`,
                        borderRadius: 12,
                        fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                        fontWeight: 700, fontSize: 13,
                        color: active ? '#7B4A12' : (activeTool ? INK : '#9C958A'),
                        cursor: activeTool ? 'pointer' : 'default',
                      }}>{q.text}</button>
                    <button onClick={() => speakQ(q.text)}
                      style={{
                        flexShrink: 0, width: 38, height: 38,
                        background: CARD, border: `2px solid ${INK}`, borderRadius: 12,
                        cursor: 'pointer', fontSize: 14,
                      }}>🔊</button>
                  </div>
                )
              })}
            </div>
            {!activeTool && (
              <div style={{
                fontSize: 11, fontStyle: 'italic',
                color: CORAL, marginTop: 8, fontWeight: 700,
              }}>
                Select a tool above first.
              </div>
            )}
          </SectionCard>

          {/* Custom question — free-form, with response-type chooser */}
          <SectionCard>
            <Eyebrow color={INK}>Or write your own</Eyebrow>
            <textarea value={customText}
              onChange={e => setCustomText(e.target.value)}
              placeholder="Type your question — participants receive it instantly along with the tool context."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px',
                background: PAGE, color: INK,
                border: `2px solid ${INK}`, borderRadius: 12,
                fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                fontSize: 13, fontWeight: 600, outline: 'none', resize: 'none',
                boxSizing: 'border-box', marginBottom: 8,
              }} />
            <div style={{
              fontSize: 10, color: '#5A5550', fontWeight: 700,
              letterSpacing: '.06em', textTransform: 'uppercase',
              marginBottom: 6,
            }}>Response type</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {[
                ['word',   'Free text'],
                ['slider', 'Slider 0-5'],
                ['vote',   '3-way vote'],
              ].map(([type, lbl]) => {
                const active = customType === type
                return (
                  <button key={type} onClick={() => setCustomType(type)}
                    style={{
                      flex: 1, padding: '8px 6px',
                      background: active ? INK : CARD,
                      color: active ? '#FFFFFF' : INK,
                      border: `2px solid ${INK}`, borderRadius: 999,
                      fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
                      letterSpacing: '.05em', textTransform: 'uppercase',
                      cursor: 'pointer',
                      boxShadow: active ? '2px 2px 0 ' + INK : 'none',
                    }}>{lbl}</button>
                )
              })}
            </div>
            <ScrappyButton
              onClick={() => {
                if (!customText.trim() || !activeTool) return
                broadcast({
                  id: 'custom-' + Date.now(),
                  text: customText.trim(),
                  type: customType,
                })
                setCustomText('')
              }}
              color={(activeTool && customText.trim()) ? YELLOW : '#E0DAD2'}
              size="md" full>
              SEND CUSTOM QUESTION →
            </ScrappyButton>
          </SectionCard>

          {/* Results */}
          <SectionCard>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 10,
            }}>
              <Eyebrow color={INK}>Responses ({responses.length})</Eyebrow>
              {responses.length > 0 && !revealed && (
                <ScrappyButton onClick={revealResults} color={YELLOW} size="sm">
                  REVEAL
                </ScrappyButton>
              )}
            </div>

            {currentQ.type === 'slider' && responses.length > 0 && (() => {
              // Only the preset readiness Q (q2) gets the readiness labels;
              // any other slider — including custom-typed ones — falls back
              // to neutral Low/Mid/High buckets so the categories don't
              // contradict the question wording.
              const isReadiness = currentQ.id === 'q2'
              const labelLow  = isReadiness ? 'Not ready (0-1)'      : 'Low (0-1)'
              const labelMid  = isReadiness ? 'In development (2-3)' : 'Mid (2-3)'
              const labelHigh = isReadiness ? 'Ready to adopt (4-5)' : 'High (4-5)'
              return (
                <div>
                  <div style={{
                    fontFamily: FONT_HEAD,
                    fontWeight: 900, fontSize: 56,
                    color: INK, textAlign: 'center', lineHeight: 1, marginBottom: 12,
                  }}>
                    {sliderAvg}
                    <span style={{ fontSize: 22, color: '#9C958A' }}>/5</span>
                  </div>
                  <ResponseBar label={labelLow}  value={responses.filter(r => r.value < 2).length}
                    max={responses.length} col={CORAL} />
                  <ResponseBar label={labelMid}  value={responses.filter(r => r.value >= 2 && r.value < 4).length}
                    max={responses.length} col="#F97316" />
                  <ResponseBar label={labelHigh} value={responses.filter(r => r.value >= 4).length}
                    max={responses.length} col="#10B981" />
                </div>
              )
            })()}

            {currentQ.type === 'word' && topWords.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {topWords.map(([word, count]) => (
                  <div key={word} style={{
                    padding: '4px 10px',
                    background: CARD, border: `2px solid ${INK}`, borderRadius: 999,
                    fontFamily: FONT_HEAD,
                    fontWeight: 900, fontSize: 10 + Math.min(count, 6) * 1.5,
                    color: INK, letterSpacing: '.04em', textTransform: 'uppercase',
                  }}>{word}<span style={{ color: '#9C958A', marginLeft: 4 }}>×{count}</span></div>
                ))}
              </div>
            )}

            {currentQ.type === 'vote' && responses.length > 0 && (() => {
              const opts = ['Yes, priority', 'Maybe', 'Not for this phase']
              const cols = [TEAL, '#F97316', '#9C958A']
              return opts.map((o, i) => (
                <ResponseBar key={o} label={o}
                  value={responses.filter(r => r.value === o).length}
                  max={responses.length} col={cols[i]} />
              ))
            })()}

            {responses.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '20px 0',
                color: '#9C958A', fontSize: 13, fontStyle: 'italic',
              }}>Waiting for responses…</div>
            )}
          </SectionCard>
        </div>
      )}

      {/* ── TAB METHOD-FIT ──────────────────────────────────────
          Like Triage, but participants rate methods against a
          named project. Results show a 2×2 of priority × team
          capability so the team can see what to run vs train. */}
      {tab === 'methodfit' && (
        <div>
          {!methodfitStarted ? (
            <>
              <SectionCard>
                <Eyebrow color={GATE_COL[filterGate]}>Project context</Eyebrow>
                <div style={{ marginBottom: 10 }}>
                  <input value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    placeholder="Project name"
                    style={{
                      width: '100%', padding: '9px 10px', marginBottom: 8,
                      border: `2px solid ${INK}`, borderRadius: 10,
                      fontSize: 13, fontWeight: 700, color: INK,
                      background: '#FFFFFF', outline: 'none',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                    }} />
                  <textarea value={projectDesc}
                    onChange={e => setProjectDesc(e.target.value)}
                    placeholder="One or two lines of context."
                    rows={2}
                    style={{
                      width: '100%', padding: '9px 10px',
                      border: `2px solid ${INK}`, borderRadius: 10,
                      fontSize: 12, color: INK,
                      background: '#FFFFFF', outline: 'none', resize: 'none',
                      boxSizing: 'border-box',
                      fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                    }} />
                </div>
              </SectionCard>

              <SectionCard>
                <Eyebrow color={GATE_COL[filterGate]}>Selected deck</Eyebrow>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: 10, gap: 8,
                }}>
                  <span style={{
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 14, color: INK,
                    textTransform: 'uppercase', letterSpacing: '.04em',
                  }}>
                    {GATE_LABEL[filterGate]}
                    {filterDim !== 'all' && (
                      <span style={{ color: DIM_BY_ID[filterDim].color, marginLeft: 8 }}>
                        · {DIM_BY_ID[filterDim].label}
                      </span>
                    )}
                  </span>
                  <span style={{
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 22,
                    color: GATE_COL[filterGate], flexShrink: 0,
                  }}>{toolList.length}</span>
                </div>
              </SectionCard>

              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                fontSize: 12, color: '#5A5550', lineHeight: 1.55,
                marginBottom: 14, padding: '0 2px',
              }}>
                Each participant will rate the {toolList.length} methods as
                <strong> Essential / Helpful / Optional / Skip </strong>
                for this project, and self-report their ability to run each.
              </p>

              <ScrappyButton
                onClick={launchMethodfit}
                color={
                  participants.length === 0 || !projectName.trim()
                    ? '#E0DAD2' : YELLOW
                }
                size="lg" full>
                {!projectName.trim()        ? 'NAME THE PROJECT FIRST'
                  : participants.length === 0 ? 'WAITING FOR PARTICIPANTS…'
                  : 'LAUNCH METHOD-FIT →'}
              </ScrappyButton>
            </>
          ) : (
            <>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 10,
              }}>
                <Eyebrow color="#10B981">
                  ● Method-fit · {projectName || 'Project'}
                </Eyebrow>
                <button onClick={launchMethodfit}
                  style={{
                    padding: '5px 12px',
                    background: CARD, border: `2px solid ${INK}`,
                    borderRadius: 999,
                    fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
                    letterSpacing: '.06em', color: INK,
                    cursor: 'pointer',
                  }}>RESTART</button>
              </div>
              <SectionCard>
                <MethodfitMatrix
                  responses={methodfitResponses}
                  toolList={toolList}
                  participantCount={participants.length}
                  doneCount={methodfitDone.length}
                />
              </SectionCard>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// (TriageHeatmap, MethodfitMatrix, and Quadrant moved to
//  src/components/ for reuse on the Team Dashboard.)
