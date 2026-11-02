/**
 * Core types for Luna Player
 */

export interface VideoItem {
  id: string; // Unique within library: relativePath
  name: string; // File name without directory path
  relativePath: string; // Relative path from root folder (e.g. "Season 1/Ep 01.mp4")
  size: number; // File size in bytes
  lastModified: number; // Timestamp
  handle?: FileSystemFileHandle; // Present in File System Access API mode
  file?: File; // Present in Fallback <input> mode or loaded lazily
}

export interface FolderNode {
  id: string; // Relative path or "root"
  name: string; // Display name
  relativePath: string;
  videos: VideoItem[]; // Sorted naturally
  subfolders: FolderNode[]; // Sorted naturally
  totalVideoCount: number; // Total videos in this folder and all subfolders
}

export interface VideoLibrary {
  id: string; // Stable identifier for the current root folder/library
  name: string; // Name of the selected root folder
  tree: FolderNode; // Root folder node
  flatPlaylist: VideoItem[]; // Deterministic DFS ordered playback list
  sourceType: 'fs-access' | 'input-fallback';
  handle?: FileSystemDirectoryHandle;
}

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
  updatedAt: number;
  completed?: boolean;
}

export interface PlayerSettings {
  autoplayNext: boolean;
  volume: number;
  muted: boolean;
  lastPlayedId?: string;
  lastLibraryId?: string;
}

/**
 * Creates a unique, collision-proof key for storing playback progress.
 * Accounts for root folder identity, path, size, and modification date.
 */
export function createVideoStorageKey(
  libraryId: string,
  relativePath: string,
  size: number,
  lastModified: number
): string {
  return `${libraryId}::${relativePath}::${size}::${lastModified}`;
}
