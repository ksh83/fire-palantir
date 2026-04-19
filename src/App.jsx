import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import IncidentDetail from './pages/IncidentDetail'
import ObjectExplorer from './pages/ObjectExplorer'
import Simulation from './pages/Simulation'
import FireBrain from './pages/FireBrain'
import Intro from './pages/Intro'
import NotificationCenter from './components/NotificationCenter'
import './App.css'

const DEMO_INCIDENT_ID = '90000000-0000-0000-0000-000000000001'

function App() {
  const [page, setPage] = useState('intro')
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [autoDemo, setAutoDemo] = useState(false)

  function navigate(target, params = {}) {
    setPage(target)
    if (params.incidentId) setSelectedIncident(params.incidentId)
    if (!params.autoDemo) setAutoDemo(false)
  }

  function launchDemo() {
    setSelectedIncident(DEMO_INCIDENT_ID)
    setAutoDemo(true)
    setPage('incident')
  }

  if (page === 'intro') {
    return <Intro onEnter={() => navigate('dashboard')} />
  }

  return (
    <div className="app">
      <nav className="topnav">
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => navigate('intro')}>
          <span className="brand-icon">🔥</span>
          <span className="brand-name">FIRE-PALANTIR</span>
          <span className="brand-sub">소방 운영 AI 플랫폼</span>
        </div>
        <div className="nav-links">
          <button
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => navigate('dashboard')}
          >운영 대시보드</button>
          <button
            className={page === 'simulation' ? 'active' : ''}
            onClick={() => navigate('simulation')}
          >시뮬레이션</button>
          <button
            className={page === 'firebrain' ? 'active' : ''}
            onClick={() => navigate('firebrain')}
          >전술지능센터</button>
          <button
            className={page === 'explorer' ? 'active' : ''}
            onClick={() => navigate('explorer')}
          >작전자원 네트워크</button>
        </div>
        <div className="nav-status">
          <span className="status-dot live" />
          <span>Supabase Realtime</span>
          <NotificationCenter />
        </div>
      </nav>

      <main className="main-content">
        {page === 'dashboard' && (
          <Dashboard
            onSelectIncident={(id) => navigate('incident', { incidentId: id })}
            onDemoLaunch={launchDemo}
          />
        )}
        {page === 'incident' && selectedIncident && (
          <IncidentDetail
            incidentId={selectedIncident}
            autoDemo={autoDemo}
            onBack={() => navigate('dashboard')}
          />
        )}
        {page === 'simulation' && (
          <Simulation
            onSelectIncident={(id) => navigate('incident', { incidentId: id })}
            onNavigate={(target) => navigate(target)}
          />
        )}
        {page === 'firebrain' && <FireBrain />}
        {page === 'explorer'  && <ObjectExplorer />}
      </main>
    </div>
  )
}

export default App
