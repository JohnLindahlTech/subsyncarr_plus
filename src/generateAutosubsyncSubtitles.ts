import { basename, dirname, join } from 'path';
import { execPromise, ProcessingResult } from './helpers.js';
import { existsSync } from 'fs';
import logger from './services/logger.js';

export async function generateAutosubsyncSubtitles(
  srtPath: string,
  videoPath: string,
  signal?: AbortSignal,
  audioPath?: string,
  timeoutMs?: number,
): Promise<ProcessingResult> {
  const directory = dirname(srtPath);
  const srtBaseName = basename(srtPath, '.srt');
  const outputPath = join(directory, `${srtBaseName}.autosubsync.srt`);

  const exists = existsSync(outputPath);
  if (exists) {
    return {
      success: true,
      message: `Skipping ${outputPath} - already processed`,
    };
  }

  try {
    const reference = audioPath || videoPath;
    const args = [reference, srtPath, outputPath];
    const command = `autosubsync ${args.join(' ')}`;
    logger.info({ command }, 'Processing autosubsync');
    const { stdout, stderr } = await execPromise('autosubsync', args, timeoutMs, signal);
    return {
      success: true,
      message: `Successfully processed: ${outputPath}`,
      stdout: stdout || undefined,
      stderr: stderr || undefined,
      command,
    };
  } catch (error) {
    const reference = audioPath || videoPath;
    const command = `autosubsync "${reference}" "${srtPath}" "${outputPath}"`;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('SIGTERM') || errorMessage.includes('timed out');
    const isAborted = errorMessage.includes('Aborted');

    if (isAborted) {
      return {
        success: false,
        message: `Aborted: Processing of ${outputPath} was cancelled by user`,
        command,
        isPermanent: false,
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
        errorMessage.toLowerCase().includes('no voice activity detected') ||
        stderr.toLowerCase().includes('no voice activity detected'),
    };
  }
}
