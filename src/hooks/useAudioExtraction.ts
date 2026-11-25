import { useState, useRef, useEffect, useCallback } from 'react';
import { VideoItem, VideoLibrary } from '../types/video';
import { AudioOutputFormat } from '../utils/audioExtractor';
import {
  BatchExtractionProgress,
  BrowserOutputDirectoryWriter,
  checkIsSameAsSourceDirectory,
  isDirectoryWriteSupported,
  promptOutputDirectory,
  runBatchAudioExtraction,
} from '../services/audioExtractionService';

export type ExtractionViewMode = 'closed' | 'expanded' | 'minimized';

export interface ExtractionSourceSnapshot {
  libraryId: string;
  libraryName: string;
  sourceType: VideoLibrary['sourceType'];
  videos: VideoItem[];
  handle?: FileSystemDirectoryHandle;
}

export interface AudioExtractionController {
  viewMode: ExtractionViewMode;
  format: AudioOutputFormat;
  outputDirHandle: FileSystemDirectoryHandle | null;
  isSameFolderWarning: boolean;
  pickerError: string | null;
  progress: BatchExtractionProgress | null;
  isRunning: boolean;
  fsaWriteSupported: boolean;
  sourceSnapshot: ExtractionSourceSnapshot | null;
  openDialog: () => void;
  minimizeDialog: () => void;
  restoreDialog: () => void;
  closeDialog: () => void;
  dismissMinimized: () => void;
  setFormat: (next: AudioOutputFormat) => void;
  chooseOutputFolder: () => Promise<FileSystemDirectoryHandle | null>;
  startExtraction: () => Promise<void>;
  cancelExtraction: () => void;
}

export function createSourceSnapshot(library: VideoLibrary): ExtractionSourceSnapshot {
  return {
    libraryId: library.id,
    libraryName: library.name,
    sourceType: library.sourceType,
    videos: [...library.flatPlaylist],
    handle: library.handle,
  };
}

function toCheckableLibrary(snapshot: ExtractionSourceSnapshot | null): VideoLibrary | null {
  if (!snapshot) return null;
  return {
    id: snapshot.libraryId,
    name: snapshot.libraryName,
    sourceType: snapshot.sourceType,
    flatPlaylist: snapshot.videos,
    handle: snapshot.handle,
    tree: {
      id: 'root',
      name: snapshot.libraryName,
      relativePath: '',
      videos: [],
      subfolders: [],
      totalVideoCount: snapshot.videos.length,
    },
  };
}

/**
 * Owns the single authoritative audio extraction task at the application root,
 * decoupling task execution and cancellation from dialog mount/visibility state.
 */
