import { writeFileSync } from 'fs'

// ════════════════════════════════════════════════════
// Design tokens
// ════════════════════════════════════════════════════
// paper:  #F2EDE4  — fond parchemin
// cream:  #FFFDF8  — surface carte
// stone:  #EAE5DB  — surface secondaire
// border: #CFC9BE  — bordures
// muted:  #8B8074  — texte secondaire
// ink:    #1C2530  — texte principal
// navy:   #1B3D6F  — marque, CTA principaux
// gold:   #B8742A  — accent chaud, XP
// gates:  G1 #C17B2A  G2 #1B5FA0  G3 #2A6B45  G4 #7A3A8E
// ════════════════════════════════════════════════════

// ── Navbar ────────────────────────────────────────────────────
writeFileSync('src/components/Navbar.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { getLevel } from '../data/tools'

export function Navbar() {
  const { team, xp, goMap, goDashboard, goFacilitator, view } = useStore(useShallow(s => ({
    team: s.team,
    xp: s.xp,
    goMap: s.goMap,
    goDashboard: s.goDashboard,
    goFacilitator: s.goFacilitator,
    view: s.view,
  })))

  const { min, max, label } = getLevel(xp)
  const pct = Math.min(100, Math.round(((xp - min) / (max - min)) * 100))

  return (
    <nav style={{ background: '#FFFDF8', borderBottom: '1px solid #CFC9BE', padding: '10px 18px' }}
      className="flex items-center gap-3"
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 cursor-pointer flex-shrink-0"
        onClick={() => view !== 'welcome' && goMap()}
      >
        <div style={{ background: '#1B3D6F', borderRadius: '8px', width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
            <rect x={1} y={7} width={3} height={8} fill="#FFFFFF" rx={1}/>
            <rect x={6} y={3} width={4} height={12} fill="#FFFFFF" rx={1}/>
            <rect x={12} y={5} width={3} height={10} fill="#FFFFFF" rx={1}/>
          </svg>
        </div>
        <span className="text-mega" style={{ fontSize: '18px', letterSpacing: '-.02em', color: '#1C2530' }}>
          URBANQUEST
        </span>
      </div>

      {/* Right side */}
      {team && (
        <div className="ml-auto flex items-center gap-2">
          {/* Dashboard btn */}
          <button
            onClick={goDashboard}
            title="Dashboard"
            style={{
              background: view === 'dashboard' ? '#E8EDF5' : 'transparent',
              border: \`1px solid \${view === 'dashboard' ? '#1B3D6F' : '#CFC9BE'}\`,
              borderRadius: '8px', padding: '4px 8px', cursor: 'pointer',
              color: view === 'dashboard' ? '#1B3D6F' : '#8B8074',
              fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
            }}
          >
            ◉ Dashboard
          </button>

          {/* XP bar */}
          <div className="flex items-center gap-1.5">
            <div style={{ width: 48, height: 4, borderRadius: 4, background: '#EAE5DB', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 4, width: \`\${pct}%\`,
                background: '#B8742A', transition: 'width .7s' }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#B8742A' }}>{xp}</span>
          </div>

          {/* Level badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
            background: '#FFF3E0', color: '#B8742A',
            border: '1px solid rgba(184,116,42,.3)', textTransform: 'uppercase', letterSpacing: '.05em',
          }}>
            {label}
          </span>
        </div>
      )}
    </nav>
  )
}
`.trimStart())
console.log('Navbar OK')

// ── WelcomeView ───────────────────────────────────────────────
writeFileSync('src/views/WelcomeView.jsx', `
import { useState } from 'react'
import { useStore } from '../store/useStore'

const PROJECT_TYPES = [
  { value: 'patrimoine', label: 'Patrimoine & réhabilitation' },
  { value: 'mobilite',   label: 'Mobilité & espace public' },
  { value: 'resilience', label: 'Résilience climatique' },
  { value: 'deveco',     label: 'Développement économique' },
  { value: 'social',     label: 'Cohésion sociale' },
  { value: 'mixte',      label: 'Projet mixte' },
]

const LABEL = {
  fontSize: '10px', fontWeight: 800, color: '#8B8074',
  textTransform: 'uppercase', letterSpacing: '.07em',
  display: 'block', marginBottom: '6px',
}
const INP = {
  width: '100%', padding: '10px 14px', borderRadius: '12px',
  border: '1px solid #CFC9BE', background: '#FFFDF8',
  color: '#1C2530', fontSize: '14px', outline: 'none',
}

export function WelcomeView() {
  const startGame = useStore(s => s.startGame)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [proj, setProj] = useState('patrimoine')

  const handleSubmit = (e) => {
    e.preventDefault()
    startGame({ name: name.trim() || 'Mon équipe', city: city.trim() || 'Ma ville', proj })
  }

  return (
    <div className="anim-fadein flex flex-col" style={{ paddingTop: '20px', paddingBottom: '32px' }}>

      {/* Mégatypo */}
      <div style={{ marginBottom: '6px' }}>
        <div className="text-mega" style={{ fontSize: 'clamp(54px,17vw,90px)', color: '#1C2530' }}>
          URBAN
        </div>
        <div className="text-mega" style={{ fontSize: 'clamp(54px,17vw,90px)', color: '#1B3D6F', marginTop: '-10px' }}>
          QUEST
        </div>
      </div>

      <p style={{ fontSize: '13px', color: '#8B8074', lineHeight: 1.55,
        marginBottom: '24px', maxWidth: '280px' }}>
        Autodiagnostiquez les méthodes de planification urbaine — identifiez forces et angles morts de votre équipe.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '28px' }}>
        {[['16+','méthodes'],['4','gates'],['∞','villes']].map(([n,l]) => (
          <div key={l}>
            <div className="text-mega" style={{ fontSize: '28px', color: '#1B3D6F' }}>{n}</div>
            <div style={{ fontSize: '10px', color: '#8B8074', textTransform: 'uppercase',
              letterSpacing: '.06em', fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      <div style={{ background: '#FFFDF8', borderRadius: '16px', padding: '20px',
        border: '1px solid #CFC9BE', boxShadow: '0 1px 4px rgba(28,37,48,.06)', marginBottom: '16px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={LABEL}>Équipe</label>
              <input style={INP} placeholder="Équipe A…" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label style={LABEL}>Ville</label>
              <input style={INP} placeholder="Lyon…" value={city} onChange={e => setCity(e.target.value)} />
            </div>
          </div>

          <div>
            <label style={LABEL}>Type de projet</label>
            <select style={{ ...INP, cursor: 'pointer', appearance: 'none' }}
              value={proj} onChange={e => setProj(e.target.value)}>
              {PROJECT_TYPES.map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="anim-pulse-navy"
            style={{ marginTop: '4px', padding: '15px', borderRadius: '12px',
              background: '#1B3D6F', color: '#FFFFFF',
              fontFamily: 'Barlow Condensed, Impact, sans-serif',
              fontSize: '19px', fontWeight: 900, cursor: 'pointer', border: 'none',
              letterSpacing: '.02em', boxShadow: '0 4px 16px rgba(27,61,111,.25)' }}>
            ENTRER DANS LA VILLE →
          </button>
        </form>
      </div>

      {/* Gate strip */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {[['G1','Impact','#C17B2A','#FFF4E0'],['G2','Fit','#1B5FA0','#EAF0F9'],
          ['G3','Anchoring','#2A6B45','#E6F4EC'],['G4','Sustain.','#7A3A8E','#F3EBF9']]
          .map(([g,label,col,bg]) => (
          <div key={g} style={{ flex: 1, padding: '8px 4px', borderRadius: '10px',
            background: bg, border: '1px solid ' + col + '33', textAlign: 'center' }}>
            <div className="text-mega" style={{ fontSize: '22px', color: col }}>{g}</div>
            <div style={{ fontSize: '9px', color: col, fontWeight: 700, opacity: .75,
              textTransform: 'uppercase', marginTop: '2px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
`.trimStart())
console.log('WelcomeView OK')

// ── MapView ───────────────────────────────────────────────────
writeFileSync('src/views/MapView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_ARR, GATE_Q, GATE_SHORT,
  toolsForGate, practicedForGate, isUnlocked,
} from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']
const GATE_BG   = ['','#FFF4E0','#EAF0F9','#E6F4EC','#F3EBF9']

function DistrictCard({ gate }) {
  const { practiced: practicedArr, goExplore } = useStore(useShallow(s => ({
    practiced: s.practiced,
    goExplore: s.goExplore,
  })))
  const practiced = new Set(practicedArr)
  const tools   = toolsForGate(gate)
  const pr      = practicedForGate(gate, practiced)
  const tot     = tools.length
  const pct     = Math.round((pr / tot) * 100)
  const locked  = !isUnlocked(gate, practiced)
  const col     = GATE_VOLT[gate]
  const bg      = GATE_BG[gate]

  return (
    <div
      onClick={() => !locked && goExplore(gate)}
      className="card-shadow"
      style={{
        position: 'relative', borderRadius: '16px', padding: '16px',
        background: locked ? '#F5F1EB' : '#FFFDF8',
        border: '1px solid ' + (locked ? '#D8D3C8' : col + '55'),
        opacity: locked ? 0.55 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
        overflow: 'hidden', transition: 'border-color .2s, box-shadow .2s',
      }}
    >
      {/* Gate number watermark */}
      <div className="text-mega" style={{
        position: 'absolute', top: '-12px', right: '8px',
        fontSize: '80px', color: col, opacity: .07, pointerEvents: 'none',
        lineHeight: 1,
      }}>{gate}</div>

      {/* Gate label */}
      <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '.07em', color: col, marginBottom: '4px', opacity: .8 }}>
        {GATE_ARR[gate]}
      </div>

      <div className="text-mega" style={{ fontSize: '22px', color: '#1C2530', marginBottom: '2px' }}>
        G{gate} — {GATE_SHORT[gate]}
      </div>

      <div style={{ fontSize: '11px', color: '#8B8074', fontStyle: 'italic',
        marginBottom: '12px', lineHeight: 1.4 }}>"{GATE_Q[gate]}"</div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {tools.slice(0,8).map((_,i) => (
          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%',
            background: i < pr ? col : '#D0CAC0' }} />
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: '#E0DAD2', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '2px', width: pct + '%',
            background: col, transition: 'width .5s' }} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#8B8074' }}>{pr}/{tot}</span>
      </div>

      {locked && gate > 1 && (
        <div style={{ fontSize: '10px', color: '#B8A090', fontStyle: 'italic', marginTop: '6px' }}>
          🔒 Encore {3 - practicedForGate(gate - 1, practiced)} méthode(s) en G{gate - 1}
        </div>
      )}
    </div>
  )
}

export function MapView() {
  const { team, practiced: practicedArr, flagged, goFacilitator, goDashboard } = useStore(useShallow(s => ({
    team: s.team,
    practiced: s.practiced,
    flagged: s.flagged,
    goFacilitator: s.goFacilitator,
    goDashboard: s.goDashboard,
  })))

  const practiced = new Set(practicedArr)
  const tp = practiced.size
  const tf = flagged.length
  const tg = [1,2,3,4].filter(g => practicedForGate(g, practiced) === toolsForGate(g).length).length

  return (
    <div className="anim-fadein">
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <div className="text-mega" style={{ fontSize: 'clamp(32px,9vw,52px)', color: '#1C2530', lineHeight: .9 }}>
          {team?.city?.toUpperCase() || 'MA VILLE'}
        </div>
        <div style={{ fontSize: '11px', color: '#8B8074', marginTop: '4px' }}>
          {team?.name} · {team?.proj}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' }}>
        {[[tp,'Pratiquées','#1B5FA0','#EAF0F9'],[tf,'À intégrer','#7A3A8E','#F3EBF9'],[tg+'/4','Gates OK','#2A6B45','#E6F4EC']].map(([n,l,col,bg]) => (
          <div key={l} style={{ padding: '12px 8px', borderRadius: '12px', textAlign: 'center',
            background: bg, border: '1px solid ' + col + '33' }}>
            <div className="text-mega" style={{ fontSize: '28px', color: col }}>{n}</div>
            <div style={{ fontSize: '9px', color: col, opacity: .7, textTransform: 'uppercase',
              letterSpacing: '.05em', fontWeight: 700, marginTop: '2px' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* District grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        {[1,2,3,4].map(g => <DistrictCard key={g} gate={g} />)}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button onClick={goDashboard}
          style={{ flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer',
            background: '#E8EDF5', border: '1px solid #1B3D6F44',
            color: '#1B3D6F', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ◉ TABLEAU DE BORD
        </button>
        <button onClick={goFacilitator}
          style={{ flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer',
            background: '#FFFDF8', border: '1px solid #CFC9BE',
            color: '#8B8074', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ⬡ ATELIER LIVE
        </button>
      </div>
    </div>
  )
}
`.trimStart())
console.log('MapView OK')
