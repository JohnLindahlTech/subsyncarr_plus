import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ProcessingEngine } from '../processingEngine.js';
import { StateManager } from '../stateManager.js';
import { ScannerService } from '../services/ScannerService.js';
import { AudioExtractor } from '../services/AudioExtractor.js';
import * as fs from 'fs';
import * as helpers from '../helpers.js';
import * as ffsubsyncModule from '../generateFfsubsyncSubtitles.js';
import * as findMatchingVideoFileModule from '../findMatchingVideoFile.js';

// Mock external dependencies
vi.mock('fs');
vi.mock('../helpers.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../helpers.js')>();
  return {
    ...actual,
    getEngineOutputPath: vi.fn(),
    getVideoDuration: vi.fn().mockResolvedValue(1200),
  };
});
vi.mock('../services/ScannerService.js');
vi.mock('../services/AudioExtractor.js');
vi.mock('../generateFfsubsyncSubtitles.js');
vi.mock('../generateAutosubsyncSubtitles.js');
vi.mock('../generateAlassSubtitles.js');
vi.mock('../findMatchingVideoFile.js');

describe('ProcessingEngine', () => {
  let engine: ProcessingEngine;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockScanner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExtractor: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockScanner = new ScannerService() as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExtractor = new AudioExtractor() as any;

    engine = new ProcessingEngine(mockScanner, mockExtractor);

    // Default mocks
    (findMatchingVideoFileModule.findMatchingVideoFile as Mock).mockReturnValue({
      videoPath: '/video/path/movie.mkv',
      reason: 'exact_match',
    });
    (helpers.getEngineOutputPath as Mock).mockImplementation((path: string, engine: string) => `${path}.${engine}.srt`);

    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([['.', new Set(['file1.srt', 'file2.srt'])]]),
    });

    mockExtractor.extract.mockResolvedValue(true);

    (ffsubsyncModule.generateFfsubsyncSubtitles as Mock).mockImplementation(() =>
      Promise.resolve({
        success: true,
        message: 'Done',
        score: 90,
      }),
    );
  });

  it('should categorize files correctly when outputs do not exist (process all)', async () => {
    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([['.', new Set(['file1.srt', 'file2.srt'])]]),
    });

    const filesFoundSpy = vi.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processing: ['file1.srt', 'file2.srt'],
        skipped: [],
      }),
    );
  });

  it('should categorize files correctly when all outputs exist (skip all)', async () => {
    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt'],
      fileIndex: new Map([
        ['.', new Set(['file1.srt', 'file1.ffsubsync.srt', 'file1.autosubsync.srt', 'file1.alass.srt'])],
      ]),
    });

    const filesFoundSpy = vi.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processing: [],
        skipped: [{ isHidden: true, path: 'file1.srt' }],
      }),
    );
  });

  it('should split files correctly (mixed state)', async () => {
    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([
        ['.', new Set(['file1.srt', 'file1.ffsubsync.srt', 'file1.autosubsync.srt', 'file1.alass.srt', 'file2.srt'])],
      ]),
    });

    const filesFoundSpy = vi.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        processing: ['file2.srt'],
        skipped: [{ isHidden: true, path: 'file1.srt' }],
      }),
    );
  });

  it('should stop processing if global stop is requested (p-queue)', async () => {
    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([
        ['/dir1', new Set(['file1.srt'])],
        ['/dir2', new Set(['file2.srt'])],
      ]),
    });

    (ffsubsyncModule.generateFfsubsyncSubtitles as Mock).mockImplementation(async () => {
      engine.stopAllProcessing([]);
      return { success: true };
    });

    await engine.processRun();

    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalled();
  });

  it('should skip an engine if StateManager indicates it should be skipped', async () => {
    (fs.existsSync as Mock).mockReturnValue(false);

    const mockStateManager = {
      shouldSkipEngine: vi.fn().mockReturnValue(true),
      getSkippedEngines: vi.fn().mockReturnValue([]),
      reconcileFileResults: vi.fn(),
      getCurrentRun: vi.fn().mockReturnValue({ id: 'test-run' }),
      incrementCompletedVideos: vi.fn(),
      startExtraction: vi.fn(),
      stopExtraction: vi.fn(),
      setStateManager: vi.fn(),
    };
    engine.setStateManager(mockStateManager as unknown as StateManager);

    const engineCompletedSpy = vi.fn();
    engine.on('file:engine_completed', engineCompletedSpy);

    await engine.processRun();

    expect(engineCompletedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          skipped: true,
          message: 'Skipped due to 3+ consecutive failures',
        }),
      }),
    );

    expect(ffsubsyncModule.generateFfsubsyncSubtitles).not.toHaveBeenCalled();
  });

  it('should process multiple videos in parallel based on maxConcurrent', async () => {
    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt', 'file3.srt'],
      fileIndex: new Map([
        ['/v1', new Set(['file1.srt'])],
        ['/v2', new Set(['file2.srt'])],
        ['/v3', new Set(['file3.srt'])],
      ]),
    });

    (findMatchingVideoFileModule.findMatchingVideoFile as Mock).mockImplementation((srtPath: string) => {
      if (srtPath === 'file1.srt') return { videoPath: '/v1/movie1.mkv', reason: 'exact_match' };
      if (srtPath === 'file2.srt') return { videoPath: '/v2/movie2.mkv', reason: 'exact_match' };
      if (srtPath === 'file3.srt') return { videoPath: '/v3/movie3.mkv', reason: 'exact_match' };
      return { videoPath: null, reason: 'no_videos_found' };
    });

    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    const engineWithQueue = new ProcessingEngine(mockScanner, mockExtractor);

    (ffsubsyncModule.generateFfsubsyncSubtitles as Mock).mockImplementation(async () => {
      activeWorkers++;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 50));
      activeWorkers--;
      return { success: true };
    });

    await engineWithQueue.processRun(undefined, 2);

    expect(maxActiveWorkers).toBeLessThanOrEqual(2);
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalled();
  });
});
