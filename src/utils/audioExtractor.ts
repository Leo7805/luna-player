import { VideoItem } from '../types/video';

export type AudioOutputFormat = 'mp3' | 'webm';

export interface AudioFormatConfig {
  format: AudioOutputFormat;
  label: string;
  extension: 'mp3' | 'webm';
  codec: 'libmp3lame' | 'libopus';
  bitrate: '128k' | '64k';
  bitrateLabel: string;
  description: string;
  mimeType: string;
  isDefault: boolean;
}

/**
 * Maximum supported individual source video size: 2 GB (2,147,483,648 bytes).
 */
export const MAX_SOURCE_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

export const AUDIO_FORMAT_CONFIGS: Record<AudioOutputFormat, AudioFormatConfig> = {
  mp3: {
    format: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    codec: 'libmp3lame',
    bitrate: '128k',
    bitrateLabel: '128 kbps',
    description: 'Best compatibility',
    mimeType: 'audio/mpeg',
    isDefault: true,
  },
  webm: {
    format: 'webm',
    label: 'WebM (Opus)',
    extension: 'webm',
    codec: 'libopus',
    bitrate: '64k',
    bitrateLabel: '64 kbps',
    description: 'Smaller files, suitable for speech',
    mimeType: 'audio/webm',
    isDefault: false,
  },
};

export interface ValidatedRelativePath {
  valid: boolean;
  normalizedPath: string;
  directoryParts: string[];
  fileName: string;
  baseName: string;
  sourceExtension: string;
  reason?: string;
}

export interface PlannedExtractionItem {
  video: VideoItem;
  validPath: boolean;
  pathErrorReason?: string;
  directoryParts: string[];
  outputFileName: string;
  outputRelativePath: string;
  disambiguated: boolean;
}

export type FileSizeValidationReason = 'exceeds_limit' | 'empty_file' | 'invalid_size';

export interface FileSizeValidationResult {
  valid: boolean;
  reason?: FileSizeValidationReason;
  message?: string;
}

// Characters disallowed inside a single path segment across Windows/macOS/Linux
const INVALID_SEGMENT_CHARS_REGEX = /[<>:"|?*\x00-\x1F]/;
const WINDOWS_DRIVE_PREFIX_REGEX = /^[a-zA-Z]:/;
const WINDOWS_RESERVED_NAMES_REGEX = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Splits a filename into its base name and lowercase extension (without dot).
 */
export function splitFileName(fileName: string): { baseName: string; extension: string } {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return { baseName: fileName, extension: '' };
  }
  return {
    baseName: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex + 1).toLowerCase(),
  };
}

/**
 * Replaces the extension of a filename with the target audio extension.
 * Optionally appends a disambiguation suffix when duplicate base names exist in the same folder.
 */
export function buildOutputFileName(
  sourceFileName: string,
  format: AudioOutputFormat,
  disambiguationSuffix?: string
): string {
  const { baseName } = splitFileName(sourceFileName);
  const ext = AUDIO_FORMAT_CONFIGS[format].extension;
  if (disambiguationSuffix) {
    return `${baseName} (${disambiguationSuffix}).${ext}`;
  }
  return `${baseName}.${ext}`;
}

/**
 * Validates and normalizes a source video's relative path to prevent path traversal
 * or writing outside the chosen output directory.
 */
