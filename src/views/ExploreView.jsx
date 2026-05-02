import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_LABEL, TOOLS, DIM_BY_ID,
  toolsForGate, toolsForGateDim, practicedForGate,
  DIMENSIONS, SKILL_LEVELS,
  scoreForGateDim,
} from '../data/tools'
import { canvasUrl, canvasThumbUrl, CANVAS_FILES } from '../data/canvas'
import { GateSymbol, stageFromRatio } from '../components/GateSymbol'
import { ScrappyButton, ScrappyChip } from '../components/ScrappyButton'

const INK = '#1C2530'
const YELLOW = '#F5C84A'
const TEAL = '#6FCBC9'
const CORAL = '#E57E72'
const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']

function gateRgba(g, a) {
  const m = { 1: '193,123,42', 2: '27,95,160', 3: '42,107,69', 4: '122,58,142' }
  return `rgba(${m[g]},${a})`
}

// ── TTS ───────────────────────────────────────────────────────
// Default: browser's built-in SpeechSynthesis (free, local).
// To swap to an external TTS (e.g. Voxtral, OpenAI, ElevenLabs),
// implement the same shape as `browserSpeak` and wire it in
// `playTTS` below — see comment block in playTTS.
function browserSpeak(text, { onStart, onEnd } = {}) {
  if (!window.speechSynthesis) return null
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.95
  const en = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'))
  if (en) u.voice = en
  u.onstart = () => onStart?.()
  u.onend   = () => onEnd?.()
  u.onerror = () => onEnd?.()
  window.speechSynthesis.speak(u)
  return {
    cancel: () => { window.speechSynthesis?.cancel() },
  }
}

export function stopTTS() {
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

// Voxtral TTS — Mistral's hosted text-to-speech API.
// Endpoint: POST https://api.mistral.ai/v1/audio/speech
// Body:     { input, model, voice_id, response_format }
// Response: application/json → { audio_data: "<base64-encoded MP3>" }
// We default to one of the built-in neutral English presets so no
// voice cloning / dashboard setup is needed. Override via env var if
// you want a different mood (e.g. en_paul_cheerful, gb_oliver_neutral)
// or a French voice (fr_marie_neutral). Full list of presets:
//   https://huggingface.co/spaces/mistralai/voxtral-tts-demo
async function voxtralSpeak(text, { onStart, onEnd } = {}) {
  const key   = import.meta.env.VITE_MISTRAL_API_KEY
  const url   = import.meta.env.VITE_MISTRAL_TTS_URL || 'https://api.mistral.ai/v1/audio/speech'
  const model = import.meta.env.VITE_MISTRAL_TTS_MODEL || 'voxtral-mini-tts-2603'
  const voice = import.meta.env.VITE_MISTRAL_TTS_VOICE_ID || 'en_paul_neutral'
  if (!key) return null

  let cancelled = false
  let audio = null
  try {
    const body = {
      input: text,
      model,
      voice_id: voice,
      response_format: 'mp3',
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.warn('[Voxtral TTS] HTTP', res.status, err)
      return null
    }

    const json = await res.json()
    const b64  = json?.audio_data
    if (!b64) {
      console.warn('[Voxtral TTS] response had no audio_data field')
      return null
    }
    if (cancelled) return null

    // base64 → bytes → Blob URL the <audio> element can play
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'audio/mpeg' })
    const objUrl = URL.createObjectURL(blob)

    audio = new Audio(objUrl)
    audio.onplay  = () => onStart?.()
    audio.onended = () => { onEnd?.(); URL.revokeObjectURL(objUrl) }
    audio.onerror = () => { onEnd?.(); URL.revokeObjectURL(objUrl) }
    audio.play().catch(() => onEnd?.())
  } catch (err) {
    console.warn('[Voxtral TTS] failed, falling back to browser:', err)
    return null
  }
  return {
    cancel: () => {
      cancelled = true
      if (audio) { audio.pause(); audio.currentTime = 0 }
    },
  }
}

export function playTTS(tool, { onStart, onEnd } = {}) {
  const text = [tool.n + '.', tool.def, 'Practitioner tip:', tool.t].join(' ')
  // 1) Try Voxtral first if the API key is set
  const tryVoxtral = voxtralSpeak(text, { onStart, onEnd })
  // voxtralSpeak is async; return a handle that cancels whichever
  // backend ends up playing (Voxtral or the browser fallback).
  let active = null
  tryVoxtral.then(handle => {
    if (handle) { active = handle }
    else { active = browserSpeak(text, { onStart, onEnd }) }   // fallback
  })
  return {
    cancel: () => { active?.cancel?.(); stopTTS() },
  }
}

// (PillButton removed — using shared ScrappyButton)

