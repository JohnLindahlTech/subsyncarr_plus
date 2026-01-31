import { ScannerService } from './services/ScannerService.js';
import { getScanConfig } from './config.js';
import { processSrtFile } from './processSrtFile.js';
import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';

async function main(): Promise<void> {
  try {
    const scanner = new ScannerService();
    // Find all .srt files
    const scanConfig = getScanConfig();
    const { srtFiles, fileIndex } = await scanner.findAllSrtFiles(scanConfig);
    logger.info({ count: srtFiles.length }, 'Found SRT files');

    const maxConcurrentSyncTasks = appConfig.maxConcurrentSyncTasks;

    for (let i = 0; i < srtFiles.length; i += maxConcurrentSyncTasks) {
      const chunk = srtFiles.slice(i, i + maxConcurrentSyncTasks);
      await Promise.all(chunk.map((srtFile: string) => processSrtFile(srtFile, scanConfig, fileIndex)));
    }
  } catch (error) {
    logger.error({ error }, 'Execution error');
  } finally {
    logger.info('subsyncarr-plus completed.');
  }
}

main();
