import { writeFileSync } from 'fs'

// ── FacilitatorView ───────────────────────────────────────────
writeFileSync('src/views/FacilitatorView.jsx', `
import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { QRCode } from '../components/QRCode'
import { makeRoomId, openChannel, sendMsg, subscribe, participantUrl } from '../lib/session'
import { TOOLS, GATE_LABEL } from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

const QUESTIONS = [
  { id: 'q1', text: 'Dans quelle mesure votre équipe pratique-t-elle cette méthode ?', type: 'slider' },
  { id: 'q2', text: 'Quel est votre principal blocage sur cette méthode ?', type: 'word' },
  { id: 'q3', text: "Quelle est votre priorité pour la prochaine session ?", type: 'vote' },
]

function ResponseBar({ label, value, max, col }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontSize: '12px', color: '#6B6460', fontWeight: 700 }}>{label}</span>
        <span style={{ fontSize: '12px', color: col, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', background: '#E0DAD2', overflow: 'hidden' }}>
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

  const [roomId] = useState(savedRoomId || makeRoomId())
  const [started, setStarted] = useState(!!savedRoomId)
  const [participants, setParticipants] = useState([])
  const [responses, setResponses] = useState([])
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
      if (msg.type === 'response') setResponses(prev => [...prev, msg.payload])
    })
    setSession(roomId, 'facilitator')
    setStarted(true)
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

  const sliderAvg = responses.length
    ? (responses.reduce((a, r) => a + (Number(r.value) || 0), 0) / responses.length).toFixed(1)
    : '—'

  const wordFreq = {}
  responses.forEach(r => {
    String(r.value).toLowerCase().split(/\\s+/).forEach(w => {
      if (w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1
    })
  })
  const topWords = Object.entries(wordFreq).sort((a,b) => b[1]-a[1]).slice(0,8)

  const speakQ = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    window.speechSynthesis.speak(u)
  }

  useEffect(() => () => channelRef.current?.close(), [])

  // ── Pre-start screen ──────────────────────────────────────────
  if (!started) {
    return (
      <div className="anim-fadein" style={{ paddingTop: '8px' }}>
        <button onClick={goMap} style={{ fontSize: '12px', fontWeight: 800, color: '#8B8074',
          background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px' }}>← CARTE</button>

        <div className="text-mega" style={{ fontSize: 'clamp(36px,11vw,60px)', color: '#1C2530', marginBottom: '2px' }}>
          ATELIER
        </div>
        <div className="text-mega" style={{ fontSize: 'clamp(36px,11vw,60px)', color: '#1B3D6F', marginTop: '-6px', marginBottom: '16px' }}>
          LIVE
        </div>

        <p style={{ fontSize: '13px', color: '#8B8074', lineHeight: 1.55, marginBottom: '24px' }}>
          Les participants rejoignent via QR code sur leur smartphone. Les réponses arrivent en temps réel sur votre écran.
        </p>

        <div style={{ padding: '20px', borderRadius: '16px', marginBottom: '20px', textAlign: 'center',
          background: '#FFFDF8', border: '1px solid #CFC9BE',
          boxShadow: '0 1px 4px rgba(28,37,48,.06)' }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '10px' }}>Code de session</div>
          <div className="text-mega" style={{ fontSize: '48px', color: '#1B3D6F', letterSpacing: '.08em' }}>
            {roomId}
          </div>
        </div>

        <button onClick={startSession} className="anim-pulse-navy"
          style={{ width: '100%', padding: '16px', borderRadius: '12px', cursor: 'pointer',
            background: '#1B3D6F', color: '#FFFFFF', border: 'none',
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900,
            boxShadow: '0 4px 16px rgba(27,61,111,.25)' }}>
          DÉMARRER LA SESSION →
        </button>
      </div>
    )
  }

  // ── Active session ────────────────────────────────────────────
  return (
    <div className="anim-fadein" style={{ paddingTop: '8px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button onClick={goMap} style={{ fontSize: '11px', fontWeight: 800, color: '#8B8074',
          background: '#FFFDF8', border: '1px solid #CFC9BE',
          borderRadius: '8px', padding: '5px 10px', cursor: 'pointer' }}>← CARTE</button>
        <div style={{ flex: 1 }}>
          <div className="text-mega" style={{ fontSize: '20px', color: '#1B3D6F' }}>SESSION {roomId}</div>
          <div style={{ fontSize: '11px', color: '#8B8074' }}>
            {participants.length} participant{participants.length > 1 ? 's' : ''} connecté{participants.length > 1 ? 's' : ''}
          </div>
        </div>
        <div style={{ padding: '4px 10px', borderRadius: '8px',
          background: '#E6F4EC', border: '1px solid #C3E6C9',
          fontSize: '10px', fontWeight: 800, color: '#2A6B45', textTransform: 'uppercase' }}>
          ● LIVE
        </div>
      </div>

      {/* QR compact */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '12px',
        borderRadius: '14px', background: '#FFFDF8', border: '1px solid #CFC9BE',
        marginBottom: '14px', boxShadow: '0 1px 4px rgba(28,37,48,.05)' }}>
        <QRCode value={url} size={72} />
        <div>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', marginBottom: '4px' }}>Lien participants</div>
          <div style={{ fontSize: '11px', color: '#1B3D6F', wordBreak: 'break-all' }}>{url}</div>
        </div>
      </div>

      {/* Sélecteur de méthode active */}
      <div style={{ padding: '12px', borderRadius: '14px', background: '#FFFDF8',
        border: '1px solid #CFC9BE', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
          textTransform: 'uppercase', marginBottom: '8px' }}>Méthode en discussion</div>
        <select
          value={activeTool.n}
          onChange={e => {
            const t = TOOLS.find(t => t.n === e.target.value)
            if (t) setActiveTool(t)
          }}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '10px',
            border: '1px solid #CFC9BE', background: '#F2EDE4', color: '#1C2530',
            fontSize: '13px', outline: 'none', fontWeight: 600 }}>
          {TOOLS.map(t => <option key={t.n} value={t.n}>{t.n}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
          {[1,2,3,4].map(g => (
            <button key={g} onClick={() => setActiveGate(g)}
              style={{ flex: 1, padding: '5px', borderRadius: '8px', cursor: 'pointer', border: 'none',
                background: activeGate === g ? GATE_VOLT[g] : '#EAE5DB',
                color: activeGate === g ? '#fff' : '#8B8074',
                fontSize: '11px', fontWeight: 800 }}>
              G{g}
            </button>
          ))}
        </div>
      </div>

      {/* Questions */}
      <div style={{ padding: '12px', borderRadius: '14px', background: '#FFFDF8',
        border: '1px solid #CFC9BE', marginBottom: '12px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
          textTransform: 'uppercase', marginBottom: '8px' }}>Envoyer une question</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {QUESTIONS.map(q => (
            <div key={q.id} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button onClick={() => broadcast(q, activeTool)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  background: currentQ.id === q.id ? '#E8EDF5' : '#F2EDE4',
                  border: '1px solid ' + (currentQ.id === q.id ? '#1B3D6F' : '#CFC9BE'),
                  color: currentQ.id === q.id ? '#1B3D6F' : '#6B6460',
                  fontSize: '11px', fontWeight: 700 }}>
                {q.text}
              </button>
              <button onClick={() => speakQ(q.text)}
                style={{ width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer',
                  background: '#EAE5DB', border: '1px solid #CFC9BE',
                  color: '#6B6460', fontSize: '14px' }}>🔊</button>
            </div>
          ))}
        </div>
      </div>

      {/* Résultats live */}
      <div style={{ padding: '14px', borderRadius: '14px', background: '#FFFDF8',
        border: '1px solid #CFC9BE' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase' }}>Réponses ({responses.length})</div>
          {responses.length > 0 && !revealed && (
            <button onClick={revealResults}
              style={{ padding: '4px 12px', borderRadius: '8px', cursor: 'pointer',
                background: '#1B3D6F', color: '#fff', border: 'none',
                fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 900 }}>
              RÉVÉLER
            </button>
          )}
        </div>

        {currentQ.type === 'slider' && responses.length > 0 && (
          <div>
            <div className="text-mega" style={{ fontSize: '48px', color: '#1B3D6F', textAlign: 'center' }}>
              {sliderAvg}<span style={{ fontSize: '20px', color: '#8B8074' }}>/5</span>
            </div>
            <ResponseBar label="0-1 (faible)" value={responses.filter(r=>r.value<2).length}
              max={responses.length} col="#C0452A" />
            <ResponseBar label="2-3 (moyen)" value={responses.filter(r=>r.value>=2&&r.value<4).length}
              max={responses.length} col="#C17B2A" />
            <ResponseBar label="4-5 (fort)" value={responses.filter(r=>r.value>=4).length}
              max={responses.length} col="#2A6B45" />
          </div>
        )}

        {currentQ.type === 'word' && topWords.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {topWords.map(([word, count]) => (
              <div key={word} style={{ padding: '4px 10px', borderRadius: '8px',
                background: '#E8EDF5', border: '1px solid rgba(27,61,111,.2)',
                fontSize: (10 + count * 2) + 'px', color: '#1B3D6F', fontWeight: 800 }}>
                {word} ({count})
              </div>
            ))}
          </div>
        )}

        {responses.length === 0 && (
          <div style={{ textAlign: 'center', color: '#B0A898', fontSize: '13px',
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
import { TOOLS, FAMILY_STYLE, GATE_LABEL } from '../data/tools'

const PARTICIPANT_ID = Math.random().toString(36).slice(2, 8)
const GATE_VOLT = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']
const FREQ_LABELS = ['','Jamais','Rarement','Parfois','Souvent','Toujours']

function gateRgba(g, a) {
  const m = { 1: '193,123,42', 2: '27,95,160', 3: '42,107,69', 4: '122,58,142' }
  return \`rgba(\${m[g]},\${a})\`
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'fr-FR'
  u.rate = 0.92
  const fr = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr'))
  if (fr) u.voice = fr
  window.speechSynthesis.speak(u)
}

function MethodCard({ toolName, gate }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('def')
  const tool = TOOLS.find(t => t.n === toolName)
  if (!tool) return null

  const fam       = FAMILY_STYLE[tool.f] || { bg: '#e5e7eb', text: '#374151', icon: '?' }
  const col       = GATE_VOLT[gate] || '#1B3D6F'
  const gateUsage = tool.gu?.[gate]

  const speakCard = () => {
    const parts = [tool.n + '.', tool.def]
    if (gateUsage) parts.push('Dans ce contexte :', gateUsage)
    parts.push('Conseil praticien :', tool.t)
    speak(parts.join(' '))
  }

  return (
    <div style={{ borderRadius: '14px', overflow: 'hidden', marginBottom: '14px',
      border: '1px solid #CFC9BE', background: '#FFFDF8',
      boxShadow: '0 1px 4px rgba(28,37,48,.06)' }}>

      {/* Header toujours visible */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '12px 14px', display: 'flex', alignItems: 'center',
          gap: '10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
          background: col, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: '13px', color: '#fff' }}>
          {gate}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '15px', fontWeight: 700, color: '#1C2530',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool.n}</div>
          <div style={{ fontSize: '10px', color: '#8B8074', fontWeight: 700 }}>
            {fam.icon} {tool.f} · Gate {gate}
          </div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#1B3D6F', flexShrink: 0,
          padding: '3px 8px', borderRadius: '6px', background: '#E8EDF5',
          border: '1px solid rgba(27,61,111,.2)' }}>
          {open ? 'FERMER ▲' : 'VOIR FICHE ▼'}
        </div>
      </button>

      {/* Usage gate courant — toujours visible */}
      {gateUsage && (
        <div style={{ margin: '0 14px 12px', padding: '8px 12px', borderRadius: '10px',
          background: gateRgba(gate, .08),
          borderLeft: '3px solid ' + col }}>
          <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '.05em', color: col, marginBottom: '3px' }}>Usage · Gate {gate}</div>
          <p style={{ fontSize: '12px', color: '#1C2530', lineHeight: 1.45, margin: 0 }}>{gateUsage}</p>
        </div>
      )}

      {/* Panneau déplié */}
      {open && (
        <div className="anim-fadein" style={{ borderTop: '1px solid #E5E0D8' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #E5E0D8' }}>
            {[['def','DÉFINITION'],['usages',"CAS D'USAGE"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex: 1, padding: '8px', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '10px', fontWeight: 800, letterSpacing: '.05em',
                  color: tab === id ? '#1B3D6F' : '#8B8074',
                  borderBottom: tab === id ? '2px solid #1B3D6F' : '2px solid transparent' }}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'def' && (
            <div style={{ padding: '14px' }}>
              <p style={{ fontSize: '13px', color: '#4A4540', lineHeight: 1.55, marginBottom: '14px' }}>
                {tool.def}
              </p>
              <div style={{ padding: '10px 12px', borderRadius: '10px',
                background: '#EFF7F0', border: '1px solid #C3E6C9', marginBottom: '12px' }}>
                <div style={{ fontSize: '9px', fontWeight: 800, color: '#2A6B45',
                  textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Conseil praticien</div>
                <p style={{ fontSize: '12px', color: '#2A6B45', lineHeight: 1.45, margin: 0 }}>{tool.t}</p>
              </div>
              <button onClick={speakCard}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', cursor: 'pointer',
                  background: '#EAE5DB', border: '1px solid #CFC9BE',
                  color: '#6B6460', fontSize: '12px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                🔊 LIRE À VOIX HAUTE
              </button>
            </div>
          )}

          {tab === 'usages' && (
            <div style={{ padding: '14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
                textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '10px' }}>
                Pertinence par gate
              </div>
              {tool.g.filter(g => tool.gu?.[g]).map(g => (
                <div key={g} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start',
                  padding: '10px', borderRadius: '10px', marginBottom: '6px',
                  background: g === gate ? gateRgba(g, .08) : '#F5F1EB',
                  border: '1px solid ' + (g === gate ? GATE_VOLT[g] + '55' : '#E0DAD2') }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: GATE_VOLT[g], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', fontWeight: 900, color: '#fff', marginTop: '1px' }}>{g}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                      letterSpacing: '.04em', marginBottom: '3px',
                      color: g === gate ? GATE_VOLT[g] : '#8B8074' }}>
                      {GATE_LABEL[g]}{g === gate ? ' · EN COURS' : ''}
                    </div>
                    <p style={{ fontSize: '12px',
                      color: g === gate ? '#1C2530' : '#8B8074',
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

function SliderWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ textAlign: 'center', padding: '16px', borderRadius: '14px',
        background: '#FFFDF8', border: '1px solid #CFC9BE' }}>
        <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
          fontSize: '72px', color: '#1B3D6F', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '13px', color: '#8B8074', marginTop: '4px' }}>
          {FREQ_LABELS[value]}
        </div>
      </div>
      <input type="range" min={0} max={5} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#1B3D6F', cursor: 'pointer', height: '6px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px',
        color: '#8B8074', fontWeight: 700, textTransform: 'uppercase' }}>
        <span>Jamais</span><span>Toujours</span>
      </div>
      <button onClick={() => onSubmit(value)}
        style={{ padding: '18px', borderRadius: '12px', cursor: 'pointer',
          background: '#1B3D6F', color: '#fff', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900,
          boxShadow: '0 4px 16px rgba(27,61,111,.2)' }}>
        ENVOYER MON AVIS
      </button>
    </div>
  )
}

function WordWidget({ value, onChange, onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <textarea value={value} onChange={e => onChange(e.target.value)}
        placeholder="Votre réponse…" rows={4}
        style={{ width: '100%', padding: '14px', borderRadius: '12px',
          background: '#FFFDF8', border: '1px solid #CFC9BE',
          color: '#1C2530', fontSize: '15px', outline: 'none', resize: 'none',
          boxSizing: 'border-box' }} />
      <button onClick={() => onSubmit(value)} disabled={!value.trim()}
        style={{ padding: '18px', borderRadius: '12px', cursor: value.trim() ? 'pointer' : 'default',
          background: value.trim() ? '#1B3D6F' : '#EAE5DB',
          color: value.trim() ? '#fff' : '#8B8074', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900 }}>
        ENVOYER
      </button>
    </div>
  )
}

function VoteWidget({ onSubmit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {[['Priorité haute','#1B3D6F','#E8EDF5'],
        ['Priorité moyenne','#6B6460','#F5F1EB'],
        ['Priorité basse','#8B8074','#F2EDE4']].map(([opt, col, bg]) => (
        <button key={opt} onClick={() => onSubmit(opt)}
          style={{ padding: '16px', borderRadius: '12px', cursor: 'pointer', border: 'none',
            background: bg, color: col, fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '18px', fontWeight: 900, textAlign: 'left',
            borderLeft: '3px solid ' + col }}>
          {opt}
        </button>
      ))}
    </div>
  )
}

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
    <div style={{ background: '#F2EDE4', minHeight: '100vh', display: 'flex', flexDirection: 'column',
      padding: '20px 16px 32px', fontFamily: '-apple-system, sans-serif', color: '#1C2530' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <div style={{ background: '#1B3D6F', borderRadius: '8px', width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={7} width={3} height={8} fill="#FFFFFF" rx={1}/>
            <rect x={6} y={3} width={4} height={12} fill="#FFFFFF" rx={1}/>
            <rect x={12} y={5} width={3} height={10} fill="#FFFFFF" rx={1}/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Barlow Condensed, Impact, sans-serif', fontWeight: 900,
            fontSize: '15px', color: '#1C2530', lineHeight: 1 }}>URBANQUEST</div>
          <div style={{ fontSize: '9px', color: '#8B8074', fontWeight: 700 }}>
            Session {roomId} · #{PARTICIPANT_ID}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#2A6B45' : '#C0452A' }} />
          <span style={{ fontSize: '9px', color: connected ? '#2A6B45' : '#C0452A', fontWeight: 800 }}>
            {connected ? 'CONNECTÉ' : 'CONNEXION…'}
          </span>
        </div>
      </div>

      {/* Waiting */}
      {!question && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', textAlign: 'center' }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
            fontSize: '48px', color: '#1B3D6F', marginBottom: '8px', opacity: .4 }}>⬡</div>
          <p style={{ color: '#8B8074', fontSize: '14px', lineHeight: 1.5 }}>
            En attente de la prochaine question du facilitateur…
          </p>
        </div>
      )}

      {question && (
        <div className="anim-fadein" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <MethodCard toolName={question.tool} gate={question.gate} />

          {!answered && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '.06em', color: '#8B8074', marginBottom: '8px' }}>
                Question du facilitateur
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px' }}>
                <p style={{ flex: 1, fontSize: '17px', fontWeight: 700, color: '#1C2530', lineHeight: 1.4, margin: 0 }}>
                  {question.text}
                </p>
                <button onClick={() => speak(question.text)}
                  style={{ flexShrink: 0, width: '34px', height: '34px', borderRadius: '10px',
                    background: '#EAE5DB', border: '1px solid #CFC9BE',
                    cursor: 'pointer', fontSize: '16px' }}>🔊</button>
              </div>
              {question.type === 'slider' && <SliderWidget value={sliderVal} onChange={setSliderVal} onSubmit={submitResponse} />}
              {question.type === 'word'   && <WordWidget value={wordVal} onChange={setWordVal} onSubmit={submitResponse} />}
              {question.type === 'vote'   && <VoteWidget onSubmit={submitResponse} />}
            </div>
          )}

          {answered && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', textAlign: 'center', paddingTop: '16px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px', color: '#2A6B45' }}>✓</div>
              <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '24px', color: '#1B3D6F', marginBottom: '8px' }}>RÉPONSE ENVOYÉE</div>
              <p style={{ color: '#8B8074', fontSize: '13px' }}>
                {revealed ? 'Le facilitateur révèle les résultats…' : 'En attente des autres participants…'}
              </p>
              <p style={{ color: '#B0A898', fontSize: '11px', marginTop: '12px' }}>
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

// ── DashboardView ─────────────────────────────────────────────
writeFileSync('src/views/DashboardView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { TOOLS, FAMILY_STYLE, GATE_LABEL } from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

const DIMENSIONS = [
  { id: 'spatial',  label: 'Spatial',     families: ['Spatial/Urbain'] },
  { id: 'heritage', label: 'Héritage',    families: ['Héritage', 'Conservation'] },
  { id: 'social',   label: 'Social',      families: ['User/Participatif'] },
  { id: 'env',      label: 'Environn.',   families: ['Environnement'] },
  { id: 'eco',      label: 'Économie',    families: ['Économie'] },
  { id: 'gouv',     label: 'Gouvern.',    families: ['Gouvernance', 'EU/International'] },
]

function computeScores(practiced) {
  const pr = new Set(practiced)
  return DIMENSIONS.map(dim => {
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f))
    if (!dimTools.length) return { ...dim, score: 0, count: 0, total: 0 }
    const count = dimTools.filter(t => pr.has(t.n)).length
    return { ...dim, score: Math.round((count / dimTools.length) * 100), count, total: dimTools.length }
  })
}

function gateStats(practiced) {
  const pr = new Set(practiced)
  return [1,2,3,4].map(g => {
    const tools = TOOLS.filter(t => t.g.includes(g))
    const done  = tools.filter(t => pr.has(t.n))
    return { gate: g, done: done.length, total: tools.length,
      pct: Math.round((done.length/tools.length)*100) }
  })
}

function makeSuggestions(scores, practiced) {
  const pr = new Set(practiced)
  const suggestions = []
  for (const dim of [...scores].sort((a,b) => a.score - b.score)) {
    if (suggestions.length >= 5) break
    const dimTools = TOOLS.filter(t => dim.families.includes(t.f) && !pr.has(t.n))
    if (!dimTools.length) continue
    const top = dimTools.sort((a,b) => b.g.length - a.g.length)[0]
    suggestions.push({ dim: dim.label, tool: top,
      reason: 'Couverture "' + dim.label + '" faible (' + dim.score + '%). Cette méthode offre le meilleur levier.' })
  }
  return suggestions
}

function Radar({ scores, size = 240 }) {
  const n = scores.length
  const cx = size / 2, cy = size / 2
  const R  = size * 0.36
  const labelR = size * 0.46

  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2
  const gridPts = (r) => scores.map((_, i) => {
    const a = angle(i)
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
  const dataPts = scores.map((s, i) => {
    const a = angle(i)
    const r = (s.score / 100) * R
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  })
  const toPath = (pts) => pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ') + ' Z'
  const grids  = [0.25, 0.5, 0.75, 1].map(f => gridPts(R * f))
  const axes   = scores.map((_, i) => ({ to: gridPts(R)[i] }))
  const labelPts = scores.map((s, i) => {
    const a = angle(i)
    return { x: cx + labelR * Math.cos(a), y: cy + labelR * Math.sin(a), label: s.label, score: s.score }
  })

  return (
    <svg width={size} height={size} viewBox={"0 0 " + size + " " + size}>
      {grids.map((pts, gi) => (
        <polygon key={gi} points={pts.map(p=>p.join(',')).join(' ')}
          fill={gi === 3 ? 'rgba(27,61,111,.04)' : 'none'}
          stroke="rgba(28,37,48,.1)" strokeWidth="1" />
      ))}
      {axes.map((a, i) => (
        <line key={i} x1={cx} y1={cy} x2={a.to[0]} y2={a.to[1]}
          stroke="rgba(28,37,48,.12)" strokeWidth="1" />
      ))}
      <path d={toPath(dataPts)} fill="rgba(27,61,111,.1)" stroke="#1B3D6F" strokeWidth="2" strokeLinejoin="round" />
      {dataPts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={4} fill="#1B3D6F" />
      ))}
      {labelPts.map((lp, i) => (
        <g key={i}>
          <text x={lp.x} y={lp.y - 5} textAnchor="middle"
            style={{ fontSize: '9px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 800,
              fill: '#8B8074', textTransform: 'uppercase' }}>
            {lp.label.toUpperCase()}
          </text>
          <text x={lp.x} y={lp.y + 9} textAnchor="middle"
            style={{ fontSize: '12px', fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
              fill: lp.score >= 50 ? '#1B3D6F' : '#B0A898' }}>
            {lp.score}%
          </text>
        </g>
      ))}
    </svg>
  )
}

export function DashboardView() {
  const { practiced: practicedArr, flagged, xp, goMap, goFacilitator } = useStore(useShallow(s => ({
    practiced: s.practiced,
    flagged: s.flagged,
    xp: s.xp,
    goMap: s.goMap,
    goFacilitator: s.goFacilitator,
  })))

  const scores      = computeScores(practicedArr)
  const gates       = gateStats(practicedArr)
  const suggestions = makeSuggestions(scores, practicedArr)

  return (
    <div className="anim-fadein" style={{ paddingTop: '4px', paddingBottom: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <button onClick={goMap}
          style={{ padding: '5px 10px', borderRadius: '8px', cursor: 'pointer',
            background: '#FFFDF8', border: '1px solid #CFC9BE',
            color: '#8B8074', fontSize: '11px', fontWeight: 800 }}>← CARTE</button>
        <div className="text-mega" style={{ fontSize: 'clamp(28px,9vw,42px)', color: '#1C2530', flex: 1 }}>
          TABLEAU DE BORD
        </div>
        <button onClick={goFacilitator}
          style={{ padding: '8px 14px', borderRadius: '10px', cursor: 'pointer',
            background: '#E8EDF5', border: '1px solid rgba(27,61,111,.3)',
            color: '#1B3D6F', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '13px', fontWeight: 900 }}>
          ATELIER LIVE →
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '20px' }}>
        {[
          { label: 'XP Total',    val: xp,                col: '#B8742A', bg: '#FFF3E0' },
          { label: 'Pratiquées', val: practicedArr.length, col: '#1B5FA0', bg: '#EAF0F9' },
          { label: 'À intégrer', val: flagged.length,      col: '#7A3A8E', bg: '#F3EBF9' },
        ].map(k => (
          <div key={k.label} style={{ padding: '12px 10px', borderRadius: '12px', textAlign: 'center',
            background: k.bg, border: '1px solid ' + k.col + '33' }}>
            <div className="text-mega" style={{ fontSize: '28px', color: k.col }}>{k.val}</div>
            <div style={{ fontSize: '9px', fontWeight: 800, color: k.col, opacity: .7,
              textTransform: 'uppercase', letterSpacing: '.04em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Radar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px', borderRadius: '16px', marginBottom: '20px',
        background: '#FFFDF8', border: '1px solid #CFC9BE',
        boxShadow: '0 1px 4px rgba(28,37,48,.06)' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px', alignSelf: 'flex-start' }}>
          Couverture par dimension
        </div>
        <Radar scores={scores} size={260} />
      </div>

      {/* Gate progress */}
      <div style={{ padding: '14px', borderRadius: '14px', marginBottom: '20px',
        background: '#FFFDF8', border: '1px solid #CFC9BE' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>
          Avancement par gate
        </div>
        {gates.map(g => (
          <div key={g.gate} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  background: GATE_VOLT[g.gate], display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '9px', fontWeight: 900, color: '#fff' }}>{g.gate}</div>
                <span style={{ fontSize: '12px', color: '#4A4540', fontWeight: 700 }}>
                  {GATE_LABEL[g.gate]}
                </span>
              </div>
              <span className="text-mega" style={{ fontSize: '16px',
                color: g.pct >= 50 ? GATE_VOLT[g.gate] : '#B0A898' }}>
                {g.done}/{g.total}
              </span>
            </div>
            <div style={{ height: '6px', borderRadius: '3px', background: '#E0DAD2', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: '3px', width: g.pct + '%',
                background: GATE_VOLT[g.gate], transition: 'width .6s' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div style={{ padding: '14px', borderRadius: '14px',
        background: '#FFFDF8', border: '1px solid #CFC9BE' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
          textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '12px' }}>
          5 actions recommandées
        </div>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#2A6B45', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '20px', fontWeight: 900, padding: '16px 0' }}>
            TOUTES LES DIMENSIONS COUVERTES 🏆
          </div>
        ) : suggestions.map((s, i) => {
          const fam = FAMILY_STYLE[s.tool.f] || {}
          return (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start',
              padding: '10px', borderRadius: '10px', marginBottom: '6px',
              background: '#F5F1EB', border: '1px solid #E0DAD2' }}>
              <div style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '6px',
                background: '#1B3D6F', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
                fontSize: '14px', color: '#FFFFFF' }}>
                {i+1}
              </div>
              <div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', fontWeight: 700,
                  color: '#1C2530', marginBottom: '2px' }}>{s.tool.n}</div>
                <div style={{ fontSize: '11px', color: '#8B8074', lineHeight: 1.4 }}>{s.reason}</div>
                <div style={{ marginTop: '4px', display: 'flex', gap: '4px' }}>
                  {s.tool.g.map(g => (
                    <div key={g} style={{ width: '14px', height: '14px', borderRadius: '50%',
                      background: GATE_VOLT[g], fontSize: '7px', fontWeight: 900, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g}</div>
                  ))}
                  <span style={{ fontSize: '10px', color: '#B0A898', marginLeft: '4px' }}>
                    {fam.icon} {s.tool.f}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
`.trimStart())
console.log('DashboardView OK')
