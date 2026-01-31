import { ProcessingEngine } from '../processingEngine';
import { StateManager } from '../stateManager';
import * as fs from 'fs';
import * as helpers from '../helpers';
import * as findAllSrtFilesModule from '../findAllSrtFiles';
import * as ffsubsyncModule from '../generateFfsubsyncSubtitles';

import * as findMatchingVideoFileModule from '../findMatchingVideoFile';

// Mock external dependencies
jest.mock('fs');
jest.mock('../helpers', () => ({
  ...jest.requireActual('../helpers'),
  getEngineOutputPath: jest.fn(),
  getVideoDuration: jest.fn().mockResolvedValue(1200),
  extractAudio: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../findAllSrtFiles');
jest.mock('../generateFfsubsyncSubtitles');
jest.mock('../generateAutosubsyncSubtitles');
jest.mock('../generateAlassSubtitles');
jest.mock('../findMatchingVideoFile');

describe('ProcessingEngine', () => {
  let engine: ProcessingEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new ProcessingEngine();

    // Default mocks
    (findMatchingVideoFileModule.findMatchingVideoFile as jest.Mock).mockReturnValue({
      videoPath: '/video/path/movie.mkv',
      reason: 'exact_match',
    });
    (helpers.getEngineOutputPath as jest.Mock).mockImplementation((path, engine) => `${path}.${engine}.srt`);
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([['.', new Set(['file1.srt', 'file2.srt'])]]),
    });

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        success: true,
        message: 'Done',
        score: 90,
      }),
    );
  });

  it('should categorize files correctly when outputs do not exist (process all)', async () => {
    // Setup: No output files exist in the index
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
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
    // Setup: All output files exist in the index
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
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
    // Setup: file1 has all outputs, file2 has none
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
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

  it('should stop processing if global stop is requested (Worker Pool)', async () => {
    // Setup: 2 files in different videos so they are in separate pool items
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt'],
      fileIndex: new Map([
        ['/dir1', new Set(['file1.srt'])],
        ['/dir2', new Set(['file2.srt'])],
      ]),
    });

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(async () => {
      engine.stopAllProcessing([]); // Trigger stop during first file
      return { success: true };
    });

    await engine.processRun();

    // Verify that the second video was never started because the pool saw the stop flag
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalledTimes(3);
  });

  it('should skip an engine if StateManager indicates it should be skipped', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // Inject a mock stateManager into the engine
    const mockStateManager = {
      shouldSkipEngine: jest.fn().mockReturnValue(true), // Always skip
      getSkippedEngines: jest.fn().mockReturnValue([]),
      reconcileFileResults: jest.fn(),
      getCurrentRun: jest.fn().mockReturnValue({ id: 'test-run' }),
      incrementCompletedVideos: jest.fn(),
      startExtraction: jest.fn(),
      stopExtraction: jest.fn(),
    };
    engine.stateManager = mockStateManager as unknown as StateManager;

    const engineCompletedSpy = jest.fn();
    engine.on('file:engine_completed', engineCompletedSpy);

    await engine.processRun();

    // Verify that the engine was skipped
    expect(engineCompletedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          skipped: true,
          message: 'Skipped due to 3+ consecutive failures',
        }),
      }),
    );

    // Verify the engine was NOT actually called
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).not.toHaveBeenCalled();
  });

  it('should process multiple videos in parallel based on maxConcurrent', async () => {
    // Setup: 3 files in different directories (so 3 different videos)
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue({
      srtFiles: ['file1.srt', 'file2.srt', 'file3.srt'],
      fileIndex: new Map([
        ['/v1', new Set(['file1.srt'])],
        ['/v2', new Set(['file2.srt'])],
        ['/v3', new Set(['file3.srt'])],
      ]),
    });

    // Mock each file having its own unique video path
    (findMatchingVideoFileModule.findMatchingVideoFile as jest.Mock).mockImplementation((srtPath) => {
      if (srtPath === 'file1.srt') return { videoPath: '/v1/movie1.mkv', reason: 'exact_match' };
      if (srtPath === 'file2.srt') return { videoPath: '/v2/movie2.mkv', reason: 'exact_match' };
      if (srtPath === 'file3.srt') return { videoPath: '/v3/movie3.mkv', reason: 'exact_match' };
      return { videoPath: null, reason: 'no_videos_found' };
    });

    let activeWorkers = 0;
    let maxActiveWorkers = 0;

    // Simplify to only 1 engine to make concurrency tracking clear
    process.env.INCLUDE_ENGINES = 'ffsubsync';
    const engineWithPool = new ProcessingEngine();

    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(async () => {
      activeWorkers++;
      maxActiveWorkers = Math.max(maxActiveWorkers, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 50)); // Hold slot
      activeWorkers--;
      return { success: true };
    });

    // Pass override directly to processRun
    await engineWithPool.processRun(undefined, 2);

    // Verify that at some point we had 2 active workers, but never 3
    expect(maxActiveWorkers).toBe(2);
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalledTimes(9);
  });
});