export function validateRelativePath(relativePath: string): ValidatedRelativePath {
  if (typeof relativePath !== 'string' || relativePath.trim().length === 0) {
    return {
      valid: false,
      normalizedPath: '',
      directoryParts: [],
      fileName: '',
      baseName: '',
      sourceExtension: '',
      reason: 'Path is empty.',
    };
  }

  if (relativePath.includes('\0')) {
    return {
      valid: false,
      normalizedPath: '',
      directoryParts: [],
      fileName: '',
      baseName: '',
      sourceExtension: '',
      reason: 'Path contains null bytes.',
    };
  }

  const unified = relativePath.replace(/\\/g, '/').trim();

  // Reject absolute paths or Windows drive prefixes
  if (unified.startsWith('/') || WINDOWS_DRIVE_PREFIX_REGEX.test(unified)) {
    return {
      valid: false,
      normalizedPath: '',
      directoryParts: [],
      fileName: '',
      baseName: '',
      sourceExtension: '',
      reason: 'Absolute paths and drive prefixes are not allowed.',
    };
  }

  const rawParts = unified.split('/');
  const cleanParts: string[] = [];

  for (const part of rawParts) {
    const trimmed = part.trim();
    if (!trimmed) {
      return {
        valid: false,
        normalizedPath: '',
        directoryParts: [],
        fileName: '',
        baseName: '',
        sourceExtension: '',
        reason: 'Path contains empty segments.',
      };
    }
    if (trimmed === '.' || trimmed === '..') {
      return {
        valid: false,
        normalizedPath: '',
        directoryParts: [],
        fileName: '',
        baseName: '',
        sourceExtension: '',
        reason: 'Relative traversal segments (. or ..) are not allowed.',
      };
    }
    if (INVALID_SEGMENT_CHARS_REGEX.test(trimmed)) {
      return {
        valid: false,
        normalizedPath: '',
        directoryParts: [],
        fileName: '',
        baseName: '',
        sourceExtension: '',
        reason: `Path segment "${trimmed}" contains invalid filesystem characters.`,
      };
    }
    if (WINDOWS_RESERVED_NAMES_REGEX.test(trimmed)) {
      return {
        valid: false,
        normalizedPath: '',
        directoryParts: [],
        fileName: '',
        baseName: '',
        sourceExtension: '',
        reason: `Path segment "${trimmed}" is a reserved system name.`,
      };
    }
    cleanParts.push(trimmed);
  }

  const fileName = cleanParts[cleanParts.length - 1];
  const directoryParts = cleanParts.slice(0, -1);
  const { baseName, extension } = splitFileName(fileName);

  if (!baseName.trim()) {
    return {
      valid: false,
      normalizedPath: '',
      directoryParts: [],
      fileName: '',
      baseName: '',
      sourceExtension: '',
      reason: 'Filename has no valid base name.',
    };
  }

  return {
    valid: true,
    normalizedPath: cleanParts.join('/'),
    directoryParts,
    fileName,
    baseName,
    sourceExtension: extension,
  };
}

/**
 * Maps a list of source VideoItems to their target output paths, preserving nested
 * folder hierarchy and safely disambiguating duplicate base filenames with different
 * video extensions within the same folder.
 */
export function buildOutputPlan(
  videos: VideoItem[],
  format: AudioOutputFormat
): PlannedExtractionItem[] {
  const usedPathsLower = new Set<string>();
  const results: PlannedExtractionItem[] = [];

  for (const video of videos) {
    const validation = validateRelativePath(video.relativePath);
    if (!validation.valid) {
      results.push({
        video,
        validPath: false,
        pathErrorReason: validation.reason || 'Invalid relative path.',
        directoryParts: [],
        outputFileName: '',
        outputRelativePath: '',
        disambiguated: false,
      });
      continue;
    }

    const { directoryParts, fileName, sourceExtension } = validation;
    const dirPrefix = directoryParts.length > 0 ? `${directoryParts.join('/')}/` : '';

    // 1. Try standard base filename replacement (e.g. "Lesson 01.mp3")
    let candidateFileName = buildOutputFileName(fileName, format);
    let candidateRelPath = `${dirPrefix}${candidateFileName}`;
    let disambiguated = false;

    // 2. If another video in the same folder already claimed this output path,
    // disambiguate using the source extension (e.g. "Lesson 01 (mkv).mp3") or numeric counter.
    if (usedPathsLower.has(candidateRelPath.toLowerCase())) {
      disambiguated = true;
      const extTag = sourceExtension || 'alt';
      candidateFileName = buildOutputFileName(fileName, format, extTag);
      candidateRelPath = `${dirPrefix}${candidateFileName}`;

      let counter = 2;
      while (usedPathsLower.has(candidateRelPath.toLowerCase())) {
        candidateFileName = buildOutputFileName(fileName, format, `${extTag}-${counter}`);
        candidateRelPath = `${dirPrefix}${candidateFileName}`;
        counter++;
      }
    }

    usedPathsLower.add(candidateRelPath.toLowerCase());

    results.push({
      video,
      validPath: true,
      directoryParts,
      outputFileName: candidateFileName,
      outputRelativePath: candidateRelPath,
      disambiguated,
    });
  }

  return results;
}

