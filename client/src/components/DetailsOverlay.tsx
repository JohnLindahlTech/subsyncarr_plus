import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { EngineResult } from '@shared/types';
import Overlay from './Overlay';
import clsx from 'clsx';

const basename = (path: string) => path.split('/').pop() || '';

const DetailsOverlay: React.FC = () => {
  const { isDetailsOpen, closeDetails, activeDebugFile, activeDebugEngine, updateState } = useAppStore();

  if (!activeDebugFile) return null;

  const engines: Record<string, EngineResult> = JSON.parse(activeDebugFile.engines || '{}');
  const engineNames = Object.keys(engines);
  const activeEngineData = activeDebugEngine ? engines[activeDebugEngine] : null;

  const tabs = engineNames.map((name) => (
    <button
      key={name}
      className={clsx('tab-item', name === activeDebugEngine && 'active')}
      onClick={() => updateState({ activeDebugEngine: name })}
    >
      {name}
    </button>
  ));

  return (
    <Overlay
      isOpen={isDetailsOpen}
      onClose={closeDetails}
      title={`Processing: ${basename(activeDebugFile.file_path)}`}
      tabs={tabs}
    >
      {activeEngineData ? (
        <div className="engine-detail-pane">
          <div className="pane-header">
            <div className={clsx('status-indicator-large', activeEngineData.success ? 'success' : 'error')}>
              <span>{activeEngineData.success ? '✓ Successfully Synced' : '✗ Sync Failed'}</span>
              {activeEngineData.score !== undefined && <span>Confidence: {activeEngineData.score}%</span>}
            </div>
            {activeEngineData.duration && (
              <div className="top-info-text">Duration: {(activeEngineData.duration / 1000).toFixed(1)}s</div>
            )}
          </div>
          <div className="debug-section">
            <label>Executed Command</label>
            <pre className="code-block">{activeEngineData.command || '-'}</pre>
          </div>
          {activeEngineData.stderr && (
            <div className="debug-section">
              <label>Error Output (stderr)</label>
              <pre className="code-block error-text">{activeEngineData.stderr}</pre>
            </div>
          )}
          <div className="debug-section">
            <label>Standard Output (stdout)</label>
            <pre className="code-block">{activeEngineData.stdout || '-'}</pre>
          </div>
        </div>
      ) : (
        <p className="no-data-msg">Engine data not found.</p>
      )}
    </Overlay>
  );
};

export default DetailsOverlay;
