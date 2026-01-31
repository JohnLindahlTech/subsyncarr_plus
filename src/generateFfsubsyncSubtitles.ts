import { execPromise, ProcessingResult, EngineProfile, getEngineOutputPath } from './helpers.js';
import * as fs from 'fs';
import logger from './services/logger.js';

export async function generateFfsubsyncSubtitles(
  srtPath: string,
  videoPath: string,
  signal?: AbortSignal,
  audioPath?: string,
  timeoutMs?: number,
  profile?: EngineProfile,
): Promise<ProcessingResult> {
  const outputPath = getEngineOutputPath(srtPath, 'ffsubsync', profile?.name);

  // Check if synced subtitle already exists
  if (fs.existsSync(outputPath)) {
    return {
      success: true,
      message: `Skipping ${outputPath} - already processed`,
    };
  }

  try {
    const reference = audioPath || videoPath;
    const profileArgs = profile ? profile.args : [];
    const args = [reference, '-i', srtPath, '-o', outputPath, ...profileArgs];
    const command = `ffsubsync ${args.join(' ')}`;
    logger.info({ command }, 'Processing ffsubsync');
    const { stdout, stderr } = await execPromise('ffsubsync', args, timeoutMs, signal);

    // Parse score from stdout. ffsubsync can output "fit score: 0.85" or large alignment scores.
    let score: number | undefined;
    const fitMatch = stdout.match(/fit score:\s*([0-9.]+)/i);
    const scoreMatch = stdout.match(/score:\s*([0-9.]+)/i);

    if (fitMatch) {
      const val = parseFloat(fitMatch[1]);
      // If it's a small decimal, it's a normalized fit score (0.0 - 1.0)
      if (val <= 1.0) {
        score = Math.round(val * 100);
      } else {
        // If it's a large number, it's a raw score
        score = Math.min(Math.round(val / 1000), 100); // Crude normalization for raw scores
      }
    } else if (scoreMatch) {
      const val = parseFloat(scoreMatch[1]);
      if (val <= 1.0) {
        score = Math.round(val * 100);
      } else {
        // Raw alignment scores are often > 100,000.
        // We'll cap it at 100 for the UI but keep the relative magnitude.
        score = Math.min(Math.round(val / 1000), 100);
      }
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
