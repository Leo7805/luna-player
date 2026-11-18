/**
 * Lightweight, fast keyframe and duration scanner for MPEG-TS streams.
 *
 * Scans MPEG-TS packets in bounded chunks (~1.88MB) using File.slice()
 * without loading the entire video into memory.
 * Computes exact duration from 90kHz PTS timestamps and builds an
 * in-memory keyframe seek index (times and filepositions) required by mpegts.js.
 */

export interface MpegTsKeyframeIndex {
  times: number[]; // Timestamps in milliseconds (relative to firstPts)
  filepositions: number[]; // Byte offsets relative to syncOffset
}

export interface MpegTsIndexResult {
  duration: number; // Duration in seconds
  durationMs: number; // Duration in milliseconds
  keyframesIndex: MpegTsKeyframeIndex;
  firstPts: number; // First observed PTS in seconds
  lastPts: number; // Last observed PTS in seconds
}

// 188 bytes * 10,000 = 1,880,000 bytes (~1.88 MB) per read chunk
const SCAN_CHUNK_SIZE = 188 * 10000;

export async function scanMpegTsKeyframes(
  file: File,
  syncOffset = 0
): Promise<MpegTsIndexResult> {
  const fileSize = file.size;
  const keyframeTimes: number[] = [];
  const keyframePositions: number[] = [];

  let firstPts: number | null = null;
  let lastPts: number | null = null;
  let detectedVideoPid: number | null = null;
  let pmtPid: number | null = null;

  let filePos = Math.max(0, syncOffset);
  let chunkCount = 0;

  while (filePos < fileSize) {
    const bytesToRead = Math.min(SCAN_CHUNK_SIZE, fileSize - filePos);
    if (bytesToRead < 188) break;

    const slice = file.slice(filePos, filePos + bytesToRead);
    const arrayBuffer = await slice.arrayBuffer();
    const buf = new Uint8Array(arrayBuffer);

    let i = 0;
    while (i <= buf.byteLength - 188) {
      if (buf[i] !== 0x47) {
        // Fast re-synchronization to 0x47
        let syncFound = false;
        for (let s = i + 1; s <= buf.byteLength - 188; s++) {
          if (buf[s] === 0x47 && (s + 188 >= buf.byteLength || buf[s + 188] === 0x47)) {
            i = s;
            syncFound = true;
            break;
          }
        }
        if (!syncFound) {
          i = buf.byteLength;
          break;
        }
      }

      const pid = ((buf[i + 1] & 0x1f) << 8) | buf[i + 2];
      const pusi = (buf[i + 1] & 0x40) !== 0;
      const afc = (buf[i + 3] & 0x30) >> 4;
      let payloadStart = i + 4;

      // Adaptation field parsing
      let hasRandomAccess = false;
      if (afc === 2 || afc === 3) {
        const afl = buf[i + 4];
        if (afl > 0 && i + 5 < buf.byteLength) {
          hasRandomAccess = (buf[i + 5] & 0x40) !== 0;
        }
        payloadStart += 1 + afl;
      }

      // PAT parsing (PID 0) to find PMT PID
      if (pid === 0 && pusi && payloadStart + 16 <= buf.byteLength) {
        const pointer = buf[payloadStart];
        const patStart = payloadStart + 1 + pointer;
        if (patStart + 12 <= buf.byteLength && buf[patStart] === 0x00) {
          // Find first program PMT PID (typically at patStart + 8..11)
          const pmtCandidate = ((buf[patStart + 10] & 0x1f) << 8) | buf[patStart + 11];
          if (pmtCandidate > 0 && pmtCandidate < 0x1fff) {
            pmtPid = pmtCandidate;
          }
        }
      }

      // PMT parsing to detect video PID (stream_type 0x1b: H.264, 0x24: H.265)
      if (pmtPid !== null && pid === pmtPid && pusi && payloadStart + 16 <= buf.byteLength) {
        const pointer = buf[payloadStart];
        const pmtStart = payloadStart + 1 + pointer;
        if (pmtStart + 12 <= buf.byteLength && buf[pmtStart] === 0x02) {
          const sectionLength = ((buf[pmtStart + 1] & 0x0f) << 8) | buf[pmtStart + 2];
          const programInfoLength = ((buf[pmtStart + 10] & 0x0f) << 8) | buf[pmtStart + 11];
          let esStart = pmtStart + 12 + programInfoLength;
          const pmtEnd = pmtStart + 3 + sectionLength - 4; // exclude 4-byte CRC

          while (esStart + 5 <= pmtEnd && esStart + 5 <= buf.byteLength) {
            const streamType = buf[esStart];
            const elementaryPid = ((buf[esStart + 1] & 0x1f) << 8) | buf[esStart + 2];
            const esInfoLength = ((buf[esStart + 3] & 0x0f) << 8) | buf[esStart + 4];

            if (streamType === 0x1b || streamType === 0x24 || streamType === 0x02) {
              detectedVideoPid = elementaryPid;
              break;
            }
            esStart += 5 + esInfoLength;
          }
        }
      }

      // Target video PID (detected or fallback 0x100 / 256)
      const targetVideoPid = detectedVideoPid ?? 0x100;
      if (pid === targetVideoPid) {
        // When PUSI is set, inspect PES header for PTS
        if (pusi && payloadStart + 14 <= buf.byteLength) {
          if (
            buf[payloadStart] === 0x00 &&
            buf[payloadStart + 1] === 0x00 &&
            buf[payloadStart + 2] === 0x01
          ) {
            const streamId = buf[payloadStart + 3];
            // Video streams: 0xE0 - 0xEF
            if (streamId >= 0xe0 && streamId <= 0xef) {
              const ptsDtsFlags = (buf[payloadStart + 7] & 0xc0) >> 6;
              const pesHeaderLen = buf[payloadStart + 8];
              const pesPayloadStart = payloadStart + 9 + pesHeaderLen;

              if ((ptsDtsFlags === 2 || ptsDtsFlags === 3) && payloadStart + 14 <= buf.byteLength) {
                const pts =
                  (buf[payloadStart + 9] & 0x0e) * 0x20000000 +
                  (buf[payloadStart + 10] << 22) +
                  ((buf[payloadStart + 11] & 0xfe) << 14) +
                  (buf[payloadStart + 12] << 7) +
                  ((buf[payloadStart + 13] & 0xfe) >> 1);
                const currentPts = pts / 90000;

                if (firstPts === null) {
                  firstPts = currentPts;
                }
                lastPts = currentPts;

                // Check if PES payload contains an IDR (type 5) or SPS (type 7) NAL unit
                let isKeyframe = hasRandomAccess;
                if (!isKeyframe && pesPayloadStart + 4 < buf.byteLength) {
                  const searchLimit = Math.min(buf.byteLength - 4, pesPayloadStart + 64);
                  for (let k = pesPayloadStart; k < searchLimit; k++) {
                    if (buf[k] === 0x00 && buf[k + 1] === 0x00) {
                      let nalType = 0;
                      if (buf[k + 2] === 0x01) {
                        nalType = buf[k + 3] & 0x1f;
                      } else if (buf[k + 2] === 0x00 && buf[k + 3] === 0x01) {
                        nalType = buf[k + 4] & 0x1f;
                      }

                      if (nalType === 5 || nalType === 7) {
                        isKeyframe = true;
                        break;
                      }
                    }
                  }
                }

                if (isKeyframe) {
                  const relFilePos = filePos + i - syncOffset;
                  const timeMs = Math.round((currentPts - firstPts) * 1000);
                  // Deduplicate keyframes occurring within 200ms
                  if (
                    keyframeTimes.length === 0 ||
                    timeMs > keyframeTimes[keyframeTimes.length - 1] + 200
                  ) {
                    keyframeTimes.push(timeMs);
                    keyframePositions.push(relFilePos);
                  }
                }
              }
            }
          }
        }
      }

      i += 188;
    }

    filePos += i;
    chunkCount++;

    // Yield every 3 chunks to prevent any main thread hitching
    if (chunkCount % 3 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  // Ensure first keyframe at position 0 exists
  if (keyframePositions.length === 0 || keyframePositions[0] !== 0) {
    keyframeTimes.unshift(0);
    keyframePositions.unshift(0);
  }

  const durationSec =
    firstPts !== null && lastPts !== null && lastPts > firstPts ? lastPts - firstPts : 0;
  const durationMs = Math.round(durationSec * 1000);

  return {
    duration: durationSec,
    durationMs,
    keyframesIndex: {
      times: keyframeTimes,
      filepositions: keyframePositions,
    },
    firstPts: firstPts ?? 0,
    lastPts: lastPts ?? 0,
  };
}
