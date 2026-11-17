import { VideoItem, VideoLibrary } from '../types/video';
import { isSupportedVideoFile, buildFolderTree, flattenTreeToDfsPlaylist } from '../utils/videoTree';

/**
 * Checks whether the File System Access API's showOpenFilePicker is supported.
 */
export function isFsaOpenFileSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';
}

/**
 * Prompts the user to pick one or more video files using the File System Access API.
 * Returns null if the user cancels or if the API is unsupported.
 */
export async function promptOpenFiles(): Promise<FileSystemFileHandle[] | null> {
  if (!isFsaOpenFileSupported()) return null;

  try {
    const handles = await window.showOpenFilePicker({
      multiple: true,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'Video files',
          accept: {
            'video/*': ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.ogg', '.ogv', '.ts'],
          },
        },
      ],
    });
    return handles && handles.length > 0 ? handles : null;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // User cancelled picker dialog
      return null;
    }
    throw err;
  }
}

/**
 * Verifies read permission for an array of FileSystemFileHandle objects.
 * When requestIfPrompt is false, it performs a non-intrusive query (safe during startup).
 * When requestIfPrompt is true, it requests permission (must be invoked during a user gesture).
 */
export async function verifyFileHandlesPermission(
  handles: FileSystemFileHandle[],
  requestIfPrompt = false
): Promise<boolean> {
  if (!handles || handles.length === 0) return false;

  try {
    for (const handle of handles) {
      if (typeof handle.queryPermission !== 'function') return true;

      const current = await handle.queryPermission({ mode: 'read' });
      if (current === 'granted') {
        continue;
      }

      if (current === 'prompt') {
        if (!requestIfPrompt) {
          return false;
        }
        if (typeof handle.requestPermission === 'function') {
          const requested = await handle.requestPermission({ mode: 'read' });
          if (requested !== 'granted') {
            return false;
          }
        } else {
          return false;
        }
      } else {
        // 'denied'
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans an array of FileSystemFileHandle objects, re-validates each file using handle.getFile(),
 * skips any moved/deleted/inaccessible files gracefully, and returns a unified VideoLibrary.
 */
export async function scanFileHandles(
  handles: FileSystemFileHandle[],
  onProgress?: (count: number) => void
): Promise<VideoLibrary | null> {
  if (!handles || handles.length === 0) return null;

  const discoveredVideos: VideoItem[] = [];
  const seenNames = new Map<string, number>();
  const validHandles: FileSystemFileHandle[] = [];

  for (const handle of handles) {
    try {
      const file = await handle.getFile();
      const isVideo =
        isSupportedVideoFile(file.name) ||
        Boolean(file.type && file.type.startsWith('video/'));

      if (!isVideo) continue;

      const count = (seenNames.get(file.name) ?? 0) + 1;
      seenNames.set(file.name, count);
      const uniqueId = count === 1 ? file.name : `${file.name} (${count})`;

      discoveredVideos.push({
        id: uniqueId,
        name: file.name,
        relativePath: file.name,
        size: file.size,
        lastModified: file.lastModified,
        handle,
        file,
      });
      validHandles.push(handle);

      if (onProgress && discoveredVideos.length % 5 === 0) {
        onProgress(discoveredVideos.length);
      }
    } catch {
      // Gracefully skip missing, deleted, or inaccessible files
    }
  }

  if (discoveredVideos.length === 0) return null;

  const rootName = 'Selected Videos';
  const libraryId = `files:${rootName}`;
  const tree = buildFolderTree(rootName, discoveredVideos);
  const flatPlaylist = flattenTreeToDfsPlaylist(tree);

  return {
    id: libraryId,
    name: rootName,
    tree,
    flatPlaylist,
    sourceType: 'files',
    fileHandles: validHandles,
  };
}
