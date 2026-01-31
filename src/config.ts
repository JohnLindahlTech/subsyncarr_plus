import { appConfig } from './config/appConfig.js';
import logger from './services/logger.js';

export interface ScanConfig {
  includePaths: string[];
  excludePaths: string[];
  enableContextAwareMatching: boolean;
  forceRerun?: boolean;
}

export interface RetentionConfig {
  keepRunsDays: number; // Keep complete runs for N days
  trimLogsDays: number; // Trim logs after N days
  maxLogSizeBytes: number; // Max size for trimmed logs
  cleanupIntervalHours: number; // How often to run cleanup
}

function validatePath(path: string): boolean {
  // Add any path validation logic you need
  return path.startsWith('/') && !path.includes('..');
}

export function getScanConfig(): ScanConfig {
  const config = appConfig.getScanConfig();

  // Validate paths
  const validIncludePaths = config.includePaths.filter((path) => {
    const isValid = validatePath(path);
    if (!isValid) {
      logger.warn({ path }, 'Invalid include path');
    }
    return isValid;
  });

  const validExcludePaths = config.excludePaths.filter((path) => {
    const isValid = validatePath(path);
    if (!isValid) {
      logger.warn({ path }, 'Invalid exclude path');
    }
    return isValid;
  });

  if (validIncludePaths.length === 0) {
    logger.warn('No valid scan paths provided, defaulting to /scan_dir');
    validIncludePaths.push('/scan_dir');
  }

  logger.info(
    {
      includePaths: validIncludePaths,
      excludePaths: validExcludePaths,
    },
    'Scan configuration',
  );

  return {
    includePaths: validIncludePaths,
    excludePaths: validExcludePaths,
    enableContextAwareMatching: config.enableContextAwareMatching,
  };
}

export function getRetentionConfig(): RetentionConfig {
  return appConfig.getRetentionConfig();
}
