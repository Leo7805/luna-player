import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  AlertCircle,
  Film,
  Tv,
} from 'lucide-react';
import { VideoItem } from '../types/video';
import { VideoControls } from './VideoControls';
import { Tooltip } from './Tooltip';
import { FeedbackHud } from './FeedbackHud';
import {
  DEFAULT_CONTROL_SETTINGS,
  type ControlSettings,
} from '../config/controlSettings';
import {
  resolveShortcutAction,
  isInteractiveOrEditableTarget,
  hasBlockingModalOpen,
  blurButtonAfterPointerClick,
} from '../utils/shortcuts';
import {
  accumulateSeek,
  formatPlaybackRate,
  formatSeekSeconds,
  formatVolumePercent,
  type FeedbackIcon,
  type FeedbackMessage,
  type SeekAccumulatorState,
} from '../utils/feedbackHud';

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
  controlSettings?: ControlSettings;
  onToggleTheaterMode: () => void;
  onToggleAutoplayNext: () => void;
  onTogglePlayPause: () => 'play' | 'pause' | null | void;
  onSeek: (time: number) => void;
  onSeekBy: (deltaSeconds: number) => boolean | void;
  onSeekToStart: () => boolean | void;
  onSeekToEnd: () => boolean | void;
  onAdjustPlaybackRate: (direction: -1 | 1) => number;
  onToggleMaxPlaybackRate: () => number;
  onNativeRateChange: () => void;
  onPlayNext: () => void;
  onPlayPrevious: () => void;
  onToggleMute: () => { muted: boolean; volume: number } | void;
  onVolumeChange: (volume: number) => void;
  onAdjustVolume: (direction: -1 | 1) => number;
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
  controlSettings = DEFAULT_CONTROL_SETTINGS,
  onToggleTheaterMode,
  onToggleAutoplayNext,
  onTogglePlayPause,
  onSeek,
  onSeekBy,
  onSeekToStart,
  onSeekToEnd,
  onAdjustPlaybackRate,
  onToggleMaxPlaybackRate,
  onNativeRateChange,
  onPlayNext,
  onPlayPrevious,
  onToggleMute,
  onVolumeChange,
  onAdjustVolume,
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
  const wasControlsHiddenOnTouchRef = useRef(false);
  const lastTouchStartAtRef = useRef(0);
  const [hudFeedback, setHudFeedback] = useState<FeedbackMessage | null>(null);
  const hudIdRef = useRef(0);
  const seekAccumulatorRef = useRef<SeekAccumulatorState | null>(null);

  const showHud = useCallback((icon: FeedbackIcon, label: string) => {
    setHudFeedback({ id: ++hudIdRef.current, icon, label });
  }, []);

  const handleDismissHud = useCallback(() => {
    setHudFeedback(null);
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideControlsTimerRef.current) {
      window.clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  }, []);

  const revealOverlay = useCallback(() => {
    setUserActive(true);
    clearHideTimer();
    const delayMs = isPlaying ? 2500 : 4000;
    hideControlsTimerRef.current = window.setTimeout(() => {
      setUserActive(false);
    }, delayMs);
  }, [isPlaying, clearHideTimer]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  // Restart inactivity timer on playback state or video changes, and pause timer while interacting/focused
  useEffect(() => {
    if (isInteractingWithControls || isFocusInside) {
      setUserActive(true);
      clearHideTimer();
    } else {
      revealOverlay();
    }
  }, [isPlaying, currentVideo?.id, isInteractingWithControls, isFocusInside, revealOverlay, clearHideTimer]);

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

  // Keyboard shortcuts (guarded against blocking modals, interactive/editable controls, modifiers, and IME)
  useEffect(() => {
    if (!currentVideo) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasBlockingModalOpen()) return;
      if (isInteractiveOrEditableTarget(e.target)) return;

      const resolved = resolveShortcutAction(e);
      if (!resolved) return;

      e.preventDefault();
      if (resolved.suppressedRepeat) return;

      const { seek } = controlSettings;

      const handleRelativeSeek = (deltaSeconds: number) => {
        const didSeek = onSeekBy(deltaSeconds);
        if (didSeek !== false) {
          const accumulated = accumulateSeek(seekAccumulatorRef.current, deltaSeconds, Date.now());
          seekAccumulatorRef.current = accumulated;
          showHud(
            accumulated.totalSeconds >= 0 ? 'fast-forward' : 'rewind',
            formatSeekSeconds(accumulated.totalSeconds)
          );
        }
      };

      switch (resolved.action) {
        case 'toggle-playback': {
          seekAccumulatorRef.current = null;
          const result = onTogglePlayPause();
          if (result === 'play') {
            showHud('play', 'Playing');
          } else if (result === 'pause') {
            showHud('pause', 'Paused');
          }
          break;
        }
        case 'decrease-playback-rate': {
          seekAccumulatorRef.current = null;
          const appliedRate = onAdjustPlaybackRate(-1);
          showHud('speed', formatPlaybackRate(appliedRate));
          break;
        }
        case 'increase-playback-rate': {
          seekAccumulatorRef.current = null;
          const appliedRate = onAdjustPlaybackRate(1);
          showHud('speed', formatPlaybackRate(appliedRate));
          break;
        }
        case 'toggle-max-playback-rate': {
          seekAccumulatorRef.current = null;
          const appliedRate = onToggleMaxPlaybackRate();
          showHud('speed', formatPlaybackRate(appliedRate));
          break;
        }
        case 'decrease-volume': {
          seekAccumulatorRef.current = null;
          const appliedVolume = onAdjustVolume(-1);
          showHud('volume-down', formatVolumePercent(appliedVolume));
          break;
        }
        case 'increase-volume': {
          seekAccumulatorRef.current = null;
          const appliedVolume = onAdjustVolume(1);
          showHud('volume-up', formatVolumePercent(appliedVolume));
          break;
        }
        case 'toggle-muted': {
          seekAccumulatorRef.current = null;
          const muteResult = onToggleMute();
          if (muteResult) {
            showHud(
              muteResult.muted ? 'volume-muted' : 'volume-up',
              muteResult.muted ? 'Muted' : formatVolumePercent(muteResult.volume)
            );
          }
          break;
        }
        case 'seek-backward-fine':
          handleRelativeSeek(-seek.fineSeconds);
          break;
        case 'seek-forward-fine':
          handleRelativeSeek(seek.fineSeconds);
          break;
        case 'seek-backward':
          handleRelativeSeek(-seek.nearSeconds);
          break;
        case 'seek-forward':
          handleRelativeSeek(seek.nearSeconds);
          break;
        case 'seek-backward-far':
          handleRelativeSeek(-seek.farSeconds);
          break;
        case 'seek-forward-far':
          handleRelativeSeek(seek.farSeconds);
          break;
        case 'seek-start':
          seekAccumulatorRef.current = null;
          if (onSeekToStart() !== false) {
            showHud('rewind', 'Start');
          }
          break;
        case 'seek-end':
          seekAccumulatorRef.current = null;
          if (onSeekToEnd() !== false) {
            showHud('fast-forward', 'End');
          }
          break;
        case 'toggle-fullscreen':
          seekAccumulatorRef.current = null;
          toggleFullscreen();
          break;
      }

      revealOverlay();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    currentVideo,
    controlSettings.seek,
    onTogglePlayPause,
    onSeekBy,
    onSeekToStart,
    onSeekToEnd,
    onAdjustPlaybackRate,
    onToggleMaxPlaybackRate,
    onAdjustVolume,
    onToggleMute,
    toggleFullscreen,
    revealOverlay,
    showHud,
  ]);

  const handleContainerFocusCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    let isKeyboardFocus = false;
    if (target) {
      try {
        isKeyboardFocus = target.matches(':focus-visible');
      } catch {
        isKeyboardFocus = false;
      }
    }
    setIsFocusInside(isKeyboardFocus);
    revealOverlay();
  };

  const handleContainerBlurCapture = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsFocusInside(false);
    }
  };

  const isVideoEnded = Boolean(videoRef.current?.ended);

  // Controls stay visible while active, interacting, keyboard-focused, ended, autoplay-blocked, or in error/empty state
  const controlsVisible =
    userActive ||
    isInteractingWithControls ||
    isFocusInside ||
    isVideoEnded ||
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
        if (!isInteractingWithControls && !isFocusInside) {
          clearHideTimer();
          setUserActive(false);
        }
      }}
      onTouchStart={() => {
        wasControlsHiddenOnTouchRef.current = !controlsVisible;
        lastTouchStartAtRef.current = Date.now();
        revealOverlay();
      }}
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
              const isTouchReveal =
                wasControlsHiddenOnTouchRef.current &&
                Date.now() - lastTouchStartAtRef.current < 800;
              wasControlsHiddenOnTouchRef.current = false;
              revealOverlay();
              if (isTouchReveal) {
                return;
              }
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
            onRateChange={onNativeRateChange}
            onError={onError}
            onEnded={onEnded}
            playsInline
          />

          <FeedbackHud feedback={hudFeedback} onDismiss={handleDismissHud} />

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
              <Tooltip
                content={isTheaterMode ? 'Exit Theater Mode (Esc)' : 'Enter Theater Mode'}
                placement="bottom"
                disabled={!controlsVisible}
              >
                <button
                  type="button"
                  data-testid="theater-mode-button"
                  onClick={(e) => {
                    blurButtonAfterPointerClick(e);
                    onToggleTheaterMode();
                  }}
                  aria-label={isTheaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
                  aria-pressed={isTheaterMode}
                  className={`p-2 rounded-lg bg-transparent border-0 shadow-none transition-colors cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    isTheaterMode
                      ? 'text-indigo-500 hover:text-indigo-400'
                      : 'text-white/90 hover:text-white'
                  }`}
                >
                  <Tv className="w-4 h-4" />
                </button>
              </Tooltip>

              <Tooltip
                content={autoplayNext ? 'Autoplay Next: On' : 'Autoplay Next: Off'}
                placement="bottom"
                disabled={!controlsVisible}
              >
                <button
                  type="button"
                  data-testid="autoplay-toggle-button"
                  onClick={(e) => {
                    blurButtonAfterPointerClick(e);
                    onToggleAutoplayNext();
                  }}
                  aria-label={autoplayNext ? 'Autoplay Next: On' : 'Autoplay Next: Off'}
                  aria-pressed={autoplayNext}
                  className={`p-2 rounded-lg bg-transparent border-0 shadow-none transition-colors cursor-pointer drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    autoplayNext
                      ? 'text-indigo-500 hover:text-indigo-400'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <svg
                    viewBox="0 0 24 14"
                    className="w-5 h-3.5 block"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="22"
                      height="12"
                      rx="6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      fill="currentColor"
                      fillOpacity={autoplayNext ? 0.18 : 0}
                    />
                    <circle
                      cx={autoplayNext ? 17 : 7}
                      cy="7"
                      r="4.2"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </Tooltip>
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
                onClick={(e) => {
                  blurButtonAfterPointerClick(e);
                  onManualPlay();
                }}
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
