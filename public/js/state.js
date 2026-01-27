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

    update(deltas) {

      // Quality Fix: Intelligent File Merging

      // When we get a list of files from the server (e.g. the "Live" set), 

      // we want to merge them into our local state so we don't lose 

      // track of files the user might be looking at in the Explorer.

      if (deltas.files) {

        const mergedFiles = [...this.state.files];

        deltas.files.forEach(newFile => {

          const idx = mergedFiles.findIndex(f => f.file_path === newFile.file_path);

          if (idx >= 0) {

            mergedFiles[idx] = { ...mergedFiles[idx], ...newFile };

          } else {

            mergedFiles.unshift(newFile);

          }

        });

        deltas.files = mergedFiles;

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
          this.update({ ...msg.data });
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
