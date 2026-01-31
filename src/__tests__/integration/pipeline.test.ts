import { describe, it, expect, vi } from 'vitest';
import { ProcessingCoordinator } from '../../coordinator.js';
import { ProcessingEngine } from '../../processingEngine.js';
import { StateManager } from '../../stateManager.js';
import { RunStatus, FileStatus, AgreementStatus } from '../../types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';

// Mock child_process.execFile to simulate external engines
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

describe('Pipeline Integration', () => {
  it('should run the full pipeline successfully', async () => {
    // --- SETUP ---
    // Create a truly unique and resolved temp directory for this specific test
    const systemTempBase = fs.realpathSync(os.tmpdir());
    const tempDir = fs.mkdtempSync(path.join(systemTempBase, 'subsyncarr-pipe-test-'));

    const movieDir = path.join(tempDir, 'Movies', 'The Matrix (1999)');
    fs.mkdirSync(movieDir, { recursive: true });

    fs.writeFileSync(path.join(movieDir, 'matrix.srt'), 'dummy subtitle content');
    fs.writeFileSync(path.join(movieDir, 'matrix.mkv'), 'dummy video content');

    const dbPath = path.join(tempDir, 'test.db');

    // Set environment variables for config (scoped to this process)
    process.env.SCAN_PATHS = tempDir;
    process.env.INCLUDE_ENGINES = 'ffsubsync';
    process.env.DB_PATH = dbPath;
    process.env.LOG_LEVEL = 'silent';

    const stateManager = new StateManager(dbPath);
    const engine = new ProcessingEngine();
    const coordinator = new ProcessingCoordinator(engine, stateManager);

    // Mock execFile behavior to simulate external tools
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (execFile as any).mockImplementation(
      (
        file: string,
        args: string[],
        _options: unknown,
        callback: (error: unknown, stdout: string, stderr: string) => void,
      ) => {
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

    try {
      // --- EXECUTION ---
      const config = {
        includePaths: [tempDir],
        excludePaths: [],
        enableContextAwareMatching: true,
        forceRerun: true,
      };

      const runId = await coordinator.startRun(config);
      expect(runId).toBeDefined();

      // Wait for the 'run:completed' event which signals the end of the processing pipeline
      await new Promise<void>((resolve, reject) => {
        stateManager.on('run:completed', () => resolve());
        stateManager.on('run:cancelled', () => reject(new Error('Run was cancelled')));
        setTimeout(() => reject(new Error('Test timed out waiting for run completion')), 5000);
      });

      // --- VERIFICATION ---
      const history = stateManager.getRunHistory(1);
      const completedRun = history[0];

      expect(completedRun.status).toBe(RunStatus.COMPLETED);
      expect(completedRun.total_files).toBe(1);
      expect(completedRun.completed).toBe(1);

      const files = stateManager.getFileResults(completedRun.id);
      expect(files.length).toBe(1);
      expect(files[0].status).toBe(FileStatus.COMPLETED);
      expect(files[0].best_engine).toBe('ffsubsync');
      expect(files[0].best_score).toBe(95);
      expect(files[0].agreement_status).toBe(AgreementStatus.VERIFIED);

      const srtDir = path.join(tempDir, 'Movies', 'The Matrix (1999)');
      const expectedOutput = path.join(srtDir, 'matrix.synced.srt');
      expect(fs.existsSync(expectedOutput)).toBe(true);
    } finally {
      // --- CLEANUP ---
      stateManager.close();
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
          // Ignore cleanup errors (e.g. file locks)
        }
      }
      vi.clearAllMocks();
    }
  }, 10000);
});
