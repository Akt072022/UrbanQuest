import { writeFileSync, mkdirSync } from 'fs'

// ── src/lib/session.js ─────────────────────────────────────────
mkdirSync('src/lib', { recursive: true })
writeFileSync('src/lib/session.js', `
/**
 * Session manager — BroadcastChannel (local / same device)
 *
 * Architecture Firebase-ready : remplacer les 3 fonctions
 * send / subscribe / unsubscribe par des équivalents Firebase
 * Realtime Database quand un projet Firebase est configuré.
 *
 * Messages échangés :
 *   { type: 'question', payload: { text, gate, tool } }
 *   { type: 'response', payload: { value, participantId, gate, tool } }
 *   { type: 'ping' }
 *   { type: 'pong', payload: { participantId } }
 *   { type: 'reveal' }
 */

export function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

/** Open (or join) a BroadcastChannel room */
export function openChannel(roomId) {
  return new BroadcastChannel('uq-' + roomId)
}

/** Send a message to the room */
export function sendMsg(channel, msg) {
  channel.postMessage(msg)
}

/** Subscribe to messages */
export function subscribe(channel, handler) {
  channel.onmessage = (e) => handler(e.data)
}

/** Cleanup */
export function closeChannel(channel) {
  channel.close()
}

/** Generate participant URL */
export function participantUrl(roomId) {
  const base = window.location.origin + window.location.pathname
  return base + '?room=' + roomId
}
`.trimStart())
console.log('session.js OK')

// ── QR code component ──────────────────────────────────────────
writeFileSync('src/components/QRCode.jsx', `
import { useEffect, useRef } from 'react'
import QRCodeLib from 'qrcode'

export function QRCode({ value, size = 180 }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    if (canvasRef.current && value) {
      QRCodeLib.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 2,
        color: { dark: '#0D0D0D', light: '#C8F135' },
      })
    }
  }, [value, size])
  return <canvas ref={canvasRef} style={{ borderRadius: '12px' }} />
}
`.trimStart())
console.log('QRCode.jsx OK')

