import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  X,
  ListVideo,
  ChevronsUp,
  ChevronsDown,
  AudioLines,
  PanelRight,
} from 'lucide-react';
import { VideoLibrary, VideoItem } from '../types/video';
import { PlaylistFolder, ExpansionOverride } from './PlaylistFolder';
import { ExtractAudioDialog } from './ExtractAudioDialog';
import { Tooltip } from './Tooltip';

interface PlaylistProps {
  library: VideoLibrary;
  currentVideo: VideoItem | null;
  onSelectVideo: (video: VideoItem) => void;
  onCollapseSidebar?: () => void;
}

export function Playlist({
  library,
  currentVideo,
  onSelectVideo,
  onCollapseSidebar,
}: PlaylistProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [manualExpandAll, setManualExpandAll] = useState<boolean | null>(null);
  const [expansionOverride, setExpansionOverride] = useState<ExpansionOverride | null>(null);
  const [isExtractDialogOpen, setIsExtractDialogOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const totalVideos = library.flatPlaylist.length;
  const isFilesMode = library.sourceType === 'files';
  const isAllExpanded = manualExpandAll !== null ? manualExpandAll : totalVideos <= 50;
  const isFiltered = searchQuery.trim().length > 0;

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    }
  }, [isSearchOpen]);

  // Reset manual expand override when switching to a different library
  useEffect(() => {
    setManualExpandAll(null);
    setExpansionOverride(null);
  }, [library.id]);

  const handleToggleExpandAll = () => {
    const nextExpanded = !isAllExpanded;
    setManualExpandAll(nextExpanded);
    setExpansionOverride((prev) => ({
      version: (prev?.version ?? 0) + 1,
      expanded: nextExpanded,
    }));
  };

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
                onClick={() => setIsSearchOpen((prev) => !prev)}
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

            {totalVideos > 0 && (
              <Tooltip
                content={isFilesMode ? 'Extract Audio requires folder mode' : 'Extract Audio'}
                placement="bottom"
              >
                <button
                  type="button"
                  disabled={isFilesMode}
                  onClick={() => {
                    if (!isFilesMode) setIsExtractDialogOpen(true);
                  }}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-300 hover:bg-slate-200/60 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-600 dark:disabled:hover:text-slate-300 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  aria-label={
                    isFilesMode ? 'Extract Audio (requires folder mode)' : 'Extract Audio'
                  }
                  data-testid="extract-audio-button"
                >
                  <AudioLines className="h-4 w-4 shrink-0" />
                </button>
              </Tooltip>
            )}

            <Tooltip content={isAllExpanded ? 'Collapse All' : 'Expand All'} placement="bottom">
              <button
                type="button"
                onClick={handleToggleExpandAll}
                className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label={isAllExpanded ? 'Collapse All' : 'Expand All'}
                data-testid="toggle-expand-all-button"
              >
                {isAllExpanded ? (
                  <ChevronsUp className="h-4 w-4" />
                ) : (
                  <ChevronsDown className="h-4 w-4" />
                )}
              </button>
            </Tooltip>

            {onCollapseSidebar && (
              <Tooltip content="Hide Playlist" placement="left">
                <button
                  type="button"
                  onClick={onCollapseSidebar}
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
            defaultExpanded={isAllExpanded}
            expansionOverride={expansionOverride}
          />
        )}
      </div>

      {isExtractDialogOpen && (
        <ExtractAudioDialog
          isOpen={isExtractDialogOpen}
          onClose={() => setIsExtractDialogOpen(false)}
          library={library}
        />
      )}
    </div>
  );
}
