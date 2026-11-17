import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  setStoredLibrarySource,
  getStoredLibrarySource,
  storeDirectoryHandle,
  getStoredDirectoryHandle,
  storeFileHandles,
  getStoredFileHandles,
  clearStoredFileHandles,
} from '../src/services/idbStorage';
import {
  isFsaOpenFileSupported,
  promptOpenFiles,
  verifyFileHandlesPermission,
  scanFileHandles,
} from '../src/services/fileAccess';
import { parseSelectedFiles } from '../src/services/fallbackAccess';

// In-memory mock for IndexedDB & localStorage
const mockLocalStorage: Record<string, string> = {};

const dbStores = new Map<string, Map<string, any>>();

function createIndexedDBMock() {
  return {
    open: (_dbName: string, _version: number) => {
      const request: any = {
        result: null,
        error: null,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
      };

      setTimeout(() => {
        const db: any = {
          objectStoreNames: {
            contains: (name: string) => dbStores.has(name),
          },
          createObjectStore: (name: string) => {
            if (!dbStores.has(name)) {
              dbStores.set(name, new Map());
            }
          },
          transaction: (storeNames: string | string[], _mode: string) => {
            const storeName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
            if (!dbStores.has(storeName)) {
              dbStores.set(storeName, new Map());
            }
            const map = dbStores.get(storeName)!;

            const tx: any = {
              oncomplete: null,
              onerror: null,
              onabort: null,
              objectStore: () => ({
                put: (value: any, key: string) => {
                  map.set(key, value);
                  setTimeout(() => tx.oncomplete?.(), 0);
                },
                get: (key: string) => {
                  const req: any = { result: map.get(key), onsuccess: null, onerror: null };
                  setTimeout(() => req.onsuccess?.(), 0);
                  return req;
                },
                delete: (key: string) => {
                  map.delete(key);
                  setTimeout(() => tx.oncomplete?.(), 0);
                },
              }),
            };
            return tx;
          },
          close: vi.fn(),
        };

        request.result = db;
        if (request.onupgradeneeded) {
          request.onupgradeneeded({ target: request });
        }
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
      }, 0);

      return request;
    },
  };
}

beforeAll(() => {
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
  (globalThis as any).indexedDB = createIndexedDBMock();
});

vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, value: string) => {
    mockLocalStorage[key] = value.toString();
  },
  removeItem: (key: string) => {
    delete mockLocalStorage[key];
  },
  clear: () => {
    for (const k of Object.keys(mockLocalStorage)) {
      delete mockLocalStorage[k];
    }
  },
});

function createMockFileHandle({
  name,
  size = 1024,
  lastModified = Date.now(),
  permission = 'granted',
  throwOnGetFile = false,
}: {
  name: string;
  size?: number;
  lastModified?: number;
  permission?: 'granted' | 'prompt' | 'denied';
  throwOnGetFile?: boolean;
}): FileSystemFileHandle {
  let currentPermission = permission;
  return {
    kind: 'file',
    name,
    isSameEntry: vi.fn(async () => false),
    queryPermission: vi.fn(async () => currentPermission),
    requestPermission: vi.fn(async () => {
      if (currentPermission === 'prompt') {
        currentPermission = 'granted';
      }
      return currentPermission;
    }),
    getFile: vi.fn(async () => {
      if (throwOnGetFile) {
        const err = new DOMException(
          'A requested file or directory could not be found at the time an operation was processed.',
          'NotFoundError'
        );
        throw err;
      }
      return new File([new ArrayBuffer(size)], name, {
        type: 'video/mp4',
        lastModified,
      });
    }),
  } as unknown as FileSystemFileHandle;
}

function createMockDirectoryHandle(name = 'TestFolder'): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    isSameEntry: vi.fn(async () => false),
    queryPermission: vi.fn(async () => 'granted'),
    requestPermission: vi.fn(async () => 'granted'),
    values: vi.fn(async function* () {}),
    getFileHandle: vi.fn(),
    getDirectoryHandle: vi.fn(),
  } as unknown as FileSystemDirectoryHandle;
}

