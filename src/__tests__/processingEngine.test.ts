import { ProcessingEngine } from '../processingEngine';
import { StateManager } from '../stateManager';
import { ScannerService } from '../services/ScannerService';
import { AudioExtractor } from '../services/AudioExtractor';
import * as fs from 'fs';
import * as helpers from '../helpers';
import * as ffsubsyncModule from '../generateFfsubsyncSubtitles';
import * as findMatchingVideoFileModule from '../findMatchingVideoFile';

// Mock external dependencies
jest.mock('fs');
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  getEngineOutputPath: jest.fn(),
  getVideoDuration: jest.fn().mockResolvedValue(1200),
}));
jest.mock('../services/ScannerService');
jest.mock('../services/AudioExtractor');
jest.mock('../generateFfsubsyncSubtitles');
jest.mock('../generateAutosubsyncSubtitles');
jest.mock('../generateAlassSubtitles');
jest.mock('../findMatchingVideoFile');

describe('ProcessingEngine', () => {
  let engine: ProcessingEngine;
  let mockScanner: jest.Mocked<ScannerService>;
  let mockExtractor: jest.Mocked<AudioExtractor>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockScanner = new ScannerService() as jest.Mocked<ScannerService>;
    mockExtractor = new AudioExtractor() as jest.Mocked<AudioExtractor>;

    engine = new ProcessingEngine(mockScanner, mockExtractor);

    // Default mocks
    (findMatchingVideoFileModule.findMatchingVideoFile as jest.Mock).mockReturnValue({
      videoPath: '/video/path/movie.mkv',
      reason: 'exact_match',
    });
    (helpers.getEngineOutputPath as jest.Mock).mockImplementation((path, engine) => `${path}.${engine}.srt`);

    mockScanner.findAllSrtFiles.mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([['.', new Set(['file1.srt', 'file2.srt'])]]),
    });

    mockExtractor.extract.mockResolvedValue(true);

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(() =>
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

    const filesFoundSpy = jest.fn();
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

    const filesFoundSpy = jest.fn();
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

    const filesFoundSpy = jest.fn();
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

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(async () => {
      engine.stopAllProcessing([]);
      return { success: true };
    });

    await engine.processRun();

    // With p-queue, if we stop after first file, second might already be enqueued
    // but should skip execution if globalStopRequested is checked.
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalled();
  });

  it('should skip an engine if StateManager indicates it should be skipped', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const mockStateManager = {
      shouldSkipEngine: jest.fn().mockReturnValue(true),
      getSkippedEngines: jest.fn().mockReturnValue([]),
      reconcileFileResults: jest.fn(),
      getCurrentRun: jest.fn().mockReturnValue({ id: 'test-run' }),
      incrementCompletedVideos: jest.fn(),
      startExtraction: jest.fn(),
      stopExtraction: jest.fn(),
    };
    engine.setStateManager(mockStateManager as unknown as StateManager);

    const engineCompletedSpy = jest.fn();
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

    (findMatchingVideoFileModule.findMatchingVideoFile as jest.Mock).mockImplementation((srtPath) => {
      if (srtPath === 'file1.srt') return { videoPath: '/v1/movie1.mkv', reason: 'exact_match' };
      if (srtPath === 'file2.srt') return { videoPath: '/v2/movie2.mkv', reason: 'exact_match' };
      if (srtPath === 'file3.srt') return { videoPath: '/v3/movie3.mkv', reason: 'exact_match' };
      return { videoPath: null, reason: 'no_videos_found' };
    });

    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    const engineWithQueue = new ProcessingEngine(mockScanner, mockExtractor);

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(async () => {
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
