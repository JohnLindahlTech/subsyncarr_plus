/**
 * api.js - All network requests and external communication
 */
const handle503 = (res) => {
  if (res.status === 503 && window.client) {
    window.client.stateManager.update({ isMaintenance: true });
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
  ) {
    const s = search ? `&search=${encodeURIComponent(search)}` : '';
    const f = agreementFilter ? `&filter=${agreementFilter}` : '';
    const st = statusFilter ? `&status=${statusFilter}` : '';
    const sc = `&sortColumn=${sortColumn}`;
    const so = `&sortOrder=${sortOrder}`;
    const res = await fetch(`/api/status?page=${page}&limit=${limit}${s}${f}${st}${sc}${so}`).then(handle503);
    return res.json();
  },

  async fetchConfig() {
    const res = await fetch('/api/config').then(handle503);
    return res.json();
  },

  async fetchDashboard() {
    const [s, e] = await Promise.all([
      fetch('/api/stats/global').then(handle503),
      fetch('/api/stats/errors').then(handle503),
    ]);
    return { stats: await s.json(), errors: await e.json() };
  },

  async fetchHistory() {
    const res = await fetch('/api/history').then(handle503);
    return res.json();
  },

  async fetchLogs(runId) {
    const res = await fetch(`/api/runs/${runId}/logs`).then(handle503);
    return res.json();
  },

  async startRun(paths = null, force = false) {
    return fetch('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, force }),
    }).then(handle503);
  },

  async stopRun() {
    return fetch('/api/run/stop', { method: 'POST' }).then(handle503);
  },

  async dryRun() {
    const res = await fetch('/api/run/dry-run', { method: 'POST' }).then(handle503);
    return res.json();
  },

  async verifyFile(runId, filePath) {
    return fetch('/api/file/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, filePath }),
    }).then(handle503);
  },

  async clearCompleted() {
    return fetch('/api/files/clear', { method: 'POST' }).then(handle503);
  },
};
