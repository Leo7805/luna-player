import { SkipBack, SkipForward, PlaySquare, ToggleLeft, ToggleRight, Maximize2, Minimize2 } from 'lucide-react';
import { VideoItem } from '../types/video';

interface PlayerControlsProps {
  currentVideo: VideoItem | null;
  currentIndex: number;
  totalCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
  autoplayNext: boolean;
  isTheaterMode: boolean;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onToggleAutoplayNext: () => void;
  onToggleTheaterMode: () => void;
}

export function PlayerControls({
  currentVideo,
  currentIndex,
  totalCount,
  hasNext,
  hasPrevious,
  autoplayNext,
  isTheaterMode,
  onPlayNext,
  onPlayPrevious,
  onToggleAutoplayNext,
  onToggleTheaterMode,
}: PlayerControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl glass-panel transition-colors duration-300">
      {/* Title & Path Info */}
      <div className="flex-1 min-w-0">
        {currentVideo ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-sky-800 dark:text-sky-300 bg-sky-100 dark:bg-sky-500/10 px-2 py-0.5 rounded border border-sky-300 dark:border-sky-500/20">
                {currentIndex + 1} of {totalCount}
              </span>
              <span
                className="text-xs text-slate-600 dark:text-slate-400 font-medium truncate max-w-[300px]"
                title={currentVideo.relativePath}
              >
                {currentVideo.relativePath}
              </span>
            </div>
            <h2
              className="text-base font-bold text-slate-900 dark:text-white truncate mt-1"
              title={currentVideo.name}
            >
              {currentVideo.name}
            </h2>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm font-medium">
            <PlaySquare className="h-4 w-4 text-slate-500" />
            <span>No video selected</span>
          </div>
        )}
      </div>

      {/* Playback Controls & Toggles */}
      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        {/* Previous & Next */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPlayPrevious}
            disabled={!hasPrevious}
            className="glass-button p-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Previous video (DFS order)"
            aria-label="Previous video"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={onPlayNext}
            disabled={!hasNext}
            className="glass-button p-2.5 rounded-xl text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Next video (DFS order)"
            aria-label="Next video"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="h-6 w-px bg-slate-300 dark:bg-white/10 hidden sm:block" />

        {/* Theater Mode Toggle Button */}
        <button
          onClick={onToggleTheaterMode}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-panel-subtle hover:bg-slate-200 dark:hover:bg-white/10 transition text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer border border-slate-300/80 dark:border-white/10"
          aria-label={isTheaterMode ? 'Exit theater mode' : 'Enter theater mode'}
          title={isTheaterMode ? 'Exit theater mode' : 'Theater mode'}
        >
          {isTheaterMode ? (
            <>
              <Minimize2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span className="hidden md:inline">Normal</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5 text-slate-700 dark:text-slate-300" />
              <span className="hidden md:inline">Theater</span>
            </>
          )}
        </button>

        {/* Autoplay-Next Toggle */}
        <button
          onClick={onToggleAutoplayNext}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-subtle hover:bg-slate-200 dark:hover:bg-white/10 transition text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer border border-slate-300/80 dark:border-white/10"
          title={autoplayNext ? 'Autoplay next is enabled' : 'Autoplay next is disabled'}
          aria-label="Toggle autoplay next"
        >
          <span className="hidden sm:inline">Autoplay</span>
          {autoplayNext ? (
            <ToggleRight className="h-5 w-5 text-sky-600 dark:text-sky-400 fill-sky-600/20" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
}
