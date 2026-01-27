import EventEmitter from 'events';
import { SubsyncarrPlusPlusDatabase, Run, FileResult } from './database';
import { randomUUID } from 'crypto';
import { LogFileManager } from './logFileManager';
import * as path from 'path';

export class StateManager extends EventEmitter {
  private db: SubsyncarrPlusPlusDatabase;
  private currentRunId: string | null = null;
  private logFileManager: LogFileManager;
  private activeExtractions: Set<string> = new Set();

  constructor(dbPath: string) {
    super();
    this.db = new SubsyncarrPlusPlusDatabase(dbPath);

    // Create log file manager in same directory as database
    const logDir = path.join(path.dirname(dbPath), 'logs');
    this.logFileManager = new LogFileManager(logDir);

    this.handleIncompleteRuns();
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
   * Performs database maintenance tasks
   */
  performMaintenance(): void {
    console.log(`[${new Date().toISOString()}] Starting database maintenance...`);
    const statsBefore = this.db.getDatabaseStats();

    // 1. Delete runs older than 30 days
    const deletedRunIds = this.db.deleteOldRuns(30);

    // 2. Delete corresponding log files
    deletedRunIds.forEach((id) => {
      this.logFileManager.deleteLog(id);
    });

    // 3. Trim database logs for runs older than 7 days
    const trimmedLogs = this.db.trimOldLogs(7);

    // 4. Also clean up any "orphan" log files that might have been missed
    const orphanLogs = this.logFileManager.deleteOldLogs(30);

    // 5. Reclaim space
    this.db.vacuum();

    const statsAfter = this.db.getDatabaseStats();
    const savedBytes = statsBefore.sizeBytes - statsAfter.sizeBytes;

    console.log(`[${new Date().toISOString()}] Maintenance complete:`);
    console.log(`  - Deleted runs: ${deletedRunIds.length}`);
    console.log(`  - Deleted run log files: ${deletedRunIds.length}`);
    console.log(`  - Cleaned orphan log files: ${orphanLogs}`);
    console.log(`  - Trimmed database logs: ${trimmedLogs}`);
    console.log(`  - Space reclaimed: ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);
  }
  close() {
    this.logFileManager.close();
    this.db.close();
  }
}
