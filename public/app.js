class SubsyncarrPlusPlusClient {
  constructor() {
    this.ws = null;
    this.state = {
      currentRun: null,
      files: [],
      isRunning: false,
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      searchQuery: '',
      agreementFilter: '',
      health: null,
      activeView: 'live',
    };
    this.reconnectInterval = 3000;
    this.searchTimeout = null;

    this.initTheme();
    this.initWebSocket();
    this.setupRouter();
    this.setupEventHandlers();
    this.setupInfiniteScroll();
    this.setupStateReconciliation();
    this.fetchInitialState();
    this.fetchConfigStatus();
  }

  // --- ROUTING SYSTEM ---

  setupRouter() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  }

  handleRoute() {
    const hash = window.location.hash || '#/';
    const viewMap = {
      '#/': 'live',
      '#/explorer': 'explorer',
      '#/dashboard': 'dashboard',
      '#/history': 'history',
      '#/system': 'system',
    };
    const view = viewMap[hash] || 'live';
    this.switchView(view);
  }

  switchView(viewId) {
    this.state.activeView = viewId;
    document.querySelectorAll('.nav-item').forEach((nav) => {
      nav.classList.toggle('active', nav.getAttribute('data-view') === viewId);
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.classList.toggle('hidden', section.id !== `view-${viewId}`);
    });
    const titles = {
      live: 'Live Run',
      explorer: 'Library Explorer',
      dashboard: 'Statistics Dashboard',
      history: 'Run History',
      system: 'System Health & Config',
    };
    document.getElementById('viewTitle').textContent = titles[viewId];

    if (viewId === 'dashboard') this.fetchDashboardData();
    if (viewId === 'history') this.fetchHistory();
    this.render(); // Ensure the active view is rendered
  }

  // --- UI INITIALIZATION ---

  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'dark');
  }

  toggleTheme() {
    const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);
    this.ws.onopen = () => this.reconcileState();
    this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    this.ws.onclose = () => setTimeout(() => this.initWebSocket(), this.reconnectInterval);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        this.state = { ...this.state, ...msg.data };
        this.render();
        this.renderHealthStatus();
        break;
      case 'run:started':
        this.state.currentRun = msg.data;
        this.state.isRunning = true;
        this.state.files = [];
        this.render();
        break;
      case 'run:progress':
        this.state.initMessage = msg.data.message;
        this.render();
        break;
      case 'health:updated':
        this.state.health = msg.data;
        this.renderHealthStatus();
        break;
      case 'file:updated':
        this.updateFile(msg.data.file);
        if (msg.data.run) this.state.currentRun = msg.data.run;
        this.render();
        break;
    }
  }

  updateFile(fileData) {
    // Check if file matches current filters
    const matchesFilter = !this.state.agreementFilter || fileData.agreement_status === this.state.agreementFilter;
    const matchesSearch =
      !this.state.searchQuery || fileData.file_path.toLowerCase().includes(this.state.searchQuery.toLowerCase());

    const index = this.state.files.findIndex((f) => f.file_path === fileData.file_path);

    if (matchesFilter && matchesSearch) {
      // It matches, so add or update it
      if (index >= 0) {
        this.state.files[index] = { ...this.state.files[index], ...fileData };
      } else {
        // Only add new files if we are on the first page or it's a processing status
        // (to avoid messing up pagination for older completed items)
        if (fileData.status === 'processing' || this.state.pagination.page === 1) {
          this.state.files.unshift(fileData);
        }
      }
    } else {
      // It does not match. If it's currently in the list, remove it.
      if (index >= 0) {
        this.state.files.splice(index, 1);
      }
    }
  }

  // --- DATA FETCHING ---

  async fetchInitialState() {
    const search = this.state.searchQuery ? `&search=${encodeURIComponent(this.state.searchQuery)}` : '';
    const filter = this.state.agreementFilter ? `&filter=${this.state.agreementFilter}` : '';
    const res = await fetch(`/api/status?page=1&limit=50${search}${filter}`);
    const data = await res.json();
    this.state.currentRun = data.currentRun;
    this.state.files = data.files;
    this.state.pagination = data.pagination;
    this.state.isRunning = data.isRunning;
    this.render();
  }

  async fetchConfigStatus() {
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      this.renderConfigStatus(config);
    } catch (e) {
      console.error('Config fetch failed', e);
    }
  }

  async fetchDashboardData() {
    try {
      const [s, e] = await Promise.all([fetch('/api/stats/global'), fetch('/api/stats/errors')]);
      this.renderDashboard(await s.json(), await e.json());
    } catch (err) {
      console.error('Dashboard failed', err);
    }
  }

  async fetchHistory() {
    const res = await fetch('/api/history');
    this.renderHistory(await res.json());
  }

  // --- RENDERERS ---

  render() {
    this.renderProgress();
    if (this.state.activeView === 'live') this.renderLiveList();
    if (this.state.activeView === 'explorer') this.renderExplorerList();
    this.updateButtonVisibility();
  }

  renderProgress() {
    const { currentRun, isRunning } = this.state;
    const el = document.getElementById('currentRun');
    if (!isRunning && (!currentRun || currentRun.status === 'completed')) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const status = document.getElementById('currentTaskStatus');

    if (isRunning && !currentRun) {
      fill.style.width = '0%';
      text.textContent = '0%';
      status.textContent = this.state.initMessage || 'Scanning...';
      return;
    }
    if (currentRun) {
      const p = currentRun.total_engines > 0 ? (currentRun.completed_engines / currentRun.total_engines) * 100 : 0;
      fill.style.width = `${p}%`;
      text.textContent = `${Math.round(p)}%`;
      status.textContent = currentRun.current_video || '';
    }
  }

  renderLiveList() {
    const proc = this.state.files.filter((f) => f.status === 'processing');
    const comp = this.state.files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status)).slice(0, 10);

    const procEl = document.getElementById('filesInProgress');
    const compEl = document.getElementById('completedList');

    if (proc.length > 0) procEl.innerHTML = proc.map((f) => this.renderFileCard(f)).join('');
    else procEl.innerHTML = '<p class="no-data-msg">No active tasks.</p>';

    if (comp.length > 0) compEl.innerHTML = comp.map((f) => this.renderFileCard(f)).join('');
    else compEl.innerHTML = '<p class="no-data-msg">No recent completions.</p>';
  }

  renderExplorerList() {
    const body = document.getElementById('explorerBody');
    if (!body) return;
    if (this.state.files.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="no-data">No files found matching your search.</td></tr>';
      return;
    }
    body.innerHTML = this.state.files
      .map((f) => {
        const status = f.status || 'unknown';
        const isFinished = ['completed', 'error', 'skipped'].includes(status);
        const canVerify = status === 'completed' && f.agreement_status !== 'verified';

        return `
      <tr>
        <td>${this.escapeHtml(this.basename(f.file_path))}</td>
        <td><span class="status-badge ${this.escapeHtml(status)}">${this.escapeHtml(status)}</span></td>
        <td>${this.escapeHtml(f.best_engine || '-')}</td>
        <td>${f.best_score ? f.best_score + '%' : '-'}</td>
        <td>
          ${
            isFinished
              ? `<button class="btn-link js-action-details" 
            data-file-path="${this.escapeHtml(f.file_path)}" 
            data-engine="${this.escapeHtml(f.best_engine || '')}">🔍 Details</button>`
              : ''
          }
          ${
            canVerify
              ? `<button class="btn-link js-action-verify" data-file-path="${this.escapeHtml(f.file_path)}">✅ Verify</button>`
              : ''
          }
        </td>
      </tr>
    `;
      })
      .join('');
  }

  renderFileCard(f) {
    const engines = JSON.parse(f.engines || '{}');
    const badge = f.agreement_status
      ? `<span class="agreement-badge status-${this.escapeHtml(f.agreement_status)}">${this.escapeHtml(f.agreement_status.toUpperCase())}</span>`
      : '';
    return `
      <div class="file-card">
        <div class="file-header">
          <div class="file-name">${this.escapeHtml(this.basename(f.file_path))}</div>
          ${badge}
        </div>
        <div class="engine-results-grid">
          ${Object.entries(engines)
            .map(
              ([n, r]) =>
                `<div class="engine-tag ${r.success ? 'success' : 'error'}">${this.escapeHtml(n)}: ${r.score ? r.score + '%' : r.success ? '✓' : '✗'}</div>`,
            )
            .join('')}
        </div>
      </div>
    `;
  }

  renderDashboard(stats, errors) {
    document.getElementById('globalStatsGrid').innerHTML = `
      <div class="summary-card"><label>Total</label><div class="summary-value">${stats.total_files}</div></div>
      <div class="summary-card success"><label>Success</label><div class="summary-value">${stats.success_count}</div></div>
      <div class="summary-card danger"><label>Errors</label><div class="summary-value">${stats.error_count}</div></div>
    `;
    document.getElementById('engineStatsGrid').innerHTML = stats.engines
      .map(
        (e) => `
      <div class="summary-card"><label>${this.escapeHtml(e.engine)}</label><div class="summary-value">${e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%</div></div>
    `,
      )
      .join('');
    document.getElementById('errorSummaryList').innerHTML = errors
      .map(
        (g) => `<div class="error-group-item"><strong>${g.count} files:</strong> ${this.escapeHtml(g.message)}</div>`,
      )
      .join('');
  }

  renderHistory(runs) {
    document.getElementById('historyBody').innerHTML = runs
      .map(
        (r) => `
      <tr>
        <td>${new Date(r.start_time).toLocaleString()}</td>
        <td><span class="status-badge ${this.escapeHtml(r.status)}">${this.escapeHtml(r.status)}</span></td>
        <td>${r.total_files}</td>
        <td>${r.completed}</td>
        <td>${r.failed}</td>
        <td>${r.completed_engines}/${r.total_engines}</td>
        <td>${r.end_time ? Math.round((r.end_time - r.start_time) / 1000) + 's' : '...'}</td>
        <td><button class="btn-link js-action-logs" data-run-id="${this.escapeHtml(r.id)}">📄 Logs</button></td>
      </tr>
    `,
      )
      .join('');
  }

  renderConfigStatus(c) {
    const light = document.getElementById('statusLight');
    light.className = `status-light-sm ${c.isConfigured ? 'active' : 'inactive'}`;
    document.getElementById('statusPaths').textContent = c.isConfigured ? c.paths.join(', ') : 'Default (/scan_dir)';
    document.getElementById('scheduleTime').textContent = c.schedule.description || 'Manual only';

    // System Page detailed config
    const configEl = document.getElementById('systemConfigInfo');
    if (configEl) {
      configEl.innerHTML = `
        <div class="config-line"><strong>Scan Paths:</strong> ${c.paths.join(', ')}</div>
        <div class="config-line"><strong>Exclusions:</strong> ${c.excludePaths.join(', ') || 'None'}</div>
        <div class="config-line"><strong>Schedule:</strong> ${c.schedule.cron} (${c.schedule.description})</div>
      `;
    }
  }

  renderHealthStatus() {
    if (!this.state.health) return;
    document.getElementById('healthWarning').classList.toggle('hidden', this.state.health.allOk);
    document.getElementById('healthList').innerHTML = this.state.health.dependencies
      .map(
        (d) => `
      <div class="health-item ${d.found ? 'ok' : 'error'}">
        <span>${d.name} ${d.version || ''}</span>
        <span>${d.found ? '✅' : '❌'}</span>
      </div>
    `,
      )
      .join('');
  }

  // --- ACTIONS ---

  async startRun(paths = null, force = false) {
    this.state.isRunning = true;
    this.render();
    await fetch('/api/run/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, force }),
    });
  }

  async stopRun() {
    if (confirm('Stop?')) await fetch('/api/run/stop', { method: 'POST' });
  }
  async runDryRun() {
    document.getElementById('dryRun').disabled = true;
    const res = await fetch('/api/run/dry-run', { method: 'POST' });
    this.renderDryRunResults(await res.json());
    document.getElementById('dryRun').disabled = false;
  }

  renderDryRunResults(d) {
    document.getElementById('dryTotal').textContent = d.totalSRTs;
    document.getElementById('dryMatched').textContent = d.matched.length;
    document.getElementById('dryMissing').textContent = d.missingVideo.length;
    document.getElementById('dryEstimate').textContent = Math.round(d.estimatedMs / 60000) + 'm';
    document.getElementById('dryRunModal').classList.remove('hidden');
  }

  async manuallyVerifyFile(filePath) {
    const runId = this.state.currentRun?.id;
    if (!runId) return;
    await fetch('/api/file/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId, filePath }),
    });
    this.reconcileState();
  }

  async viewLogs(id) {
    const res = await fetch(`/api/runs/${id}/logs`);
    const data = await res.json();
    document.getElementById('logsContent').textContent = data.logs || 'No logs';
    document.getElementById('logsModal').classList.remove('hidden');
  }

  async viewDebugInfo(filePath, engine) {
    const f = this.state.files.find((x) => x.file_path === filePath);
    if (!f) return;

    const enginesMap = JSON.parse(f.engines || '{}');
    let targetEngine = engine;

    // Smart selection if no engine specified or found
    if (!targetEngine || !enginesMap[targetEngine]) {
      if (f.best_engine && enginesMap[f.best_engine]) {
        targetEngine = f.best_engine;
      } else {
        const keys = Object.keys(enginesMap);
        if (keys.length > 0) targetEngine = keys[0];
      }
    }

    const e = enginesMap[targetEngine];
    if (!e) {
      alert('No execution details available for this file yet.');
      return;
    }

    const titleEl = document.querySelector('#debugModal .modal-header h3');
    if (titleEl) titleEl.textContent = `Engine Debug Info: ${targetEngine}`;

    document.getElementById('debugCommand').textContent = e.command || '-';
    document.getElementById('debugStderr').textContent = e.stderr || '-';
    document.getElementById('debugStdout').textContent = e.stdout || '-';
    document.getElementById('debugModal').classList.remove('hidden');
  }

  // --- HELPERS ---

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  setupEventHandlers() {
    document.getElementById('themeToggle').onclick = () => this.toggleTheme();
    document.getElementById('startRun').onclick = () => this.startRun();
    document.getElementById('startRunForce').onclick = () => this.startRun(null, true);
    document.getElementById('stopRun').onclick = () => this.stopRun();
    document.getElementById('dryRun').onclick = () => this.runDryRun();
    document.getElementById('clearCompleted').onclick = () => fetch('/api/files/clear', { method: 'POST' });
    document.getElementById('closeDryRunModal').onclick = () =>
      document.getElementById('dryRunModal').classList.add('hidden');
    document.getElementById('closeDryRunButton').onclick = () =>
      document.getElementById('dryRunModal').classList.add('hidden');
    document.getElementById('closeDebugModal').onclick = () =>
      document.getElementById('debugModal').classList.add('hidden');
    document.getElementById('closeDebugButton').onclick = () =>
      document.getElementById('debugModal').classList.add('hidden');
    document.getElementById('closeLogsModal').onclick = () =>
      document.getElementById('logsModal').classList.add('hidden');
    document.getElementById('closeLogsButton').onclick = () =>
      document.getElementById('logsModal').classList.add('hidden');
    document.getElementById('copyLogs').onclick = () =>
      navigator.clipboard.writeText(document.getElementById('logsContent').textContent);

    document.getElementById('fileSearch').oninput = (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.state.searchQuery = e.target.value;
        this.fetchInitialState();
      }, 300);
    };
    document.getElementById('agreementFilter').onchange = (e) => {
      this.state.agreementFilter = e.target.value;
      this.fetchInitialState();
    };

    window.onclick = (e) => this.handleGlobalClick(e);
  }

  handleGlobalClick(e) {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
      return;
    }

    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('js-action-verify')) {
      const path = btn.dataset.filePath;
      if (path) this.manuallyVerifyFile(path);
    }

    if (btn.classList.contains('js-action-details')) {
      const path = btn.dataset.filePath;
      const engine = btn.dataset.engine;
      if (path) this.viewDebugInfo(path, engine);
    }

    if (btn.classList.contains('js-action-logs')) {
      const id = btn.dataset.runId;
      if (id) this.viewLogs(id);
    }
  }

  setupStateReconciliation() {
    setInterval(() => {
      if (this.state.isRunning || document.visibilityState === 'visible') this.reconcileState();
    }, 30000);
  }
  async reconcileState() {
    const s = this.state.searchQuery ? `&search=${encodeURIComponent(this.state.searchQuery)}` : '';
    const f = this.state.agreementFilter ? `&filter=${this.state.agreementFilter}` : '';
    const res = await fetch(`/api/status?page=1&limit=50${s}${f}`);
    const data = await res.json();
    this.state.currentRun = data.currentRun;
    this.state.isRunning = data.isRunning;
    data.files.forEach((x) => this.updateFile(x));
    this.render();
  }

  setupInfiniteScroll() {
    const obs = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && this.state.pagination.page < this.state.pagination.totalPages) this.loadMoreFiles();
    });
    obs.observe(document.getElementById('scrollSentinel'));
  }

  async loadMoreFiles() {
    const p = this.state.pagination.page + 1;
    const res = await fetch(`/api/status?page=${p}&limit=50`);
    const data = await res.json();
    this.state.files = [...this.state.files, ...data.files];
    this.state.pagination = data.pagination;
    this.render();
  }

  updateButtonVisibility() {
    const r = this.state.isRunning;
    document.getElementById('stopRun').classList.toggle('hidden', !r);
    document.getElementById('startRun').classList.toggle('hidden', r);
    document.getElementById('startRunForce').classList.toggle('hidden', r);
    document.getElementById('dryRun').classList.toggle('hidden', r);
  }

  basename(p) {
    return p.split('/').pop();
  }
  attachDynamicFileEvents() {} // Deprecated by handleGlobalClick
}

const client = new SubsyncarrPlusPlusClient();
window.client = client;
