import { describe, it, expect, vi } from 'vitest';
import {
  AUDIO_FORMAT_CONFIGS,
  MAX_SOURCE_VIDEO_SIZE_BYTES,
  ExtractionStageError,
  buildFfmpegArgs,
  buildOutputFileName,
  buildOutputPlan,
  classifyFfmpegError,
  describeExtractionError,
  validateRelativePath,
  validateVideoFileSize,
} from '../src/utils/audioExtractor';
import {
  BatchExtractionProgress,
  BrowserOutputDirectoryWriter,
  OutputDirectoryWriter,
  checkIsSameAsSourceDirectory,
  runBatchAudioExtraction,
} from '../src/services/audioExtractionService';
import {
  AudioEncoderAdapter,
  FfmpegInitializationError,
} from '../src/services/ffmpegService';
import { VideoItem, VideoLibrary } from '../src/types/video';

function makeVideo(relativePath: string, size = 1024 * 1024): VideoItem {
  const parts = relativePath.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1];
  const file = new File([new Uint8Array(Math.min(size, 64))], name, {
    type: 'video/mp4',
  });
  Object.defineProperty(file, 'size', { value: size });

  return {
    id: relativePath,
    name,
    relativePath,
    size,
    lastModified: 1700000000000,
    file,
  };
}

class InMemoryOutputWriter implements OutputDirectoryWriter {
  public writtenFiles = new Map<string, Uint8Array>();
  public existingFiles = new Set<string>();
  public hasPermission = true;
  public revokeOnWriteIndex: number | null = null;
  private writeCounter = 0;

  async verifyWritePermission(): Promise<boolean> {
    return this.hasPermission;
  }

  async fileExists(directoryParts: string[], fileName: string): Promise<boolean> {
    const rel = directoryParts.length > 0 ? `${directoryParts.join('/')}/${fileName}` : fileName;
    return this.existingFiles.has(rel) || this.writtenFiles.has(rel);
  }

  async writeFile(directoryParts: string[], fileName: string, data: Uint8Array): Promise<void> {
    this.writeCounter++;
    if (this.revokeOnWriteIndex !== null && this.writeCounter >= this.revokeOnWriteIndex) {
      throw new DOMException('Permission revoked', 'NotAllowedError');
    }
    const rel = directoryParts.length > 0 ? `${directoryParts.join('/')}/${fileName}` : fileName;
    if (this.existingFiles.has(rel)) {
      throw new Error('Should never overwrite existing file');
    }
    this.writtenFiles.set(rel, data);
  }
}