describe('Library History & Source Tracking (Requirement A)', () => {
  beforeEach(() => {
    dbStores.clear();
    localStorage.clear();
  });

  it('persists and restores library source mode between folder and files', async () => {
    await setStoredLibrarySource('folder');
    expect(await getStoredLibrarySource()).toBe('folder');

    await setStoredLibrarySource('files');
    expect(await getStoredLibrarySource()).toBe('files');
  });

  it('Folder -> Files -> Refresh: prevents restoring stale folder when files was used last', async () => {
    // 1. User opens a folder
    const folderHandle = createMockDirectoryHandle('Vacation2025');
    await storeDirectoryHandle(folderHandle);
    await setStoredLibrarySource('folder');

    expect(await getStoredLibrarySource()).toBe('folder');
    expect(await getStoredDirectoryHandle()).not.toBeNull();

    // 2. User subsequently selects individual files
    const file1 = createMockFileHandle({ name: 'clip1.mp4' });
    await storeFileHandles([file1]);
    await setStoredLibrarySource('files');

    // 3. User refreshes the application: check startup resolution
    const activeSource = await getStoredLibrarySource();
    expect(activeSource).toBe('files');

    // Crucial check: Since activeSource === 'files', startup must NOT load stored directory handle
    const shouldLoadFolder = activeSource === 'folder';
    expect(shouldLoadFolder).toBe(false);

    // Stored file handles are available instead
    const restoredFiles = await getStoredFileHandles();
    expect(restoredFiles?.length).toBe(1);
    expect(restoredFiles?.[0].name).toBe('clip1.mp4');
  });

  it('Files -> Folder -> Refresh: restores folder when folder was used last', async () => {
    // 1. User had opened files
    const file1 = createMockFileHandle({ name: 'clip1.mp4' });
    await storeFileHandles([file1]);
    await setStoredLibrarySource('files');

    // 2. User switches to a folder
    const folderHandle = createMockDirectoryHandle('SeriesFolder');
    await storeDirectoryHandle(folderHandle);
    await setStoredLibrarySource('folder');

    // 3. Refresh: startup checks active source
    const activeSource = await getStoredLibrarySource();
    expect(activeSource).toBe('folder');

    const shouldLoadFolder = activeSource === 'folder';
    expect(shouldLoadFolder).toBe(true);

    const restoredFolder = await getStoredDirectoryHandle();
    expect(restoredFolder?.name).toBe('SeriesFolder');
  });
});

