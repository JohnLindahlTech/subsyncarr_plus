import { useEffect } from 'react';
import { useLocation, Routes, Route } from 'react-router-dom';
import { useAppStore, ViewType } from './store/useAppStore';
import { useWebSocket } from './hooks/useWebSocket';
import Layout from './components/Layout';
import LiveView from './views/LiveView';
import ExplorerView from './views/ExplorerView';
import DashboardView from './views/DashboardView';
import HistoryView from './views/HistoryView';
import SystemView from './views/SystemView';
import DocsView from './views/DocsView';
import DetailsOverlay from './components/DetailsOverlay';
import LogsOverlay from './components/LogsOverlay';
import DryRunModal from './components/DryRunModal';
import PartialRunModal from './components/PartialRunModal';

function App() {
  const location = useLocation();
  const initTheme = useAppStore((state) => state.initTheme);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setConfig = useAppStore((state) => state.setConfig);
  const health = useAppStore((state) => state.health);

  // Initialize WebSocket connection
  useWebSocket();

  // Initialize theme and fetch config on mount
  useEffect(() => {
    initTheme();
    
    const fetchAppConfig = async () => {
      try {
        const data = await API.fetchConfig();
        setConfig(data);
      } catch (err) {
        console.error('Failed to fetch initial config', err);
      }
    };
    fetchAppConfig();
  }, [initTheme, setConfig]);

  // Sync activeView with router
  useEffect(() => {
    const path = location.pathname;
    let view: ViewType = 'live';
    if (path === '/explorer') view = 'explorer';
    else if (path === '/dashboard') view = 'dashboard';
    else if (path === '/history') view = 'history';
    else if (path === '/system') view = 'system';
    else if (path === '/docs') view = 'docs';

    setActiveView(view);
  }, [location, setActiveView]);

  return (
    <Layout>
      {health && !health.allOk && (
        <div id="healthWarning" className="health-warning">
          <span className="warning-icon">⚠️</span>
          <span>System issues detected. Check System Health.</span>
        </div>
      )}

      <Routes>
        <Route path="/" element={<LiveView />} />
        <Route path="/explorer" element={<ExplorerView />} />
        <Route path="/dashboard" element={<DashboardView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/system" element={<SystemView />} />
        <Route path="/docs" element={<DocsView />} />
      </Routes>

      <DetailsOverlay />
      <LogsOverlay />
      <DryRunModal />
      <PartialRunModal />
    </Layout>
  );
}

export default App;