// ── Gate complete celebration ─────────────────────────────────
function GateComplete({ gate }) {
  const { goMap, practiced } = useStore(useShallow(s => ({
    goMap: s.goMap, practiced: s.practiced,
  })))
  const tools = toolsForGate(gate)
  const pr    = practicedForGate(gate, practiced)
  const col   = GATE_COL[gate]

  // Per-dim scores → drive the same radar polygon as the map.
  const dims = DIMENSIONS.map(dim => ({
    id:    dim.id,
    total: toolsForGateDim(gate, dim.id).length,
    score: scoreForGateDim(gate, dim.id, practiced),
  }))
  const RAD = 92
  const angles = [30, 90, 150, 210, 270, 330].map(a => a * Math.PI / 180)
  const polyStr = (radii) => angles.map((a, i) => {
    const r = radii[i]
    return `${(r * Math.sin(a)).toFixed(1)},${(-r * Math.cos(a)).toFixed(1)}`
  }).join(' ')
  const outerPts    = polyStr(angles.map(() => RAD))
  const progressPts = polyStr(dims.map(d => RAD * (d.total > 0 ? d.score / d.total : 0)))
  const VB = (RAD + 8) * 2

  return (
    <div className="anim-fadein" style={{ textAlign: 'center', padding: '40px 16px' }}>
      <div style={{
        width: VB, height: VB, margin: '0 auto 18px',
      }}>
        <svg width="100%" height="100%"
          viewBox={`${-VB/2} ${-VB/2} ${VB} ${VB}`}
          style={{ display: 'block', overflow: 'visible' }}>
          <polygon points={outerPts}
            fill="#F2EDE4" stroke={INK} strokeWidth={3}
            strokeLinejoin="round" />
          {angles.map((a, i) => (
            <line key={i}
              x1={0} y1={0}
              x2={(RAD * Math.sin(a)).toFixed(1)}
              y2={(-RAD * Math.cos(a)).toFixed(1)}
              stroke={INK} strokeWidth={1} opacity={0.18} />
          ))}
          <polygon points={progressPts}
            fill={col} fillOpacity={0.85}
            stroke={col} strokeWidth={3}
            strokeLinejoin="round" />
          <circle cx={0} cy={0} r={3} fill={INK} />
        </svg>
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 'clamp(28px,8vw,42px)', color: col, lineHeight: 1,
        textTransform: 'uppercase', letterSpacing: '.02em',
        padding: '0 16px',
      }}>
        {GATE_LABEL[gate]}
      </div>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 18, color: INK, marginTop: 8, marginBottom: 22,
        letterSpacing: '.05em',
      }}>
        CLEARED
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', borderRadius: 999,
        background: '#FFFFFF', border: `2.5px solid ${INK}`,
        boxShadow: 'none', marginBottom: 28,
      }}>
        <span style={{ fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 26, color: col }}>
          {pr}/{tools.length}
        </span>
        <span style={{ fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontSize: 14, color: '#5A5550', fontWeight: 700 }}>
          methods evaluated
        </span>
      </div>
      <br />
      <ScrappyButton onClick={goMap} color={YELLOW}>
        BACK TO MAP →
      </ScrappyButton>
    </div>
  )
}

// ── Evaluation modal — opens after a swipe-right ("I know it") so
// the user qualifies the depth of their knowledge. The chosen level
// is stored on practiced[name] and drives the radar polygon depth
// + the dashboard diagnostic.
export function EvaluationModal({ tool, onPick, onCancel }) {
  // Click options: regular > occasional > theory. Keyed colours mirror
  // the radar fill so users learn the visual language.
  const OPTIONS = [
    { level: 'regular',    color: '#2A6B45', short: 'Regular',
      hint: 'I use it routinely on real projects.' },
    { level: 'occasional', color: '#C17B2A', short: 'Occasional',
      hint: 'I have run it a handful of times.' },
    { level: 'theory',     color: '#5A5550', short: 'Theoretical',
      hint: 'I know how it works but have not run it.' },
  ]
  // Esc to cancel; lock body scroll while open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Close on direct backdrop tap only — never via bubbled clicks from
  // the inner card. Avoids "click swallowed by closing modal" bugs on
  // mobile where stopPropagation can be unreliable across event types.
  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel()
  }

  // Render via a portal directly under <body> so the modal sits above
  // every transformed/overflow ancestor in the tree. Without this, on
  // some mobile browsers the SwipeWrap's transform/touch-action
  // settings could interfere with click delivery.
  return createPortal((
    <div onClick={onBackdropClick}
      role="dialog" aria-modal="true" aria-label="How do you know this tool?"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(28,37,48,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 18, animation: 'lb-fade .15s ease',
        touchAction: 'manipulation',
      }}>
      <div
        style={{
          width: '100%', maxWidth: 380,
          background: '#FFFDF8',
          border: `3px solid ${INK}`,
          borderRadius: 18,
          padding: '20px 18px 16px',
          boxShadow: '4px 4px 0 ' + INK,
        }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 11, color: '#9C958A', letterSpacing: '.08em',
          textTransform: 'uppercase', marginBottom: 4,
        }}>How well do you know it?</div>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 18, color: INK, lineHeight: 1.2, marginBottom: 14,
        }}>{tool.n}</div>

        {OPTIONS.map(opt => (
          <button key={opt.level}
            type="button"
            onClick={() => onPick(opt.level)}
            className="eval-opt"
            style={{
              display: 'block', width: '100%',
              textAlign: 'left',
              padding: '12px 14px',
              marginBottom: 10,
              background: '#FFFFFF',
              border: `2.5px solid ${INK}`,
              borderRadius: 14,
              cursor: 'pointer',
              boxShadow: '2px 2px 0 ' + INK,
              transition: 'transform .08s, box-shadow .08s',
            }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 2,
              pointerEvents: 'none',  // children must never steal the click
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: '50%',
                background: opt.color, border: `2px solid ${INK}`,
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900, fontSize: 16, color: INK,
                letterSpacing: '.04em', textTransform: 'uppercase',
              }}>{opt.short}</span>
            </div>
            <div style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif',
              fontWeight: 600, fontSize: 12, color: '#5A5550',
              paddingLeft: 24,
              pointerEvents: 'none',
            }}>{opt.hint}</div>
          </button>
        ))}
        <style>{`
          .eval-opt:active {
            transform: translate(1px, 1px);
            box-shadow: 1px 1px 0 ${INK};
          }
        `}</style>

        <button onClick={onCancel}
          style={{
            display: 'block', width: '100%',
            marginTop: 4,
            padding: '8px',
            background: 'transparent', border: 'none',
            cursor: 'pointer',
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 12, color: '#9C958A',
            letterSpacing: '.06em', textTransform: 'uppercase',
          }}>Cancel</button>
      </div>
    </div>
  ), document.body)
}

