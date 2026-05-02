import { writeFileSync } from 'fs'

writeFileSync('src/views/MapView.jsx', `
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import {
  GATE_Q, GATE_SHORT,
  toolsForGate, practicedForGate, isUnlocked,
} from '../data/tools'

const GATE_COL = ['','#C17B2A','#1B5FA0','#2A6B45','#7A3A8E']
const GATE_LABEL = ['','Impact','Fit','Anchoring','Sustainability']

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

  // Colors — targeted muting instead of blanket opacity
  const accentCol = locked ? '#C4BDB4' : GATE_COL[gate]
  const titleCol  = locked ? '#A09890' : '#1C2530'
  const subCol    = locked ? '#B8B2AA' : '#5A5550'
  const barTrack  = locked ? '#DDD8D0' : '#E0DAD2'

  return (
    <div
      onClick={() => !locked && goExplore(gate)}
      style={{
        position: 'relative', borderRadius: '14px',
        padding: '14px 14px 14px 16px',
        background: locked ? '#F7F4F0' : '#FFFFFF',
        border: '1px solid ' + (locked ? '#DDD8D0' : '#E8E3DA'),
        borderLeft: '3px solid ' + accentCol,
        cursor: locked ? 'default' : 'pointer',
        transition: 'box-shadow .15s',
      }}
    >
      {/* Gate badge + lock */}
      <div style={{ display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '16px', height: '16px', borderRadius: '50%',
            background: accentCol,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: 900, color: '#fff',
            fontFamily: 'Barlow Condensed, sans-serif' }}>{gate}</div>
          <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase',
            letterSpacing: '.06em', color: accentCol }}>
            Gate {gate} · {GATE_LABEL[gate]}
          </span>
        </div>
        {locked && (
          <span style={{ fontSize: '11px', opacity: .5 }}>🔒</span>
        )}
      </div>

      {/* Title */}
      <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: '21px', fontWeight: 900,
        color: titleCol, marginBottom: '3px', lineHeight: 1, letterSpacing: '.01em' }}>
        G{gate} — {GATE_SHORT[gate]}
      </div>

      {/* Question */}
      <div style={{ fontSize: '12px', color: subCol, fontStyle: 'italic',
        marginBottom: '12px', lineHeight: 1.35 }}>
        "{GATE_Q[gate]}"
      </div>

      {/* Progress bar (barre seule, plus de dots) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ flex: 1, height: '4px', borderRadius: '2px',
          background: barTrack, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '2px',
            width: pct + '%', background: accentCol,
            transition: 'width .5s' }} />
        </div>
        <span style={{ fontSize: '10px', fontWeight: 800, color: subCol,
          flexShrink: 0, minWidth: '28px', textAlign: 'right' }}>{pr}/{tot}</span>
      </div>

      {/* Unlock hint */}
      {locked && gate > 1 && (
        <div style={{ fontSize: '10px', color: '#B8B2AA', marginTop: '6px' }}>
          {3 - practicedForGate(gate - 1, practiced)} méthode(s) restante(s) en G{gate - 1}
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
      <div style={{ marginBottom: '18px' }}>
        <div className="text-mega" style={{ fontSize: 'clamp(32px,9vw,52px)',
          color: '#1C2530', lineHeight: .9 }}>
          {team?.city?.toUpperCase() || 'MA VILLE'}
        </div>
        <div style={{ fontSize: '11px', color: '#8B8074', marginTop: '6px' }}>
          {team?.name} · {team?.proj}
        </div>
      </div>

      {/* KPI strip — unifié, une seule surface */}
      <div style={{ display: 'flex', marginBottom: '16px', borderRadius: '12px',
        background: '#FFFFFF', border: '1px solid #E0DAD2', overflow: 'hidden' }}>
        {[[tp,'Pratiquées','#1B5FA0'],[tf,'À intégrer','#7A3A8E'],[tg+'/4','Gates OK','#2A6B45']].map(([n,l,col], i) => (
          <div key={l} style={{ flex: 1, padding: '12px 8px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid #E8E3DA' : 'none' }}>
            <div className="text-mega" style={{ fontSize: '26px', color: col, lineHeight: 1 }}>{n}</div>
            <div style={{ fontSize: '9px', color: '#8B8074', textTransform: 'uppercase',
              letterSpacing: '.05em', fontWeight: 700, marginTop: '3px' }}>{l}</div>
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
          style={{ flex: 1, padding: '13px', borderRadius: '12px', cursor: 'pointer',
            background: '#1B3D6F', border: 'none',
            color: '#FFFFFF', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ◉ TABLEAU DE BORD
        </button>
        <button onClick={goFacilitator}
          style={{ flex: 1, padding: '13px', borderRadius: '12px', cursor: 'pointer',
            background: '#FFFFFF', border: '1px solid #CFC9BE',
            color: '#6B6460', fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '14px', fontWeight: 900 }}>
          ◯ ATELIER LIVE
        </button>
      </div>
    </div>
  )
}
`.trimStart())
console.log('MapView v2 OK')
