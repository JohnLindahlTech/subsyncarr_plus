export enum RunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum FileStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  ERROR = 'error',
}

export enum AgreementStatus {
  VERIFIED = 'verified',
  SUSPICIOUS = 'suspicious',
  LOW_CONFIDENCE = 'low_confidence',
}

export enum EngineName {
  FFSUBSYNC = 'ffsubsync',
  AUTOSUBSYNC = 'autosubsync',
  ALASS = 'alass',
}

export interface EngineResult {
  success: boolean;
  score?: number;
  message?: string;
  duration?: number;
  stdout?: string;
  stderr?: string;
  skipped?: boolean;
  isPermanent?: boolean;
  command?: string;
}

export interface Run {
  id: string;
  start_time: number;
  end_time: number | null;
  total_files: number;
  completed: number;
  skipped: number;
  failed: number;
  total_engines: number;
  completed_engines: number;
  total_videos: number;
  completed_videos: number;
  status: RunStatus;
  logs: string;
  current_video: string | null;
}

export interface FileResult {
  id: number;
  run_id: string;
  file_path: string;
  video_path: string | null;
  status: FileStatus;
  current_engine: string | null;
  video_status: string | null;
  engines: string; // JSON stringified { ffsubsync?: {...}, autosubsync?: {...}, alass?: {...} }
  best_engine: string | null;
  best_score: number | null;
  agreement_status: AgreementStatus | null;
  created_at: number;
  updated_at: number;
}

export interface HealthStatus {
  timestamp: number;
  dependencies: Array<{
    name: string;
    found: boolean;
    version?: string;
    error?: string;
  }>;
  allOk: boolean;
}

export interface StatusResponse {
  currentRun: Run | null;
  files: FileResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  isRunning: boolean;
  activeExtractions: string[];
}

export interface ConfigResponse {
  paths: string[];
  excludePaths: string[];
  isConfigured: boolean;
  schedule: {
    enabled: boolean;
    cron: string;
    description: string;
    nextRun: number | null;
  };
}

export interface DashboardResponse {
  stats: {
    total_files: number;
    success_count: number;
    error_count: number;
    skipped_count: number;
    engines: Array<{
      engine: string;
      total: number;
      success: number;
    }>;
  };
  errors: Array<{
    message: string;
    count: number;
    examples: string[];
  }>;
}

export interface LogsResponse {
  logs: string;
}

export interface DryRunResponse {
  totalSRTs: number;
  alreadyDone: number;
  matched: Array<{ srt: string; video: string; reason: string }>;
  missingVideo: Array<{ srt: string; reason: string; details?: string }>;
  permanentFailures: number;
  estimatedMs: number;
}