// ── Image lightbox — fullscreen viewer with zoom toggle ──────
//   • Click backdrop or × button → close
//   • Click the image → toggle 1× ↔ 2.4× (zoomed view scrolls in
//     its container, both touch & wheel)
//   • Pointer + touch friendly; keyboard "Escape" also closes.
export function ImageLightbox({ src, alt, onClose }) {
  const [zoomed, setZoomed] = useState(false)
  const scrollRef = useRef(null)

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Recentre the scroll container when toggling zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (zoomed) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
      el.scrollTop  = (el.scrollHeight - el.clientHeight) / 2
    }
  }, [zoomed])

  return (
    <div onClick={onClose}
      role="dialog" aria-modal="true" aria-label="Image preview"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'lb-fade .15s ease',
      }}>
      <button onClick={onClose}
        aria-label="Close"
        style={{
          position: 'absolute', top: 14, right: 14,
          width: 40, height: 40, borderRadius: '50%',
          background: '#FFFFFF', color: INK,
          border: `2.5px solid ${INK}`,
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900, fontSize: 22, lineHeight: 1,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 0 ' + INK,
        }}>×</button>
      <div ref={scrollRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '92vw', maxHeight: '88vh',
          overflow: zoomed ? 'auto' : 'hidden',
          borderRadius: 12,
          background: '#F2EDE4',
          cursor: zoomed ? 'zoom-out' : 'zoom-in',
          touchAction: zoomed ? 'pan-x pan-y' : 'manipulation',
        }}>
        <img src={src} alt={alt} draggable={false}
          onClick={() => setZoomed(z => !z)}
          style={{
            display: 'block',
            // Unzoomed: contain inside the viewport. Zoomed: render at
            // ~2.4× the largest viewport dimension so panning is real.
            width:  zoomed ? 'min(220vw, 220vh)' : '100%',
            height: zoomed ? 'auto' : 'auto',
            maxWidth:  zoomed ? 'none' : '92vw',
            maxHeight: zoomed ? 'none' : '88vh',
            objectFit: 'contain',
            userSelect: 'none',
            transition: 'width .25s ease',
          }} />
      </div>
      {/* Hint chip — fades after first interaction */}
      <div style={{
        position: 'absolute', bottom: 18, left: '50%',
        transform: 'translateX(-50%)',
        padding: '6px 12px',
        background: 'rgba(255,255,255,0.92)',
        border: `2px solid ${INK}`, borderRadius: 999,
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontWeight: 900, fontSize: 11,
        color: INK, letterSpacing: '.05em', textTransform: 'uppercase',
        pointerEvents: 'none',
      }}>{zoomed ? 'Drag to pan · click to zoom out' : 'Click image to zoom'}</div>
      <style>{`@keyframes lb-fade { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  )
}

// ── Cover (face A) ────────────────────────────────────────────
export function CardCover({ tool, gate }) {
  const col = GATE_COL[gate]
  const toolNum = tool ? TOOLS.indexOf(tool) + 1 : null
  const thumbSrc = toolNum ? canvasThumbUrl(toolNum) : null
  const [thumbOk, setThumbOk] = useState(!!thumbSrc)
  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 6,
        background: col,
      }} />
      {/* Slide-3 preview when available; gate symbol otherwise. */}
      {thumbSrc && thumbOk ? (
        <div style={{
          width: '92%', aspectRatio: '4 / 3',
          border: `2px solid ${INK}`, borderRadius: 14,
          background: '#FFFFFF', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src={thumbSrc} alt={`${tool?.n} canvas preview`}
            onError={() => setThumbOk(false)}
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
              userSelect: 'none', pointerEvents: 'none',
            }} />
        </div>
      ) : (
        <div style={{ width: 120, height: 120, padding: 4 }}>
          <GateSymbol gate={gate} stage={5} color={col} locked={false} />
        </div>
      )}
      {tool?.n && (
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 16, color: INK, marginTop: 14, lineHeight: 1.15,
          textAlign: 'center', maxWidth: '92%',
        }}>{tool.n}</div>
      )}
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 13, color: col, marginTop: 6, letterSpacing: '.04em',
      }}>
        {GATE_LABEL[gate]}{toolNum ? ` · #${String(toolNum).padStart(3,'0')}` : ''}
      </div>
    </div>
  )
}

