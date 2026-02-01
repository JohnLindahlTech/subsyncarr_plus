import React from 'react';
import { useAppStore } from '../store/useAppStore';
import Modal from './Modal';
import { DryRunResponse } from '../api/api';
import StatItem from './ui/StatItem';
import { Label } from './ui/Typography';
import Button from './ui/Button';

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
        <Button variant="secondary" onClick={closeDryRun}>
          Close
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <StatItem label="Total" value={d.totalSRTs} />
          <StatItem label="Done" value={d.alreadyDone} variant="success" />
          <StatItem label="Matched" value={d.matched.length} variant="primary" />
          <StatItem label="Missing" value={d.missingVideo.length} variant="danger" />
        </div>

        <div className="p-4 bg-background-alt border border-border rounded-xl flex items-center justify-between">
          <Label className="opacity-100">Est. Real Run Time</Label>
          <div className="text-xl font-black text-primary font-mono">{formatDuration(d.estimatedMs)}</div>
        </div>

        {d.missingVideo.length > 0 ? (
          <div className="space-y-3">
            <Label>Files with Missing Videos</Label>
            <div className="max-h-48 overflow-y-auto border border-border rounded-xl bg-background-alt divide-y divide-border custom-scrollbar">
              {d.missingVideo.map((m: MissingVideo, i: number) => (
                <div key={i} className="p-3 space-y-1">
                  <div className="text-xs font-bold text-foreground truncate">{m.srt}</div>
                  <div className="text-[10px] font-medium text-danger uppercase tracking-wider">{m.reason}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
};

export default DryRunModal;
