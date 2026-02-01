import React, { useEffect, useState } from 'react';
import { API } from '../api/api';
import { Run } from '@shared/types';
import { useAppStore } from '../store/useAppStore';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ViewContainer from '../components/ui/ViewContainer';
import { THead, TBody, TR, TH, TD } from '../components/ui/Table';

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
    <ViewContainer>
      <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <THead className="sticky top-0 z-10 shadow-sm">
              <TR>
                <TH>Date</TH>
                <TH>Status</TH>
                <TH>Files</TH>
                <TH>Success</TH>
                <TH>Failed</TH>
                <TH>Engines</TH>
                <TH>Time</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {loading ? (
                <TR>
                  <TD colSpan={8} className="px-6 py-12 text-center text-foreground-secondary animate-pulse italic font-medium">
                    Loading history...
                  </TD>
                </TR>
              ) : history.length > 0 ? (
                history.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      {new Date(r.start_time).toLocaleString()}
                    </TD>
                    <TD>
                      <Badge status={r.status} />
                    </TD>
                    <TD className="text-foreground-secondary font-medium">{r.total_files}</TD>
                    <TD className="font-bold text-success">{r.completed}</TD>
                    <TD className="font-bold text-danger">{r.failed}</TD>
                    <TD className="text-foreground-secondary font-medium">
                      {r.completed_engines}/{r.total_engines}
                    </TD>
                    <TD className="text-foreground-secondary font-medium italic">
                      {r.end_time ? Math.round((r.end_time - r.start_time) / 1000) + 's' : '...'}
                    </TD>
                    <TD>
                      <Button variant="ghost" size="sm" onClick={() => handleViewLogs(r.id)} className="h-8">📄 Logs</Button>
                    </TD>
                  </TR>
                ))
              ) : (
                <TR>
                  <TD colSpan={8} className="px-6 py-12 text-center text-foreground-secondary italic font-medium">
                    No history found.
                  </TD>
                </TR>
              )}
            </TBody>
          </table>
        </div>
      </div>
    </ViewContainer>
  );
};

export default HistoryView;