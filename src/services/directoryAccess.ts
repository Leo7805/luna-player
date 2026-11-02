import { VideoItem, VideoLibrary } from '../types/video';
import { isSupportedVideoFile, buildFolderTree, flattenTreeToDfsPlaylist } from '../utils/videoTree';

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function promptOpenDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'read',
    });
    return handle;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User cancelled picker dialog
      return null;
    }
    throw err;
  }
}

export async function verifyHandlePermission(
  handle: FileSystemDirectoryHandle,
  requestIfPrompt = false
): Promise<boolean> {
  try {
    // Check current permission state
    const current = await handle.queryPermission({ mode: 'read' });
    if (current === 'granted') return true;

    if (requestIfPrompt && current === 'prompt') {
      const requested = await handle.requestPermission({ mode: 'read' });
      return requested === 'granted';
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Recursively scans a directory handle and returns all supported video files.
 */
export async function scanDirectoryHandle(
  rootHandle: FileSystemDirectoryHandle,
  onProgress?: (count: number) => void
): Promise<VideoLibrary> {
  const discoveredVideos: VideoItem[] = [];

  async function walk(
    dirHandle: FileSystemDirectoryHandle,
    currentPath: string
  ): Promise<void> {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        if (isSupportedVideoFile(entry.name)) {
          const fileHandle = entry as FileSystemFileHandle;
          const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
          
          try {
            const file = await fileHandle.getFile();
            discoveredVideos.push({
              id: relativePath,
              name: entry.name,
              relativePath,
              size: file.size,
              lastModified: file.lastModified,
              handle: fileHandle,
            });

            if (onProgress && discoveredVideos.length % 20 === 0) {
              onProgress(discoveredVideos.length);
            }
          } catch {
            // Ignore unreadable or locked individual files
          }
        }
      } else if (entry.kind === 'directory') {
        // Skip hidden folders (e.g. .git, .vscode)
        if (entry.name.startsWith('.')) continue;

        const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        try {
          await walk(entry as FileSystemDirectoryHandle, subPath);
        } catch {
          // If a subdirectory is inaccessible, skip it gracefully
        }
      }
    }
  }

  await walk(rootHandle, '');

  const rootName = rootHandle.name || 'Local Library';
  const libraryId = `fsa:${rootName}`;
  const tree = buildFolderTree(rootName, discoveredVideos);
  const flatPlaylist = flattenTreeToDfsPlaylist(tree);

  return {
    id: libraryId,
    name: rootName,
    tree,
    flatPlaylist,
    sourceType: 'fs-access',
    handle: rootHandle,
  };
}
