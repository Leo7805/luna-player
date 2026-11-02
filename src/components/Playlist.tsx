import { useState, useMemo } from 'react';
import { Search, X, ListVideo, ChevronsUpDown } from 'lucide-react';
import { VideoLibrary, VideoItem } from '../types/video';
import { PlaylistFolder } from './PlaylistFolder';

interface PlaylistProps {
  library: VideoLibrary;
  currentVideo: VideoItem | null;
  onSelectVideo: (video: VideoItem) => void;
}

export function Playlist({ library, currentVideo, onSelectVideo }: PlaylistProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [manualExpandAll, setManualExpandAll] = useState<boolean | null>(null);

  const totalVideos = library.flatPlaylist.length;
  const defaultExpanded = manualExpandAll !== null ? manualExpandAll : totalVideos <= 50;

  const matchingCount = useMemo(() => {
    if (!searchQuery.trim()) return totalVideos;
    const q = searchQuery.toLowerCase();
    return library.flatPlaylist.filter(
      (v) => v.name.toLowerCase().includes(q) || v.relativePath.toLowerCase().includes(q)
    ).length;
  }, [searchQuery, library.flatPlaylist, totalVideos]);

  return (
    <div className="flex flex-col h-full rounded-2xl glass-panel shadow-2xl overflow-hidden transition-colors duration-300">
      {/* Playlist Header */}
      <div className="p-3.5 border-b border-slate-300/60 dark:border-white/10 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ListVideo className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Playlist</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/5 text-slate-800 dark:text-slate-300 font-mono font-bold border border-slate-300 dark:border-white/10">
              {searchQuery ? `${matchingCount}/${totalVideos}` : totalVideos}
            </span>
          </div>

          <button
            onClick={() => setManualExpandAll((prev) => (prev ? false : true))}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition px-2 py-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/5 cursor-pointer"
            title="Toggle expand/collapse all folders"
          >
            <ChevronsUpDown className="h-3 w-3 text-slate-600 dark:text-slate-400" />
            <span>{defaultExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500 dark:text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos by title or path..."
            className="w-full pl-8.5 pr-8 py-1.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-xs text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 font-medium focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 p-0.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Playlist Content: Scrollable Tree */}
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
        {matchingCount === 0 ? (
          <div className="p-8 text-center text-slate-600 dark:text-slate-400">
            <p className="text-xs font-medium">No videos match "{searchQuery}"</p>
          </div>
        ) : (
          <PlaylistFolder
            key={`${library.id}-${manualExpandAll}`}
            folder={library.tree}
            libraryId={library.id}
            depth={0}
            currentVideoId={currentVideo?.id || null}
            onSelectVideo={onSelectVideo}
            searchQuery={searchQuery}
            defaultExpanded={defaultExpanded}
          />
        )}
      </div>
    </div>
  );
}
