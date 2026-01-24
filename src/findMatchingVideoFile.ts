import { existsSync, readdirSync } from 'fs';
import { basename, dirname, join, resolve, extname } from 'path';

import { ScanConfig } from './config';

type VideoExtension = '.mkv' | '.mp4' | '.avi' | '.mov';
const VIDEO_EXTENSIONS: VideoExtension[] = ['.mkv', '.mp4', '.avi', '.mov'];

export interface MatchResult {
  videoPath: string | null;
  reason: 'exact_match' | 'tag_match' | 'context_fallback' | 'ambiguous' | 'no_videos_found' | 'not_attempted';
  details?: string;
}

function getSingleVideoInDir(
  directory: string,
  fileIndex?: Map<string, Set<string>>,
): { videoPath: string | null; reason: 'solitary' | 'ambiguous' | 'none' } {
  try {
    const filenames = fileIndex
      ? Array.from(fileIndex.get(directory) || [])
      : readdirSync(directory, { withFileTypes: true }).map((f) => f.name);

    const videoFiles = filenames.filter((name) =>
      VIDEO_EXTENSIONS.includes(extname(name).toLowerCase() as VideoExtension),
    );

    if (videoFiles.length === 1) {
      return { videoPath: join(directory, videoFiles[0]), reason: 'solitary' };
    }
    if (videoFiles.length > 1) {
      return { videoPath: null, reason: 'ambiguous' };
    }
  } catch (error) {
    // Ignore directory access errors
  }
  return { videoPath: null, reason: 'none' };
}

export function findMatchingVideoFile(
  srtPath: string,
  config?: ScanConfig,
  fileIndex?: Map<string, Set<string>>,
): MatchResult {
  const directory = dirname(srtPath);
  const srtBaseName = basename(srtPath, '.srt');

  const fileExists = (path: string): boolean => {
    if (!fileIndex) return existsSync(path);
    const dir = dirname(path);
    const name = basename(path);
    return fileIndex.get(dir)?.has(name) || false;
  };

  // 1. Try exact match first
  for (const ext of VIDEO_EXTENSIONS) {
    const possibleVideoPath = join(directory, `${srtBaseName}${ext}`);
    if (fileExists(possibleVideoPath)) {
      return { videoPath: possibleVideoPath, reason: 'exact_match' };
    }
  }

  // 2. Progressive tag removal
  const segments = srtBaseName.split('.');
  while (segments.length > 1) {
    segments.pop();
    const baseNameToTry = segments.join('.');

    for (const ext of VIDEO_EXTENSIONS) {
      const possibleVideoPath = join(directory, `${baseNameToTry}${ext}`);
      if (fileExists(possibleVideoPath)) {
        return {
          videoPath: possibleVideoPath,
          reason: 'tag_match',
          details: `Matched after removing tags: ${baseNameToTry}`,
        };
      }
    }
  }

  // 3. Context-aware fallbacks
  if (config?.enableContextAwareMatching !== false) {
    const sameDir = getSingleVideoInDir(directory, fileIndex);
    if (sameDir.videoPath) {
      return { videoPath: sameDir.videoPath, reason: 'context_fallback', details: 'Solitary video in same directory' };
    }

    const parentDir = resolve(directory, '..');
    const pDir = getSingleVideoInDir(parentDir, fileIndex);
    if (pDir.videoPath) {
      return { videoPath: pDir.videoPath, reason: 'context_fallback', details: 'Solitary video in parent directory' };
    }

    if (sameDir.reason === 'ambiguous' || pDir.reason === 'ambiguous') {
      return {
        videoPath: null,
        reason: 'ambiguous',
        details: 'Found multiple videos, rename SRT to match one exactly',
      };
    }
  }

  return { videoPath: null, reason: 'no_videos_found', details: 'Checked current and parent directory' };
}
