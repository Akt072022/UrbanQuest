import { useState, useEffect, useRef } from 'react'
import { openChannel, sendMsg, subscribe } from '../lib/session'
import { TOOLS, FAMILY_STYLE, GATE_LABEL, DIM_BY_ID } from '../data/tools'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)
const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']
const FREQ_LABELS = ['','Never','Rarely','Sometimes','Often','Always']

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'; u.rate = 0.95
  const en = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'))
  if (en) u.voice = en
  window.speechSynthesis.speak(u)
}

function gateRgba(g, a) {
  const m = { 1: '193,123,42', 2: '27,95,160', 3: '42,107,69', 4: '122,58,142' }
  return `rgba(${m[g]},${a})`
}

// ── Triage Deck ───────────────────────────────────────────────
function TriageDeck({ tools, gate, onComplete, channel }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState([]) // [{ n, status, level }]
  const [levelPick, setLevelPick] = useState(false)
  const [level, setLevel] = useState(3)
  const [leaving, setLeaving] = useState(null) // 'left'|'right' for animation

  const current = tools[index]
  const progress = index / tools.length

  const sendCard = (status, lvl = 0) => {
    const payload = { participantId: PARTICIPANT_ID, tool: current.n, status, level: lvl }
    sendMsg(channel, { type: 'triage_card', payload })
    const newAnswers = [...answers, { n: current.n, status, level: lvl }]
    setAnswers(newAnswers)
    setLevelPick(false)
    setLevel(3)
    if (index + 1 >= tools.length) {
      sendMsg(channel, { type: 'triage_done', payload: { participantId: PARTICIPANT_ID } })
      onComplete(newAnswers)
    } else {
      setIndex(i => i + 1)
    }
  }

  const col = GATE_COL[gate] || '#1B3D6F'
  const fam = FAMILY_STYLE?.[current.f] || { icon: '◻', bg: '#e5e7eb', text: '#374151' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {/* Progress */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          fontSize: '10px', fontWeight: 800, color: '#8B8074', marginBottom: '5px' }}>
          <span>COLLECTIVE TRIAGE</span>
          <span>{index + 1} / {tools.length}</span>
        </div>
        <div style={{ height: '4px', borderRadius: '2px', background: '#E0DAD2', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '2px',
            width: (progress * 100) + '%', background: col, transition: 'width .3s' }} />
        </div>
      </div>

      {/* Card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRadius: '16px',
        background: '#FFFFFF', border: '1px solid #E0DAD2',
        borderTop: '4px solid ' + col, padding: '18px',
        boxShadow: '0 2px 8px rgba(28,37,48,.07)' }}>

        {/* Dimension chips (multi) + fallback family tag */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 4,
          marginBottom: 10, alignSelf: 'flex-start',
        }}>
          {(current.d || []).map(did => {
            const d = DIM_BY_ID[did]
            if (!d) return null
            return (
              <span key={did} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 6,
                background: d.color + '15', color: d.color,
                fontSize: 10, fontWeight: 800,
                letterSpacing: '.03em',
              }}>{d.icon} {d.label}</span>
            )
          })}
          {(!current.d || current.d.length === 0) && (
            <span style={{
              padding: '3px 8px', borderRadius: 6,
              background: '#F5F1EB', border: '1px solid #E0DAD2',
              fontSize: 10, fontWeight: 700, color: '#5A5550',
            }}>{fam.icon} {current.f}</span>
          )}
        </div>

        {/* Name */}
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '20px', fontWeight: 700,
          color: '#1C2530', lineHeight: 1.2, marginBottom: '10px' }}>
          {current.n}
        </div>

        {/* Definition */}
        <p style={{ fontSize: '13px', color: '#5A5550', lineHeight: 1.55,
          flex: 1, marginBottom: '16px' }}>
          {current.def}
        </p>

        {/* TTS */}
        <button onClick={() => speak(current.n + '. ' + current.def)}
          style={{ alignSelf: 'flex-start', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: '11px', color: '#8B8074',
            fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px',
            marginBottom: '16px', padding: 0 }}>
          🔊 Listen
        </button>

        {/* Level picker (inline) */}
        {levelPick && (
          <div style={{ marginBottom: '14px', padding: '12px', borderRadius: '12px',
            background: '#EFF7F0', border: '1px solid #C3E6C9' }}>
            <div style={{ fontSize: '11px', fontWeight: 800, color: '#2A6B45',
              marginBottom: '8px' }}>Your practice level</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px',
              marginBottom: '6px' }}>
              {[1,2,3,4,5].map(l => (
                <button key={l} onClick={() => setLevel(l)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: '8px', cursor: 'pointer',
                    border: '2px solid ' + (level === l ? '#2A6B45' : '#C3E6C9'),
                    background: level === l ? '#2A6B45' : '#fff',
                    color: level === l ? '#fff' : '#2A6B45',
                    fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 900 }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#2A6B45', textAlign: 'center',
              fontStyle: 'italic', marginBottom: '10px' }}>{FREQ_LABELS[level]}</div>
            <button onClick={() => sendCard('practiced', level)}
              style={{ width: '100%', padding: '11px', borderRadius: '10px', cursor: 'pointer',
                background: '#2A6B45', color: '#fff', border: 'none',
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 900 }}>
              CONFIRM LEVEL {level}/5
            </button>
          </div>
        )}

        {/* Action buttons */}
        {!levelPick && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => sendCard('unknown')}
              style={{ flex: 1, padding: '13px 6px', borderRadius: '10px', cursor: 'pointer',
                background: '#F5F1EB', border: '1px solid #E0DAD2',
                color: '#8B8074', fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: '13px', fontWeight: 900 }}>
              Unknown
            </button>
            <button onClick={() => sendCard('known')}
              style={{ flex: 1, padding: '13px 6px', borderRadius: '10px', cursor: 'pointer',
                background: '#FFF4E0', border: '1px solid #C17B2A44',
                color: '#C17B2A', fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: '13px', fontWeight: 900 }}>
              I know it
            </button>
            <button onClick={() => setLevelPick(true)}
              style={{ flex: 1, padding: '13px 6px', borderRadius: '10px', cursor: 'pointer',
                background: '#EFF7F0', border: '1px solid #2A6B4544',
                color: '#2A6B45', fontFamily: 'Barlow Condensed, sans-serif',
                fontSize: '13px', fontWeight: 900 }}>
              I practice it
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Triage Summary ────────────────────────────────────────────
function TriageSummary({ answers }) {
  const practiced = answers.filter(a => a.status === 'practiced')
  const known     = answers.filter(a => a.status === 'known')
  const unknown   = answers.filter(a => a.status === 'unknown')

  return (
    <div className="anim-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="text-mega" style={{ fontSize: '32px', color: '#2A6B45', marginBottom: '4px' }}>
        TRIAGE COMPLETE
      </div>
      <p style={{ fontSize: '13px', color: '#8B8074', marginBottom: '20px' }}>
        Your responses have been sent to the facilitator.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' }}>
        {[[practiced.length,'Practiced','#2A6B45','#EFF7F0'],
          [known.length,'Known','#C17B2A','#FFF4E0'],
          [unknown.length,'Unknown','#8B8074','#F5F1EB']].map(([n,l,col,bg]) => (
          <div key={l} style={{ padding: '10px 6px', borderRadius: '10px', textAlign: 'center',
            background: bg, border: '1px solid ' + col + '33' }}>
            <div className="text-mega" style={{ fontSize: '22px', color: col }}>{n}</div>
            <div style={{ fontSize: '9px', color: col, fontWeight: 700, textTransform: 'uppercase' }}>{l}</div>
          </div>
        ))}
      </div>
      {practiced.length > 0 && (
        <div style={{ padding: '12px', borderRadius: '12px', background: '#FFFFFF',
          border: '1px solid #E0DAD2' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', marginBottom: '8px' }}>What you practice</div>
          {practiced.map(a => (
            <div key={a.n} style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '6px 0',
              borderBottom: '1px solid #F5F1EB' }}>
              <span style={{ fontSize: '12px', color: '#1C2530', fontWeight: 600 }}>{a.n}</span>
              <span style={{ fontSize: '11px', color: '#2A6B45', fontWeight: 800 }}>
                Level {a.level}/5
              </span>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: '11px', color: '#B0A898', marginTop: '16px', lineHeight: 1.5,
        fontStyle: 'italic' }}>
        The facilitator will now analyse the results and lead an in-depth discussion on selected tools.
      </p>
    </div>
  )
}

// ── Method Card (mode question) ───────────────────────────────
function MethodCard({ toolName, gate }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('def')
  const tool = TOOLS.find(t => t.n === toolName)
  if (!tool) return null

  const fam = FAMILY_STYLE[tool.f] || { icon: '?' }
  const col = GATE_COL[gate] || '#1B3D6F'
  const gateUsage = tool.gu?.[gate]

  return (
    <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '14px',
      border: '1px solid #E0DAD2', background: '#FFFFFF' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center',
          gap: '10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          background: col, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: '13px', color: '#fff' }}>
          {gate}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700,
            color: '#1C2530', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tool.n}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
            {(tool.d || []).slice(0, 3).map(did => {
              const d = DIM_BY_ID[did]
              if (!d) return null
              return (
                <span key={did} style={{
                  fontSize: 9, fontWeight: 800,
                  padding: '1px 5px', borderRadius: 5,
                  background: d.color + '15', color: d.color,
                }}>{d.icon} {d.short}</span>
              )
            })}
          </div>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#1B3D6F', flexShrink: 0,
          padding: '3px 8px', borderRadius: '6px', background: '#E8EDF5' }}>
          {open ? '▲' : 'CARD ▼'}
        </div>
      </button>

      {gateUsage && (
        <div style={{ margin: '0 12px 10px', padding: '8px 10px', borderRadius: '8px',
          background: gateRgba(gate, .07), borderLeft: '3px solid ' + col }}>
          <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '.05em', color: col, marginBottom: '2px' }}>Usage · {GATE_LABEL[gate]}</div>
          <p style={{ fontSize: '12px', color: '#1C2530', lineHeight: 1.45, margin: 0 }}>{gateUsage}</p>
        </div>
      )}

      {open && (
        <div style={{ borderTop: '1px solid #E8E3DA' }}>
          <div style={{ display: 'flex' }}>
            {[['def','DEFINITION'],['usages','USE CASES']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex: 1, padding: '8px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '10px', fontWeight: 800,
                  color: tab === id ? '#1B3D6F' : '#8B8074',
                  borderBottom: tab === id ? '2px solid #1B3D6F' : '2px solid transparent' }}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'def' && (
            <div style={{ padding: '12px' }}>
              <p style={{ fontSize: '13px', color: '#4A4540', lineHeight: 1.55, marginBottom: '10px' }}>
                {tool.def}
              </p>
              {tool.t && (
                <div style={{ padding: '8px 10px', borderRadius: '8px',
                  background: '#EFF7F0', border: '1px solid #C3E6C9' }}>
                  <div style={{ fontSize: '9px', fontWeight: 800, color: '#2A6B45',
                    textTransform: 'uppercase', marginBottom: '3px' }}>Practitioner tip</div>
                  <p style={{ fontSize: '12px', color: '#2A6B45', lineHeight: 1.45, margin: 0 }}>{tool.t}</p>
                </div>
              )}
              <button onClick={() => speak(tool.n + '. ' + tool.def)}
                style={{ marginTop: '10px', width: '100%', padding: '8px', borderRadius: '8px',
                  cursor: 'pointer', background: '#F5F1EB', border: '1px solid #E0DAD2',
                  color: '#6B6460', fontSize: '11px', fontWeight: 800 }}>
                🔊 READ ALOUD
              </button>
            </div>
          )}
          {tab === 'usages' && (
            <div style={{ padding: '12px' }}>
              {tool.g.filter(g => tool.gu?.[g]).map(g => (
                <div key={g} style={{ display: 'flex', gap: '8px', marginBottom: '8px',
                  padding: '8px', borderRadius: '8px',
                  background: g === gate ? gateRgba(g, .07) : '#F5F1EB',
                  border: '1px solid ' + (g === gate ? GATE_COL[g] + '44' : '#E0DAD2') }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                    background: GATE_COL[g], display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '9px', fontWeight: 900, color: '#fff' }}>{g}</div>
                  <p style={{ fontSize: '11px', color: g === gate ? '#1C2530' : '#8B8074',
                    lineHeight: 1.4, margin: 0 }}>{tool.gu[g]}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Question widgets ──────────────────────────────────────────
function SliderWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ textAlign: 'center', padding: '14px', borderRadius: '12px',
        background: '#FFFFFF', border: '1px solid #E0DAD2' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: '64px', color: '#1B3D6F', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '12px', color: '#8B8074', marginTop: '2px' }}>
          {['','Not ready','Slightly ready','In development','Ready','Very ready'][value]}
        </div>
      </div>
      <input type="range" min={0} max={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#1B3D6F', cursor: 'pointer' }} />
      <button onClick={() => onSubmit(value)}
        style={{ padding: '16px', borderRadius: '12px', cursor: 'pointer',
          background: '#1B3D6F', color: '#fff', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 900 }}>
        SEND
      </button>
    </div>
  )
}

function WordWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        placeholder="Your answer…" rows={4}
        style={{ width: '100%', padding: '12px', borderRadius: '10px',
          background: '#FFFFFF', border: '1px solid #E0DAD2',
          color: '#1C2530', fontSize: '14px', outline: 'none', resize: 'none',
          boxSizing: 'border-box' }} />
      <button onClick={() => onSubmit(value)} disabled={!value.trim()}
        style={{ padding: '16px', borderRadius: '12px',
          cursor: value.trim() ? 'pointer' : 'default',
          background: value.trim() ? '#1B3D6F' : '#E0DAD2',
          color: value.trim() ? '#fff' : '#8B8074', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 900 }}>
        SEND
      </button>
    </div>
  )
}

