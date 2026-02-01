import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { API } from '../api/api';
import { ConfigResponse, RunStatus, Run } from '@shared/types';
import Modal from './Modal';
import Button from './ui/Button';

const PartialRunModal: React.FC = () => {
  const { isPartialRunOpen, closePartialRun, updateState } = useAppStore();
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [config, setConfig] = useState<ConfigResponse | null>(null);

  useEffect(() => {
    if (isPartialRunOpen) {
      const fetchRoots = async () => {
        try {
          const data = await API.fetchConfig();
          setConfig(data);
        } catch (err) {
          console.error('Failed to fetch roots', err);
        }
      };
      fetchRoots();
      setPath('');
      setError('');
    }
  }, [isPartialRunOpen]);

  const handleConfirm = async () => {
    if (!path.trim()) return;

    try {
      setError('');
      const res = await API.startRun([path.trim()]);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Validation failed');
      }

      const data = await res.json();
      updateState({
        isRunning: true,
        currentRun: { id: data.runId, status: RunStatus.RUNNING } as unknown as Run,
        initMessage: 'Run started...',
      });
      closePartialRun();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setError(message);
    }
  };

  return (
    <Modal
      isOpen={isPartialRunOpen}
      onClose={closePartialRun}
      title="Partial Folder Sync"
      footer={
        <>
          <Button variant="secondary" onClick={closePartialRun}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>🚀 Start Partial Sync</Button>
        </>
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-foreground-secondary leading-relaxed font-medium">
          Enter a sub-directory path relative to your library roots. The system will only scan and sync files within
          this path.
        </p>

        <div className="p-4 bg-background-alt border border-border rounded-xl space-y-3">
          <label className="text-[10px] font-black uppercase tracking-widest text-foreground-secondary opacity-60">
            Authorized Library Roots
          </label>
          <ul className="space-y-1">
            {config?.paths.map((p) => (
              <li key={p}>
                <code
                  className="block px-3 py-2 bg-background border border-border rounded-lg text-xs font-mono text-primary font-bold cursor-pointer hover:border-primary/50 transition-colors"
                  title="Click to use this path"
                  onClick={() => setPath(p)}
                >
                  {p}
                </code>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            className="w-full h-12 px-4 rounded-lg bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
            placeholder="/media/tv/My Show/S01"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          {error ? <p className="text-xs font-bold text-danger animate-in shake-1">{error}</p> : null}
        </div>
      </div>
    </Modal>
  );
};

export default PartialRunModal;
