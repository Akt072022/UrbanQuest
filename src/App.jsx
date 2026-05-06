import { Component } from 'react'
import { useStore } from './store/useStore'
import { Navbar } from './components/Navbar'
import { WelcomeView } from './views/WelcomeView'
import { MapView } from './views/MapView'
import { ExploreView } from './views/ExploreView'
import { DashboardView } from './views/DashboardView'
import { FacilitatorView } from './views/FacilitatorView'
import { ParticipantView } from './views/ParticipantView'
import { ProfileView } from './views/ProfileView'
import { ProjectFitView } from './views/ProjectFitView'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error: error.message } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: '#F2EDE4', minHeight: '100vh', color: '#1A1A1A', padding: '40px', fontFamily: 'monospace' }}>
          <h2 style={{ color: '#1B3D6F', marginBottom: '12px', fontFamily: 'Barlow Condensed, sans-serif', fontSize: '2rem' }}>
            RENDER ERROR
          </h2>
          <pre style={{ fontSize: '13px', whiteSpace: 'pre-wrap', color: '#C0392B' }}>{this.state.error}</pre>
        </div>
      )
    }
    return this.props.children
  }
}

function AppInner() {
  const view = useStore(s => s.view)

  // Detect participant mode via URL param
  const params = new URLSearchParams(window.location.search)
  const roomId = params.get('room')
  if (roomId) {
    return <ParticipantView roomId={roomId} />
  }

  // Per-view max widths:
  //   • Dashboard / Facilitator → 960 (multi-column friendly)
  //   • Explore (cards)        → 560 (so the bigger desktop card fits)
  //   • Profile (badges grid)  → 720 (auto-fill grid likes a bit of room)
  //   • ProjectFit (AI shortlist) → 560 (cards read better at this width)
  //   • Map                    → 1280 on wide screens for the horizontal
  //                              path; falls back to mobile width on
  //                              narrow viewports via the inner layout.
  //   • Welcome                → 480 (form is narrow)
  const maxW = (view === 'dashboard' || view === 'facilitator') ? 960
    : view === 'explore'                                          ? 560
    : view === 'profile'                                          ? 720
    : view === 'projectFit'                                       ? 560
    : view === 'map'                                              ? 1280
    : 480

  return (
    <div style={{
      background: '#F2EDE4', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Navbar hidden on welcome (no nav before sign-in) and on
          explore (the card view already has its own ← MAP button +
          counter; the global bar would just steal vertical space
          from the card without adding navigation value). */}
      {view !== 'welcome' && view !== 'explore' && <Navbar />}
      <div style={{
        flex: 1, overflowY: 'auto',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
      }}>
        <div style={{
          width: '100%', maxWidth: maxW,
          padding: view === 'welcome' ? 0 : '20px 18px',
          boxSizing: 'border-box',
        }}>
          {view === 'welcome'     && <WelcomeView />}
          {view === 'projectFit'  && <ProjectFitView />}
          {view === 'map'         && <MapView />}
          {view === 'explore'     && <ExploreView />}
          {view === 'dashboard'   && <DashboardView />}
          {view === 'facilitator' && <FacilitatorView />}
          {view === 'profile'     && <ProfileView />}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
