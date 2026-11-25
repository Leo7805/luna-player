import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  X,
  ListVideo,
  ChevronsUpDown,
  ChevronsDownUp,
  AudioLines,
  PanelRight,
} from 'lucide-react';
import { VideoLibrary, VideoItem } from '../types/video';
import {
  PlaylistFolder,
  collectFolderIds,
  setAllFolderExpansion,
  toggleFolderExpansion,
} from './PlaylistFolder';
import { Tooltip } from './Tooltip';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface PlaylistProps {
  library: VideoLibrary;
  currentVideo: VideoItem | null;
  onSelectVideo: (video: VideoItem) => void;
  onCollapseSidebar?: () => void;
  onOpenExtractAudio?: () => void;
  isExtractionRunning?: boolean;
}

export function Playlist({
  library,
  currentVideo,
  onSelectVideo,
  onCollapseSidebar,
  onOpenExtractAudio,
  isExtractionRunning = false,
}: PlaylistProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const expandableFolderIds = useMemo(() => collectFolderIds(library.tree), [library.tree]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(library.flatPlaylist.length <= 50 ? expandableFolderIds : [])
  );
  const [expansionLibraryId, setExpansionLibraryId] = useState(library.id);
  const [selectedExpansionBlocked, setSelectedExpansionBlocked] = useState(false);
  const [searchExpansionBlockedQuery, setSearchExpansionBlockedQuery] = useState<string | null>(
    null
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const totalVideos = library.flatPlaylist.length;
  const canOpenExtractAudio = totalVideos > 0 || isExtractionRunning;
  const isFiltered = searchQuery.trim().length > 0;
  const hasExpandableFolders = library.tree.subfolders.length > 0;
  const isAllExpanded =
    expansionLibraryId === library.id &&
    expandableFolderIds.length > 0 &&
    expandableFolderIds.every((folderId) => expandedFolderIds.has(folderId));

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Reset folder expansion when switching to a different library.
  useEffect(() => {
    const shouldExpandInitially = library.flatPlaylist.length <= 50;
    setExpandedFolderIds(setAllFolderExpansion(expandableFolderIds, shouldExpandInitially));
    setExpansionLibraryId(library.id);
    setSelectedExpansionBlocked(false);
    setSearchExpansionBlockedQuery(null);
  }, [expandableFolderIds, library.flatPlaylist.length, library.id]);

  const handleToggleExpandAll = () => {
    const nextExpanded = !isAllExpanded;
    setExpandedFolderIds(setAllFolderExpansion(expandableFolderIds, nextExpanded));
    setSelectedExpansionBlocked(true);
    setSearchExpansionBlockedQuery(searchQuery.trim());
  };

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolderIds((previous) => toggleFolderExpansion(previous, folderId));
    setSelectedExpansionBlocked(false);
    setSearchExpansionBlockedQuery(null);
  }, []);

  const handleAutoExpandFolder = useCallback(
    (folderId: string) => {
      if (selectedExpansionBlocked) return;
      setExpandedFolderIds((previous) => {
        if (previous.has(folderId)) return previous;
        const next = new Set(previous);
        next.add(folderId);
        return next;
      });
    },
    [selectedExpansionBlocked]
  );

  const matchingCount = useMemo(() => {
    if (!searchQuery.trim()) return totalVideos;
    const q = searchQuery.toLowerCase();
    return library.flatPlaylist.filter(
      (v) => v.name.toLowerCase().includes(q) || v.relativePath.toLowerCase().includes(q)
    ).length;
  }, [searchQuery, library.flatPlaylist, totalVideos]);

  return (
    <div className="flex flex-col h-full rounded-2xl glass-panel shadow-2xl overflow-hidden transition-colors duration-300">
      {/* Playlist Header (Fixed single-row toolbar + optional collapsible search) */}
      <div className="px-3.5 py-3 border-b border-slate-300/60 dark:border-white/10 space-y-2.5 shrink-0">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <ListVideo className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">Playlist</h3>
            <span
              data-testid="playlist-count-badge"
              className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/5 text-slate-800 dark:text-slate-300 font-mono font-bold border border-slate-300 dark:border-white/10 shrink-0"
            >
              {isFiltered ? `${matchingCount}/${totalVideos}` : totalVideos}
            </span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Tooltip content="Search videos" placement="bottom">
              <button
                type="button"
                onClick={(e) => {
                  blurButtonAfterPointerClick(e);
                  setIsSearchOpen((prev) => !prev);
                }}
                className={`inline-flex items-center justify-center p-1.5 rounded-lg transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isFiltered
                    ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20'
                    : isSearchOpen
                    ? 'text-slate-950 dark:text-white bg-slate-200/70 dark:bg-white/10'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10'
                }`}
                aria-label="Search videos"
                aria-expanded={isSearchOpen}
                data-testid="toggle-search-button"
              >
                <Search className="h-4 w-4" />
              </button>
            </Tooltip>

            <Tooltip
              content={
                isExtractionRunning
                  ? 'Show Audio Extraction Progress'
                  : canOpenExtractAudio
                  ? 'Extract Audio'
                  : 'No videos loaded to extract audio'
              }
              placement="bottom"
            >
              <button
                type="button"
                disabled={!canOpenExtractAudio}
                onClick={(e) => {
                  blurButtonAfterPointerClick(e);
                  if (canOpenExtractAudio) onOpenExtractAudio?.();
                }}
                className={`relative inline-flex items-center justify-center p-1.5 rounded-lg transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-600 dark:disabled:hover:text-slate-300 ${
                  isExtractionRunning
                    ? 'text-sky-600 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20'
                    : 'text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-slate-200/60 dark:hover:bg-white/10'
                }`}
                aria-label={
                  isExtractionRunning
                    ? 'Show Audio Extraction Progress'
                    : canOpenExtractAudio
                    ? 'Extract Audio'
                    : 'Extract Audio (no videos loaded)'
                }
                data-testid="extract-audio-button"
              >
                <AudioLines className="h-4 w-4 shrink-0" />
                {isExtractionRunning && (
                  <span
                    className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-500"
                    aria-hidden="true"
                  />
                )}
              </button>
            </Tooltip>

            {hasExpandableFolders && (
            <Tooltip content={isAllExpanded ? 'Collapse All' : 'Expand All'} placement="bottom">
              <button
                type="button"
                onClick={(e) => {
                  blurButtonAfterPointerClick(e);
                  handleToggleExpandAll();
                }}
                className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label={isAllExpanded ? 'Collapse All' : 'Expand All'}
                data-testid="toggle-expand-all-button"
              >
                {isAllExpanded ? (
                  <ChevronsDownUp className="h-4 w-4" />
                ) : (
                  <ChevronsUpDown className="h-4 w-4" />
                )}
              </button>
            </Tooltip>
            )}

            {onCollapseSidebar && (
              <Tooltip content="Hide Playlist" placement="left">
                <button
                  type="button"
                  onClick={(e) => {
                    blurButtonAfterPointerClick(e);
                    onCollapseSidebar();
                  }}
                  className="hidden lg:inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  aria-label="Hide Playlist"
                  data-testid="collapse-playlist-button"
                >
                  <PanelRight className="h-4 w-4" />
                </button>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Collapsible Search Bar */}
        {isSearchOpen && (
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setIsSearchOpen(false);
                }
              }}
              placeholder="Search videos by title or path..."
              aria-label="Search videos by title or path"
              data-testid="playlist-search-input"
              className="w-full min-w-0 pl-8.5 pr-8 py-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 font-medium focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search"
                data-testid="clear-search-button"
                className="absolute right-2.5 top-2 p-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Playlist Content: Scrollable Tree */}
      <div
        className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1"
        data-testid="playlist-scroll-container"
      >
        {matchingCount === 0 ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">
            <p className="text-xs font-medium">No videos match "{searchQuery}"</p>
          </div>
        ) : (
          <PlaylistFolder
            key={library.id}
            folder={library.tree}
            libraryId={library.id}
            depth={0}
            currentVideoId={currentVideo?.id || null}
            onSelectVideo={onSelectVideo}
            searchQuery={searchQuery}
            expandedFolderIds={expansionLibraryId === library.id ? expandedFolderIds : new Set()}
            onToggleFolder={handleToggleFolder}
            onAutoExpandFolder={handleAutoExpandFolder}
            selectedExpansionBlocked={selectedExpansionBlocked}
            searchExpansionBlocked={searchQuery.trim() === searchExpansionBlockedQuery}
          />
        )}
      </div>
    </div>
  );
}
