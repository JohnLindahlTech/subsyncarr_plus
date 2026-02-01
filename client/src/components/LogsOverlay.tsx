import React from 'react';
import { useAppStore } from '../store/useAppStore';
import Overlay from './Overlay';
import Button from './ui/Button';

const LogsOverlay: React.FC = () => {
  const { isLogsOpen, closeLogs, activeLogs, activeLogsTitle } = useAppStore();

  const handleCopy = () => {
    navigator.clipboard.writeText(activeLogs);
  };

  const headerActions = (
    <Button variant="secondary" size="sm" onClick={handleCopy}>
      📋 Copy Logs
    </Button>
  );

  return (
    <Overlay isOpen={isLogsOpen} onClose={closeLogs} title={activeLogsTitle} headerActions={headerActions}>
      <div className="flex-1 overflow-hidden flex flex-col p-8 bg-code-bg">
        <pre className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed text-code-text custom-scrollbar selection:bg-primary/30">
          {activeLogs || 'No logs found.'}
        </pre>
      </div>
    </Overlay>
  );
};

export default LogsOverlay;