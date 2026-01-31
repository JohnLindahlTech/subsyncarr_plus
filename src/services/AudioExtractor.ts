import * as fs from 'fs';
import { extractAudio as helpersExtractAudio } from '../helpers';
import logger from './logger';
import { StateManager } from '../stateManager';

export class AudioExtractor {
  constructor(private stateManager?: StateManager) {}

  public async extract(videoPath: string, tempAudioPath: string, signal?: AbortSignal): Promise<boolean> {
    try {
      logger.info({ videoPath, tempAudioPath }, 'Extracting audio for video group');
      if (this.stateManager) this.stateManager.startExtraction(videoPath);

      await helpersExtractAudio(videoPath, tempAudioPath, signal);

      logger.info({ videoPath }, 'Audio extraction successful');
      return true;
    } catch (err) {
      logger.error({ videoPath, error: err instanceof Error ? err.message : String(err) }, 'Audio extraction failed');
      return false;
    } finally {
      if (this.stateManager) this.stateManager.stopExtraction(videoPath);
    }
  }

  public cleanup(tempAudioPath: string): void {
    if (fs.existsSync(tempAudioPath)) {
      try {
        fs.unlinkSync(tempAudioPath);
        logger.debug({ tempAudioPath }, 'Cleaned up temporary audio file');
      } catch (e) {
        logger.warn({ tempAudioPath, error: e }, 'Failed to cleanup temporary audio file');
      }
    }
  }
}
