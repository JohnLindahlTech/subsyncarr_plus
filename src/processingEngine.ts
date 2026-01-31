import EventEmitter from 'events';
import { ScanConfig, getScanConfig } from './config';
import { findAllSrtFiles } from './findAllSrtFiles';
import { findMatchingVideoFile } from './findMatchingVideoFile';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles';
import { generateAlassSubtitles } from './generateAlassSubtitles';
import { StateManager } from './stateManager';
import {
  extractAudio,
  getVideoDuration,
  ENGINE_PROFILES,
  ProcessingResult,
  getPrimaryOutputPath,
  getEngineOutputPath,
} from './helpers';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as os from 'os';

export class ProcessingEngine extends EventEmitter {
  private cancelledFiles: Set<string> = new Set();
  private activeControllers: Map<string, AbortController> = new Map();
  private globalStopRequested: boolean = false;
  private enabledEngines: string[];
  private logBuffer: string[] = [];
  private maxLogBufferSize: number;
  public stateManager?: StateManager;
  private currentScanConfig?: ScanConfig;

  constructor() {
    super();
    this.enabledEngines = process.env.INCLUDE_ENGINES?.split(',') || ['ffsubsync', 'autosubsync', 'alass'];
    this.maxLogBufferSize = parseInt(process.env.LOG_BUFFER_SIZE || '1000', 10);
  }

  private log(message: string): void {
    console.log(message);

    // Ring buffer - remove oldest if at capacity
    if (this.logBuffer.length >= this.maxLogBufferSize) {
      this.logBuffer.shift(); // Remove oldest
    }

    this.logBuffer.push(message);
    this.emit('log', message);
  }

  getLogs(): string[] {
    return [...this.logBuffer];
  }

  clearLogs(): void {
    this.logBuffer = [];
  }

