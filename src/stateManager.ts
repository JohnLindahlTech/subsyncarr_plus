import EventEmitter from 'events';
import { SubsyncarrPlusPlusDatabase, Run, FileResult } from './database.js';
import { randomUUID } from 'crypto';
import { LogFileManager } from './logFileManager.js';
import * as path from 'path';
import cron from 'node-cron';
import { getScanConfig } from './config.js';
import logger from './services/logger.js';
import { RunStatus, FileStatus, AgreementStatus, EngineResult, EngineName } from './types.js';
import { ScoreCalculator } from './services/ScoreCalculator.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface MaintenanceResult {
  success: boolean;
  deletedRunIds?: string[];
  reclaimedBytes?: number;
  error?: string;
}

export class StateManager extends EventEmitter {
  private db: SubsyncarrPlusPlusDatabase;
  private currentRunId: string | null = null;
  private logFileManager: LogFileManager;
  private activeExtractions: Set<string> = new Set();
  private dbPath: string;
  private maintenanceActive: boolean = false;

  constructor(dbPath: string) {
    super();
    this.dbPath = dbPath;
    this.db = new SubsyncarrPlusPlusDatabase(dbPath);

    // Create log file manager in same directory as database
    const logDir = path.join(path.dirname(dbPath), 'logs');
    this.logFileManager = new LogFileManager(logDir);

    this.handleIncompleteRuns();
    this.setupMaintenanceSchedule();
  }

  private setupMaintenanceSchedule(): void {
    // Run maintenance every day at 3 AM
    cron.schedule('0 3 * * *', () => {
      this.performMaintenance();
    });

    // Also run once on startup (background) after a short delay
    // but only if a run isn't already active
    setTimeout(() => {
      this.performMaintenance();
    }, 10000);
  }

  isMaintenanceMode(): boolean {
    return this.maintenanceActive;
  }

  private async tryReopenDatabase(attempt: number = 1): Promise<void> {
    const maxAttempts = 5;
    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff capped at 10s

    try {
      this.db = new SubsyncarrPlusPlusDatabase(this.dbPath, true);
      this.maintenanceActive = false;
      this.emit('maintenance:finished');
      logger.info('Main database connection re-opened successfully.');
    } catch (err) {
      if (attempt <= maxAttempts) {
        logger.warn({ attempt, maxAttempts, delay }, 'Re-opening database failed, retrying...');
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.tryReopenDatabase(attempt + 1);
      } else {
        logger.error({ attempt, maxAttempts }, 'Fatal: Could not re-open database after maximum attempts');
        // Last ditch effort: try one more time without skipping init
        this.db = new SubsyncarrPlusPlusDatabase(this.dbPath, false);
      }
    }
  }

  private handleIncompleteRuns(): void {
    // Find any runs that are still marked as 'running' from a previous session
    const history = this.db.getRunHistory(100);
    const incompleteRuns = history.filter((run) => run.status === RunStatus.RUNNING);

    incompleteRuns.forEach((run) => {
      logger.info({ runId: run.id }, 'Found incomplete run from previous session');
      this.db.updateRun(run.id, {
        status: RunStatus.CANCELLED,
        end_time: run.start_time, // Use start time since we don't know when it actually stopped
      });
      logger.info({ runId: run.id }, 'Marked run as cancelled');
    });
  }

  // Run management
  startRun(
    totalFiles: number,
    totalVideos: number,
    enabledEngines: string[] = [EngineName.FFSUBSYNC, EngineName.AUTOSUBSYNC, EngineName.ALASS],
  ): string {
    const runId = randomUUID();
    this.db.createRun(runId, totalFiles);

    // Set the total number of engines that will run (total_files * enabled_engines)
    const totalEngines = totalFiles * enabledEngines.length;
    this.db.updateRun(runId, {
      total_engines: totalEngines,
      total_videos: totalVideos,
    });

    this.currentRunId = runId;

    // Start log file for this run
    this.logFileManager.startRun(runId);

    const run = this.db.getRun(runId)!;
    this.emit('run:started', run);
    return runId;
  }

  completeRun(runId: string): void {
    this.db.updateRun(runId, {
      end_time: Date.now(),
      status: RunStatus.COMPLETED,
    });

    // End log file for this run
    this.logFileManager.endRun(runId);

    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    const run = this.db.getRun(runId)!;
    this.emit('run:completed', run);
  }

  cancelRun(runId: string): void {
    this.db.updateRun(runId, {
      end_time: Date.now(),
      status: RunStatus.CANCELLED,
    });

    // Bulk update all files that weren't finished to 'skipped'
    this.db.updateAllFileResults(runId, { status: FileStatus.SKIPPED }, [FileStatus.PENDING, FileStatus.PROCESSING]);

    // End log file for this run
    this.logFileManager.endRun(runId);

    if (this.currentRunId === runId) {
      this.currentRunId = null;
    }

    const run = this.db.getRun(runId)!;
    this.emit('run:cancelled', run);
  }

  incrementRunCounter(runId: string, field: 'completed' | 'skipped' | 'failed'): void {
    const run = this.db.getRun(runId)!;
    this.db.updateRun(runId, {
      [field]: run[field] + 1,
    });
  }