/**
 * Validates that a source video file size is positive and within the 2 GB limit.
 */
export function validateVideoFileSize(
  sizeBytes: number,
  maxBytes: number = MAX_SOURCE_VIDEO_SIZE_BYTES
): FileSizeValidationResult {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return {
      valid: false,
      reason: 'invalid_size',
      message: 'Invalid file size.',
    };
  }

  if (sizeBytes === 0) {
    return {
      valid: false,
      reason: 'empty_file',
      message: 'Source video file is empty (0 bytes).',
    };
  }

  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      reason: 'exceeds_limit',
      message: 'File exceeds the 2 GB maximum size limit.',
    };
  }

  return { valid: true };
}

/**
 * Builds the FFmpeg CLI arguments for audio-only extraction.
 * - Uses `-vn -sn -dn` to skip video, subtitle, and data streams without decoding video frames.
 * - Uses `-map 0:a:0` to select the first audio track by default.
 * - Normalizes output to 2-channel stereo (`-ac 2`) so 5.1/5.1(side)/multichannel tracks
 *   never fail encoder channel-layout checks.
 * - Encodes MP3 with `libmp3lame` at 128 kbps, or WebM with `libopus` at 64 kbps
 *   using `-compression_level 4` to avoid the `@ffmpeg/core@0.12.10` WASM SIMD stereo crash
 *   that occurs in `libopus` at complexity >= 5 (`RuntimeError: memory access out of bounds`).
 */
export function buildFfmpegArgs(
  inputVirtualPath: string,
  outputVirtualPath: string,
  format: AudioOutputFormat,
  channels: 1 | 2 = 2
): string[] {
  const config = AUDIO_FORMAT_CONFIGS[format];

  if (format === 'mp3') {
    return [
      '-i',
      inputVirtualPath,
      '-vn',
      '-sn',
      '-dn',
      '-map',
      '0:a:0',
      '-ac',
      String(channels),
      '-c:a',
      config.codec,
      '-b:a',
      config.bitrate,
      outputVirtualPath,
    ];
  }

  return [
    '-i',
    inputVirtualPath,
    '-vn',
    '-sn',
    '-dn',
    '-map',
    '0:a:0',
    '-ac',
    String(channels),
    '-c:a',
    config.codec,
    '-b:a',
    config.bitrate,
    '-compression_level',
    '4',
    '-f',
    'webm',
    outputVirtualPath,
  ];
}

/**
 * Redacts virtual or local filesystem paths from a single diagnostic log line.
 */
