import { ProcessingEngine } from './processingEngine.js';
import { StateManager } from './stateManager.js';
import { ScanConfig } from './config.js';
import { findMatchingVideoFile } from './findMatchingVideoFile.js';
import { Run } from './database.js';
import { once } from 'events';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';
import { FileStatus } from './types.js';

export class ProcessingCoordinator {
  private processingPromise: Promise<void> | null = null;
  private enabledEngines: string[];
  private currentRunId: string | null = null;
  private stopRequested: boolean = false;
  private activeVideos: Map<string, string> = new Map(); // videoPath -> status message

  constructor(
    private engine: ProcessingEngine,
    private stateManager: StateManager,
  ) {
    this.enabledEngines = appConfig.includeEngines;

    // Inject stateManager into engine so it can check skip status
    this.engine.setStateManager(this.stateManager);

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.engine.on('log', (message: string) => {
      if (this.currentRunId) {
        this.stateManager.appendLog(this.currentRunId, message);
      }
    });

    this.engine.on('run:init_progress', (message: string) => {
      this.stateManager.emitProgress(message);
    });

    this.engine.on(
      'run:files_found',
      async ({
        processing,
        skipped,
        totalVideos,
        skippedVideosCount,
        config,
      }: {
        processing: string[];
        skipped: Array<{ path: string; isHidden: boolean }>;
        totalVideos: number;
        skippedVideosCount?: number;
        config: ScanConfig;
      }) => {
        const totalFiles = processing.length + skipped.length;
        const runId = this.stateManager.startRun(totalFiles, totalVideos, this.enabledEngines);
        this.currentRunId = runId;

        // Bulk add pending files
        const pendingFiles = processing.map((filePath) => {
          const match = findMatchingVideoFile(filePath, config);
          return {
            filePath,
            videoPath: match.videoPath,
            status: FileStatus.PENDING,
          };
        });
        this.stateManager.addFilesBulk(runId, pendingFiles);

        // Bulk add skipped files
        const skippedFiles = skipped.map((item) => {
          const match = findMatchingVideoFile(item.path, config);
          return {
            filePath: item.path,
            videoPath: match.videoPath,
            status: FileStatus.SKIPPED,
            isHidden: item.isHidden,
          };
        });
        this.stateManager.addFilesBulk(runId, skippedFiles);

        // Update run stats in bulk for skipped files
        if (skipped.length > 0) {
          this.stateManager.incrementRunCountersBulk(runId, {
            skipped: skipped.length,
            completed_engines: skipped.length * this.enabledEngines.length,
            completed_videos: skippedVideosCount || 0,
          });
        }
      },
    );

    this.engine.on('video:started', () => {
      // Handled by phase_changed for more detail
    });

    this.engine.on(
      'video:phase_changed',
      ({ videoPath, phase }: { videoPath: string; phase: 'extracting' | 'syncing' }) => {
        if (this.currentRunId) {
          const basename = videoPath.split('/').pop();
          const status = phase === 'extracting' ? `Extracting audio...` : `Syncing subtitles...`;

          this.stateManager.updateFilesVideoStatus(this.currentRunId, videoPath, status);

          const runStatus =
            phase === 'extracting' ? `⚙️ Extracting audio: ${basename}...` : `⚙️ Syncing subtitles: ${basename}...`;

          this.activeVideos.set(videoPath, runStatus);
          this.stateManager.setCurrentVideo(this.currentRunId, runStatus);
        }
      },
    );

    this.engine.on('video:completed', ({ videoPath }: { videoPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFilesVideoStatus(this.currentRunId, videoPath, null);
        this.activeVideos.delete(videoPath);

        if (this.activeVideos.size > 0) {
          const nextStatus = Array.from(this.activeVideos.values()).pop();
          this.stateManager.setCurrentVideo(this.currentRunId, nextStatus || null);
        } else {
          this.stateManager.setCurrentVideo(this.currentRunId, null);
        }
      }
    });

    this.engine.on('file:started', ({ srtPath }: { srtPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.PROCESSING, null);
      }
    });

