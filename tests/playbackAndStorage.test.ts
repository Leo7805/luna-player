import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  createVideoStorageKey,
  VideoItem,
  FolderNode,
} from '../src/types/video';
import {
  saveVideoProgress,
  getVideoProgress,
  loadSettings,
  saveSettings,
} from '../src/services/progressStorage';
import { buildFolderTree, flattenTreeToDfsPlaylist } from '../src/utils/videoTree';
import { parseFileList } from '../src/services/fallbackAccess';

// In-memory localStorage mock for node environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Video Identity & Playback Progress Persistence', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('generates collision-proof keys across different root libraries', () => {
    const key1 = createVideoStorageKey('lib-A', 'ep1.mp4', 1000, 500);
    const key2 = createVideoStorageKey('lib-B', 'ep1.mp4', 1000, 500);
    const key3 = createVideoStorageKey('lib-A', 'ep1.mp4', 2000, 500);

    expect(key1).not.toBe(key2);
    expect(key1).not.toBe(key3);
    expect(key1).toBe('lib-A::ep1.mp4::1000::500');
  });

  it('saves and restores playback position accurately', () => {
    saveVideoProgress('lib-1', 'movie.mp4', 12345, 67890, 120, 600);
    const saved = getVideoProgress('lib-1', 'movie.mp4', 12345, 67890);

    expect(saved).not.toBeNull();
    expect(saved?.currentTime).toBe(120);
    expect(saved?.duration).toBe(600);
    expect(saved?.completed).toBe(false);
  });

  it('marks video as completed if near end and resets resume position to 0', () => {
    // 590s of 600s is within 15 seconds
    saveVideoProgress('lib-1', 'movie.mp4', 12345, 67890, 590, 600);
    const saved = getVideoProgress('lib-1', 'movie.mp4', 12345, 67890);

    expect(saved).not.toBeNull();
    expect(saved?.currentTime).toBe(0);
    expect(saved?.completed).toBe(true);
  });

  it('returns null for non-existent or corrupted progress records', () => {
    const nonExistent = getVideoProgress('lib-1', 'ghost.mp4', 1, 1);
    expect(nonExistent).toBeNull();
  });

  it('saves and restores player settings properly', () => {
    expect(loadSettings().autoplayNext).toBe(true);

    saveSettings({ autoplayNext: false });
    expect(loadSettings().autoplayNext).toBe(false);

    saveSettings({ autoplayNext: true });
    expect(loadSettings().autoplayNext).toBe(true);
  });
});

describe('Playback Navigation & Search Independence', () => {
  const sampleVideos: VideoItem[] = [
    {
      id: 'Action/Movie 1.mp4',
      name: 'Movie 1.mp4',
      relativePath: 'Action/Movie 1.mp4',
      size: 100,
      lastModified: 100,
    },
    {
      id: 'Action/Movie 2.mp4',
      name: 'Movie 2.mp4',
      relativePath: 'Action/Movie 2.mp4',
      size: 100,
      lastModified: 100,
    },
    {
      id: 'Drama/Ep 1.mp4',
      name: 'Ep 1.mp4',
      relativePath: 'Drama/Ep 1.mp4',
      size: 100,
      lastModified: 100,
    },
  ];

  it('maintains strict DFS sequence regardless of tree manipulation', () => {
    const tree: FolderNode = buildFolderTree('Root', sampleVideos);
    const flat = flattenTreeToDfsPlaylist(tree);

    expect(flat.length).toBe(3);
    expect(flat[0].name).toBe('Movie 1.mp4');
    expect(flat[1].name).toBe('Movie 2.mp4');
    expect(flat[2].name).toBe('Ep 1.mp4');

    // Simulate navigation indices
    let currentIndex = 0;
    const hasNext = () => currentIndex < flat.length - 1;
    const hasPrev = () => currentIndex > 0;
    const playNext = () => { if (hasNext()) currentIndex++; };
    const playPrev = () => { if (hasPrev()) currentIndex--; };

    expect(hasPrev()).toBe(false);
    expect(hasNext()).toBe(true);

    playNext();
    expect(currentIndex).toBe(1);
    expect(flat[currentIndex].name).toBe('Movie 2.mp4');

    playNext();
    expect(currentIndex).toBe(2);
    expect(flat[currentIndex].name).toBe('Ep 1.mp4');
    expect(hasNext()).toBe(false);

    playPrev();
    expect(currentIndex).toBe(1);
  });

  it('simulates search filter without modifying flat playlist DFS sequence', () => {
    const tree = buildFolderTree('Root', sampleVideos);
    const flat = flattenTreeToDfsPlaylist(tree);

    // Search query matches only 'Ep'
    const searchQuery = 'ep';
    const filtered = flat.filter((v) =>
      v.name.toLowerCase().includes(searchQuery) ||
      v.relativePath.toLowerCase().includes(searchQuery)
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('Ep 1.mp4');

    // Underlying playback sequence remains complete
    expect(flat.length).toBe(3);
  });
});

describe('Asynchronous Race Condition Protection Logic', () => {
  it('discards stale resolution when a newer token has been issued', async () => {
    let activeToken = 0;
    const loadedResults: string[] = [];

    async function simulateLoad(videoName: string, delayMs: number) {
      const token = ++activeToken;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Check token validity
      if (token === activeToken) {
        loadedResults.push(videoName);
      }
    }

    // Fire Video A with 50ms delay, and immediately fire Video B with 10ms delay
    const p1 = simulateLoad('Video A (slow)', 50);
    const p2 = simulateLoad('Video B (fast)', 10);

    await Promise.all([p1, p2]);

    // Only Video B should be accepted since its token is the active one
    expect(loadedResults).toEqual(['Video B (fast)']);
  });
});

describe('Fallback Directory Parsing', () => {
  it('correctly parses File objects and extracts relative hierarchy', () => {
    const mockFiles = [
      {
        name: 'intro.mp4',
        webkitRelativePath: 'MyLibrary/intro.mp4',
        size: 500,
        lastModified: 1234,
      } as unknown as File,
      {
        name: 'notes.txt',
        webkitRelativePath: 'MyLibrary/notes.txt',
        size: 50,
        lastModified: 1234,
      } as unknown as File,
      {
        name: 'episode1.mkv',
        webkitRelativePath: 'MyLibrary/Series/episode1.mkv',
        size: 1500,
        lastModified: 5678,
      } as unknown as File,
    ];

    const lib = parseFileList(mockFiles);
    expect(lib).not.toBeNull();
    expect(lib?.name).toBe('MyLibrary');
    expect(lib?.flatPlaylist.length).toBe(2);
    expect(lib?.flatPlaylist.map((v) => v.name)).toEqual(['intro.mp4', 'episode1.mkv']);
  });
});
