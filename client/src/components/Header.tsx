import { useState, useRef, useEffect } from 'react';
import { useAppStore, ViewType } from '../store/useAppStore';
import { API } from '../api/api';
import { RunStatus, Run } from '@shared/types';
import clsx from 'clsx';
import Button from './ui/Button';

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
    config,
    updateState,
    openDryRun,
    openPartialRun,
  } = useAppStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const title = viewTitles[activeView] || 'Subsyncarr++';
  const isScanning = (isRunning && (!currentRun || currentRun.status === RunStatus.COMPLETED)) || isDryRunning;

  // Parity with old UI labels
  const pathsLabel = config?.isConfigured ? config.paths.join(', ') : 'Default (/scan_dir)';
  const scheduleLabel = config?.schedule.description || 'Manual only';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

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
    <header className="h-16 border-b border-border bg-background flex items-center justify-between px-8 sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                'w-2.5 h-2.5 rounded-full',
                config?.isConfigured
                  ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : 'bg-foreground-secondary/30',
              )}
            ></div>
            <span className="text-foreground-secondary font-medium uppercase tracking-wider">{pathsLabel}</span>
          </div>
          <div className="flex items-center gap-2 border-l border-border pl-4">
            <span className="opacity-60">⏰</span>
            <span className="text-foreground-secondary font-medium uppercase tracking-wider">{scheduleLabel}</span>
          </div>
          {isScanning && (
            <div className="flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full animate-pulse">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              <span className="font-bold uppercase tracking-widest text-xxs">
                {initMessage || (isDryRunning ? 'Dry Run: Scanning...' : 'Scanning Library...')}
              </span>
            </div>
          )}
          {isMaintenance && (
            <div className="flex items-center gap-2 bg-warning/10 text-warning px-3 py-1 rounded-full">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              <span className="font-bold uppercase tracking-widest text-xxs">Database Maintenance...</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isRunning && (
          <Button variant="danger" size="sm" onClick={handleStopRun}>
            ⏹ Stop
          </Button>
        )}

        <div className="relative inline-flex items-center" ref={dropdownRef}>
          <Button
            size="sm"
            onClick={() => handleStartRun(false)}
            disabled={isScanning}
            className="rounded-r-none border-r border-primary-hover/30"
          >
            {isScanning ? 'Scanning...' : '▶ Start Run'}
          </Button>

          <Button size="sm" className="rounded-l-none px-2" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            <span
              className={clsx(
                'w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-primary-foreground transition-transform',
                isMenuOpen && 'rotate-180',
              )}
            ></span>
          </Button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border shadow-md rounded-lg overflow-hidden py-1 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary transition-colors text-foreground flex items-center gap-3"
                onClick={handleDryRun}
              >
                <span>🔍</span> Dry Run Impact
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-danger/10 text-danger transition-colors border-t border-border flex items-center gap-3"
                onClick={() => handleStartRun(true)}
              >
                <span>🔥</span> Force Full Rerun
              </button>
              <div className="border-t border-border"></div>
              <button
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-secondary transition-colors text-foreground flex items-center gap-3"
                onClick={() => {
                  setIsMenuOpen(false);
                  openPartialRun();
                }}
              >
                <span>📁</span> Partial Folder Sync
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
