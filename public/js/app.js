import { API } from './api.js';
import { StateManager } from './state.js';
import { UIManager } from './ui.js';

class SubsyncarrPlusPlusClient {
  constructor() {
    this.ui = new UIManager();
    this.stateManager = new StateManager(this.onStateUpdate.bind(this));
    this.searchTimeout = null;

    this.init();
  }

  async init() {
    this.initTheme();
    this.stateManager.initWebSocket();
    this.setupRouter();
    this.setupEventHandlers();
    this.setupInfiniteScroll();

    // Initial data load
    await this.fetchInitialState();
    this.fetchConfigStatus();
    this.setupStateReconciliation();
  }

  onStateUpdate(state, action) {
    if (action === 'reconcile') {
      this.reconcileState();
    } else {
      this.ui.render(state);
    }
  }

  // --- ROUTING ---

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
    this.stateManager.update({ activeView: viewId });
    if (viewId === 'dashboard') this.fetchDashboardData();
    if (viewId === 'history') this.fetchHistory();
  }

  // --- THEME ---

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

  // --- ACTIONS ---

  async fetchInitialState() {
    const s = this.stateManager.state;
    const data = await API.fetchStatus(1, 50, s.searchQuery, s.agreementFilter, s.statusFilter);
    this.stateManager.update({ ...data });
  }

  async fetchConfigStatus() {
    try {
      const config = await API.fetchConfig();
      this.ui.renderConfigStatus(config);
    } catch (e) {
      console.error('Config fetch failed', e);
    }
  }

  async fetchDashboardData() {
    try {
      const { stats, errors } = await API.fetchDashboard();
      this.ui.renderDashboard(stats, errors);
    } catch (err) {
      console.error('Dashboard failed', err);
    }
  }

  async fetchHistory() {
    const history = await API.fetchHistory();
    this.ui.renderHistory(history);
  }

  async startRun(paths = null, force = false) {
    this.stateManager.update({ isRunning: true });
    await API.startRun(paths, force);
  }

  async stopRun() {
    if (confirm('Stop all processing?')) await API.stopRun();
  }

  async runDryRun() {
    const btn = document.getElementById('dryRun');
    if (btn) btn.disabled = true;
    const data = await API.dryRun();
    this.renderDryRunResults(data);
    if (btn) btn.disabled = false;
  }

  renderDryRunResults(d) {
    document.getElementById('dryTotal').textContent = d.totalSRTs;
    document.getElementById('dryMatched').textContent = d.matched.length;
    document.getElementById('dryMissing').textContent = d.missingVideo.length;
    document.getElementById('dryEstimate').textContent = Math.round(d.estimatedMs / 60000) + 'm';
    document.getElementById('dryRunModal').classList.remove('hidden');
  }

  async manuallyVerifyFile(filePath) {
    const runId = this.stateManager.state.currentRun?.id;
    if (!runId) return;
    await API.verifyFile(runId, filePath);
    this.reconcileState();
  }

  async viewLogs(id) {
    const data = await API.fetchLogs(id);
    document.getElementById('logsOverlayContent').textContent = data.logs || 'No logs found.';
    document.getElementById('logsOverlayTitle').textContent = `Run Logs: ${id}`;
    document.getElementById('logsOverlay').classList.remove('hidden');
  }

  async viewDebugInfo(filePath) {
    const f = this.stateManager.state.files.find((x) => x.file_path === filePath);
    if (!f) return;

    const enginesMap = JSON.parse(f.engines || '{}');
    const engineEntries = Object.entries(enginesMap);
    if (engineEntries.length === 0) {
      alert('No execution details available.');
      return;
    }

    this.stateManager.update({ activeDebugFile: f, activeDebugEngine: engineEntries[0][0] });
    this.ui.renderDebugOverlay(this.stateManager.state);
    document.getElementById('detailsOverlay').classList.remove('hidden');
  }

  switchDebugTab(engineName) {
    this.stateManager.update({ activeDebugEngine: engineName });
    this.ui.renderDebugOverlay(this.stateManager.state);
  }

  // --- EVENTS ---

  setupEventHandlers() {
    const get = (id) => document.getElementById(id);

    get('themeToggle').onclick = () => this.toggleTheme();
    get('startRun').onclick = () => this.startRun();
    get('startRunForce').onclick = () => this.startRun(null, true);
    get('stopRun').onclick = () => this.stopRun();
    get('dryRun').onclick = () => this.runDryRun();
    get('clearCompleted').onclick = () => API.clearCompleted();

    get('closeOverlay').onclick = () => get('detailsOverlay').classList.add('hidden');
    get('closeLogsOverlay').onclick = () => get('logsOverlay').classList.add('hidden');
    get('copyLogsOverlay').onclick = () => navigator.clipboard.writeText(get('logsOverlayContent').textContent);

    get('closeDryRunModal').onclick = () => get('dryRunModal').classList.add('hidden');
    get('closeDryRunButton').onclick = () => get('dryRunModal').classList.add('hidden');

    get('fileSearch').oninput = (e) => {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.stateManager.update({ searchQuery: e.target.value });
        this.fetchInitialState();
      }, 300);
    };

    get('agreementFilter').onchange = (e) => {
      this.stateManager.update({ agreementFilter: e.target.value });
      this.fetchInitialState();
    };

    get('statusFilter').onchange = (e) => {
      this.stateManager.update({ statusFilter: e.target.value });
      this.fetchInitialState();
    };

    window.onclick = (e) => this.handleGlobalClick(e);
  }

  handleGlobalClick(e) {
    if (e.target.classList.contains('modal') || e.target.classList.contains('details-overlay')) {
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
      if (path) this.viewDebugInfo(path);
    }

    if (btn.classList.contains('js-action-logs')) {
      const id = btn.dataset.runId;
      if (id) this.viewLogs(id);
    }
  }

  setupStateReconciliation() {
    setInterval(() => {
      if (this.stateManager.state.isRunning || document.visibilityState === 'visible') this.reconcileState();
    }, 30000);
  }

  async reconcileState() {
    const s = this.stateManager.state;
    const data = await API.fetchStatus(1, 50, s.searchQuery, s.agreementFilter, s.statusFilter);
    this.stateManager.update({ currentRun: data.currentRun, isRunning: data.isRunning });
    data.files.forEach((x) => this.stateManager.updateFile(x));
  }

  setupInfiniteScroll() {
    const obs = new IntersectionObserver((e) => {
      if (
        e[0].isIntersecting &&
        this.stateManager.state.pagination.page < this.stateManager.state.pagination.totalPages
      ) {
        this.loadMoreFiles();
      }
    });
    const sentinel = document.getElementById('scrollSentinel');
    if (sentinel) obs.observe(sentinel);
  }

  async loadMoreFiles() {
    const s = this.stateManager.state;
    const next = s.pagination.page + 1;
    const data = await API.fetchStatus(next, 50, s.searchQuery, s.agreementFilter, s.statusFilter);
    this.stateManager.update({
      files: [...s.files, ...data.files],
      pagination: data.pagination,
    });
  }
}

// Global initialization
window.client = new SubsyncarrPlusPlusClient();
