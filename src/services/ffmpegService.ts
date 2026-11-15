import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  AudioOutputFormat,
  buildFfmpegArgs,
  classifyFfmpegError,
  ExtractionFailureStage,
  ExtractionStageError,
  extractOriginalErrorNameAndMessage,
  splitFileName,
} from '../utils/audioExtractor';

export interface FfmpegEncodeResult {
  data: Uint8Array;
  args: string[];
}

export interface AudioEncoderAdapter {
  initialize(signal?: AbortSignal): Promise<void>;
  extractAudio(
    file: File,
    format: AudioOutputFormat,
    signal?: AbortSignal,
    refreshFile?: () => Promise<File>
  ): Promise<FfmpegEncodeResult>;
  terminate(): void;
}

/**
 * Dedicated error class for global FFmpeg worker / WASM core initialization failures.
 * Allows batch orchestration to halt immediately instead of failing every file in the queue.
 */
export class FfmpegInitializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FfmpegInitializationError';
  }
}

export function isFfmpegInitializationError(err: unknown): err is FfmpegInitializationError {
  return (
    err instanceof FfmpegInitializationError ||
    (err instanceof Error && err.name === 'FfmpegInitializationError')
  );
}

function formatWorkerError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name;
  }
  if (typeof err === 'string' && err.trim().length > 0) {
    return err.trim();
  }
  if (err !== undefined && err !== null) {
    const str = String(err).trim();
    if (str && str !== '[object Object]') {
      return str;
    }
  }
  return 'Unknown WebAssembly worker error.';
}

function isFatalWasmCrash(err: unknown): boolean {
  const text = formatWorkerError(err).toLowerCase();
  return (
    text.includes('memory access out of bounds') ||
    text.includes('out of memory') ||
    text.includes('cannot enlarge memory') ||
    text.includes('runtimeerror') ||
    text.includes('unreachable') ||
    text.includes('terminated')
  );
}

function isFileAccessDomExceptionName(name: string): boolean {
  return (
    name === 'InvalidStateError' ||
    name === 'NotReadableError' ||
    name === 'NotFoundError' ||
    name === 'SecurityError' ||
    name === 'NotAllowedError'
  );
}

/**
 * Singleton-like manager for the lazy-loaded FFmpeg.wasm single-threaded worker.
 * Isolated from playback logic so FFmpeg is only loaded when audio extraction is requested.
 */
class BrowserFfmpegService implements AudioEncoderAdapter {
  private ffmpeg: FFmpeg | null = null;
  private loadingPromise: Promise<void> | null = null;
  private jobCounter = 0;

  async initialize(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new DOMException('Operation was aborted', 'AbortError');
    }

    if (this.ffmpeg && this.ffmpeg.loaded) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.loadInternal(signal);
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async loadInternal(signal?: AbortSignal): Promise<void> {
    let coreBlobUrl: string | null = null;
    try {
      const [{ FFmpeg: FFmpegClass }, { toBlobURL }, coreUrlMod, wasmUrlMod] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
        import('@ffmpeg/core?url'),
        import('@ffmpeg/core/wasm?url'),
      ]);

      if (signal?.aborted) {
        throw new DOMException('Operation was aborted', 'AbortError');
      }

      const baseHref = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
      const resolvedCoreUrl = new URL(coreUrlMod.default, baseHref).href;
      const resolvedWasmUrl = new URL(wasmUrlMod.default, baseHref).href;

      const instance = new FFmpegClass();
      try {
        await instance.load(
          {
            coreURL: resolvedCoreUrl,
            wasmURL: resolvedWasmUrl,
          },
          signal ? { signal } : undefined
        );
      } catch (directLoadErr) {
        if (
          signal?.aborted ||
          (directLoadErr instanceof DOMException && directLoadErr.name === 'AbortError')
        ) {
          instance.terminate();
          throw new DOMException('Operation was aborted', 'AbortError');
        }
        // Fallback to Blob URL if direct module import of coreURL was rejected by worker
        instance.terminate();
        const fallbackInstance = new FFmpegClass();
        coreBlobUrl = await toBlobURL(resolvedCoreUrl, 'text/javascript');
        if (signal?.aborted) {
          fallbackInstance.terminate();
          throw new DOMException('Operation was aborted', 'AbortError');
        }
        await fallbackInstance.load(
          {
            coreURL: coreBlobUrl,
            wasmURL: resolvedWasmUrl,
          },
          signal ? { signal } : undefined
        );
        this.ffmpeg = fallbackInstance;
        return;
      }