function sanitizeDiagnosticLine(line: string): string {
  return line
    .replace(/\/work_\d+\/input_\d+\.[a-z0-9]+/gi, '<input>')
    .replace(/\/input_\d+\.[a-z0-9]+/gi, '<input>')
    .replace(/\/output_\d+\.[a-z0-9]+/gi, '<output>')
    .replace(/[A-Za-z]:\\[^\s'"]+/g, '<path>')
    .replace(/\/Users\/[^\s'"]+/g, '<path>')
    .replace(/\/home\/[^\s'"]+/g, '<path>')
    .trim();
}

/**
 * Extracts the most relevant diagnostic line from FFmpeg stderr logs,
 * ignoring startup banners, metadata lines, progress counters, and generic exit messages.
 */
export function extractFfmpegDiagnosticDetail(logs: string[], error?: unknown): string | null {
  const noisePrefixes = [
    'ffmpeg version',
    'built with',
    'configuration:',
    'libavutil',
    'libavcodec',
    'libavformat',
    'libavdevice',
    'libavfilter',
    'libswscale',
    'libswresample',
    'libpostproc',
    'input #',
    'output #',
    'metadata:',
    'major_brand',
    'minor_version',
    'compatible_brands',
    'encoder',
    'duration:',
    'stream #',
    'stream mapping:',
    'handler_name',
    'vendor_id',
    'size=',
    'video:0kb',
    'aborted()',
    'conversion failed!',
  ];

  for (let i = logs.length - 1; i >= 0; i--) {
    const raw = logs[i]?.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (noisePrefixes.some((prefix) => lower.startsWith(prefix))) {
      continue;
    }
    const cleaned = sanitizeDiagnosticLine(raw.replace(/^\[[^\]]+\]\s*/, ''));
    if (cleaned.length > 0) {
      return cleaned.length > 140 ? `${cleaned.slice(0, 137)}...` : cleaned;
    }
  }

  if (error !== undefined && error !== null) {
    const rawErr =
      error instanceof Error
        ? error.message || error.name
        : typeof error === 'string'
        ? error
        : String(error);
    const cleanedErr = sanitizeDiagnosticLine(rawErr);
    if (
      cleanedErr &&
      cleanedErr !== '[object Object]' &&
      cleanedErr.toLowerCase() !== 'audio conversion failed for this video.'
    ) {
      return cleanedErr.length > 140 ? `${cleanedErr.slice(0, 137)}...` : cleanedErr;
    }
  }

  return null;
}

/**
 * Translates low-level FFmpeg logs and exceptions into concise, user-friendly failure messages
 * while preserving the underlying diagnostic reason.
 */
export function classifyFfmpegError(logs: string[], error?: unknown): string {
  const combinedLogs = logs.join('\n').toLowerCase();
  const rawErrorStr =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
      ? error
      : String(error ?? '');
  const errorStr = rawErrorStr.toLowerCase();

  if (
    combinedLogs.includes("stream map '0:a:0' matches no streams") ||
    combinedLogs.includes('matches no streams') ||
    combinedLogs.includes('does not contain any stream')
  ) {
    return 'No audio track found in this video.';
  }

  if (
    errorStr.includes('out of memory') ||
    errorStr.includes('cannot enlarge memory') ||
    errorStr.includes('rangeerror') ||
    errorStr.includes('allocation failed') ||
    combinedLogs.includes('out of memory') ||
    combinedLogs.includes('cannot allocate memory')
  ) {
    return 'Browser ran out of memory while converting this file.';
  }

  if (
    errorStr.includes('memory access out of bounds') ||
    errorStr.includes('runtimeerror') ||
    errorStr.includes('unreachable')
  ) {
    const detail = extractFfmpegDiagnosticDetail([], error) || 'WebAssembly runtime trap';
    return `FFmpeg WebAssembly error (${detail}).`;
  }

  if (
    combinedLogs.includes('invalid data found when processing input') ||
    combinedLogs.includes('moov atom not found') ||
    combinedLogs.includes('ebml header parsing failed') ||
    combinedLogs.includes('error reading header')
  ) {
    return 'Corrupted or unsupported media container.';
  }

  if (
    combinedLogs.includes('decoder') &&
    (combinedLogs.includes('not found') || combinedLogs.includes('unsupported'))
  ) {
    return 'Unsupported audio codec in source video.';
  }

  const detail = extractFfmpegDiagnosticDetail(logs, error);
  if (detail) {
    return `Audio conversion failed: ${detail}`;
  }

  return 'Audio conversion failed for this video.';
}
