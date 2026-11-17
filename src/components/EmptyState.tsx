import { ShieldCheck, Zap, Layers } from 'lucide-react';
import { OpenVideoMode } from '../utils/platform';
import { OpenVideosControl } from './OpenVideosControl';

interface EmptyStateProps {
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onFallbackSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
  defaultOpenMode: OpenVideoMode;
  isFsaSupported: boolean;
  isFsaOpenFileSupported?: boolean;
  isScanning: boolean;
  scanCount: number;
  error: string | null;
}

export function EmptyState({
  onOpenFolder,
  onOpenFiles,
  onFallbackSelect,
  onOpenFilesSelect,
  defaultOpenMode,
  isFsaSupported,
  isFsaOpenFileSupported = false,
  isScanning,
  scanCount,
  error,
}: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-xl w-full rounded-3xl glass-panel p-8 sm:p-10 shadow-2xl backdrop-blur-2xl text-center transition-colors duration-300">
        {/* Brand Emblem */}
        <div className="relative mx-auto mb-6 flex items-center justify-center">
          <img
            src="/favicon.svg"
            alt="Luna Player"
            className="h-16 w-16 sm:h-18 sm:w-18 object-contain drop-shadow-xl"
          />
          <div className="absolute inset-0 rounded-full bg-sky-400/20 dark:bg-sky-500/20 blur-2xl -z-10 scale-125" />
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
          <OpenVideosControl
            variant="empty-state"
            defaultOpenMode={defaultOpenMode}
            isFsaSupported={isFsaSupported}
            isFsaOpenFileSupported={isFsaOpenFileSupported}
            isScanning={isScanning}
            scanCount={scanCount}
            onOpenFolder={onOpenFolder}
            onOpenFiles={onOpenFiles}
            onFallbackFolderSelect={onFallbackSelect}
            onOpenFilesSelect={onOpenFilesSelect}
          />
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
