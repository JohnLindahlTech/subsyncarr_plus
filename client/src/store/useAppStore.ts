import { create } from 'zustand';
import { Run, FileResult, HealthStatus, DryRunResponse, ConfigResponse } from '@shared/types';

export type ViewType = 'live' | 'explorer' | 'statistics' | 'history' | 'system' | 'docs';

interface AppState {
  currentRun: Run | null;
  liveFiles: FileResult[];
  explorerFiles: FileResult[];
  isRunning: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  searchQuery: string;
  agreementFilter: string;
  statusFilter: string;
  sortColumn: keyof FileResult;
  sortOrder: 'ASC' | 'DESC';
  health: HealthStatus | null;
  config: ConfigResponse | null;
  activeView: ViewType;
  activeDebugFile: FileResult | null;
  activeDebugEngine: string | null;
  initMessage: string;
  isDryRunning: boolean;
  dryRunData: DryRunResponse | null;
  activeExtractions: string[];
  isMaintenance: boolean;
  theme: 'light' | 'dark';

  // Modal Visibility
  isDetailsOpen: boolean;
  isLogsOpen: boolean;
  isDryRunOpen: boolean;
  isPartialRunOpen: boolean;
  activeLogs: string;
  activeLogsTitle: string;

  // Actions
  updateState: (deltas: Partial<AppState> & { files?: FileResult[] }, mode?: 'replace' | 'merge') => void;
  setSearchQuery: (query: string) => void;
  setFilters: (
    filters: Partial<Pick<AppState, 'agreementFilter' | 'statusFilter' | 'sortColumn' | 'sortOrder'>>,
  ) => void;
  setActiveView: (view: ViewType) => void;
  toggleTheme: () => void;
  initTheme: () => void;
  openDetails: (file: FileResult) => void;
  closeDetails: () => void;
  openLogs: (title: string, logs: string) => void;
  closeLogs: () => void;
  openDryRun: (data: DryRunResponse) => void;
  closeDryRun: () => void;
  openPartialRun: () => void;
  closePartialRun: () => void;
  setMaintenance: (isMaintenance: boolean) => void;
  setConfig: (config: ConfigResponse) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentRun: null,
  liveFiles: [],
  explorerFiles: [],
  isRunning: false,
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  searchQuery: '',
  agreementFilter: '',
  statusFilter: '',
  sortColumn: 'file_path',
  sortOrder: 'ASC',
  health: null,
  config: null,
  activeView: 'live',
  activeDebugFile: null,
  activeDebugEngine: null,
  initMessage: '',
  isDryRunning: false,
  dryRunData: null,
  activeExtractions: [],
  isMaintenance: false,
  theme: 'light',

  isDetailsOpen: false,
  isLogsOpen: false,
  isDryRunOpen: false,
  isPartialRunOpen: false,
  activeLogs: '',
  activeLogsTitle: '',

  setSearchQuery: (query) => set({ searchQuery: query }),

  setFilters: (filters) => set(filters),

  setActiveView: (view) => set({ activeView: view }),

  setMaintenance: (isMaintenance) => set({ isMaintenance }),

  setConfig: (config) => set({ config }),

  initTheme: () => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const theme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    });
  },

  openDetails: (file) => {
    const engines = JSON.parse(file.engines || '{}');
    const firstEngine = Object.keys(engines)[0] || null;
    set({
      activeDebugFile: file,
      activeDebugEngine: firstEngine,
      isDetailsOpen: true,
    });
  },
  closeDetails: () => set({ isDetailsOpen: false }),

  openLogs: (title, logs) =>
    set({
      activeLogsTitle: title,
      activeLogs: logs,
      isLogsOpen: true,
    }),
  closeLogs: () => set({ isLogsOpen: false }),

  openDryRun: (data) => set({ dryRunData: data, isDryRunOpen: true }),
  closeDryRun: () => set({ isDryRunOpen: false }),

  openPartialRun: () => set({ isPartialRunOpen: true }),
  closePartialRun: () => set({ isPartialRunOpen: false }),

  updateState: (deltas, mode = 'replace') => {
    set((state) => {
      // 1. Identify which collections are being updated
      // WebSocket 'state' full update provides files for BOTH Live and Explorer
      // but they are conceptually different slices of data.
      let newLiveFiles = state.liveFiles;
      let newExplorerFiles = state.explorerFiles;

      // Handle raw files array in deltas (legacy from server response)
      const incomingFiles = deltas.files;

      if (incomingFiles) {
        if (mode === 'replace') {
          // 'replace' usually comes from an API fetch for a specific view
          if (state.activeView === 'live') {
            newLiveFiles = incomingFiles;
          } else {
            newExplorerFiles = incomingFiles;
          }
        } else if (mode === 'merge') {
          // 'merge' usually comes from WebSockets
          const { searchQuery, agreementFilter, statusFilter, sortColumn, sortOrder } = state;

          // Helper to patch an array with incoming updates
          const patchArray = (current: FileResult[], updates: FileResult[], applyFilters: boolean) => {
            const merged = [...current];
            updates.forEach((newFile) => {
              const idx = merged.findIndex((f) => f.file_path === newFile.file_path);

              if (idx >= 0) {
                // Update existing
                if (newFile.updated_at >= merged[idx].updated_at) {
                  merged[idx] = { ...merged[idx], ...newFile };
                }

                // Optional: remove if it no longer matches local filters
                if (applyFilters) {
                  const matches =
                    (!agreementFilter || newFile.agreement_status === agreementFilter) &&
                    (!statusFilter || newFile.status === statusFilter) &&
                    (!searchQuery || newFile.file_path.toLowerCase().includes(searchQuery.toLowerCase()));
                  if (!matches) merged.splice(idx, 1);
                }
              } else if (applyFilters) {
                // New entry: add if it matches filters
                const matches =
                  (!agreementFilter || newFile.agreement_status === agreementFilter) &&
                  (!statusFilter || newFile.status === statusFilter) &&
                  (!searchQuery || newFile.file_path.toLowerCase().includes(searchQuery.toLowerCase()));
                if (matches) merged.unshift(newFile);
              }
            });
            return merged;
          };

          // Update both collections from the single stream of incoming file status updates
          newLiveFiles = patchArray(state.liveFiles, incomingFiles, false); // Live view typically doesn't filter out active files
          newExplorerFiles = patchArray(state.explorerFiles, incomingFiles, true);

          // Apply sorting to both
          const factor = sortOrder === 'ASC' ? 1 : -1;
          const sortFn = (a: FileResult, b: FileResult) => {
            const valA = a[sortColumn];
            const valB = b[sortColumn];

            // Primary: Numeric comparison
            if (typeof valA === 'number' && typeof valB === 'number') {
              return (valA - valB) * factor;
            }

            // Secondary: String comparison with numeric awareness
            const strA = String(valA || '').toLowerCase();
            const strB = String(valB || '').toLowerCase();
            return strA.localeCompare(strB, undefined, { numeric: true }) * factor;
          };

          newLiveFiles.sort((a, b) => {
            if (a.status === 'processing' && b.status !== 'processing') return -1;
            if (a.status !== 'processing' && b.status === 'processing') return 1;
            return b.updated_at - a.updated_at;
          });

          newExplorerFiles.sort(sortFn);
        }
      }

      // Cleanup: delete the temporary 'files' property from the final state object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { files: _, ...cleanDeltas } = deltas;

      return {
        ...state,
        ...cleanDeltas,
        liveFiles: newLiveFiles,
        explorerFiles: newExplorerFiles,
      };
    });
  },
}));
