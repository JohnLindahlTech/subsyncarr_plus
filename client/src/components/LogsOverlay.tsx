import React from 'react';
import { useAppStore } from '../store/useAppStore';
import Overlay from './Overlay';
import Button from './ui/Button';
import CodeBlock from './ui/CodeBlock';

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
        <CodeBlock 
          code={activeLogs || 'No logs found.'} 
          className="flex-1"
          maxHeight="100%"
        />
      </div>
    </Overlay>
  );
};

export default LogsOverlay;