describe('audioExtractor utilities', () => {
  describe('MP3 and WebM filename generation & codec parameters', () => {
    it('generates .mp3 and .webm filenames preserving original base names', () => {
      expect(buildOutputFileName('Lesson 01.mp4', 'mp3')).toBe('Lesson 01.mp3');
      expect(buildOutputFileName('Lesson 02.mkv', 'mp3')).toBe('Lesson 02.mp3');
      expect(buildOutputFileName('Story 01.mp4', 'webm')).toBe('Story 01.webm');
      expect(buildOutputFileName('Dr. Smith - Part 1.2.mov', 'webm')).toBe(
        'Dr. Smith - Part 1.2.webm'
      );
    });

    it('builds audio-only FFmpeg arguments with libmp3lame (128k) and libopus (64k)', () => {
      const mp3Args = buildFfmpegArgs('/in/video.mp4', '/out.mp3', 'mp3');
      expect(mp3Args).toEqual([
        '-i',
        '/in/video.mp4',
        '-vn',
        '-sn',
        '-dn',
        '-map',
        '0:a:0',
        '-ac',
        '2',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '/out.mp3',
      ]);

      const webmArgs = buildFfmpegArgs('/in/video.mkv', '/out.webm', 'webm');
      expect(webmArgs).toEqual([
        '-i',
        '/in/video.mkv',
        '-vn',
        '-sn',
        '-dn',
        '-map',
        '0:a:0',
        '-ac',
        '2',
        '-c:a',
        'libopus',
        '-b:a',
        '64k',
        '-compression_level',
        '4',
        '-f',
        'webm',
        '/out.webm',
      ]);

      expect(AUDIO_FORMAT_CONFIGS.mp3.isDefault).toBe(true);
      expect(AUDIO_FORMAT_CONFIGS.webm.isDefault).toBe(false);
    });
  });

  describe('Source-to-output path mapping and security validation', () => {
    it('preserves nested folder structure for MP3 and WebM outputs', () => {
      const videos = [
        makeVideo('English/Lesson 01.mp4'),
        makeVideo('English/Lesson 02.mkv'),
        makeVideo('Stories/Story 01.mp4'),
      ];

      const mp3Plan = buildOutputPlan(videos, 'mp3');
      expect(mp3Plan.map((p) => p.outputRelativePath)).toEqual([
        'English/Lesson 01.mp3',
        'English/Lesson 02.mp3',
        'Stories/Story 01.mp3',
      ]);
      expect(mp3Plan[0].directoryParts).toEqual(['English']);
      expect(mp3Plan[0].outputFileName).toBe('Lesson 01.mp3');

      const webmPlan = buildOutputPlan(videos, 'webm');
      expect(webmPlan.map((p) => p.outputRelativePath)).toEqual([
        'English/Lesson 01.webm',
        'English/Lesson 02.webm',
        'Stories/Story 01.webm',
      ]);
    });

    it('rejects path traversal and unsafe paths outside the output directory', () => {
      expect(validateRelativePath('../outside.mp4').valid).toBe(false);
      expect(validateRelativePath('English/../../secret.mp4').valid).toBe(false);
      expect(validateRelativePath('/etc/passwd.mp4').valid).toBe(false);
      expect(validateRelativePath('C:\\Videos\\clip.mp4').valid).toBe(false);
      expect(validateRelativePath('Folder/./clip.mp4').valid).toBe(false);
      expect(validateRelativePath('').valid).toBe(false);
      expect(validateRelativePath('Folder/bad\0name.mp4').valid).toBe(false);
      expect(validateRelativePath('Folder/CON.mp4').valid).toBe(false);
    });
  });

  describe('Duplicate base filename handling', () => {
    it('disambiguates duplicate base filenames with different video extensions in the same folder', () => {
      const videos = [
        makeVideo('English/Lesson 01.mp4'),
        makeVideo('English/Lesson 01.mkv'),
        makeVideo('English/Lesson 01.mov'),
        makeVideo('Stories/Lesson 01.mp4'), // Different folder: should not be disambiguated
      ];

      const plan = buildOutputPlan(videos, 'mp3');
      expect(plan.map((p) => p.outputRelativePath)).toEqual([
        'English/Lesson 01.mp3',
        'English/Lesson 01 (mkv).mp3',
        'English/Lesson 01 (mov).mp3',
        'Stories/Lesson 01.mp3',
      ]);
      expect(plan[0].disambiguated).toBe(false);
      expect(plan[1].disambiguated).toBe(true);
      expect(plan[2].disambiguated).toBe(true);
      expect(plan[3].disambiguated).toBe(false);
    });
  });

  describe('File size validation (2 GB limit)', () => {
    it('accepts files up to 2 GB and rejects files over 2 GB or 0 bytes', () => {
      expect(validateVideoFileSize(1024)).toEqual({ valid: true });
      expect(validateVideoFileSize(MAX_SOURCE_VIDEO_SIZE_BYTES)).toEqual({ valid: true });

      const overLimit = validateVideoFileSize(MAX_SOURCE_VIDEO_SIZE_BYTES + 1);
      expect(overLimit.valid).toBe(false);
      expect(overLimit.reason).toBe('exceeds_limit');

      const empty = validateVideoFileSize(0);
      expect(empty.valid).toBe(false);
      expect(empty.reason).toBe('empty_file');

      const negative = validateVideoFileSize(-10);
      expect(negative.valid).toBe(false);
      expect(negative.reason).toBe('invalid_size');
    });
  });

  describe('Error classification', () => {
    it('maps FFmpeg logs and worker string rejections to diagnostic error messages', () => {
      expect(classifyFfmpegError(["Stream map '0:a:0' matches no streams."])).toBe(
        'No audio track found in this video.'
      );
      expect(classifyFfmpegError([], new Error('RuntimeError: Out of memory'))).toBe(
        'Browser ran out of memory while converting this file.'
      );
      expect(classifyFfmpegError(['Invalid data found when processing input'])).toBe(
        'Corrupted or unsupported media container.'
      );
      expect(classifyFfmpegError([], 'RuntimeError: memory access out of bounds')).toBe(
        'FFmpeg WebAssembly error (RuntimeError: memory access out of bounds).'
      );
      expect(
        classifyFfmpegError([
          '[libopus @ 0xdf4350] Invalid channel layout 5.1(side) for specified mapping family -1.',
          'Conversion failed!',
          'Aborted()',
        ])
      ).toBe(
        'Audio conversion failed: Invalid channel layout 5.1(side) for specified mapping family -1.'
      );
    });

    it('preserves DOMException name, full message, stage, and friendly explanation for InvalidStateError', () => {
      const domErr = new DOMException(
        'An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.',
        'InvalidStateError'
      );
      const staged = new ExtractionStageError('reading_source', domErr);
      const info = describeExtractionError(staged, 'reading_source');

      expect(info.errorName).toBe('InvalidStateError');
      expect(info.errorMessage).toBe(
        'An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.'
      );
      expect(info.stage).toBe('reading_source');
      expect(info.stageLabel).toBe('Reading the source video');
      expect(info.friendlyExplanation).toContain('cached its file handle');
      expect(info.technicalDetails).toContain('Failure stage: Reading the source video (reading_source)');
      expect(info.technicalDetails).toContain('Error name: InvalidStateError');
      expect(info.technicalDetails).toContain(
        'An operation that depends on state cached in an interface object was made'
      );
    });
  });
});

