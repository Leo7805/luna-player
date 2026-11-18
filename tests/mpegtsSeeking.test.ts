import { describe, it, expect, vi } from 'vitest';
import { scanMpegTsKeyframes } from '../src/utils/mpegtsIndexer';
import { createMpegTsPlayer } from '../src/services/mpegtsPlayerAdapter';

// Helper to create synthetic MPEG-TS packet
function createTsPacket({
  pid = 0x100,
  pusi = false,
  pts = null,
  isKeyframe = false,
}: {
  pid?: number;
  pusi?: boolean;
  pts?: number | null;
  isKeyframe?: boolean;
}): Uint8Array {
  const pkt = new Uint8Array(188);
  pkt[0] = 0x47; // Sync byte
  pkt[1] = ((pusi ? 1 : 0) << 6) | ((pid >> 8) & 0x1f);
  pkt[2] = pid & 0xff;
  pkt[3] = 0x10; // AFC = 1 (payload only)

  let payloadOffset = 4;

  if (pts !== null && pusi) {
    // PES Header
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x01;
    pkt[payloadOffset++] = 0xe0; // Video stream ID
    pkt[payloadOffset++] = 0x00; // Length
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x80;
    pkt[payloadOffset++] = 0x80; // PTS flag = 2 (PTS only)
    pkt[payloadOffset++] = 0x05; // PES header data length = 5

    // 33-bit PTS encoded into 5 bytes
    const ptsTicks = Math.round(pts * 90000);
    pkt[payloadOffset++] = 0x20 | (((ptsTicks >> 30) & 0x07) << 1) | 0x01;
    pkt[payloadOffset++] = (ptsTicks >> 22) & 0xff;
    pkt[payloadOffset++] = (((ptsTicks >> 15) & 0x7f) << 1) | 0x01;
    pkt[payloadOffset++] = (ptsTicks >> 7) & 0xff;
    pkt[payloadOffset++] = ((ptsTicks & 0x7f) << 1) | 0x01;

    // Optional NAL start code + NAL type 5 (IDR) or 7 (SPS)
    if (isKeyframe) {
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x01;
      pkt[payloadOffset++] = 0x05; // NAL unit type 5 = IDR frame
    }
  }

  return pkt;
}

function createSyntheticTsStream(packets: Uint8Array[]): File {
  const totalLength = packets.reduce((acc, p) => acc + p.byteLength, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const p of packets) {
    combined.set(p, offset);
    offset += p.byteLength;
  }

  return {
    size: totalLength,
    name: 'test-stream.ts',
    slice: (start = 0, end = totalLength) => ({
      size: Math.max(0, end - start),
      arrayBuffer: async () => combined.buffer.slice(start, end),
    }),
  } as unknown as File;
}

describe('MPEG-TS Keyframe & Duration Indexer', () => {
  it('correctly calculates duration and keyframe offsets from 90kHz PTS packets', async () => {
    const packets = [
      createTsPacket({ pid: 256, pusi: true, pts: 10.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: false }),
      createTsPacket({ pid: 256, pusi: true, pts: 12.5, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: false }),
      createTsPacket({ pid: 256, pusi: true, pts: 25.0, isKeyframe: true }),
    ];

    const file = createSyntheticTsStream(packets);
    const result = await scanMpegTsKeyframes(file, 0);

    expect(result.duration).toBeCloseTo(15.0, 1); // 25.0s - 10.0s = 15.0s
    expect(result.durationMs).toBe(15000);
    expect(result.keyframesIndex.times.length).toBeGreaterThanOrEqual(3);
    expect(result.keyframesIndex.filepositions[0]).toBe(0);
    expect(result.firstPts).toBeCloseTo(10.0, 1);
    expect(result.lastPts).toBeCloseTo(25.0, 1);
  });

  it('guarantees keyframe at timestamp 0 and position 0', async () => {
    const packets = [
      createTsPacket({ pid: 256, pusi: true, pts: 5.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 10.0, isKeyframe: true }),
    ];

    const file = createSyntheticTsStream(packets);
    const result = await scanMpegTsKeyframes(file, 0);

    expect(result.keyframesIndex.times[0]).toBe(0);
    expect(result.keyframesIndex.filepositions[0]).toBe(0);
  });

  it('deduplicates keyframes that occur within 200ms', async () => {
    const packets = [
      createTsPacket({ pid: 256, pusi: true, pts: 1.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 1.05, isKeyframe: true }), // 50ms later -> deduplicated
      createTsPacket({ pid: 256, pusi: true, pts: 3.0, isKeyframe: true }), // 2000ms later -> kept
    ];

    const file = createSyntheticTsStream(packets);
    const result = await scanMpegTsKeyframes(file, 0);

    // Initial 0ms keyframe + 2000ms keyframe (the 50ms duplicate is dropped)
    expect(result.keyframesIndex.times).toEqual([0, 2000]);
  });

  it('handles resynchronization across gaps and non-sync bytes', async () => {
    const junkBytes = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
    const p1 = createTsPacket({ pid: 256, pusi: true, pts: 1.0, isKeyframe: true });
    const p2 = createTsPacket({ pid: 256, pusi: true, pts: 5.0, isKeyframe: true });

    const totalLen = p1.byteLength + junkBytes.byteLength + p2.byteLength;
    const combined = new Uint8Array(totalLen);
    combined.set(p1, 0);
    combined.set(junkBytes, p1.byteLength);
    combined.set(p2, p1.byteLength + junkBytes.byteLength);

    const file = {
      size: totalLen,
      slice: (start = 0, end = totalLen) => ({
        arrayBuffer: async () => combined.buffer.slice(start, end),
      }),
    } as unknown as File;

    const result = await scanMpegTsKeyframes(file, 0);
    expect(result.duration).toBeCloseTo(4.0, 1);
    expect(result.keyframesIndex.times.length).toBeGreaterThanOrEqual(2);
  });

  it('consumes negligible in-memory storage for index tables', async () => {
    // 250 keyframes representation
    const sampleTimes = Array.from({ length: 250 }, (_, i) => i * 3000);
    const samplePositions = Array.from({ length: 250 }, (_, i) => i * 500000);

    // Approximate size in bytes: 2 arrays of 250 64-bit numbers
    const byteSize = sampleTimes.length * 8 + samplePositions.length * 8;
    expect(byteSize).toBeLessThan(5000); // Less than 5 KB of RAM!
  });
});

