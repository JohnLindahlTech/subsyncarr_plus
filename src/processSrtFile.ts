import { basename } from 'path';
import { findMatchingVideoFile } from './findMatchingVideoFile.js';
import { generateAutosubsyncSubtitles } from './generateAutosubsyncSubtitles.js';
import { generateFfsubsyncSubtitles } from './generateFfsubsyncSubtitles.js';
import { generateAlassSubtitles } from './generateAlassSubtitles.js';
import { ScanConfig } from './config.js';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';

export const processSrtFile = async (srtFile: string, config?: ScanConfig, fileIndex?: Map<string, Set<string>>) => {
  const matchResult = findMatchingVideoFile(srtFile, config, fileIndex);
  const includeEngines = appConfig.includeEngines;

  if (matchResult && matchResult.videoPath) {
    if (includeEngines.includes('ffsubsync')) {
      const startTime = Date.now();
      const ffsubsyncResult = await generateFfsubsyncSubtitles(srtFile, matchResult.videoPath);
      const duration = Date.now() - startTime;
      logger.info({ result: ffsubsyncResult.message, duration }, 'ffsubsync completed');
    }
    if (includeEngines.includes('autosubsync')) {
      const startTime = Date.now();
      const autosubsyncResult = await generateAutosubsyncSubtitles(srtFile, matchResult.videoPath);
      const duration = Date.now() - startTime;
      logger.info({ result: autosubsyncResult.message, duration }, 'autosubsync completed');
    }
    if (includeEngines.includes('alass')) {
      const startTime = Date.now();
      const alassResult = await generateAlassSubtitles(srtFile, matchResult.videoPath);
      const duration = Date.now() - startTime;
      logger.info({ result: alassResult.message, duration }, 'alass completed');
    }
  } else {
    logger.info({ file: basename(srtFile) }, 'No matching video file found');
  }
};
