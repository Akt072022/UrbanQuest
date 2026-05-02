import { writeFileSync } from 'fs'

// ── ExploreView with speechSynthesis ────────────────────────────
writeFileSync('src/views/ExploreView.jsx', `
import { useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_COLOR, GATE_DARK, GATE_LABEL, TOOLS,
  toolsForGate, practicedForGate, FAMILY_STYLE, SCOPE_STYLE,
} from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#3A6FD8','#2DBD76','#9B59E8']

// ── TTS helper ────────────────────────────────────────────────
function speak(tool) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const text = [
    tool.n + '.',
    tool.def,
    'Conseil praticien :',
    tool.t,
  ].join(' ')
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'fr-FR'
  u.rate = 0.92
  const voices = window.speechSynthesis.getVoices()
  const fr = voices.find(v => v.lang.startsWith('fr'))
  if (fr) u.voice = fr
  window.speechSynthesis.speak(u)
}

// ── Gate complete ─────────────────────────────────────────────
function GateComplete({ gate }) {
  const { goMap, practiced: practicedArr } = useStore(useShallow(s => ({
    goMap: s.goMap,
    practiced: s.practiced,
  })))
  const practiced = new Set(practicedArr)
  const tools = toolsForGate(gate)
  const pr = practicedForGate(gate, practiced)
  const col = GATE_VOLT[gate]

  return (
    <div className="anim-fadein" style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: '56px', marginBottom: '8px' }} className="anim-pop">⭐</div>
      <div className="text-mega" style={{ fontSize: 'clamp(40px,12vw,64px)', color: '#C8F135', marginBottom: '4px' }}>
        GATE {gate}
      </div>
      <div className="text-mega" style={{ fontSize: '22px', color: '#fff', marginBottom: '16px' }}>
        EXPLORÉ
      </div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px',
        padding: '10px 20px', borderRadius: '12px', marginBottom: '24px',
        background: 'rgba(200,241,53,.1)', border: '1px solid rgba(200,241,53,.3)' }}>
        <span className="text-mega" style={{ fontSize: '28px', color: '#C8F135' }}>{pr}/{tools.length}</span>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,.5)', fontWeight: 700 }}>méthodes pratiquées</span>
      </div>
      <br />
      <button onClick={goMap}
        style={{ padding: '14px 32px', borderRadius: '14px', cursor: 'pointer',
          background: '#C8F135', color: '#0D0D0D', border: 'none',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '18px', fontWeight: 900 }}>
        RETOUR À LA CARTE →
      </button>
    </div>
  )
}

// ── Flip card ─────────────────────────────────────────────────
function FlipCard({ tool, gate, onFlip, flipped }) {
  const toolNum = TOOLS.indexOf(tool) + 1
  const fam   = FAMILY_STYLE[tool.f] || { bg: '#f1f5f9', text: '#334155', icon: '?' }
  const scope = SCOPE_STYLE[tool.s] || { bg: '#e5e7eb', text: '#374151', label: '?' }
  const col   = GATE_VOLT[gate]
  const dark  = GATE_DARK[gate]

  return (
    <div className="perspective-900" style={{ width: '280px', height: '390px' }}>
      <div
        className={"relative w-full h-full preserve-3d transition-transform duration-500" + (flipped ? " rotate-y-180" : "")}
        onClick={() => !flipped && onFlip()}
        style={{ cursor: flipped ? 'default' : 'pointer' }}
      >
        {/* Front */}
        <div className="absolute inset-0 backface-hidden overflow-hidden"
          style={{ borderRadius: '20px', background: dark, border: '2px solid rgba(255,255,255,.07)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: col }} />
          <div className="text-mega" style={{ fontSize: '96px', color: col, opacity: .12, lineHeight: 1 }}>{gate}</div>
          <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em',
            color: 'rgba(255,255,255,.25)', position: 'absolute', bottom: '20px' }}>
            Toucher pour révéler →
          </div>
        </div>

        {/* Back */}
        <div className="absolute inset-0 backface-hidden rotate-y-180 overflow-hidden flex flex-col"
          style={{ borderRadius: '20px', background: '#F4EFE6' }}>
          <div style={{ height: '3px', flexShrink: 0, background: fam.bg }} />
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '.06em',
              color: '#9CA3AF', textTransform: 'uppercase', marginBottom: '6px' }}>
              #{String(toolNum).padStart(3,'0')} · G{tool.g.join('-')}
            </div>
            {/* Name + TTS */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '17px', fontWeight: 700,
                color: '#111', lineHeight: 1.25, flex: 1 }}>{tool.n}</div>
              <button
                onClick={(e) => { e.stopPropagation(); speak(tool) }}
                title="Lire à voix haute"
                style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '8px',
                  background: '#0D0D0D', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                🔊
              </button>
            </div>
            {/* Tags */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                background: fam.bg, color: fam.text }}>{fam.icon} {tool.f}</span>
              <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: 700,
                background: scope.bg, color: scope.text }}>{scope.label}</span>
            </div>
            {/* Def */}
            <p style={{ fontSize: '12px', color: '#6B7280', lineHeight: 1.55, marginBottom: '10px', flexShrink: 0 }}>
              {tool.def}
            </p>
            {/* Gate usages */}
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase',
              letterSpacing: '.05em', color: '#9CA3AF', marginBottom: '6px' }}>Usage par gate</div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {tool.g.filter(g => tool.gu[g]).map(g => (
                <div key={g} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                    background: GATE_VOLT[g], display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '8px', fontWeight: 800, color: '#fff', marginTop: '1px' }}>{g}</div>
                  <p style={{ fontSize: '11px', color: '#6B7280', lineHeight: 1.4 }}>{tool.gu[g]}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Tip */}
          <div style={{ background: '#D1FAE5', borderTop: '1px solid #A7F3D0',
            padding: '10px 16px', flexShrink: 0 }}>
            <div style={{ fontSize: '9px', fontWeight: 800, color: '#065F46',
              textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>Conseil praticien</div>
            <p style={{ fontSize: '11px', color: '#065F46', lineHeight: 1.45 }}>{tool.t}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Action buttons ─────────────────────────────────────────────
function ActionButtons({ tool, show, onAction }) {
  const practiced = useStore(s => s.practiced)
  const flagged   = useStore(s => s.flagged)
  const pr = practiced.includes(tool.n)
  const fl = flagged.includes(tool.n)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px',
      opacity: show ? 1 : 0, transform: show ? 'translateY(0)' : 'translateY(12px)',
      pointerEvents: show ? 'auto' : 'none', transition: 'all .3s' }}>
      <button onClick={() => onAction('practice')}
        style={{ padding: '14px', borderRadius: '14px', border: 'none', cursor: pr ? 'default' : 'pointer',
          background: pr ? 'rgba(34,197,94,.2)' : '#16A34A', color: '#fff',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 900,
          opacity: pr ? 0.6 : 1 }}>
        {pr ? '✓ DÉJÀ PRATIQUÉE' : '✓ NOTRE ÉQUIPE LA PRATIQUE — +10 XP'}
      </button>
      <button onClick={() => onAction('flag')}
        style={{ padding: '14px', borderRadius: '14px', border: 'none', cursor: 'pointer',
          background: fl ? 'rgba(139,92,246,.4)' : 'rgba(139,92,246,.65)', color: '#fff',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 900 }}>
        {fl ? '★ DÉJÀ DANS NOTRE PROCESS' : "★ ON VEUT L'INTÉGRER — +3 XP"}
      </button>
      <button onClick={() => onAction('skip')}
        style={{ padding: '14px', borderRadius: '14px', cursor: 'pointer',
          background: 'rgba(255,255,255,.05)', color: 'rgba(255,255,255,.35)',
          border: '1px solid rgba(255,255,255,.08)',
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '16px', fontWeight: 900 }}>
        MÉTHODE INCONNUE — PASSER →
      </button>
    </div>
  )
}

// ── Progress dots ──────────────────────────────────────────────
function ProgressDots({ tools, idx }) {
  return (
    <div style={{ display: 'flex', gap: '5px' }}>
      {tools.map((_,i) => (
        <div key={i} style={{
          height: '6px', borderRadius: '3px', transition: 'all .3s',
          width: i === idx ? '18px' : '6px',
          background: i < idx ? 'rgba(255,255,255,.5)' : i === idx ? '#C8F135' : 'rgba(255,255,255,.12)',
        }} />
      ))}
    </div>
  )
}

// ── Main Explore view ──────────────────────────────────────────
export function ExploreView() {
  const { eGate, eIdx, eFlipped, goMap, flipCard, practiceTool, flagTool, nextCard } = useStore(useShallow(s => ({
    eGate: s.eGate, eIdx: s.eIdx, eFlipped: s.eFlipped,
    goMap: s.goMap, flipCard: s.flipCard,
    practiceTool: s.practiceTool, flagTool: s.flagTool, nextCard: s.nextCard,
  })))

  const cardRef = useRef(null)
  const gate  = eGate
  const tools = toolsForGate(gate)
  const col   = GATE_VOLT[gate]

  if (eIdx >= tools.length) return <GateComplete gate={gate} />

  const tool = tools[eIdx]

  const handleAction = (action) => {
    if (action === 'practice') practiceTool(tool.n)
    else if (action === 'flag') flagTool(tool.n)
    window.speechSynthesis?.cancel()
    if (cardRef.current) {
      cardRef.current.style.transition = 'transform .3s, opacity .3s'
      cardRef.current.style.transform  = 'translateX(260px) rotate(10deg)'
      cardRef.current.style.opacity    = '0'
    }
    setTimeout(() => nextCard(), 300)
  }

  return (
    <div className="anim-fadein">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => { window.speechSynthesis?.cancel(); goMap() }}
          style={{ padding: '6px 12px', borderRadius: '10px', cursor: 'pointer',
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
            color: 'rgba(255,255,255,.45)', fontSize: '12px', fontWeight: 800 }}>
          ← CARTE
        </button>
        <div style={{ flex: 1 }}>
          <div className="text-mega" style={{ fontSize: '18px', color: col }}>
            G{gate} — {GATE_LABEL[gate]}
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.3)' }}>
            {eIdx + 1} / {tools.length}
          </div>
        </div>
        <ProgressDots tools={tools} idx={eIdx} />
      </div>

      {/* Card */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }} ref={cardRef}>
        <FlipCard tool={tool} gate={gate} flipped={eFlipped} onFlip={flipCard} />
      </div>

      {/* Actions */}
      <ActionButtons tool={tool} show={eFlipped} onAction={handleAction} />
    </div>
  )
}
`.trimStart())
console.log('ExploreView OK')
