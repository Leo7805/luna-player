import { VideoItem, VideoLibrary } from '../types/video';
import { isSupportedVideoFile, buildFolderTree, flattenTreeToDfsPlaylist } from '../utils/videoTree';

export function parseSelectedFiles(files: FileList | File[]): VideoLibrary | null {
  if (!files || files.length === 0) return null;

  const fileArray = Array.from(files);
  const discoveredVideos: VideoItem[] = [];
  const seenNames = new Map<string, number>();

  for (const file of fileArray) {
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
      file,
    });
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
  };
}

export function parseFileList(files: FileList | File[]): VideoLibrary | null {
  if (!files || files.length === 0) return null;

  const fileArray = Array.from(files);
  const discoveredVideos: VideoItem[] = [];
  let rootName = 'Local Library';

  // Determine root name from the first file's webkitRelativePath
  for (const file of fileArray) {
    const fullPath = file.webkitRelativePath || file.name;
    const parts = fullPath.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      rootName = parts[0];
      break;
    }
  }

  for (const file of fileArray) {
    if (!isSupportedVideoFile(file.name)) continue;

    const fullPath = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = fullPath.split('/');

    // Strip top-level folder name if webkitRelativePath prepended it
    let relativePath = fullPath;
    if (parts.length > 1 && parts[0] === rootName) {
      relativePath = parts.slice(1).join('/');
    }

    discoveredVideos.push({
      id: relativePath,
      name: file.name,
      relativePath,
      size: file.size,
      lastModified: file.lastModified,
      file,
    });
  }

  const libraryId = `input:${rootName}`;
  const tree = buildFolderTree(rootName, discoveredVideos);
  const flatPlaylist = flattenTreeToDfsPlaylist(tree);

  return {
    id: libraryId,
    name: rootName,
    tree,
    flatPlaylist,
    sourceType: 'input-fallback',
  };
}
