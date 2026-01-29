/**
 * state.js - Central application state and WebSocket handling
 */
export class StateManager {
  constructor(updateCallback) {
    this.state = {
      currentRun: null,
      files: [],
      isRunning: false,
      pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      searchQuery: '',
      agreementFilter: '',
      statusFilter: '',
      health: null,
      activeView: 'live',
      activeDebugFile: null,
      activeDebugEngine: null,
      initMessage: '',
      isDryRunning: false,
      activeExtractions: [],
    };
    this.updateCallback = updateCallback;
    this.reconnectInterval = 3000;
    this.ws = null;
  }

  update(deltas, mode = 'replace') {
    if (deltas.files) {
      if (mode === 'merge') {
        const { searchQuery, agreementFilter, statusFilter, files } = this.state;
        const mergedFiles = [...files];

        deltas.files.forEach((newFile) => {
          const matchesAgreement = !agreementFilter || newFile.agreement_status === agreementFilter;
          const matchesStatus = !statusFilter || newFile.status === statusFilter;
          const matchesSearch = !searchQuery || newFile.file_path.toLowerCase().includes(searchQuery.toLowerCase());

          const idx = mergedFiles.findIndex((f) => f.file_path === newFile.file_path);

          if (idx >= 0) {
            // Update existing entry
            mergedFiles[idx] = { ...mergedFiles[idx], ...newFile };

            // If it no longer matches filters (and we aren't in Live view), remove it
            if (this.state.activeView !== 'live' && !(matchesAgreement && matchesStatus && matchesSearch)) {
              mergedFiles.splice(idx, 1);
            }
          } else {
            // New entry: only add if it matches filters or we are in Live view
            if (this.state.activeView === 'live' || (matchesAgreement && matchesStatus && matchesSearch)) {
              mergedFiles.unshift(newFile);
            }
          }
        });

        // Always keep sorted by update time for consistency
        deltas.files = mergedFiles.sort((a, b) => b.updated_at - a.updated_at);
      }
      // In 'replace' mode, deltas.files simply overwrites this.state.files
    }

    this.state = { ...this.state, ...deltas };
    this.updateCallback(this.state);
  }

  initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => this.updateCallback(this.state, 'reconcile');

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'state':
          // WebSocket updates use 'merge' mode to avoid trashing current view
          this.update({ ...msg.data }, 'merge');
          break;
        case 'maintenance:started':
          this.update({ isMaintenance: true });
          break;
        case 'maintenance:finished':
          this.update({ isMaintenance: false });
          break;
        case 'run:started':
          this.update({ currentRun: msg.data, isRunning: true, files: [] });
          break;
        case 'run:progress':
          this.update({ initMessage: msg.data.message });
          break;
        case 'extraction:started':
          this.update({ activeExtractions: [...this.state.activeExtractions, msg.data] });
          break;
        case 'extraction:stopped':
          this.update({ activeExtractions: this.state.activeExtractions.filter((p) => p !== msg.data) });
          break;
        case 'run:updated':
        case 'run:completed':
        case 'run:cancelled':
          this.update({ currentRun: msg.data });
          break;
        case 'health:updated':
          this.update({ health: msg.data });
          break;
      }
    };

    this.ws.onclose = () => setTimeout(() => this.initWebSocket(), this.reconnectInterval);
  }
}
