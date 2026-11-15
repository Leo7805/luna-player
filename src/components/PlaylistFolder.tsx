import { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react';
import { FolderNode, VideoItem } from '../types/video';
import { PlaylistItem } from './PlaylistItem';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

export interface ExpansionOverride {
  version: number;
  expanded: boolean;
}

interface PlaylistFolderProps {
  folder: FolderNode;
  libraryId: string;
  depth: number;
  currentVideoId: string | null;
  onSelectVideo: (video: VideoItem) => void;
  searchQuery: string;
  defaultExpanded: boolean;
  expansionOverride: ExpansionOverride | null;
}

function folderContainsVideo(folder: FolderNode, videoId: string): boolean {
  if (folder.videos.some((v) => v.id === videoId)) return true;
  return folder.subfolders.some((sub) => folderContainsVideo(sub, videoId));
}

export function PlaylistFolder({
  folder,
  libraryId,
  depth,
  currentVideoId,
  onSelectVideo,
  searchQuery,
  defaultExpanded,
  expansionOverride,
}: PlaylistFolderProps) {
  const [isExpanded, setIsExpanded] = useState(
    expansionOverride ? expansionOverride.expanded : defaultExpanded
  );
  const prevVideoIdRef = useRef<string | null>(null);
  const prevOverrideVersionRef = useRef<number>(expansionOverride?.version ?? 0);

  // Explicit user action: Expand All / Collapse All takes precedence over current state
  useEffect(() => {
    if (!expansionOverride) return;
    if (expansionOverride.version !== prevOverrideVersionRef.current) {
      prevOverrideVersionRef.current = expansionOverride.version;
      setIsExpanded(expansionOverride.expanded);
    }
  }, [expansionOverride]);

  // If search query is present, auto-expand to display matching search results
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      setIsExpanded(true);
    }
  }, [searchQuery]);

  // Auto-expand only when navigating to a newly selected video (never after Collapse All)
  useEffect(() => {
    if (!currentVideoId || currentVideoId === prevVideoIdRef.current) {
      prevVideoIdRef.current = currentVideoId;
      return;
    }
    prevVideoIdRef.current = currentVideoId;

    if (folderContainsVideo(folder, currentVideoId)) {
      setIsExpanded(true);
    }
  }, [currentVideoId, folder]);

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
            setIsExpanded((prev) => !prev);
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
              defaultExpanded={defaultExpanded}
              expansionOverride={expansionOverride}
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
