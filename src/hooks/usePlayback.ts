import { useState, useRef, useEffect, useCallback } from 'react';
import { VideoItem, VideoLibrary } from '../types/video';
import {
  getVideoProgress,
  saveVideoProgress,
  loadSettings,
  saveSettings,
} from '../services/progressStorage';
import {
  DEFAULT_CONTROL_SETTINGS,
  END_SEEK_OFFSET_SECONDS,
  PLAYBACK_RATE_EPSILON,
  type ControlSettings,
} from '../config/controlSettings';
import { detectMediaFormat } from '../utils/mediaDetector';
import {
  createMpegTsPlayer,
  isMpegTsSupported,
  type MpegTsPlayerInstance,
} from '../services/mpegtsPlayerAdapter';

interface UsePlaybackProps {
  library: VideoLibrary | null;
  controlSettings?: ControlSettings;
}

export function usePlayback({
  library,
  controlSettings = DEFAULT_CONTROL_SETTINGS,
}: UsePlaybackProps) {
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isMpegTs, setIsMpegTs] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [autoplayNext, setAutoplayNext] = useState<boolean>(() => loadSettings().autoplayNext);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(() => {
    const saved = loadSettings().volume;
    return typeof saved === 'number' && Number.isFinite(saved)
      ? Math.max(0, Math.min(1, saved))
      : 1;
  });
  const [muted, setMutedState] = useState<boolean>(() => Boolean(loadSettings().muted));
  const [playbackRate, setPlaybackRateState] = useState<number>(
    DEFAULT_CONTROL_SETTINGS.playbackRate.default
  );

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const mpegtsAdapterRef = useRef<MpegTsPlayerInstance | null>(null);
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;
  const mutedRef = useRef<boolean>(muted);
  mutedRef.current = muted;
  const playbackRateRef = useRef<number>(playbackRate);
  playbackRateRef.current = playbackRate;
  const controlSettingsRef = useRef<ControlSettings>(controlSettings);
  controlSettingsRef.current = controlSettings;
  const lastAudibleVolumeRef = useRef<number>(
    volume > DEFAULT_CONTROL_SETTINGS.volume.min
      ? volume
      : DEFAULT_CONTROL_SETTINGS.volume.defaultUnmuted
  );
  if (volume > DEFAULT_CONTROL_SETTINGS.volume.min) {
    lastAudibleVolumeRef.current = volume;
  }

  // Monotonic token to prevent asynchronous file-read race conditions on rapid clicking
  const activeSelectionTokenRef = useRef(0);
  const pendingAutoPlayTokenRef = useRef(0);

  // Reference to current video identity for safe progress saving and event filtering
  const currentVideoRef = useRef<VideoItem | null>(null);
  currentVideoRef.current = currentVideo;

  const libraryRef = useRef<VideoLibrary | null>(null);
  libraryRef.current = library;

  // Centralized playback initiation helper
  const attemptPlay = useCallback((videoEl: HTMLVideoElement, token: number) => {
    try {
      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (token === activeSelectionTokenRef.current) {
              setIsPlaying(true);
              setAutoplayBlocked(false);
            }
          })
          .catch((err: unknown) => {
            if (token !== activeSelectionTokenRef.current) return;

            const errName =
              err instanceof Error || (typeof err === 'object' && err !== null)
                ? (err as any).name
                : '';

            if (errName === 'NotAllowedError') {
              // Browser blocked autoplay
              setAutoplayBlocked(true);
              setIsPlaying(false);
            } else if (errName === 'AbortError') {
              // Play request was superseded by a newer load/play request
            } else {
              setIsPlaying(false);
            }
          });
      }
    } catch {
      // In case videoEl.play() throws synchronously
    }
  }, []);

  // Cleanup object URLs and mpegts instance on unmount
  useEffect(() => {
    return () => {
      if (mpegtsAdapterRef.current) {
        mpegtsAdapterRef.current.destroy();
        mpegtsAdapterRef.current = null;
      }
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  // When library changes or is cleared, reset playback state
  useEffect(() => {
    activeSelectionTokenRef.current++;
    pendingAutoPlayTokenRef.current = 0;
    if (mpegtsAdapterRef.current) {
      mpegtsAdapterRef.current.destroy();
      mpegtsAdapterRef.current = null;
    }
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    setIsMpegTs(false);
    setCurrentVideo(null);
    setVideoSrc(null);
    setIsPlaying(false);
    setAutoplayBlocked(false);
    setPlayerError(null);
    setCurrentTime(0);
    setDuration(0);
  }, [library]);

  // Synchronize persisted volume, mute, and playback speed state with the underlying video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.volume = volume;
    videoEl.muted = muted;
    try {
      videoEl.playbackRate = playbackRate;
    } catch {
      // Ignore unsupported playbackRate during initial setup
    }
  }, [volume, muted, playbackRate, videoSrc]);

  // Load a video item
  const selectVideo = useCallback(async (video: VideoItem, autoPlay = true) => {
    // If clicking the currently selected video that is already loaded, start/resume playback
    if (
      currentVideoRef.current?.id === video.id &&
      (activeObjectUrlRef.current || mpegtsAdapterRef.current) &&
      videoRef.current
    ) {
      if (autoPlay && videoRef.current.paused) {
        attemptPlay(videoRef.current, activeSelectionTokenRef.current);
      }
      return;
    }

    const token = ++activeSelectionTokenRef.current;
    pendingAutoPlayTokenRef.current = autoPlay ? token : 0;
    setPlayerError(null);
    setAutoplayBlocked(false);
    setCurrentTime(0);
    setDuration(0);
    setCurrentVideo(video);

    // Teardown previous player instances
    if (mpegtsAdapterRef.current) {
      mpegtsAdapterRef.current.destroy();
      mpegtsAdapterRef.current = null;
    }
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    setIsMpegTs(false);

    try {
      let file: File | undefined = video.file;

      if (!file && video.handle) {
        file = await video.handle.getFile();
      }

      // Check if another selection was made during file read
      if (token !== activeSelectionTokenRef.current) {
        return;
      }

      if (!file) {
        throw new Error('Video file handle is unavailable or access was revoked.');
      }

      // Check format using bounded byte inspection
      const detection = await detectMediaFormat(file);
      if (token !== activeSelectionTokenRef.current) {
        return;
      }

      if (detection.isMpegTs && isMpegTsSupported() && videoRef.current) {
        setIsMpegTs(true);
        setVideoSrc(null);

        const adapter = await createMpegTsPlayer({
          file,
          syncOffset: detection.syncOffset ?? 0,
          videoElement: videoRef.current,
          onDurationChange: (dur) => {
            if (token !== activeSelectionTokenRef.current) return;
            if (Number.isFinite(dur) && dur > 0) {
              setDuration(dur);
            }
          },
          onError: (msg) => {
            if (token !== activeSelectionTokenRef.current) return;
            setPlayerError(msg);
            setIsPlaying(false);
          },
        });

        if (token !== activeSelectionTokenRef.current) {
          adapter.destroy();
          return;
        }

        mpegtsAdapterRef.current = adapter;
        if (adapter.duration > 0) {
          setDuration(adapter.duration);
        }

        if (autoPlay) {
          attemptPlay(videoRef.current, token);
        }
      } else {
        setIsMpegTs(false);
        const newUrl = URL.createObjectURL(file);
        activeObjectUrlRef.current = newUrl;
        setVideoSrc(newUrl);
      }
    } catch (err: unknown) {
      if (token !== activeSelectionTokenRef.current) return;
      const message =
        err instanceof Error
          ? err.message
          : 'Could not load video. The file may have been moved or permission was revoked.';
      setPlayerError(message);
    }
  }, [attemptPlay]);

  // Compute playback navigation indices based on deterministic DFS playlist
  const flatPlaylist = library?.flatPlaylist || [];
  const currentIndex = currentVideo
    ? flatPlaylist.findIndex((v) => v.id === currentVideo.id)
    : -1;
  const hasNext = currentIndex >= 0 && currentIndex < flatPlaylist.length - 1;
  const hasPrevious = currentIndex > 0;

  const playNext = useCallback(() => {
    const playlist = libraryRef.current?.flatPlaylist || [];
    const current = currentVideoRef.current;
    const idx = current ? playlist.findIndex((v) => v.id === current.id) : -1;
    if (idx >= 0 && idx < playlist.length - 1) {
      const nextVideo = playlist[idx + 1];
      selectVideo(nextVideo, true);
    }
  }, [selectVideo]);

  const playPrevious = useCallback(() => {
    const playlist = libraryRef.current?.flatPlaylist || [];
    const current = currentVideoRef.current;
    const idx = current ? playlist.findIndex((v) => v.id === current.id) : -1;
    if (idx > 0) {
      const prevVideo = playlist[idx - 1];
      selectVideo(prevVideo, true);
    }
  }, [selectVideo]);

  const toggleAutoplayNext = useCallback(() => {
    setAutoplayNext((prev) => {
      const nextVal = !prev;
      saveSettings({ autoplayNext: nextVal });
      return nextVal;
    });
  }, []);

  // Handle video metadata loaded: Reliable resume
  const handleLoadedMetadata = useCallback(() => {
    const videoEl = videoRef.current;
    const video = currentVideoRef.current;
    const currentLib = libraryRef.current;

    if (!videoEl || !video || !currentLib) return;

    videoEl.volume = volumeRef.current;
    videoEl.muted = mutedRef.current;
    try {
      videoEl.playbackRate = playbackRateRef.current;
    } catch {
      // Ignore unsupported playbackRate and keep actual element rate
    }
    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
    const nextDuration =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : knownDuration > 0
        ? knownDuration
        : 0;
    setDuration(nextDuration);

    try {
      const saved = getVideoProgress(
        currentLib.id,
        video.relativePath,
        video.size,
        video.lastModified
      );

      const effectiveDuration = nextDuration > 0 ? nextDuration : (videoEl.duration || 0);
      if (saved && !saved.completed && effectiveDuration > 0) {
        const minResume = Math.min(5, effectiveDuration * 0.1);
        const maxResume = effectiveDuration > 15 ? effectiveDuration - 15 : effectiveDuration * 0.95;
        if (saved.currentTime > minResume && saved.currentTime < maxResume) {
          if (mpegtsAdapterRef.current) {
            mpegtsAdapterRef.current.seek(saved.currentTime);
          } else {
            videoEl.currentTime = saved.currentTime;
          }
        }
      }
    } catch {
      // Seek failure or invalid position; continue safely from beginning
    }

    setCurrentTime(Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0);

    // If this video load had pending autoplay and is currently paused, start playback
    if (pendingAutoPlayTokenRef.current === activeSelectionTokenRef.current) {
      pendingAutoPlayTokenRef.current = 0;
      if (videoEl.paused) {
        attemptPlay(videoEl, activeSelectionTokenRef.current);
      }
    }
  }, [attemptPlay]);

  // Throttled timeupdate for saving playback progress
  const lastSavedTimeRef = useRef(0);
  const handleTimeUpdate = useCallback(() => {
    const videoEl = videoRef.current;
    const video = currentVideoRef.current;
    const currentLib = libraryRef.current;

    if (!videoEl || !video || !currentLib) return;

    const currentTimeVal = videoEl.currentTime;
    const durationVal = videoEl.duration;
    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;

    setCurrentTime(Number.isFinite(currentTimeVal) ? currentTimeVal : 0);
    if (Number.isFinite(durationVal) && durationVal > 0) {
      setDuration(durationVal);
    } else if (knownDuration > 0) {
      setDuration(knownDuration);
    }

    const effectiveDuration =
      Number.isFinite(durationVal) && durationVal > 0 ? durationVal : knownDuration;

    // Save roughly every 4 seconds or when near end
    const now = Date.now();
    if (now - lastSavedTimeRef.current > 4000) {
      lastSavedTimeRef.current = now;
      saveVideoProgress(
        currentLib.id,
        video.relativePath,
        video.size,
        video.lastModified,
        currentTimeVal,
        effectiveDuration
      );
    }
  }, []);

  // Handle video play
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setAutoplayBlocked(false);
  }, []);

  // Handle video pause
  const handlePause = useCallback(() => {
    setIsPlaying(false);
    const videoEl = videoRef.current;
    const video = currentVideoRef.current;
    const currentLib = libraryRef.current;

    if (!videoEl || !video || !currentLib) return;

    setCurrentTime(Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0);

    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
    const effectiveDuration =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : knownDuration;

    saveVideoProgress(
      currentLib.id,
      video.relativePath,
      video.size,
      video.lastModified,
      videoEl.currentTime,
      effectiveDuration
    );
  }, []);

  // Handle video seeked
  const handleSeeked = useCallback(() => {
    const videoEl = videoRef.current;
    const video = currentVideoRef.current;
    const currentLib = libraryRef.current;

    if (!videoEl || !video || !currentLib) return;

    setCurrentTime(Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0);
    // Synchronize isPlaying with native media element state
    setIsPlaying(!videoEl.paused);

    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
    const effectiveDuration =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : knownDuration;

    saveVideoProgress(
      currentLib.id,
      video.relativePath,
      video.size,
      video.lastModified,
      videoEl.currentTime,
      effectiveDuration
    );
  }, []);

  // Video playback error handling
  const handleVideoError = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoEl.error) return;

    let message = 'An error occurred while playing this video.';
    switch (videoEl.error.code) {
      case MediaError.MEDIA_ERR_ABORTED:
        // Ignore aborted error from switching tracks
        return;
      case MediaError.MEDIA_ERR_NETWORK:
        message = 'A network/file read error occurred.';
        break;
      case MediaError.MEDIA_ERR_DECODE:
        message =
          'Video decode failed. The format or codec (e.g. MKV/HEVC/AC3) may not be natively supported by your browser.';
        break;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        message =
          'The video format or codec is not supported by your browser (e.g. unsupported MKV codec, HEVC, or AC3 audio).';
        break;
    }

    setPlayerError(message);
    setIsPlaying(false);
  }, []);

  // Handle video ended
  const handleEnded = useCallback(() => {
    const video = currentVideoRef.current;
    const currentLib = libraryRef.current;
    const videoEl = videoRef.current;

    setIsPlaying(false);

    if (video && currentLib && videoEl) {
      const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
      const effectiveDuration =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : knownDuration;

      if (effectiveDuration > 0) {
        setCurrentTime(effectiveDuration);
      }
      // Mark as completed in storage
      saveVideoProgress(
        currentLib.id,
        video.relativePath,
        video.size,
        video.lastModified,
        effectiveDuration,
        effectiveDuration
      );
    }

    // Autoplay next if enabled and next video exists
    if (autoplayNext) {
      const playlist = libraryRef.current?.flatPlaylist || [];
      const current = currentVideoRef.current;
      const idx = current ? playlist.findIndex((v) => v.id === current.id) : -1;
      if (idx >= 0 && idx < playlist.length - 1) {
        playNext();
      }
    }
  }, [autoplayNext, playNext]);

  const handleManualPlay = useCallback(() => {
    if (videoRef.current) {
      attemptPlay(videoRef.current, activeSelectionTokenRef.current);
    }
  }, [attemptPlay]);

  const togglePlayPause = useCallback((): 'play' | 'pause' | null => {
    const videoEl = videoRef.current;
    if (!videoEl || !currentVideoRef.current) return null;
    if (videoEl.paused || videoEl.ended) {
      attemptPlay(videoEl, activeSelectionTokenRef.current);
      return 'play';
    } else {
      videoEl.pause();
      return 'pause';
    }
  }, [attemptPlay]);

  const seekTo = useCallback((time: number) => {
    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(time)) return;
    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
    const maxTime =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : knownDuration > 0
        ? knownDuration
        : 0;
    const clamped = Math.max(0, Math.min(time, maxTime));
    try {
      if (mpegtsAdapterRef.current) {
        mpegtsAdapterRef.current.seek(clamped);
      } else {
        videoEl.currentTime = clamped;
      }
    } catch {
      // Ignore invalid seek state before metadata is ready
    }
    setCurrentTime(clamped);
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number): boolean => {
      const videoEl = videoRef.current;
      if (!videoEl || !Number.isFinite(deltaSeconds)) return false;
      const baseTime = Number.isFinite(videoEl.currentTime) ? videoEl.currentTime : 0;
      seekTo(baseTime + deltaSeconds);
      return true;
    },
    [seekTo]
  );

  const seekToStart = useCallback((): boolean => {
    if (!videoRef.current) return false;
    seekTo(0);
    return true;
  }, [seekTo]);

  const seekToEnd = useCallback((): boolean => {
    const videoEl = videoRef.current;
    if (!videoEl) return false;
    const knownDuration = mpegtsAdapterRef.current?.duration ?? 0;
    const maxTime =
      Number.isFinite(videoEl.duration) && videoEl.duration > 0
        ? videoEl.duration
        : knownDuration > 0
        ? knownDuration
        : 0;
    seekTo(Math.max(0, maxTime - END_SEEK_OFFSET_SECONDS));
    return true;
  }, [seekTo]);

  const applyPlaybackRate = useCallback((targetRate: number): number => {
    const { min, max } = controlSettingsRef.current.playbackRate;
    const rounded = Math.round(Math.min(max, Math.max(min, targetRate)) * 100) / 100;
    const videoEl = videoRef.current;
    if (!videoEl) {
      setPlaybackRateState(rounded);
      return rounded;
    }
    try {
      videoEl.playbackRate = rounded;
      const actual = Number.isFinite(videoEl.playbackRate) ? videoEl.playbackRate : rounded;
      setPlaybackRateState(actual);
      return actual;
    } catch {
      const actual = Number.isFinite(videoEl.playbackRate)
        ? videoEl.playbackRate
        : playbackRateRef.current;
      setPlaybackRateState(actual);
      return actual;
    }
  }, []);

  // Clamp active playback rate if user narrows min/max speed bounds in Settings
  useEffect(() => {
    const { min, max } = controlSettings.playbackRate;
    if (playbackRateRef.current < min || playbackRateRef.current > max) {
      applyPlaybackRate(playbackRateRef.current);
    }
  }, [controlSettings.playbackRate.min, controlSettings.playbackRate.max, applyPlaybackRate]);

  const adjustPlaybackRate = useCallback(
    (direction: -1 | 1): number => {
      const { step } = controlSettingsRef.current.playbackRate;
      const currentRate =
        videoRef.current && Number.isFinite(videoRef.current.playbackRate)
          ? videoRef.current.playbackRate
          : playbackRateRef.current;
      return applyPlaybackRate(currentRate + direction * step);
    },
    [applyPlaybackRate]
  );

  const toggleMaxPlaybackRate = useCallback((): number => {
    const { default: defaultRate, max } = controlSettingsRef.current.playbackRate;
    const currentRate =
      videoRef.current && Number.isFinite(videoRef.current.playbackRate)
        ? videoRef.current.playbackRate
        : playbackRateRef.current;
    const isDefault = Math.abs(currentRate - defaultRate) <= PLAYBACK_RATE_EPSILON;
    return applyPlaybackRate(isDefault ? max : defaultRate);
  }, [applyPlaybackRate]);

  const handleRateChange = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(videoEl.playbackRate)) return;
    setPlaybackRateState(videoEl.playbackRate);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    if (!Number.isFinite(nextVolume)) return;
    const clamped = Number(
      Math.max(
        DEFAULT_CONTROL_SETTINGS.volume.min,
        Math.min(DEFAULT_CONTROL_SETTINGS.volume.max, nextVolume)
      ).toFixed(2)
    );
    if (clamped > DEFAULT_CONTROL_SETTINGS.volume.min) {
      lastAudibleVolumeRef.current = clamped;
    }
    setVolumeState(clamped);
    const shouldUnmute = clamped > 0 && mutedRef.current;
    if (shouldUnmute) {
      setMutedState(false);
    }
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      if (shouldUnmute) {
        videoRef.current.muted = false;
      }
    }
    saveSettings({
      volume: clamped,
      ...(shouldUnmute ? { muted: false } : {}),
    });
  }, []);

  const adjustVolume = useCallback(
    (direction: -1 | 1): number => {
      const { step, min, max } = controlSettingsRef.current.volume;
      const currentVol =
        videoRef.current && Number.isFinite(videoRef.current.volume)
          ? videoRef.current.volume
          : volumeRef.current;
      const nextVolume = Number(Math.min(max, Math.max(min, currentVol + direction * step)).toFixed(2));
      if (nextVolume > min) {
        lastAudibleVolumeRef.current = nextVolume;
      }
      setVolumeState(nextVolume);
      setMutedState(false);
      let appliedVolume = nextVolume;
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = nextVolume;
        if (Number.isFinite(videoRef.current.volume)) {
          appliedVolume = videoRef.current.volume;
        }
      }
      saveSettings({ volume: appliedVolume, muted: false });
      return appliedVolume;
    },
    []
  );

  const toggleMute = useCallback((): { muted: boolean; volume: number } => {
    const isEffectivelyMuted =
      mutedRef.current || volumeRef.current <= DEFAULT_CONTROL_SETTINGS.volume.min;

    if (isEffectivelyMuted) {
      const restoredVolume =
        volumeRef.current > DEFAULT_CONTROL_SETTINGS.volume.min
          ? volumeRef.current
          : lastAudibleVolumeRef.current;
      lastAudibleVolumeRef.current = restoredVolume;
      setMutedState(false);
      setVolumeState(restoredVolume);
      let appliedVolume = restoredVolume;
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = restoredVolume;
        if (Number.isFinite(videoRef.current.volume)) {
          appliedVolume = videoRef.current.volume;
        }
      }
      saveSettings({ muted: false, volume: appliedVolume });
      return { muted: false, volume: appliedVolume };
    }

    lastAudibleVolumeRef.current = volumeRef.current;
    setMutedState(true);
    if (videoRef.current) {
      videoRef.current.muted = true;
    }
    saveSettings({ muted: true });
    return { muted: true, volume: volumeRef.current };
  }, []);

  const handleVolumeChange = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const nextVol = Number.isFinite(videoEl.volume)
      ? Math.max(0, Math.min(1, videoEl.volume))
      : 1;
    const nextMuted = Boolean(videoEl.muted);
    if (nextVol > DEFAULT_CONTROL_SETTINGS.volume.min) {
      lastAudibleVolumeRef.current = nextVol;
    }
    setVolumeState(nextVol);
    setMutedState(nextMuted);
    saveSettings({ volume: nextVol, muted: nextMuted });
  }, []);

  return {
    videoRef,
    currentVideo,
    videoSrc,
    isMpegTs,
    isPlaying,
    autoplayBlocked,
    playerError,
    autoplayNext,
    currentTime,
    duration,
    volume,
    muted,
    playbackRate,
    currentIndex,
    totalCount: flatPlaylist.length,
    hasNext,
    hasPrevious,
    selectVideo,
    playNext,
    playPrevious,
    toggleAutoplayNext,
    togglePlayPause,
    seekTo,
    seekBy,
    seekToStart,
    seekToEnd,
    adjustPlaybackRate,
    toggleMaxPlaybackRate,
    handleRateChange,
    setVolume,
    adjustVolume,
    toggleMute,
    handleVolumeChange,
    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlay,
    handlePause,
    handleSeeked,
    handlePauseOrSeek: handlePause,
    handleVideoError,
    handleEnded,
    handleManualPlay,
  };
}
