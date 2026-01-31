import { z } from 'zod';

// Define the schema for configuration
const configSchema = z.object({
  INCLUDE_ENGINES: z
    .string()
    .default('ffsubsync,autosubsync,alass')
    .transform((s) => s.split(',').filter(Boolean)),
  MAX_CONCURRENT_SYNC_TASKS: z.coerce.number().int().positive().default(1),
  CRON_SCHEDULE: z.string().default('0 0 * * *'),
  SYNC_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(1800000),
  LOG_BUFFER_SIZE: z.coerce.number().int().positive().default(1000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WEB_HOST: z.string().default('127.0.0.1'),
  DB_PATH: z.string().default('/app/data/subsyncarr-plus-plus.db'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  SCAN_PATHS: z
    .string()
    .default('/scan_dir')
    .transform((s) => s.split(',').filter(Boolean)),
  EXCLUDE_PATHS: z
    .string()
    .default('')
    .transform((s) => s.split(',').filter(Boolean)),
  ENABLE_CONTEXT_AWARE_MATCHING: z
    .string()
    .default('true')
    .transform((s) => s.toLowerCase() !== 'false'),
  RETENTION_KEEP_RUNS_DAYS: z.coerce.number().int().positive().default(30),
  RETENTION_TRIM_LOGS_DAYS: z.coerce.number().int().positive().default(7),
  RETENTION_MAX_LOG_SIZE: z.coerce.number().int().positive().default(10000),
  RETENTION_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().positive().default(24),
});

export type Config = z.infer<typeof configSchema>;

export class AppConfig {
  private static instance: AppConfig;
  private config: Config;

  private constructor() {
    try {
      this.config = configSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        console.error(`❌ Invalid configuration: ${issues}`);
      } else {
        console.error('❌ Failed to parse configuration');
      }
      process.exit(1);
    }
  }

  public static getInstance(): AppConfig {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }
    return AppConfig.instance;
  }

  /**
   * Re-initializes the configuration from process.env.
   * Useful for testing when environment variables change.
   */
  public reinitialize(): void {
    this.config = configSchema.parse(process.env);
  }

  public get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  // Backward compatibility for generic string access if still needed
  public getRaw(key: string, defaultValue?: string): string {
    return (process.env[key] as string) || defaultValue || '';
  }

  // Typed getters
  public get includeEngines(): string[] {
    return this.config.INCLUDE_ENGINES;
  }

  public get maxConcurrentSyncTasks(): number {
    return this.config.MAX_CONCURRENT_SYNC_TASKS;
  }

  public get cronSchedule(): string {
    return this.config.CRON_SCHEDULE;
  }

  public get syncEngineTimeoutMs(): number {
    return this.config.SYNC_ENGINE_TIMEOUT_MS;
  }

  public get logBufferSize(): number {
    return this.config.LOG_BUFFER_SIZE;
  }

  public get webPort(): number {
    return this.config.WEB_PORT;
  }

  public get webHost(): string {
    return this.config.WEB_HOST;
  }

  public get dbPath(): string {
    return this.config.DB_PATH;
  }

  public get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }

  public getScanConfig() {
    return {
      includePaths: this.config.SCAN_PATHS,
      excludePaths: this.config.EXCLUDE_PATHS,
      enableContextAwareMatching: this.config.ENABLE_CONTEXT_AWARE_MATCHING,
    };
  }

  public getRetentionConfig() {
    return {
      keepRunsDays: this.config.RETENTION_KEEP_RUNS_DAYS,
      trimLogsDays: this.config.RETENTION_TRIM_LOGS_DAYS,
      maxLogSizeBytes: this.config.RETENTION_MAX_LOG_SIZE,
      cleanupIntervalHours: this.config.RETENTION_CLEANUP_INTERVAL_HOURS,
    };
  }
}

export const appConfig = AppConfig.getInstance();