// ── FacilitatorView ────────────────────────────────────────────
writeFileSync('src/views/FacilitatorView.jsx', `
import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { QRCode } from '../components/QRCode'
import { makeRoomId, openChannel, sendMsg, subscribe, closeChannel, participantUrl } from '../lib/session'
import { TOOLS, GATE_LABEL } from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#3A6FD8','#2DBD76','#9B59E8']

const QUESTIONS = [
  { id: 'q1', text: 'Dans quelle mesure votre équipe pratique-t-elle cette méthode ?', type: 'slider' },
  { id: 'q2', text: 'Quel est votre principal blocage sur cette méthode ?', type: 'word' },
  { id: 'q3', text: 'Quelle est votre priorité pour la prochaine session ?', type: 'vote' },
]

function ResponseBar({ label, value, max, col }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.6)', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '12px', color: col, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '3px', width: pct + '%',
          background: col, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

export function FacilitatorView() {
  const { practiced: practicedArr, goMap, setSession, sessionId: savedRoomId } = useStore(useShallow(s => ({
    practiced: s.practiced,
    goMap: s.goMap,
    setSession: s.setSession,
    sessionId: s.sessionId,
  })))

  const [roomId, setRoomId] = useState(savedRoomId || makeRoomId())
  const [started, setStarted] = useState(!!savedRoomId)
  const [participants, setParticipants] = useState([])
  const [responses, setResponses] = useState([])      // { value, participantId }
  const [currentQ, setCurrentQ] = useState(QUESTIONS[0])
  const [revealed, setRevealed] = useState(false)
  const [activeTool, setActiveTool] = useState(TOOLS[0])
  const [activeGate, setActiveGate] = useState(1)
  const channelRef = useRef(null)
  const url = participantUrl(roomId)

  const startSession = () => {
    channelRef.current = openChannel(roomId)
    subscribe(channelRef.current, (msg) => {
      if (msg.type === 'pong') {
        setParticipants(prev => prev.includes(msg.payload.participantId)
          ? prev : [...prev, msg.payload.participantId])
      }
      if (msg.type === 'response') {
        setResponses(prev => [...prev, msg.payload])
      }
    })
    setSession(roomId, 'facilitator')
    setStarted(true)
    // Ping participants
    sendMsg(channelRef.current, { type: 'ping' })
  }

  const broadcast = (q, tool) => {
    if (!channelRef.current) return
    setCurrentQ(q)
    setActiveTool(tool)
    setResponses([])
    setRevealed(false)
    sendMsg(channelRef.current, {
      type: 'question',
      payload: { questionId: q.id, text: q.text, type: q.type, tool: tool.n, gate: activeGate },
    })
  }

  const revealResults = () => {
    setRevealed(true)
    sendMsg(channelRef.current, { type: 'reveal' })
  }

  // Aggregate slider responses
  const sliderAvg = responses.length
    ? (responses.reduce((a, r) => a + (Number(r.value) || 0), 0) / responses.length).toFixed(1)
    : '—'

  // Word frequency
  const wordFreq = {}
  responses.forEach(r => {
    const words = String(r.value).toLowerCase().split(/\\s+/)
    words.forEach(w => { if (w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1 })
  })
  const topWords = Object.entries(wordFreq).sort((a,b) => b[1]-a[1]).slice(0,8)

  // TTS for question
  const speakQ = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    window.speechSynthesis.speak(u)
  }

  useEffect(() => () => channelRef.current?.close(), [])

  if (!started) {
    return (
      <div className="anim-fadein" style={{ paddingTop: '8px' }}>
        <button onClick={goMap} style={{ fontSize: '12px', fontWeight: 800, color: 'rgba(255,255,255,.4)',
          background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}>← CARTE</button>
        <div className="text-mega" style={{ fontSize: 'clamp(36px,11vw,60px)', color: '#fff', marginBottom: '4px' }}>
          ATELIER
        </div>
        <div className="text-mega" style={{ fontSize: 'clamp(36px,11vw,60px)', color: '#C8F135', marginTop: '-6px', marginBottom: '16px' }}>
          LIVE
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.45)', lineHeight: 1.5, marginBottom: '24px' }}>
          Les participants rejoignent via QR code sur leur smartphone. Les réponses arrivent en temps réel sur votre écran.
        </p>
        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(200,241,53,.08)',
          border: '1px solid rgba(200,241,53,.25)', marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(200,241,53,.6)',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '8px' }}>Code de session</div>
          <div className="text-mega" style={{ fontSize: '48px', color: '#C8F135', letterSpacing: '.08em' }}>
            {roomId}
          </div>
        </div>
        <button onClick={startSession} className="volt-glow"
          style={{ width: '100%', padding: '16px', borderRadius: '14px', cursor: 'pointer',
            background: '#C8F135', color: '#0D0D0D', border: 'none',
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
          DÉMARRER LA SESSION →
        </button>
      </div>
    )
  }

  return (
    <div className="anim-fadein" style={{ paddingTop: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button onClick={goMap} style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,.4)',
          background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: '8px', padding: '5px 10px', cursor: 'pointer' }}>← CARTE</button>
        <div style={{ flex: 1 }}>
          <div className="text-mega" style={{ fontSize: '20px', color: '#C8F135' }}>SESSION {roomId}</div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.35)' }}>
            {participants.length} participant{participants.length > 1 ? 's' : ''} connecté{participants.length > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: '8px',
          background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)',
          fontSize: '10px', fontWeight: 800, color: '#22C55E', textTransform: 'uppercase' }}>
          ● LIVE
        </div>
      </div>

      {/* QR Code compact */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px',
        borderRadius: '14px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
        marginBottom: '16px' }}>
        <QRCode value={url} size={80} />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
            textTransform: 'uppercase', marginBottom: '4px' }}>Lien participants</div>
          <div style={{ fontSize: '11px', color: '#C8F135', wordBreak: 'break-all' }}>{url}</div>
        </div>
      </div>

      {/* Question broadcaster */}
      <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
          textTransform: 'uppercase', marginBottom: '8px' }}>Envoyer une question</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {QUESTIONS.map(q => (
            <div key={q.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => broadcast(q, activeTool)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                  background: currentQ.id === q.id ? 'rgba(200,241,53,.15)' : 'rgba(255,255,255,.05)',
                  border: '1px solid ' + (currentQ.id === q.id ? 'rgba(200,241,53,.4)' : 'rgba(255,255,255,.1)'),
                  color: currentQ.id === q.id ? '#C8F135' : 'rgba(255,255,255,.6)',
                  fontSize: '11px', fontWeight: 700, textAlign: 'left' }}>
                {q.text}
              </button>
              <button onClick={() => speakQ(q.text)}
                style={{ width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)',
                  color: '#fff', fontSize: '14px' }}>🔊</button>
            </div>
          ))}
        </div>
      </div>

      {/* Live results */}
      <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
            textTransform: 'uppercase' }}>Réponses ({responses.length})</div>
          {responses.length > 0 && !revealed && (
            <button onClick={revealResults}
              style={{ padding: '4px 10px', borderRadius: '8px', cursor: 'pointer',
                background: '#C8F135', color: '#0D0D0D', border: 'none',
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 900 }}>
              RÉVÉLER
            </button>
          )}
        </div>

        {currentQ.type === 'slider' && (
          <div>
            <div className="text-mega" style={{ fontSize: '48px', color: '#C8F135', textAlign: 'center' }}>
              {sliderAvg}<span style={{ fontSize: '20px', color: 'rgba(255,255,255,.3)' }}>/5</span>
            </div>
            <ResponseBar label="0-1 (faible)" value={responses.filter(r=>r.value<2).length}
              max={responses.length} col="#FF4F3B" />
            <ResponseBar label="2-3 (moyen)" value={responses.filter(r=>r.value>=2&&r.value<4).length}
              max={responses.length} col="#C17B2A" />
            <ResponseBar label="4-5 (fort)" value={responses.filter(r=>r.value>=4).length}
              max={responses.length} col="#2DBD76" />
          </div>
        )}

        {currentQ.type === 'word' && topWords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {topWords.map(([word, count]) => (
              <div key={word} style={{ padding: '4px 10px', borderRadius: '8px',
                background: 'rgba(200,241,53,.12)', border: '1px solid rgba(200,241,53,.25)',
                fontSize: 10 + count * 2 + 'px', color: '#C8F135', fontWeight: 800 }}>
                {word} ({count})
              </div>
            ))}
          </div>
        )}

        {responses.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.2)', fontSize: '13px',
            padding: '20px 0', fontStyle: 'italic' }}>
            En attente de réponses…
          </div>
        )}
      </div>
    </div>
  )
}
`.trimStart())
console.log('FacilitatorView OK')

