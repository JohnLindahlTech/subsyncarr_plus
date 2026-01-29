import { readdir } from 'fs/promises';
import { extname, join } from 'path';
import { ScanConfig } from './config';

export interface ScanResult {
  srtFiles: string[];
  fileIndex: Map<string, Set<string>>;
}

export async function findAllSrtFiles(config: ScanConfig): Promise<ScanResult> {
  const srtFiles: string[] = [];
  const fileIndex = new Map<string, Set<string>>();

  async function scan(directory: string): Promise<void> {
    // Check if this directory should be excluded
    if (config.excludePaths.some((excludePath) => directory.startsWith(excludePath))) {
      return;
    }

    try {
      const entries = await readdir(directory, { withFileTypes: true });
      const filenames = new Set<string>();
      const subdirs: string[] = [];

      for (const entry of entries) {
        filenames.add(entry.name);
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
          subdirs.push(fullPath);
        } else if (
          entry.isFile() &&
          extname(entry.name).toLowerCase() === '.srt' &&
          !entry.name.includes('.ffsubsync.') &&
          !entry.name.includes('.alass.') &&
          !entry.name.includes('.autosubsync.') &&
          !entry.name.includes('.synced.srt')
        ) {
          srtFiles.push(fullPath);
        }
      }

      fileIndex.set(directory, filenames);

      // Scan subdirectories in parallel to hide NFS latency
      await Promise.all(subdirs.map((d) => scan(d)));
    } catch (error) {
      // Ignore directory access errors
    }
  }

  // Scan all included paths in parallel
  await Promise.all(config.includePaths.map((path) => scan(path)));

  return { srtFiles, fileIndex };
}