  async processRun(config?: ScanConfig, maxConcurrentOverride?: number): Promise<void> {
    const scanConfig = config || getScanConfig();
    const maxConcurrent = maxConcurrentOverride || parseInt(process.env.MAX_CONCURRENT_SYNC_TASKS || '1', 10);
    this.currentScanConfig = scanConfig;
    this.emit('run:init_progress', 'Scanning directories...');
    this.log(`[${new Date().toISOString()}] Scanning for subtitle files...`);
    this.log(`[${new Date().toISOString()}] Scan paths: ${JSON.stringify(scanConfig.includePaths)}`);

    const { srtFiles, fileIndex } = await findAllSrtFiles(scanConfig);
    this.log(`[${new Date().toISOString()}] Found ${srtFiles.length} subtitle files`);

    // Bulk Pre-Check: Filter out files that are already done
    const filesToProcess: string[] = [];
    const filesToSkip: Array<{ path: string; isHidden: boolean }> = [];

    this.emit('run:init_progress', `Checking ${srtFiles.length} files for existing subtitles...`);
    this.log(`[${new Date().toISOString()}] Checking for existing subtitles...`);

    for (const srtPath of srtFiles) {
      let shouldSkip = false;

      // Preparation for #10: If forceRerun is true, we don't check for existing output files
      if (!scanConfig.forceRerun) {
        const dir = path.dirname(srtPath);
        const baseName = path.basename(srtPath, '.srt');

        // Check 1: Primary file exists? (The ultimate 'Done' signal)
        const primaryName = `${baseName}.synced.srt`;
        if (fileIndex.get(dir)?.has(primaryName)) {
          shouldSkip = true;
        }

        // Check 2: Any engine output exists?
        if (!shouldSkip) {
          outer: for (const engine of this.enabledEngines) {
            const profiles = ENGINE_PROFILES[engine] || [{ name: 'default' }];
            for (const profile of profiles) {
              const suffix = profile.name === 'default' ? '' : `.${profile.name}`;
              const outputName = `${baseName}.${engine}${suffix}.srt`;

              if (fileIndex.get(dir)?.has(outputName)) {
                shouldSkip = true;
                break outer;
              }
            }
          }
        }

        // Check 3: Permanent Failures (e.g. No Video found)
        if (!shouldSkip && this.stateManager) {
          const skippedEngines = this.stateManager.getSkippedEngines(srtPath);
          const allEnabledEnginesSkipped = this.enabledEngines.every((e) => skippedEngines.includes(e));
          if (allEnabledEnginesSkipped && skippedEngines.length > 0) {
            shouldSkip = true;
          }
        }
      }

      if (shouldSkip) {
        // Files are hidden in Live view if they were already done and we aren't forcing a rerun
        filesToSkip.push({ path: srtPath, isHidden: !scanConfig.forceRerun });
      } else {
        filesToProcess.push(srtPath);
      }
    }

    this.log(
      `[${new Date().toISOString()}] Pre-check results: ${filesToProcess.length} to process, ${filesToSkip.length} already done`,
    );

    this.emit('run:init_progress', 'Analyzing video matches...');
    // Group files by video path
    const groups = new Map<string, string[]>();
    for (const srtPath of filesToProcess) {
      const { videoPath } = findMatchingVideoFile(srtPath, scanConfig, fileIndex);
      if (videoPath) {
        const list = groups.get(videoPath) || [];
        list.push(srtPath);
        groups.set(videoPath, list);
      } else {
        // No video found, will be handled by processFile emitting no_video
        const list = groups.get('no_video') || [];
        list.push(srtPath);
        groups.set('no_video', list);
      }
    }

    // Identify videos for skipped files to calculate accurate total/completed stats
    const skippedVideoPaths = new Set<string>();
    for (const item of filesToSkip) {
      const { videoPath } = findMatchingVideoFile(item.path, scanConfig, fileIndex);
      if (videoPath) {
        skippedVideoPaths.add(videoPath);
      }
    }

    // Calculate total unique videos involved in this run
    const processingVideoPaths = new Set(groups.keys());
    processingVideoPaths.delete('no_video'); // Don't count "no_video" as a video

    const allVideoPaths = new Set([...processingVideoPaths, ...skippedVideoPaths]);

    // A video is "fully skipped" if it's in the skipped set but NOT in the processing set
    let fullySkippedVideosCount = 0;
    for (const vid of skippedVideoPaths) {
      if (!processingVideoPaths.has(vid)) {
        fullySkippedVideosCount++;
      }
    }

    this.emit('run:init_progress', `Preparing ${groups.size} movie groups...`);
    // Emit the split results so Coordinator can bulk-insert
    this.emit('run:files_found', {
      processing: filesToProcess,
      skipped: filesToSkip,
      totalCount: srtFiles.length,
      totalVideos: allVideoPaths.size, // Use true total (including fully skipped)
      skippedVideosCount: fullySkippedVideosCount, // Pass this to update completed_videos
      config: scanConfig,
      fileIndex, // Pass the index through for matching
    });

    const groupList = Array.from(groups.entries());

    // Process using a Worker Pool to avoid idle time between batches
    this.log(`[${new Date().toISOString()}] Processing with concurrency: ${maxConcurrent} videos (Worker Pool)`);
    this.log(`[${new Date().toISOString()}] Enabled engines: ${this.enabledEngines.join(', ')}`);

    const queue = [...groupList];
    const totalVideos = groupList.length;
    let completedVideos = 0;

    const workers = Array(Math.min(maxConcurrent, totalVideos))
      .fill(null)
      .map(async () => {
        while (queue.length > 0 && !this.globalStopRequested) {
          const item = queue.shift();
          if (!item) break;

          const [videoPath, srtPaths] = item;
          await this.processVideoGroup(videoPath, srtPaths, fileIndex);

          completedVideos++;
          if (completedVideos % maxConcurrent === 0 || completedVideos === totalVideos) {
            this.log(`[${new Date().toISOString()}] Progress: ${completedVideos}/${totalVideos} videos processed`);
          }
        }
      });

    await Promise.all(workers);

    if (this.globalStopRequested) {
      this.log(`[${new Date().toISOString()}] Processing halted by stop request`);
    }

    this.log(`[${new Date().toISOString()}] All files processed`);
  }