export function useAudioExtraction(currentLibrary: VideoLibrary | null): AudioExtractionController {
  const [viewMode, setViewMode] = useState<ExtractionViewMode>('closed');
  const [format, setFormatState] = useState<AudioOutputFormat>('mp3');
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [isSameFolderWarning, setIsSameFolderWarning] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchExtractionProgress | null>(null);
  const [activeSnapshot, setActiveSnapshot] = useState<ExtractionSourceSnapshot | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isRunningRef = useRef(false);
  const taskRunIdRef = useRef(0);
  const viewModeRef = useRef<ExtractionViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const activeSnapshotRef = useRef<ExtractionSourceSnapshot | null>(activeSnapshot);
  activeSnapshotRef.current = activeSnapshot;
  const currentLibraryRef = useRef<VideoLibrary | null>(currentLibrary);
  currentLibraryRef.current = currentLibrary;
  const outputDirHandleRef = useRef<FileSystemDirectoryHandle | null>(outputDirHandle);
  outputDirHandleRef.current = outputDirHandle;
  const formatRef = useRef<AudioOutputFormat>(format);
  formatRef.current = format;

  const fsaWriteSupported = isDirectoryWriteSupported();
  const isRunning =
    progress?.state === 'initializing' || progress?.state === 'processing';

  // Abort only on actual application teardown (never on dialog minimize/unmount)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isRunningRef.current = false;
    };
  }, []);

  // Effective source shown in the UI: frozen batch snapshot when a task is active or has results,
  // otherwise the currently loaded library.
  const sourceSnapshot: ExtractionSourceSnapshot | null =
    activeSnapshot ?? (currentLibrary ? createSourceSnapshot(currentLibrary) : null);

  const openDialog = useCallback(() => {
    // If a task is currently running or minimized, restore it without resetting or restarting
    if (isRunningRef.current || viewModeRef.current === 'minimized') {
      setViewMode('expanded');
      return;
    }

    // Opening fresh from closed state for the current library
    setPickerError(null);
    setProgress(null);
    setActiveSnapshot(null);
    setViewMode('expanded');
  }, []);

  const minimizeDialog = useCallback(() => {
    setViewMode('minimized');
  }, []);

  const restoreDialog = useCallback(() => {
    setViewMode('expanded');
  }, []);

  const closeDialog = useCallback(() => {
    // Closing an expanded dialog while a task is running minimizes instead of cancelling
    if (isRunningRef.current) {
      setViewMode('minimized');
      return;
    }
    setPickerError(null);
    setProgress(null);
    setActiveSnapshot(null);
    setViewMode('closed');
  }, []);

  const dismissMinimized = useCallback(() => {
    // Active tasks cannot be dismissed from the compact panel
    if (isRunningRef.current) {
      return;
    }
    setPickerError(null);
    setProgress(null);
    setActiveSnapshot(null);
    setViewMode('closed');
  }, []);

  const setFormat = useCallback((next: AudioOutputFormat) => {
    if (isRunningRef.current) return;
    setFormatState(next);
  }, []);

  const chooseOutputFolder = useCallback(async (): Promise<FileSystemDirectoryHandle | null> => {
    if (isRunningRef.current) return outputDirHandleRef.current;
    setPickerError(null);
    try {
      const handle = await promptOutputDirectory();
      if (!handle) {
        return null;
      }
      const targetSnapshot =
        activeSnapshotRef.current ??
        (currentLibraryRef.current ? createSourceSnapshot(currentLibraryRef.current) : null);
      const sameAsSource = await checkIsSameAsSourceDirectory(
        toCheckableLibrary(targetSnapshot),
        handle
      );
      setIsSameFolderWarning(sameAsSource);
      setOutputDirHandle(handle);
      return handle;
    } catch (err: unknown) {
      setPickerError(
        err instanceof Error ? err.message : 'Unable to select output folder.'
      );
      return null;
    }
  }, []);

  const startExtraction = useCallback(async () => {
    if (isRunningRef.current || !fsaWriteSupported) return;

    const snapshot =
      activeSnapshotRef.current ??
      (currentLibraryRef.current ? createSourceSnapshot(currentLibraryRef.current) : null);

    if (!snapshot || snapshot.videos.length === 0) return;

    setPickerError(null);

    let targetDirHandle = outputDirHandleRef.current;
    if (!targetDirHandle) {
      targetDirHandle = await chooseOutputFolder();
      if (!targetDirHandle) {
        return;
      }
    }

    // Re-check guard in case another invocation started while awaiting the folder picker
    if (isRunningRef.current) return;

    const runId = ++taskRunIdRef.current;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    isRunningRef.current = true;
    setActiveSnapshot(snapshot);

    const writer = new BrowserOutputDirectoryWriter(targetDirHandle);

    try {
      await runBatchAudioExtraction({
        videos: snapshot.videos,
        format: formatRef.current,
        writer,
        preserveFolderStructure: snapshot.sourceType !== 'files',
        signal: abortController.signal,
        onProgress: (updated) => {
          if (taskRunIdRef.current === runId) {
            setProgress(updated);
          }
        },
      });
    } finally {
      if (taskRunIdRef.current === runId) {
        isRunningRef.current = false;
        abortControllerRef.current = null;
      }
    }
  }, [chooseOutputFolder, fsaWriteSupported]);

  const cancelExtraction = useCallback(() => {
    if (isRunningRef.current && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    viewMode,
    format,
    outputDirHandle,
    isSameFolderWarning,
    pickerError,
    progress,
    isRunning,
    fsaWriteSupported,
    sourceSnapshot,
    openDialog,
    minimizeDialog,
    restoreDialog,
    closeDialog,
    dismissMinimized,
    setFormat,
    chooseOutputFolder,
    startExtraction,
    cancelExtraction,
  };
}
