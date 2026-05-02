import { writeFileSync } from 'fs'

// ── WelcomeView ──────────────────────────────────────────────────
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

const INP = {
  width: '100%', padding: '10px 14px', borderRadius: '12px',
  border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.04)',
  color: '#fff', fontSize: '14px', outline: 'none',
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
    <div className="anim-fadein flex flex-col" style={{ paddingTop: '16px' }}>
      {/* Mégatypo */}
      <div style={{ marginBottom: '4px' }}>
        <div className="text-mega text-white" style={{ fontSize: 'clamp(56px,18vw,96px)' }}>
          URBAN
        </div>
        <div className="text-mega" style={{ fontSize: 'clamp(56px,18vw,96px)', color: '#C8F135', marginTop: '-10px' }}>
          QUEST
        </div>
      </div>

      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,.4)', lineHeight: 1.5,
        marginBottom: '24px', maxWidth: '280px' }}>
        Autodiagnostiquez les méthodes de planification — identifiez forces et angles morts.
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
        {[['16+','méthodes'],['4','gates'],['∞','villes']].map(([n,l]) => (
          <div key={l}>
            <div className="text-mega" style={{ fontSize: '28px', color: '#C8F135' }}>{n}</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.3)', textTransform: 'uppercase',
              letterSpacing: '.06em', fontWeight: 700 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
              textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>Équipe</label>
            <input style={INP} placeholder="Équipe A…" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
              textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>Ville</label>
            <input style={INP} placeholder="Lyon…" value={city} onChange={e => setCity(e.target.value)} />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,.3)',
            textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>Type de projet</label>
          <select style={{ ...INP, cursor: 'pointer', appearance: 'none' }}
            value={proj} onChange={e => setProj(e.target.value)}>
            {PROJECT_TYPES.map(pt => (
              <option key={pt.value} value={pt.value} style={{ background: '#0D0D0D' }}>{pt.label}</option>
            ))}
          </select>
        </div>

        <button type="submit" className="volt-glow"
          style={{ marginTop: '8px', padding: '16px', borderRadius: '14px',
            background: '#C8F135', color: '#0D0D0D',
            fontFamily: 'Barlow Condensed, Impact, sans-serif',
            fontSize: '20px', fontWeight: 900, cursor: 'pointer', border: 'none' }}>
          ENTRER DANS LA VILLE →
        </button>
      </form>

      {/* Gate strip */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '20px' }}>
        {[['G1','Impact','#C17B2A'],['G2','Fit','#3A6FD8'],['G3','Anchoring','#2DBD76'],['G4','Sustain.','#9B59E8']]
          .map(([g,label,col]) => (
          <div key={g} style={{ flex: 1, padding: '8px 4px', borderRadius: '10px',
            background: 'rgba(255,255,255,.03)', border: '1px solid ' + col + '33', textAlign: 'center' }}>
            <div className="text-mega" style={{ fontSize: '22px', color: col }}>{g}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.3)', fontWeight: 700,
              textTransform: 'uppercase', marginTop: '2px' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
`.trimStart())
console.log('WelcomeView OK')

// ── MapView ──────────────────────────────────────────────────────
writeFileSync('src/views/MapView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_COLOR, GATE_DARK, GATE_ARR, GATE_Q, GATE_SHORT,
  toolsForGate, practicedForGate, isUnlocked,
} from '../data/tools'

const GATE_VOLT = ['','#C17B2A','#3A6FD8','#2DBD76','#9B59E8']

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

  return (
    <div
      onClick={() => !locked && goExplore(gate)}
      style={{
        position: 'relative', borderRadius: '16px', padding: '16px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid ' + (locked ? 'rgba(255,255,255,.06)' : col + '44'),
        opacity: locked ? 0.42 : 1,
        cursor: locked ? 'not-allowed' : 'pointer',
        overflow: 'hidden', transition: 'border-color .2s',
      }}
    >
      {/* Watermark gate number */}
      <div className="text-mega" style={{
        position: 'absolute', top: '-12px', right: '8px',
        fontSize: '80px', color: col, opacity: .07, pointerEvents: 'none',
        lineHeight: 1,
      }}>{gate}</div>

      {/* Gate label */}
      <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
        letterSpacing: '.07em', color: col, marginBottom: '4px' }}>
        {GATE_ARR[gate]}
      </div>

      <div className="text-mega" style={{ fontSize: '22px', color: '#fff', marginBottom: '2px' }}>
        G{gate} — {GATE_SHORT[gate]}
      </div>

      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.45)', fontStyle: 'italic',
        marginBottom: '12px', lineHeight: 1.4 }}>"{GATE_Q[gate]}"</div>

      {/* Dot progress */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {tools.slice(0,8).map((_,i) => (
          <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%',
            background: i < pr ? col : 'rgba(255,255,255,.12)' }} />
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '2px', width: pct + '%',
            background: col, transition: 'width .5s' }} />
        </div>
        <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,.6)' }}>{pr}/{tot}</span>
      </div>

      {locked && (
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,.3)', fontStyle: 'italic', marginTop: '6px' }}>
          🔒 Encore {3 - practicedForGate(gate - 1, practiced)} méthodes en G{gate - 1}
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
        <div className="text-mega" style={{ fontSize: 'clamp(32px,9vw,52px)', color: '#fff', lineHeight: .9 }}>
          {team?.city?.toUpperCase() || 'MA VILLE'}
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.3)', marginTop: '4px' }}>
          {team?.name} · {team?.proj}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '16px' }}>
        {[[tp,'Pratiquées'],[tf,'À intégrer'],[tg+'/4','Gates OK']].map(([n,l]) => (
          <div key={l} style={{ padding: '12px 8px', borderRadius: '12px', textAlign: 'center',
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)' }}>
            <div className="text-mega" style={{ fontSize: '28px', color: '#C8F135' }}>{n}</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,.3)', textTransform: 'uppercase',
              letterSpacing: '.05em', fontWeight: 700, marginTop: '2px' }}>{l}</div>
          </div>
        ))}
      </div>

      {/* District grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {[1,2,3,4].map(g => <DistrictCard key={g} gate={g} />)}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <button onClick={goDashboard}
          style={{ flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer',
            background: 'rgba(200,241,53,.1)', border: '1px solid rgba(200,241,53,.3)',
            color: '#C8F135', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ◉ DASHBOARD
        </button>
        <button onClick={goFacilitator}
          style={{ flex: 1, padding: '12px', borderRadius: '12px', cursor: 'pointer',
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
            color: 'rgba(255,255,255,.5)', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ⬡ ATELIER LIVE
        </button>
      </div>
    </div>
  )
}
`.trimStart())
console.log('MapView OK')
