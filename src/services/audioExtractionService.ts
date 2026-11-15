import { VideoItem, VideoLibrary } from '../types/video';
import {
  AudioOutputFormat,
  buildOutputPlan,
  MAX_SOURCE_VIDEO_SIZE_BYTES,
  validateVideoFileSize,
} from '../utils/audioExtractor';
import {
  AudioEncoderAdapter,
  defaultFfmpegService,
  isFfmpegInitializationError,
} from './ffmpegService';

export type BatchProcessingState =
  | 'idle'
  | 'initializing'
  | 'processing'
  | 'completed'
  | 'cancelled'
  | 'error';

export interface FileExtractionRecord {
  relativePath: string;
  outputRelativePath: string;
  outcome: 'completed' | 'skipped' | 'failed';
  reason?: string;
}

export interface BatchExtractionProgress {
  state: BatchProcessingState;
  totalFiles: number;
  currentIndex: number; // 1-based position while processing (e.g., 24 for "24 / 100")
  currentFileName: string;
  currentRelativePath: string;
  completedCount: number;
  skippedCount: number;
  failedCount: number;
  statusMessage: string;
  errorMessage?: string;
  records: FileExtractionRecord[];
}

export interface OutputDirectoryWriter {
  verifyWritePermission(): Promise<boolean>;
  fileExists(directoryParts: string[], fileName: string): Promise<boolean>;
  writeFile(directoryParts: string[], fileName: string, data: Uint8Array): Promise<void>;
}

/**
 * Checks whether the current browser supports directory picking & writing via File System Access API.
 */
export function isDirectoryWriteSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/**
 * Prompts the user to select a local output directory with readwrite permission.
 * Returns null if the user cancels the picker.
 */
export async function promptOutputDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isDirectoryWriteSupported()) {
    throw new Error(
      'Local folder writing requires a modern Chromium-based browser (Chrome, Edge, Brave, or Opera).'
    );
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
    });
    return handle;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return null;
    }
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
      throw new Error(
        'Write permission was denied for the selected folder. Please select a folder and allow edit access.'
      );
    }
    throw err instanceof Error
      ? err
      : new Error('Unable to select output folder.');
  }
}

/**
 * Verifies or requests readwrite permission on a FileSystemDirectoryHandle.
 */
export async function verifyReadWritePermission(
  handle: FileSystemDirectoryHandle,
  requestIfPrompt = true
): Promise<boolean> {
  try {
    if (typeof handle.queryPermission === 'function') {
      const state = await handle.queryPermission({ mode: 'readwrite' });
      if (state === 'granted') return true;

      if (requestIfPrompt && typeof handle.requestPermission === 'function') {
        const requested = await handle.requestPermission({ mode: 'readwrite' });
        return requested === 'granted';
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether the selected output directory is the same as the loaded source library directory.
 */
export async function checkIsSameAsSourceDirectory(
  library: VideoLibrary | null,
  outputHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  if (!library) return false;

  if (library.handle && typeof library.handle.isSameEntry === 'function') {
    try {
      return await library.handle.isSameEntry(outputHandle);
    } catch {
      // Fallback to name comparison below if isSameEntry fails
    }
  }

  return Boolean(library.name && outputHandle.name && library.name === outputHandle.name);
}

/**
 * File System Access API implementation of OutputDirectoryWriter.
 * Uses validated relative path segments to create subdirectories and never overwrites existing files.
 */
export class BrowserOutputDirectoryWriter implements OutputDirectoryWriter {
  private rootHandle: FileSystemDirectoryHandle;

  constructor(rootHandle: FileSystemDirectoryHandle) {
    this.rootHandle = rootHandle;
  }

  async verifyWritePermission(): Promise<boolean> {
    return verifyReadWritePermission(this.rootHandle, true);
  }

  private async resolveSubdirectory(
    directoryParts: string[],
    create: boolean
  ): Promise<FileSystemDirectoryHandle | null> {
    let current = this.rootHandle;
    for (const segment of directoryParts) {
      if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
        throw new Error(`Invalid directory segment: "${segment}"`);
      }
      try {
        current = await current.getDirectoryHandle(segment, { create });
      } catch (err: unknown) {
        if (!create && err instanceof DOMException && err.name === 'NotFoundError') {
          return null;
        }
        throw err;
      }
    }
    return current;
  }

  async fileExists(directoryParts: string[], fileName: string): Promise<boolean> {
    const dirHandle = await this.resolveSubdirectory(directoryParts, false);
    if (!dirHandle) return false;

    try {
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const existingFile = await fileHandle.getFile();
      return existingFile.size > 0;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'NotFoundError') {
        return false;
      }
      throw err;
    }
  }

  async writeFile(directoryParts: string[], fileName: string, data: Uint8Array): Promise<void> {
    if (!data || data.byteLength === 0) {
      throw new Error('Cannot write empty audio data.');
    }

    const dirHandle = await this.resolveSubdirectory(directoryParts, true);
    if (!dirHandle) {
      throw new Error('Failed to create output subdirectory.');
    }

    // Double-check before writing to guarantee we never overwrite an existing non-empty file
    try {
      const existingHandle = await dirHandle.getFileHandle(fileName, { create: false });
      const existingFile = await existingHandle.getFile();
      if (existingFile.size > 0) {
        return;
      }
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === 'NotFoundError')) {
        throw err;
      }
    }

    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      const bufferToWrite = new Uint8Array(data.byteLength);
      bufferToWrite.set(data);
      await writable.write(bufferToWrite);
      await writable.close();
    } catch (err) {
      try {
        await writable.abort();
      } catch {
        // Ignore abort error
      }
      throw err;
    }
  }
}

