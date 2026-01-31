import React, { useEffect, useState } from 'react';
import { API } from '../api/api';
import { Run } from '@shared/types';
import { useAppStore } from '../store/useAppStore';
import clsx from 'clsx';

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

  return (
    <section id="view-history" className="view">
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Status</th>
            <th>Total Files</th>
            <th>Success</th>
            <th>Failed</th>
            <th>Engines Run</th>
            <th>Time</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="historyBody">
          {loading ? (
            <tr>
              <td colSpan={8} className="no-data">
                Loading history...
              </td>
            </tr>
          ) : history.length > 0 ? (
            history.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.start_time).toLocaleString()}</td>
                <td>
                  <span className={clsx('status-badge', r.status)}>{r.status}</span>
                </td>
                <td>{r.total_files}</td>
                <td>{r.completed}</td>
                <td>{r.failed}</td>
                <td>
                  {r.completed_engines}/{r.total_engines}
                </td>
                <td>{r.end_time ? Math.round((r.end_time - r.start_time) / 1000) + 's' : '...'}</td>
                <td>
                  <button className="btn-link" onClick={() => handleViewLogs(r.id)}>
                    📄 Logs
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8} className="no-data">
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
