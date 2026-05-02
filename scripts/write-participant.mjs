import { writeFileSync } from 'fs'

writeFileSync('src/views/ParticipantView.jsx', `
import { useState, useEffect, useRef } from 'react'
import { openChannel, sendMsg, subscribe } from '../lib/session'
import { TOOLS, FAMILY_STYLE, GATE_LABEL } from '../data/tools'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)
const GATE_VOLT = ['','#C17B2A','#3A6FD8','#2DBD76','#9B59E8']
const FREQ_LABELS = ['','Jamais','Rarement','Parfois','Souvent','Toujours']

// ── TTS helper ────────────────────────────────────────────────
function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'fr-FR'
  u.rate = 0.92
  const voices = window.speechSynthesis.getVoices()
  const fr = voices.find(v => v.lang.startsWith('fr'))
  if (fr) u.voice = fr
  window.speechSynthesis.speak(u)
}

// ── Method card panel ─────────────────────────────────────────
function MethodCard({ toolName, gate }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('def')       // 'def' | 'usages'
  const tool = TOOLS.find(t => t.n === toolName)
  if (!tool) return null

  const fam   = FAMILY_STYLE[tool.f] || { bg: '#e5e7eb', text: '#374151', icon: '?' }
  const col   = GATE_VOLT[gate] || '#C8F135'
  const gateUsage = tool.gu?.[gate]

  const speakCard = () => {
    const parts = [
      tool.n + '.',
      tool.def,
    ]
    if (gateUsage) parts.push('Dans ce contexte :', gateUsage)
    parts.push('Conseil praticien :', tool.t)
    speak(parts.join(' '))
  }

  return (
    <div style={{ borderRadius: '14px', overflow: 'hidden', marginBottom: '14px',
      border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.04)' }}>

      {/* Collapsed header — always visible */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center',
          gap: '10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {/* Gate dot */}
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: col, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: '13px', color: '#fff' }}>
          {gate}
        </div>
        {/* Name + family */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '15px', fontWeight: 700, color: '#fff',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool.n}</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.35)', fontWeight: 700 }}>
            {fam.icon} {tool.f} · Gate {gate}
          </div>
        </div>
        {/* Expand indicator */}
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#C8F135', flexShrink: 0,
          padding: '3px 8px', borderRadius: '6px', background: 'rgba(200,241,53,.1)',
          border: '1px solid rgba(200,241,53,.2)' }}>
          {open ? 'FERMER ▲' : 'VOIR FICHE ▼'}
        </div>
      </button>

      {/* Highlighted gate usage — visible even when collapsed */}
      {gateUsage && (
        <div style={{ margin: '0 14px 12px', padding: '8px 12px', borderRadius: '10px',
          background: 'rgba(' + (col === '#C8F135' ? '200,241,53' : col === '#2DBD76' ? '45,189,118' : col === '#3A6FD8' ? '58,111,216' : '155,89,232') + ',.1)',
          borderLeft: '3px solid ' + col }}>
          <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '.05em', color: col, marginBottom: '3px' }}>Usage · Gate {gate}</div>
          <p style={{ fontSize: '12px', color: '#fff', lineHeight: 1.45, margin: 0 }}>{gateUsage}</p>
        </div>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="anim-fadein" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
            {[['def','DÉFINITION'],['usages','CAS D\'USAGE']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex: 1, padding: '8px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '10px', fontWeight: 800, letterSpacing: '.05em',
                  color: tab === id ? '#C8F135' : 'rgba(255,255,255,.3)',
                  borderBottom: tab === id ? '2px solid #C8F135' : '2px solid transparent' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Définition tab */}
          {tab === 'def' && (
            <div style={{ padding: '14px' }}>
              {/* Def text */}
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.7)', lineHeight: 1.55, marginBottom: '14px' }}>
                {tool.def}
              </p>
              {/* Practitioner tip */}
              <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#D1FAE5',
                border: '1px solid #A7F3D0', marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#065F46',
                  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Conseil praticien</div>
                <p style={{ fontSize: '12px', color: '#065F46', lineHeight: 1.45, margin: 0 }}>{tool.t}</p>
              </div>
              {/* TTS button */}
              <button onClick={speakCard}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', cursor: 'pointer',
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                  color: 'rgba(255,255,255,.6)', fontSize: '12px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                🔊 LIRE À VOIX HAUTE
              </button>
            </div>
          )}

          {/* Cas d'usage tab */}
          {tab === 'usages' && (
            <div style={{ padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
                textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px' }}>
                Pertinence par gate
              </div>
              {tool.g.filter(g => tool.gu?.[g]).map(g => (
                <div key={g} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start',
                  padding: '10px', borderRadius: '10px', marginBottom: '6px',
                  background: g === gate
                    ? 'rgba(' + (GATE_VOLT[g] === '#C8F135' ? '200,241,53' : GATE_VOLT[g] === '#2DBD76' ? '45,189,118' : GATE_VOLT[g] === '#3A6FD8' ? '58,111,216' : '155,89,232') + ',.12)'
                    : 'rgba(255,255,255,.03)',
                  border: '1px solid ' + (g === gate ? GATE_VOLT[g] : 'rgba(255,255,255,.06)') }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: GATE_VOLT[g], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 900, color: '#fff', marginTop: '1px' }}>{g}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                      letterSpacing: '.04em', marginBottom: '3px',
                      color: g === gate ? GATE_VOLT[g] : 'rgba(255,255,255,.3)' }}>
                      {GATE_LABEL[g]}{g === gate ? ' · EN COURS' : ''}
                    </div>
                    <p style={{ fontSize: '12px', color: g === gate ? '#fff' : 'rgba(255,255,255,.5)',
                      lineHeight: 1.4, margin: 0 }}>{tool.gu[g]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Slider widget ─────────────────────────────────────────────
function SliderWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: '72px', color: '#C8F135', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.4)' }}>
          {FREQ_LABELS[value]}
        </div>
      </div>
      <input type="range" min={0} max={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#C8F135', cursor: 'pointer', height: '6px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px',
        color: 'rgba(255,255,255,.3)', fontWeight: 700, textTransform: 'uppercase' }}>
        <span>Jamais</span><span>Toujours</span>
      </div>
      <button onClick={() => onSubmit(value)}
        style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer',
          background: '#C8F135', color: '#0D0D0D', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
        ENVOYER MON AVIS
      </button>
    </div>
  )
}

// ── Word widget ────────────────────────────────────────────────
function WordWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        placeholder="Votre réponse…" rows={4}
        style={{ width: '100%', padding: '14px', borderRadius: '14px',
          background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
          color: '#fff', fontSize: '16px', outline: 'none', resize: 'none',
          fontFamily: '-apple-system, sans-serif', boxSizing: 'border-box' }} />
      <button onClick={() => onSubmit(value)} disabled={!value.trim()}
        style={{ padding: '18px', borderRadius: '14px', cursor: value.trim() ? 'pointer' : 'default',
          background: value.trim() ? '#C8F135' : 'rgba(255,255,255,.1)',
          color: value.trim() ? '#0D0D0D' : 'rgba(255,255,255,.3)', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
        ENVOYER
      </button>
    </div>
  )
}

// ── Vote widget ────────────────────────────────────────────────
function VoteWidget({ onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[['Priorité haute','#C8F135','rgba(200,241,53,.15)'],
        ['Priorité moyenne','rgba(255,255,255,.6)','rgba(255,255,255,.06)'],
        ['Priorité basse','rgba(255,255,255,.4)','rgba(255,255,255,.03)']].map(([opt, col, bg]) => (
        <button key={opt} onClick={() => onSubmit(opt)}
          style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', border: 'none',
            background: bg, color: col, fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '18px', fontWeight: 900, textAlign: 'left',
            borderLeft: '3px solid ' + col }}>
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── Main ParticipantView ──────────────────────────────────────
export function ParticipantView({ roomId }) {
  const [connected, setConnected] = useState(false)
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
      if (msg.type === 'question') {
        setQuestion(msg.payload)
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
    <div style={{ background: '#0D0D0D', minHeight: '100vh', display: 'flex', flexDirection: 'column',
      padding: '20px 16px 32px', fontFamily: '-apple-system, sans-serif', color: '#fff' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <div style={{ background: '#C8F135', borderRadius: '8px', width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={7} width={3} height={8} fill="#0D0D0D" rx={1}/>
            <rect x={6} y={3} width={4} height={12} fill="#0D0D0D" rx={1}/>
            <rect x={12} y={5} width={3} height={10} fill="#0D0D0D" rx={1}/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Barlow Condensed, Impact, sans-serif', fontWeight: 900,
            fontSize: '15px', color: '#fff', lineHeight: 1 }}>URBANQUEST</div>
          <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.3)', fontWeight: 700 }}>
            Session {roomId} · #{PARTICIPANT_ID}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#2DBD76' : '#FF4F3B' }} />
          <span style={{ fontSize: '9px', color: connected ? '#2DBD76' : '#FF4F3B', fontWeight: 800 }}>
            {connected ? 'CONNECTÉ' : 'CONNEXION…'}
          </span>
        </div>
      </div>

      {/* Waiting screen */}
      {!question && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
            fontSize: '48px', color: '#C8F135', marginBottom: '8px' }}>⬡</div>
          <p style={{ color: 'rgba(255,255,255,.4)', fontSize: '14px', lineHeight: 1.5 }}>
            En attente de la prochaine question du facilitateur…
          </p>
        </div>
      )}

      {/* Active question */}
      {question && (
        <div className="anim-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>

          {/* ① Method card — always shown, expandable */}
          <MethodCard toolName={question.tool} gate={question.gate} />

          {/* ② Question */}
          {!answered && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '.06em', color: 'rgba(255,255,255,.3)', marginBottom: '8px' }}>
                Question du facilitateur
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}>
                <p style={{ flex: 1, fontSize: '17px', fontWeight: 700, color: '#fff', lineHeight: 1.4, margin: 0 }}>
                  {question.text}
                </p>
                <button onClick={() => speak(question.text)}
                  style={{ flexShrink: 0, width: '34px', height: '34px', borderRadius: '10px',
                    background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                    cursor: 'pointer', fontSize: '16px', color: '#fff' }}>🔊</button>
              </div>

              {/* Response widgets */}
              {question.type === 'slider' && (
                <SliderWidget value={sliderVal} onChange={setSliderVal} onSubmit={submitResponse} />
              )}
              {question.type === 'word' && (
                <WordWidget value={wordVal} onChange={setWordVal} onSubmit={submitResponse} />
              )}
              {question.type === 'vote' && (
                <VoteWidget onSubmit={submitResponse} />
              )}
            </div>
          )}

          {/* ③ Answered state */}
          {answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', paddingTop: '16px' }}>
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>✓</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '26px', color: '#C8F135', marginBottom: '8px' }}>RÉPONSE ENVOYÉE</div>
              <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '13px' }}>
                {revealed ? 'Le facilitateur révèle les résultats…' : 'En attente des autres participants…'}
              </p>
              <p style={{ color: 'rgba(255,255,255,.2)', fontSize: '11px', marginTop: '12px' }}>
                Vous pouvez continuer à explorer la fiche méthode ci-dessus.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
`.trimStart())
console.log('ParticipantView OK')
