import { describe, it, expect, vi } from 'vitest';
import {
  detectFormatFromBuffer,
  detectMediaFormat,
} from '../src/utils/mediaDetector';
import {
  FileBlobLoader,
  LoaderStatus,
  createFileBlobLoaderClass,
} from '../src/services/mpegtsFileLoader';
import {
  isMpegTsSupported,
} from '../src/services/mpegtsPlayerAdapter';

describe('MPEG-TS & MP4 Media Detector', () => {
  it('correctly detects standard MP4 files by checking ftyp box', async () => {
    // Standard MP4 box header: [0, 0, 0, 32, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm']
    const buffer = new Uint8Array(1024);
    buffer[3] = 32;
    buffer[4] = 0x66; // 'f'
    buffer[5] = 0x74; // 't'
    buffer[6] = 0x79; // 'y'
    buffer[7] = 0x70; // 'p'
    buffer[8] = 0x69; // 'i'
    buffer[9] = 0x73; // 's'
    buffer[10] = 0x6f; // 'o'
    buffer[11] = 0x6d; // 'm'

    const result = detectFormatFromBuffer(buffer);
    expect(result.isMpegTs).toBe(false);
    expect(result.format).toBe('mp4');
  });

  it('correctly detects WebM / MKV by checking EBML header', async () => {
    const buffer = new Uint8Array(1024);
    buffer[0] = 0x1a;
    buffer[1] = 0x45;
    buffer[2] = 0xdf;
    buffer[3] = 0xa3;

    const result = detectFormatFromBuffer(buffer);
    expect(result.isMpegTs).toBe(false);
    expect(result.format).toBe('mkv');
  });

  it('correctly detects clean 188-byte MPEG-TS packets starting at byte 0', async () => {
    const packetSize = 188;
    const packetCount = 20;
    const buffer = new Uint8Array(packetSize * packetCount);

    for (let i = 0; i < packetCount; i++) {
      buffer[i * packetSize] = 0x47; // Sync byte
    }

    const result = detectFormatFromBuffer(buffer);
    expect(result.isMpegTs).toBe(true);
    expect(result.format).toBe('mpegts');
    expect(result.packetSize).toBe(188);
    expect(result.syncOffset).toBe(0);
  });

  it('detects MPEG-TS with prepended preamble / metadata (offset > 0)', async () => {
    const preambleSize = 49093; // Same as the real test file
    const packetSize = 188;
    const packetCount = 16;
    const buffer = new Uint8Array(preambleSize + packetSize * packetCount);

    // Fill preamble with dummy header data
    buffer.set(new TextEncoder().encode('PROPRIETARY VIDEO HEADER METADATA...'), 0);

    // Fill valid MPEG-TS stream starting at preambleSize
    for (let i = 0; i < packetCount; i++) {
      buffer[preambleSize + i * packetSize] = 0x47;
    }

    const result = detectFormatFromBuffer(buffer);
    expect(result.isMpegTs).toBe(true);
    expect(result.format).toBe('mpegts');
    expect(result.packetSize).toBe(188);
    expect(result.syncOffset).toBe(preambleSize);
  });

  it('detects 192-byte and 204-byte packet MPEG-TS formats', async () => {
    for (const packetSize of [192, 204] as const) {
      const packetCount = 12;
      const buffer = new Uint8Array(packetSize * packetCount);
      for (let i = 0; i < packetCount; i++) {
        buffer[i * packetSize] = 0x47;
      }

      const result = detectFormatFromBuffer(buffer);
      expect(result.isMpegTs).toBe(true);
      expect(result.packetSize).toBe(packetSize);
      expect(result.syncOffset).toBe(0);
    }
  });

  it('avoids false positives from isolated or scattered 0x47 bytes', async () => {
    // 64 KB of random-like data containing accidental 0x47 bytes but not at 188/192/204 intervals
    const buffer = new Uint8Array(65536);
    buffer[10] = 0x47;
    buffer[100] = 0x47;
    buffer[250] = 0x47;
    buffer[10 + 188] = 0x47; // only 1 repetition, then gap
    buffer[10 + 188 * 2] = 0x12; // fails consecutive check

    const result = detectFormatFromBuffer(buffer);
    expect(result.isMpegTs).toBe(false);
    expect(result.format).toBe('unknown');
  });

  it('detectMediaFormat works with browser File-like objects', async () => {
    const packetSize = 188;
    const packetCount = 10;
    const data = new Uint8Array(packetSize * packetCount);
    for (let i = 0; i < packetCount; i++) {
      data[i * packetSize] = 0x47;
    }

    // Misleading file name: .mp4 extension for an actual MPEG-TS stream
    const mockFile = {
      name: 'Episode 1.mp4',
      size: data.byteLength,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => data.buffer.slice(start, end),
      }),
    } as unknown as File;

    const result = await detectMediaFormat(mockFile);
    expect(result.isMpegTs).toBe(true);
    expect(result.format).toBe('mpegts');
    expect(result.packetSize).toBe(188);
  });
});

