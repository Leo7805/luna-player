import { useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { FolderNode, VideoItem } from '../types/video';
import { PlaylistItem } from './PlaylistItem';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface PlaylistFolderProps {
  folder: FolderNode;
  libraryId: string;
  depth: number;
  currentVideoId: string | null;
  onSelectVideo: (video: VideoItem) => void;
  searchQuery: string;
  expandedFolderIds: ReadonlySet<string>;
  onToggleFolder: (folderId: string) => void;
  onAutoExpandFolder: (folderId: string) => void;
  selectedExpansionBlocked: boolean;
  searchExpansionBlocked: boolean;
}

function folderContainsVideo(folder: FolderNode, videoId: string): boolean {
  if (folder.videos.some((v) => v.id === videoId)) return true;
  return folder.subfolders.some((sub) => folderContainsVideo(sub, videoId));
}

export function folderContainsSearchMatch(folder: FolderNode, searchQuery: string): boolean {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return false;
  return (
    folder.videos.some(
      (video) =>
        video.name.toLowerCase().includes(query) ||
        video.relativePath.toLowerCase().includes(query)
    ) || folder.subfolders.some((subfolder) => folderContainsSearchMatch(subfolder, query))
  );
}

export function collectFolderIds(folder: FolderNode): string[] {
  return [
    ...(folder.relativePath ? [folder.id] : []),
    ...folder.subfolders.flatMap((subfolder) => collectFolderIds(subfolder)),
  ];
}

export function setAllFolderExpansion(folderIds: readonly string[], expanded: boolean): Set<string> {
  return expanded ? new Set(folderIds) : new Set();
}

export function toggleFolderExpansion(
  expandedFolderIds: ReadonlySet<string>,
  folderId: string
): Set<string> {
  const next = new Set(expandedFolderIds);
  if (next.has(folderId)) next.delete(folderId);
  else next.add(folderId);
  return next;
}

export function PlaylistFolder({
  folder,
  libraryId,
  depth,
  currentVideoId,
  onSelectVideo,
  searchQuery,
  expandedFolderIds,
  onToggleFolder,
  onAutoExpandFolder,
  selectedExpansionBlocked,
  searchExpansionBlocked,
}: PlaylistFolderProps) {
  const prevVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!currentVideoId || currentVideoId === prevVideoIdRef.current) {
      prevVideoIdRef.current = currentVideoId;
      return;
    }
    prevVideoIdRef.current = currentVideoId;

    if (!selectedExpansionBlocked && folderContainsVideo(folder, currentVideoId)) {
      onAutoExpandFolder(folder.id);
    }
  }, [currentVideoId, folder, onAutoExpandFolder, selectedExpansionBlocked]);

  const hasSubfolders = folder.subfolders.length > 0;
  const hasVideos = folder.videos.length > 0;

  // Filter direct videos if search query is active
  const filteredVideos = searchQuery.trim()
    ? folder.videos.filter((v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.relativePath.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : folder.videos;

  const isSearching = searchQuery.trim().length > 0;
  const isExpanded =
    expandedFolderIds.has(folder.id) ||
    ((!searchExpansionBlocked && isSearching && folderContainsSearchMatch(folder, searchQuery)) ||
      (!selectedExpansionBlocked &&
        !!currentVideoId &&
        folderContainsVideo(folder, currentVideoId)));

  if (isSearching && filteredVideos.length === 0 && folder.subfolders.length === 0) {
    return null;
  }

  return (
    <div className="select-none">
      {/* Folder Header (Omit for virtual root) */}
      {folder.relativePath !== '' && (
        <button
          type="button"
          onClick={(e) => {
            blurButtonAfterPointerClick(e);
            onToggleFolder(folder.id);
          }}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5 transition cursor-pointer"
          style={{ paddingLeft: `${Math.max(10, depth * 16)}px` }}
        >
          <div className="flex items-center gap-2 truncate">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-400" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400/90" />
            ) : (
              <Folder className="h-4 w-4 shrink-0 text-sky-700/80 dark:text-sky-400/70" />
            )}
            <span className="truncate text-slate-900 dark:text-white font-semibold">{folder.name}</span>
          </div>

          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/5 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-300 dark:border-white/10">
            {folder.totalVideoCount}
          </span>
        </button>
      )}

      {/* Folder Content */}
      {(isExpanded || folder.relativePath === '') && (
        <div className="space-y-0.5">
          {/* Direct Videos */}
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              style={{
                paddingLeft: folder.relativePath !== '' ? `${(depth + 1) * 16}px` : '4px',
              }}
            >
              <PlaylistItem
                video={video}
                libraryId={libraryId}
                isActive={currentVideoId === video.id}
                onSelect={onSelectVideo}
                showRelativePath={isSearching}
              />
            </div>
          ))}

          {/* Subfolders */}
          {folder.subfolders.map((subfolder) => (
            <PlaylistFolder
              key={subfolder.id}
              folder={subfolder}
              libraryId={libraryId}
              depth={folder.relativePath !== '' ? depth + 1 : 0}
              currentVideoId={currentVideoId}
              onSelectVideo={onSelectVideo}
              searchQuery={searchQuery}
              expandedFolderIds={expandedFolderIds}
              onToggleFolder={onToggleFolder}
              onAutoExpandFolder={onAutoExpandFolder}
              selectedExpansionBlocked={selectedExpansionBlocked}
              searchExpansionBlocked={searchExpansionBlocked}
            />
          ))}

          {/* Empty state for search with no matches in direct folder */}
          {isSearching && filteredVideos.length === 0 && !hasSubfolders && (
            <p
              className="text-[11px] text-slate-600 dark:text-slate-400 italic py-1 font-medium"
              style={{ paddingLeft: `${(depth + 1) * 16}px` }}
            >
              No matching videos in this folder
            </p>
          )}

          {!isSearching && !hasVideos && !hasSubfolders && (
            <p
              className="text-[11px] text-slate-600 dark:text-slate-400 italic py-1 font-medium"
              style={{ paddingLeft: `${(depth + 1) * 16}px` }}
            >
              No video files
            </p>
          )}
        </div>
      )}
    </div>
  );
}
