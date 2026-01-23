import { ProcessingEngine } from '../processingEngine';
import * as fs from 'fs';
import * as helpers from '../helpers';
import * as findAllSrtFilesModule from '../findAllSrtFiles';
import * as ffsubsyncModule from '../generateFfsubsyncSubtitles';

// Mock external dependencies
jest.mock('fs');
jest.mock('../helpers');
jest.mock('../findAllSrtFiles');
jest.mock('../generateFfsubsyncSubtitles');
jest.mock('../generateAutosubsyncSubtitles');
jest.mock('../generateAlassSubtitles');
jest.mock('../findMatchingVideoFile', () => ({
  findMatchingVideoFile: jest.fn().mockReturnValue('/video/path/movie.mkv'),
}));

describe('ProcessingEngine', () => {
  let engine: ProcessingEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new ProcessingEngine();

    // Default mocks
    (helpers.getEngineOutputPath as jest.Mock).mockImplementation((path, engine) => `${path}.${engine}.srt`);
    (findAllSrtFilesModule.findAllSrtFiles as jest.Mock).mockResolvedValue(['file1.srt', 'file2.srt']);
    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockResolvedValue({ success: true, message: 'Done' });
  });

  it('should categorize files correctly when outputs do not exist (process all)', async () => {
    // Setup: No output files exist
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const filesFoundSpy = jest.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith({
      processing: ['file1.srt', 'file2.srt'],
      skipped: [],
      totalCount: 2,
    });
  });

  it('should categorize files correctly when all outputs exist (skip all)', async () => {
    // Setup: All output files exist
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    const filesFoundSpy = jest.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith({
      processing: [],
      skipped: ['file1.srt', 'file2.srt'],
      totalCount: 2,
    });
  });

  it('should split files correctly (mixed state)', async () => {
    // Setup: file1 exists, file2 missing
    (fs.existsSync as jest.Mock).mockImplementation((path: string) => {
      return path.includes('file1');
    });

    const filesFoundSpy = jest.fn();
    engine.on('run:files_found', filesFoundSpy);

    await engine.processRun();

    expect(filesFoundSpy).toHaveBeenCalledWith({
      processing: ['file2.srt'],
      skipped: ['file1.srt'],
      totalCount: 2,
    });
  });

  it('should stop batch processing if global stop is requested', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    // Mock processing to be slow so we can stop it
    (ffsubsyncModule.generateFfsubsyncSubtitles as jest.Mock).mockImplementation(async () => {
      engine.stopAllProcessing([]); // Trigger stop during first file
      return { success: true };
    });

    // We expect it to process the first batch but then stop.
    // Since concurrency is 1 by default (or set in constructor), it might stop after file1.
    // Let's force concurrency 1 for test safety if possible, but the default is 1.

    await engine.processRun();

    // Verify stopped state handling
    // We can't easily check internal state, but we can check if file2 was processed.
    // If stop works, file2 (in second batch) should NOT be touched.
    // Wait, processRun loop checks globalStopRequested at start of batch.

    // With 2 files and concurrency 1:
    // Batch 1: file1. Processing... triggers stop.
    // Loop continues to Batch 2.
    // Batch 2 check: globalStopRequested is true. Break.

    // So generateFfsubsyncSubtitles should be called 1 time only.
    expect(ffsubsyncModule.generateFfsubsyncSubtitles).toHaveBeenCalledTimes(1);
  });
});
