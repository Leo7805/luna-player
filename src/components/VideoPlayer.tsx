import { RefObject, useState, useEffect, useRef, useCallback } from 'react';
import { Play, AlertTriangle, Maximize2, Minimize2, Expand, Shrink } from 'lucide-react';
import { VideoItem } from '../types/video';

interface VideoPlayerProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  currentVideo: VideoItem | null;
  videoSrc: string | null;
  isPlaying: boolean;
  autoplayBlocked: boolean;
  playerError: string | null;
  isTheaterMode: boolean;
  onToggleTheaterMode: () => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onVideoError: () => void;
  onEnded: () => void;
  onManualPlay: () => void;
}

export function VideoPlayer({
  videoRef,
  currentVideo,
  videoSrc,
  isPlaying,
  autoplayBlocked,
  playerError,
  isTheaterMode,
  onToggleTheaterMode,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeeked,
  onVideoError,
  onEnded,
  onManualPlay,
}: VideoPlayerProps) {
  const [showOverlay, setShowOverlay] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFocusedInOverlay, setIsFocusedInOverlay] = useState(false);

  const hideTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Helper to check if video is actually playing
  const isVideoPlaying = useCallback(() => {
    if (videoRef.current) {
      return !videoRef.current.paused && !videoRef.current.ended;
    }
    return isPlaying;
  }, [isPlaying, videoRef]);

  // Monitor fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const clearHideTimer = () => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHideTimer = useCallback(() => {
    clearHideTimer();
    // Auto-hide after 2.5s if currently playing and not actively keyboard focused
    if (isVideoPlaying() && !isFocusedInOverlay) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowOverlay(false);
      }, 2500);
    }
  }, [isVideoPlaying, isFocusedInOverlay]);

  const handlePointerActivity = useCallback(() => {
    setShowOverlay(true);
    scheduleHideTimer();
  }, [scheduleHideTimer]);

  const handleContainerMouseLeave = () => {
    // If playing and focus is not inside overlay, hide promptly
    if (isVideoPlaying() && !isFocusedInOverlay) {
      clearHideTimer();
      setShowOverlay(false);
    }
  };

  // State synchronization when play/pause status or focus changes
  useEffect(() => {
    if (!isVideoPlaying() || isFocusedInOverlay) {
      clearHideTimer();
      setShowOverlay(true);
    } else {
      scheduleHideTimer();
    }
    return () => clearHideTimer();
  }, [isPlaying, isVideoPlaying, isFocusedInOverlay, scheduleHideTimer]);

  const handleToggleFullscreen = async () => {
    try {
      const container = containerRef.current;
      if (!container) return;

      if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
          await container.requestFullscreen();
        } else if ((container as any).webkitRequestFullscreen) {
          await (container as any).webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      }
    } catch {
      // Fallback or permission rejection
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handlePointerActivity}
      onMouseEnter={handlePointerActivity}
      onMouseLeave={handleContainerMouseLeave}
      className={`relative w-full rounded-2xl overflow-hidden shadow-2xl bg-slate-950 flex items-center justify-center border border-white/10 group transition-all duration-300 ${
        isTheaterMode
          ? 'h-[55vh] sm:h-[70vh] lg:h-[78vh] max-h-[85vh]'
          : 'h-[360px] sm:h-[460px] lg:h-[520px] max-h-[70vh]'
      }`}
    >
      <video
        ref={videoRef}
        src={videoSrc || undefined}
        controls
        playsInline
        className={`w-full h-full object-contain mx-auto my-auto ${videoSrc ? '' : 'hidden'}`}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onSeeked={onSeeked}
        onError={onVideoError}
        onEnded={onEnded}
      />
      {!videoSrc && (
        <div className="flex flex-col items-center justify-center p-6 text-center text-slate-400">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-3 text-slate-500 border border-white/10">
            <Play className="h-7 w-7 ml-1" />
          </div>
          <p className="text-sm font-medium text-slate-300">Select a video from the playlist to play</p>
          <p className="text-xs text-slate-500 mt-1">Playback is kept strictly local in your browser</p>
        </div>
      )}

      {/* Autoplay Blocked Overlay */}
      {autoplayBlocked && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 transition-opacity">
          <button
            onClick={onManualPlay}
            className="flex items-center gap-3 px-6 py-3 rounded-full bg-sky-500 text-slate-950 font-semibold text-base shadow-lg shadow-sky-500/25 hover:bg-sky-400 transition transform hover:scale-105 cursor-pointer"
          >
            <Play className="h-5 w-5 fill-current" />
            <span>Click to Play</span>
          </button>
          <p className="text-xs text-slate-300 mt-3 font-medium">Browser blocked automatic playback</p>
        </div>
      )}

      {/* Player Error Overlay */}
      {playerError && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 mb-3">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h4 className="text-base font-semibold text-white mb-1">Playback Error</h4>
          <p className="text-xs text-slate-300 max-w-md leading-relaxed">{playerError}</p>
        </div>
      )}

      {/* Hover Floating Controls Overlay (Top) */}
      {currentVideo && (
        <div
          onFocusCapture={() => {
            setIsFocusedInOverlay(true);
            setShowOverlay(true);
          }}
          onBlurCapture={(e) => {
            // Check if focus moved outside the overlay
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsFocusedInOverlay(false);
              scheduleHideTimer();
            }
          }}
          className={`absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/85 via-black/45 to-transparent pointer-events-none transition-opacity duration-300 z-10 flex items-start justify-between gap-4 focus-within:opacity-100 ${
            showOverlay ? 'opacity-100' : 'opacity-0'
          }`}
          data-testid="video-top-overlay"
        >
          {/* Title and breadcrumbs */}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-mono text-sky-400 tracking-wide uppercase truncate">
              {currentVideo.relativePath}
            </p>
            <h3 className="text-sm font-medium text-white truncate drop-shadow">
              {currentVideo.name}
            </h3>
          </div>

          {/* Quick layout & screen actions */}
          <div
            className={`flex items-center gap-2 shrink-0 ${
              showOverlay ? 'pointer-events-auto' : 'pointer-events-none focus-within:pointer-events-auto'
            }`}
          >
            {/* Theater Mode Toggle */}
            <button
              onClick={onToggleTheaterMode}
              className="p-2 rounded-xl bg-black/50 hover:bg-black/80 text-slate-100 hover:text-white border border-white/20 backdrop-blur-md transition shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400"
              aria-label={isTheaterMode ? 'Exit theater mode' : 'Enter theater mode'}
              title={isTheaterMode ? 'Exit theater mode' : 'Theater mode'}
              tabIndex={0}
            >
              {isTheaterMode ? (
                <Minimize2 className="h-4 w-4 text-sky-400" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>

            {/* Native Fullscreen Toggle */}
            <button
              onClick={handleToggleFullscreen}
              className="p-2 rounded-xl bg-black/50 hover:bg-black/80 text-slate-100 hover:text-white border border-white/20 backdrop-blur-md transition shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              tabIndex={0}
            >
              {isFullscreen ? (
                <Shrink className="h-4 w-4 text-sky-400" />
              ) : (
                <Expand className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
