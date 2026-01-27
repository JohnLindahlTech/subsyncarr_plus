/**
 * ui.js - All DOM manipulation and rendering
 */
export class UIManager {
  constructor(callbacks) {
    this.callbacks = callbacks;
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  basename(p) {
    return p.split('/').pop();
  }

  render(state) {
    this.renderNavigation(state.activeView);
    this.renderProgress(state);
    this.renderHeader();

    if (state.activeView === 'live') this.renderLiveList(state);
    if (state.activeView === 'explorer') this.renderExplorerList(state);

    this.updateButtonVisibility(state.isRunning);
    if (state.health) this.renderHealthStatus(state.health);
  }

  renderNavigation(activeView) {
    document.querySelectorAll('.nav-item').forEach((nav) => {
      nav.classList.toggle('active', nav.getAttribute('data-view') === activeView);
    });
    document.querySelectorAll('.view').forEach((section) => {
      section.classList.toggle('hidden', section.id !== `view-${activeView}`);
    });
    const titles = {
      live: 'Live Run',
      explorer: 'Library Explorer',
      dashboard: 'Statistics Dashboard',
      history: 'Run History',
      system: 'System Health & Config',
    };
    const titleEl = document.getElementById('viewTitle');
    if (titleEl) titleEl.textContent = titles[activeView];
  }

  renderHeader() {
    // Header info items like statusPaths, scheduleTime are handled by fetchConfig callbacks
  }

  renderProgress(state) {
    const { currentRun, isRunning, initMessage } = state;
    const el = document.getElementById('currentRun');
    if (!el) return;

    if (!isRunning && (!currentRun || currentRun.status === 'completed')) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');

    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const status = document.getElementById('currentTaskStatus');

    if (isRunning && !currentRun) {
      if (fill) fill.style.width = '0%';
      if (text) text.textContent = '0%';
      if (status) status.textContent = initMessage || 'Scanning...';
      return;
    }
    if (currentRun) {
      const p = currentRun.total_engines > 0 ? (currentRun.completed_engines / currentRun.total_engines) * 100 : 0;
      if (fill) fill.style.width = `${p}%`;
      if (text) text.textContent = `${Math.round(p)}%`;
      if (status) status.textContent = currentRun.current_video || '';
    }
  }

  renderLiveList(state) {
    const proc = state.files.filter((f) => f.status === 'processing');
    const comp = state.files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status)).slice(0, 10);

    const procEl = document.getElementById('filesInProgress');
    const compEl = document.getElementById('completedList');