      this.ffmpeg = instance;
    } catch (err) {
      this.terminate();
      if (coreBlobUrl && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(coreBlobUrl);
        } catch {
          // Ignore revoke errors
        }
      }
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw new DOMException('Operation was aborted', 'AbortError');
      }
      const detail = formatWorkerError(err);
      throw new FfmpegInitializationError(
        `Failed to initialize FFmpeg WebAssembly: ${detail}`
      );
    }
  }

  async extractAudio(
    file: File,
    format: AudioOutputFormat,
    signal?: AbortSignal,
    refreshFile?: () => Promise<File>
  ): Promise<FfmpegEncodeResult> {
    await this.initialize(signal);

    try {
      // Primary attempt: stream input via WORKERFS with 2-channel stereo output
      return await this.runExtractionAttempt(file, format, signal, {
        preferWorkerFs: true,
        channels: 2,
      });
    } catch (firstErr) {
      if (
        signal?.aborted ||
        (firstErr instanceof DOMException && firstErr.name === 'AbortError') ||
        isFfmpegInitializationError(firstErr)
      ) {
        throw firstErr;
      }

      const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
      // Do not retry if the source file genuinely has no audio track or is corrupted
      if (
        firstMsg.includes('No audio track found') ||
        firstMsg.includes('Corrupted or unsupported media container')
      ) {
        throw firstErr;
      }

      // If a FileSystemFileHandle is available, refresh the File snapshot via getFile()
      // before reading into MEMFS in case the previous File object became stale on disk.
      let fallbackFile = file;
      if (refreshFile) {
        try {
          fallbackFile = await refreshFile();
        } catch (refreshErr) {
          throw new ExtractionStageError('reading_source', refreshErr);
        }
      }

      await this.initialize(signal);
      return await this.runExtractionAttempt(fallbackFile, format, signal, {
        preferWorkerFs: false,
        channels: format === 'webm' ? 1 : 2,
      });
    }
  }

  private async runExtractionAttempt(
    file: File,
    format: AudioOutputFormat,
    signal: AbortSignal | undefined,
    options: { preferWorkerFs: boolean; channels: 1 | 2 }
  ): Promise<FfmpegEncodeResult> {
    const ffmpeg = this.ffmpeg;
    if (!ffmpeg || !ffmpeg.loaded) {
      throw new FfmpegInitializationError('FFmpeg engine is not loaded.');
    }

    const jobId = ++this.jobCounter;
    const { extension: srcExt } = splitFileName(file.name);
    const safeSrcExt = srcExt && /^[a-z0-9]+$/i.test(srcExt) ? srcExt : 'mp4';
    const targetExt = format === 'mp3' ? 'mp3' : 'webm';

    const mountDir = `/work_${jobId}`;
    const mountedInputName = `input_${jobId}.${safeSrcExt}`;
    let inputVirtualPath = `${mountDir}/${mountedInputName}`;
    const outputVirtualPath = `/output_${jobId}.${targetExt}`;

    let usedWorkerFs = false;
    let wroteMemFsInput = false;
    let activeStage: ExtractionFailureStage = 'mounting_input';
    const logs: string[] = [];

    const onLog = ({ message }: { message: string }) => {
      logs.push(message);
    };

    ffmpeg.on('log', onLog);

    try {
      if (options.preferWorkerFs) {
        try {
          const { FFFSType } = await import('@ffmpeg/ffmpeg');
          await ffmpeg.createDir(mountDir);
          const mounted = await ffmpeg.mount(
            FFFSType.WORKERFS,
            { blobs: [{ name: mountedInputName, data: file }] },
            mountDir
          );
          if (mounted) {
            usedWorkerFs = true;
          }
        } catch {
          usedWorkerFs = false;
        }
      }

      if (!usedWorkerFs) {
        inputVirtualPath = `/input_${jobId}.${safeSrcExt}`;
        let buffer: ArrayBuffer;
        try {
          buffer = await file.arrayBuffer();
        } catch (readErr) {
          throw new ExtractionStageError('reading_source', readErr, { logs });
        }
        if (signal?.aborted) {
          throw new DOMException('Operation was aborted', 'AbortError');
        }
        try {
          await ffmpeg.writeFile(
            inputVirtualPath,
            new Uint8Array(buffer),
            signal ? { signal } : undefined
          );
          wroteMemFsInput = true;
        } catch (writeVirtualErr) {
          throw new ExtractionStageError('mounting_input', writeVirtualErr, { logs });
        }
      }

      activeStage = 'running_ffmpeg';
      const args = buildFfmpegArgs(inputVirtualPath, outputVirtualPath, format, options.channels);
      const exitCode = await ffmpeg.exec(args, -1, signal ? { signal } : undefined);

      if (exitCode !== 0) {
        const friendlyReason = classifyFfmpegError(logs);
        throw new ExtractionStageError('running_ffmpeg', new Error(friendlyReason), {
          logs,
          overrideErrorName: 'FFmpegEncodingError',
          overrideMessage: friendlyReason,
        });
      }

      const rawOutput = await ffmpeg.readFile(
        outputVirtualPath,
        'binary',
        signal ? { signal } : undefined
      );

      const outputBytes =
        rawOutput instanceof Uint8Array
          ? rawOutput
          : new TextEncoder().encode(String(rawOutput));

      if (!outputBytes || outputBytes.byteLength === 0) {
        throw new ExtractionStageError(
          'running_ffmpeg',
          new Error('Encoded audio output was empty.'),
          {
            logs,
            overrideErrorName: 'FFmpegEncodingError',
            overrideMessage: 'Encoded audio output was empty.',
          }
        );
      }

      return {
        data: new Uint8Array(outputBytes),
        args,
      };
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        this.terminate();
        throw new DOMException('Operation was aborted', 'AbortError');
      }

      if (isFatalWasmCrash(err)) {
        this.terminate();
      }

      if (err instanceof ExtractionStageError) {
        throw err;
      }

      const parsed = extractOriginalErrorNameAndMessage(err);
      // If WORKERFS FileReaderSync threw a DOMException (e.g., InvalidStateError or NotReadableError)
      // inside the worker while reading the mounted File, preserve the exact DOMException name
      // and full message and attribute it to mounting/accessing the FFmpeg input.
      if (isFileAccessDomExceptionName(parsed.errorName)) {
        const stage: ExtractionFailureStage = usedWorkerFs ? 'mounting_input' : activeStage;
        throw new ExtractionStageError(stage, err, {
          logs,
          overrideErrorName: parsed.errorName,
          overrideMessage: parsed.errorMessage,
        });
      }

      const classified = classifyFfmpegError(logs, err);
      throw new ExtractionStageError(activeStage, err, {
        logs,
        overrideErrorName:
          parsed.errorName !== 'Error' ? parsed.errorName : 'FFmpegEncodingError',
        overrideMessage: classified,
      });
    } finally {
      ffmpeg.off('log', onLog);

      if (this.ffmpeg && this.ffmpeg.loaded) {
        if (usedWorkerFs) {
          try {
            await this.ffmpeg.unmount(mountDir);
          } catch {
            // Ignore unmount errors
          }
          try {
            await this.ffmpeg.deleteDir(mountDir);
          } catch {
            // Ignore deleteDir errors
          }
        }
        if (wroteMemFsInput) {
          try {
            await this.ffmpeg.deleteFile(inputVirtualPath);
          } catch {
            // Ignore cleanup errors
          }
        }
        try {
          await this.ffmpeg.deleteFile(outputVirtualPath);
        } catch {
          // Output file may not exist if encoding failed
        }
      }
    }
  }

  terminate(): void {
    this.loadingPromise = null;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.terminate();
      } catch {
        // Ignore termination errors
      }
      this.ffmpeg = null;
    }
  }
}

export const defaultFfmpegService = new BrowserFfmpegService();
