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
      className={clsx(
        'px-6 py-3 text-sm font-bold uppercase tracking-wider transition-colors border-b-2',
        name === activeDebugEngine 
          ? 'border-primary text-primary bg-primary/5' 
          : 'border-transparent text-foreground-secondary hover:text-foreground hover:bg-background-alt'
      )}
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
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <div className="flex items-center justify-between p-6 bg-background-alt border border-border rounded-xl">
            <div className={clsx(
              'flex items-center gap-4 text-lg font-black uppercase tracking-tight',
              activeEngineData.success ? 'text-success' : 'text-danger'
            )}>
              <span>{activeEngineData.success ? '✓ Successfully Synced' : '✗ Sync Failed'}</span>
              {activeEngineData.score !== undefined && (
                <span className="px-3 py-1 bg-current/10 rounded-full text-sm">
                  Confidence: {activeEngineData.score}%
                </span>
              )}
            </div>
            {activeEngineData.duration && (
              <div className="text-sm font-bold text-foreground-secondary italic">
                Duration: {(activeEngineData.duration / 1000).toFixed(1)}s
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground-secondary opacity-60">Executed Command</label>
            <pre className="p-4 bg-code-bg text-code-text rounded-lg font-mono text-xs overflow-x-auto border border-white/5 shadow-inner leading-relaxed">
              {activeEngineData.command || '-'}
            </pre>
          </div>

          {activeEngineData.stderr && (
            <div className="space-y-3">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-danger opacity-80">Error Output (stderr)</label>
              <pre className="p-4 bg-danger/5 text-danger border border-danger/10 rounded-lg font-mono text-xs overflow-x-auto leading-relaxed whitespace-pre-wrap">
                {activeEngineData.stderr}
              </pre>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground-secondary opacity-60">Standard Output (stdout)</label>
            <pre className="p-4 bg-background-alt border border-border rounded-lg font-mono text-xs overflow-x-auto leading-relaxed text-foreground-secondary italic">
              {activeEngineData.stdout || '-'}
            </pre>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center italic text-foreground-secondary opacity-50">
          Engine data not found.
        </div>
      )}
    </Overlay>
  );
};

export default DetailsOverlay;