import { FolderNode, VideoItem } from '../types/video';
import { naturalSort } from './naturalSort';

export const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  'mp4',
  'webm',
  'mkv',
  'mov',
  'm4v',
  'ogg',
  'ogv',
]);

/**
 * Checks if a filename has a supported video extension.
 */
export function isSupportedVideoFile(filename: string): boolean {
  const parts = filename.split('.');
  if (parts.length < 2) return false;
  const ext = parts.pop()?.toLowerCase();
  return ext !== undefined && SUPPORTED_VIDEO_EXTENSIONS.has(ext);
}

/**
 * Normalizes relative paths to use forward slashes and trims leading/trailing slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

interface RawFolderBuilder {
  name: string;
  relativePath: string;
  videos: VideoItem[];
  subfolderMap: Map<string, RawFolderBuilder>;
}

/**
 * Builds a pruned, naturally sorted folder tree from a flat list of discovered video items.
 */
export function buildFolderTree(
  rootName: string,
  rawVideos: VideoItem[]
): FolderNode {
  const rootBuilder: RawFolderBuilder = {
    name: rootName || 'Library',
    relativePath: '',
    videos: [],
    subfolderMap: new Map(),
  };

  for (const video of rawVideos) {
    const normalized = normalizePath(video.relativePath);
    const parts = normalized.split('/');

    // If file is at root level
    if (parts.length <= 1) {
      rootBuilder.videos.push(video);
      continue;
    }

    // Traverse or create folder nodes
    let current = rootBuilder;
    const folderParts = parts.slice(0, parts.length - 1);
    let accumulatedPath = '';

    for (const folderName of folderParts) {
      accumulatedPath = accumulatedPath ? `${accumulatedPath}/${folderName}` : folderName;
      let next = current.subfolderMap.get(folderName);
      if (!next) {
        next = {
          name: folderName,
          relativePath: accumulatedPath,
          videos: [],
          subfolderMap: new Map(),
        };
        current.subfolderMap.set(folderName, next);
      }
      current = next;
    }

    current.videos.push(video);
  }

  // Convert builder to FolderNode with pruning, sorting, and counting
  function convert(builder: RawFolderBuilder): FolderNode | null {
    // 1. Sort direct videos naturally by filename
    const sortedVideos = naturalSort(builder.videos, (v) => v.name);

    // 2. Sort subfolders naturally by folder name and recursively prune
    const sortedSubfolderBuilders = naturalSort(
      Array.from(builder.subfolderMap.values()),
      (b) => b.name
    );

    const prunedSubfolders: FolderNode[] = [];
    let childVideoCount = 0;

    for (const subBuilder of sortedSubfolderBuilders) {
      const childNode = convert(subBuilder);
      if (childNode && childNode.totalVideoCount > 0) {
        prunedSubfolders.push(childNode);
        childVideoCount += childNode.totalVideoCount;
      }
    }

    const totalVideoCount = sortedVideos.length + childVideoCount;

    // Prune if neither direct videos nor subfolder videos exist
    if (totalVideoCount === 0 && builder.relativePath !== '') {
      return null;
    }

    return {
      id: builder.relativePath || 'root',
      name: builder.name,
      relativePath: builder.relativePath,
      videos: sortedVideos,
      subfolders: prunedSubfolders,
      totalVideoCount,
    };
  }

  const rootNode = convert(rootBuilder);
  if (!rootNode) {
    return {
      id: 'root',
      name: rootName || 'Library',
      relativePath: '',
      videos: [],
      subfolders: [],
      totalVideoCount: 0,
    };
  }

  return rootNode;
}

/**
 * Produces a deterministic depth-first search (DFS) playback order:
 * 1. Current folder's sorted videos first.
 * 2. Then recursively each sorted subfolder in order.
 */
export function flattenTreeToDfsPlaylist(node: FolderNode): VideoItem[] {
  const result: VideoItem[] = [];

  function traverse(current: FolderNode) {
    // 1. Current folder's videos first
    for (const video of current.videos) {
      result.push(video);
    }
    // 2. Then sorted subfolders
    for (const sub of current.subfolders) {
      traverse(sub);
    }
  }

  traverse(node);
  return result;
}
