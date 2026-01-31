import { create } from 'zustand';
import { Run, FileResult, HealthStatus, DryRunResponse } from '@shared/types';

export type ViewType = 'live' | 'explorer' | 'dashboard' | 'history' | 'system' | 'docs';

interface AppState {
  currentRun: Run | null;
  files: FileResult[];
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
  updateState: (deltas: Partial<AppState>, mode?: 'replace' | 'merge') => void;
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
}

export const useAppStore = create<AppState>((set) => ({
  currentRun: null,
  files: [],
  isRunning: false,
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  searchQuery: '',
  agreementFilter: '',
  statusFilter: '',
  sortColumn: 'file_path',
  sortOrder: 'ASC',
  health: null,
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
      let newFiles = deltas.files || state.files;

      if (deltas.files && mode === 'merge') {
        const { searchQuery, agreementFilter, statusFilter, sortColumn, sortOrder, activeView } = state;
        const mergedFiles = [...state.files];

        deltas.files.forEach((newFile) => {
          const matchesAgreement = !agreementFilter || newFile.agreement_status === agreementFilter;
          const matchesStatus = !statusFilter || newFile.status === statusFilter;
          const matchesSearch = !searchQuery || newFile.file_path.toLowerCase().includes(searchQuery.toLowerCase());

          const idx = mergedFiles.findIndex((f) => f.file_path === newFile.file_path);

          if (idx >= 0) {
            // Update existing entry if it's newer or same run
            if (newFile.updated_at >= mergedFiles[idx].updated_at) {
              mergedFiles[idx] = { ...mergedFiles[idx], ...newFile };
            }

            // If it no longer matches filters, remove it
            if (!(matchesAgreement && matchesStatus && matchesSearch)) {
              mergedFiles.splice(idx, 1);
            }
          } else {
            // New entry: add if it matches filters
            if (matchesAgreement && matchesStatus && matchesSearch) {
              mergedFiles.unshift(newFile);
            }
          }
        });

        // Apply sorting based on view
        if (activeView === 'live') {
          // Live view: Processing first (ASC), then Completed/Error/Skipped (DESC updated_at)
          newFiles = mergedFiles.sort((a, b) => {
            const isAProc = a.status === 'processing';
            const isBProc = b.status === 'processing';

            if (isAProc && !isBProc) return -1;
            if (!isAProc && isBProc) return 1;

            if (isAProc && isBProc) {
              return a.file_path.localeCompare(b.file_path, undefined, { numeric: true });
            }

            // Both are finished
            return b.updated_at - a.updated_at;
          });
        } else {
          // Explorer view: use configured sort
          const factor = sortOrder === 'ASC' ? 1 : -1;

          newFiles = mergedFiles.sort((a, b) => {
            const valA = String(a[sortColumn] || '').toLowerCase();
            const valB = String(b[sortColumn] || '').toLowerCase();

            // Handle numeric values
            const numA = Number(a[sortColumn]);
            const numB = Number(b[sortColumn]);
            if (!isNaN(numA) && !isNaN(numB)) {
              return (numA - numB) * factor;
            }

            return valA.localeCompare(valB, undefined, { numeric: true }) * factor;
          });
        }
      }

      return {
        ...state,
        ...deltas,
        files: newFiles,
      };
    });
  },
}));
