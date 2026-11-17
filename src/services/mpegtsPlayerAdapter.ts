/**
 * Adapter for mpegts.js MSE playback of local MPEG-TS files.
 */

import { createFileBlobLoaderClass } from './mpegtsFileLoader';
import { scanMpegTsKeyframes, type MpegTsIndexResult } from '../utils/mpegtsIndexer';

export interface MpegTsAdapterOptions {
  file: File;
  syncOffset: number;
  videoElement: HTMLVideoElement;
  onDurationChange?: (duration: number) => void;
  onError?: (errorMessage: string) => void;
}

export interface MpegTsPlayerInstance {
  player: any;
  duration: number;
  seek: (seconds: number) => void;
  destroy: () => void;
}

export function isMpegTsSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const hasMSE =
    typeof (window as any).MediaSource !== 'undefined' ||
    typeof (window as any).ManagedMediaSource !== 'undefined';
  return Boolean(hasMSE);
}

export async function createMpegTsPlayer({
  file,
  syncOffset,
  videoElement,
  onDurationChange,
  onError,
}: MpegTsAdapterOptions): Promise<MpegTsPlayerInstance> {
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).self === 'undefined') {
    (globalThis as any).self = globalThis;
  }

  const mpegts = (await import('mpegts.js')).default;

  if (!mpegts.isSupported()) {
    throw new Error('MPEG-TS MSE playback is not supported by your browser.');
  }

  // Scan file for keyframes and precise duration
  let indexResult: MpegTsIndexResult;
  try {
    indexResult = await scanMpegTsKeyframes(file, syncOffset);
  } catch (err: unknown) {
    console.warn('[MPEG-TS Player] Keyframe indexing encountered an issue, using fallback:', err);
    indexResult = {
      duration: 0,
      durationMs: 0,
      keyframesIndex: { times: [0], filepositions: [0] },
      firstPts: 0,
      lastPts: 0,
    };
  }

  if (indexResult.duration > 0 && onDurationChange) {
    onDurationChange(indexResult.duration);
  }

  const streamSize = Math.max(0, file.size - syncOffset);
  const CustomLoaderClass = createFileBlobLoaderClass(file, syncOffset);

  const player = mpegts.createPlayer(
    {
      type: 'mpegts',
      isLive: false,
      url: 'file://local-stream',
      file,
      syncOffset,
      filesize: streamSize,
      duration: indexResult.durationMs,
      keyframes: indexResult.keyframesIndex,
      segments: [
        {
          duration: indexResult.durationMs,
          filesize: streamSize,
          url: 'file://local-stream',
          file,
          syncOffset,
          keyframes: indexResult.keyframesIndex,
        } as any,
      ],
    } as any,
    {
      customLoader: CustomLoaderClass as any,
      enableStashBuffer: true,
      stashInitialSize: 384 * 1024,
      lazyLoad: true,
      lazyLoadMaxDuration: 3 * 60,
      lazyLoadRecoverDuration: 30,
      deferLoadAfterSourceOpen: true,
      enableWorker: false,
      accurateSeek: false,
      seekType: 'range',
      autoCleanupSourceBuffer: true,
    }
  );

  /**
   * Compatibility / Internal API Encapsulation:
   * mpegts.js (tested against ^1.7.3) relies on `_mediaInfo.hasKeyframesIndex` and
   * `_mediaInfo.keyframesIndex` to allow arbitrary timeline seeking into unbuffered
   * Byte-Range segments when `isLive: false`.
   *
   * We encapsulate this access behind defensive optional chaining and try/catch.
   * If a future version refactors or removes `_player_engine` or `_transmuxer`,
   * this operation safely no-ops without throwing, falling back to standard MSE buffering.
   */
  const applyMediaInfoIndex = () => {
    try {
      const controller = (player as any)._player_engine?._transmuxer?._controller;
      if (controller && controller._mediaInfo) {
        controller._mediaInfo.hasKeyframesIndex = true;
        controller._mediaInfo.keyframesIndex = indexResult.keyframesIndex;
        if (indexResult.durationMs > 0) {
          controller._mediaInfo.duration = indexResult.durationMs;
        }
        if (controller._mediaInfo.segments?.[0]) {
          controller._mediaInfo.segments[0].hasKeyframesIndex = true;
          controller._mediaInfo.segments[0].keyframesIndex = indexResult.keyframesIndex;
          if (indexResult.durationMs > 0) {
            controller._mediaInfo.segments[0].duration = indexResult.durationMs;
          }
        }
      }
    } catch {
      // Safely ignore injection failure on internal API mismatch
    }
  };

  /**
   * Synchronize finite stream duration to MediaSource.
   * Prevents duration reverting to +Infinity or NaN when demuxing live-like segments.
   */
  const syncMediaSourceDuration = () => {
    try {
      const mseController = (player as any)._player_engine?._mse_controller;
      if (
        mseController?._mediaSource &&
        mseController._mediaSource.readyState === 'open' &&
        indexResult.duration > 0
      ) {
        if (
          !Number.isFinite(mseController._mediaSource.duration) ||
          mseController._mediaSource.duration < indexResult.duration - 0.5
        ) {
          mseController._mediaSource.duration = indexResult.duration;
        }
      }
    } catch {
      // Safely ignore MediaSource duration update failure
    }
  };

  player.on(mpegts.Events.MEDIA_INFO, () => {
    applyMediaInfoIndex();
    syncMediaSourceDuration();
  });

  const onLoadedMetadata = () => {
    syncMediaSourceDuration();
    if (indexResult.duration > 0 && onDurationChange) {
      onDurationChange(indexResult.duration);
    }
  };
  videoElement.addEventListener('loadedmetadata', onLoadedMetadata);

  if (onError) {
    player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: string, info: any) => {
      const detailedMsg =
        typeof info === 'object' && info !== null && info.msg
          ? `${info.msg} (${errorDetail}, code ${info.code ?? -1})`
          : `${errorDetail} (${JSON.stringify(info || {})})`;
      const userFacingMsg = `MPEG-TS Playback error: ${errorType} — ${detailedMsg}`;
      console.error('[MPEG-TS Player Error]', { errorType, errorDetail, info, userFacingMsg });
      onError(userFacingMsg);
    });
  }

  player.attachMediaElement(videoElement);
  player.load();

  return {
    player,
    duration: indexResult.duration,
    seek: (seconds: number) => {
      try {
        applyMediaInfoIndex();
        syncMediaSourceDuration();

        /**
         * Audio Discontinuity Handling:
         * Calling `insertDiscontinuity()` resets `_audioNextDts` inside mpegts.js remuxer.
         * This prevents the remuxer from attempting to fill a time gap with thousands
         * of silent audio frames if there is an audio PTS mismatch after seeking.
         */
        const controller = (player as any)._player_engine?._transmuxer?._controller;
        if (controller?._remuxer && typeof controller._remuxer.insertDiscontinuity === 'function') {
          controller._remuxer.insertDiscontinuity();
        }

        player.currentTime = seconds;
        try {
          videoElement.currentTime = seconds;
        } catch {
          // ignore if video element is not ready
        }
      } catch {
        try {
          videoElement.currentTime = seconds;
        } catch {
          // ignore seek error
        }
      }
    },
    destroy: () => {
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      try {
        player.unload();
      } catch {
        // ignore unload error during teardown
      }
      try {
        player.detachMediaElement();
      } catch {
        // ignore detach error
      }
      try {
        player.destroy();
      } catch {
        // ignore destroy error
      }
    },
  };
}
