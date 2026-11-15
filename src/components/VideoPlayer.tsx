import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  AlertCircle,
  Film,
  Tv,
  Minimize2,
  ListVideo,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { VideoControls } from './VideoControls';

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentVideo: VideoItem | null;
  videoSrc: string | null;
  isPlaying: boolean;
  autoplayBlocked: boolean;
  playerError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  currentIndex: number;
  totalCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
  autoplayNext: boolean;
  isTheaterMode: boolean;
  onToggleTheaterMode: () => void;
  onToggleAutoplayNext: () => void;
  onTogglePlayPause: () => void;
  onSeek: (time: number) => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onNativeVolumeChange: () => void;
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeeked: () => void;
  onError: () => void;
  onEnded: () => void;
  onManualPlay: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  videoRef,
  currentVideo,
  videoSrc,
  isPlaying,
  autoplayBlocked,
  playerError,
  currentTime,
  duration,
  volume,
  muted,
  currentIndex,
  totalCount,
  hasNext,
  hasPrevious,
  autoplayNext,
  isTheaterMode,
  onToggleTheaterMode,
  onToggleAutoplayNext,
  onTogglePlayPause,
  onSeek,
  onPlayNext,
  onPlayPrevious,
  onToggleMute,
  onVolumeChange,
  onNativeVolumeChange,
  onLoadedMetadata,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeeked,
  onError,
  onEnded,
  onManualPlay,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userActive, setUserActive] = useState(true);
  const [isInteractingWithControls, setIsInteractingWithControls] = useState(false);
  const [isFocusInside, setIsFocusInside] = useState(false);
  const hideControlsTimerRef = useRef<number | null>(null);

  const revealOverlay = useCallback(() => {
    setUserActive(true);
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
    }
    hideControlsTimerRef.current = window.setTimeout(() => {
      setUserActive(false);
    }, 2500);
  }, []);

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current) {
        window.clearTimeout(hideControlsTimerRef.current);
      }
    };
  }, []);

  // Track Fullscreen API state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fallback if container fullscreen fails on specific mobile browsers
      if (videoRef.current && 'webkitEnterFullscreen' in videoRef.current) {
        try {
          (videoRef.current as unknown as { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
        } catch {
          // Ignore
        }
      }
    }
  }, [videoRef]);

  // Keyboard shortcuts (guarded so focused sliders, buttons, inputs, or dialogs are never hijacked)
  useEffect(() => {
    if (!currentVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        if (target.closest('[role="dialog"]')) return;
        const tagName = target.tagName;
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          tagName === 'BUTTON' ||
          tagName === 'SUMMARY' ||
          target.isContentEditable ||
          target.closest('button, input, textarea, select, summary, [contenteditable="true"]')
        ) {
          return;
        }
      }

      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onTogglePlayPause();
        revealOverlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSeek(Math.max(0, currentTime - 5));
        revealOverlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSeek(Math.min(duration || 0, currentTime + 5));
        revealOverlay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onToggleMute();
        revealOverlay();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        revealOverlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentVideo,
    currentTime,
    duration,
    onTogglePlayPause,
    onSeek,
    onToggleMute,
    toggleFullscreen,
    revealOverlay,
  ]);

  const handleContainerFocusCapture = () => {
    setIsFocusInside(true);
    revealOverlay();
  };

  const handleContainerBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsFocusInside(false);
    }
  };

  // Controls stay visible when paused, ended, seeking/adjusting volume, focused, or showing an overlay state
  const controlsVisible =
    !isPlaying ||
    userActive ||
    isInteractingWithControls ||
    isFocusInside ||
    autoplayBlocked ||
    Boolean(playerError) ||
    !videoSrc;

  return (
    <div
      ref={containerRef}
      data-testid="video-player-container"
      onMouseMove={revealOverlay}
      onMouseEnter={revealOverlay}
      onMouseLeave={() => {
        if (isPlaying && !isInteractingWithControls && !isFocusInside) {
          setUserActive(false);
        }
      }}
      onTouchStart={revealOverlay}
      onFocusCapture={handleContainerFocusCapture}
      onBlurCapture={handleContainerBlurCapture}
      style={
        !isFullscreen && !isTheaterMode
          ? {
              maxHeight: 'var(--player-max-h)',
              maxWidth: 'min(100%, calc(var(--player-max-h) * 16 / 9))',
            }
          : undefined
      }
      className={`bg-black overflow-hidden flex items-center justify-center group select-none ${
        currentVideo && !controlsVisible ? 'cursor-none ' : ''
      }${
        isFullscreen
          ? 'relative w-screen h-screen max-w-none max-h-none rounded-none border-none'
          : isTheaterMode
          ? 'fixed inset-0 z-50 w-dvw h-dvh max-w-none max-h-none rounded-none border-none'
          : 'relative w-full mx-auto aspect-video rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-800/80'
      }`}
    >
      {currentVideo ? (
        <>
          <video
            ref={videoRef}
            src={videoSrc || undefined}
            className={`w-full h-full object-contain bg-black ${
              controlsVisible ? 'cursor-pointer' : 'cursor-none'
            }`}
            onClick={() => {
              revealOverlay();
              if (videoSrc && !playerError) {
                onTogglePlayPause();
              }
            }}
            onDoubleClick={toggleFullscreen}
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={onTimeUpdate}
            onPlay={onPlay}
            onPause={onPause}
            onSeeked={onSeeked}
            onVolumeChange={onNativeVolumeChange}
            onError={onError}
            onEnded={onEnded}
            playsInline
          />

          {/* Top Overlay Bar: Top-Left (1 of N + Relative Path) and Top-Right (Theater Mode + Autoplay On/Off) */}
          <div
            data-testid="video-top-overlay"
            inert={!controlsVisible ? true : undefined}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className={`absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-3 px-3.5 pt-3 pb-6 bg-gradient-to-b from-black/85 via-black/45 to-transparent transition-opacity duration-200 ${
              controlsVisible
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Top-Left: Position badge + full relative path */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {totalCount > 0 && currentIndex >= 0 && (
                <span
                  data-testid="video-position-badge"
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-black/65 text-indigo-300 border border-white/15 backdrop-blur-md shrink-0 tabular-nums"
                >
                  {currentIndex + 1} of {totalCount}
                </span>
              )}
              <span
                data-testid="video-relative-path"
                title={currentVideo.relativePath}
                className="text-xs sm:text-sm font-medium text-slate-100 truncate drop-shadow-sm"
              >
                {currentVideo.relativePath}
              </span>
            </div>

            {/* Top-Right: Icon-only Theater Mode & Autoplay On/Off */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                data-testid="theater-mode-button"
                onClick={onToggleTheaterMode}
                aria-label={isTheaterMode ? 'Exit Theater Mode' : 'Theater Mode'}
                aria-pressed={isTheaterMode}
                title={isTheaterMode ? 'Exit Theater Mode (Esc)' : 'Theater Mode'}
                className={`p-2 rounded-lg backdrop-blur-md border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  isTheaterMode
                    ? 'bg-indigo-600/90 hover:bg-indigo-500 text-white border-indigo-400/50'
                    : 'bg-black/60 hover:bg-black/80 text-slate-200 hover:text-white border-white/15'
                }`}
              >
                {isTheaterMode ? <Minimize2 className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
              </button>

              <button
                type="button"
                data-testid="autoplay-toggle-button"
                onClick={onToggleAutoplayNext}
                aria-label={autoplayNext ? 'Autoplay Next: On' : 'Autoplay Next: Off'}
                aria-pressed={autoplayNext}
                title={autoplayNext ? 'Autoplay Next: On' : 'Autoplay Next: Off'}
                className={`p-2 rounded-lg backdrop-blur-md border transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  autoplayNext
                    ? 'bg-indigo-600/90 hover:bg-indigo-500 text-white border-indigo-400/50'
                    : 'bg-black/60 hover:bg-black/80 text-slate-400 hover:text-slate-200 border-white/15'
                }`}
              >
                <ListVideo className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Integrated Bottom Video Controls */}
          <VideoControls
            visible={controlsVisible}
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            volume={volume}
            muted={muted}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
            isFullscreen={isFullscreen}
            onTogglePlayPause={onTogglePlayPause}
            onSeek={onSeek}
            onPlayPrevious={onPlayPrevious}
            onPlayNext={onPlayNext}
            onToggleMute={onToggleMute}
            onVolumeChange={onVolumeChange}
            onToggleFullscreen={toggleFullscreen}
            onInteractionChange={setIsInteractingWithControls}
          />

          {/* Autoplay Blocked Overlay */}
          {autoplayBlocked && !isPlaying && !playerError && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 z-10">
              <button
                type="button"
                onClick={onManualPlay}
                className="group/btn flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-900/90 hover:bg-indigo-600/90 border border-slate-700/80 hover:border-indigo-400/50 text-white shadow-2xl transition-all duration-200 cursor-pointer transform hover:scale-105"
              >
                <div className="w-16 h-16 rounded-full bg-indigo-500 group-hover/btn:bg-white group-hover/btn:text-indigo-600 flex items-center justify-center shadow-lg transition-colors">
                  <Play className="w-8 h-8 fill-current ml-1" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-base">Click to Start Playback</p>
                  <p className="text-xs text-slate-300 group-hover/btn:text-indigo-100 mt-0.5">
                    Browser prevented automatic playback
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Error Overlay */}
          {playerError && (
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10">
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-slate-100 font-semibold text-base mb-1">Playback Issue</h3>
              <p className="text-slate-400 text-xs sm:text-sm max-w-md leading-relaxed">
                {playerError}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-500 p-8 text-center">
          <Film className="w-12 h-12 mb-3 stroke-[1.5] text-slate-600" />
          <p className="text-sm font-medium text-slate-400">Select a video from the playlist</p>
        </div>
      )}
    </div>
  );
};
