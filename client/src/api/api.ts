import { Run, StatusResponse, ConfigResponse, StatisticsResponse, LogsResponse, DryRunResponse } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

/**
 * api.ts - All network requests and external communication
 * Ported from public/js/api.js
 */

export type { ConfigResponse, StatisticsResponse, DryRunResponse };

// We will use a more React-friendly way to handle 503s later (e.g., via the store)
// For now, this helper just checks the status.
const handleResponse = async (res: Response) => {
  if (res.status === 503) {
    useAppStore.getState().setMaintenance(true);
    throw new Error('MAINTENANCE_MODE');
  }
  return res;
};

export const API = {
  async fetchStatus(
    page = 1,
    limit = 50,
    search = '',
    agreementFilter = '',
    statusFilter = '',
    sortColumn = 'file_path',
    sortOrder = 'ASC',
    runId = '',
  ): Promise<StatusResponse> {
    const s = search ? `&search=${encodeURIComponent(search)}` : '';
    const f = agreementFilter ? `&filter=${agreementFilter}` : '';
    const st = statusFilter ? `&status=${statusFilter}` : '';
    const sc = `&sortColumn=${sortColumn}`;
    const so = `&sortOrder=${sortOrder}`;
    const rid = runId ? `&runId=${runId}` : '';
    const res = await fetch(`/api/status?page=${page}&limit=${limit}${s}${f}${st}${sc}${so}${rid}`).then(
      handleResponse,
    );
    return res.json();
  },

  async fetchConfig(): Promise<ConfigResponse> {
    const res = await fetch('/api/config').then(handleResponse);
    return res.json();
  },

  async fetchStatistics(): Promise<StatisticsResponse> {
    const [s, e] = await Promise.all([
      fetch('/api/stats/global').then(handleResponse),
      fetch('/api/stats/errors').then(handleResponse),
    ]);
    return {
      stats: (await s.json()) as StatisticsResponse['stats'],
      errors: (await e.json()) as StatisticsResponse['errors'],
    };
  },

  async fetchHistory(limit = 50): Promise<Run[]> {
    const res = await fetch(`/api/history?limit=${limit}`).then(handleResponse);
    return res.json();
  },

  async fetchLogs(runId: string): Promise<LogsResponse> {
    const res = await fetch(`/api/runs/${runId}/logs`).then(handleResponse);
    return res.json();
  },

  async startRun(paths: string[] | null = null, force = false): Promise<Response> {
    return fetch('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, force }),
    }).then(handleResponse);
  },

  async stopRun(): Promise<Response> {
    return fetch('/api/run/stop', { method: 'POST' }).then(handleResponse);
  },

  async dryRun(): Promise<DryRunResponse> {
    const res = await fetch('/api/run/dry-run', { method: 'POST' }).then(handleResponse);
    return res.json();
  },

  async verifyFile(runId: string, filePath: string): Promise<Response> {
    return fetch('/api/file/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, filePath }),
    }).then(handleResponse);
  },

  async clearCompleted(): Promise<Response> {
    return fetch('/api/files/clear', { method: 'POST' }).then(handleResponse);
  },
};