describe('runBatchAudioExtraction', () => {
  it('skips existing output files and files > 2 GB while converting remaining files', async () => {
    const videos = [
      makeVideo('English/Lesson 01.mp4', 500_000), // Already exists -> skip
      makeVideo('English/Lesson 02.mkv', MAX_SOURCE_VIDEO_SIZE_BYTES + 100), // > 2 GB -> skip
      makeVideo('Stories/Story 01.mp4', 800_000), // Convert -> complete
    ];

    const writer = new InMemoryOutputWriter();
    writer.existingFiles.add('English/Lesson 01.mp3');

    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockResolvedValue({
        data: new Uint8Array([1, 2, 3, 4]),
        args: [],
      }),
      terminate: vi.fn(),
    };

    const progressUpdates: BatchExtractionProgress[] = [];
    const finalProgress = await runBatchAudioExtraction({
      videos,
      format: 'mp3',
      writer,
      encoder,
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(finalProgress.state).toBe('completed');
    expect(finalProgress.totalFiles).toBe(3);
    expect(finalProgress.completedCount).toBe(1);
    expect(finalProgress.skippedCount).toBe(2);
    expect(finalProgress.failedCount).toBe(0);

    // Encoder should only have been invoked for the 1 non-skipped video
    expect(encoder.extractAudio).toHaveBeenCalledTimes(1);
    expect(writer.writtenFiles.has('Stories/Story 01.mp3')).toBe(true);
    expect(writer.writtenFiles.has('English/Lesson 01.mp3')).toBe(false);
    expect(writer.writtenFiles.has('English/Lesson 02.mp3')).toBe(false);
  });

  it('continues batch processing when an individual file conversion fails', async () => {
    const videos = [
      makeVideo('Clip 1.mp4'),
      makeVideo('NoAudio.mp4'),
      makeVideo('Clip 3.mp4'),
    ];

    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi
        .fn()
        .mockResolvedValueOnce({ data: new Uint8Array([10, 20]), args: [] })
        .mockRejectedValueOnce(new Error('No audio track found in this video.'))
        .mockResolvedValueOnce({ data: new Uint8Array([30, 40]), args: [] }),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      encoder,
    });

    expect(result.state).toBe('completed');
    expect(result.completedCount).toBe(2);
    expect(result.failedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
    expect(writer.writtenFiles.has('Clip 1.webm')).toBe(true);
    expect(writer.writtenFiles.has('NoAudio.webm')).toBe(false);
    expect(writer.writtenFiles.has('Clip 3.webm')).toBe(true);
    expect(result.records.find((r) => r.relativePath === 'NoAudio.mp4')).toMatchObject({
      relativePath: 'NoAudio.mp4',
      outputRelativePath: 'NoAudio.webm',
      outcome: 'failed',
      reason: 'No audio track found in this video.',
      errorName: 'FFmpegEncodingError',
      errorMessage: 'No audio track found in this video.',
      stage: 'running_ffmpeg',
      stageLabel: 'Running FFmpeg',
    });
  });

  it('refreshes the File via FileSystemFileHandle.getFile() before conversion when a handle exists', async () => {
    const staleFile = new File([new Uint8Array([0])], '5-14.Move.to.Music.mp4', {
      type: 'video/mp4',
    });
    const freshFile = new File([new Uint8Array([1, 2, 3, 4])], '5-14.Move.to.Music.mp4', {
      type: 'video/mp4',
    });
    const getFileMock = vi.fn().mockResolvedValue(freshFile);

    const video: VideoItem = {
      id: '第5季52集部分带英文字幕/5-14.Move.to.Music.mp4',
      name: '5-14.Move.to.Music.mp4',
      relativePath: '第5季52集部分带英文字幕/5-14.Move.to.Music.mp4',
      size: 4,
      lastModified: 1700000000000,
      file: staleFile,
      handle: {
        kind: 'file',
        name: '5-14.Move.to.Music.mp4',
        getFile: getFileMock,
      } as unknown as FileSystemFileHandle,
    };

    const writer = new InMemoryOutputWriter();
    let passedFile: File | null = null;
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockImplementation(async (file: File) => {
        passedFile = file;
        return { data: new Uint8Array([9, 9]), args: [] };
      }),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos: [video],
      format: 'webm',
      writer,
      encoder,
    });

    expect(result.state).toBe('completed');
    expect(result.completedCount).toBe(1);
    expect(getFileMock).toHaveBeenCalledTimes(1);
    expect(passedFile).toBe(freshFile);
  });

  it('records InvalidStateError with exact DOMException name, message, and stage when a file fails', async () => {
    const video = makeVideo(
      '第5季52集部分带英文字幕/5-14.Move.to.Music.With.Subtitles.Episode.14.mp4'
    );
    const writer = new InMemoryOutputWriter();
    const invalidStateDomError = new DOMException(
      'An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.',
      'InvalidStateError'
    );

    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi
        .fn()
        .mockRejectedValueOnce(new ExtractionStageError('mounting_input', invalidStateDomError)),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos: [video],
      format: 'webm',
      writer,
      encoder,
    });

    expect(result.failedCount).toBe(1);
    const failedRec = result.records[0];
    expect(failedRec.outcome).toBe('failed');
    expect(failedRec.relativePath).toBe(
      '第5季52集部分带英文字幕/5-14.Move.to.Music.With.Subtitles.Episode.14.mp4'
    );
    expect(failedRec.errorName).toBe('InvalidStateError');
    expect(failedRec.errorMessage).toBe(
      'An operation that depends on state cached in an interface object was made but the state had changed since it was read from disk.'
    );
    expect(failedRec.stage).toBe('mounting_input');
    expect(failedRec.stageLabel).toBe('Mounting or accessing FFmpeg input');
    expect(failedRec.friendlyExplanation).toContain('cached its file handle');
    expect(failedRec.technicalDetails).toContain('Error name: InvalidStateError');
  });

  it('stops the batch immediately when FFmpeg initialization fails globally instead of failing all videos', async () => {
    const videos = [
      makeVideo('Lesson 01.mp4'),
      makeVideo('Lesson 02.mp4'),
      makeVideo('Lesson 03.mp4'),
    ];

    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi
        .fn()
        .mockRejectedValue(
          new FfmpegInitializationError('Failed to initialize FFmpeg WebAssembly: network error')
        ),
      extractAudio: vi.fn(),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      encoder,
    });

    expect(result.state).toBe('error');
    expect(result.statusMessage).toBe('Failed to initialize FFmpeg audio engine.');
    expect(result.errorMessage).toContain('Failed to initialize FFmpeg WebAssembly');
    expect(result.failedCount).toBe(0);
    expect(encoder.extractAudio).not.toHaveBeenCalled();
  });

  it('reports an error summary instead of Finished! when every file in the batch fails', async () => {
    const videos = [makeVideo('Lesson 01.mp4'), makeVideo('Lesson 02.mp4')];

    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi
        .fn()
        .mockRejectedValue(new Error('No audio track found in this video.')),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      encoder,
    });

    expect(result.state).toBe('error');
    expect(result.completedCount).toBe(0);
    expect(result.failedCount).toBe(2);
    expect(result.statusMessage).toBe('Extraction failed: 0 extracted, 0 skipped, 2 failed.');
    expect(result.errorMessage).toContain('No audio track found in this video.');
  });

  it('stops processing further files and terminates encoder when cancelled', async () => {
    const videos = [
      makeVideo('Lesson 01.mp4'),
      makeVideo('Lesson 02.mp4'),
      makeVideo('Lesson 03.mp4'),
    ];

    const abortController = new AbortController();
    const writer = new InMemoryOutputWriter();

    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockImplementation(async (file: File) => {
        if (file.name === 'Lesson 02.mp4') {
          abortController.abort();
          throw new DOMException('Operation was aborted', 'AbortError');
        }
        return { data: new Uint8Array([1, 2, 3]), args: [] };
      }),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos,
      format: 'mp3',
      writer,
      encoder,
      signal: abortController.signal,
    });

    expect(result.state).toBe('cancelled');
    expect(result.completedCount).toBe(1);
    expect(encoder.extractAudio).toHaveBeenCalledTimes(2); // Lesson 03 was never started
    expect(encoder.terminate).toHaveBeenCalled();
    expect(writer.writtenFiles.size).toBe(1);
    expect(writer.writtenFiles.has('Lesson 01.mp3')).toBe(true);
  });
});

