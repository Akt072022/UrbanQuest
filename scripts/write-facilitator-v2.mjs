import { writeFileSync } from 'fs'

// ── FacilitatorView v2 — Triage + Discussion ──────────────────
writeFileSync('src/views/FacilitatorView.jsx', `
import { useState, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { QRCode } from '../components/QRCode'
import { makeRoomId, openChannel, sendMsg, subscribe, participantUrl } from '../lib/session'
import { TOOLS, GATE_LABEL } from '../data/tools'

const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']
const FAMILIES = [...new Set(TOOLS.map(t => t.f))].sort()

const QUESTIONS = [
  { id: 'q1', text: 'Quel est votre principal blocage sur cette méthode ?', type: 'word' },
  { id: 'q2', text: 'Dans quelle mesure votre organisation est-elle prête à l\u2019adopter ?', type: 'slider' },
  { id: 'q3', text: 'Cette méthode doit-elle être priorisée pour la prochaine phase ?', type: 'vote' },
]

function ResponseBar({ label, value, max, col }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
        <span style={{ fontSize: '12px', color: '#5A5550', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: '12px', color: col, fontWeight: 800 }}>{value}</span>
      </div>
      <div style={{ height: '5px', borderRadius: '3px', background: '#E0DAD2', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: '3px', width: pct + '%',
          background: col, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

function TriageHeatmap({ trageResponses, toolList, participantCount }) {
  // trageResponses: [{ participantId, tool, status, level }]
  const stats = toolList.map(t => {
    const rs = trageResponses.filter(r => r.tool === t.n)
    return {
      name: t.n,
      unknown:   rs.filter(r => r.status === 'unknown').length,
      known:     rs.filter(r => r.status === 'known').length,
      practiced: rs.filter(r => r.status === 'practiced').length,
      avgLevel:  rs.filter(r => r.status === 'practiced' && r.level > 0).length > 0
        ? (rs.filter(r => r.status === 'practiced').reduce((a,r) => a + (r.level||0), 0)
            / rs.filter(r => r.status === 'practiced').length).toFixed(1)
        : null,
      // divergence = those who practiced AND those who are unknown — best for discussion
      divergence: rs.filter(r => r.status === 'practiced').length > 0
        && rs.filter(r => r.status === 'unknown').length > 0
    }
  })

  const top = [...stats].sort((a,b) => b.practiced - a.practiced)

  return (
    <div>
      <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>
        Résultats triage — {trageResponses.length} réponses / {participantCount} participants
      </div>
      {top.map(s => {
        const total = s.unknown + s.known + s.practiced
        const pctP = total > 0 ? Math.round(s.practiced/total*100) : 0
        const pctK = total > 0 ? Math.round(s.known/total*100) : 0
        return (
          <div key={s.name} style={{ marginBottom: '8px', padding: '8px 10px', borderRadius: '10px',
            background: s.divergence ? '#FFF8ED' : '#F5F1EB',
            border: '1px solid ' + (s.divergence ? '#C17B2A44' : '#E0DAD2') }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#1C2530',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.divergence ? '⚡ ' : ''}{s.name}
              </span>
              {s.avgLevel && <span style={{ fontSize: '11px', color: '#2A6B45', fontWeight: 800,
                flexShrink: 0, marginLeft: '8px' }}>moy. {s.avgLevel}/5</span>}
            </div>
            {/* Stacked bar */}
            <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden',
              background: '#E0DAD2' }}>
              <div style={{ width: pctP + '%', background: '#2A6B45', transition: 'width .5s' }} />
              <div style={{ width: pctK + '%', background: '#B8742A', transition: 'width .5s' }} />
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', fontSize: '9px', fontWeight: 700 }}>
              <span style={{ color: '#2A6B45' }}>● Pratiqué {s.practiced}</span>
              <span style={{ color: '#B8742A' }}>● Connu {s.known}</span>
              <span style={{ color: '#B0A898' }}>● Inconnu {s.unknown}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FacilitatorView() {
  const { goMap, setSession, sessionId: savedRoomId } = useStore(useShallow(s => ({
    goMap: s.goMap,
    setSession: s.setSession,
    sessionId: s.sessionId,
  })))

  const [roomId] = useState(savedRoomId || makeRoomId())
  const [started, setStarted] = useState(false) // always false on mount — reopen channel
  const [tab, setTab] = useState('triage') // 'triage' | 'question'

  // Setup filters
  const [filterGate, setFilterGate] = useState(1)
  const [filterFamily, setFilterFamily] = useState('all')

  // Session state
  const [participants, setParticipants] = useState([])
  const [triageResponses, setTriageResponses] = useState([]) // [{ participantId, tool, status, level }]
  const [triageStarted, setTriageStarted] = useState(false)
  const [triageDone, setTriageDone] = useState([]) // participantIds who finished

  // Question mode
  const [responses, setResponses] = useState([])
  const [currentQ, setCurrentQ] = useState(QUESTIONS[0])
  const [revealed, setRevealed] = useState(false)
  const [activeTool, setActiveTool] = useState(null)

  const channelRef = useRef(null)
  const url = participantUrl(roomId)

  // Filtered tool list
  const toolList = TOOLS.filter(t => {
    const gateOk = t.g.includes(filterGate)
    const famOk  = filterFamily === 'all' || t.f === filterFamily
    return gateOk && famOk
  })

  const openChan = () => {
    const ch = openChannel(roomId)
    channelRef.current = ch
    subscribe(ch, (msg) => {
      if (msg.type === 'pong') {
        setParticipants(prev => prev.includes(msg.payload.participantId)
          ? prev : [...prev, msg.payload.participantId])
      }
      if (msg.type === 'triage_card') {
        setTriageResponses(prev => [...prev, msg.payload])
      }
      if (msg.type === 'triage_done') {
        setTriageDone(prev => prev.includes(msg.payload.participantId)
          ? prev : [...prev, msg.payload.participantId])
      }
      if (msg.type === 'response') {
        setResponses(prev => [...prev, msg.payload])
      }
    })
  }

  const startSession = () => {
    openChan()
    setSession(roomId, 'facilitator')
    setStarted(true)
    sendMsg(channelRef.current, { type: 'ping' })
  }

  const launchTriage = () => {
    if (!channelRef.current) return
    setTriageResponses([])
    setTriageDone([])
    setTriageStarted(true)
    sendMsg(channelRef.current, {
      type: 'triage_start',
      payload: {
        gate: filterGate,
        tools: toolList.map(t => ({ n: t.n, def: t.def, f: t.f, g: t.g })),
      },
    })
  }

  const broadcast = (q) => {
    if (!channelRef.current || !activeTool) return
    setCurrentQ(q)
    setResponses([])
    setRevealed(false)
    sendMsg(channelRef.current, {
      type: 'question',
      payload: { questionId: q.id, text: q.text, type: q.type, tool: activeTool.n, gate: filterGate },
    })
  }

  const revealResults = () => {
    setRevealed(true)
    if (channelRef.current) sendMsg(channelRef.current, { type: 'reveal' })
  }

  const speakQ = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'fr-FR'
    window.speechSynthesis.speak(u)
  }

  const sliderAvg = responses.length
    ? (responses.reduce((a, r) => a + (Number(r.value) || 0), 0) / responses.length).toFixed(1)
    : '\u2014'

  const wordFreq = {}
  responses.forEach(r => {
    String(r.value).toLowerCase().split(/\\s+/).forEach(w => {
      if (w.length > 2) wordFreq[w] = (wordFreq[w] || 0) + 1
    })
  })
  const topWords = Object.entries(wordFreq).sort((a,b) => b[1]-a[1]).slice(0,8)

  useEffect(() => () => channelRef.current?.close(), [])

  // ── Pre-start ──────────────────────────────────────────────────
  if (!started) {
    const filteredCount = toolList.length
    return (
      <div className="anim-fadein" style={{ paddingTop: '8px', paddingBottom: '32px' }}>
        <button onClick={goMap} style={{ fontSize: '12px', fontWeight: 800, color: '#8B8074',
          background: 'none', border: 'none', cursor: 'pointer', marginBottom: '20px' }}>← CARTE</button>

        <div className="text-mega" style={{ fontSize: 'clamp(32px,10vw,52px)',
          color: '#1C2530', lineHeight: .9, marginBottom: '4px' }}>ATELIER</div>
        <div className="text-mega" style={{ fontSize: 'clamp(32px,10vw,52px)',
          color: '#1B3D6F', marginBottom: '20px' }}>LIVE</div>

        {/* Step 1 — Configurer le périmètre */}
        <div style={{ padding: '14px', borderRadius: '14px', background: '#FFFFFF',
          border: '1px solid #E0DAD2', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>
            Étape 1 — Périmètre de la session
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#5A5550', marginBottom: '6px' }}>Gate (étape du processus)</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[1,2,3,4].map(g => (
                <button key={g} onClick={() => setFilterGate(g)}
                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', cursor: 'pointer',
                    border: '2px solid ' + (filterGate === g ? GATE_COL[g] : '#E0DAD2'),
                    background: filterGate === g ? GATE_COL[g] + '15' : '#F5F1EB',
                    color: filterGate === g ? GATE_COL[g] : '#8B8074',
                    fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 900 }}>
                  G{g}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#5A5550', marginBottom: '6px' }}>Famille de méthodes (optionnel)</div>
            <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '10px',
                border: '1px solid #E0DAD2', background: '#F5F1EB', color: '#1C2530',
                fontSize: '13px', outline: 'none', fontWeight: 600 }}>
              <option value="all">Toutes les familles</option>
              {FAMILIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div style={{ padding: '10px', borderRadius: '10px', background: '#EAF0F9',
            border: '1px solid rgba(27,61,111,.2)', textAlign: 'center' }}>
            <div className="text-mega" style={{ fontSize: '28px', color: '#1B3D6F' }}>{filteredCount}</div>
            <div style={{ fontSize: '10px', color: '#1B5FA0', fontWeight: 700 }}>
              outils sélectionnés pour le triage
            </div>
            <div style={{ fontSize: '9px', color: '#8B8074', marginTop: '2px' }}>
              ≈ {Math.ceil(filteredCount * 0.4)} min pour les participants
            </div>
          </div>
        </div>

        {/* Step 2 — Code de session */}
        <div style={{ padding: '14px', borderRadius: '14px', background: '#FFFFFF',
          border: '1px solid #E0DAD2', marginBottom: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
            Étape 2 — Code de session
          </div>
          <div className="text-mega" style={{ fontSize: '44px', color: '#1B3D6F',
            letterSpacing: '.08em', marginBottom: '4px' }}>{roomId}</div>
          <div style={{ fontSize: '10px', color: '#8B8074' }}>
            Les participants rejoignent sur leur smartphone
          </div>
        </div>

        <button onClick={startSession}
          style={{ width: '100%', padding: '16px', borderRadius: '12px', cursor: 'pointer',
            background: '#1B3D6F', color: '#FFFFFF', border: 'none',
            fontFamily: 'Barlow Condensed, sans-serif', fontSize: '20px', fontWeight: 900,
            boxShadow: '0 4px 16px rgba(27,61,111,.2)' }}>
          OUVRIR LA SESSION →
        </button>
      </div>
    )
  }

  // ── Session active ─────────────────────────────────────────────
  return (
    <div className="anim-fadein" style={{ paddingTop: '8px', paddingBottom: '32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <button onClick={goMap} style={{ fontSize: '11px', fontWeight: 800, color: '#8B8074',
          background: '#F5F1EB', border: '1px solid #E0DAD2',
          borderRadius: '8px', padding: '5px 10px', cursor: 'pointer' }}>← CARTE</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
            fontSize: '18px', color: '#1B3D6F' }}>SESSION {roomId}</div>
          <div style={{ fontSize: '10px', color: '#8B8074' }}>
            {participants.length} connecté{participants.length > 1 ? 's' : ''}
            {triageDone.length > 0 ? ' · ' + triageDone.length + ' triage(s) terminé(s)' : ''}
          </div>
        </div>
        <div style={{ padding: '4px 8px', borderRadius: '8px',
          background: '#E6F4EC', border: '1px solid #C3E6C9',
          fontSize: '9px', fontWeight: 800, color: '#2A6B45', textTransform: 'uppercase' }}>● LIVE</div>
      </div>

      {/* QR compact */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px',
        borderRadius: '12px', background: '#FFFFFF', border: '1px solid #E0DAD2', marginBottom: '12px' }}>
        <QRCode value={url} size={60} />
        <div>
          <div style={{ fontSize: '9px', fontWeight: 800, color: '#8B8074',
            textTransform: 'uppercase', marginBottom: '2px' }}>Rejoindre</div>
          <div style={{ fontSize: '10px', color: '#1B3D6F', wordBreak: 'break-all' }}>{url}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid #E0DAD2', marginBottom: '14px', background: '#F5F1EB' }}>
        {[['triage','⬡ TRIAGE COLLECTIF'],['question','● QUESTION LIVE']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
              background: tab === id ? '#1B3D6F' : 'transparent',
              color: tab === id ? '#fff' : '#8B8074',
              fontFamily: 'Barlow Condensed, sans-serif', fontSize: '13px', fontWeight: 900 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB TRIAGE ─────────────────────────────────────────── */}
      {tab === 'triage' && (
        <div>
          {!triageStarted ? (
            <div>
              <div style={{ padding: '12px', borderRadius: '12px', background: '#FFFFFF',
                border: '1px solid #E0DAD2', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
                  textTransform: 'uppercase', marginBottom: '8px' }}>Deck sélectionné</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#1C2530', fontWeight: 600 }}>
                    Gate {filterGate} · {filterFamily !== 'all' ? filterFamily : 'Toutes familles'}
                  </span>
                  <span className="text-mega" style={{ fontSize: '20px', color: '#1B3D6F' }}>
                    {toolList.length} outils
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {toolList.slice(0,6).map(t => (
                    <div key={t.n} style={{ padding: '2px 8px', borderRadius: '6px',
                      background: '#F5F1EB', border: '1px solid #E0DAD2',
                      fontSize: '10px', color: '#5A5550' }}>{t.n}</div>
                  ))}
                  {toolList.length > 6 && (
                    <div style={{ padding: '2px 8px', borderRadius: '6px',
                      background: '#E8EDF5', border: '1px solid rgba(27,61,111,.2)',
                      fontSize: '10px', color: '#1B5FA0', fontWeight: 700 }}>
                      +{toolList.length - 6} autres
                    </div>
                  )}
                </div>
              </div>
              <p style={{ fontSize: '12px', color: '#8B8074', lineHeight: 1.5,
                marginBottom: '14px', padding: '0 2px' }}>
                Chaque participant verra les {toolList.length} outils et indiquera pour chacun : <strong>Inconnu / Connu / Je pratique (+ niveau 1-5)</strong>. Durée estimée : {Math.ceil(toolList.length * 0.4)} min.
              </p>
              <button onClick={launchTriage}
                style={{ width: '100%', padding: '15px', borderRadius: '12px', cursor: 'pointer',
                  background: participants.length === 0 ? '#E0DAD2' : '#1B3D6F',
                  color: participants.length === 0 ? '#8B8074' : '#fff',
                  border: 'none', fontFamily: 'Barlow Condensed, sans-serif',
                  fontSize: '18px', fontWeight: 900 }}>
                {participants.length === 0 ? 'EN ATTENTE DE PARTICIPANTS…' : 'LANCER LE TRIAGE →'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#2A6B45',
                  textTransform: 'uppercase' }}>
                  ● TRIAGE EN COURS
                </div>
                <button onClick={launchTriage}
                  style={{ padding: '4px 10px', borderRadius: '8px', cursor: 'pointer',
                    background: '#F5F1EB', border: '1px solid #E0DAD2',
                    color: '#8B8074', fontSize: '10px', fontWeight: 800 }}>
                  RELANCER
                </button>
              </div>
              <TriageHeatmap
                trageResponses={triageResponses}
                toolList={toolList}
                participantCount={participants.length}
              />
            </div>
          )}
        </div>
      )}

      {/* ── TAB QUESTION ──────────────────────────────────────── */}
      {tab === 'question' && (
        <div>
          {/* Sélection outil */}
          <div style={{ padding: '12px', borderRadius: '12px', background: '#FFFFFF',
            border: '1px solid #E0DAD2', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
              textTransform: 'uppercase', marginBottom: '8px' }}>Outil en discussion</div>
            <select
              value={activeTool?.n || ''}
              onChange={e => {
                const t = TOOLS.find(t => t.n === e.target.value)
                setActiveTool(t || null)
              }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '10px',
                border: '1px solid #E0DAD2', background: '#F5F1EB', color: '#1C2530',
                fontSize: '13px', outline: 'none', fontWeight: 600 }}>
              <option value="">— Choisir un outil —</option>
              {toolList.map(t => <option key={t.n} value={t.n}>{t.n}</option>)}
              {filterFamily !== 'all' && <option disabled>── Tous les outils ──</option>}
              {filterFamily !== 'all' && TOOLS.filter(t => !toolList.find(tl => tl.n === t.n))
                .map(t => <option key={t.n} value={t.n}>{t.n}</option>)}
            </select>
          </div>

          {/* Questions */}
          <div style={{ padding: '12px', borderRadius: '12px', background: '#FFFFFF',
            border: '1px solid #E0DAD2', marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#8B8074',
              textTransform: 'uppercase', marginBottom: '8px' }}>Envoyer une question</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {QUESTIONS.map(q => (
                <div key={q.id} style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => broadcast(q)} disabled={!activeTool}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: '10px',
                      cursor: activeTool ? 'pointer' : 'default', textAlign: 'left',
                      background: currentQ.id === q.id ? '#E8EDF5' : '#F5F1EB',
                      border: '1px solid ' + (currentQ.id === q.id ? '#1B3D6F' : '#E0DAD2'),
                      color: currentQ.id === q.id ? '#1B3D6F' : (activeTool ? '#5A5550' : '#B0A898'),
                      fontSize: '11px', fontWeight: 600 }}>
                    {q.text}
                  </button>
                  <button onClick={() => speakQ(q.text)}
                    style={{ width: '32px', height: '32px', flexShrink: 0, marginTop: '2px',
                      borderRadius: '8px', cursor: 'pointer',
                      background: '#F5F1EB', border: '1px solid #E0DAD2',
                      color: '#6B6460', fontSize: '13px' }}>🔊</button>
                </div>
              ))}
            </div>
            {!activeTool && (
              <div style={{ fontSize: '10px', color: '#C0452A', marginTop: '6px', fontStyle: 'italic' }}>
                Sélectionnez d\u2019abord un outil ci-dessus.
              </div>
            )}
          </div>

          {/* Résultats */}
          <div style={{ padding: '12px', borderRadius: '12px', background: '#FFFFFF',
            border: '1px solid #E0DAD2' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '10px' }}>
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
                <div className="text-mega" style={{ fontSize: '44px', color: '#1B3D6F',
                  textAlign: 'center', marginBottom: '10px' }}>
                  {sliderAvg}<span style={{ fontSize: '18px', color: '#8B8074' }}>/5</span>
                </div>
                <ResponseBar label="Pas prêt (0-1)" value={responses.filter(r=>r.value<2).length}
                  max={responses.length} col="#C0452A" />
                <ResponseBar label="En développement (2-3)" value={responses.filter(r=>r.value>=2&&r.value<4).length}
                  max={responses.length} col="#C17B2A" />
                <ResponseBar label="Prêt à adopter (4-5)" value={responses.filter(r=>r.value>=4).length}
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

            {currentQ.type === 'vote' && responses.length > 0 && (() => {
              const opts = ['Oui, prioritaire', 'Peut-\u00eatre', 'Pas pour cette phase']
              return opts.map(o => (
                <ResponseBar key={o} label={o}
                  value={responses.filter(r => r.value === o).length}
                  max={responses.length} col="#1B5FA0" />
              ))
            })()}

            {responses.length === 0 && (
              <div style={{ textAlign: 'center', color: '#B0A898', fontSize: '13px',
                padding: '16px 0', fontStyle: 'italic' }}>
                En attente de réponses…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
`.trimStart())
console.log('FacilitatorView v2 OK')
