import { findAllSrtFiles } from './findAllSrtFiles';
import { getScanConfig } from './config';
import { processSrtFile } from './processSrtFile';
import { appConfig } from './config/appConfig';
import logger from './services/logger';

async function main(): Promise<void> {
  try {
    // Find all .srt files
    const scanConfig = getScanConfig();
    const { srtFiles, fileIndex } = await findAllSrtFiles(scanConfig);
    logger.info({ count: srtFiles.length }, 'Found SRT files');

    const maxConcurrentSyncTasks = appConfig.maxConcurrentSyncTasks;

    for (let i = 0; i < srtFiles.length; i += maxConcurrentSyncTasks) {
      const chunk = srtFiles.slice(i, i + maxConcurrentSyncTasks);
      await Promise.all(chunk.map((srtFile) => processSrtFile(srtFile, scanConfig, fileIndex)));
    }
  } catch (error) {
    logger.error({ error }, 'Execution error');
  } finally {
    logger.info('subsyncarr-plus completed.');
  }
}

main();