  incrementCompletedEngines(runId: string): void {
    const run = this.db.getRun(runId)!;
    this.db.updateRun(runId, {
      completed_engines: run.completed_engines + 1,
    });
  }

  incrementCompletedVideos(runId: string): void {
    const run = this.db.getRun(runId)!;
    this.db.updateRun(runId, {
      completed_videos: run.completed_videos + 1,
    });
  }

  startExtraction(videoPath: string): void {
    this.activeExtractions.add(videoPath);
    this.emit('extraction:started', videoPath);
  }

  stopExtraction(videoPath: string): void {
    this.activeExtractions.delete(videoPath);
    this.emit('extraction:stopped', videoPath);
  }

  getActiveExtractions(): string[] {
    return Array.from(this.activeExtractions);
  }

  incrementRunCountersBulk(
    runId: string,
    increments: {
      completed?: number;
      skipped?: number;
      failed?: number;
      completed_engines?: number;
      completed_videos?: number;
    },
  ): void {
    this.db.incrementRunCountersBulk(runId, increments);
  }

  setCurrentVideo(runId: string, videoPath: string | null): void {
    this.db.updateRun(runId, { current_video: videoPath });
    const run = this.db.getRun(runId);
    if (run) {
      this.emit('run:updated', run);
    }
  }

  getCurrentRun(): Run | null {
    return this.currentRunId ? this.db.getRun(this.currentRunId) : null;
  }

  getRunHistory(limit: number = 50): Run[] {
    return this.db.getRunHistory(limit);
  }

  emitProgress(message: string): void {
    this.emit('run:progress', { message });
  }

  // File management
  addFile(runId: string, filePath: string, videoPath: string | null, isHidden: boolean = false): void {
    this.db.createFileResult(runId, filePath, videoPath, isHidden);
    this.emitFullStateUpdate(runId);
  }

  addFilesBulk(
    runId: string,
    files: Array<{ filePath: string; videoPath: string | null; status: FileResult['status']; isHidden?: boolean }>,
  ): void {
    this.db.bulkCreateFileResults(runId, files);
    // Don't emit individual updates for bulk inserts to avoid event storm
  }

  private emitFullStateUpdate(runId: string): void {
    const run = this.db.getRun(runId);
    if (!run) return;

    // Quality Fix: Send only active and recently finished files for the Live View
    // to prevent network saturation while keeping the UI perfectly reactive.
    const files = this.db.getLiveFileResults(runId, 10);
    const totalFiles = this.db.getFileCount(runId);

    this.emit('state:full_update', {
      currentRun: run,
      files,
      pagination: {
        page: 1,
        limit: 50,
        total: totalFiles,
        totalPages: Math.ceil(totalFiles / 50),
      },
      activeExtractions: this.getActiveExtractions(),
    });
  }
  updateFileStatus(runId: string, filePath: string, status: FileResult['status'], currentEngine?: string | null): void {
    const updates: Partial<FileResult> = { status };
    if (currentEngine !== undefined) {
      updates.current_engine = currentEngine;
    }

    this.db.updateFileResult(runId, filePath, updates);
    this.emitFullStateUpdate(runId);
  }

  updateFileEngine(
    runId: string,
    filePath: string,
    engine: string,
    result: {
      success: boolean;
      duration: number;
      message: string;
      stdout?: string;
      stderr?: string;
      skipped?: boolean;
      isPermanent?: boolean;
      score?: number;
    },
  ): void {
    const file = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    if (!file) return;

    // Record success/failure for strike-tracking logic
    if (result.success) {
      this.db.recordEngineSuccess(filePath, engine);
    } else if (!result.skipped) {
      // Only record failure if it wasn't already skipped by the strike-tracking logic
      this.db.recordEngineFailure(filePath, engine, !!result.isPermanent);
    }

    const engines = JSON.parse(file.engines || '{}');
    engines[engine] = result;

    const updates = { engines: JSON.stringify(engines) };
    this.db.updateFileResult(runId, filePath, updates);
    this.emitFullStateUpdate(runId);
  }

  reconcileFileResults(runId: string, filePath: string): { bestEngine: string | null; status: AgreementStatus } {
    const file = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    if (!file) return { bestEngine: null, status: AgreementStatus.LOW_CONFIDENCE };

    const engines: Record<string, EngineResult> = JSON.parse(file.engines || '{}');
    const reconciliation = ScoreCalculator.reconcile(engines);

    const updates = {
      best_engine: reconciliation.bestEngine,
      best_score: reconciliation.bestScore,
      agreement_status: reconciliation.agreementStatus,
    };

    this.db.updateFileResult(runId, filePath, updates);
    this.emitFullStateUpdate(runId);

    return { bestEngine: reconciliation.bestEngine, status: reconciliation.agreementStatus };
  }

  updateFilesVideoStatus(runId: string, videoPath: string, videoStatus: string | null): void {
    this.db.updateFilesVideoStatus(runId, videoPath, videoStatus);
    this.emitFullStateUpdate(runId);
  }