function VoteWidget({ onSubmit }) {
  const opts = ['Yes, priority', 'Maybe', 'Not for this phase']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {opts.map((opt, i) => {
        const cols = [['#1B3D6F','#E8EDF5'],['#B8742A','#FFF4E0'],['#8B8074','#F5F1EB']]
        const [col, bg] = cols[i]
        return (
          <button key={opt} onClick={() => onSubmit(opt)}
            style={{ padding: '15px', borderRadius: '12px', cursor: 'pointer',
              border: 'none', background: bg, color: col,
              fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px',
              fontWeight: 900, textAlign: 'left', borderLeft: '3px solid ' + col }}>
            {opt}
          </button>
        )
      })}
    </div>
  )
}

// ── Main ParticipantView ──────────────────────────────────────
export function ParticipantView({ roomId }) {
  const [connected, setConnected] = useState(false)
  const [mode, setMode] = useState('waiting') // 'waiting' | 'triage' | 'triage_done' | 'question' | 'answered'
  const [triageTools, setTriageTools] = useState([])
  const [triageGate, setTriageGate] = useState(1)
  const [triageAnswers, setTriageAnswers] = useState([])
  const [question, setQuestion] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [sliderVal, setSliderVal] = useState(3)
  const [wordVal, setWordVal] = useState('')
  const [revealed, setRevealed] = useState(false)
  const channelRef = useRef(null)

  useEffect(() => {
    const ch = openChannel(roomId)
    channelRef.current = ch
    subscribe(ch, (msg) => {
      if (msg.type === 'ping') {
        sendMsg(ch, { type: 'pong', payload: { participantId: PARTICIPANT_ID } })
        setConnected(true)
      }
      if (msg.type === 'triage_start') {
        setTriageTools(msg.payload.tools)
        setTriageGate(msg.payload.gate)
        setMode('triage')
        setConnected(true)
      }
      if (msg.type === 'question') {
        setQuestion(msg.payload)
        setMode('question')
        setAnswered(false)
        setSliderVal(3)
        setWordVal('')
        setRevealed(false)
        setConnected(true)
      }
      if (msg.type === 'reveal') setRevealed(true)
    })
    sendMsg(ch, { type: 'pong', payload: { participantId: PARTICIPANT_ID } })
    setConnected(true)
    return () => ch.close()
  }, [roomId])

  const submitResponse = (value) => {
    if (!channelRef.current || answered) return
    sendMsg(channelRef.current, {
      type: 'response',
      payload: { participantId: PARTICIPANT_ID, value, questionId: question?.questionId },
    })
    setAnswered(true)
  }

  return (
    <div style={{ background: '#F2EDE4', minHeight: '100vh', display: 'flex',
      flexDirection: 'column', padding: '18px 16px 32px',
      fontFamily: '-apple-system, sans-serif', color: '#1C2530' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
        <div style={{ background: '#1B3D6F', borderRadius: '8px', width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={7} width={3} height={8} fill="#FFFFFF" rx={1}/>
            <rect x={6} y={3} width={4} height={12} fill="#FFFFFF" rx={1}/>
            <rect x={12} y={5} width={3} height={10} fill="#FFFFFF" rx={1}/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
            fontSize: '14px', color: '#1C2530' }}>RECITY</div>
          <div style={{ fontSize: '9px', color: '#8B8074', fontWeight: 700 }}>
            Session {roomId} · #{PARTICIPANT_ID}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#2A6B45' : '#C0452A' }} />
          <span style={{ fontSize: '9px', fontWeight: 800,
            color: connected ? '#2A6B45' : '#C0452A' }}>
            {connected ? 'CONNECTED' : 'CONNECTING…'}
          </span>
        </div>
      </div>

      {/* Waiting */}
      {mode === 'waiting' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
            fontSize: '40px', color: '#1B3D6F', opacity: .3, marginBottom: '12px' }}>⬡</div>
          <p style={{ color: '#8B8074', fontSize: '14px', lineHeight: 1.5 }}>
            Waiting for facilitator…
          </p>
        </div>
      )}

      {/* Triage deck */}
      {mode === 'triage' && (
        <TriageDeck
          tools={triageTools}
          gate={triageGate}
          channel={channelRef.current}
          onComplete={(answers) => {
            setTriageAnswers(answers)
            setMode('triage_done')
          }}
        />
      )}

      {/* Triage done */}
      {mode === 'triage_done' && (
        <TriageSummary answers={triageAnswers} />
      )}

      {/* Question mode */}
      {mode === 'question' && question && (
        <div className="anim-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <MethodCard toolName={question.tool} gate={question.gate} />

          {!answered && (
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '.06em', color: '#8B8074', marginBottom: '6px' }}>
                Facilitator question
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '16px' }}>
                <p style={{ flex: 1, fontSize: '16px', fontWeight: 700, color: '#1C2530',
                  lineHeight: 1.4, margin: 0 }}>{question.text}</p>
                <button onClick={() => speak(question.text)}
                  style={{ flexShrink: 0, width: '32px', height: '32px', borderRadius: '8px',
                    background: '#F5F1EB', border: '1px solid #E0DAD2',
                    cursor: 'pointer', fontSize: '14px' }}>🔊</button>
              </div>
              {question.type === 'slider' && <SliderWidget value={sliderVal} onChange={setSliderVal} onSubmit={submitResponse} />}
              {question.type === 'word'   && <WordWidget value={wordVal} onChange={setWordVal} onSubmit={submitResponse} />}
              {question.type === 'vote'   && <VoteWidget onSubmit={submitResponse} />}
            </div>
          )}

          {answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', color: '#2A6B45', marginBottom: '6px' }}>✓</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '22px', color: '#1B3D6F', marginBottom: '6px' }}>
                RESPONSE SENT
              </div>
              <p style={{ color: '#8B8074', fontSize: '12px' }}>
                {revealed ? 'The facilitator is revealing the results…' : 'Waiting for others…'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
