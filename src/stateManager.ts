import EventEmitter from 'events';
import { SubsyncarrPlusDatabase, Run, FileResult } from './database';
import { randomUUID } from 'crypto';
import { LogFileManager } from './logFileManager';
import * as path from 'path';

export class StateManager extends EventEmitter {
  private db: SubsyncarrPlusDatabase;
  private currentRunId: string | null = null;
  private logFileManager: LogFileManager;

  constructor(dbPath: string) {
    super();
    this.db = new SubsyncarrPlusDatabase(dbPath);

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
  startRun(totalFiles: number, enabledEngines: string[] = ['ffsubsync', 'autosubsync', 'alass']): string {
    const runId = randomUUID();
    this.db.createRun(runId, totalFiles);

    // Set the total number of engines that will run (total_files * enabled_engines)
    const totalEngines = totalFiles * enabledEngines.length;
    this.db.updateRun(runId, { total_engines: totalEngines });

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
    this.emitFileUpdate(runId, filePath);
  }

  addFilesBulk(
    runId: string,
    files: Array<{ filePath: string; videoPath: string | null; status: FileResult['status'] }>,
  ): void {
    this.db.bulkCreateFileResults(runId, files);
    // Don't emit individual updates for bulk inserts to avoid event storm
  }

  private emitFileUpdate(runId: string, filePath: string): void {
    const file = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    const run = this.db.getRun(runId);
    if (file) {
      this.emit('file:updated', { file, run });
    }
  }

  updateFileStatus(runId: string, filePath: string, status: FileResult['status'], currentEngine?: string | null): void {
    const updates: Partial<FileResult> = { status };
    if (currentEngine !== undefined) {
      updates.current_engine = currentEngine;
    }

    this.db.updateFileResult(runId, filePath, updates);
    this.emitFileUpdate(runId, filePath);
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
    },
  ): void {
    const file = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    if (!file) return;

    const engines = JSON.parse(file.engines || '{}');
    engines[engine] = result;

    this.db.updateFileResult(runId, filePath, { engines: JSON.stringify(engines) });
    const updatedFile = this.db.getFileResults(runId).find((f) => f.file_path === filePath);
    if (updatedFile) {
      this.emit('file:updated', { file: updatedFile, run: this.db.getRun(runId) });
    }
  }

  updateFilesVideoStatus(runId: string, videoPath: string, videoStatus: string | null): void {
    this.db.updateFilesVideoStatus(runId, videoPath, videoStatus);
    // Broadcast updates for all files in this group
    const allFiles = this.db.getFileResults(runId);
    const affectedFiles = allFiles.filter((f) => f.video_path === videoPath);
    const run = this.db.getRun(runId);

    affectedFiles.forEach((file) => {
      this.emit('file:updated', { file, run });
    });
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

  getFileResults(runId: string, limit?: number, offset?: number, search?: string): FileResult[] {
    return this.db.getFileResults(runId, limit, offset, search);
  }

  getFileCount(runId: string, search?: string): number {
    return this.db.getFileCount(runId, search);
  }

  appendLog(runId: string, logMessage: string): void {
    // Write to log file instead of database
    this.logFileManager.appendLog(runId, logMessage);
  }

  getRunLogs(runId: string): string {
    // Read logs from file
    return this.logFileManager.readLog(runId);
  }

  getDatabase(): SubsyncarrPlusDatabase {
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

  getFailureStats() {
    return this.db.getFailureTrackingStats();
  }

  /**
   * Performs database maintenance tasks
   */
  performMaintenance(): void {
    console.log(`[${new Date().toISOString()}] Starting database maintenance...`);
    const statsBefore = this.db.getDatabaseStats();

    // 1. Delete runs older than 30 days
    const deletedRuns = this.db.deleteOldRuns(30);

    // 2. Trim logs for runs older than 7 days
    const trimmedLogs = this.db.trimOldLogs(7);

    // 3. Reclaim space
    this.db.vacuum();

    const statsAfter = this.db.getDatabaseStats();
    const savedBytes = statsBefore.sizeBytes - statsAfter.sizeBytes;

    console.log(`[${new Date().toISOString()}] Maintenance complete:`);
    console.log(`  - Deleted runs: ${deletedRuns}`);
    console.log(`  - Trimmed logs: ${trimmedLogs}`);
    console.log(`  - Space reclaimed: ${(savedBytes / 1024 / 1024).toFixed(2)} MB`);
  }

  close() {
    this.logFileManager.close();
    this.db.close();
  }
}
