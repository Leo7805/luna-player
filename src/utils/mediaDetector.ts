/**
 * Media container and format detection utility.
 *
 * Inspects a bounded initial byte buffer to reliably detect MPEG-TS
 * streams versus standard MP4 or other container types, regardless of
 * file extension.
 */

export interface MediaDetectionResult {
  isMpegTs: boolean;
  format: 'mp4' | 'mpegts' | 'mkv' | 'unknown';
  packetSize?: 188 | 192 | 204;
  syncOffset?: number;
}

const SYNC_BYTE = 0x47;
const PACKET_SIZES: readonly (188 | 192 | 204)[] = [188, 192, 204];
const REQUIRED_CONSECUTIVE_PACKETS = 8;
const MAX_SCAN_BYTES = 131072; // 128 KB bounded inspection

/**
 * Synchronous buffer detection for ArrayBuffer or Uint8Array.
 */
export function detectFormatFromBuffer(buffer: ArrayBuffer | Uint8Array): MediaDetectionResult {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // 1. Check for standard MP4 ftyp box (bytes 4..7)
  if (data.length >= 8) {
    const ftyp = String.fromCharCode(data[4], data[5], data[6], data[7]);
    if (ftyp === 'ftyp') {
      return { isMpegTs: false, format: 'mp4' };
    }
  }

  // 2. Check for Matroska / WebM EBML header [0x1A, 0x45, 0xDF, 0xA3]
  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  ) {
    return { isMpegTs: false, format: 'mkv' };
  }

  // 3. Scan for MPEG-TS sync byte 0x47 with consecutive packet verification
  const maxScan = Math.min(
    data.length - REQUIRED_CONSECUTIVE_PACKETS * 188,
    MAX_SCAN_BYTES
  );

  for (let i = 0; i < maxScan; i++) {
    if (data[i] !== SYNC_BYTE) continue;

    for (const packetSize of PACKET_SIZES) {
      if (i + REQUIRED_CONSECUTIVE_PACKETS * packetSize > data.length) continue;

      let consecutiveMatch = true;
      for (let k = 1; k < REQUIRED_CONSECUTIVE_PACKETS; k++) {
        if (data[i + k * packetSize] !== SYNC_BYTE) {
          consecutiveMatch = false;
          break;
        }
      }

      if (consecutiveMatch) {
        return {
          isMpegTs: true,
          format: 'mpegts',
          packetSize,
          syncOffset: i,
        };
      }
    }
  }

  return { isMpegTs: false, format: 'unknown' };
}

/**
 * Asynchronously detects media format of a browser File object using bounded slice reading.
 */
export async function detectMediaFormat(file: File): Promise<MediaDetectionResult> {
  try {
    const sampleSize = Math.min(file.size, MAX_SCAN_BYTES + REQUIRED_CONSECUTIVE_PACKETS * 204);
    const slice = file.slice(0, sampleSize);
    const arrayBuf = await slice.arrayBuffer();
    return detectFormatFromBuffer(arrayBuf);
  } catch {
    return { isMpegTs: false, format: 'unknown' };
  }
}
