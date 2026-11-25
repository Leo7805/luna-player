import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  AudioLines,
  Folder,
  CheckCircle2,
  AlertTriangle,
  X,
  Minus,
  Loader2,
  ShieldCheck,
  Ban,
  Copy,
  Check,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  AudioOutputFormat,
  AUDIO_FORMAT_CONFIGS,
  buildOutputFileName,
  computeBatchProgressMetrics,
  validateRelativePath,
} from '../utils/audioExtractor';
import {
  BatchExtractionProgress,
  FileExtractionRecord,
} from '../services/audioExtractionService';
import { ExtractionSourceSnapshot } from '../hooks/useAudioExtraction';

interface ExtractAudioDialogProps {
  isOpen: boolean;
  sourceSnapshot: ExtractionSourceSnapshot;
  format: AudioOutputFormat;
  outputDirHandle: FileSystemDirectoryHandle | null;
  isSameFolderWarning: boolean;
  pickerError: string | null;
  progress: BatchExtractionProgress | null;
  isRunning: boolean;
  fsaWriteSupported: boolean;
  onFormatChange: (format: AudioOutputFormat) => void;
  onChooseOutputFolder: () => Promise<FileSystemDirectoryHandle | null>;
  onStartExtraction: () => Promise<void>;
  onCancelExtraction: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

const MAX_VISIBLE_FAILED_RECORDS = 20;
const MAX_VISIBLE_SKIPPED_RECORDS = 20;

function formatFailedRecordForClipboard(rec: FileExtractionRecord): string {
  const lines = [
    `File: ${rec.relativePath}`,
    `Output: ${rec.outputRelativePath}`,
  ];
  if (rec.stageLabel || rec.stage) {
    lines.push(`Stage: ${rec.stageLabel ? `${rec.stageLabel} (${rec.stage})` : rec.stage}`);
  }
  lines.push(`Error Name: ${rec.errorName || 'Error'}`);
  lines.push(`Error Message: ${rec.errorMessage || rec.reason || 'Unknown error'}`);
  if (rec.friendlyExplanation) {
    lines.push(`Explanation: ${rec.friendlyExplanation}`);
  }
  if (rec.technicalDetails) {
    lines.push(`Technical Details:\n${rec.technicalDetails}`);
  }
  return lines.join('\n');
}

export function ExtractAudioDialog({
  isOpen,
  sourceSnapshot,
  format,
  outputDirHandle,
  isSameFolderWarning,
  pickerError,
  progress,
  isRunning,
  fsaWriteSupported,
  onFormatChange,
  onChooseOutputFolder,
  onStartExtraction,
  onCancelExtraction,
  onMinimize,
  onClose,
}: ExtractAudioDialogProps) {
  const [copiedRecordKey, setCopiedRecordKey] = useState<string | null>(null);

  const dialogPanelRef = useRef<HTMLDivElement | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFilesMode = sourceSnapshot.sourceType === 'files';
  const totalVideos = sourceSnapshot.videos.length;
  const canMinimize = isRunning || Boolean(progress && progress.state !== 'idle');

  // Clean up clipboard feedback timer only (never abort extraction on unmount)
  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  // Keyboard Escape handling, focus placement & background scroll lock while expanded dialog is open
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogPanelRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isRunning) {
          onMinimize();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isRunning, onMinimize, onClose]);

  // Build dynamic example output path from the active snapshot (or fallback example)
  const exampleOutputPath = useMemo(() => {
    const ext = AUDIO_FORMAT_CONFIGS[format].extension;
    if (sourceSnapshot.videos.length > 0) {
      if (isFilesMode) {
        const firstVideo = sourceSnapshot.videos[0];
        const validated = validateRelativePath(firstVideo.relativePath);
        if (validated.valid) {
          return buildOutputFileName(validated.fileName, format);
        }
        return buildOutputFileName(firstVideo.name, format);
      }
      // Prefer a nested video if one exists so the user sees folder preservation in the preview
      const nestedSample =
        sourceSnapshot.videos.find((v) => v.relativePath.includes('/')) ||
        sourceSnapshot.videos[0];
      const validated = validateRelativePath(nestedSample.relativePath);
      if (validated.valid) {
        const outName = buildOutputFileName(validated.fileName, format);
        return validated.directoryParts.length > 0
          ? `${validated.directoryParts.join(' / ')} / ${outName}`
          : outName;
      }
    }
    return isFilesMode ? `Video 01.${ext}` : `English / Lesson 01.${ext}`;
  }, [sourceSnapshot.videos, format, isFilesMode]);

  if (!isOpen) return null;

  const handleCopyFailedRecord = async (rec: FileExtractionRecord, recordKey: string) => {
    const text = formatFailedRecordForClipboard(rec);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedRecordKey(recordKey);
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        setCopiedRecordKey((prev) => (prev === recordKey ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard permission errors silently
    }
  };

  const progressPercent = progress
    ? computeBatchProgressMetrics(progress).progressPercent
    : 0;

  const failedRecords = progress
    ? progress.records.filter((r) => r.outcome === 'failed')
    : [];
  const visibleFailedRecords = failedRecords.slice(0, MAX_VISIBLE_FAILED_RECORDS);
  const hiddenFailedCount = Math.max(0, failedRecords.length - visibleFailedRecords.length);

  const skippedRecords = progress
    ? progress.records.filter((r) => r.outcome === 'skipped')
    : [];
  const visibleSkippedRecords = skippedRecords.slice(0, MAX_VISIBLE_SKIPPED_RECORDS);
  const hiddenSkippedCount = Math.max(0, skippedRecords.length - visibleSkippedRecords.length);

  const dialogContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-audio-title"
      data-testid="extract-audio-overlay"
    >
      <div
        ref={dialogPanelRef}
        tabIndex={-1}
        className="flex flex-col w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] min-h-0 rounded-2xl glass-panel shadow-2xl border border-slate-300/80 dark:border-white/15 overflow-hidden text-slate-900 dark:text-slate-100 focus:outline-none"
        style={{ maxHeight: 'min(calc(100dvh - 1.5rem), calc(100vh - 1.5rem), 100%)' }}
        data-testid="extract-audio-modal"
      >
        {/* Dialog Header (Pinned) */}
        <div
          className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-300/60 dark:border-white/10 shrink-0"
          data-testid="extract-audio-header"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <AudioLines className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <h2
              id="extract-audio-title"
              className="text-base font-bold tracking-tight text-slate-900 dark:text-white truncate"
            >
              Extract Audio
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1"
              data-testid="extract-audio-total-count"
            >
              {totalVideos} {totalVideos === 1 ? 'video' : 'videos'}
            </span>
            {canMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label="Minimize Extract Audio dialog"
                title="Minimize"
                data-testid="extract-audio-minimize-button"
              >
                <Minus className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              aria-label={isRunning ? 'Minimize Extract Audio dialog' : 'Close Extract Audio dialog'}
              title={isRunning ? 'Minimize' : 'Close'}
              data-testid="extract-audio-close-button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Dialog Body (Single Vertically Scrollable Central Region) */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3.5 custom-scrollbar"
          data-testid="extract-audio-body"
        >
          {/* Unsupported Browser Warning */}
          {!fsaWriteSupported && (
            <div
              className="flex items-start gap-2.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0">
                <p className="font-semibold">Browser not supported for folder writing</p>
                <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                  Batch audio extraction saves files directly to a local folder using the File System
                  Access API. Please use a modern Chromium-based browser such as Chrome, Edge, Brave,
                  or Opera.
                </p>
              </div>
            </div>
          )}

          {/* Source Mode Summary */}
          <div className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
            <p className="font-medium text-slate-800 dark:text-slate-200" data-testid="extract-audio-source-description">
              {isFilesMode
                ? 'Extract audio from all videos in the current playlist'
                : 'Extract audio from all videos in the current folder'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400" data-testid="extract-audio-ready-count">
              {totalVideos === 0
                ? 'No videos ready for extraction'
                : `${totalVideos} ${totalVideos === 1 ? 'video' : 'videos'} ready for extraction`}
            </p>
          </div>

          {/* Output Format Radio Selection */}
          <fieldset disabled={isRunning} className="space-y-2 min-w-0">
            <legend className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Output format
            </legend>

            <div className="space-y-2" role="radiogroup" aria-label="Output format">
              {(['mp3', 'webm'] as const).map((fmt) => {
                const cfg = AUDIO_FORMAT_CONFIGS[fmt];
                const isSelected = format === fmt;
                return (
                  <label
                    key={fmt}
                    className={`flex items-start justify-between gap-3 p-2.5 sm:p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/50 dark:border-sky-400/50'
                        : 'bg-slate-100/60 dark:bg-white/[0.03] border-slate-300/70 dark:border-white/10 hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                    } ${isRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="radio"
                        name="audio-output-format"
                        value={fmt}
                        checked={isSelected}
                        onChange={() => onFormatChange(fmt)}
                        disabled={isRunning}
                        className="mt-0.5 h-4 w-4 accent-sky-500 cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {cfg.bitrateLabel} · {cfg.description}
                        </p>
                      </div>
                    </div>

                    {cfg.isDefault && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-white/10 shrink-0">
                        Default
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <hr className="border-slate-300/60 dark:border-white/10" />

          {/* Output Directory Selection & Folder Structure Info */}
          <div className="space-y-2.5 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 min-w-0">
                <Folder className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Output folder
                  </p>
                  <p
                    className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5"
                    title={outputDirHandle ? outputDirHandle.name : undefined}
                    data-testid="selected-output-folder"
                  >
                    {outputDirHandle
                      ? outputDirHandle.name
                      : 'Choose a folder before or when extraction starts'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onChooseOutputFolder}
                disabled={isRunning || !fsaWriteSupported}
                className="glass-button px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {outputDirHandle ? 'Change Folder' : 'Choose Folder'}
              </button>
            </div>

            {/* Same-as-source folder conflict warning */}
            {isSameFolderWarning && (
              <div
                className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px]"
                role="alert"
                data-testid="same-folder-warning"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <span className="min-w-0 break-words">
                  Selected output folder matches the source video folder. Choosing a separate output
                  folder is recommended to avoid mixing files. Existing files will not be overwritten.
                </span>
              </div>
            )}

            {/* Picker / Permission Error */}
            {pickerError && (
              <div
                className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs"
                role="alert"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                <span className="min-w-0 break-words">{pickerError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-medium" data-testid="extract-audio-output-mode">
                {isFilesMode
                  ? 'Save extracted audio directly into the chosen output folder'
                  : 'Preserve original folder structure'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-300/60 dark:border-white/10 min-w-0">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Example output</p>
              <p
                className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5"
                title={exampleOutputPath}
                data-testid="example-output-path"
              >
                {exampleOutputPath}
              </p>
            </div>

            {/* Local Privacy & Memory Limit Explanation */}
            <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <span className="min-w-0">
                All audio conversion runs locally in your browser—no files are uploaded. Existing
                files and videos over 2 GB are skipped. Browser memory limits may cause some smaller
                files to fail.
              </span>
            </div>
          </div>

          {/* Batch Processing Progress & Summary Panel (Compact) */}
          {progress && progress.state !== 'idle' && (
            <div
              className="p-3 rounded-xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/10 space-y-2 min-w-0"
              data-testid="batch-progress-panel"
            >
              <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {isRunning && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                  )}
                  <span
                    className="font-semibold text-slate-900 dark:text-white truncate"
                    title={progress.statusMessage}
                    data-testid="batch-status-message"
                  >
                    {progress.statusMessage}
                  </span>
                </div>
                <span
                  className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0"
                  data-testid="batch-position-counter"
                >
                  {progress.currentIndex} / {progress.totalFiles}
                </span>
              </div>

              {progress.currentFileName && isRunning && (
                <p
                  className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate"
                  title={progress.currentRelativePath}
                  data-testid="batch-current-file"
                >
                  Current: {progress.currentFileName}
                </p>
              )}

              {/* Progress Bar */}
              <div className="w-full h-1.5 rounded-full bg-slate-300/80 dark:bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ${
                    progress.state === 'error'
                      ? 'bg-rose-500'
                      : progress.state === 'cancelled'
                      ? 'bg-amber-500'
                      : progress.state === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-sky-500'
                  }`}
                  style={{ width: `${progressPercent}%` }}
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>

              {/* Counters: Completed, Skipped, Failed */}
              <div className="grid grid-cols-3 gap-2 pt-0.5 text-center text-[11px]">
                <div className="py-1 px-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  <span className="font-bold block text-xs leading-tight" data-testid="count-completed">
                    {progress.completedCount}
                  </span>
                  <span className="text-[10px]">Completed</span>
                </div>
                <div className="py-1 px-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                  <span className="font-bold block text-xs leading-tight" data-testid="count-skipped">
                    {progress.skippedCount}
                  </span>
                  <span className="text-[10px]">Skipped</span>
                </div>
                <div className="py-1 px-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
                  <span className="font-bold block text-xs leading-tight" data-testid="count-failed">
                    {progress.failedCount}
                  </span>
                  <span className="text-[10px]">Failed</span>
                </div>
              </div>

              {/* Error Banner if fatal batch error */}
              {progress.errorMessage && (
                <div
                  className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-[11px] break-words whitespace-normal"
                  role="alert"
                >
                  {progress.errorMessage}
                </div>
              )}

              {/* Failed files details (rendered inline within the single scrollable body) */}
              {!isRunning && visibleFailedRecords.length > 0 && (
                <div
                  className="pt-1.5 space-y-2 text-[11px] min-w-0"
                  data-testid="failed-files-section"
                >
                  <p
                    className="font-semibold text-rose-700 dark:text-rose-300"
                    data-testid="failed-files-heading"
                  >
                    Failed files ({failedRecords.length}):
                  </p>
                  {visibleFailedRecords.map((rec, idx) => {
                    const recordKey = `${rec.relativePath}-${idx}`;
                    const isCopied = copiedRecordKey === recordKey;
                    const errorName = rec.errorName || 'Error';
                    const errorMessage = rec.errorMessage || rec.reason || 'Unknown error';
                    const technicalText =
                      rec.technicalDetails ||
                      `${errorName}: ${errorMessage}`;

                    return (
                      <div
                        key={recordKey}
                        className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-rose-500/[0.06] dark:bg-rose-500/[0.08] border border-rose-500/25 dark:border-rose-400/20 text-slate-700 dark:text-slate-300 min-w-0"
                        data-testid="failed-file-card"
                      >
                        {/* Header row: Full wrapped relative path + Copy error action */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <span
                            className="font-mono font-semibold text-slate-900 dark:text-slate-100 break-all sm:break-words whitespace-normal leading-snug min-w-0 flex-1"
                            data-testid="failed-file-path"
                          >
                            {rec.relativePath}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleCopyFailedRecord(rec, recordKey)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-200/80 hover:bg-slate-300/80 dark:bg-white/10 dark:hover:bg-white/15 text-slate-800 dark:text-slate-200 text-[10px] font-semibold shrink-0 transition cursor-pointer"
                            data-testid="copy-error-button"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy error</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* Badges row: Error Name + Failure Stage */}
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-rose-500/15 dark:bg-rose-500/25 border border-rose-500/30 font-mono text-[10px] font-bold text-rose-800 dark:text-rose-200 break-all"
                            data-testid="failed-file-error-name"
                          >
                            {errorName}
                          </span>
                          {rec.stageLabel && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-white/10 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                              data-testid="failed-file-stage"
                            >
                              Stage: {rec.stageLabel}
                            </span>
                          )}
                        </div>

                        {/* Error Message (displayed separately from Error Name, fully wrapped) */}
                        <p
                          className="text-rose-700 dark:text-rose-300 break-words whitespace-normal leading-relaxed"
                          data-testid="failed-file-error-message"
                        >
                          {errorMessage}
                        </p>

                        {/* Friendly understandable explanation when known */}
                        {rec.friendlyExplanation && (
                          <div
                            className="flex items-start gap-1.5 p-2 rounded-lg bg-slate-200/70 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300 text-[10.5px] leading-relaxed min-w-0"
                            data-testid="failed-file-explanation"
                          >
                            <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                            <span className="min-w-0 break-words whitespace-normal">
                              {rec.friendlyExplanation}
                            </span>
                          </div>
                        )}

                        {/* Expandable Technical details section */}
                        <details
                          className="group pt-0.5 min-w-0"
                          data-testid="failed-file-technical-details"
                        >
                          <summary className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer select-none list-none">
                            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90 shrink-0" />
                            <span>Technical details</span>
                          </summary>
                          <pre
                            className="mt-1.5 p-2 rounded-lg bg-slate-900/90 dark:bg-black/50 text-slate-100 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-words overflow-x-hidden"
                            data-testid="failed-file-technical-pre"
                          >
                            {technicalText}
                          </pre>
                        </details>
                      </div>
                    );
                  })}
                  {hiddenFailedCount > 0 && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                      + {hiddenFailedCount} more failed {hiddenFailedCount === 1 ? 'file' : 'files'}
                    </p>
                  )}
                </div>
              )}

              {/* Skipped files details (if any files were skipped) */}
              {!isRunning && visibleSkippedRecords.length > 0 && (
                <div
                  className="pt-1 space-y-1 text-[11px] min-w-0"
                  data-testid="skipped-files-section"
                >
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Skipped files ({skippedRecords.length}):
                  </p>
                  {visibleSkippedRecords.map((rec, idx) => (
                    <div
                      key={`${rec.relativePath}-${idx}`}
                      className="flex flex-col gap-0.5 p-2 rounded-lg bg-slate-200/50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400 min-w-0"
                    >
                      <span className="font-mono font-medium text-slate-800 dark:text-slate-200 break-all sm:break-words whitespace-normal">
                        {rec.relativePath}
                      </span>
                      <span className="text-amber-700 dark:text-amber-300 break-words whitespace-normal">
                        {rec.reason || 'Skipped'}
                      </span>
                    </div>
                  ))}
                  {hiddenSkippedCount > 0 && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                      + {hiddenSkippedCount} more skipped {hiddenSkippedCount === 1 ? 'file' : 'files'}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dialog Footer Controls (Pinned) */}
        <div
          className="flex items-center justify-end gap-2.5 px-4 sm:px-5 py-3 border-t border-slate-300/60 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02] shrink-0"
          data-testid="extract-audio-footer"
        >
          {isRunning ? (
            <>
              <button
                type="button"
                onClick={onMinimize}
                className="glass-button px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                data-testid="extract-audio-footer-minimize"
              >
                Minimize
              </button>
              <button
                type="button"
                onClick={onCancelExtraction}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
                data-testid="extract-audio-cancel-button"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="glass-button px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {progress?.state === 'completed' || progress?.state === 'error' ? 'Close' : 'Cancel'}
              </button>

              <button
                type="button"
                onClick={onStartExtraction}
                disabled={!fsaWriteSupported || totalVideos === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-lg shadow-sky-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="extract-audio-start-button"
              >
                <AudioLines className="h-3.5 w-3.5" />
                <span>
                  {progress?.state === 'completed' ||
                  progress?.state === 'cancelled' ||
                  progress?.state === 'error'
                    ? 'Start Again'
                    : 'Start Extraction'}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(dialogContent, document.body);
  }

  return dialogContent;
}
