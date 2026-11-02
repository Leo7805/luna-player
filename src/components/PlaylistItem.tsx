import { useEffect, useRef } from 'react';
import { Play, CheckCircle2 } from 'lucide-react';
import { VideoItem } from '../types/video';
import { getVideoProgress } from '../services/progressStorage';
import { formatDuration, formatFileSize } from '../utils/formatters';

interface PlaylistItemProps {
  video: VideoItem;
  libraryId: string;
  isActive: boolean;
  onSelect: (video: VideoItem) => void;
  showRelativePath?: boolean;
}

export function PlaylistItem({
  video,
  libraryId,
  isActive,
  onSelect,
  showRelativePath = false,
}: PlaylistItemProps) {
  const itemRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll into view when active
  useEffect(() => {
    if (isActive && itemRef.current) {
      itemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [isActive]);

  const progress = getVideoProgress(
    libraryId,
    video.relativePath,
    video.size,
    video.lastModified
  );

  const percentComplete =
    progress && progress.duration > 0
      ? Math.min(100, Math.round((progress.currentTime / progress.duration) * 100))
      : 0;

  return (
    <button
      ref={itemRef}
      onClick={() => onSelect(video)}
      className={`w-full group text-left px-3 py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-between gap-3 border ${
        isActive
          ? 'bg-sky-100/90 dark:bg-sky-500/20 border-sky-400 dark:border-sky-500/40 text-sky-950 dark:text-white font-semibold shadow-sm'
          : 'border-transparent text-slate-800 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-white/5 hover:text-slate-950 dark:hover:text-white'
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition ${
            isActive
              ? 'bg-sky-600 dark:bg-sky-500 text-white dark:text-slate-950 font-bold'
              : 'bg-slate-200/80 dark:bg-white/5 text-slate-700 dark:text-slate-400 group-hover:text-slate-950 dark:group-hover:text-slate-200 group-hover:bg-slate-300/80 dark:group-hover:bg-white/10'
          }`}
        >
          {isActive ? (
            <Play className="h-3 w-3 fill-current ml-0.5" />
          ) : progress?.completed ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Play className="h-2.5 w-2.5 ml-0.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={`truncate leading-tight ${
              isActive
                ? 'font-bold text-sky-950 dark:text-sky-100'
                : 'font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white'
            }`}
          >
            {video.name}
          </p>
          {showRelativePath && (
            <p
              className={`text-[10px] truncate mt-0.5 ${
                isActive
                  ? 'text-sky-800 dark:text-sky-300 font-medium'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {video.relativePath}
            </p>
          )}

          {/* Progress bar if partially watched */}
          {percentComplete > 0 && !progress?.completed && (
            <div className="w-full bg-slate-300/80 dark:bg-white/10 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-sky-600 dark:bg-sky-400 h-full rounded-full"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex flex-col items-end shrink-0 text-[10px] font-mono font-medium ${
          isActive
            ? 'text-sky-900 dark:text-sky-200 font-semibold'
            : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {progress && progress.currentTime > 5 && !progress.completed ? (
          <span className="text-sky-800 dark:text-sky-300 font-semibold">
            {formatDuration(progress.currentTime)}
          </span>
        ) : (
          <span>{formatFileSize(video.size)}</span>
        )}
      </div>
    </button>
  );
}
