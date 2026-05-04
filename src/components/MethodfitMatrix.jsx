// 2×2 matrix of project priority × team capability for the
// Project Method-Fit workshop. Used both live during a session
// (FacilitatorView) and post-hoc on the Team Dashboard.
//
// Input shape: `responses` is an array of methodfit_card payloads:
//   { participantId, tool, fit: 'essential'|'helpful'|'optional'|'skip',
//     capability: 'regular'|'occasional'|'theory'|null }
const INK    = '#1C2530'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

const FIT_W = { essential: 3, helpful: 2, optional: 1, skip: 0 }
const CAP_W = { regular: 3, occasional: 2, theory: 1 }

export function MethodfitMatrix({
  responses = [], toolList = [],
  participantCount = 0, doneCount = 0,
}) {
  const stats = toolList.map(t => {
    const rs = responses.filter(r => r.tool === t.n)
    if (rs.length === 0) return { name: t.n, n: 0 }
    const fitAvg = rs.reduce((a, r) => a + (FIT_W[r.fit] ?? 0), 0) / rs.length
    const caps = rs.map(r => CAP_W[r.capability]).filter(v => v !== undefined)
    const capAvg = caps.length > 0
      ? caps.reduce((a, v) => a + v, 0) / caps.length
      : null
    return { name: t.n, n: rs.length, fitAvg, capAvg }
  }).filter(s => s.n > 0)

  // Bucket: priority high/low (>=1.5), capability high/low (>=1.5)
  const buckets = {
    run:    [],   // high prio + high cap
    train:  [],   // high prio + low cap (gold!)
    bench:  [],   // low prio  + high cap
    skip:   [],   // low prio  + low cap
    nocap:  [],   // capability unknown
  }
  for (const s of stats) {
    if (s.capAvg == null) { buckets.nocap.push(s); continue }
    const hiP = s.fitAvg >= 1.5
    const hiC = s.capAvg >= 1.5
    if      ( hiP &&  hiC) buckets.run.push(s)
    else if ( hiP && !hiC) buckets.train.push(s)
    else if (!hiP &&  hiC) buckets.bench.push(s)
    else                    buckets.skip.push(s)
  }

  return (
    <div>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: '#2A6B45', letterSpacing: '.08em',
        textTransform: 'uppercase', marginBottom: 8,
      }}>
        ● {responses.length} responses · {doneCount}/{participantCount} done
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 10, marginTop: 4,
      }}>
        <Quadrant title="TRAIN / HIRE" hint="Priority for the project · gap on the team"
          tone="gold" tools={buckets.train} highlight />
        <Quadrant title="RUN IT" hint="Priority · the team can deliver"
          tone="ok" tools={buckets.run} />
        <Quadrant title="SKIP" hint="Low priority for this project"
          tone="muted" tools={buckets.skip} />
        <Quadrant title="BENCH" hint="Team can run it · low priority here"
          tone="bench" tools={buckets.bench} />
      </div>

      {buckets.nocap.length > 0 && (
        <div style={{
          marginTop: 10, padding: '8px 10px',
          background: '#FFF4D8',
          border: `1.5px dashed #C17B2A`, borderRadius: 10,
          fontSize: 11, color: '#7B4A12', lineHeight: 1.4,
        }}>
          <b>{buckets.nocap.length}</b> method{buckets.nocap.length > 1 ? 's' : ''}{' '}
          {buckets.nocap.length > 1 ? 'have' : 'has'} no capability data yet —
          run a Triage round in this session to populate the Y axis.
        </div>
      )}
    </div>
  )
}

function Quadrant({ title, hint, tone, tools, highlight = false }) {
  const tones = {
    gold:   { bg: '#FFF4D8', border: '#C17B2A', label: '#7B4A12' },
    ok:     { bg: '#E6F4EC', border: '#2A6B45', label: '#1F4E32' },
    bench:  { bg: '#E6EEF8', border: '#1B5FA0', label: '#0F3A66' },
    muted:  { bg: '#F2EDE4', border: '#9C958A', label: '#5A5550' },
  }
  const t = tones[tone] || tones.muted
  return (
    <div style={{
      background: t.bg,
      border: `${highlight ? 3 : 2}px solid ${t.border}`,
      borderRadius: 12,
      padding: '10px 10px 8px',
      boxShadow: highlight ? '3px 3px 0 ' + t.border : 'none',
      minHeight: 110,
    }}>
      <div style={{
        fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 11,
        color: t.label, letterSpacing: '.06em',
      }}>{title}</div>
      <div style={{
        fontSize: 10, color: t.label, opacity: 0.85,
        marginTop: 2, marginBottom: 6, lineHeight: 1.3,
      }}>{hint}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {tools.length === 0 && (
          <span style={{
            fontSize: 10, color: t.label, opacity: 0.5, fontStyle: 'italic',
          }}>—</span>
        )}
        {tools.slice(0, 6).map(s => (
          <span key={s.name} style={{
            padding: '2px 6px',
            background: '#FFFFFF',
            border: `1.5px solid ${t.border}`, borderRadius: 6,
            fontSize: 10, color: t.label, fontWeight: 700,
            maxWidth: '100%',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{s.name}</span>
        ))}
        {tools.length > 6 && (
          <span style={{
            fontSize: 10, color: t.label, opacity: 0.7,
          }}>+{tools.length - 6}</span>
        )}
      </div>
    </div>
  )
}
