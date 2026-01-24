import { existsSync, readdirSync } from 'fs';
import { basename, dirname, join, resolve, extname } from 'path';

import { ScanConfig } from './config';

type VideoExtension = '.mkv' | '.mp4' | '.avi' | '.mov';
const VIDEO_EXTENSIONS: VideoExtension[] = ['.mkv', '.mp4', '.avi', '.mov'];

function getSingleVideoInDir(directory: string): string | null {
  try {
    const files = readdirSync(directory, { withFileTypes: true });
    const videoFiles = files.filter(
      (f) => f.isFile() && VIDEO_EXTENSIONS.includes(extname(f.name).toLowerCase() as VideoExtension),
    );

    if (videoFiles.length === 1) {
      return join(directory, videoFiles[0].name);
    }
  } catch (error) {
    // Ignore directory access errors
  }
  return null;
}

export function findMatchingVideoFile(srtPath: string, config?: ScanConfig): string | null {
  const directory = dirname(srtPath);
  const srtBaseName = basename(srtPath, '.srt');

  // Try exact match first
  for (const ext of VIDEO_EXTENSIONS) {
    const possibleVideoPath = join(directory, `${srtBaseName}${ext}`);
    if (existsSync(possibleVideoPath)) {
      return possibleVideoPath;
    }
  }

  // Progressive tag removal - split by dots and try removing one segment at a time
  const segments = srtBaseName.split('.');
  while (segments.length > 1) {
    segments.pop(); // Remove the last segment
    const baseNameToTry = segments.join('.');

    for (const ext of VIDEO_EXTENSIONS) {
      const possibleVideoPath = join(directory, `${baseNameToTry}${ext}`);
      if (existsSync(possibleVideoPath)) {
        return possibleVideoPath;
      }
    }
  }

  // Only proceed to fallbacks if enabled in config
  if (config?.enableContextAwareMatching !== false) {
    // Fallback 1: Exactly one video in the same directory
    const singleVideoSameDir = getSingleVideoInDir(directory);
    if (singleVideoSameDir) {
      return singleVideoSameDir;
    }

    // Fallback 2: Exactly one video in the parent directory
    const parentDir = resolve(directory, '..');
    const singleVideoParentDir = getSingleVideoInDir(parentDir);
    if (singleVideoParentDir) {
      return singleVideoParentDir;
    }
  }

  return null;
}
