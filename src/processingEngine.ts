import EventEmitter from 'events';
import { ScanConfig, getScanConfig } from './config';
import { findAllSrtFiles } from './findAllSrtFiles';
import { findMatchingVideoFile } from './findMatchingVideoFile';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles';
import { generateAlassSubtitles } from './generateAlassSubtitles';
import { StateManager } from './stateManager';
import { getEngineOutputPath, extractAudio } from './helpers';
import { existsSync, unlinkSync } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as os from 'os';

export class ProcessingEngine extends EventEmitter {
  private cancelledFiles: Set<string> = new Set();
  private activeControllers: Map<string, AbortController> = new Map();
  private globalStopRequested: boolean = false;
  private maxConcurrent: number;
  private enabledEngines: string[];
  private logBuffer: string[] = [];
  private maxLogBufferSize: number;
  public stateManager?: StateManager;
  private currentScanConfig?: ScanConfig;

  constructor() {
    super();
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_SYNC_TASKS || '1', 10);
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

  async processRun(config?: ScanConfig): Promise<void> {
    const scanConfig = config || getScanConfig();
    this.currentScanConfig = scanConfig;
    this.emit('run:init_progress', 'Scanning directories...');
    this.log(`[${new Date().toISOString()}] Scanning for subtitle files...`);
    this.log(`[${new Date().toISOString()}] Scan paths: ${JSON.stringify(scanConfig.includePaths)}`);

    const srtFiles = await findAllSrtFiles(scanConfig);
    this.log(`[${new Date().toISOString()}] Found ${srtFiles.length} subtitle files`);

    // Bulk Pre-Check: Filter out files that are already done
    const filesToProcess: string[] = [];
    const filesToSkip: string[] = [];

    this.emit('run:init_progress', `Checking ${srtFiles.length} files for existing subtitles...`);
    this.log(`[${new Date().toISOString()}] Checking for existing subtitles...`);

    for (const srtPath of srtFiles) {
      let allEnginesDone = true;
      for (const engine of this.enabledEngines) {
        const outputPath = getEngineOutputPath(srtPath, engine);
        if (!existsSync(outputPath)) {
          allEnginesDone = false;
          break;
        }
      }

      if (allEnginesDone) {
        filesToSkip.push(srtPath);
      } else {
        filesToProcess.push(srtPath);
      }
    }

    this.log(
      `[${new Date().toISOString()}] Pre-check results: ${filesToProcess.length} to process, ${filesToSkip.length} already done`,
    );

    // Emit the split results so Coordinator can bulk-insert
    this.emit('run:files_found', {
      processing: filesToProcess,
      skipped: filesToSkip,
      totalCount: srtFiles.length,
      config: scanConfig,
    });

    // Group files by video path
    const groups = new Map<string, string[]>();
    for (const srtPath of filesToProcess) {
      const videoPath = findMatchingVideoFile(srtPath, scanConfig);
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

    const groupList = Array.from(groups.entries());

    // Process in batches of VIDEOS
    this.log(`[${new Date().toISOString()}] Processing with concurrency: ${this.maxConcurrent} videos`);
    this.log(`[${new Date().toISOString()}] Enabled engines: ${this.enabledEngines.join(', ')}`);

    for (let i = 0; i < groupList.length; i += this.maxConcurrent) {
      if (this.globalStopRequested) {
        this.log(`[${new Date().toISOString()}] Stop requested - stopping batch processing`);
        break;
      }
      const batch = groupList.slice(i, i + this.maxConcurrent);
      this.log(
        `[${new Date().toISOString()}] Processing batch ${Math.floor(i / this.maxConcurrent) + 1}/${Math.ceil(groupList.length / this.maxConcurrent)} (${batch.length} videos)`,
      );
      await Promise.all(batch.map(([videoPath, srtPaths]) => this.processVideoGroup(videoPath, srtPaths)));
    }

    this.log(`[${new Date().toISOString()}] All files processed`);
  }

  private async processVideoGroup(videoPath: string, srtPaths: string[]): Promise<void> {
    if (videoPath === 'no_video') {
      for (const srtPath of srtPaths) {
        await this.processFile(srtPath);
      }
      return;
    }

    this.emit('video:started', { videoPath, srtPaths });

    const tempAudioPath = path.join(os.tmpdir(), `subsyncarr_${randomUUID()}.wav`);
    let audioExtracted = false;

    try {
      // Extract audio once for the entire group
      this.log(`[${new Date().toISOString()}] Extracting audio for group: ${path.basename(videoPath)}`);

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
      }

      // Process all files in the group (sequentially within group to avoid CPU overload)
      for (const srtPath of srtPaths) {
        if (this.globalStopRequested) break;
        await this.processFile(srtPath, audioExtracted ? tempAudioPath : undefined);
      }
    } finally {
      if (audioExtracted && existsSync(tempAudioPath)) {
        try {
          unlinkSync(tempAudioPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      this.emit('video:completed', { videoPath });
    }
  }

  private async processFile(srtPath: string, audioPath?: string): Promise<void> {
    const fileName = srtPath.split('/').pop();

    // Check if stopped or cancelled
    if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
      this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
      this.emit('file:skipped', { srtPath, reason: 'cancelled' });
      return;
    }

    this.log(`[${new Date().toISOString()}] Processing: ${fileName}`);

    const videoPath = findMatchingVideoFile(srtPath, this.currentScanConfig);

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

    try {
      // Process with each enabled engine
      let anyEngineSucceeded = false;
      let anyEngineSkipped = false;
      for (const engine of this.enabledEngines) {
        // Check cancellation before each engine
        if (this.globalStopRequested || this.cancelledFiles.has(srtPath)) {
          this.log(`[${new Date().toISOString()}] Skipped (cancelled): ${fileName}`);
          this.emit('file:skipped', { srtPath, reason: 'cancelled' });
          return;
        }

        // Check if engine should be skipped due to consecutive failures
        if (this.stateManager?.shouldSkipEngine(srtPath, engine)) {
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

        this.log(`[${new Date().toISOString()}] Starting ${engine} for: ${fileName}`);
        this.emit('file:engine_started', { srtPath, engine });

        const startTime = Date.now();
        let result;

        try {
          switch (engine) {
            case 'ffsubsync':
              result = await generateFfsubsyncSubtitles(srtPath, videoPath, controller.signal, audioPath);
              break;
            case 'autosubsync':
              result = await generateAutosubsyncSubtitles(srtPath, videoPath, controller.signal, audioPath);
              break;
            case 'alass':
              result = await generateAlassSubtitles(srtPath, videoPath, controller.signal, audioPath);
              break;
            default:
              continue;
          }

          const duration = Date.now() - startTime;
          const status = result.success ? '✓' : '✗';
          this.log(
            `[${new Date().toISOString()}] ${status} ${engine} completed (${(duration / 1000).toFixed(1)}s): ${fileName}`,
          );
          if (!result.success) {
            this.log(`[${new Date().toISOString()}]   Error: ${result.message}`);
            // Log stderr if available for debugging
            if (result.stderr) {
              this.log(`[${new Date().toISOString()}]   Stderr: ${result.stderr.substring(0, 500)}`);
            }
          }

          if (result.success) {
            anyEngineSucceeded = true;
          }

          this.emit('file:engine_completed', {
            srtPath,
            engine,
            result: { ...result, duration },
          });
        } catch (error) {
          const duration = Date.now() - startTime;
          this.log(`[${new Date().toISOString()}] ✗ ${engine} failed (${(duration / 1000).toFixed(1)}s): ${fileName}`);
          this.log(`[${new Date().toISOString()}]   Error: ${error instanceof Error ? error.message : String(error)}`);

          this.emit('file:engine_completed', {
            srtPath,
            engine,
            result: {
              success: false,
              message: error instanceof Error ? error.message : String(error),
              duration,
            },
          });
        }
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
}
