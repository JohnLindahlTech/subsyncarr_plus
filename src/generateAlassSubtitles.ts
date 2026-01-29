import { execPromise, ProcessingResult, EngineProfile, getEngineOutputPath } from './helpers';
import * as fs from 'fs';

export async function generateAlassSubtitles(
  srtPath: string,
  videoPath: string,
  signal?: AbortSignal,
  audioPath?: string,
  timeoutMs?: number,
  profile?: EngineProfile,
): Promise<ProcessingResult> {
  const outputPath = getEngineOutputPath(srtPath, 'alass', profile?.name);

  // Check if synced subtitle already exists
  if (fs.existsSync(outputPath)) {
    return {
      success: true,
      message: `Skipping ${outputPath} - already processed`,
    };
  }

  try {
    const reference = audioPath || videoPath;
    const profileArgs = profile ? profile.args.join(' ') : '';
    const command = `alass "${reference}" "${srtPath}" "${outputPath}" ${profileArgs}`;
    console.log(`${new Date().toLocaleString()} Processing: ${command}`);
    const { stdout, stderr } = await execPromise(command, timeoutMs, signal);

    // Parse score from stdout: "Score: 12.34"
    let score: number | undefined;
    const scoreMatch = stdout.match(/Score:\s*([0-9.]+)/i);
    if (scoreMatch) {
      const rawScore = parseFloat(scoreMatch[1]);
      // alass scores are typically 0-20. 10 is very good.
      // We'll normalize 0-15+ to 0-100% for comparison logic.
      score = Math.min(Math.round((rawScore / 15) * 100), 100);
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
    const command = `alass "${reference}" "${srtPath}" "${outputPath}"`;
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
        errorMessage.toLowerCase().includes('too few subtitle entries') ||
        stderr.toLowerCase().includes('too few subtitle entries') ||
        errorMessage.toLowerCase().includes('alignment failed') ||
        stderr.toLowerCase().includes('alignment failed') ||
        errorMessage.toLowerCase().includes('wrong charset encoding') ||
        stderr.toLowerCase().includes('wrong charset encoding'),
    };
  }
}
