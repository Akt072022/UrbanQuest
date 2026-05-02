import { Component } from 'react'
import { useStore } from './store/useStore'
import { Navbar } from './components/Navbar'
import { WelcomeView } from './views/WelcomeView'
import { MapView } from './views/MapView'
import { ExploreView } from './views/ExploreView'
import { DashboardView } from './views/DashboardView'
import { FacilitatorView } from './views/FacilitatorView'
import { ParticipantView } from './views/ParticipantView'

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

  return (
    <div style={{ background: '#F2EDE4', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {view !== 'welcome' && <Navbar />}
      <div style={{ flex: 1, padding: view === 'welcome' ? 0 : '20px 18px', overflowY: 'auto' }}>
        {view === 'welcome'     && <WelcomeView />}
        {view === 'map'         && <MapView />}
        {view === 'explore'     && <ExploreView />}
        {view === 'dashboard'   && <DashboardView />}
        {view === 'facilitator' && <FacilitatorView />}
      </div>
    </div>
  )
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>
}
