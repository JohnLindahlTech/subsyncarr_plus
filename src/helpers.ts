import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface ProcessingResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  command?: string;
  isPermanent?: boolean;
  score?: number; // 0-100 confidence score
  duration?: number;
}

export interface EngineProfile {
  name: string;
  args: string[];
}

export const ENGINE_PROFILES: Record<string, EngineProfile[]> = {
  ffsubsync: [
    { name: 'default', args: [] },
    { name: 'deep_search', args: ['--max-offset-seconds', '300'] },
    { name: 'vlc_mode', args: ['--vlc-mode'] },
  ],
  autosubsync: [{ name: 'default', args: [] }],
  alass: [
    { name: 'default', args: [] },
    { name: 'aggressive', args: ['--split-penalty', '10'] },
  ],
};

/**
 * Check if a system dependency is installed and working
 */
export async function checkDependency(
  command: string,
  args: string[] = ['--version'],
): Promise<{ name: string; found: boolean; version?: string; error?: string }> {
  try {
    const { stdout, stderr } = await execPromise(`${command} ${args.join(' ')}`, 5000);
    const output = stdout.trim() || stderr.trim();
    return {
      name: command,
      found: true,
      version: output.split('\n')[0].trim(),
    };
  } catch (error) {
    // Fallback: try --help just to check existence if --version failed
    if (args.includes('--version')) {
      try {
        await execPromise(`${command} --help`, 5000);
        return {
          name: command,
          found: true,
          version: 'Detected (version unknown)',
        };
      } catch (e) {
        // Ignore fallback error
      }
    }

    return {
      name: command,
      found: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get video duration in seconds using ffprobe
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
  try {
    const { stdout } = await execPromise(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      5000,
    );
    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error(`Error getting duration for ${videoPath}:`, error);
    return 0;
  }
}

export async function execPromise(
  command: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> {
  // Read from env var with default of 30 minutes (1800000ms)
  const defaultTimeout = process.env.SYNC_ENGINE_TIMEOUT_MS
    ? parseInt(process.env.SYNC_ENGINE_TIMEOUT_MS, 10)
    : 1800000;

  const timeout = timeoutMs ?? defaultTimeout;

  return new Promise((resolve, reject) => {
    const child = exec(command, { timeout, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        // Attach stdout/stderr to error for debugging
        const err = error as Error & { stdout?: string; stderr?: string };
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      } else {
        resolve({ stdout, stderr });
      }
    });

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          child.kill('SIGTERM'); // Try graceful kill first
          // Force kill if it doesn't exit quickly?
          // For simplicity, we rely on SIGTERM. ffmpeg usually handles it.
          const err = new Error('Aborted') as Error & { stdout?: string; stderr?: string };
          err.stdout = '';
          err.stderr = 'Process aborted by user';
          reject(err);
        },
        { once: true },
      );
    }
  });
}

export const getEngineOutputPath = (srtPath: string, engine: string, profile: string = 'default'): string => {
  const parts = srtPath.split('/');
  const fileName = parts.pop()!;
  const dir = parts.join('/');
  const baseName = fileName.replace(/\.srt$/i, '');
  const profileSuffix = profile === 'default' ? '' : `.${profile}`;
  return `${dir}/${baseName}.${engine}${profileSuffix}.srt`;
};

export const getPrimaryOutputPath = (srtPath: string): string => {
  const parts = srtPath.split('/');
  const fileName = parts.pop()!;
  const dir = parts.join('/');
  const baseName = fileName.replace(/\.srt$/i, '');
  return `${dir}/${baseName}.synced.srt`;
};

/**
 * Validates that a requested path is safe and contained within the allowed library roots.
 * Prevents directory traversal attacks.
 */
export function validatePartialPath(requestedPath: string, allowedRoots: string[]): string {
  // 1. Normalize and resolve the path to handle ../ or ./
  const normalizedPath = path.resolve(requestedPath);

  // 2. Check if the path exists
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Requested path does not exist: ${requestedPath}`);
  }

  // 3. Resolve actual path (handles symlinks)
  const realPath = fs.realpathSync(normalizedPath);

  // 4. Verify it's inside one of our library roots
  const isAuthorized = allowedRoots.some((root) => {
    const normalizedRoot = path.resolve(root);
    const realRoot = fs.realpathSync(normalizedRoot);
    return realPath.startsWith(realRoot);
  });

  if (!isAuthorized) {
    throw new Error('Access Denied: Path is outside of configured library roots.');
  }

  return realPath;
}

export const extractAudio = async (videoPath: string, outputPath: string, signal?: AbortSignal): Promise<void> => {
  // Extract audio: mono, 16kHz (common denominator for most engines)
  const command = `ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 "${outputPath}"`;
  await execPromise(command, undefined, signal);
};
