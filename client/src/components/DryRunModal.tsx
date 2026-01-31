import React from 'react';
import { useAppStore } from '../store/useAppStore';
import Modal from './Modal';
import { DryRunResponse } from '../api/api';

type MissingVideo = DryRunResponse['missingVideo'][0];

const formatDuration = (ms: number) => {
  if (!ms || ms < 0) return '0m';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

const DryRunModal: React.FC = () => {
  const { isDryRunOpen, closeDryRun, dryRunData } = useAppStore();

  if (!dryRunData) return null;

  const d = dryRunData as DryRunResponse;

  return (
    <Modal
      isOpen={isDryRunOpen}
      onClose={closeDryRun}
      title="Dry Run Impact Report"
      footer={
        <button className="btn btn-secondary" onClick={closeDryRun}>
          Close
        </button>
      }
    >
      <div className="summary-grid">
        <div className="summary-card">
          <label>Total</label>
          <div className="summary-value">{d.totalSRTs}</div>
        </div>
        <div className="summary-card success">
          <label>Done</label>
          <div className="summary-value">{d.alreadyDone}</div>
        </div>
        <div className="summary-card primary">
          <label>Matched</label>
          <div className="summary-value">{d.matched.length}</div>
        </div>
        <div className="summary-card danger">
          <label>Missing</label>
          <div className="summary-value">{d.missingVideo.length}</div>
        </div>
      </div>
      <div className="debug-section">
        <label>Est. Real Run Time:</label>
        <div className="estimate-value">{formatDuration(d.estimatedMs)}</div>
      </div>

      {d.missingVideo.length > 0 && (
        <div className="detail-list">
          <label
            style={{
              marginTop: '20px',
              display: 'block',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            Files with Missing Videos
          </label>
          <div
            style={{
              maxHeight: '200px',
              overflowY: 'auto',
              marginTop: '10px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--background-alt)',
            }}
          >
            {d.missingVideo.map((m: MissingVideo, i: number) => (
              <div key={i} style={{ padding: '10px 15px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                <div style={{ fontWeight: 600 }}>{m.srt}</div>
                <div style={{ fontSize: '11px', color: 'var(--danger)' }}>{m.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default DryRunModal;
