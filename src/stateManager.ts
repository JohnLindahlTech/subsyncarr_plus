import EventEmitter from 'events';
import { SubsyncarrPlusPlusDatabase, Run, FileResult } from './database';
import { randomUUID } from 'crypto';
import { LogFileManager } from './logFileManager';
import * as path from 'path';
import cron from 'node-cron';

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

  private handleIncompleteRuns(): void {
    // Find any runs that are still marked as 'running' from a previous session
    const history = this.db.getRunHistory(100);
    const incompleteRuns = history.filter((run) => run.status === 'running');

    incompleteRuns.forEach((run) => {
      console.log(`[${new Date().toISOString()}] Found incomplete run from previous session: ${run.id}`);
      this.db.updateRun(run.id, {
        status: 'cancelled',
        end_time: run.start_time, // Use start time since we don't know when it actually stopped
      });
      console.log(`[${new Date().toISOString()}] Marked run ${run.id} as cancelled`);
    });
  }

  // Run management
  startRun(
    totalFiles: number,
    totalVideos: number,
    enabledEngines: string[] = ['ffsubsync', 'autosubsync', 'alass'],
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
      status: 'completed',
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
      status: 'cancelled',
    });

    // Bulk update all files that weren't finished to 'skipped'
    this.db.updateAllFileResults(runId, { status: 'skipped' }, ['pending', 'processing']);

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
  addFile(runId: string, filePath: string, videoPath: string | null): void {
    this.db.createFileResult(runId, filePath, videoPath);
    this.emitFullStateUpdate(runId);
  }

  addFilesBulk(
    runId: string,
    files: Array<{ filePath: string; videoPath: string | null; status: FileResult['status'] }>,
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

  reconcileFileResults(
    runId: string,
    filePath: string,
  ): { bestEngine: string | null; status: 'verified' | 'suspicious' | 'low_confidence' } {
    const file = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    if (!file) return { bestEngine: null, status: 'low_confidence' };

    interface EngineResult {
      success: boolean;
      score?: number;
      message?: string;
    }

    const engines: Record<string, EngineResult> = JSON.parse(file.engines || '{}');
    const successes = Object.entries(engines).filter(([, res]) => res.success && res.score !== undefined) as Array<
      [string, Required<Pick<EngineResult, 'success' | 'score'>>]
    >;

    if (successes.length === 0) {
      return { bestEngine: null, status: 'low_confidence' };
    }

    // Sort by score descending
    successes.sort((a, b) => b[1].score - a[1].score);
    const [bestName, bestResult] = successes[0];

    let status: 'verified' | 'suspicious' | 'low_confidence' = 'low_confidence';

    if (successes.length >= 2) {
      const secondScore = successes[1][1].score;
      // If the top two engines agree within 5 points and are both high, it's verified
      if (Math.abs(bestResult.score - secondScore) <= 5 && bestResult.score > 70) {
        status = 'verified';
      } else if (Math.abs(bestResult.score - secondScore) > 30) {
        // High disagreement between engines
        status = 'suspicious';
      } else {
        status = 'verified'; // General consensus
      }
    } else {
      // Only one engine succeeded
      status = bestResult.score > 80 ? 'verified' : 'low_confidence';
    }

    const updates = {
      best_engine: bestName,
      best_score: bestResult.score,
      agreement_status: status,
    };

    this.db.updateFileResult(runId, filePath, updates);
    this.emitFullStateUpdate(runId);

    return { bestEngine: bestName, status };
  }

  updateFilesVideoStatus(runId: string, videoPath: string, videoStatus: string | null): void {
    this.db.updateFilesVideoStatus(runId, videoPath, videoStatus);
    this.emitFullStateUpdate(runId);
  }

  clearCompletedFiles(): void {
    if (!this.currentRunId) return;

    this.db.clearCompletedFiles(this.currentRunId);

    // Reset counters for the UI
    this.db.updateRun(this.currentRunId, {
      completed: 0,
      skipped: 0,
      failed: 0,
      completed_engines: 0,
    });

    const run = this.db.getRun(this.currentRunId)!;
    this.emit('files:cleared', { currentRun: run, files: [] });
  }

  getFileResults(
    runId: string,
    limit?: number,
    offset?: number,
    search?: string,
    agreementFilter?: string,
    statusFilter?: string,
  ) {
    return this.db.getFileResults(runId, limit, offset, search, agreementFilter, statusFilter);
  }

  getFileCount(runId: string, search?: string, agreementFilter?: string, statusFilter?: string) {
    return this.db.getFileCount(runId, search, agreementFilter, statusFilter);
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

  /**
   * Performs database maintenance tasks in a separate thread to avoid locking the UI
   */
  performMaintenance(): void {
    if (this.currentRunId) {
      console.log(`[${new Date().toISOString()}] Skipping maintenance: A run is currently in progress.`);
      return;
    }

    console.log(`[${new Date().toISOString()}] Starting off-thread database maintenance. Closing main connection...`);

    // We must close the connection so the worker can get an exclusive lock for VACUUM
    this.db.close();

    const workerPath = path.join(__dirname, 'maintenanceWorker.js');
    const { Worker } = require('worker_threads');
    const worker = new Worker(workerPath, {
      workerData: {
        dbPath: this.dbPath,
        olderThanDays: 30,
        trimLogsOlderThanDays: 7,
      },
    });

    let resultData: MaintenanceResult | null = null;

    worker.on('message', (result: MaintenanceResult) => {
      resultData = result;
    });

    worker.on('error', (err: Error) => {
      console.error(`[${new Date().toISOString()}] Maintenance worker thread error:`, err);
    });

    worker.on('exit', (code: number) => {
      console.log(
        `[${new Date().toISOString()}] Maintenance worker exited with code ${code}. Re-opening connection...`,
      );

      // Use skipInit: true because we already initialized the schema at startup.
      // This avoids running PRAGMAs and CREATE TABLE statements that might trigger SQLITE_BUSY
      // if the OS hasn't fully released the file lock yet.
      try {
        this.db = new SubsyncarrPlusPlusDatabase(this.dbPath, true);
        console.log(`[${new Date().toISOString()}] Main database connection re-opened.`);

        if (resultData && resultData.success && resultData.deletedRunIds && resultData.reclaimedBytes !== undefined) {
          resultData.deletedRunIds.forEach((id: string) => {
            this.logFileManager.deleteLog(id);
          });
          const orphanLogs = this.logFileManager.deleteOldLogs(30);
          console.log(`[${new Date().toISOString()}] Off-thread maintenance complete:`);
          console.log(`  - Deleted runs: ${resultData.deletedRunIds.length}`);
          console.log(`  - Space reclaimed: ${(resultData.reclaimedBytes / 1024 / 1024).toFixed(2)} MB`);
          console.log(`  - Orphan logs cleaned: ${orphanLogs}`);
        } else if (resultData && !resultData.success) {
          console.error(`[${new Date().toISOString()}] Maintenance worker reported failure: ${resultData.error}`);
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Fatal error re-opening database after maintenance:`, err);
        // Fallback: try one more time after a delay
        setTimeout(() => {
          this.db = new SubsyncarrPlusPlusDatabase(this.dbPath, true);
          console.log(`[${new Date().toISOString()}] Connection recovered after retry.`);
        }, 2000);
      }
    });
  }
  close() {
    this.logFileManager.close();
    this.db.close();
  }
}
