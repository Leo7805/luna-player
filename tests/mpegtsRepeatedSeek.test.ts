import { describe, it, expect, vi } from 'vitest';
import { createMpegTsPlayer } from '../src/services/mpegtsPlayerAdapter';

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
  pkt[0] = 0x47;
  pkt[1] = ((pusi ? 1 : 0) << 6) | ((pid >> 8) & 0x1f);
  pkt[2] = pid & 0xff;
  pkt[3] = 0x10;

  let payloadOffset = 4;

  if (pts !== null && pusi) {
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x01;
    pkt[payloadOffset++] = 0xe0;
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x00;
    pkt[payloadOffset++] = 0x80;
    pkt[payloadOffset++] = 0x80;
    pkt[payloadOffset++] = 0x05;

    const ptsTicks = Math.round(pts * 90000);
    pkt[payloadOffset++] = 0x20 | (((ptsTicks >> 30) & 0x07) << 1) | 0x01;
    pkt[payloadOffset++] = (ptsTicks >> 22) & 0xff;
    pkt[payloadOffset++] = (((ptsTicks >> 15) & 0x7f) << 1) | 0x01;
    pkt[payloadOffset++] = (ptsTicks >> 7) & 0xff;
    pkt[payloadOffset++] = ((ptsTicks & 0x7f) << 1) | 0x01;

    if (isKeyframe) {
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x00;
      pkt[payloadOffset++] = 0x01;
      pkt[payloadOffset++] = 0x05;
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

describe('MPEG-TS Repeated Seeking & Timestamp Stability', () => {
  it('maintains finite duration and stable timestamp state across 20+ seeks', async () => {
    class MockMediaSource {
      public static isTypeSupported(_mime: string) {
        return true;
      }
      public readyState = 'open';
      public duration = 808.5;
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

    // Generate packets representing keyframes every 60 seconds up to 800 seconds
    const packets: Uint8Array[] = [];
    for (let t = 0; t <= 800; t += 60) {
      packets.push(createTsPacket({ pid: 256, pusi: true, pts: t, isKeyframe: true }));
      packets.push(createTsPacket({ pid: 256, pusi: false }));
    }
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
      duration: 808.5,
      buffered: { length: 0 },
      load: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    let reportedDuration = 0;
    const adapter = await createMpegTsPlayer({
      file: mockFile,
      syncOffset: 0,
      videoElement: mockVideo,
      onDurationChange: (d) => {
        reportedDuration = d;
      },
    });

    expect(reportedDuration).toBeCloseTo(780.0, 1);
    expect(adapter.duration).toBeCloseTo(780.0, 1);

    // Sequence of 20 rapid seeks back and forth
    const seekTargets = [
      60, 540, 180, 720, 300, 600, 30, 420, 120, 660,
      60, 540, 180, 720, 300, 600, 30, 420, 120, 660,
    ];

    for (const target of seekTargets) {
      adapter.seek(target);
      expect(reportedDuration).toBeCloseTo(780.0, 1);
    expect(adapter.duration).toBeCloseTo(780.0, 1);
      expect(adapter.duration).toBeLessThan(1000);
      expect(mockVideo.currentTime).toBeLessThanOrEqual(adapter.duration);
    }

    adapter.destroy();
  });

  it('runs 20+ seeks on the real OneDrive MPEG-TS test file without timestamp explosion', async () => {
    const fs = await import('fs');
    const filePath = '/Users/leo/Library/CloudStorage/OneDrive-Personal/X 第1集-超清720P.mp4';
    if (!fs.existsSync(filePath)) return;

    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);

    const realFile = {
      size: stat.size,
      name: 'X 第1集-超清720P.mp4',
      slice: (start = 0, end = stat.size) => {
        const sliceLength = Math.max(0, end - start);
        return {
          size: sliceLength,
          arrayBuffer: async () => {
            const buf = Buffer.alloc(sliceLength);
            fs.readSync(fd, buf, 0, sliceLength, start);
            return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          },
        };
      },
    } as unknown as File;

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
      duration: 808.5,
      buffered: { length: 0 },
      load: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;

    const adapter = await createMpegTsPlayer({
      file: realFile,
      syncOffset: 49093,
      videoElement: mockVideo,
    });

    const emittedSegments: Array<{ type: string; beginDts: number; endDts: number }> = [];
    const remuxer = (adapter.player as any)._player_engine?._transmuxer?._controller?._remuxer;
    if (remuxer) {
      const origOnMediaSegment = remuxer._onMediaSegment;
      remuxer._onMediaSegment = (type: string, seg: any) => {
        if (seg.info) {
          emittedSegments.push({
            type,
            beginDts: seg.info.beginDts,
            endDts: seg.info.endDts,
          });
        }
        return origOnMediaSegment?.(type, seg);
      };
    }

    console.log('Real video initial scanned duration:', adapter.duration);
    expect(adapter.duration).toBeGreaterThan(800);
    expect(adapter.duration).toBeLessThan(820);

    // Perform reproduction seek sequence:
    // 01:00 → 09:00 → 03:00 → 12:00 → 05:00 → 10:00 → 00:30 → 07:00 → 02:00 → 11:00
    const seeks = [
      60, 540, 180, 720, 300, 600, 30, 420, 120, 660,
      60, 540, 180, 720, 300, 600, 30, 420, 120, 660,
    ];

    for (let i = 0; i < seeks.length; i++) {
      const target = seeks[i];
      adapter.seek(target);
      // Wait for async IO tick
      await new Promise((r) => setTimeout(r, 60));

      const mediaSource = (adapter.player as any)._player_engine?._mse_controller?._mediaSource;

      // Check for duration explosion
      if (mediaSource) {
        expect(mediaSource.duration).toBeLessThan(1000);
      }
      expect(adapter.duration).toBeLessThan(1000);
      expect(mockVideo.currentTime).toBeLessThan(1000);
    }

    console.log('Total emitted segments count:', emittedSegments.length);
    if (emittedSegments.length > 0) {
      console.log('Sample emitted segments:', emittedSegments.slice(0, 10));
      console.log('Max endDts:', Math.max(...emittedSegments.map((s) => s.endDts)));
    }

    adapter.destroy();
    fs.closeSync(fd);
  });
});