export interface RunBatchAudioExtractionOptions {
  videos: VideoItem[];
  format: AudioOutputFormat;
  writer: OutputDirectoryWriter;
  encoder?: AudioEncoderAdapter;
  signal?: AbortSignal;
  maxFileSizeBytes?: number;
  onProgress?: (progress: BatchExtractionProgress) => void;
  resolveSourceFile?: (video: VideoItem) => Promise<File>;
}

async function defaultResolveSourceFile(video: VideoItem): Promise<File> {
  if (video.file) {
    return video.file;
  }
  if (video.handle) {
    return await video.handle.getFile();
  }
  throw new Error('Source video file handle is unavailable.');
}

function isPermissionRevokedError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'NotAllowedError' || err.name === 'SecurityError';
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('permission') || msg.includes('notallowederror') || msg.includes('securityerror');
  }
  return false;
}

/**
 * Executes sequential batch audio extraction across the given video list.
 * Preserves folder hierarchy, skips existing files and files > 2 GB,
 * continues on per-file errors, and supports clean cancellation.
 */
export async function runBatchAudioExtraction({
  videos,
  format,
  writer,
  encoder = defaultFfmpegService,
  signal,
  maxFileSizeBytes = MAX_SOURCE_VIDEO_SIZE_BYTES,
  onProgress,
  resolveSourceFile = defaultResolveSourceFile,
}: RunBatchAudioExtractionOptions): Promise<BatchExtractionProgress> {
  const totalFiles = videos.length;
  const records: FileExtractionRecord[] = [];

  const progress: BatchExtractionProgress = {
    state: 'initializing',
    totalFiles,
    currentIndex: 0,
    currentFileName: '',
    currentRelativePath: '',
    completedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    statusMessage: 'Preparing audio extraction...',
    records,
  };

  const emit = () => {
    onProgress?.({
      ...progress,
      records: [...records],
    });
  };

  if (totalFiles === 0) {
    progress.state = 'error';
    progress.statusMessage = 'No videos available to extract.';
    progress.errorMessage = 'No videos are loaded in the current playlist.';
    emit();
    return { ...progress, records: [...records] };
  }

  emit();

  // 1. Verify write permission on the destination folder
  const hasPermission = await writer.verifyWritePermission();
  if (!hasPermission) {
    progress.state = 'error';
    progress.statusMessage = 'Output folder write permission denied.';
    progress.errorMessage =
      'Write permission to the selected output folder was denied or revoked.';
    emit();
    return { ...progress, records: [...records] };
  }

  if (signal?.aborted) {
    encoder.terminate();
    progress.state = 'cancelled';
    progress.statusMessage = 'Extraction cancelled.';
    emit();
    return { ...progress, records: [...records] };
  }

  // 2. Plan output paths and disambiguate duplicate base filenames in the same directory
  const plan = buildOutputPlan(videos, format);

  // 3. Lazy-initialize FFmpeg only when needed
  let encoderInitialized = false;

  for (let i = 0; i < plan.length; i++) {
    if (signal?.aborted) {
      encoder.terminate();
      progress.state = 'cancelled';
      progress.statusMessage = `Cancelled after processing ${progress.completedCount + progress.skippedCount + progress.failedCount} of ${totalFiles} files.`;
      emit();
      return { ...progress, records: [...records] };
    }

    const item = plan[i];
    const { video } = item;

    progress.state = 'processing';
    progress.currentIndex = i + 1;
    progress.currentFileName = video.name;
    progress.currentRelativePath = video.relativePath;
    progress.statusMessage = `Processing ${i + 1} / ${totalFiles}: ${video.name}`;
    emit();

    // Validate relative path safety
    if (!item.validPath) {
      progress.failedCount++;
      records.push({
        relativePath: video.relativePath,
        outputRelativePath: '',
        outcome: 'failed',
        reason: item.pathErrorReason || 'Invalid relative path.',
      });
      emit();
      continue;
    }

    // Check if output file already exists (never overwrite existing files)
    try {
      const alreadyExists = await writer.fileExists(item.directoryParts, item.outputFileName);
      if (alreadyExists) {
        progress.skippedCount++;
        records.push({
          relativePath: video.relativePath,
          outputRelativePath: item.outputRelativePath,
          outcome: 'skipped',
          reason: 'Output file already exists.',
        });
        emit();
        continue;
      }
    } catch (err: unknown) {
      if (isPermissionRevokedError(err)) {
        encoder.terminate();
        progress.state = 'error';
        progress.statusMessage = 'Output folder write permission was revoked.';
        progress.errorMessage =
          'Write access to the output folder was revoked during batch extraction.';
        emit();
        return { ...progress, records: [...records] };
      }
      progress.failedCount++;
      records.push({
        relativePath: video.relativePath,
        outputRelativePath: item.outputRelativePath,
        outcome: 'failed',
        reason: 'Could not check output folder for existing file.',
      });
      emit();
      continue;
    }

    // Check metadata file size before reading the File
    const initialSizeCheck = validateVideoFileSize(video.size, maxFileSizeBytes);
    if (!initialSizeCheck.valid) {
      if (initialSizeCheck.reason === 'exceeds_limit') {
        progress.skippedCount++;
        records.push({
          relativePath: video.relativePath,
          outputRelativePath: item.outputRelativePath,
          outcome: 'skipped',
          reason: initialSizeCheck.message || 'Exceeds 2 GB maximum file size limit.',
        });
      } else {
        progress.failedCount++;
        records.push({
          relativePath: video.relativePath,
          outputRelativePath: item.outputRelativePath,
          outcome: 'failed',
          reason: initialSizeCheck.message || 'Invalid or empty video file.',
        });
      }
      emit();
      continue;
    }

    // Resolve actual File object from handle or fallback File
    let sourceFile: File;
    try {
      sourceFile = await resolveSourceFile(video);
    } catch {
      progress.failedCount++;
      records.push({
        relativePath: video.relativePath,
        outputRelativePath: item.outputRelativePath,
        outcome: 'failed',
        reason: 'Unable to read source video file.',
      });
      emit();
      continue;
    }

    // Verify actual File size in case it changed on disk
    const actualSizeCheck = validateVideoFileSize(sourceFile.size, maxFileSizeBytes);
    if (!actualSizeCheck.valid) {
      if (actualSizeCheck.reason === 'exceeds_limit') {
        progress.skippedCount++;
        records.push({
          relativePath: video.relativePath,
          outputRelativePath: item.outputRelativePath,
          outcome: 'skipped',
          reason: actualSizeCheck.message || 'Exceeds 2 GB maximum file size limit.',
        });
      } else {
        progress.failedCount++;
        records.push({
          relativePath: video.relativePath,
          outputRelativePath: item.outputRelativePath,
          outcome: 'failed',
          reason: actualSizeCheck.message || 'Invalid or empty video file.',
        });
      }
      emit();
      continue;
    }

    // Initialize FFmpeg engine lazily before the first actual conversion
    if (!encoderInitialized) {
      progress.statusMessage = 'Loading local FFmpeg audio engine...';
      emit();
      try {
        await encoder.initialize(signal);
        encoderInitialized = true;
      } catch (err: unknown) {
        if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          encoder.terminate();
          progress.state = 'cancelled';
          progress.statusMessage = 'Extraction cancelled.';
          emit();
          return { ...progress, records: [...records] };
        }
        progress.state = 'error';
        progress.statusMessage = 'Failed to initialize FFmpeg audio engine.';
        progress.errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === 'string' && err.trim().length > 0
            ? err
            : 'Unable to load the FFmpeg WebAssembly audio encoder in this browser.';
        emit();
        return { ...progress, records: [...records] };
      }
    }

    progress.statusMessage = `Extracting audio (${i + 1} / ${totalFiles}): ${video.name}`;
    emit();

    // Perform audio extraction and write output file
    try {
      const encoded = await encoder.extractAudio(sourceFile, format, signal);

      if (signal?.aborted) {
        encoder.terminate();
        progress.state = 'cancelled';
        progress.statusMessage = 'Extraction cancelled.';
        emit();
        return { ...progress, records: [...records] };
      }

      if (!encoded.data || encoded.data.byteLength === 0) {
        throw new Error('Encoded audio output was empty.');
      }

      await writer.writeFile(item.directoryParts, item.outputFileName, encoded.data);

      progress.completedCount++;
      records.push({
        relativePath: video.relativePath,
        outputRelativePath: item.outputRelativePath,
        outcome: 'completed',
      });
      emit();
    } catch (err: unknown) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        encoder.terminate();
        progress.state = 'cancelled';
        progress.statusMessage = `Cancelled after processing ${progress.completedCount + progress.skippedCount + progress.failedCount} of ${totalFiles} files.`;
        emit();
        return { ...progress, records: [...records] };
      }

      if (isFfmpegInitializationError(err)) {
        encoder.terminate();
        progress.state = 'error';
        progress.statusMessage = 'Failed to initialize FFmpeg audio engine.';
        progress.errorMessage = err.message;
        emit();
        return { ...progress, records: [...records] };
      }

      if (isPermissionRevokedError(err)) {
        encoder.terminate();
        progress.state = 'error';
        progress.statusMessage = 'Output folder write permission was revoked.';
        progress.errorMessage =
          'Write access to the output folder was revoked while saving extracted audio.';
        emit();
        return { ...progress, records: [...records] };
      }

      const failureReason =
        err instanceof Error
          ? err.message
          : typeof err === 'string' && err.trim().length > 0
          ? err.trim()
          : 'Audio conversion failed.';

      progress.failedCount++;
      records.push({
        relativePath: video.relativePath,
        outputRelativePath: item.outputRelativePath,
        outcome: 'failed',
        reason: failureReason,
      });
      emit();
    }
  }

  if (progress.completedCount === 0 && progress.failedCount > 0) {
    const firstFailedRecord = records.find((r) => r.outcome === 'failed' && r.reason);
    progress.state = 'error';
    progress.statusMessage = `Extraction failed: 0 extracted, ${progress.skippedCount} skipped, ${progress.failedCount} failed.`;
    progress.errorMessage = firstFailedRecord?.reason
      ? `All ${progress.failedCount} video(s) failed to convert. Last error: ${firstFailedRecord.reason}`
      : `All ${progress.failedCount} video(s) failed to convert.`;
    emit();
    return { ...progress, records: [...records] };
  }

  progress.state = 'completed';
  progress.statusMessage = `Finished! ${progress.completedCount} extracted, ${progress.skippedCount} skipped, ${progress.failedCount} failed.`;
  emit();

  return { ...progress, records: [...records] };
}
