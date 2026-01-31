import EventEmitter from 'events';
import { ScanConfig, getScanConfig } from './config.js';
import { ScannerService } from './services/ScannerService.js';
import { AudioExtractor } from './services/AudioExtractor.js';
import { findMatchingVideoFile } from './findMatchingVideoFile.js';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles.js';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles.js';
import { generateAlassSubtitles } from './generateAlassSubtitles.js';
import { StateManager } from './stateManager.js';
import {
  getVideoDuration,
  ENGINE_PROFILES,
  ProcessingResult,
  getPrimaryOutputPath,
  getEngineOutputPath,
} from './helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as os from 'os';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';
import PQueue from 'p-queue';
import { EngineName } from './types.js';

export class ProcessingEngine extends EventEmitter {
  private cancelledFiles: Set<string> = new Set();
  private activeControllers: Map<string, AbortController> = new Map();
  private globalStopRequested: boolean = false;
  private enabledEngines: string[];
  private logBuffer: string[] = [];
  private maxLogBufferSize: number;
  public stateManager?: StateManager;
  private currentScanConfig?: ScanConfig;
  private scanner: ScannerService;
  private extractor: AudioExtractor;
  private queue: PQueue | null = null;

  constructor(scanner?: ScannerService, extractor?: AudioExtractor) {
    super();
    this.enabledEngines = appConfig.includeEngines;
    this.maxLogBufferSize = appConfig.logBufferSize;
    this.scanner = scanner || new ScannerService();
    this.extractor = extractor || new AudioExtractor(this.stateManager);
  }

  // Allow injecting stateManager into extractor if it was added later
  public setStateManager(stateManager: StateManager): void {
    this.stateManager = stateManager;
    this.extractor = new AudioExtractor(stateManager);
  }

  private log(message: string): void {
    logger.debug({ message }, 'Engine log message');

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
    const maxConcurrent = maxConcurrentOverride || appConfig.maxConcurrentSyncTasks;
    this.currentScanConfig = scanConfig;

    this.queue = new PQueue({ concurrency: maxConcurrent });

    this.emit('run:init_progress', 'Scanning directories...');
    this.log(`Scanning for subtitle files...`);

    const { srtFiles, fileIndex } = await this.scanner.findAllSrtFiles(scanConfig);
    this.log(`Found ${srtFiles.length} subtitle files`);

    // Bulk Pre-Check: Filter out files that are already done
    const filesToProcess: string[] = [];
    const filesToSkip: Array<{ path: string; isHidden: boolean }> = [];

    this.emit('run:init_progress', `Checking ${srtFiles.length} files for existing subtitles...`);
    this.log(`Checking for existing subtitles...`);

    for (const srtPath of srtFiles) {
      let shouldSkip = false;

      if (!scanConfig.forceRerun) {
        const dir = path.dirname(srtPath);
        const baseName = path.basename(srtPath, '.srt');

        const primaryName = `${baseName}.synced.srt`;
        if (fileIndex.get(dir)?.has(primaryName)) {
          shouldSkip = true;
        }

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

        if (!shouldSkip && this.stateManager) {
          const skippedEngines = this.stateManager.getSkippedEngines(srtPath);
          const allEnabledEnginesSkipped = this.enabledEngines.every((e) => skippedEngines.includes(e));
          if (allEnabledEnginesSkipped && skippedEngines.length > 0) {
            shouldSkip = true;
          }
        }
      }

      if (shouldSkip) {
        filesToSkip.push({ path: srtPath, isHidden: !scanConfig.forceRerun });
      } else {
        filesToProcess.push(srtPath);
      }
    }

    this.log(`Pre-check results: ${filesToProcess.length} to process, ${filesToSkip.length} already done`);

    this.emit('run:init_progress', 'Analyzing video matches...');
    const groups = new Map<string, string[]>();
    for (const srtPath of filesToProcess) {
      const { videoPath } = findMatchingVideoFile(srtPath, scanConfig, fileIndex);
      if (videoPath) {
        const list = groups.get(videoPath) || [];
        list.push(srtPath);
        groups.set(videoPath, list);
      } else {
        const list = groups.get('no_video') || [];
        list.push(srtPath);
        groups.set('no_video', list);
      }
    }

    const skippedVideoPaths = new Set<string>();
    for (const item of filesToSkip) {
      const { videoPath } = findMatchingVideoFile(item.path, scanConfig, fileIndex);
      if (videoPath) {
        skippedVideoPaths.add(videoPath);
      }
    }

    const processingVideoPaths = new Set(groups.keys());
    processingVideoPaths.delete('no_video');

    const allVideoPaths = new Set([...processingVideoPaths, ...skippedVideoPaths]);

    let fullySkippedVideosCount = 0;
    for (const vid of skippedVideoPaths) {
      if (!processingVideoPaths.has(vid)) {
        fullySkippedVideosCount++;
      }
    }

    this.emit('run:init_progress', `Preparing ${groups.size} movie groups...`);
    this.emit('run:files_found', {
      processing: filesToProcess,
      skipped: filesToSkip,
      totalCount: srtFiles.length,
      totalVideos: allVideoPaths.size,
      skippedVideosCount: fullySkippedVideosCount,
      config: scanConfig,
      fileIndex,
    });

    this.log(`Processing with concurrency: ${maxConcurrent} videos (p-queue)`);
    this.log(`Enabled engines: ${this.enabledEngines.join(', ')}`);

    const totalVideos = groups.size;
    let completedVideos = 0;

    for (const [videoPath, srtPaths] of groups.entries()) {
      if (this.globalStopRequested) break;

      this.queue.add(async () => {
        if (this.globalStopRequested) return;

        await this.processVideoGroup(videoPath, srtPaths, fileIndex);

        completedVideos++;
        if (completedVideos % maxConcurrent === 0 || completedVideos === totalVideos) {
          this.log(`Progress: ${completedVideos}/${totalVideos} videos processed`);
        }
      });
    }

    await this.queue.onIdle();

    if (this.globalStopRequested) {
      this.log(`Processing halted by stop request`);
    }

    this.log(`All files processed`);
  }