// ── Synthesis face (face B) ───────────────────────────────────
export function CardSynthesis({ tool, gate, onDive }) {
  const toolNum  = TOOLS.indexOf(tool) + 1
  const col      = GATE_COL[gate]
  const thumbSrc = canvasThumbUrl(toolNum)
  const [thumbOk, setThumbOk] = useState(true)
  const [zoom, setZoom]       = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const handleRef = useRef(null)

  // Reset thumbnail load state whenever the displayed tool changes,
  // otherwise a previously-failed load would prevent the next image.
  useEffect(() => { setThumbOk(true); setZoom(false) }, [toolNum])

  // Stop speech when this card unmounts or the tool changes
  useEffect(() => () => {
    handleRef.current?.cancel?.()
    stopTTS()
    setSpeaking(false)
  }, [tool])

  const toggleSpeak = (e) => {
    e.stopPropagation()
    if (speaking) {
      handleRef.current?.cancel?.()
      stopTTS()
      setSpeaking(false)
      return
    }
    handleRef.current = playTTS(tool, {
      onStart: () => setSpeaking(true),
      onEnd:   () => setSpeaking(false),
    })
    // Some browsers don't fire onstart synchronously
    setSpeaking(true)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Slide-3 preview banner — click opens a fullscreen lightbox
          with zoom for reading the canvas at full resolution. */}
      {thumbSrc && thumbOk && (
        <button onClick={() => setZoom(true)}
          aria-label="View canvas full screen"
          title="Click to zoom"
          style={{
            width: '100%', flexShrink: 0,
            aspectRatio: '16 / 9',
            borderBottom: `2px solid ${INK}`,
            background: '#F2EDE4',
            overflow: 'hidden',
            padding: 0, border: 'none', borderRadius: 0,
            cursor: 'zoom-in',
            position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <img src={thumbSrc} alt={`${tool.n} canvas preview`}
            onError={() => setThumbOk(false)}
            draggable={false}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              userSelect: 'none', pointerEvents: 'none',
            }} />
          {/* Zoom-hint icon, top-right corner */}
          <div style={{
            position: 'absolute', top: 8, right: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            border: `2px solid ${INK}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <circle cx="10" cy="10" r="6" stroke={INK} strokeWidth="2" />
              <path d="M10 7v6M7 10h6M14.5 14.5l4 4"
                stroke={INK} strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </button>
      )}
      {zoom && thumbSrc && (
        <ImageLightbox src={thumbSrc} alt={`${tool.n} canvas`}
          onClose={() => setZoom(false)} />
      )}
      <div style={{
        padding: '14px 16px 12px', flex: 1, minHeight: 0,
        overflowY: 'auto', overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontSize: 10, color: '#9C958A', letterSpacing: '.06em', marginBottom: 4,
        }}>
          #{String(toolNum).padStart(3,'0')} · {tool.g.map(g => GATE_LABEL[g]).join(' / ')}
        </div>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8,
        }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 17, color: INK, lineHeight: 1.2, flex: 1,
            letterSpacing: '.01em',
          }}>{tool.n}</div>
          <button onClick={toggleSpeak}
            title={speaking ? 'Stop' : 'Read aloud'}
            style={{
              flexShrink: 0, width: 32, height: 32,
              background: 'transparent', border: 'none',
              cursor: 'pointer', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {speaking ? (
              // Pause icon — two ink bars, hand-drawn
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <rect x="6.5" y="5" width="3.6" height="14" rx="1.2"
                  fill={INK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
                <rect x="13.9" y="5" width="3.6" height="14" rx="1.2"
                  fill={INK} stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            ) : (
              // Speaker icon — black outline only
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
                <path d="M4 9.5 V14.5 H7.5 L12.5 18.5 V5.5 L7.5 9.5 H4 Z"
                  stroke={INK} strokeWidth="1.8" strokeLinejoin="round" fill="none" />
                <path d="M16 9 Q18 12 16 15"
                  stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
                <path d="M18.5 7 Q21.5 12 18.5 17"
                  stroke={INK} strokeWidth="1.8" strokeLinecap="round" fill="none" />
              </svg>
            )}
          </button>
        </div>
        {/* Dimensions — plain readable labels, coloured per dim */}
        <div style={{
          display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: '4px 14px',
          marginBottom: 10,
        }}>
          {(tool.d || []).map((did, i, arr) => {
            const d = DIM_BY_ID[did]
            if (!d) return null
            return (
              <span key={did} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
                <span style={{
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontWeight: 900,
                  fontSize: 12,
                  letterSpacing: '.05em',
                  textTransform: 'uppercase',
                  color: d.color,
                }}>
                  {d.label}
                </span>
                {i < arr.length - 1 && (
                  <span style={{
                    color: '#C8C0B5', fontSize: 14, lineHeight: 1,
                    userSelect: 'none',
                  }}>·</span>
                )}
              </span>
            )
          })}
        </div>
        {/* Definition — full text; the parent panel scrolls when long. */}
        <p style={{
          fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
          fontSize: 14, color: '#3F3A36', lineHeight: 1.4,
          margin: '0 0 10px',
        }}>
          {tool.def}
        </p>
        {/* Practitioner tip */}
        {tool.t && (
          <div style={{
            background: YELLOW + '40',
            borderRadius: 12, padding: '12px 12px 10px', marginBottom: 10,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -8, left: 10,
              padding: '1px 6px', background: YELLOW,
              border: `2px solid ${INK}`, borderRadius: 4,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontSize: 8, color: INK, letterSpacing: '.04em',
            }}>TIP</div>
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
              fontSize: 13, color: '#3F3A36', lineHeight: 1.35, margin: 0,
              marginTop: 2,
            }}>{tool.t}</p>
          </div>
        )}
      </div>
      {/* Dive deeper bar */}
      <button onClick={onDive}
        style={{
          flexShrink: 0, padding: '12px',
          background: '#FFFFFF', color: INK,
          borderTop: `2px solid ${INK}`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          cursor: 'pointer',
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 13, letterSpacing: '.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {/* Refresh-arrow icon — hand-drawn black */}
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path d="M5 7 Q5 4 9 4 H16 L13 1.5 M16 4 L13 6.5"
            stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M19 17 Q19 20 15 20 H8 L11 22.5 M8 20 L11 17.5"
            stroke={INK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        DIVE DEEPER
      </button>
    </div>
  )
}

// ── Dive-deeper face (face C) ─────────────────────────────────
export function CardDeep({ tool, gate, onBack }) {
  const col      = GATE_COL[gate]
  const toolNum  = TOOLS.indexOf(tool) + 1
  const fileUrl  = canvasUrl(toolNum)
  const fileName = CANVAS_FILES[toolNum] || null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      borderRadius: 22, overflow: 'hidden',
      background: '#FFFDF8',
      border: `3px solid ${INK}`,
      boxShadow: 'none',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 6, background: col, flexShrink: 0 }} />
      <div style={{
        padding: '12px 16px 8px', flexShrink: 0,
        borderBottom: `2px dashed ${INK}33`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 10, color: col, letterSpacing: '.06em',
          }}>METHOD DETAILS</div>
          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: 16, color: INK, marginTop: 2, lineHeight: 1.1,
          }}>{tool.n}</div>
        </div>
        {fileUrl && (
          <a href={fileUrl}
            download={fileName || true}
            title={`Download ${fileName || 'canvas'}`}
            style={{
              flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px',
              background: col, color: '#FFFFFF',
              border: `2px solid ${INK}`, borderRadius: 10,
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900, fontSize: 11, letterSpacing: '.06em',
              textDecoration: 'none',
              textTransform: 'uppercase',
            }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none">
              <path d="M12 4v11M7 12l5 5 5-5M5 20h14"
                stroke="#FFFFFF" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Canvas
          </a>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* Mechanics — numbered steps */}
        {tool.steps && tool.steps.length > 0 && (
          <Section label="MECHANICS" emoji="🛠">
            {tool.steps.map((step, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, marginBottom: 8,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                  background: col, border: `2px solid ${INK}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Barlow Condensed, Impact, sans-serif',
                  fontSize: 12, color: '#fff',
                }}>{i + 1}</div>
                <p style={{
                  fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                  fontSize: 13, color: '#3F3A36',
                  lineHeight: 1.35, margin: 0, flex: 1,
                }}>{step}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Duration & material */}
        {(tool.duration || tool.material) && (
          <Section label="DURATION & MATERIAL" emoji="⏱">
            {tool.duration && (
              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                fontSize: 13, color: '#3F3A36', lineHeight: 1.35, margin: '0 0 4px',
              }}>
                <span style={{ color: col, fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 9, letterSpacing: '.04em' }}>DURATION · </span>
                {tool.duration}
              </p>
            )}
            {tool.material && (
              <p style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
                fontSize: 13, color: '#3F3A36', lineHeight: 1.35, margin: 0,
              }}>
                <span style={{ color: col, fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 9, letterSpacing: '.04em' }}>MATERIAL · </span>
                {tool.material}
              </p>
            )}
          </Section>
        )}

        {/* Produced evidence */}
        {tool.evidence && (
          <Section label="PRODUCED EVIDENCE" emoji="📋">
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
              fontSize: 13, color: '#3F3A36', lineHeight: 1.4, margin: 0,
            }}>{tool.evidence}</p>
          </Section>
        )}

        {/* Use case */}
        {tool.use && (
          <Section label="USE CASE" emoji="🌍">
            <p style={{
              fontFamily: '-apple-system, Helvetica Neue, sans-serif', fontWeight: 700,
              fontSize: 13, color: '#3F3A36', lineHeight: 1.4, margin: 0,
            }}>{tool.use}</p>
          </Section>
        )}

        {/* References — clickable when the docx had a real hyperlink,
            plain text otherwise (no Google fallback). */}
        {tool.refs && tool.refs.length > 0 && (
          <Section label="REFERENCES" emoji="📚">
            {tool.refs.map((r, i) => {
              // Support both old shape (string) and new shape ({t, u})
              const text = typeof r === 'string' ? r : r.t
              const url  = typeof r === 'string' ? null : r.u
              const baseStyle = {
                display: 'block',
                fontSize: 11, color: '#5A5550', lineHeight: 1.3,
                margin: '0 0 5px', paddingLeft: 14, position: 'relative',
              }
              const bullet = (
                <span style={{
                  position: 'absolute', left: 0, top: 0, color: col,
                  fontFamily: 'Barlow Condensed, Impact, sans-serif', fontSize: 11,
                }}>›</span>
              )
              if (url) {
                return (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    style={{ ...baseStyle, textDecoration: 'none', transition: 'color .15s' }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = INK
                      e.currentTarget.style.textDecoration = 'underline'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#5A5550'
                      e.currentTarget.style.textDecoration = 'none'
                    }}>
                    {bullet}
                    {text}
                    <span aria-hidden="true" style={{
                      color: '#9C958A', fontSize: 9, marginLeft: 4, verticalAlign: 'super',
                    }}>↗</span>
                  </a>
                )
              }
              return (
                <p key={i} style={baseStyle}>
                  {bullet}
                  {text}
                </p>
              )
            })}
          </Section>
        )}
      </div>
      {/* Back to synthesis */}
      <button onClick={onBack}
        style={{
          flexShrink: 0, padding: '12px',
          background: '#FFFFFF', color: INK,
          borderTop: `2px solid ${INK}`,
          borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
          cursor: 'pointer',
          fontFamily: 'Barlow Condensed, Impact, sans-serif',
          fontWeight: 900,
          fontSize: 13, letterSpacing: '.08em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        ← BACK TO SYNTHESIS
      </button>
    </div>
  )
}