  private async processVideoGroup(
    videoPath: string,
    srtPaths: string[],
    fileIndex: Map<string, Set<string>>,
  ): Promise<void> {
    if (videoPath === 'no_video') {
      for (const srtPath of srtPaths) {
        await this.processFile(srtPath, undefined, fileIndex);
      }
      return;
    }

    this.emit('video:started', { videoPath, srtPaths });
    this.emit('video:phase_changed', { videoPath, phase: 'extracting' });

    const tempAudioPath = path.join(os.tmpdir(), `subsyncarr_${randomUUID()}.wav`);
    let audioExtracted = false;

    try {
      // Extract audio once for the entire group
      this.log(`[${new Date().toISOString()}] Extracting audio for group: ${path.basename(videoPath)}`);
      if (this.stateManager) this.stateManager.startExtraction(videoPath);

      // Use a controller just for the extraction part
      const extractionController = new AbortController();
      // If any srt in the group is skipped, we don't necessarily want to kill extraction
      // but if the whole run is stopped, we do.

      try {
        await extractAudio(videoPath, tempAudioPath, extractionController.signal);
        audioExtracted = true;
      } catch (err) {
        this.log(
          `[${new Date().toISOString()}] Audio extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Fall back to direct video processing if extraction fails
      } finally {
        if (this.stateManager) this.stateManager.stopExtraction(videoPath);
      }

      this.emit('video:phase_changed', { videoPath, phase: 'syncing' });

      // Process all files in the group (sequentially within group to avoid CPU overload)
      for (const srtPath of srtPaths) {
        if (this.globalStopRequested) break;
        await this.processFile(srtPath, audioExtracted ? tempAudioPath : undefined, fileIndex);
      }
    } finally {
      if (audioExtracted && fs.existsSync(tempAudioPath)) {
        try {
          fs.unlinkSync(tempAudioPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (this.stateManager) {
        const runId = this.stateManager.getCurrentRun()?.id;
        if (runId) {
          this.stateManager.incrementCompletedVideos(runId);
        }
      }
      this.emit('video:completed', { videoPath });
    }
  }

  private async processFile(srtPath: string, audioPath?: string, fileIndex?: Map<string, Set<string>>): Promise<void> {
    const fileName = srtPath.split('/').pop();

    // Check if stopped or cancelled
    if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
      this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'cancelled' });
      return;
    }

    this.log(`[${new Date().toISOString()}] Processing: ${fileName}`);

    const { videoPath } = findMatchingVideoFile(srtPath, this.currentScanConfig, fileIndex);

    this.emit('file:started', { srtPath, videoPath });

    if (!videoPath) {
      this.log(`[${new Date().toISOString()}] No matching video found for: ${fileName}`);
      this.emit('file:no_video', { srtPath });
      return;
    }

    if (audioPath) {
      this.log(`[${new Date().toISOString()}] Using shared audio reference for: ${fileName}`);
    } else {
      this.log(`[${new Date().toISOString()}] Found video: ${videoPath.split('/').pop()}`);
    }

    const controller = new AbortController();
    this.activeControllers.set(srtPath, controller);

    // #10: If primary .synced.srt exists, skip unless forceRerun is true
    if (!this.currentScanConfig?.forceRerun && fs.existsSync(getPrimaryOutputPath(srtPath))) {
      this.log(`[${new Date().toISOString()}] Skipped (Primary already exists): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'already_synced' });
      return;
    }

    try {
      // #4: Adaptive Timeout based on video duration
      const videoSeconds = await getVideoDuration(videoPath);
      // Timeout = 10% of video length + 60s buffer, converted to ms
      const timeoutMs = Math.round(videoSeconds * 0.1 + 60) * 1000;
      this.log(
        `[${new Date().toISOString()}] Using adaptive timeout: ${Math.round(timeoutMs / 1000)}s for ${fileName}`,
      );

      // Process with each enabled engine
      let anyEngineSucceeded = false;
      let anyEngineSkipped = false;
      let absoluteBestResult: { score: number | undefined; path: string } | null = null;

      for (const engine of this.enabledEngines) {
        // Check cancellation before each engine
        if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
          this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
          this.emit('file:skipped', { srtPath, reason: 'cancelled' });
          return;
        }

        // Check if engine should be skipped due to consecutive failures
        // Preparation for #10: If forceRerun is true, we don't skip engines
        if (!this.currentScanConfig?.forceRerun && this.stateManager?.shouldSkipEngine(srtPath, engine)) {
          this.log(`[${new Date().toISOString()}] ⊘ Skipping ${engine} (3+ consecutive failures): ${fileName}`);
          anyEngineSkipped = true;
          this.emit('file:engine_completed', {
            srtPath,
            engine,
            result: {
              success: false,
              duration: 0,
              message: 'Skipped due to 3+ consecutive failures',
              skipped: true,
            },
          });
          continue; // Skip to next engine
        }

        this.emit('file:engine_started', { srtPath, engine });

        const profiles = ENGINE_PROFILES[engine] || [{ name: 'default', args: [] }];
        let bestTrialResult: ProcessingResult | null = null;

        for (const profile of profiles) {
          this.log(`[${new Date().toISOString()}] Trial: ${engine} (${profile.name}) for: ${fileName}`);
          const startTime = Date.now();
          const trialOutputPath = getEngineOutputPath(srtPath, engine, profile.name);
          let currentTrialResult: ProcessingResult;

          try {
            switch (engine) {
              case 'ffsubsync':
                currentTrialResult = await generateFfsubsyncSubtitles(
                  srtPath,
                  videoPath,
                  controller.signal,
                  audioPath,
                  timeoutMs,
                  profile,
                );
                break;
              case 'autosubsync':
                currentTrialResult = await generateAutosubsyncSubtitles(
                  srtPath,
                  videoPath,
                  controller.signal,
                  audioPath,
                  timeoutMs,
                );
                break;
              case 'alass':
                currentTrialResult = await generateAlassSubtitles(
                  srtPath,
                  videoPath,
                  controller.signal,
                  audioPath,
                  timeoutMs,
                  profile,
                );
                break;
              default:
                continue;
            }

            const duration = Date.now() - startTime;
            const status = currentTrialResult.success ? '✓' : '✗';
            this.log(
              `[${new Date().toISOString()}] ${status} ${engine} (${profile.name}) trial completed (${(duration / 1000).toFixed(1)}s): ${fileName}`,
            );

            // IPO Logic: Keep the best score
            if (currentTrialResult.success) {
              if (
                !bestTrialResult ||
                !bestTrialResult.success ||
                (currentTrialResult.score || 0) > (bestTrialResult.score || 0)
              ) {
                bestTrialResult = { ...currentTrialResult, duration };
              }

              // Track winner for primary file
              if (!absoluteBestResult || (currentTrialResult.score || 0) > (absoluteBestResult.score || 0)) {
                absoluteBestResult = {
                  score: currentTrialResult.score,
                  path: trialOutputPath,
                };
              }
            }

            // Optimization: If score is high enough, don't try other profiles
            if (currentTrialResult.success && (currentTrialResult.score || 0) >= 85) {
              this.log(
                `[${new Date().toISOString()}] Confidence high (${currentTrialResult.score}%). Skipping other profiles.`,
              );
              break;
            }
          } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.log(
              `[${new Date().toISOString()}] ✗ ${engine} (${profile.name}) trial failed (${(duration / 1000).toFixed(1)}s): ${fileName}`,
            );
            this.log(`[${new Date().toISOString()}]   Error: ${errorMsg}`);

            // Even if it failed, record the error result so we have details
            if (!bestTrialResult) {
              bestTrialResult = {
                success: false,
                duration,
                message: errorMsg,
                stderr: errorMsg,
              };
            }
          }
        }

        if (bestTrialResult) {
          if (bestTrialResult.success) {
            anyEngineSucceeded = true;
          }
          this.emit('file:engine_completed', {
            srtPath,
            engine,
            result: bestTrialResult,
          });
        }
      }