describe('FFmpeg.wasm Core Smoke Test (MP3 & WebM encoders on stereo and 5.1 audio)', () => {
  it(
    'encodes stereo and 5.1(side) videos to MP3 (libmp3lame 128k) and WebM (libopus 64k) and detects missing audio tracks',
    async () => {
      const fs = await import('fs');
      const path = await import('path');
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);

      (globalThis as any).self = { location: { href: '' } };
      const createFFmpegCore = require('../node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.js');
      const wasmBuffer = fs.readFileSync(
        path.resolve('node_modules/@ffmpeg/core/dist/umd/ffmpeg-core.wasm')
      );

      const core = await createFFmpegCore({ wasmBinary: wasmBuffer });
      const logs: string[] = [];
      core.setLogger((m: { message: string }) => logs.push(m.message));

      // 1. Generate a 2-channel STEREO MP4 with video + AAC audio inside virtual FS
      core.exec(
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100:duration=0.3',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.3:r=10',
        '-ac',
        '2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '/smoke_stereo.mp4'
      );
      expect(core.ret).toBe(0);
      core.reset();

      // 2. Test MP3 extraction on stereo input using buildFfmpegArgs
      const mp3Args = buildFfmpegArgs('/smoke_stereo.mp4', '/smoke_out.mp3', 'mp3');
      core.exec(...mp3Args);
      expect(core.ret).toBe(0);
      const mp3Stat = core.FS.stat('/smoke_out.mp3');
      expect(mp3Stat.size).toBeGreaterThan(500);
      core.reset();

      // 3. Test WebM (Opus) extraction on stereo input using buildFfmpegArgs
      const webmArgs = buildFfmpegArgs('/smoke_stereo.mp4', '/smoke_out.webm', 'webm');
      core.exec(...webmArgs);
      expect(core.ret).toBe(0);
      const webmStat = core.FS.stat('/smoke_out.webm');
      expect(webmStat.size).toBeGreaterThan(500);
      core.reset();

      // 4. Test WebM (Opus) extraction on 5.1(side) multichannel MKV input
      core.exec(
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=0.25',
        '-af',
        'pan=5.1(side)|FL=c0|FR=c0|FC=c0|LFE=c0|SL=c0|SR=c0',
        '-c:a',
        'flac',
        '/smoke_51.mkv'
      );
      expect(core.ret).toBe(0);
      core.reset();

      core.exec(...buildFfmpegArgs('/smoke_51.mkv', '/smoke_51.webm', 'webm'));
      expect(core.ret).toBe(0);
      expect(core.FS.stat('/smoke_51.webm').size).toBeGreaterThan(500);
      core.reset();

      // 5. Test video without audio track (bundled sample fixture Root Promo 1.mp4)
      logs.length = 0;
      const silentVideoBytes = fs.readFileSync(
        path.resolve('tests/fixtures/sample-library/Root Promo 1.mp4')
      );
      core.FS.writeFile('/silent.mp4', new Uint8Array(silentVideoBytes));
      core.exec(...buildFfmpegArgs('/silent.mp4', '/silent.mp3', 'mp3'));
      expect(core.ret).not.toBe(0);
      expect(classifyFfmpegError(logs)).toBe('No audio track found in this video.');
      core.reset();
    },
    10000
  );
});