function Section({ label, emoji, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: 'Barlow Condensed, Impact, sans-serif',
        fontSize: 10, color: INK, letterSpacing: '.05em',
        marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span>{emoji}</span> {label}
      </div>
      {children}
    </div>
  )
}

// ── Card stack — 3D flip cover ↔ synth ↔ deep ────────────────
const CARD_W = 340
const CARD_H = 540

export function CardStack({ tool, gate, face, onDive, onBack }) {
  const flipped = face !== 'cover'
  return (
    <div className="perspective-900" style={{ width: CARD_W, height: CARD_H }}>
      <div className="preserve-3d" style={{
        position: 'relative', width: '100%', height: '100%',
        transition: 'transform .8s cubic-bezier(.7,0,.3,1)',
        transform: flipped ? 'rotateY(180deg)' : 'rotateY(0)',
      }}>
        <div className="backface-hidden" style={{ position: 'absolute', inset: 0 }}>
          <CardCover tool={tool} gate={gate} />
        </div>
        <div className="backface-hidden rotate-y-180" style={{ position: 'absolute', inset: 0 }}>
          {face !== 'deep'
            ? <CardSynthesis tool={tool} gate={gate} onDive={onDive} />
            : <CardDeep tool={tool} gate={gate} onBack={onBack} />}
        </div>
      </div>
    </div>
  )
}

