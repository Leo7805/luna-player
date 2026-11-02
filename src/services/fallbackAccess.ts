import { VideoItem, VideoLibrary } from '../types/video';
import { isSupportedVideoFile, buildFolderTree, flattenTreeToDfsPlaylist } from '../utils/videoTree';

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
