import { useState, useRef, useEffect, useMemo } from 'react';
import {
  AudioLines,
  Folder,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import { VideoLibrary } from '../types/video';
import {
  AudioOutputFormat,
  AUDIO_FORMAT_CONFIGS,
  buildOutputFileName,
  validateRelativePath,
} from '../utils/audioExtractor';
import {
  BatchExtractionProgress,
  BrowserOutputDirectoryWriter,
  checkIsSameAsSourceDirectory,
  isDirectoryWriteSupported,
  promptOutputDirectory,
  runBatchAudioExtraction,
} from '../services/audioExtractionService';

interface ExtractAudioDialogProps {
  isOpen: boolean;
  onClose: () => void;
  library: VideoLibrary;
}

export function ExtractAudioDialog({ isOpen, onClose, library }: ExtractAudioDialogProps) {
  const [format, setFormat] = useState<AudioOutputFormat>('mp3');
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isSameFolderWarning, setIsSameFolderWarning] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchExtractionProgress | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fsaWriteSupported = isDirectoryWriteSupported();
  const totalVideos = library.flatPlaylist.length;
  const isRunning =
    progress?.state === 'initializing' || progress?.state === 'processing';

  // Clean up any active extraction if the dialog unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Build dynamic example output path from the loaded library (or fallback example)
  const exampleOutputPath = useMemo(() => {
    const ext = AUDIO_FORMAT_CONFIGS[format].extension;
    if (library.flatPlaylist.length > 0) {
      // Prefer a nested video if one exists so the user sees folder preservation in the preview
      const nestedSample =
        library.flatPlaylist.find((v) => v.relativePath.includes('/')) ||
        library.flatPlaylist[0];
      const validated = validateRelativePath(nestedSample.relativePath);
      if (validated.valid) {
        const outName = buildOutputFileName(validated.fileName, format);
        return validated.directoryParts.length > 0
          ? `${validated.directoryParts.join(' / ')} / ${outName}`
          : outName;
      }
    }
    return `English / Lesson 01.${ext}`;
  }, [library.flatPlaylist, format]);

  if (!isOpen) return null;

  const handleChooseOutputFolder = async (): Promise<FileSystemDirectoryHandle | null> => {
    setPickerError(null);
    try {
      const handle = await promptOutputDirectory();
      if (!handle) {
        // User cancelled the directory picker
        return null;
      }
      const sameAsSource = await checkIsSameAsSourceDirectory(library, handle);
      setIsSameFolderWarning(sameAsSource);
      setOutputDirHandle(handle);
      return handle;
    } catch (err: unknown) {
      setPickerError(
        err instanceof Error ? err.message : 'Unable to select output folder.'
      );
      return null;
    }
  };

  const handleStartExtraction = async () => {
    if (isRunning || totalVideos === 0 || !fsaWriteSupported) return;

    setPickerError(null);

    let targetDirHandle = outputDirHandle;
    if (!targetDirHandle) {
      targetDirHandle = await handleChooseOutputFolder();
      if (!targetDirHandle) {
        // User cancelled directory selection or permission was denied
        return;
      }
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const writer = new BrowserOutputDirectoryWriter(targetDirHandle);

    await runBatchAudioExtraction({
      videos: library.flatPlaylist,
      format,
      writer,
      signal: abortController.signal,
      onProgress: (updated) => {
        setProgress(updated);
      },
    });
  };

  const handleCancelOrClose = () => {
    if (isRunning && abortControllerRef.current) {
      abortControllerRef.current.abort();
      return;
    }
    onClose();
  };

  const processedCount = progress
    ? progress.completedCount + progress.skippedCount + progress.failedCount
    : 0;
  const progressPercent =
    progress && progress.totalFiles > 0
      ? Math.min(100, Math.round((processedCount / progress.totalFiles) * 100))
      : 0;

  const notableRecords = progress
    ? progress.records.filter((r) => r.outcome === 'failed' || r.outcome === 'skipped')
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="extract-audio-title"
    >
      <div className="w-full max-w-md rounded-2xl glass-panel shadow-2xl border border-slate-300/80 dark:border-white/15 overflow-hidden text-slate-900 dark:text-slate-100">
        {/* Dialog Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-300/60 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <AudioLines className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <h2
              id="extract-audio-title"
              className="text-base font-bold tracking-tight text-slate-900 dark:text-white"
            >
              Extract Audio
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
              data-testid="extract-audio-total-count"
            >
              {totalVideos} {totalVideos === 1 ? 'video' : 'videos'}
            </span>
            {!isRunning && (
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                aria-label="Close Extract Audio dialog"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dialog Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Unsupported Browser Warning */}
          {!fsaWriteSupported && (
            <div
              className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-semibold">Browser not supported for folder writing</p>
                <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed">
                  Batch audio extraction saves files directly to a local folder using the File System
                  Access API. Please use a modern Chromium-based browser such as Chrome, Edge, Brave,
                  or Opera.
                </p>
              </div>
            </div>
          )}

          {/* Output Format Radio Selection */}
          <fieldset disabled={isRunning} className="space-y-2.5">
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
                    className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-sky-500/10 dark:bg-sky-500/15 border-sky-500/50 dark:border-sky-400/50'
                        : 'bg-slate-100/60 dark:bg-white/[0.03] border-slate-300/70 dark:border-white/10 hover:bg-slate-200/50 dark:hover:bg-white/[0.06]'
                    } ${isRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="audio-output-format"
                        value={fmt}
                        checked={isSelected}
                        onChange={() => setFormat(fmt)}
                        disabled={isRunning}
                        className="mt-1 h-4 w-4 accent-sky-500 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 dark:text-white">
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                          {cfg.bitrateLabel} · {cfg.description}
                        </p>
                      </div>
                    </div>

                    {cfg.isDefault && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-300 font-semibold border border-slate-300 dark:border-white/10 shrink-0">
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
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Folder className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    Output folder
                  </p>
                  <p
                    className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5"
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
                onClick={handleChooseOutputFolder}
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
                <span>
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
                <span>{pickerError}</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-medium">Preserve original folder structure</span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-white/[0.03] border border-slate-300/60 dark:border-white/10">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Example output</p>
              <p
                className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200 truncate mt-0.5"
                data-testid="example-output-path"
              >
                {exampleOutputPath}
              </p>
            </div>

            {/* Local Privacy & Memory Limit Explanation */}
            <div className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <span>
                All audio conversion runs locally in your browser—no files are uploaded. Existing
                files and videos over 2 GB are skipped. Browser memory limits may cause some smaller
                files to fail.
              </span>
            </div>
          </div>

          {/* Batch Processing Progress & Summary Panel */}
          {progress && progress.state !== 'idle' && (
            <div
              className="p-3.5 rounded-xl bg-slate-100/90 dark:bg-slate-900/80 border border-slate-300/80 dark:border-white/10 space-y-2.5"
              data-testid="batch-progress-panel"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  {isRunning && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
                  )}
                  <span
                    className="font-semibold text-slate-900 dark:text-white truncate"
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
              <div className="w-full h-2 rounded-full bg-slate-300/80 dark:bg-white/10 overflow-hidden">
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
              <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px]">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  <span className="font-bold block text-xs" data-testid="count-completed">
                    {progress.completedCount}
                  </span>
                  <span>Completed</span>
                </div>
                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300">
                  <span className="font-bold block text-xs" data-testid="count-skipped">
                    {progress.skippedCount}
                  </span>
                  <span>Skipped</span>
                </div>
                <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
                  <span className="font-bold block text-xs" data-testid="count-failed">
                    {progress.failedCount}
                  </span>
                  <span>Failed</span>
                </div>
              </div>

              {/* Error Banner if fatal batch error */}
              {progress.errorMessage && (
                <div
                  className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-[11px]"
                  role="alert"
                >
                  {progress.errorMessage}
                </div>
              )}

              {/* Per-file skipped / failure details */}
              {!isRunning && notableRecords.length > 0 && (
                <div className="pt-1 space-y-1.5 max-h-32 overflow-y-auto custom-scrollbar text-[11px]">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    Details ({notableRecords.length}):
                  </p>
                  {notableRecords.map((rec, idx) => (
                    <div
                      key={`${rec.relativePath}-${idx}`}
                      className="flex flex-col gap-0.5 p-1.5 rounded-lg bg-slate-200/50 dark:bg-white/[0.03] text-slate-600 dark:text-slate-400"
                    >
                      <span className="truncate font-mono font-medium text-slate-800 dark:text-slate-200" title={rec.relativePath}>
                        {rec.relativePath}
                      </span>
                      <span
                        className={`break-words ${
                          rec.outcome === 'failed'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {rec.reason || rec.outcome}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dialog Footer Controls */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-300/60 dark:border-white/10 bg-slate-100/50 dark:bg-white/[0.02]">
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancelOrClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-xs font-semibold transition cursor-pointer"
            >
              <Ban className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
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
                onClick={handleStartExtraction}
                disabled={!fsaWriteSupported || totalVideos === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-lg shadow-sky-500/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
}
