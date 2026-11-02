import { useRef } from 'react';
import { FolderOpen, ShieldCheck, Zap, Layers } from 'lucide-react';

interface EmptyStateProps {
  onOpenFolder: () => void;
  onFallbackSelect: (files: FileList | null) => void;
  isFsaSupported: boolean;
  isScanning: boolean;
  scanCount: number;
  error: string | null;
}

export function EmptyState({
  onOpenFolder,
  onFallbackSelect,
  isFsaSupported,
  isScanning,
  scanCount,
  error,
}: EmptyStateProps) {
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenClick = () => {
    if (isFsaSupported) {
      onOpenFolder();
    } else {
      fallbackInputRef.current?.click();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-xl w-full rounded-3xl glass-panel p-8 sm:p-10 shadow-2xl backdrop-blur-2xl text-center transition-colors duration-300">
        {/* Hidden Fallback Input */}
        <input
          ref={fallbackInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in HTML5 directory inputs
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => {
            onFallbackSelect(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Icon & Glow */}
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-sky-500/20 via-indigo-500/20 to-sky-400/30 border border-sky-400/30 text-sky-500 dark:text-sky-400 shadow-xl shadow-sky-500/10">
          <FolderOpen className="h-9 w-9" />
          <div className="absolute inset-0 rounded-3xl bg-sky-400/10 blur-xl -z-10" />
        </div>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
          Luna Player
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto mb-8 leading-relaxed">
          Open a local video folder to discover movies, shows, or personal clips across nested subdirectories with instant playback.
        </p>

        {/* Action Button */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleOpenClick}
            disabled={isScanning}
            className="flex items-center gap-3 px-7 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm shadow-xl shadow-sky-500/25 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            <FolderOpen className="h-5 w-5" />
            <span>{isScanning ? `Scanning folder (${scanCount} found)...` : 'Open Video Folder'}</span>
          </button>

          {isFsaSupported && (
            <button
              onClick={() => fallbackInputRef.current?.click()}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition underline underline-offset-4 cursor-pointer mt-1"
            >
              Or select via traditional folder picker
            </button>
          )}
        </div>

        {/* Error message if present */}
        {error && (
          <div className="mt-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Features Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10 pt-8 border-t border-slate-300/80 dark:border-white/10 text-left">
          <div className="flex items-start gap-3 p-3 rounded-xl glass-panel-subtle">
            <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">100% Private</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug font-medium">
                Files never leave your device or upload to any cloud.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl glass-panel-subtle">
            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Nested Folders</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug font-medium">
                Recursively scans subfolders with natural numeric sorting.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl glass-panel-subtle">
            <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Resume & Next</h4>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 leading-snug font-medium">
                Saves playback position and autoplays subsequent videos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
