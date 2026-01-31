import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { API } from '../api/api';
import { ConfigResponse, RunStatus, Run } from '@shared/types';
import Modal from './Modal';

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
          <button className="btn btn-secondary" onClick={closePartialRun}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            🚀 Start Partial Sync
          </button>
        </>
      }
    >
      <p>
        Enter a sub-directory path relative to your library roots. The system will only scan and sync files within this
        path.
      </p>

      <div className="allowed-roots-box">
        <label>Authorized Library Roots:</label>
        <ul className="docs-list small">
          {config?.paths.map((p) => (
            <li key={p}>
              <code
                className="clickable-path"
                style={{ cursor: 'pointer' }}
                title="Click to use this path"
                onClick={() => setPath(p)}
              >
                {p}
              </code>
            </li>
          ))}
        </ul>
      </div>

      <div className="input-group">
        <input
          type="text"
          className="search-input"
          placeholder="/media/tv/My Show/S01"
          style={{ maxWidth: '100%' }}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
      </div>
      {error && (
        <p className="error-text" style={{ marginTop: '10px' }}>
          {error}
        </p>
      )}
    </Modal>
  );
};

export default PartialRunModal;
