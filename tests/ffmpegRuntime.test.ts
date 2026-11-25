import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@ffmpeg/ffmpeg', () => ({ FFmpeg: class {} }));
vi.mock('@ffmpeg/ffmpeg/worker?worker&url', () => ({ default: '/assets/worker.js' }));
vi.mock('@ffmpeg/core?url', () => ({ default: '/assets/core.js' }));
vi.mock('@ffmpeg/core/wasm?url', () => ({ default: '/assets/core.wasm' }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('retains all assets across offline worker recreation without additional fetches', async () => {
  const fetch = vi.fn(async () => new Response('runtime'));
  vi.stubGlobal('fetch', fetch);
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retained');
  const { loadFfmpegRuntime } = await import('../src/services/ffmpegRuntime');
  const runtime = await loadFfmpegRuntime(new AbortController().signal);
  fetch.mockImplementation(async () => { throw new TypeError('offline'); });
  expect(await loadFfmpegRuntime(new AbortController().signal)).toBe(runtime);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(create).toHaveBeenCalledTimes(3);
});

it.each([0, 1, 2])('cleans partial resources and retries after resource %i fails', async failureIndex => {
  let count = 0;
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (count++ === failureIndex) return new Response('', { status: 503 });
    return new Response('runtime');
  }));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:temporary');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const { loadFfmpegRuntime } = await import('../src/services/ffmpegRuntime');
  await expect(loadFfmpegRuntime(new AbortController().signal)).rejects.toThrow('503');
  expect(revoke).toHaveBeenCalledTimes(failureIndex);
  await expect(loadFfmpegRuntime(new AbortController().signal)).resolves.toHaveProperty('wasmURL');
});

it('reports unavailable offline resources and can retry after reconnecting', async () => {
  vi.stubGlobal('navigator', { onLine: false });
  const fetch = vi.fn(async (): Promise<Response> => { throw new TypeError('Failed to fetch'); });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retained');
  const { loadFfmpegRuntime } = await import('../src/services/ffmpegRuntime');
  await expect(loadFfmpegRuntime(new AbortController().signal)).rejects.toThrow('while offline');
  fetch.mockImplementation(async () => new Response('runtime'));
  await expect(loadFfmpegRuntime(new AbortController().signal)).resolves.toHaveProperty('wasmURL');
});

it('uses direct worker URL for Vite dev unbundled workers while retaining core and wasm', async () => {
  vi.doMock('@ffmpeg/ffmpeg/worker?worker&url', () => ({
    default: '/node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker_file&type=module',
  }));
  const fetch = vi.fn(async () => new Response('runtime'));
  vi.stubGlobal('fetch', fetch);
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:retained');
  const { loadFfmpegRuntime } = await import('../src/services/ffmpegRuntime');
  const runtime = await loadFfmpegRuntime(new AbortController().signal);
  expect(runtime.classWorkerURL).toBe(
    '/node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker_file&type=module'
  );
  expect(runtime.coreURL).toBe('blob:retained');
  expect(runtime.wasmURL).toBe('blob:retained');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledTimes(2);
});
