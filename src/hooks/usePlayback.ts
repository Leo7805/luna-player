import { useState, useRef, useEffect, useCallback } from 'react';
import { VideoItem, VideoLibrary } from '../types/video';
import {
  getVideoProgress,
  saveVideoProgress,
  loadSettings,
  saveSettings,
} from '../services/progressStorage';

interface UsePlaybackProps {
  library: VideoLibrary | null;
}

export function usePlayback({ library }: UsePlaybackProps) {
  const [currentVideo, setCurrentVideo] = useState<VideoItem | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const volumeRef = useRef<number>(volume);
  volumeRef.current = volume;
  const mutedRef = useRef<boolean>(muted);
  mutedRef.current = muted;

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

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
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
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    setCurrentVideo(null);
    setVideoSrc(null);
    setIsPlaying(false);
    setAutoplayBlocked(false);
    setPlayerError(null);
    setCurrentTime(0);
    setDuration(0);
  }, [library]);

  // Synchronize persisted volume and mute state with the underlying video element
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    videoEl.volume = volume;
    videoEl.muted = muted;
  }, [volume, muted, videoSrc]);

  // Load a video item
  const selectVideo = useCallback(async (video: VideoItem, autoPlay = true) => {
    // If clicking the currently selected video that is already loaded, start/resume playback
    if (
      currentVideoRef.current?.id === video.id &&
      activeObjectUrlRef.current &&
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

      // Safe URL release and swap
      const newUrl = URL.createObjectURL(file);
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
      }
      activeObjectUrlRef.current = newUrl;

      setVideoSrc(newUrl);
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
    const nextDuration = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    setDuration(nextDuration);

    try {
      const saved = getVideoProgress(
        currentLib.id,
        video.relativePath,
        video.size,
        video.lastModified
      );

      if (saved && !saved.completed) {
        const minResume = Math.min(5, videoEl.duration * 0.1);
        const maxResume = videoEl.duration > 15 ? videoEl.duration - 15 : videoEl.duration * 0.95;
        if (saved.currentTime > minResume && saved.currentTime < maxResume) {
          videoEl.currentTime = saved.currentTime;
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

    setCurrentTime(Number.isFinite(currentTimeVal) ? currentTimeVal : 0);
    if (Number.isFinite(durationVal) && durationVal > 0) {
      setDuration(durationVal);
    }

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
        durationVal
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

    saveVideoProgress(
      currentLib.id,
      video.relativePath,
      video.size,
      video.lastModified,
      videoEl.currentTime,
      videoEl.duration
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

    saveVideoProgress(
      currentLib.id,
      video.relativePath,
      video.size,
      video.lastModified,
      videoEl.currentTime,
      videoEl.duration
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
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        setCurrentTime(videoEl.duration);
      }
      // Mark as completed in storage
      saveVideoProgress(
        currentLib.id,
        video.relativePath,
        video.size,
        video.lastModified,
        videoEl.duration,
        videoEl.duration
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

  const togglePlayPause = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !currentVideoRef.current) return;
    if (videoEl.paused || videoEl.ended) {
      attemptPlay(videoEl, activeSelectionTokenRef.current);
    } else {
      videoEl.pause();
    }
  }, [attemptPlay]);

  const seekTo = useCallback((time: number) => {
    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(time)) return;
    const maxTime = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : 0;
    const clamped = Math.max(0, Math.min(time, maxTime));
    try {
      videoEl.currentTime = clamped;
    } catch {
      // Ignore invalid seek state before metadata is ready
    }
    setCurrentTime(clamped);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    if (!Number.isFinite(nextVolume)) return;
    const clamped = Math.max(0, Math.min(1, nextVolume));
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

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    setMutedState(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
    saveSettings({ muted: nextMuted });
  }, []);

  const handleVolumeChange = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const nextVol = Number.isFinite(videoEl.volume)
      ? Math.max(0, Math.min(1, videoEl.volume))
      : 1;
    const nextMuted = Boolean(videoEl.muted);
    setVolumeState(nextVol);
    setMutedState(nextMuted);
    saveSettings({ volume: nextVol, muted: nextMuted });
  }, []);

  return {
    videoRef,
    currentVideo,
    videoSrc,
    isPlaying,
    autoplayBlocked,
    playerError,
    autoplayNext,
    currentTime,
    duration,
    volume,
    muted,
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
    setVolume,
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