describe('batch restart reliability', () => {
  it('skips 20 saved outputs and completes the remaining five on restart', async () => {
    const videos = Array.from({ length: 25 }, (_, i) => makeVideo(`Folder/Video ${i + 1}.mp4`));
    const writer = new InMemoryOutputWriter();
    const controller = new AbortController();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockResolvedValue({ data: new Uint8Array([1]), args: [] }),
      terminate: vi.fn(),
    };
    const first = await runBatchAudioExtraction({
      videos, writer, encoder, format: 'mp3', signal: controller.signal,
      onProgress: p => { if (p.completedCount === 20) controller.abort(); },
    });
    expect(first.state).toBe('cancelled');
    const second = await runBatchAudioExtraction({ videos, writer, encoder, format: 'mp3' });
    expect(second.state).toBe('completed');
    expect(second.skippedCount).toBe(20);
    expect(second.completedCount).toBe(5);
    expect(second.failedCount).toBe(0);
    expect(writer.writtenFiles.size).toBe(25);
  });

  it('cancels a hung source lookup and prevents its late result affecting a restarted batch', async () => {
    const video = makeVideo('video.mp4');
    const writer = new InMemoryOutputWriter();
    const controller = new AbortController();
    let release!: (file: File) => void;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockResolvedValue({ data: new Uint8Array([1]), args: [] }),
      terminate: vi.fn(),
    };
    const first = runBatchAudioExtraction({
      videos: [video], writer, encoder, format: 'mp3', signal: controller.signal,
      resolveSourceFile: () => { started(); return new Promise(resolve => { release = resolve; }); },
    });
    await ready;
    controller.abort();
    expect((await first).state).toBe('cancelled');
    const second = await runBatchAudioExtraction({ videos: [video], writer, encoder, format: 'mp3' });
    expect(second.completedCount).toBe(1);
    const terminationCount = vi.mocked(encoder.terminate).mock.calls.length;
    release(video.file!);
    await Promise.resolve(); await Promise.resolve();
    expect(encoder.extractAudio).toHaveBeenCalledTimes(1);
    expect(encoder.terminate).toHaveBeenCalledTimes(terminationCount);
  });
});