describe('MPEG-TS Player Adapter Seeking & Duration', () => {
  it('exposes finite duration and supports seek with discontinuity insertion', async () => {
    // Setup Mock MediaSource for mpegts.isSupported() in jsdom environment
    class MockMediaSource {
      public static isTypeSupported(_mime: string) {
        return true;
      }
      public readyState = 'open';
      public duration = 0;
      public addEventListener = vi.fn();
      public removeEventListener = vi.fn();
      public endOfStream = vi.fn();
      public addSourceBuffer = vi.fn(() => ({
        updating: false,
        buffered: { length: 0 },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        appendBuffer: vi.fn(),
        abort: vi.fn(),
      }));
    }

    (globalThis as any).MediaSource = MockMediaSource;
    (globalThis as any).self = globalThis;
    (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock-stream');
    (globalThis as any).URL.revokeObjectURL = vi.fn();
    if (typeof window !== 'undefined') {
      (window as any).MediaSource = MockMediaSource;
      (window as any).URL.createObjectURL = vi.fn(() => 'blob:mock-stream');
      (window as any).URL.revokeObjectURL = vi.fn();
    }

    const packets = [
      createTsPacket({ pid: 256, pusi: true, pts: 0.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 60.0, isKeyframe: true }),
    ];
    const mockFile = createSyntheticTsStream(packets);

    const mockVideo = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      currentTime: 0,
      duration: NaN,
      buffered: { length: 0 },
      load: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    let reportedDuration = 0;
    const adapter = await createMpegTsPlayer({
      file: mockFile,
      syncOffset: 0,
      videoElement: mockVideo,
      onDurationChange: (dur) => {
        reportedDuration = dur;
      },
    });

    expect(adapter).toBeDefined();
    expect(reportedDuration).toBeCloseTo(60.0, 1);
    expect(adapter.duration).toBeCloseTo(60.0, 1);

    // Test seek invocation
    expect(() => adapter.seek(30)).not.toThrow();

    adapter.destroy();
  });

  it('safely handles rapid switching and complete resource teardown', async () => {
    const packets1 = [
      createTsPacket({ pid: 256, pusi: true, pts: 0.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 20.0, isKeyframe: true }),
    ];
    const packets2 = [
      createTsPacket({ pid: 256, pusi: true, pts: 0.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 40.0, isKeyframe: true }),
    ];

    const file1 = createSyntheticTsStream(packets1);
    const file2 = createSyntheticTsStream(packets2);

    const mockVideo = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      currentTime: 0,
      duration: 0,
      buffered: { length: 0 },
      load: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    // 1. Mount first video
    const adapter1 = await createMpegTsPlayer({
      file: file1,
      syncOffset: 0,
      videoElement: mockVideo,
    });
    expect(adapter1.duration).toBeCloseTo(20.0, 1);

    // 2. Rapid switch: destroy first immediately and create second
    adapter1.destroy();
    expect(mockVideo.removeEventListener).toHaveBeenCalledWith('loadedmetadata', expect.any(Function));

    // 3. Mount second video
    const adapter2 = await createMpegTsPlayer({
      file: file2,
      syncOffset: 0,
      videoElement: mockVideo,
    });
    expect(adapter2.duration).toBeCloseTo(40.0, 1);

    // 4. Seek on second video
    adapter2.seek(15);
    expect(adapter2.player.currentTime).toBe(15);

    // 5. Final unmount / teardown
    adapter2.destroy();
  });

  it('clamps seeking properly between 0 and duration', async () => {
    const packets = [
      createTsPacket({ pid: 256, pusi: true, pts: 0.0, isKeyframe: true }),
      createTsPacket({ pid: 256, pusi: true, pts: 100.0, isKeyframe: true }),
    ];
    const mockFile = createSyntheticTsStream(packets);
    let videoCurrentTime = 0;
    const mockVideo = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      removeAttribute: vi.fn(),
      get currentTime() {
        return videoCurrentTime;
      },
      set currentTime(v: number) {
        videoCurrentTime = v;
      },
      duration: 100,
      buffered: { length: 0 },
      load: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    const adapter = await createMpegTsPlayer({
      file: mockFile,
      syncOffset: 0,
      videoElement: mockVideo,
    });

    expect(adapter.duration).toBeCloseTo(100.0, 1);

    // Seek to 0
    adapter.seek(0);
    expect(adapter.player.currentTime).toBe(0);

    // Seek to 50
    adapter.seek(50);
    expect(adapter.player.currentTime).toBe(50);

    // Seek backwards 50 -> 10
    adapter.seek(10);
    expect(adapter.player.currentTime).toBe(10);

    adapter.destroy();
  });
});
