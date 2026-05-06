// Solo methodfit rating for a saved project. Reuses ParticipantView's
// FitDeck so the swipe / rating UI is identical to the workshop
// experience: the user rates priority for THIS project (essential /
// helpful / optional / skip) and, when capability isn't already
// known from the user's `practiced` map, picks it from a small
// modal.
//
// Wired in from ProjectFitView's "RATE THESE METHODS MYSELF" CTA;
// the previous flow only let the user record skill level (theory /
// occasional / regular) which doesn't answer the project-relevance
// question. Saved into project.methodfit so each project carries
// its own priority/capability matrix.
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../store/useStore'
import { ScrappyButton } from '../components/ScrappyButton'
import { FitDeck } from './ParticipantView'

const INK = '#1C2530'
const FONT_HEAD = 'Barlow Condensed, Impact, sans-serif'

export function ProjectMethodfitView() {
  const {
    projects, currentProjectId,
    practiced,
    practiceTool,
    recordProjectMethodfit,
    goProjectFit, goDashboard, goWelcome,
  } = useStore(useShallow(s => ({
    projects:               s.projects,
    currentProjectId:       s.currentProjectId,
    practiced:              s.practiced,
    practiceTool:           s.practiceTool,
    recordProjectMethodfit: s.recordProjectMethodfit,
    goProjectFit:           s.goProjectFit,
    goDashboard:            s.goDashboard,
    goWelcome:              s.goWelcome,
  })))

  const project = (projects || []).find(p => p.id === currentProjectId) || null

  // Bounce back if there's no active project (deep-link, stale state).
  if (!project) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#5A5550', marginBottom: 18 }}>
          No project selected.
        </div>
        <ScrappyButton onClick={goWelcome} color="#FFFFFF">
          ← My projects
        </ScrappyButton>
      </div>
    )
  }

  // Build the deck from the project's hydrated suggestions. FitDeck
  // expects an array of Tool objects.
  const tools = (project.suggestions || [])
    .map(s => s.tool)
    .filter(Boolean)
  const fits = (() => {
    const out = {}
    for (const [n, v] of Object.entries(project.methodfit || {})) {
      if (v?.fit) out[n] = v.fit
    }
    return out
  })()

  const handlePick = (tool, fit, capability) => {
    // Persist the project-specific fit + capability.
    recordProjectMethodfit(tool.n, { fit, capability })
    // Also reflect capability in the user's global practiced map so
    // the dashboard's overall capability tracks the same answer the
    // user just gave. We only upgrade — never downgrade — so a
    // theoretical-only rating here doesn't override an existing
    // 'regular' from a prior workshop.
    if (capability) {
      const prev = practiced[tool.n] || null
      const order = { theory: 1, occasional: 2, regular: 3 }
      const prevW = order[prev] || 0
      const nextW = order[capability] || 0
      if (nextW > prevW) practiceTool(tool.n, capability)
    }
  }

  // Pick a representative gate for the deck colour. Use the gate of
  // the first tool — most projects have a leading phase anyway.
  const gate = tools[0]?.g?.[0] || 1

  return (
    <div style={{ paddingBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px 0',
      }}>
        <ScrappyButton onClick={goProjectFit} color="#FFFFFF" size="sm">
          ← SHORTLIST
        </ScrappyButton>
        <div style={{ flex: 1 }} />
        <button onClick={() => goDashboard(null, 'project')}
          style={{
            padding: '5px 12px', borderRadius: 999,
            background: 'transparent', border: `1.5px solid ${INK}33`,
            color: INK, cursor: 'pointer',
            fontFamily: FONT_HEAD, fontWeight: 900, fontSize: 10,
            letterSpacing: '.06em', textTransform: 'uppercase',
          }}>
          See dashboard →
        </button>
      </div>
      <FitDeck
        tools={tools}
        gate={gate}
        project={{ name: project.name, desc: project.desc }}
        fits={fits}
        evals={practiced}
        onPick={handlePick}
        onDone={() => goDashboard(null, 'project')} />
    </div>
  )
}
