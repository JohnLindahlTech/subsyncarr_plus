import { ScanConfig, RetentionConfig } from '../config.js';

export class AppConfig {
  private static instance: AppConfig;

  private constructor() {}

  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  public get(key: string, defaultValue?: string): string {
    return process.env[key] || defaultValue || '';
  }

  public getNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  public getBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() !== 'false';
  }

  public getArray(key: string, defaultValue: string[] = []): string[] {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.split(',').filter(Boolean);
  }

  // Specialized config getters
  public get includeEngines(): string[] {
    return this.getArray('INCLUDE_ENGINES', ['ffsubsync', 'autosubsync', 'alass']);
  }

  public get maxConcurrentSyncTasks(): number {
    return this.getNumber('MAX_CONCURRENT_SYNC_TASKS', 1);
  }

  public get cronSchedule(): string {
    return this.get('CRON_SCHEDULE', '0 0 * * *');
  }

  public get syncEngineTimeoutMs(): number {
    return this.getNumber('SYNC_ENGINE_TIMEOUT_MS', 1800000); // 30 minutes
  }

  public get logBufferSize(): number {
    return this.getNumber('LOG_BUFFER_SIZE', 1000);
  }

  public get webPort(): number {
    return this.getNumber('WEB_PORT', 3000);
  }

  public get webHost(): string {
    return this.get('WEB_HOST', '127.0.0.1');
  }

  public get dbPath(): string {
    return this.get('DB_PATH', '/app/data/subsyncarr-plus-plus.db');
  }

  public get isTest(): boolean {
    return process.env.NODE_ENV === 'test';
  }

  public getScanConfig(): ScanConfig {
    const scanPaths = this.getArray('SCAN_PATHS', ['/scan_dir']);
    const excludePaths = this.getArray('EXCLUDE_PATHS', []);

    return {
      includePaths: scanPaths,
      excludePaths: excludePaths,
      enableContextAwareMatching: this.getBoolean('ENABLE_CONTEXT_AWARE_MATCHING', true),
    };
  }

  public getRetentionConfig(): RetentionConfig {
    return {
      keepRunsDays: this.getNumber('RETENTION_KEEP_RUNS_DAYS', 30),
      trimLogsDays: this.getNumber('RETENTION_TRIM_LOGS_DAYS', 7),
      maxLogSizeBytes: this.getNumber('RETENTION_MAX_LOG_SIZE', 10000),
      cleanupIntervalHours: this.getNumber('RETENTION_CLEANUP_INTERVAL_HOURS', 24),
    };
  }
}

export const appConfig = AppConfig.getInstance();