describe('Persistent File Handles & Verification (Requirement B)', () => {
  it('detects File System Access showOpenFilePicker support properly', () => {
    const originalPicker = (window as any).showOpenFilePicker;

    (window as any).showOpenFilePicker = vi.fn();
    expect(isFsaOpenFileSupported()).toBe(true);

    delete (window as any).showOpenFilePicker;
    expect(isFsaOpenFileSupported()).toBe(false);

    (window as any).showOpenFilePicker = originalPicker;
  });

  it('promptOpenFiles passes multiple: true and handles user cancellation gracefully', async () => {
    const originalPicker = (window as any).showOpenFilePicker;

    // Simulate user cancelling the picker dialog
    (window as any).showOpenFilePicker = vi.fn().mockRejectedValue(
      new DOMException('User cancelled the dialog', 'AbortError')
    );

    const result = await promptOpenFiles();
    expect(result).toBeNull();

    // Simulate successful selection of multiple files
    const mockHandles = [
      createMockFileHandle({ name: 'part1.mp4' }),
      createMockFileHandle({ name: 'part2.mp4' }),
    ];
    (window as any).showOpenFilePicker = vi.fn().mockResolvedValue(mockHandles);

    const selected = await promptOpenFiles();
    expect(selected?.length).toBe(2);
    expect(selected?.[0].name).toBe('part1.mp4');
    expect(selected?.[1].name).toBe('part2.mp4');

    (window as any).showOpenFilePicker = originalPicker;
  });

  it('verifies handle permissions non-intrusively during startup', async () => {
    const grantedHandle = createMockFileHandle({ name: 'a.mp4', permission: 'granted' });
    const promptHandle = createMockFileHandle({ name: 'b.mp4', permission: 'prompt' });

    // When requestIfPrompt is false, it returns false without prompting
    expect(await verifyFileHandlesPermission([grantedHandle], false)).toBe(true);
    expect(await verifyFileHandlesPermission([promptHandle], false)).toBe(false);
    expect(promptHandle.requestPermission).not.toHaveBeenCalled();

    // When requestIfPrompt is true (user gesture), it requests permission
    expect(await verifyFileHandlesPermission([promptHandle], true)).toBe(true);
    expect(promptHandle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('returns false when permission is denied or revoked', async () => {
    const deniedHandle = createMockFileHandle({ name: 'denied.mp4', permission: 'denied' });
    expect(await verifyFileHandlesPermission([deniedHandle], false)).toBe(false);
    expect(await verifyFileHandlesPermission([deniedHandle], true)).toBe(false);
  });

  it('scans and builds a valid VideoLibrary from multiple FileSystemFileHandle objects', async () => {
    const handles = [
      createMockFileHandle({ name: 'Ep 02.mp4', size: 2000 }),
      createMockFileHandle({ name: 'Ep 01.mp4', size: 1000 }),
    ];

    const lib = await scanFileHandles(handles);
    expect(lib).not.toBeNull();
    expect(lib?.sourceType).toBe('files');
    expect(lib?.flatPlaylist.length).toBe(2);

    // Naturally sorted
    expect(lib?.flatPlaylist[0].name).toBe('Ep 01.mp4');
    expect(lib?.flatPlaylist[1].name).toBe('Ep 02.mp4');

    // Both handle and file instance are attached
    expect(lib?.flatPlaylist[0].handle).toBeDefined();
    expect(lib?.flatPlaylist[0].file).toBeDefined();
  });

  it('handles missing or stale file handles gracefully by skipping unreadable files', async () => {
    const valid1 = createMockFileHandle({ name: 'available1.mp4' });
    const staleMissing = createMockFileHandle({ name: 'deleted.mp4', throwOnGetFile: true });
    const valid2 = createMockFileHandle({ name: 'available2.mp4' });

    const lib = await scanFileHandles([valid1, staleMissing, valid2]);

    expect(lib).not.toBeNull();
    // Missing file skipped without throwing or crashing
    expect(lib?.flatPlaylist.length).toBe(2);
    expect(lib?.flatPlaylist.map((v) => v.name)).toEqual(['available1.mp4', 'available2.mp4']);
    expect(lib?.fileHandles?.length).toBe(2);
  });

  it('returns null gracefully when all stored handles are missing or deleted', async () => {
    const staleMissing1 = createMockFileHandle({ name: 'deleted1.mp4', throwOnGetFile: true });
    const staleMissing2 = createMockFileHandle({ name: 'deleted2.mp4', throwOnGetFile: true });

    const lib = await scanFileHandles([staleMissing1, staleMissing2]);
    expect(lib).toBeNull();
  });

  it('deduplicates unique IDs when user selects multiple files with the same name', async () => {
    const handleA = createMockFileHandle({ name: 'video.mp4', size: 100 });
    const handleB = createMockFileHandle({ name: 'video.mp4', size: 200 });

    const lib = await scanFileHandles([handleA, handleB]);
    expect(lib).not.toBeNull();
    expect(lib?.flatPlaylist.length).toBe(2);
    expect(lib?.flatPlaylist[0].id).toBe('video.mp4');
    expect(lib?.flatPlaylist[1].id).toBe('video.mp4 (2)');
  });
});

describe('Non-FSA Fallback Workflow & Persistence Compatibility', () => {
  it('preserves existing HTML file input workflow and sets active source to files', async () => {
    const file1 = new File(['123'], 'manual1.mp4', { type: 'video/mp4' });
    const file2 = new File(['456'], 'manual2.mp4', { type: 'video/mp4' });

    const lib = parseSelectedFiles([file1, file2]);
    expect(lib).not.toBeNull();
    expect(lib?.sourceType).toBe('files');
    expect(lib?.flatPlaylist.length).toBe(2);

    // Simulate saving source when user selects fallback files
    await setStoredLibrarySource('files');
    await clearStoredFileHandles(); // Temporary files cannot be stored as handles

    // On startup in non-FSA browser:
    const activeSource = await getStoredLibrarySource();
    expect(activeSource).toBe('files');

    // Never restores old directory
    const shouldLoadFolder = activeSource === 'folder';
    expect(shouldLoadFolder).toBe(false);
  });
});