  clearCompletedFiles(): void {
    // If no active run, find the most recent one to clear its 'live' results
    const runId = this.currentRunId || this.db.getRunHistory(1)[0]?.id;
    if (!runId) return;

    this.db.clearCompletedFiles(runId);

    // Broadcast the full state update so all clients clear their lists instantly
    this.emitFullStateUpdate(runId);
  }

  getFileResults(
    runId: string,
    limit?: number,
    offset?: number,
    search?: string,
    agreementFilter?: string,
    statusFilter?: string,
    sortColumn?: string,
    sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.db.getFileResults(runId, limit, offset, search, agreementFilter, statusFilter, sortColumn, sortOrder);
  }

  getFileCount(runId: string, search?: string, agreementFilter?: string, statusFilter?: string) {
    return this.db.getFileCount(runId, search, agreementFilter, statusFilter);
  }

  getGlobalFileResults(
    limit?: number,
    offset?: number,
    search?: string,
    agreementFilter?: string,
    statusFilter?: string,
    sortColumn?: string,
    sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.db.getGlobalFileResults(limit, offset, search, agreementFilter, statusFilter, sortColumn, sortOrder);
  }

  getGlobalFileCount(search?: string, agreementFilter?: string, statusFilter?: string) {
    return this.db.getGlobalFileCount(search, agreementFilter, statusFilter);
  }

  manuallyVerifyFile(runId: string, filePath: string): void {
    this.db.manuallyVerifyFile(runId, filePath);
    this.emitFullStateUpdate(runId);
  }

  appendLog(runId: string, logMessage: string): void {
    // Write to log file instead of database
    this.logFileManager.appendLog(runId, logMessage);
  }

  getRunLogs(runId: string): string {
    // Read logs from file
    return this.logFileManager.readLog(runId);
  }

  getDatabase(): SubsyncarrPlusPlusDatabase {
    return this.db;
  }

  getLogFileManager(): LogFileManager {
    return this.logFileManager;
  }

  // Engine skip logic methods
  getSkippedEngines(filePath: string): string[] {
    return this.db.getAllSkippedEngines(filePath);
  }

  recordEngineFailure(filePath: string, engine: string, isPermanent: boolean = false): void {
    this.db.recordEngineFailure(filePath, engine, isPermanent);
  }

  recordEngineSuccess(filePath: string, engine: string): void {
    this.db.recordEngineSuccess(filePath, engine);
  }

  shouldSkipEngine(filePath: string, engine: string): boolean {
    const tracking = this.db.getEngineFailureTracking(filePath, engine);
    return tracking ? tracking.is_skipped : false;
  }

  resetSkipStatus(filePath: string, engine?: string): void {
    this.db.resetEngineSkipStatus(filePath, engine);
  }

  resetAllSkipStatuses(): void {
    this.db.resetAllEngineSkipStatuses();
  }

  getFailureStats() {
    return this.db.getFailureTrackingStats();
  }

  getAverageEngineDuration(engine: string): number {
    return this.db.getAverageEngineDuration(engine);
  }

  getGlobalStats() {
    return this.db.getGlobalStats();
  }

  getErrorGroups() {
    return this.db.getErrorGroups();
  }

  performMaintenance(): void {
    if (this.currentRunId || this.maintenanceActive) {
      logger.info('Skipping maintenance: Run in progress or maintenance already active.');
      return;
    }

    this.maintenanceActive = true;
    this.emit('maintenance:started');
    logger.info('Starting off-thread database maintenance. Closing main connection...');

    // We must close the connection so the worker can get an exclusive lock for VACUUM
    this.db.close();

    const workerPath = path.join(__dirname, 'maintenanceWorker.js');
    const { Worker } = require('worker_threads');
    const config = getScanConfig();
    const worker = new Worker(workerPath, {
      workerData: {
        dbPath: this.dbPath,
        olderThanDays: 30,
        trimLogsOlderThanDays: 7,
        libraryRoots: config.includePaths,
      },
    });

    let resultData: MaintenanceResult | null = null;

    worker.on('message', (result: MaintenanceResult) => {
      resultData = result;
    });

    worker.on('error', (err: Error) => {
      logger.error({ err }, 'Maintenance worker thread error');
    });

    worker.on('exit', async (code: number) => {
      logger.info({ code }, 'Maintenance worker exited. Re-opening connection...');

      await this.tryReopenDatabase();

      if (resultData && resultData.success && resultData.deletedRunIds && resultData.reclaimedBytes !== undefined) {
        resultData.deletedRunIds.forEach((id: string) => {
          this.logFileManager.deleteLog(id);
        });
        const orphanLogs = this.logFileManager.deleteOldLogs(30);
        logger.info(
          {
            deletedRuns: resultData.deletedRunIds.length,
            spaceReclaimedMb: (resultData.reclaimedBytes / 1024 / 1024).toFixed(2),
            orphanLogsCleaned: orphanLogs,
          },
          'Off-thread maintenance complete',
        );
      } else if (resultData && !resultData.success) {
        logger.error({ error: resultData.error }, 'Maintenance worker reported failure');
      }
    });
  }
  close() {
    this.logFileManager.close();
    this.db.close();
  }
}