    if (procEl) {
      procEl.innerHTML =
        proc.length > 0
          ? proc.map((f) => this.renderFileCard(f)).join('')
          : '<p class="no-data-msg">No active tasks.</p>';
    }
    if (compEl) {
      compEl.innerHTML =
        comp.length > 0
          ? comp.map((f) => this.renderFileCard(f)).join('')
          : '<p class="no-data-msg">No recent completions.</p>';
    }
  }

  renderExplorerList(state) {
    const body = document.getElementById('explorerBody');
    if (!body) return;
    if (state.files.length === 0) {
      body.innerHTML = '<tr><td colspan="5" class="no-data">No files found matching your search.</td></tr>';
      return;
    }
    body.innerHTML = state.files
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
          ${isFinished ? `<button class="btn-link js-action-details" data-file-path="${this.escapeHtml(f.file_path)}">🔍 Details</button>` : ''}
          ${canVerify ? `<button class="btn-link js-action-verify" data-file-path="${this.escapeHtml(f.file_path)}">✅ Verify</button>` : ''}
        </td>
      </tr>`;
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
      </div>`;
  }

  renderDashboard(stats, errors) {
    const grid = document.getElementById('globalStatsGrid');
    const engineGrid = document.getElementById('engineStatsGrid');
    const errorList = document.getElementById('errorSummaryList');

    if (grid) {
      grid.innerHTML = `
        <div class="summary-card"><label>Total</label><div class="summary-value">${stats.total_files}</div></div>
        <div class="summary-card success"><label>Success</label><div class="summary-value">${stats.success_count}</div></div>
        <div class="summary-card danger"><label>Errors</label><div class="summary-value">${stats.error_count}</div></div>`;
    }
    if (engineGrid) {
      engineGrid.innerHTML = stats.engines
        .map(
          (e) =>
            `<div class="summary-card"><label>${this.escapeHtml(e.engine)}</label><div class="summary-value">${e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%</div></div>`,
        )
        .join('');
    }
    if (errorList) {
      errorList.innerHTML = errors
        .map(
          (g) => `<div class="error-group-item"><strong>${g.count} files:</strong> ${this.escapeHtml(g.message)}</div>`,
        )
        .join('');
    }
  }

  renderHistory(runs) {
    const body = document.getElementById('historyBody');
    if (!body) return;
    body.innerHTML = runs
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
      </tr>`,
      )
      .join('');
  }

  renderConfigStatus(c) {
    const light = document.getElementById('statusLight');
    const paths = document.getElementById('statusPaths');
    const sched = document.getElementById('scheduleTime');
    const configEl = document.getElementById('systemConfigInfo');

    if (light) light.className = `status-light-sm ${c.isConfigured ? 'active' : 'inactive'}`;
    if (paths) paths.textContent = c.isConfigured ? c.paths.join(', ') : 'Default (/scan_dir)';
    if (sched) sched.textContent = c.schedule.description || 'Manual only';

    if (configEl) {
      configEl.innerHTML = `
        <div class="config-line"><strong>Scan Paths:</strong> ${c.paths.join(', ')}</div>
        <div class="config-line"><strong>Exclusions:</strong> ${c.excludePaths.join(', ') || 'None'}</div>
        <div class="config-line"><strong>Schedule:</strong> ${c.schedule.cron} (${c.schedule.description})</div>`;
    }
  }

  renderHealthStatus(health) {
    const warn = document.getElementById('healthWarning');
    const list = document.getElementById('healthList');
    if (warn) warn.classList.toggle('hidden', health.allOk);
    if (list) {
      list.innerHTML = health.dependencies
        .map(
          (d) => `
        <div class="health-item ${d.found ? 'ok' : 'error'}">
          <span>${this.escapeHtml(d.name)} ${this.escapeHtml(d.version || '')}</span>
          <span>${d.found ? '✅' : '❌'}</span>
        </div>`,
        )
        .join('');
    }
  }

  renderDebugOverlay(state) {
    const f = state.activeDebugFile;
    const activeEngine = state.activeDebugEngine;
    if (!f || !activeEngine) return;

    const enginesMap = JSON.parse(f.engines || '{}');
    document.getElementById('overlayTitle').textContent = `Processing: ${this.basename(f.file_path)}`;

    const tabsContainer = document.getElementById('engineTabs');
    tabsContainer.innerHTML = Object.keys(enginesMap)
      .map(
        (name) => `<button class="tab-item ${name === activeEngine ? 'active' : ''}" 
        onclick="client.switchDebugTab('${name}')">${this.escapeHtml(name)}</button>`,
      )
      .join('');

    const body = document.getElementById('overlayBody');
    const e = enginesMap[activeEngine];
    if (!e) {
      body.innerHTML = '<p class="no-data-msg">Engine data not found.</p>';
      return;
    }

    const statusClass = e.success ? 'success' : 'error';
    const statusText = e.success ? '✓ Successfully Synced' : '✗ Sync Failed';
    const scoreInfo = e.score !== undefined ? `Confidence: ${e.score}%` : '';

    body.innerHTML = `
      <div class="engine-detail-pane">
        <div class="pane-header">
          <div class="status-indicator-large ${statusClass}">
            <span>${statusText}</span>
            <span>${scoreInfo}</span>
          </div>
          <div class="top-info-text">Duration: ${(e.duration / 1000).toFixed(1)}s</div>
        </div>
        <div class="debug-section">
          <label>Executed Command</label>
          <pre class="code-block">${this.escapeHtml(e.command || '-')}</pre>
        </div>
        ${e.stderr ? `<div class="debug-section"><label>Error Output (stderr)</label><pre class="code-block error-text">${this.escapeHtml(e.stderr)}</pre></div>` : ''}
        <div class="debug-section"><label>Standard Output (stdout)</label><pre class="code-block">${this.escapeHtml(e.stdout || '-')}</pre></div>
      </div>`;
  }

  updateButtonVisibility(isRunning) {
    const stop = document.getElementById('stopRun');
    const start = document.getElementById('startRun');
    const force = document.getElementById('startRunForce');
    const dry = document.getElementById('dryRun');

    if (stop) stop.classList.toggle('hidden', !isRunning);
    if (start) start.classList.toggle('hidden', isRunning);
    if (force) force.classList.toggle('hidden', isRunning);
    if (dry) dry.classList.toggle('hidden', isRunning);
  }
}
