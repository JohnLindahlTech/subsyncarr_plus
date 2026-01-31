import { useState } from 'react';
import { useAppStore, ViewType } from '../store/useAppStore';
import { API } from '../api/api';
import { RunStatus, Run } from '@shared/types';

const viewTitles: Record<ViewType, string> = {
  live: 'Live Run',
  explorer: 'Library Explorer',
  dashboard: 'Statistics Dashboard',
  history: 'Run History',
  system: 'System Health & Config',
  docs: 'How It Works',
};

const Header = () => {
  const {
    activeView,
    isRunning,
    isDryRunning,
    isMaintenance,
    initMessage,
    currentRun,
    updateState,
    openDryRun,
    openPartialRun,
  } = useAppStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const title = viewTitles[activeView] || 'Subsyncarr++';
  const isScanning = (isRunning && (!currentRun || currentRun.status === RunStatus.COMPLETED)) || isDryRunning;

  const handleStartRun = async (force = false) => {
    setIsMenuOpen(false);
    updateState({
      isRunning: true,
      currentRun: null,
      files: [],
      initMessage: 'Initializing scan...',
    });

    try {
      const res = await API.startRun(null, force);
      if (res.ok) {
        const data = await res.json();
        updateState({
          isRunning: true,
          currentRun: { id: data.runId, status: RunStatus.RUNNING } as unknown as Run,
          initMessage: 'Run started...',
        });
      }
    } catch (err) {
      console.error('Failed to start run', err);
      updateState({ isRunning: false, initMessage: '' });
    }
  };

  const handleStopRun = async () => {
    if (window.confirm('Stop all processing?')) {
      await API.stopRun();
    }
  };

  const handleDryRun = async () => {
    setIsMenuOpen(false);
    updateState({ isDryRunning: true });
    try {
      const data = await API.dryRun();
      openDryRun(data);
    } finally {
      updateState({ isDryRunning: false });
    }
  };

  return (
    <header className="top-bar">
      <div className="header-left">
        <h2 id="viewTitle">{title}</h2>
        <div className="top-info-area">
          <div className="top-info-item">
            <div id="statusLight" className="status-light-sm active"></div>
            <span id="statusPaths" className="top-info-text">
              Folders Loaded
            </span>
          </div>
          {isScanning && (
            <div className="top-info-badge">
              <span className="spinner-sm"></span>
              <span className="top-info-text">
                {initMessage || (isDryRunning ? 'Dry Run: Scanning...' : 'Scanning Library...')}
              </span>
            </div>
          )}
          {isMaintenance && (
            <div className="top-info-badge maintenance">
              <span className="spinner-sm"></span>
              <span className="top-info-text">Database Maintenance...</span>
            </div>
          )}
        </div>
      </div>
      <div className="header-right">
        <div className="controls">
          {isRunning && (
            <button className="btn btn-danger" onClick={handleStopRun}>
              ⏹ Stop
            </button>
          )}

          <div className="main-actions-group">
            <button className="btn btn-primary" onClick={() => handleStartRun(false)} disabled={isScanning}>
              {isScanning ? (
                <>
                  <span className="spinner-sm"></span> Scanning...
                </>
              ) : (
                '▶ Start Run'
              )}
            </button>

            <div className="dropdown">
              <button className="btn btn-primary dropdown-toggle" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                <span className="chevron-down"></span>
              </button>
              {isMenuOpen && (
                <div className="dropdown-menu" style={{ display: 'block' }}>
                  <button className="dropdown-item" onClick={handleDryRun}>
                    🔍 Dry Run Impact
                  </button>
                  <button className="dropdown-item danger" onClick={() => handleStartRun(true)}>
                    🔥 Force Full Rerun
                  </button>
                  <div className="dropdown-divider"></div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setIsMenuOpen(false);
                      openPartialRun();
                    }}
                  >
                    📁 Partial Folder Sync
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