it('aborts output writing on cancellation without closing or recording a partial output', async () => {
  const controller = new AbortController();
  let startWrite!: () => void;
  let rejectWrite!: (error: unknown) => void;
  const started = new Promise<void>(resolve => { startWrite = resolve; });
  const writable = {
    write: vi.fn(() => { startWrite(); return new Promise<void>((_, reject) => { rejectWrite = reject; }); }),
    close: vi.fn(),
    abort: vi.fn(async () => { rejectWrite(new DOMException('Cancelled', 'AbortError')); }),
  };
  const root = {
    getFileHandle: vi.fn(async (_name: string, options: { create: boolean }) => {
      if (!options.create) throw new DOMException('Missing', 'NotFoundError');
      return { createWritable: async () => writable };
    }),
  } as unknown as FileSystemDirectoryHandle;
  const writer = new BrowserOutputDirectoryWriter(root);
  const result = expect(writer.writeFile([], 'output.mp3', new Uint8Array([1]), controller.signal)).rejects.toThrow();
  await started;
  controller.abort();
  await result;
  expect(writable.abort).toHaveBeenCalled();
  expect(writable.close).not.toHaveBeenCalled();
});

describe('File Mode audio extraction and collision handling', () => {
  it('plans flat outputs in playlist order with deterministic numeric collision suffixes', () => {
    const videos = [
      makeVideo('Movies/Episode 01.mp4'),
      makeVideo('English/Episode 01.mp4'),
      makeVideo('Backup/Episode 01.mkv'),
      makeVideo('Drama/Episode 01 (2).mp4'),
      makeVideo('Archive/Episode 01.mp4'),
    ];

    const plan = buildOutputPlan(videos, 'mp3', { preserveFolderStructure: false });
    expect(plan.map((p) => p.directoryParts)).toEqual([[], [], [], [], []]);
    expect(plan.map((p) => p.outputRelativePath)).toEqual([
      'Episode 01.mp3',
      'Episode 01 (2).mp3',
      'Episode 01 (3).mp3',
      'Episode 01 (2) (2).mp3',
      'Episode 01 (4).mp3',
    ]);
    expect(plan.map((p) => p.disambiguated)).toEqual([false, true, true, true, true]);
  });

  it('extracts a single File Mode video directly into the output folder', async () => {
    const videos = [makeVideo('Solo Clip.mp4')];
    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockResolvedValue({ data: new Uint8Array([1, 2, 3]), args: [] }),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos,
      format: 'mp3',
      writer,
      preserveFolderStructure: false,
      encoder,
    });

    expect(result.state).toBe('completed');
    expect(result.completedCount).toBe(1);
    expect(Array.from(writer.writtenFiles.keys())).toEqual(['Solo Clip.mp3']);
  });

  it('extracts multiple File Mode videos in playlist order without overwriting same-named files from different directories', async () => {
    const videoA: VideoItem = {
      ...makeVideo('Episode 01.mp4', 1000),
      id: 'Episode 01.mp4',
      file: new File([new Uint8Array([1, 1, 1])], 'Episode 01.mp4', { type: 'video/mp4' }),
    };
    const videoB: VideoItem = {
      ...makeVideo('Video B.webm', 1000),
      id: 'Video B.webm',
      file: new File([new Uint8Array([2, 2, 2])], 'Video B.webm', { type: 'video/webm' }),
    };
    const videoC: VideoItem = {
      ...makeVideo('Episode 01.mp4', 1000),
      id: 'Episode 01.mp4 (2)',
      file: new File([new Uint8Array([3, 3, 3])], 'Episode 01.mp4', { type: 'video/mp4' }),
    };

    const extractionOrder: number[] = [];
    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockImplementation(async (file: File) => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        extractionOrder.push(bytes[0]);
        return { data: new Uint8Array([bytes[0], 99]), args: [] };
      }),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos: [videoA, videoB, videoC],
      format: 'mp3',
      writer,
      preserveFolderStructure: false,
      encoder,
    });

    expect(result.state).toBe('completed');
    expect(result.completedCount).toBe(3);
    expect(result.skippedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(extractionOrder).toEqual([1, 2, 3]);
    expect(Array.from(writer.writtenFiles.keys())).toEqual([
      'Episode 01.mp3',
      'Video B.mp3',
      'Episode 01 (2).mp3',
    ]);
    expect(Array.from(writer.writtenFiles.get('Episode 01.mp3')!)).toEqual([1, 99]);
    expect(Array.from(writer.writtenFiles.get('Episode 01 (2).mp3')!)).toEqual([3, 99]);
  });

  it('skips already completed File Mode outputs on Start Again without creating new duplicates', async () => {
    const videos = [
      { ...makeVideo('Episode 01.mp4'), id: 'Episode 01.mp4' },
      { ...makeVideo('Episode 01.mp4'), id: 'Episode 01.mp4 (2)' },
      { ...makeVideo('Episode 01.mkv'), id: 'Episode 01.mkv' },
    ];
    const writer = new InMemoryOutputWriter();
    const controller = new AbortController();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn().mockResolvedValue(undefined),
      extractAudio: vi.fn().mockResolvedValue({ data: new Uint8Array([7, 8]), args: [] }),
      terminate: vi.fn(),
    };

    // First run completes the first two outputs and cancels before the third
    const first = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      preserveFolderStructure: false,
      encoder,
      signal: controller.signal,
      onProgress: (p) => {
        if (p.completedCount === 2) controller.abort();
      },
    });
    expect(first.state).toBe('cancelled');
    expect(Array.from(writer.writtenFiles.keys())).toEqual([
      'Episode 01.webm',
      'Episode 01 (2).webm',
    ]);

    // Restarting skips the first two and completes only the third
    const second = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      preserveFolderStructure: false,
      encoder,
    });
    expect(second.state).toBe('completed');
    expect(second.skippedCount).toBe(2);
    expect(second.completedCount).toBe(1);
    expect(Array.from(writer.writtenFiles.keys())).toEqual([
      'Episode 01.webm',
      'Episode 01 (2).webm',
      'Episode 01 (3).webm',
    ]);

    // Clicking Start Again once all outputs exist skips all 3 and creates no new files
    const third = await runBatchAudioExtraction({
      videos,
      format: 'webm',
      writer,
      preserveFolderStructure: false,
      encoder,
    });
    expect(third.state).toBe('completed');
    expect(third.skippedCount).toBe(3);
    expect(third.completedCount).toBe(0);
    expect(writer.writtenFiles.size).toBe(3);
  });

  it('returns an error cleanly when given an empty playlist', async () => {
    const writer = new InMemoryOutputWriter();
    const encoder: AudioEncoderAdapter = {
      initialize: vi.fn(),
      extractAudio: vi.fn(),
      terminate: vi.fn(),
    };

    const result = await runBatchAudioExtraction({
      videos: [],
      format: 'mp3',
      writer,
      preserveFolderStructure: false,
      encoder,
    });

    expect(result.state).toBe('error');
    expect(result.totalFiles).toBe(0);
    expect(encoder.initialize).not.toHaveBeenCalled();
    expect(encoder.extractAudio).not.toHaveBeenCalled();
  });

  it('does not trigger same-as-source directory warning in File Mode', async () => {
    const filesLibrary: VideoLibrary = {
      id: 'files:Selected Videos',
      name: 'Selected Videos',
      tree: {
        id: 'root',
        name: 'Selected Videos',
        relativePath: '',
        videos: [],
        subfolders: [],
        totalVideoCount: 0,
      },
      flatPlaylist: [],
      sourceType: 'files',
    };
    const outputHandle = {
      kind: 'directory',
      name: 'Selected Videos',
    } as unknown as FileSystemDirectoryHandle;

    await expect(checkIsSameAsSourceDirectory(filesLibrary, outputHandle)).resolves.toBe(false);
  });
});
