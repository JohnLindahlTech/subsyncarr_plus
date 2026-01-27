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
      health: null,
      activeView: 'live',
      activeDebugFile: null,
      activeDebugEngine: null,
      initMessage: '',
    };
    this.updateCallback = updateCallback;
    this.reconnectInterval = 3000;
    this.ws = null;
  }

  update(deltas) {
    this.state = { ...this.state, ...deltas };
    this.updateCallback(this.state);
  }

  updateFile(fileData) {
    const { searchQuery, agreementFilter, files, pagination } = this.state;

    const matchesFilter = !agreementFilter || fileData.agreement_status === agreementFilter;
    const matchesSearch = !searchQuery || fileData.file_path.toLowerCase().includes(searchQuery.toLowerCase());

    const index = files.findIndex((f) => f.file_path === fileData.file_path);

    let newFiles = [...files];

    if (matchesFilter && matchesSearch) {
      if (index >= 0) {
        newFiles[index] = { ...newFiles[index], ...fileData };
      } else if (fileData.status === 'processing' || pagination.page === 1) {
        newFiles.unshift(fileData);
      }
    } else if (index >= 0) {
      newFiles.splice(index, 1);
    }

    this.update({ files: newFiles });
  }

  initWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

    this.ws.onopen = () => this.updateCallback(this.state, 'reconcile');

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'state':
          this.update({ ...msg.data });
          break;
        case 'run:started':
          this.update({ currentRun: msg.data, isRunning: true, files: [] });
          break;
        case 'run:progress':
          this.update({ initMessage: msg.data.message });
          break;
        case 'health:updated':
          this.update({ health: msg.data });
          break;
        case 'file:updated':
          this.updateFile(msg.data.file);
          if (msg.data.run) this.update({ currentRun: msg.data.run });
          break;
      }
    };

    this.ws.onclose = () => setTimeout(() => this.initWebSocket(), this.reconnectInterval);
  }
}
