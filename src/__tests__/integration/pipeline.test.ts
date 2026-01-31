import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { ProcessingCoordinator } from '../../coordinator.js';
import { ProcessingEngine } from '../../processingEngine.js';
import { StateManager } from '../../stateManager.js';
import { RunStatus, FileStatus, AgreementStatus } from '../../types.js';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

// Mock child_process.execFile to simulate external engines
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('Pipeline Integration', () => {
  let tempDir: string;
  let dbPath: string;
  let stateManager: StateManager;
  let engine: ProcessingEngine;
  let coordinator: ProcessingCoordinator;
  const baseTemp = path.resolve('./.test-tmp');

  beforeAll(() => {
    if (fs.existsSync(baseTemp)) {
      fs.rmSync(baseTemp, { recursive: true, force: true });
    }
    fs.mkdirSync(baseTemp, { recursive: true });
  });

  beforeEach(() => {
    // Setup temp directory structure
    tempDir = fs.mkdtempSync(path.join(baseTemp, 'pipe-'));

    const movieDir = path.join(tempDir, 'Movies', 'The Matrix (1999)');
    fs.mkdirSync(movieDir, { recursive: true });

    // Create dummy files
    fs.writeFileSync(path.join(movieDir, 'matrix.srt'), 'dummy subtitle content');
    fs.writeFileSync(path.join(movieDir, 'matrix.mkv'), 'dummy video content');

    // Ensure logs dir exists
    fs.mkdirSync(path.join(tempDir, 'logs'), { recursive: true });

    dbPath = path.join(tempDir, 'test.db');

    process.env.SCAN_PATHS = tempDir;
    process.env.INCLUDE_ENGINES = 'ffsubsync';
    process.env.DB_PATH = dbPath;
    process.env.LOG_LEVEL = 'debug';

    stateManager = new StateManager(dbPath);
    engine = new ProcessingEngine();
    coordinator = new ProcessingCoordinator(engine, stateManager);

    // Mock execFile behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (execFile as any).mockImplementation(
      (
        file: string,
        args: string[],
        _options: unknown,
        callback: (error: unknown, stdout: string, stderr: string) => void,
      ) => {
        // Use process.nextTick to simulate async behavior properly
        process.nextTick(() => {
          if (file === 'ffprobe') {
            callback(null, '1200\n', '');
          } else if (file === 'ffmpeg') {
            const outputPath = args[args.length - 1];
            fs.writeFileSync(outputPath, 'dummy extracted audio');
            callback(null, '', '');
          } else if (file === 'ffsubsync') {
            const outIdx = args.indexOf('-o');
            if (outIdx !== -1 && args[outIdx + 1]) {
              fs.writeFileSync(args[outIdx + 1], 'synced content');
            }
            callback(null, 'fit score: 0.95', '');
          } else {
            callback(null, '', '');
          }
        });
      },
    );
  });
  afterEach(() => {
    stateManager.close();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  it('should run the full pipeline successfully', async () => {
    const config = {
      includePaths: [tempDir],
      excludePaths: [],
      enableContextAwareMatching: true,
      forceRerun: true, // Use forceRerun to simplify
    };

    // 1. Start the run
    const runId = await coordinator.startRun(config);
    expect(runId).toBeDefined();

    // 2. Wait for completion
    await new Promise<void>((resolve, reject) => {
      stateManager.on('run:completed', () => resolve());
      stateManager.on('run:cancelled', () => reject(new Error('Run was cancelled')));

      setTimeout(() => {
        const history = stateManager.getRunHistory(1);
        reject(new Error(`Test timed out. Last run state: ${JSON.stringify(history[0])}`));
      }, 5000);
    });

    // 3. Verify Database State
    const history = stateManager.getRunHistory(1);
    const completedRun = history[0];

    expect(completedRun.status).toBe(RunStatus.COMPLETED);
    expect(completedRun.total_files).toBe(1);
    expect(completedRun.completed).toBe(1);

    // 4. Verify File Results
    const files = stateManager.getFileResults(completedRun.id);
    expect(files.length).toBe(1);
    expect(files[0].status).toBe(FileStatus.COMPLETED);
    expect(files[0].best_engine).toBe('ffsubsync');
    expect(files[0].best_score).toBe(95);
    expect(files[0].agreement_status).toBe(AgreementStatus.VERIFIED);

    // 5. Verify Output Files
    const srtDir = path.join(tempDir, 'Movies', 'The Matrix (1999)');
    const expectedOutput = path.join(srtDir, 'matrix.synced.srt');

    expect(fs.existsSync(expectedOutput)).toBe(true);
  }, 15000);
});