// ── ParticipantView ────────────────────────────────────────────
writeFileSync('src/views/ParticipantView.jsx', `
import { useState, useEffect, useRef } from 'react'
import { openChannel, sendMsg, subscribe } from '../lib/session'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)

export function ParticipantView({ roomId }) {
  const [connected, setConnected] = useState(false)
  const [question, setQuestion] = useState(null)   // { questionId, text, type, tool, gate }
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
      if (msg.type === 'reveal') {
        setRevealed(true)
      }
    })
    // Auto-announce presence
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

  const speakQ = () => {
    if (!question || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(question.text)
    u.lang = 'fr-FR'
    window.speechSynthesis.speak(u)
  }

  return (
    <div style={{ background: '#0D0D0D', minHeight: '100vh', display: 'flex', flexDirection: 'column',
      padding: '24px 18px', fontFamily: '-apple-system, sans-serif', color: '#fff' }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <div style={{ background: '#C8F135', borderRadius: '8px', width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={7} width={3} height={8} fill="#0D0D0D" rx={1}/>
            <rect x={6} y={3} width={4} height={12} fill="#0D0D0D" rx={1}/>
            <rect x={12} y={5} width={3} height={10} fill="#0D0D0D" rx={1}/>
          </svg>
        </div>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed, Impact, sans-serif', fontWeight: 900,
            fontSize: '16px', color: '#fff', lineHeight: 1 }}>URBANQUEST</div>
          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.35)', fontWeight: 700 }}>
            Session {roomId} · #{PARTICIPANT_ID}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#2DBD76' : '#FF4F3B' }} />
          <span style={{ fontSize: '10px', color: connected ? '#2DBD76' : '#FF4F3B', fontWeight: 800 }}>
            {connected ? 'CONNECTÉ' : 'CONNEXION…'}
          </span>
        </div>
      </div>

      {/* Main area */}
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

      {question && (
        <div className="anim-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Method name */}
          <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,.05)',
            border: '1px solid rgba(255,255,255,.08)', marginBottom: '16px', fontSize: '12px',
            color: 'rgba(255,255,255,.45)', fontWeight: 700 }}>
            Méthode en discussion : <span style={{ color: '#C8F135' }}>{question.tool}</span>
          </div>

          {/* Question */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '24px' }}>
            <p style={{ flex: 1, fontSize: '18px', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
              {question.text}
            </p>
            <button onClick={speakQ}
              style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.12)',
                cursor: 'pointer', fontSize: '18px', color: '#fff' }}>🔊</button>
          </div>

          {/* Slider response */}
          {question.type === 'slider' && !answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                  fontSize: '72px', color: '#C8F135', lineHeight: 1 }}>{sliderVal}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,.4)' }}>
                  {['','Jamais','Rarement','Parfois','Souvent','Toujours'][sliderVal]}
                </div>
              </div>
              <input type="range" min={0} max={5} value={sliderVal}
                onChange={e => setSliderVal(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#C8F135', cursor: 'pointer', height: '6px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px',
                color: 'rgba(255,255,255,.3)', fontWeight: 700, textTransform: 'uppercase' }}>
                <span>Jamais</span><span>Toujours</span>
              </div>
              <button onClick={() => submitResponse(sliderVal)}
                style={{ padding: '18px', borderRadius: '14px', cursor: 'pointer',
                  background: '#C8F135', color: '#0D0D0D', border: 'none',
                  fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
                ENVOYER MON AVIS
              </button>
            </div>
          )}

          {/* Word response */}
          {question.type === 'word' && !answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <textarea
                value={wordVal}
                onChange={e => setWordVal(e.target.value)}
                placeholder="Votre réponse…"
                rows={4}
                style={{ width: '100%', padding: '14px', borderRadius: '14px',
                  background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)',
                  color: '#fff', fontSize: '16px', outline: 'none', resize: 'none' }}
              />
              <button onClick={() => submitResponse(wordVal)} disabled={!wordVal.trim()}
                style={{ padding: '18px', borderRadius: '14px', cursor: wordVal.trim() ? 'pointer' : 'default',
                  background: wordVal.trim() ? '#C8F135' : 'rgba(255,255,255,.1)',
                  color: wordVal.trim() ? '#0D0D0D' : 'rgba(255,255,255,.3)', border: 'none',
                  fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
                ENVOYER
              </button>
            </div>
          )}

          {/* Vote response */}
          {question.type === 'vote' && !answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {['Priorité haute','Priorité moyenne','Priorité basse'].map((opt, i) => (
                <button key={opt} onClick={() => submitResponse(opt)}
                  style={{ padding: '16px', borderRadius: '14px', cursor: 'pointer', border: 'none',
                    background: ['rgba(200,241,53,.15)','rgba(255,255,255,.06)','rgba(255,255,255,.03)'][i],
                    color: i === 0 ? '#C8F135' : 'rgba(255,255,255,.6)',
                    fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 900,
                    textAlign: 'left', borderLeft: '3px solid ' + ['#C8F135','rgba(255,255,255,.2)','rgba(255,255,255,.1)'][i] }}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* Answered state */}
          {answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>✓</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '28px', color: '#C8F135', marginBottom: '8px' }}>RÉPONSE ENVOYÉE</div>
              {revealed ? (
                <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '13px' }}>
                  Le facilitateur révèle les résultats…
                </p>
              ) : (
                <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '13px' }}>
                  En attente des autres participants…
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
`.trimStart())
console.log('ParticipantView OK')
