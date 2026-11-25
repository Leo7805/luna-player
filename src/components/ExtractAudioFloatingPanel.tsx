import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Maximize2,
  X,
} from 'lucide-react';
import {
  BatchExtractionProgress,
  BatchProcessingStage,
} from '../services/audioExtractionService';
import { computeBatchProgressMetrics } from '../utils/audioExtractor';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface ExtractAudioFloatingPanelProps {
  progress: BatchExtractionProgress | null;
  totalVideos: number;
  isTheaterMode: boolean;
  onRestore: () => void;
  onDismiss: () => void;
}

const STAGE_LABELS: Record<BatchProcessingStage, string> = {
  preparing: 'Preparing',
  reading: 'Reading',
  encoding: 'Encoding',
  saving: 'Saving',
};

export function ExtractAudioFloatingPanel({
  progress,
  totalVideos,
  isTheaterMode,
  onRestore,
  onDismiss,
}: ExtractAudioFloatingPanelProps) {
  const [fullscreenTarget, setFullscreenTarget] = useState<Element | null>(() =>
    typeof document !== 'undefined' ? document.fullscreenElement : null
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      setFullscreenTarget(document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const state = progress?.state ?? 'idle';
  const isRunning = state === 'initializing' || state === 'processing';
  const isTerminal = state === 'completed' || state === 'cancelled' || state === 'error';

  const totalFiles = progress?.totalFiles ?? totalVideos;
  const completedCount = progress?.completedCount ?? 0;
  const skippedCount = progress?.skippedCount ?? 0;
  const failedCount = progress?.failedCount ?? 0;
  const { processedCount, progressPercent } = computeBatchProgressMetrics({
    totalFiles,
    completedCount,
    skippedCount,
    failedCount,
  });

  const title =
    state === 'completed'
      ? 'Extraction Complete'
      : state === 'cancelled'
      ? 'Extraction Cancelled'
      : state === 'error'
      ? 'Extraction Failed'
      : 'Extracting Audio';

  const positionLabel =
    state === 'initializing'
      ? `Preparing 0 / ${totalFiles}`
      : state === 'processing'
      ? `Processing ${progress?.currentIndex ?? 0} / ${totalFiles}`
      : state === 'completed'
      ? `Completed ${totalFiles} / ${totalFiles}`
      : state === 'cancelled'
      ? `Cancelled (${processedCount} / ${totalFiles})`
      : state === 'error'
      ? `Stopped (${processedCount} / ${totalFiles})`
      : `${totalFiles} ${totalFiles === 1 ? 'video' : 'videos'} ready`;

  const stageLabel =
    isRunning && progress?.currentStage ? STAGE_LABELS[progress.currentStage] : null;

  const isElevatedOverlay = isTheaterMode || Boolean(fullscreenTarget);

  const panel = (
    <section
      role="region"
      aria-label="Audio extraction progress"
      data-testid="extract-audio-floating-panel"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      className={`fixed right-3 sm:right-4 ${
        isElevatedOverlay ? 'bottom-24 z-[60]' : 'bottom-4 z-40'
      } w-[min(calc(100vw-1.5rem),21rem)] rounded-2xl glass-panel border border-slate-300/80 dark:border-white/15 shadow-2xl p-3.5 text-slate-900 dark:text-slate-100 select-none transition-all duration-200`}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
          ) : state === 'completed' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : state === 'cancelled' ? (
            <Ban className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
          )}
          <span
            className="text-xs font-bold tracking-tight text-slate-900 dark:text-white truncate"
            data-testid="floating-panel-title"
          >
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              blurButtonAfterPointerClick(e);
              onRestore();
            }}
            className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            aria-label="Restore Extract Audio dialog"
            title="Expand"
            data-testid="extract-audio-restore-button"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          {isTerminal && (
            <button
              type="button"
              onClick={(e) => {
                blurButtonAfterPointerClick(e);
                onDismiss();
              }}
              className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              aria-label="Dismiss audio extraction panel"
              title="Dismiss"
              data-testid="extract-audio-dismiss-button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Position + Overall Percentage */}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
        <span
          className="font-semibold text-slate-800 dark:text-slate-200 truncate"
          data-testid="floating-progress-position"
        >
          {positionLabel}
        </span>
        <span
          className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 tabular-nums shrink-0"
          data-testid="floating-progress-percent"
        >
          {progressPercent}%
        </span>
      </div>

      {/* Overall Progress Bar */}
      <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-300/80 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-200 ${
            state === 'error'
              ? 'bg-rose-500'
              : state === 'cancelled'
              ? 'bg-amber-500'
              : state === 'completed'
              ? 'bg-emerald-500'
              : 'bg-sky-500'
          }`}
          style={{ width: `${progressPercent}%` }}
          role="progressbar"
          aria-label="Audio extraction progress"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Compact Statistics */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
        <span className="text-emerald-700 dark:text-emerald-300 font-medium" data-testid="floating-count-completed">
          {completedCount} completed
        </span>
        <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
        <span className="text-amber-700 dark:text-amber-300 font-medium" data-testid="floating-count-skipped">
          {skippedCount} skipped
        </span>
        <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">·</span>
        <span className="text-rose-700 dark:text-rose-300 font-medium" data-testid="floating-count-failed">
          {failedCount} failed
        </span>
      </div>

      {/* Active File & Stage (or Terminal Hint) */}
      <div className="mt-2 pt-2 border-t border-slate-300/60 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] min-w-0">
        {isRunning ? (
          <>
            <span
              className="font-mono text-slate-700 dark:text-slate-300 truncate min-w-0"
              title={progress?.currentRelativePath || progress?.currentFileName || undefined}
              data-testid="floating-current-file"
            >
              {progress?.currentFileName || 'Starting batch...'}
            </span>
            {stageLabel && (
              <span
                className="px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-800 dark:text-sky-300 text-[10px] font-semibold shrink-0"
                data-testid="floating-current-stage"
              >
                {stageLabel}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-600 dark:text-slate-400 truncate">
            Expand to view details{state !== 'completed' ? ' or retry' : ''}
          </span>
        )}
      </div>
    </section>
  );

  if (typeof document !== 'undefined') {
    const portalRoot = fullscreenTarget ?? document.body;
    if (portalRoot) {
      return createPortal(panel, portalRoot);
    }
  }

  return panel;
}
