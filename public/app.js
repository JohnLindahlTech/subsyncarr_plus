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
    // Initial route
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
    console.log(`Switching to view: ${viewId}`);
    this.state.activeView = viewId;

    // 1. Update Navigation UI
    document.querySelectorAll('.nav-item').forEach((nav) => {
      nav.classList.toggle('active', nav.getAttribute('data-view') === viewId);
    });

    // 2. Toggle Sections
    document.querySelectorAll('.view').forEach((section) => {
      section.classList.toggle('hidden', section.id !== `view-${viewId}`);
    });

    // 3. Update Title
    const titles = {
      live: 'Live Run',
      explorer: 'Library Explorer',
      dashboard: 'Statistics Dashboard',
      history: 'Run History',
      system: 'System Health & Config',
    };
    document.getElementById('viewTitle').textContent = titles[viewId];

    // 4. View-specific data fetching
    if (viewId === 'dashboard') this.fetchDashboardData();
    if (viewId === 'history') this.fetchHistory();
    if (viewId === 'explorer' && this.state.files.length === 0) this.fetchInitialState();
  }

  // --- UI INITIALIZATION ---

  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else if (systemPrefersDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconcileState();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleMessage(msg);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(() => this.initWebSocket(), this.reconnectInterval);
    };
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
        this.state.pagination.page = 1;
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
    const index = this.state.files.findIndex((f) => f.file_path === fileData.file_path);
    if (index >= 0) {
      this.state.files[index] = { ...this.state.files[index], ...fileData };
    } else {
      if (fileData.status === 'processing' || this.state.pagination.page === 1) {
        this.state.files.unshift(fileData);
      }
    }
  }

  // --- DATA FETCHING ---

  async fetchInitialState() {
    const searchParam = this.state.searchQuery ? `&search=${encodeURIComponent(this.state.searchQuery)}` : '';
    const filterParam = this.state.agreementFilter ? `&filter=${this.state.agreementFilter}` : '';
    const response = await fetch(`/api/status?page=1&limit=50${searchParam}${filterParam}`);
    const data = await response.json();
    this.state.currentRun = data.currentRun;
    this.state.files = data.files;
    this.state.pagination = data.pagination;
    this.state.isRunning = data.isRunning;
    this.render();
  }

  async fetchConfigStatus() {
    try {
      const response = await fetch('/api/config');
      const config = await response.json();
      this.renderConfigStatus(config);
    } catch (error) {
      console.error('Failed to fetch config status:', error);
    }
  }

  async fetchDashboardData() {
    try {
      const [statsRes, errorRes] = await Promise.all([fetch('/api/stats/global'), fetch('/api/stats/errors')]);
      const stats = await statsRes.json();
      const errors = await errorRes.json();
      this.renderDashboard(stats, errors);
    } catch (e) {
      console.error('Dashboard load failed', e);
    }
  }

  async fetchHistory() {
    const response = await fetch('/api/history');
    const history = await response.json();
    this.renderHistory(history);
  }

  // --- RENDERERS ---

  render() {
    this.renderProgress();
    this.renderLiveList();
    this.renderExplorerList();
    this.updateButtonVisibility();
  }

  renderProgress() {
    const { currentRun, isRunning } = this.state;
    const section = document.getElementById('currentRun');
    if (!isRunning && (!currentRun || currentRun.status === 'completed')) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');

    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const currentTaskStatus = document.getElementById('currentTaskStatus');

    if (isRunning && !currentRun) {
      progressFill.style.width = '0%';
      currentTaskStatus.textContent = this.state.initMessage || 'Initializing...';
      return;
    }

    if (currentRun) {
      const percent =
        currentRun.total_engines > 0 ? (currentRun.completed_engines / currentRun.total_engines) * 100 : 0;
      progressFill.style.width = `${percent}%`;
      progressText.textContent = `${Math.round(percent)}%`;
      currentTaskStatus.textContent = currentRun.current_video || '';
    }
  }

  renderLiveList() {
    const processing = this.state.files.filter((f) => f.status === 'processing');
    const completed = this.state.files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status)).slice(0, 10);

    document.getElementById('filesInProgress').innerHTML = processing.map((f) => this.renderFileCard(f)).join('');
    document.getElementById('completedList').innerHTML = completed.map((f) => this.renderFileCard(f)).join('');
    this.attachDynamicFileEvents();
  }

  renderExplorerList() {
    const body = document.getElementById('explorerBody');
    if (!body) return;

    body.innerHTML = this.state.files
      .map(
        (f) => `
      <tr>
        <td>${this.basename(f.file_path)}</td>
        <td><span class="status-badge ${f.status}">${f.status}</span></td>
        <td>${f.best_engine || '-'}</td>
        <td>${f.best_score ? f.best_score + '%' : '-'}</td>
        <td>
          <button class="btn-link" onclick="client.viewDebugInfo('${f.file_path.replace(/'/g, "'")}', '${f.best_engine}')">🔍 Details</button>
        </td>
      </tr>
    `,
      )
      .join('');
  }

  renderFileCard(file) {
    const engines = JSON.parse(file.engines || '{}');
    const statusBadge = file.agreement_status
      ? `<span class="agreement-badge status-${file.agreement_status}">${file.agreement_status.toUpperCase()}</span>`
      : '';

    return `
      <div class="file-card ${file.status}" data-file-path="${file.file_path}">
        <div class="file-header">
          <div class="file-name">${this.basename(file.file_path)}</div>
          ${statusBadge}
        </div>
        <div class="engine-status">
          ${file.best_engine ? `<small>Best: 🏆 ${file.best_engine}</small>` : ''}
        </div>
        <div class="engine-results-grid">
          ${Object.entries(engines)
            .map(
              ([name, res]) => `
            <div class="engine-tag ${res.success ? 'success' : 'error'}">
              ${name}: ${res.score ? res.score + '%' : res.success ? '✓' : '✗'}
            </div>
          `,
            )
            .join('')}
        </div>
      </div>
    `;
  }

  renderDashboard(stats, errors) {
    const globalHtml = `
      <div class="summary-card"><label>Total</label><div class="summary-value">${stats.total_files}</div></div>
      <div class="summary-card success"><label>Success</label><div class="summary-value">${stats.success_count}</div></div>
      <div class="summary-card danger"><label>Errors</label><div class="summary-value">${stats.error_count}</div></div>
    `;
    document.getElementById('globalStatsGrid').innerHTML = globalHtml;

    document.getElementById('engineStatsGrid').innerHTML = stats.engines
      .map(
        (e) => `
      <div class="summary-card">
        <label>${e.engine}</label>
        <div class="summary-value">${e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%</div>
      </div>
    `,
      )
      .join('');

    document.getElementById('errorSummaryList').innerHTML = errors
      .map(
        (g) => `
      <div class="error-group-item">
        <strong>${g.count} files:</strong> ${g.message}
      </div>
    `,
      )
      .join('');
  }

  renderHistory(runs) {
    document.getElementById('historyBody').innerHTML = runs
      .map(
        (r) => `
      <tr>
        <td>${new Date(r.start_time).toLocaleDateString()}</td>
        <td>${r.status}</td>
        <td>${r.total_files}</td>
        <td>${r.completed}</td>
        <td>${r.failed}</td>
        <td>${r.completed_engines}</td>
        <td>-</td><td>-</td>
        <td>${r.end_time ? Math.round((r.end_time - r.start_time) / 1000) + 's' : '...'}</td>
        <td><button class="btn-link" onclick="client.viewLogs('${r.id}')">📄 Logs</button></td>
      </tr>
    `,
      )
      .join('');
  }

  renderConfigStatus(config) {
    const light = document.getElementById('statusLight');
    light.className = `status-light ${config.isConfigured ? 'active' : 'inactive'}`;
    document.getElementById('statusLabel').textContent = config.isConfigured ? 'Folders Active' : 'Default Mode';
    document.getElementById('statusPaths').textContent = config.paths.join(', ');
    document.getElementById('scheduleTime').textContent = config.schedule.description || 'Manual only';
  }

  renderHealthStatus() {
    if (!this.state.health) return;
    document.getElementById('healthWarning').classList.toggle('hidden', this.state.health.allOk);
    document.getElementById('healthList').innerHTML = this.state.health.dependencies
      .map(
        (d) => `
      <div class="health-item ${d.found ? 'ok' : 'error'}">
        <span>${d.name}</span>
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
    if (confirm('Stop processing?')) await fetch('/api/run/stop', { method: 'POST' });
  }

  async runDryRun() {
    const btn = document.getElementById('dryRun');
    btn.disabled = true;
    const res = await fetch('/api/run/dry-run', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    this.renderDryRunResults(data);
  }

  renderDryRunResults(data) {
    document.getElementById('dryTotal').textContent = data.totalSRTs;
    document.getElementById('dryMatched').textContent = data.matched.length;
    document.getElementById('dryMissing').textContent = data.missingVideo.length;
    document.getElementById('dryEstimate').textContent = Math.round(data.estimatedMs / 60000) + 'm';
    document.getElementById('dryRunModal').classList.remove('hidden');
  }

  // --- HELPERS ---

  setupEventHandlers() {
    document.getElementById('themeToggle').onclick = () => this.toggleTheme();
    document.getElementById('startRun').onclick = () => this.startRun();
    document.getElementById('startRunForce').onclick = () => this.startRun(null, true);
    document.getElementById('stopRun').onclick = () => this.stopRun();
    document.getElementById('dryRun').onclick = () => this.runDryRun();
    document.getElementById('clearCompleted').onclick = () => fetch('/api/files/clear', { method: 'POST' });

    // Modals
    document.getElementById('closeDryRunModal').onclick = () =>
      document.getElementById('dryRunModal').classList.add('hidden');
    document.getElementById('closeDryRunButton').onclick = () =>
      document.getElementById('dryRunModal').classList.add('hidden');

    window.onclick = (e) => {
      if (e.target.classList.contains('modal')) e.target.classList.add('hidden');
    };
  }

  setupStateReconciliation() {
    setInterval(() => {
      if (this.state.isRunning || document.visibilityState === 'visible') this.reconcileState();
    }, 30000);
  }

  async reconcileState() {
    const searchParam = this.state.searchQuery ? `&search=${encodeURIComponent(this.state.searchQuery)}` : '';
    const filterParam = this.state.agreementFilter ? `&filter=${this.state.agreementFilter}` : '';
    const response = await fetch(`/api/status?page=1&limit=50${searchParam}${filterParam}`);
    const data = await response.json();
    this.state.currentRun = data.currentRun;
    this.state.isRunning = data.isRunning;
    data.files.forEach((f) => this.updateFile(f));
    this.render();
  }

  setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && this.state.pagination.page < this.state.pagination.totalPages) {
        this.loadMoreFiles();
      }
    });
    observer.observe(document.getElementById('scrollSentinel'));
  }

  async loadMoreFiles() {
    const nextPage = this.state.pagination.page + 1;
    const res = await fetch(`/api/status?page=${nextPage}&limit=50`);
    const data = await res.json();
    this.state.files = [...this.state.files, ...data.files];
    this.state.pagination = data.pagination;
    this.render();
  }

  updateButtonVisibility() {
    const isRunning = this.state.isRunning;
    document.getElementById('stopRun').classList.toggle('hidden', !isRunning);
    document.getElementById('startRun').classList.toggle('hidden', isRunning);
    document.getElementById('startRunForce').classList.toggle('hidden', isRunning);
    document.getElementById('dryRun').classList.toggle('hidden', isRunning);
  }

  basename(p) {
    return p.split('/').pop();
  }

  attachDynamicFileEvents() {
    // Logic for skip/debug/verify using event delegation if needed,
    // or keep simple for now as we transition.
  }
}

const client = new SubsyncarrPlusPlusClient();
window.client = client;
