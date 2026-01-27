/**
 * api.js - All network requests and external communication
 */
export const API = {
  async fetchStatus(page = 1, limit = 50, search = '', agreementFilter = '', statusFilter = '') {
    const s = search ? `&search=${encodeURIComponent(search)}` : '';
    const f = agreementFilter ? `&filter=${agreementFilter}` : '';
    const st = statusFilter ? `&status=${statusFilter}` : '';
    const res = await fetch(`/api/status?page=${page}&limit=${limit}${s}${f}${st}`);
    return res.json();
  },

  async fetchConfig() {
    const res = await fetch('/api/config');
    return res.json();
  },

  async fetchDashboard() {
    const [s, e] = await Promise.all([fetch('/api/stats/global'), fetch('/api/stats/errors')]);
    return { stats: await s.json(), errors: await e.json() };
  },

  async fetchHistory() {
    const res = await fetch('/api/history');
    return res.json();
  },

  async fetchLogs(runId) {
    const res = await fetch(`/api/runs/${runId}/logs`);
    return res.json();
  },

  async startRun(paths = null, force = false) {
    return fetch('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, force }),
    });
  },

  async stopRun() {
    return fetch('/api/run/stop', { method: 'POST' });
  },

  async dryRun() {
    const res = await fetch('/api/run/dry-run', { method: 'POST' });
    return res.json();
  },

  async verifyFile(runId, filePath) {
    return fetch('/api/file/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, filePath }),
    });
  },

  async clearCompleted() {
    return fetch('/api/files/clear', { method: 'POST' });
  },
};
