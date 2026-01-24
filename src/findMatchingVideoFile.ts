import { existsSync, readdirSync } from 'fs';
import { basename, dirname, join, resolve, extname } from 'path';

import { ScanConfig } from './config';

type VideoExtension = '.mkv' | '.mp4' | '.avi' | '.mov';
const VIDEO_EXTENSIONS: VideoExtension[] = ['.mkv', '.mp4', '.avi', '.mov'];

function getSingleVideoInDir(directory: string, fileIndex?: Map<string, Set<string>>): string | null {
  try {
    const filenames = fileIndex
      ? Array.from(fileIndex.get(directory) || [])
      : readdirSync(directory, { withFileTypes: true }).map((f) => f.name);

    const videoFiles = filenames.filter((name) =>
      VIDEO_EXTENSIONS.includes(extname(name).toLowerCase() as VideoExtension),
    );

    if (videoFiles.length === 1) {
      return join(directory, videoFiles[0]);
    }
  } catch (error) {
    // Ignore directory access errors
  }
  return null;
}

export function findMatchingVideoFile(
  srtPath: string,
  config?: ScanConfig,
  fileIndex?: Map<string, Set<string>>,
): string | null {
  const directory = dirname(srtPath);
  const srtBaseName = basename(srtPath, '.srt');

  const fileExists = (path: string): boolean => {
    if (!fileIndex) return existsSync(path);
    const dir = dirname(path);
    const name = basename(path);
    return fileIndex.get(dir)?.has(name) || false;
  };

  // Try exact match first
  for (const ext of VIDEO_EXTENSIONS) {
    const possibleVideoPath = join(directory, `${srtBaseName}${ext}`);
    if (fileExists(possibleVideoPath)) {
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
      if (fileExists(possibleVideoPath)) {
        return possibleVideoPath;
      }
    }
  }

  // Only proceed to fallbacks if enabled in config
  if (config?.enableContextAwareMatching !== false) {
    // Fallback 1: Exactly one video in the same directory
    const singleVideoSameDir = getSingleVideoInDir(directory, fileIndex);
    if (singleVideoSameDir) {
      return singleVideoSameDir;
    }

    // Fallback 2: Exactly one video in the parent directory
    const parentDir = resolve(directory, '..');
    const singleVideoParentDir = getSingleVideoInDir(parentDir, fileIndex);
    if (singleVideoParentDir) {
      return singleVideoParentDir;
    }
  }

  return null;
}
