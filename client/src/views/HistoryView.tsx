import React, { useEffect, useState } from 'react';
import { API } from '../api/api';
import { Run } from '@shared/types';
import { useAppStore } from '../store/useAppStore';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

const HistoryView: React.FC = () => {
  const [history, setHistory] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const openLogs = useAppStore((state) => state.openLogs);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await API.fetchHistory();
        setHistory(data);
      } catch (err) {
        console.error('Failed to fetch history', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  const handleViewLogs = async (runId: string) => {
    try {
      const data = await API.fetchLogs(runId);
      openLogs(`Run Logs: ${runId}`, data.logs);
    } catch (err) {
      console.error('Failed to fetch logs', err);
    }
  };

  const getStatusVariant = (status: string) => {
    if (status === 'completed') return 'success';
    if (status === 'cancelled') return 'warning';
    return 'secondary';
  };

  return (
    <section id="view-history" className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden animate-in fade-in duration-500">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-background-alt/50 border-b border-border">
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Date</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Status</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Files</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Success</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Failed</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Engines</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Time</th>
            <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {loading ? (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-foreground-secondary animate-pulse italic font-medium">
                Loading history...
              </td>
            </tr>
          ) : history.length > 0 ? (
            history.map((r) => (
              <tr key={r.id} className="hover:bg-primary/5 transition-colors group">
                <td className="px-6 py-4 text-sm font-medium text-foreground">
                  {new Date(r.start_time).toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <Badge variant={getStatusVariant(r.status)}>{r.status}</Badge>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-foreground-secondary">{r.total_files}</td>
                <td className="px-6 py-4 text-sm font-bold text-success">{r.completed}</td>
                <td className="px-6 py-4 text-sm font-bold text-danger">{r.failed}</td>
                <td className="px-6 py-4 text-sm font-medium text-foreground-secondary">
                  {r.completed_engines}/{r.total_engines}
                </td>
                <td className="px-6 py-4 text-sm text-foreground-secondary font-medium italic">
                  {r.end_time ? Math.round((r.end_time - r.start_time) / 1000) + 's' : '...'}
                </td>
                <td className="px-6 py-4">
                  <Button variant="ghost" size="sm" onClick={() => handleViewLogs(r.id)} className="h-8">📄 Logs</Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="px-6 py-12 text-center text-foreground-secondary italic font-medium">
                No history found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
};

export default HistoryView;