// ── Swipe wrapper — drag card to trigger an action ────────────
//   • LEFT  → skip
//   • RIGHT → I do it (practice)
//   • UP    → I know it (flag)
const SWIPE_THRESH = 90
const SWIPE_GREEN  = '#A8D870'
const SWIPE_CORAL  = '#E57E72'

export function SwipeWrap({ enabled, onAction, children }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, exiting: false })
  const startRef = useRef(null)
  // Direction lock: 'pending' before first move > LOCK_PX, then either
  // 'swipe' (we own the gesture) or 'scroll' (we let the inner card
  // scroll natively and ignore the rest of this touch).
  const modeRef  = useRef(null)
  const LOCK_PX  = 10

  const begin = (cx, cy) => {
    if (!enabled) return
    startRef.current = { x: cx, y: cy }
    modeRef.current  = 'pending'
    setDrag({ x: 0, y: 0, exiting: false })
  }
  const move = (cx, cy) => {
    if (!startRef.current) return
    const dx = cx - startRef.current.x
    const dy = cy - startRef.current.y
    if (modeRef.current === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < LOCK_PX) return
      // Any dominantly vertical gesture (up OR down) → scroll the card.
      // Only horizontal swipes trigger card actions now.
      if (Math.abs(dy) > Math.abs(dx)) {
        modeRef.current  = 'scroll'
        startRef.current = null
        return
      }
      modeRef.current = 'swipe'
    }
    if (modeRef.current !== 'swipe') return
    setDrag({ x: dx, y: dy, exiting: false })
  }
  const end = () => {
    if (!startRef.current) { modeRef.current = null; return }
    const { x, y } = drag
    let action = null
    let off = { x: 0, y: 0 }
    // Only horizontal swipes commit an action now. Vertical-down is
    // already routed to native scroll via the direction lock above;
    // vertical-up is no longer bound (the old "flag" gesture is
    // replaced by the swipe-right evaluation flow).
    if (x > SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      action = 'practice'; off = { x: 700, y }
    } else if (x < -SWIPE_THRESH && Math.abs(x) > Math.abs(y)) {
      action = 'skip'; off = { x: -700, y }
    }
    if (action) {
      setDrag({ x: off.x, y: off.y, exiting: true })
      setTimeout(() => {
        onAction(action)
        // ⚠ Crucial: reset our own drag state so the NEXT card renders
        //   at (0, 0). Without this the SwipeWrap stays translated
        //   off-screen and the next card is invisible.
        setDrag({ x: 0, y: 0, exiting: false })
      }, 220)
    } else {
      setDrag({ x: 0, y: 0, exiting: false })
    }
    startRef.current = null
    modeRef.current  = null
  }

  // Touch handlers
  const onTouchStart = (e) => begin(e.touches[0].clientX, e.touches[0].clientY)
  const onTouchMove  = (e) => move(e.touches[0].clientX, e.touches[0].clientY)
  const onTouchEnd   = () => end()
  // Mouse handlers (desktop test)
  const onMouseDown  = (e) => begin(e.clientX, e.clientY)
  const onMouseMove  = (e) => { if (startRef.current) move(e.clientX, e.clientY) }
  const onMouseUp    = () => end()
  const onMouseLeave = () => { if (startRef.current) end() }

  const rot = Math.max(-12, Math.min(12, drag.x * 0.05))

  // Swipe overlay tags — only horizontal gestures now. Vertical-up
  // is reserved (no action) and vertical-down lets the card scroll.
  const showRight = drag.x > 30 && Math.abs(drag.x) > Math.abs(drag.y)
  const showLeft  = drag.x < -30 && Math.abs(drag.x) > Math.abs(drag.y)

  return (
    <div
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onMouseLeave={onMouseLeave}
      style={{
        position: 'relative',
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`,
        transition: startRef.current ? 'none' : 'transform .22s ease-out',
        cursor: enabled ? 'grab' : 'default',
        touchAction: 'pan-y',
        userSelect: 'none',
      }}>
      {children}
      {/* Overlay action labels */}
      {showRight && <SwipeTag color={SWIPE_GREEN} pos="left">I KNOW IT</SwipeTag>}
      {showLeft  && <SwipeTag color="#9C958A"   pos="right">SKIP</SwipeTag>}
    </div>
  )
}

function SwipeTag({ children, color, pos }) {
  const base = {
    position: 'absolute',
    padding: '8px 16px',
    borderRadius: 10,
    border: `3px solid ${color}`,
    color, background: 'rgba(255,255,255,.9)',
    fontFamily: 'Barlow Condensed, Impact, sans-serif',
    fontWeight: 900, fontSize: 22, letterSpacing: '.06em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transform: pos === 'left' ? 'rotate(-15deg)' : pos === 'right' ? 'rotate(15deg)' : 'rotate(0)',
  }
  const place = pos === 'left'
    ? { top: 30, left: 20 }
    : pos === 'right'
    ? { top: 30, right: 20 }
    : { bottom: 30, left: '50%', marginLeft: -55 }
  return <div style={{ ...base, ...place }}>{children}</div>
}

// ── Action buttons (Skip / I know it) — fallback for users who don't
// want to swipe. "I know it" routes through the same evaluation modal
// as a swipe-right.
export function ActionButtons({ show, onAction }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'row', gap: 8,
      opacity: show ? 1 : 0,
      transform: show ? 'translateY(0)' : 'translateY(12px)',
      pointerEvents: show ? 'auto' : 'none',
      transition: 'all .3s',
    }}>
      <ScrappyButton onClick={() => onAction('skip')}
        color="#FFFFFF" textColor="#7B746A" size="sm" full>
        ← SKIP
      </ScrappyButton>
      <ScrappyButton onClick={() => onAction('practice')}
        color={YELLOW} size="sm" full>
        I KNOW IT →
      </ScrappyButton>
    </div>
  )
}

// ── Progress dots ─────────────────────────────────────────────
export function ProgressDots({ tools, idx }) {
  return (
    <div style={{ display: 'flex', gap: 3, width: '100%' }}>
      {tools.map((_, i) => (
        <div key={i} style={{
          height: 6, borderRadius: 3,
          flex: 1, minWidth: 3, maxWidth: 22,
          transition: 'all .3s',
          background: i < idx ? '#9C958A' : i === idx ? INK : '#E0DAD2',
        }} />
      ))}
    </div>
  )
}

// ── Main Explore view ──────────────────────────────────────────
export function ExploreView() {
  const { eGate, eDim, eIdx, goMap, practiceTool, skipTool, nextCard } =
    useStore(useShallow(s => ({
      eGate: s.eGate, eDim: s.eDim, eIdx: s.eIdx,
      goMap: s.goMap,
      practiceTool: s.practiceTool,
      skipTool:     s.skipTool,
      nextCard:     s.nextCard,
    })))

  // Local card-face state (synth ↔ deep). No more cover-flip
  // between cards — synthesis appears immediately on each new card.
  const [face, setFace] = useState('synth')
  // Pending evaluation modal — opened on swipe-right, closed on
  // level pick (or cancel). When closed without a level it does not
  // advance the deck, letting the user retry.
  const [pendingEval, setPendingEval] = useState(false)
  // Last action drives the conveyor-belt animation: skip = old card
  // flew left, new one slides in from the right; practice = inverse.
  const [lastAction, setLastAction] = useState(null)

  const gate  = eGate
  const tools = eDim ? toolsForGateDim(gate, eDim) : toolsForGate(gate)
  const col   = GATE_COL[gate]
  const dim   = eDim ? DIM_BY_ID[eDim] : null

  // When the active card changes, snap back to synth (in case user
  // was reading dive-deeper details on the previous card).
  useEffect(() => { setFace('synth'); setPendingEval(false) }, [eIdx, eGate, eDim])

  if (eIdx >= tools.length) return <GateComplete gate={gate} />

  const tool = tools[eIdx]

  // Swipe-right ("I know it") opens the evaluation modal instead of
  // committing immediately — the user has to pick depth (regular /
  // occasional / theory) before we advance.
  const handleAction = (action) => {
    setLastAction(action)
    if (action === 'practice') {
      setPendingEval(true)
      return
    }
    if (action === 'skip') skipTool(tool.n)
    window.speechSynthesis?.cancel()
    nextCard()
  }

  const commitEvaluation = (level) => {
    practiceTool(tool.n, level)
    try { window.speechSynthesis?.cancel() } catch { /* noop */ }
    setPendingEval(false)
    nextCard()
  }

  return (
    <div className="anim-fadein">
      {/* ── Header (2 lines: nav+title+counter, then dots) ─── */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 10,
        }}>
          <ScrappyButton
            onClick={() => { window.speechSynthesis?.cancel(); goMap() }}
            color="#FFFFFF" size="sm">
            ← MAP
          </ScrappyButton>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontWeight: 900,
              fontSize: 18, color: col, lineHeight: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
              letterSpacing: '.02em',
            }}>
              {GATE_LABEL[gate]}
            </div>
            {dim && (
              <div style={{
                fontFamily: 'Barlow Condensed, Impact, sans-serif',
                fontWeight: 900,
                fontSize: 11, color: dim.color, marginTop: 3,
                letterSpacing: '.05em', textTransform: 'uppercase',
                lineHeight: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {dim.label}
              </div>
            )}
          </div>

          <div style={{
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontWeight: 900, fontSize: 16, color: INK, flexShrink: 0,
          }}>
            {eIdx + 1}/{tools.length}
          </div>
        </div>

        <ProgressDots tools={tools} idx={eIdx} />
      </div>

      {/* ── Card stack — swipeable ─────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
        <SwipeWrap
          enabled={face === 'synth'}      // only swipe on the synth face
          onAction={handleAction}>
          {/* Inner keyed wrapper — re-mounts on every card change so
              the conveyor-belt enter animation runs. Direction follows
              the last action so the new card visually replaces the old
              from the opposite side. */}
          <div key={eIdx}
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
            />
          </div>
        </SwipeWrap>
      </div>
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

      {/* ── Actions (compact pills in one row) */}
      <ActionButtons show={face !== 'cover'} onAction={handleAction} />

      {/* ── Evaluation modal — opened on swipe-right or button-right */}
      {pendingEval && (
        <EvaluationModal
          tool={tool}
          onPick={commitEvaluation}
          onCancel={() => setPendingEval(false)}
        />
      )}
    </div>
  )
}
