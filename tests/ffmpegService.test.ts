import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserFfmpegService } from '../src/services/ffmpegService';
import { loadFfmpegRuntime } from '../src/services/ffmpegRuntime';

vi.mock('../src/services/ffmpegRuntime', () => ({ loadFfmpegRuntime: vi.fn(), finishFfmpegRuntimeLoad: vi.fn() }));
const instances: FakeFfmpeg[] = [];
let load: () => Promise<void>;
class FakeFfmpeg {
  loaded = false;
  terminate = vi.fn(() => { this.loaded = false; });
  constructor() { instances.push(this); }
  async load() { await load(); this.loaded = true; }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  instances.length = 0;
  load = async () => {};
  vi.mocked(loadFfmpegRuntime).mockResolvedValue({
    FFmpegClass: FakeFfmpeg as never, classWorkerURL: 'blob:worker', coreURL: 'blob:core', wasmURL: 'blob:wasm',
  });
});
afterEach(() => vi.useRealTimers());

describe('FFmpeg initialization lifecycle', () => {
  it('loads once, shares concurrent initialization, and recreates after termination', async () => {
    const service = new BrowserFfmpegService();
    await Promise.all([service.initialize(), service.initialize()]);
    expect(instances).toHaveLength(1);
    service.terminate();
    await service.initialize();
    expect(instances).toHaveLength(2);
    expect(instances[0].terminate).toHaveBeenCalled();
    service.terminate();
  });

  it.each(['Core JavaScript failed', 'WASM compilation failed'])('cleans up and retries: %s', async message => {
    load = async () => { throw new Error(message); };
    const service = new BrowserFfmpegService();
    await expect(service.initialize()).rejects.toThrow(message);
    expect(instances[0].terminate).toHaveBeenCalled();
    load = async () => {};
    await service.initialize();
    expect(instances[1].loaded).toBe(true);
    service.terminate();
  });

  it('bounds silent worker script failure and terminates the affected worker', async () => {
    vi.useFakeTimers();
    load = () => new Promise(() => {});
    const service = new BrowserFfmpegService(100);
    const result = expect(service.initialize()).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(instances[0].terminate).toHaveBeenCalled();
    load = async () => {};
    await service.initialize();
    service.terminate();
  });

  it('cancels initialization without a stale attempt replacing a newer instance', async () => {
    let release!: () => void;
    load = () => new Promise<void>(resolve => { release = resolve; });
    const service = new BrowserFfmpegService();
    const controller = new AbortController();
    const result = expect(service.initialize(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    controller.abort();
    load = async () => {};
    await service.initialize();
    release();
    await result;
    await flush();
    await service.initialize();
    expect(instances).toHaveLength(2);
    expect(instances[1].terminate).not.toHaveBeenCalled();
    service.terminate();
  });

  it('can terminate while runtime imports are still pending', async () => {
    let release!: (value: Awaited<ReturnType<typeof loadFfmpegRuntime>>) => void;
    vi.mocked(loadFfmpegRuntime).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const service = new BrowserFfmpegService();
    const result = expect(service.initialize()).rejects.toMatchObject({ name: 'AbortError' });
    service.terminate();
    await service.initialize();
    release({ FFmpegClass: FakeFfmpeg as never, classWorkerURL: '', coreURL: '', wasmURL: '' });
    await result;
    expect(instances).toHaveLength(1);
    service.terminate();
  });
});
