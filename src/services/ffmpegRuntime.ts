/** Retain runtime bytes for this page session, independent of the HTTP cache. */
export interface FfmpegRuntime {
  FFmpegClass: typeof import('@ffmpeg/ffmpeg').FFmpeg;
  classWorkerURL: string;
  coreURL: string;
  wasmURL: string;
}

let runtime: FfmpegRuntime | undefined;
let validated = false;
let pending: Promise<FfmpegRuntime> | undefined;

export function loadFfmpegRuntime(signal: AbortSignal): Promise<FfmpegRuntime> {
  if (runtime) return Promise.resolve(runtime);
  if (pending) return pending;
  const attempt = (async () => {
    const urls: string[] = [];
    try {
      const [module, worker, core, wasm] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/ffmpeg/worker?worker&url'),
        import('@ffmpeg/core?url'),
        import('@ffmpeg/core/wasm?url'),
      ]);
      const retain = async (url: string, type: string) => {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`FFmpeg resource request failed (${response.status}).`);
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        const blobURL = URL.createObjectURL(new Blob([bytes], { type }));
        urls.push(blobURL);
        return blobURL;
      };
      // Sequential so a failed fetch cannot strand a later-created Blob URL.
      const classWorkerURL = await retain(worker.default, 'text/javascript');
      const coreURL = await retain(core.default, 'text/javascript');
      const wasmURL = await retain(wasm.default, 'application/wasm');
      signal.throwIfAborted();
      runtime = { FFmpegClass: module.FFmpeg, classWorkerURL, coreURL, wasmURL };
      return runtime;
    } catch (error) {
      urls.forEach(url => URL.revokeObjectURL(url));
      if (!signal.aborted && error instanceof TypeError && !navigator.onLine) {
        throw new Error('Unable to load the FFmpeg audio engine while offline. Please reconnect and try again.');
      }
      throw error;
    }
  })();
  pending = attempt;
  // Aborting an old attempt must not block a new attempt or clear its state.
  const clear = () => { if (pending === attempt) pending = undefined; };
  signal.addEventListener('abort', clear, { once: true });
  void attempt.finally(() => {
    clear();
    signal.removeEventListener('abort', clear);
  }).catch(() => {});
  return attempt;
}

/** Keep verified bytes across cancellation; discard unverified bytes after a load failure. */
export function finishFfmpegRuntimeLoad(value: FfmpegRuntime, success: boolean): void {
  if (runtime !== value) return;
  if (success) validated = true;
  else if (!validated) {
    [value.classWorkerURL, value.coreURL, value.wasmURL].forEach(url => URL.revokeObjectURL(url));
    runtime = undefined;
  }
}
