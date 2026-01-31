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
}
