import { basename, dirname, join } from 'path';
import { execPromise, ProcessingResult } from './helpers';
import { existsSync } from 'fs';

export async function generateFfsubsyncSubtitles(
  srtPath: string,
  videoPath: string,
  signal?: AbortSignal,
  audioPath?: string,
  timeoutMs?: number,
): Promise<ProcessingResult> {
  const directory = dirname(srtPath);
  const srtBaseName = basename(srtPath, '.srt');
  const outputPath = join(directory, `${srtBaseName}.ffsubsync.srt`);

  // Check if synced subtitle already exists
  const exists = existsSync(outputPath);
  if (exists) {
    return {
      success: true,
      message: `Skipping ${outputPath} - already processed`,
    };
  }

  try {
    const reference = audioPath || videoPath;
    const command = `ffsubsync "${reference}" -i "${srtPath}" -o "${outputPath}"`;
    console.log(`${new Date().toLocaleString()} Processing: ${command}`);
    const { stdout, stderr } = await execPromise(command, timeoutMs, signal);

    // Parse score from stdout: "fit score: 0.85"
    let score: number | undefined;
    const scoreMatch = stdout.match(/fit score:\s*([0-9.]+)/i);
    if (scoreMatch) {
      score = Math.round(parseFloat(scoreMatch[1]) * 100);
    }

    return {
      success: true,
      message: `Successfully processed: ${outputPath}`,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      command,
      score,
    };
  } catch (error) {
    const reference = audioPath || videoPath;
    const command = `ffsubsync "${reference}" -i "${srtPath}" -o "${outputPath}"`;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('SIGTERM') || errorMessage.includes('timed out');
    const isAborted = errorMessage.includes('Aborted');

    if (isAborted) {
      return {
        success: false,
        message: `Aborted: Processing of ${outputPath} was cancelled by user`,
        command,
        isPermanent: false, // Don't mark as permanent if manually aborted
      };
    }

    // Extract stdout/stderr from error if available
    const execError = error as { stdout?: string; stderr?: string };
    const stdout = execError.stdout || '';
    const stderr = execError.stderr || '';

    if (isTimeout) {
      return {
        success: false,
        message: `Timeout: ${outputPath} took longer than allowed timeout`,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        command,
      };
    }

    return {
      success: false,
      message: `Error processing ${outputPath}: ${errorMessage}`,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      command,
      isPermanent:
        errorMessage.toLowerCase().includes('no speech detected') ||
        stderr.toLowerCase().includes('no speech detected') ||
        errorMessage.toLowerCase().includes('no audio streams found') ||
        stderr.toLowerCase().includes('no audio streams found') ||
        errorMessage.toLowerCase().includes('could not find a good alignment') ||
        stderr.toLowerCase().includes('could not find a good alignment'),
    };
  }
}
