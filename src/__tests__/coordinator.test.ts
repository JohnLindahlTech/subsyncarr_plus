import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessingCoordinator } from '../coordinator.js';
import { ProcessingEngine } from '../processingEngine.js';
import { StateManager } from '../stateManager.js';
import { EventEmitter } from 'events';

// Mock dependencies
class MockEngine extends EventEmitter {
  processRun = vi.fn();
  reset = vi.fn();
  stateManager: StateManager | undefined;
  skipFile = vi.fn();
  stopAllProcessing = vi.fn();
  setStateManager = vi.fn();
}

class MockStateManager extends EventEmitter {
  dbPath = 'test.db';
  getCurrentRun = vi.fn();
  startRun = vi.fn();
  appendLog = vi.fn();
  addFile = vi.fn();
  addFilesBulk = vi.fn();
  updateFileStatus = vi.fn();
  updateFileEngine = vi.fn();
  incrementCompletedEngines = vi.fn();
  incrementCompletedVideos = vi.fn();
  incrementRunCounter = vi.fn();
  incrementRunCountersBulk = vi.fn();
  startExtraction = vi.fn();
  stopExtraction = vi.fn();
  getActiveExtractions = vi.fn().mockReturnValue([]);
  setCurrentVideo = vi.fn();
  updateFilesVideoStatus = vi.fn();
  completeRun = vi.fn();
  getFileResults = vi.fn();
  getFileCount = vi.fn();
  cancelRun = vi.fn();
  getAverageEngineDuration = vi.fn().mockReturnValue(30000);
  reconcileFileResults = vi.fn();
  isMaintenanceMode = vi.fn().mockReturnValue(false);
}

vi.mock('../findMatchingVideoFile', () => ({
  findMatchingVideoFile: vi.fn().mockReturnValue({ videoPath: '/video/movie.mkv', reason: 'exact_match' }),
}));

describe('ProcessingCoordinator', () => {
  let coordinator: ProcessingCoordinator;
  let mockEngine: MockEngine;
  let mockStateManager: MockStateManager;

  beforeEach(() => {
    mockEngine = new MockEngine();
    mockStateManager = new MockStateManager();
    coordinator = new ProcessingCoordinator(
      mockEngine as unknown as ProcessingEngine,
      mockStateManager as unknown as StateManager,
    );
  });

  it('should wait for run to start before returning run ID', async () => {
    const runId = 'test-run-id';
    const runObject = { id: runId };

    // Mock processRun to simulate delay in finding files
    mockEngine.processRun.mockImplementation(async () => {
      // Simulate delay > 100ms (the old timeout)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Simulate finding files
      mockEngine.emit('run:files_found', {
        processing: ['file1.srt'],
        skipped: [],
        totalCount: 1,
        config: {},
      });

      // Keep running for a bit
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // When startRun is called by coordinator (triggered by run:files_found),
    // it should return the ID and emit run:started
    mockStateManager.startRun.mockImplementation(() => {
      // Simulate what real StateManager does
      // Important: real StateManager emits run:started synchronously inside startRun
      mockStateManager.emit('run:started', runObject);
      return runId;
    });

    // Mock getCurrentRun to return null initially (if called before startRun)
    mockStateManager.getCurrentRun.mockReturnValue(null);

    // However, after run starts, getCurrentRun should probably return something if called?
    // The coordinator's new logic uses runStartedPromise result directly,
    // but the old logic (and potentially the "process finished" path) uses getCurrentRun.
    // Let's make getCurrentRun return runObject if startRun has been called.
    mockStateManager.startRun.mockImplementation(() => {
      mockStateManager.getCurrentRun.mockReturnValue(runObject);
      mockStateManager.emit('run:started', runObject);
      return runId;
    });

    const resultPromise = coordinator.startRun();

    // It should eventually resolve with runId
    const result = await resultPromise;
    expect(result).toBe(runId);

    // Wait for the process to fully complete to avoid Jest warning about logging after test completion
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should queue a stop request if stopRun is called during scan', async () => {
    const runId = 'queued-run-id';
    const runObject = { id: runId };

    mockEngine.processRun.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      mockEngine.emit('run:files_found', {
        processing: ['file1.srt'],
        skipped: [],
        totalCount: 1,
        config: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    mockStateManager.startRun.mockImplementation(() => {
      mockStateManager.emit('run:started', runObject);
      mockStateManager.getCurrentRun.mockReturnValue(runObject);
      return runId;
    });

    mockStateManager.getFileResults.mockReturnValue([{ file_path: 'file1.srt' }]);

    const startPromise = coordinator.startRun();

    // Call stop while it's still "scanning"
    coordinator.stopRun();

    await expect(startPromise).rejects.toThrow('Run was stopped during initialization');

    expect(mockEngine.stopAllProcessing).toHaveBeenCalledWith([]);
    expect(mockStateManager.cancelRun).toHaveBeenCalledWith(runId);

    // Wait for the process to fully complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should stop an active run when stopRun is called after scan', async () => {
    const runId = 'active-run-id';
    const runObject = { id: runId };

    mockEngine.processRun.mockImplementation(async () => {
      mockEngine.emit('run:files_found', {
        processing: ['file1.srt'],
        skipped: [],
        totalCount: 1,
        config: {},
      });
      // Keep running to simulate active processing
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    mockStateManager.startRun.mockImplementation(() => {
      mockStateManager.emit('run:started', runObject);
      mockStateManager.getCurrentRun.mockReturnValue(runObject);
      return runId;
    });

    mockStateManager.getFileResults.mockReturnValue([{ file_path: 'file1.srt' }]);

    const startPromise = coordinator.startRun();
    const resolvedRunId = await startPromise;
    expect(resolvedRunId).toBe(runId);

    // Now stop the run while it's "processing"
    coordinator.stopRun();

    expect(mockEngine.stopAllProcessing).toHaveBeenCalledWith([]);
    expect(mockStateManager.cancelRun).toHaveBeenCalledWith(runId);

    // Wait for the process to fully complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('should handle process failure before run starts', async () => {
    mockEngine.processRun.mockImplementation(async () => {
      throw new Error('Scan failed');
    });

    await expect(coordinator.startRun()).rejects.toThrow('Scan failed');

    // Wait for the process to fully complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