    this.engine.on('file:engine_started', ({ srtPath, engine }: { srtPath: string; engine: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.PROCESSING, engine);
      }
    });

    this.engine.on(
      'file:engine_completed',
      ({
        srtPath,
        engine,
        result,
      }: {
        srtPath: string;
        engine: string;
        result: {
          success: boolean;
          duration: number;
          message: string;
          stdout?: string;
          stderr?: string;
          skipped?: boolean;
          isPermanent?: boolean;
        };
      }) => {
        if (this.currentRunId) {
          this.stateManager.updateFileEngine(this.currentRunId, srtPath, engine, result);
          this.stateManager.incrementCompletedEngines(this.currentRunId);
        }
      },
    );

    this.engine.on('file:completed', ({ srtPath }: { srtPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.COMPLETED, null);
        this.stateManager.incrementRunCounter(this.currentRunId, 'completed');
      }
    });

    this.engine.on('file:skipped', ({ srtPath }: { srtPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.SKIPPED, null);
        this.stateManager.incrementRunCountersBulk(this.currentRunId, {
          skipped: 1,
          completed_engines: this.enabledEngines.length,
        });
      }
    });

    this.engine.on('file:no_video', ({ srtPath }: { srtPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.ERROR, null);

        // Mark as permanent failure for all engines so it doesn't keep retrying every run
        for (const engine of this.enabledEngines) {
          this.stateManager.recordEngineFailure(srtPath, engine, true);
        }

        this.stateManager.incrementRunCountersBulk(this.currentRunId, {
          failed: 1,
          completed_engines: this.enabledEngines.length,
        });
      }
    });

    this.engine.on('file:failed', ({ srtPath }: { srtPath: string }) => {
      if (this.currentRunId) {
        this.stateManager.updateFileStatus(this.currentRunId, srtPath, FileStatus.ERROR, null);
        this.stateManager.incrementRunCounter(this.currentRunId, 'failed');
      }
    });
  }

  async startRun(config?: ScanConfig): Promise<string> {
    if (this.processingPromise) {
      logger.warn('Cannot start run: Another run is already in progress');
      throw new Error('A run is already in progress');
    }

    logger.info('Starting new processing run...');
    this.engine.reset();
    this.currentRunId = null;
    this.stopRequested = false;
    this.activeVideos.clear();

    const ac = new AbortController();
    // Use events.once for cleaner listener handling with AbortSignal support
    const runStartedPromise = once(this.stateManager, 'run:started', { signal: ac.signal }).then(
      ([run]) => (run as Run).id,
    );

    // Suppress unhandled rejection when we abort this promise
    runStartedPromise.catch(() => {});

    const processPromise = this.engine.processRun(config);

    this.processingPromise = processPromise.finally(() => {
      this.processingPromise = null;
      const run = this.stateManager.getCurrentRun();
      if (run) {
        logger.info(
          {
            runId: run.id,
            total_files: run.total_files,
            completed: run.completed,
            skipped: run.skipped,
            failed: run.failed,
          },
          'Run completed',
        );
        this.stateManager.completeRun(run.id);
      }
      this.currentRunId = null;
    });
    // Prevent unhandled rejection on the background promise property,
    // as the error is handled by the main startRun awaiter.
    this.processingPromise.catch(() => {});

    try {
      // Wait for run to be created or process to fail/finish
      const runId = await Promise.race([
        runStartedPromise,
        processPromise.then(() => {
          // Process finished. If run started, we should have the ID.
          const run = this.stateManager.getCurrentRun();
          if (!run) {
            throw new Error('Process completed without starting a run');
          }
          return run.id;
        }),
      ]);

      if (this.stopRequested) {
        logger.info({ runId }, 'Stop was requested during scan. Cancelling run');
        this.stopRun();
        throw new Error('Run was stopped during initialization');
      }

      logger.info({ runId }, 'Run created');
      return runId;
    } finally {
      // Clean up the event listener if it hasn't fired yet
      ac.abort();
    }
  }

  skipFile(filePath: string): void {
    const fileName = filePath.split('/').pop();
    logger.info({ fileName }, 'Skip requested for file');
    this.engine.skipFile(filePath);
  }

  stopRun(): void {
    logger.info('Stop run requested');
    const run = this.stateManager.getCurrentRun();
    if (!run) {
      if (this.isRunning()) {
        logger.info('No run active yet (still scanning). Queuing stop...');
        this.stopRequested = true;
        return;
      }
      throw new Error('No run is currently in progress');
    }

    // Tell engine to stop all processing.
    // We don't need to pass all file paths anymore because the engine
    // should just stop whatever it is doing.
    this.engine.stopAllProcessing([]);

    // Mark run as cancelled in bulk
    this.stateManager.cancelRun(run.id);
  }

  /**
   * Performs a graceful shutdown of the coordinator and its engine.
   * Stops any active runs and waits for cleanup.
   */
  async shutdown(): Promise<void> {
    logger.info('Coordinator shutdown initiated');
    if (this.isRunning()) {
      logger.info('Active run detected during shutdown. Stopping...');
      this.stopRun();
      // Wait for the processing promise to finish (which includes engine cleanup)
      if (this.processingPromise) {
        try {
          await this.processingPromise;
        } catch (err) {
          // Ignore errors during shutdown
        }
      }
    }
    logger.info('Coordinator shutdown complete');
  }

  isRunning(): boolean {
    return this.processingPromise !== null;
  }

  async dryRun(config?: ScanConfig): Promise<{
    totalSRTs: number;
    alreadyDone: number;
    matched: Array<{ srt: string; video: string; reason: string }>;
    missingVideo: Array<{ srt: string; reason: string; details?: string }>;
    permanentFailures: number;
    estimatedMs: number;
  }> {
    if (this.isRunning()) {
      throw new Error('Cannot perform dry run while a real run is in progress');
    }
    return this.engine.dryRun(config);
  }
}