  private async processVideoGroup(
    videoPath: string,
    srtPaths: string[],
    fileIndex: Map<string, Set<string>>,
  ): Promise<void> {
    if (videoPath === 'no_video') {
      for (const srtPath of srtPaths) {
        if (this.globalStopRequested) break;
        await this.processFile(srtPath, undefined, fileIndex);
      }
      return;
    }

    this.emit('video:started', { videoPath, srtPaths });
    this.emit('video:phase_changed', { videoPath, phase: 'extracting' });

    const tempAudioPath = path.join(os.tmpdir(), `subsyncarr_${randomUUID()}.wav`);

    // Use AbortController for extraction
    const extractionController = new AbortController();

    const success = await this.extractor.extract(videoPath, tempAudioPath, extractionController.signal);

    this.emit('video:phase_changed', { videoPath, phase: 'syncing' });

    // Process all files in the group
    for (const srtPath of srtPaths) {
      if (this.globalStopRequested) break;
      await this.processFile(srtPath, success ? tempAudioPath : undefined, fileIndex);
    }

    this.extractor.cleanup(tempAudioPath);

    if (this.stateManager) {
      const runId = this.stateManager.getCurrentRun()?.id;
      if (runId) {
        this.stateManager.incrementCompletedVideos(runId);
      }
    }
    this.emit('video:completed', { videoPath });
  }

