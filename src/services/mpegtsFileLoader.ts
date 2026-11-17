/**
 * Incremental File-backed Loader for mpegts.js
 *
 * Implements Mpegts.BaseLoader interface using bounded File.slice() calls.
 * No whole-file memory reads, no temporary disk files, and no HTTP server required.
 */

export const LoaderStatus = {
  kIdle: 0,
  kConnecting: 1,
  kBuffering: 2,
  kError: 3,
  kComplete: 4,
} as const;

export interface FileBlobDataSource {
  file?: File;
  syncOffset?: number;
  url?: string;
  [key: string]: unknown;
}

export interface RangeRequest {
  from: number;
  to: number;
}

export class FileBlobLoader {
  private readonly _type: string = 'FileBlobLoader';
  protected _status: number = LoaderStatus.kIdle;
  protected _needStash: boolean = true;
  protected _aborted: boolean = false;
  protected _currentRequestId: number = 0;
  // 188 bytes * 1024 = 192,512 bytes (integer multiple of MPEG-TS packets)
  protected _chunkSize: number = 188 * 1024;
  protected _contextFile?: File;
  protected _contextSyncOffset?: number;

  public onContentLengthKnown: ((contentLength: number) => void) | null = null;
  public onURLRedirect: ((redirectedURL: string) => void) | null = null;
  public onDataArrival: ((chunk: ArrayBuffer, byteStart: number, receivedLength?: number) => void) | null = null;
  public onError: ((errorType: string, errorInfo: { code: number; msg: string }) => void) | null = null;
  public onComplete: ((rangeFrom: number, rangeTo: number) => void) | null = null;

  public constructor(
    _seekHandler?: unknown,
    _config?: unknown,
    contextFile?: File,
    contextSyncOffset?: number
  ) {
    this._contextFile = contextFile;
    this._contextSyncOffset = contextSyncOffset;
  }

  public get type(): string {
    return this._type;
  }

  public get status(): number {
    return this._status;
  }

  public get needStashBuffer(): boolean {
    return this._needStash;
  }

  public isWorking(): boolean {
    return this._status === LoaderStatus.kConnecting || this._status === LoaderStatus.kBuffering;
  }

  public destroy(): void {
    this.abort();
    this.onContentLengthKnown = null;
    this.onURLRedirect = null;
    this.onDataArrival = null;
    this.onError = null;
    this.onComplete = null;
    this._contextFile = undefined;
    this._contextSyncOffset = undefined;
  }

  public abort(): void {
    this._currentRequestId++;
    this._aborted = true;
    this._status = LoaderStatus.kIdle;
  }

  public async open(dataSource: FileBlobDataSource, range: RangeRequest): Promise<void> {
    const requestId = ++this._currentRequestId;
    this._aborted = false;
    this._status = LoaderStatus.kConnecting;

    const file = dataSource?.file || this._contextFile;
    if (!file) {
      this._status = LoaderStatus.kError;
      const errorMsg = 'FileBlobLoader: File instance is missing from both dataSource and loader context.';
      console.error('[FileBlobLoader]', errorMsg, { dataSource, range });
      this.onError?.('Exception', {
        code: -1,
        msg: errorMsg,
      });
      return;
    }

    const syncOffset = Math.max(0, dataSource?.syncOffset ?? this._contextSyncOffset ?? 0);
    const totalStreamLength = Math.max(0, file.size - syncOffset);

    if (this.onContentLengthKnown && requestId === this._currentRequestId && !this._aborted) {
      this.onContentLengthKnown(totalStreamLength);
    }

    const rangeFrom = typeof range?.from === 'number' && range.from >= 0 ? range.from : 0;
    const rangeTo =
      typeof range?.to === 'number' && range.to > 0 && range.to < totalStreamLength
        ? range.to
        : totalStreamLength - 1;

    const fileStart = syncOffset + rangeFrom;
    const fileEnd = Math.min(file.size, syncOffset + rangeTo + 1);
    const requestLength = Math.max(0, fileEnd - fileStart);

    this._status = LoaderStatus.kBuffering;

    let offset = 0;
    try {
      while (offset < requestLength && !this._aborted && requestId === this._currentRequestId) {
        const currentChunkSize = Math.min(this._chunkSize, requestLength - offset);
        const chunkSlice = file.slice(fileStart + offset, fileStart + offset + currentChunkSize);
        const arrayBuf = await chunkSlice.arrayBuffer();

        if (this._aborted || requestId !== this._currentRequestId) break;

        if (this.onDataArrival) {
          this.onDataArrival(arrayBuf, rangeFrom + offset, arrayBuf.byteLength);
        }

        offset += currentChunkSize;

        // Yield to the browser event loop so demuxer and MSE buffer processing can run smoothly
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (this._aborted || requestId !== this._currentRequestId) break;
      }

      if (!this._aborted && requestId === this._currentRequestId) {
        this._status = LoaderStatus.kComplete;
        if (this.onComplete) {
          this.onComplete(rangeFrom, rangeFrom + offset - 1);
        }
      }
    } catch (err: unknown) {
      if (!this._aborted && requestId === this._currentRequestId) {
        this._status = LoaderStatus.kError;
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[FileBlobLoader] Read exception:', err);
        this.onError?.('Exception', {
          code: -1,
          msg,
        });
      }
    }
  }
}

/**
 * Creates a custom loader constructor pinned with the target File and syncOffset.
 * This guarantees mpegts.js retains access to the file even when IOController
 * creates loader instances without full dataSource properties.
 */
export function createFileBlobLoaderClass(file: File, syncOffset: number) {
  return class ContextualFileBlobLoader extends FileBlobLoader {
    public constructor(seekHandler?: unknown, config?: unknown) {
      super(seekHandler, config, file, syncOffset);
    }
  };
}
