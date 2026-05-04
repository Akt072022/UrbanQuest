// Live (or post-hoc) triage heatmap. Used both during a workshop on
// the FacilitatorView and on the Team Dashboard for past sessions.
//
// Input shape: `responses` is an array of triage_card payloads:
//   { participantId, tool, status: 'practiced'|'known'|'unknown',
//     level: 0-5, skillLevel: 'regular'|'occasional'|'theory'|null }
// `toolList` is the deck the workshop ran on. Tools that received
// no responses still render with empty bars so the team can see the
// full coverage scope, not just what got answered.
const INK    = '#1C2530'
const PAGE   = '#F2EDE4'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

export function TriageHeatmap({ responses = [], toolList = [], participantCount = 0 }) {
  const stats = toolList.map(t => {
    const rs = responses.filter(r => r.tool === t.n)
    const practiced = rs.filter(r => r.status === 'practiced').length
    const known     = rs.filter(r => r.status === 'known').length
    const unknown   = rs.filter(r => r.status === 'unknown').length
    const practSet  = rs.filter(r => r.status === 'practiced')
    const avgLevel  = practSet.length > 0 && practSet.some(r => r.level > 0)
      ? (practSet.reduce((a, r) => a + (r.level || 0), 0) / practSet.length).toFixed(1)
      : null
    // "⚡ Divergence" — the same tool sparks both practitioners *and*
    // people who've never heard of it. The first conversation a team
    // should have when this surfaces.
    const divergence = practiced > 0 && unknown > 0
    return { name: t.n, practiced, known, unknown, avgLevel, divergence }
  })
  const top = [...stats].sort((a, b) => b.practiced - a.practiced)

  return (
    <div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: '#10B981', letterSpacing: '.08em',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        ● {responses.length} responses · {participantCount} participants
      </div>
      {top.map(s => {
        const total = s.practiced + s.known + s.unknown
        const pctP = total > 0 ? Math.round(s.practiced / total * 100) : 0
        const pctK = total > 0 ? Math.round(s.known     / total * 100) : 0
        const pctU = total > 0 ? Math.round(s.unknown   / total * 100) : 0
        return (
          <div key={s.name} style={{
            marginBottom: 10, padding: '10px 12px',
            background: s.divergence ? '#FFF4D8' : PAGE,
            border: `2px solid ${s.divergence ? '#F97316' : INK + '33'}`,
            borderRadius: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
              <span style={{
                fontFamily: '-apple-system, Helvetica Neue, sans-serif',
                fontWeight: 800, fontSize: 13, color: INK,
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.divergence && <span style={{ marginRight: 4 }}>⚡</span>}{s.name}
              </span>
              {s.avgLevel && (
                <span style={{
                  flexShrink: 0,
                  fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
                  color: '#10B981', letterSpacing: '.04em',
                }}>avg {s.avgLevel}/5</span>
              )}
            </div>
            <div style={{
              display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden',
              background: PAGE, border: `1.5px solid ${INK}`,
            }}>
              <div style={{ width: pctP + '%', background: '#10B981' }} />
              <div style={{ width: pctK + '%', background: '#F97316' }} />
              <div style={{ width: pctU + '%', background: '#9C958A' }} />
            </div>
            <div style={{
              display: 'flex', gap: 14, marginTop: 6,
              fontSize: 10, fontWeight: 700,
            }}>
              <span style={{ color: '#10B981' }}>● Practiced {s.practiced}</span>
              <span style={{ color: '#F97316' }}>● Known {s.known}</span>
              <span style={{ color: '#9C958A' }}>● Unknown {s.unknown}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