  private async processFile(srtPath: string, audioPath?: string, fileIndex?: Map<string, Set<string>>): Promise<void> {
    const fileName = srtPath.split('/').pop();

    if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
      this.log(`Skipped (cancelled): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'cancelled' });
      return;
    }

    this.log(`Processing: ${fileName}`);

    const { videoPath } = findMatchingVideoFile(srtPath, this.currentScanConfig, fileIndex);

    this.emit('file:started', { srtPath, videoPath });

    if (!videoPath) {
      this.log(`No matching video found for: ${fileName}`);
      this.emit('file:no_video', { srtPath });
      return;
    }

    if (audioPath) {
      this.log(`Using shared audio reference for: ${fileName}`);
    } else {
      this.log(`Found video: ${videoPath.split('/').pop()}`);
    }

    const controller = new AbortController();
    this.activeControllers.set(srtPath, controller);

    if (!this.currentScanConfig?.forceRerun && fs.existsSync(getPrimaryOutputPath(srtPath))) {
      this.log(`Skipped (Primary already exists): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'already_synced' });
      this.activeControllers.delete(srtPath);
      return;
    }

    try {
      const videoSeconds = await getVideoDuration(videoPath);
      const timeoutMs = Math.round(videoSeconds * 0.1 + 60) * 1000;
      this.log(`Using adaptive timeout: ${Math.round(timeoutMs / 1000)}s for ${fileName}`);

      let anyEngineSucceeded = false;
      let anyEngineSkipped = false;
      let absoluteBestResult: { score: number | undefined; path: string } | null = null;

      for (const engine of this.enabledEngines) {
        if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
          this.log(`Skipped (cancelled): ${fileName}`);
          this.emit('file:skipped', { srtPath, reason: 'cancelled' });
          return;
        }

        if (!this.currentScanConfig?.forceRerun && this.stateManager?.shouldSkipEngine(srtPath, engine)) {
          this.log(`⊘ Skipping ${engine} (3+ consecutive failures): ${fileName}`);
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
          continue;
        }

        this.emit('file:engine_started', { srtPath, engine });

        const profiles = ENGINE_PROFILES[engine] || [{ name: 'default', args: [] }];
        let bestTrialResult: ProcessingResult | null = null;

        for (const profile of profiles) {
          this.log(`Trial: ${engine} (${profile.name}) for: ${fileName}`);
          const startTime = Date.now();
          const trialOutputPath = getEngineOutputPath(srtPath, engine, profile.name);
          let currentTrialResult: ProcessingResult;

          try {
            switch (engine) {
              case EngineName.FFSUBSYNC:
                currentTrialResult = await generateFfsubsyncSubtitles(
                  srtPath,
                  videoPath,
                  controller.signal,
                  audioPath,
                  timeoutMs,
                  profile,
                );
                break;
              case EngineName.AUTOSUBSYNC:
                currentTrialResult = await generateAutosubsyncSubtitles(
                  srtPath,
                  videoPath,
                  controller.signal,
                  audioPath,
                  timeoutMs,
                );
                break;
              case EngineName.ALASS:
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
              `${status} ${engine} (${profile.name}) trial completed (${(duration / 1000).toFixed(1)}s): ${fileName}`,
            );

            if (currentTrialResult.success) {
              if (
                !bestTrialResult ||
                !bestTrialResult.success ||
                (currentTrialResult.score || 0) > (bestTrialResult.score || 0)
              ) {
                bestTrialResult = { ...currentTrialResult, duration };
              }

              if (!absoluteBestResult || (currentTrialResult.score || 0) > (absoluteBestResult.score || 0)) {
                absoluteBestResult = {
                  score: currentTrialResult.score,
                  path: trialOutputPath,
                };
              }
            }

            if (currentTrialResult.success && (currentTrialResult.score || 0) >= 85) {
              this.log(`Confidence high (${currentTrialResult.score}%). Skipping other profiles.`);
              break;
            }
          } catch (error) {
            const duration = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.log(`✗ ${engine} (${profile.name}) trial failed (${(duration / 1000).toFixed(1)}s): ${fileName}`);
            this.log(`   Error: ${errorMsg}`);

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

      if (this.stateManager) {
        const runId = this.stateManager.getCurrentRun()?.id;
        if (runId) {
          this.stateManager.reconcileFileResults(runId, srtPath);
        }
      }

      if (absoluteBestResult && fs.existsSync(absoluteBestResult.path)) {
        const primaryPath = getPrimaryOutputPath(srtPath);
        fs.copyFileSync(absoluteBestResult.path, primaryPath);

        const scoreVal = absoluteBestResult.score;
        const scoreStr = scoreVal !== undefined ? `${scoreVal}%` : 'N/A';
        const warning = scoreVal !== undefined && scoreVal < 50 ? ' [LOW CONFIDENCE]' : '';
        this.log(
          `Winner determined! Primary file created: ${path.basename(primaryPath)} (Score: ${scoreStr})${warning}`,
        );
      }

      if (anyEngineSucceeded) {
        this.log(`✓ Completed successfully for: ${fileName}`);
        this.emit('file:completed', { srtPath });
      } else if (anyEngineSkipped) {
        this.log(`⊘ All attempts skipped for: ${fileName}`);
        this.emit('file:skipped', { srtPath, reason: 'engine_skipped' });
      } else {
        this.log(`✗ All engines failed for: ${fileName}`);
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
    this.log(`Stop requested - cancelling all remaining files`);
    this.globalStopRequested = true;
    allFiles.forEach((file) => this.cancelledFiles.add(file));

    if (this.queue) {
      this.queue.clear();
    }

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
    if (this.queue) {
      this.queue.clear();
    }
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
    const { srtFiles, fileIndex } = await this.scanner.findAllSrtFiles(scanConfig);

    const results = {
      totalSRTs: srtFiles.length,
      alreadyDone: 0,
      matched: [] as Array<{ srt: string; video: string; reason: string }>,
      missingVideo: [] as Array<{ srt: string; reason: string; details?: string }>,
      permanentFailures: 0,
      estimatedMs: 0,
    };

    const avgEngineDurations = this.enabledEngines.reduce(
      (acc, engine) => {
        acc[engine] = this.stateManager?.getAverageEngineDuration(engine) || 30000;
        return acc;
      },
      {} as Record<string, number>,
    );

    const totalAvgDurationPerFile = Object.values(avgEngineDurations).reduce((a, b) => a + b, 0);

    for (const srtPath of srtFiles) {
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

    const maxConcurrent = appConfig.maxConcurrentSyncTasks;
    results.estimatedMs = results.estimatedMs / maxConcurrent;

    return results;
  }
}