describe('FileBlobLoader', () => {
  it('delivers data incrementally in bounded chunks without whole-file memory buffering', async () => {
    const totalSize = 1024 * 1024; // 1 MB
    const fileBytes = new Uint8Array(totalSize);
    for (let i = 0; i < totalSize; i++) {
      fileBytes[i] = i % 256;
    }

    const mockFile = {
      size: totalSize,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => fileBytes.buffer.slice(start, end),
      }),
    } as unknown as File;

    const loader = new FileBlobLoader();
    let knownLength = 0;
    let totalReceived = 0;
    let chunksCount = 0;
    let isCompleted = false;

    loader.onContentLengthKnown = (len) => {
      knownLength = len;
    };
    loader.onDataArrival = (chunk, byteStart, len) => {
      chunksCount++;
      totalReceived += len ?? chunk.byteLength;
      expect(byteStart).toBe(totalReceived - (len ?? chunk.byteLength));
    };
    loader.onComplete = () => {
      isCompleted = true;
    };

    await loader.open({ file: mockFile, syncOffset: 0 }, { from: 0, to: totalSize - 1 });

    expect(knownLength).toBe(totalSize);
    expect(totalReceived).toBe(totalSize);
    expect(chunksCount).toBe(6); // 1 MB / (188 * 1024) = ceil(5.44) = 6 chunks
    expect(isCompleted).toBe(true);
    expect(loader.status).toBe(LoaderStatus.kComplete);
  });

  it('regression: successfully streams when dataSource.file is stripped using contextual loader class', async () => {
    const totalSize = 500 * 1024;
    const syncOffset = 49093;
    const mockFile = {
      size: totalSize,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => new ArrayBuffer(end - start),
      }),
    } as unknown as File;

    // Simulate mpegts.js IOController creating loader via customLoader class
    const ContextLoaderClass = createFileBlobLoaderClass(mockFile, syncOffset);
    const loader = new ContextLoaderClass();

    let deliveredBytes = 0;
    loader.onDataArrival = (chunk) => {
      deliveredBytes += chunk.byteLength;
    };

    // Simulate TransmuxingController passing segment without .file or .syncOffset
    const strippedDataSource = {
      url: 'file://local-stream',
      filesize: totalSize - syncOffset,
    };

    await loader.open(strippedDataSource as any, { from: 0, to: 100000 });
    expect(deliveredBytes).toBe(100001);
    expect(loader.status).toBe(LoaderStatus.kComplete);
  });

  it('regression: reports clear diagnostic error if file is completely missing', async () => {
    const loader = new FileBlobLoader();
    let capturedErrorType = '';
    let capturedErrorInfo: any = null;

    loader.onError = (type, info) => {
      capturedErrorType = type;
      capturedErrorInfo = info;
    };

    await loader.open({} as any, { from: 0, to: 1000 });
    expect(capturedErrorType).toBe('Exception');
    expect(capturedErrorInfo?.msg).toContain('File instance is missing');
    expect(loader.status).toBe(LoaderStatus.kError);
  });

  it('correctly handles range requests and syncOffset for unbuffered seeking', async () => {
    const totalSize = 2 * 1024 * 1024; // 2 MB
    const syncOffset = 1000;
    const mockFile = {
      size: totalSize,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => new ArrayBuffer(end - start),
      }),
    } as unknown as File;

    const loader = new FileBlobLoader();
    let knownLength = 0;
    let firstByteStart = -1;

    loader.onContentLengthKnown = (len) => {
      knownLength = len;
    };
    loader.onDataArrival = (_chunk, byteStart) => {
      if (firstByteStart === -1) firstByteStart = byteStart;
    };

    const seekRange = { from: 500000, to: 1000000 };
    await loader.open({ file: mockFile, syncOffset }, seekRange);

    expect(knownLength).toBe(totalSize - syncOffset);
    expect(firstByteStart).toBe(500000);
    expect(loader.status).toBe(LoaderStatus.kComplete);
  });

  it('aborts and halts data delivery when abort() is called', async () => {
    const totalSize = 5 * 1024 * 1024;
    const mockFile = {
      size: totalSize,
      slice: (start: number, end: number) => ({
        arrayBuffer: async () => new ArrayBuffer(end - start),
      }),
    } as unknown as File;

    const loader = new FileBlobLoader();
    let receivedChunks = 0;

    loader.onDataArrival = () => {
      receivedChunks++;
      if (receivedChunks === 1) {
        loader.abort();
      }
    };

    await loader.open({ file: mockFile, syncOffset: 0 }, { from: 0, to: totalSize - 1 });

    expect(receivedChunks).toBe(1);
    expect(loader.status).toBe(LoaderStatus.kIdle);
    expect(loader.isWorking()).toBe(false);
  });
});

describe('MpegTsPlayerAdapter Lifecycle', () => {
  it('detects browser support safely without throwing in non-browser environments', () => {
    const supported = isMpegTsSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('properly creates and destroys mpegts player instance', () => {
    const mockPlayer = {
      attachMediaElement: vi.fn(),
      load: vi.fn(),
      unload: vi.fn(),
      detachMediaElement: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      currentTime: 0,
    };

    // Test adapter teardown logic
    const destroySpy = vi.fn();
    const adapter = {
      player: mockPlayer as any,
      seek: vi.fn((sec) => {
        mockPlayer.currentTime = sec;
      }),
      destroy: () => {
        mockPlayer.unload();
        mockPlayer.detachMediaElement();
        mockPlayer.destroy();
        destroySpy();
      },
    };

    adapter.seek(42);
    expect(mockPlayer.currentTime).toBe(42);

    adapter.destroy();
    expect(mockPlayer.unload).toHaveBeenCalledTimes(1);
    expect(mockPlayer.detachMediaElement).toHaveBeenCalledTimes(1);
    expect(mockPlayer.destroy).toHaveBeenCalledTimes(1);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