      // Always reconcile at the end of processing a file, so we have best_engine/status
      if (this.stateManager) {
        const runId = this.stateManager.getCurrentRun()?.id;
        if (runId) {
          this.stateManager.reconcileFileResults(runId, srtPath);
        }
      }

      // After all engines finish, create the Primary file if anyone succeeded
      if (absoluteBestResult && fs.existsSync(absoluteBestResult.path)) {
        const primaryPath = getPrimaryOutputPath(srtPath);
        fs.copyFileSync(absoluteBestResult.path, primaryPath);

        const scoreVal = absoluteBestResult.score;
        const scoreStr = scoreVal !== undefined ? `${scoreVal}%` : 'N/A';
        const warning = scoreVal !== undefined && scoreVal < 50 ? ' [LOW CONFIDENCE]' : '';
        this.log(
          `[${new Date().toISOString()}] Winner determined! Primary file created: ${path.basename(primaryPath)} (Score: ${scoreStr})${warning}`,
        );
      }

      if (anyEngineSucceeded) {
        this.log(`[${new Date().toISOString()}] ✓ Completed successfully for: ${fileName}`);
        this.emit('file:completed', { srtPath });
      } else if (anyEngineSkipped) {
        this.log(`[${new Date().toISOString()}] ⊘ All attempts skipped for: ${fileName}`);
        this.emit('file:skipped', { srtPath, reason: 'engine_skipped' });
      } else {
        this.log(`[${new Date().toISOString()}] ✗ All engines failed for: ${fileName}`);
        this.emit('file:failed', { srtPath });
      }
    } finally {
      this.activeControllers.delete(srtPath);
    }
  }

  skipFile(filePath: string): void {
    this.cancelledFiles.add(filePath);
    const controller = this.activeControllers.get(filePath);
    if (controller) {
      controller.abort();
    }
    this.emit('file:skip_requested', { filePath });
  }

  stopAllProcessing(allFiles: string[]): void {
    this.log(`[${new Date().toISOString()}] Stop requested - cancelling all remaining files`);
    this.globalStopRequested = true;
    allFiles.forEach((file) => this.cancelledFiles.add(file));

    // Abort all active tasks
    this.activeControllers.forEach((controller) => {
      controller.abort();
    });
    this.activeControllers.clear();
  }

  reset(): void {
    this.cancelledFiles.clear();
    this.activeControllers.clear();
    this.globalStopRequested = false;
    this.clearLogs();
  }

  async dryRun(config?: ScanConfig): Promise<{
    totalSRTs: number;
    alreadyDone: number;
    matched: Array<{ srt: string; video: string; reason: string }>;
    missingVideo: Array<{ srt: string; reason: string; details?: string }>;
    permanentFailures: number;
    estimatedMs: number;
  }> {
    const scanConfig = config || getScanConfig();
    const { srtFiles, fileIndex } = await findAllSrtFiles(scanConfig);

    const results = {
      totalSRTs: srtFiles.length,
      alreadyDone: 0,
      matched: [] as Array<{ srt: string; video: string; reason: string }>,
      missingVideo: [] as Array<{ srt: string; reason: string; details?: string }>,
      permanentFailures: 0,
      estimatedMs: 0,
    };

    // Pre-calculate average engine durations
    const avgEngineDurations = this.enabledEngines.reduce(
      (acc, engine) => {
        acc[engine] = this.stateManager?.getAverageEngineDuration(engine) || 30000;
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalAvgDurationPerFile = Object.values(avgEngineDurations).reduce((a, b) => a + b, 0);

    for (const srtPath of srtFiles) {
      // 1. Check if already done
      let allEnginesDone = true;
      const dir = path.dirname(srtPath);
      const baseName = path.basename(srtPath, '.srt');

      for (const engine of this.enabledEngines) {
        if (!fileIndex.get(dir)?.has(`${baseName}.${engine}.srt`)) {
          allEnginesDone = false;
          break;
        }
      }

      if (allEnginesDone) {
        results.alreadyDone++;
        continue;
      }

      // 2. Check for permanent failure (speech detection etc)
      if (this.stateManager) {
        let isAnyEnginePermanentFailure = false;
        for (const engine of this.enabledEngines) {
          if (this.stateManager.shouldSkipEngine(srtPath, engine)) {
            isAnyEnginePermanentFailure = true;
            break;
          }
        }
        if (isAnyEnginePermanentFailure) {
          results.permanentFailures++;
          continue;
        }
      }

      // 3. Try to match video
      const match = findMatchingVideoFile(srtPath, scanConfig, fileIndex);
      if (match.videoPath) {
        results.matched.push({
          srt: path.basename(srtPath),
          video: path.basename(match.videoPath),
          reason: match.reason,
        });
        results.estimatedMs += totalAvgDurationPerFile;
      } else {
        results.missingVideo.push({
          srt: path.basename(srtPath),
          reason: match.reason,
          details: match.details,
        });
      }
    }

    const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_SYNC_TASKS || '1', 10);
    results.estimatedMs = results.estimatedMs / maxConcurrent;

    return results;
  }
}
