import { exec } from 'child_process';

export interface ProcessingResult {
  success: boolean;
  message: string;
  stdout?: string;
  stderr?: string;
  skipped?: boolean;
  isPermanent?: boolean;
}

export const execPromise = (
  command: string,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string }> => {
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
};

export const getEngineOutputPath = (srtPath: string, engine: string): string => {
  const parts = srtPath.split('/');
  const fileName = parts.pop()!;
  const dir = parts.join('/');
  const baseName = fileName.replace(/\.srt$/i, '');
  return `${dir}/${baseName}.${engine}.srt`;
};

export const extractAudio = async (videoPath: string, outputPath: string, signal?: AbortSignal): Promise<void> => {
  // Extract audio: mono, 16kHz (common denominator for most engines)
  const command = `ffmpeg -y -i "${videoPath}" -vn -ac 1 -ar 16000 "${outputPath}"`;
  await execPromise(command, undefined, signal);
};
