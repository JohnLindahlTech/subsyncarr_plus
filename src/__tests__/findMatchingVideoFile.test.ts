import { findMatchingVideoFile } from '../findMatchingVideoFile';
import * as fs from 'fs';

jest.mock('fs');

describe('findMatchingVideoFile', () => {
  const mockSrtPath = '/media/Movies/Matrix/subs/sv.srt';
  const mockSrtDir = '/media/Movies/Matrix/subs';
  const mockParentDir = '/media/Movies/Matrix';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should find an exact match', () => {
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === '/media/Movies/Matrix/subs/sv.mkv');
    const result = findMatchingVideoFile(mockSrtPath);
    expect(result.videoPath).toBe('/media/Movies/Matrix/subs/sv.mkv');
    expect(result.reason).toBe('exact_match');
  });

  it('should find a match via progressive tag removal', () => {
    const srt = '/media/Movies/Movie.2024.1080p.srt';
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === '/media/Movies/Movie.2024.mkv');
    const result = findMatchingVideoFile(srt);
    expect(result.videoPath).toBe('/media/Movies/Movie.2024.mkv');
    expect(result.reason).toBe('tag_match');
  });

  it('should fallback to solitary video in same directory', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readdirSync as jest.Mock).mockReturnValue([
      { isFile: () => true, name: 'other_name.mkv' },
      { isFile: () => true, name: 'sv.srt' },
      { isFile: () => false, name: 'SubFolder' },
    ]);

    const result = findMatchingVideoFile(mockSrtPath);
    expect(result.videoPath).toBe('/media/Movies/Matrix/subs/other_name.mkv');
    expect(result.reason).toBe('context_fallback');
  });

  it('should fallback to solitary video in parent directory', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readdirSync as jest.Mock).mockImplementation((dir) => {
      if (dir === mockSrtDir) {
        return [{ isFile: () => true, name: 'sv.srt' }]; // No video here
      }
      if (dir === mockParentDir) {
        return [{ isFile: () => true, name: 'Matrix.1999.mkv' }]; // One video here
      }
      return [];
    });

    const result = findMatchingVideoFile(mockSrtPath);
    expect(result.videoPath).toBe('/media/Movies/Matrix/Matrix.1999.mkv');
    expect(result.reason).toBe('context_fallback');
  });

  it('should find match using fileIndex without disk access', () => {
    const fileIndex = new Map<string, Set<string>>();
    fileIndex.set('/media/Movies', new Set(['movie.mkv', 'movie.srt']));

    // existsSync should NOT be called if index is working
    const existsSpy = jest.spyOn(fs, 'existsSync');

    const result = findMatchingVideoFile('/media/Movies/movie.srt', undefined, fileIndex);
    expect(result.videoPath).toBe('/media/Movies/movie.mkv');
    expect(result.reason).toBe('exact_match');
    expect(existsSpy).not.toHaveBeenCalled();
  });

  it('should return null if multiple videos exist in same directory (ambiguous)', () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readdirSync as jest.Mock).mockReturnValue([
      { isFile: () => true, name: 'video1.mkv' },
      { isFile: () => true, name: 'video2.mkv' },
    ]);

    const result = findMatchingVideoFile(mockSrtPath);
    expect(result.videoPath).toBeNull();
    expect(result.reason).toBe('ambiguous');
  });
});
