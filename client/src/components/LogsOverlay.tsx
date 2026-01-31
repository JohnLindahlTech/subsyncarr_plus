import React from 'react';
import { useAppStore } from '../store/useAppStore';
import Overlay from './Overlay';

const LogsOverlay: React.FC = () => {
  const { isLogsOpen, closeLogs, activeLogs, activeLogsTitle } = useAppStore();

  const handleCopy = () => {
    navigator.clipboard.writeText(activeLogs);
  };

  const headerActions = (
    <button className="btn btn-secondary btn-sm" onClick={handleCopy}>
      📋 Copy Logs
    </button>
  );

  return (
    <Overlay isOpen={isLogsOpen} onClose={closeLogs} title={activeLogsTitle} headerActions={headerActions}>
      <pre className="code-block logs-view-large">{activeLogs || 'No logs found.'}</pre>
    </Overlay>
  );
};

export default LogsOverlay;
