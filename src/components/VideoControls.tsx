import React, { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Minimize,
} from 'lucide-react';
import { formatDuration } from '../utils/formatters';
import { Tooltip } from './Tooltip';

interface VideoControlsProps {
  visible: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  isFullscreen: boolean;
  onTogglePlayPause: () => void;
  onSeek: (time: number) => void;
  onPlayPrevious: () => void;
  onPlayNext: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleFullscreen: () => void;
  onInteractionChange: (interacting: boolean) => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  visible,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  hasNext,
  hasPrevious,
  isFullscreen,
  onTogglePlayPause,
  onSeek,
  onPlayPrevious,
  onPlayNext,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onInteractionChange,
}) => {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [isAdjustingVolume, setIsAdjustingVolume] = useState(false);

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const displayTime =
    isScrubbing && scrubTime !== null
      ? Math.max(0, Math.min(scrubTime, safeDuration))
      : Math.max(0, Math.min(currentTime, safeDuration || currentTime || 0));

  const seekProgressPercent =
    safeDuration > 0 ? Math.min(100, Math.max(0, (displayTime / safeDuration) * 100)) : 0;

  const effectiveVolume = muted ? 0 : Math.max(0, Math.min(1, volume));
  const volumePercent = Math.round(effectiveVolume * 100);

  useEffect(() => {
    onInteractionChange(isScrubbing || isAdjustingVolume);
  }, [isScrubbing, isAdjustingVolume, onInteractionChange]);

  const stopScrubbing = useCallback(() => {
    setIsScrubbing(false);
    setScrubTime(null);
  }, []);

  const stopVolumeAdjust = useCallback(() => {
    setIsAdjustingVolume(false);
  }, []);

  useEffect(() => {
    if (!isScrubbing && !isAdjustingVolume) return;

    const handleGlobalPointerEnd = () => {
      if (isScrubbing) {
        setIsScrubbing(false);
        setScrubTime(null);
      }
      if (isAdjustingVolume) {
        setIsAdjustingVolume(false);
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerEnd);
    window.addEventListener('pointercancel', handleGlobalPointerEnd);
    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerEnd);
      window.removeEventListener('pointercancel', handleGlobalPointerEnd);
    };
  }, [isScrubbing, isAdjustingVolume]);

  const handleSeekInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = parseFloat(e.target.value);
    if (!Number.isFinite(nextTime)) return;
    if (isScrubbing) {
      setScrubTime(nextTime);
    }
    onSeek(nextTime);
  };

  const handleVolumeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVol = parseFloat(e.target.value);
    if (!Number.isFinite(nextVol)) return;
    onVolumeChange(nextVol);
  };

  const VolumeIcon = muted || effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      data-testid="video-bottom-controls"
      inert={!visible ? true : undefined}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3.5 pt-8 pb-3 transition-opacity duration-200 select-none ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Top row of bottom overlay: Left (Play/Pause + Time), Centre (Prev/Next), Right (Mute/Volume/Fullscreen) */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2">
        {/* Left: Play/Pause + Time */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Tooltip
            content={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            placement="top"
            disabled={!visible}
          >
            <button
              type="button"
              data-testid="play-pause-button"
              onClick={onTogglePlayPause}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          </Tooltip>

          <span
            data-testid="playback-time"
            className="text-xs font-mono font-medium text-slate-200 tabular-nums whitespace-nowrap"
          >
            {formatDuration(displayTime)} <span className="text-slate-400">/</span>{' '}
            {formatDuration(safeDuration)}
          </span>
        </div>

        {/* Centre: Previous and Next episode icons */}
        <div className="flex items-center justify-center gap-1.5">
          <Tooltip
            content="Previous episode"
            placement="top"
            disabled={!visible || !hasPrevious}
          >
            <button
              type="button"
              data-testid="prev-video-button"
              onClick={onPlayPrevious}
              disabled={!hasPrevious}
              aria-label="Previous episode"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10 disabled:cursor-not-allowed text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content="Next episode"
            placement="top"
            disabled={!visible || !hasNext}
          >
            <button
              type="button"
              data-testid="next-video-button"
              onClick={onPlayNext}
              disabled={!hasNext}
              aria-label="Next episode"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-35 disabled:hover:bg-white/10 disabled:cursor-not-allowed text-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        {/* Right: Mute, Volume, and Fullscreen */}
        <div className="flex items-center justify-end gap-2 min-w-0">
          <Tooltip
            content={muted || effectiveVolume === 0 ? 'Unmute (M)' : 'Mute (M)'}
            placement="top"
            disabled={!visible}
          >
            <button
              type="button"
              data-testid="mute-toggle-button"
              onClick={onToggleMute}
              aria-label={muted || effectiveVolume === 0 ? 'Unmute' : 'Mute'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <VolumeIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <input
            type="range"
            data-testid="volume-slider"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.02}
            value={effectiveVolume}
            onPointerDown={() => setIsAdjustingVolume(true)}
            onPointerUp={stopVolumeAdjust}
            onPointerCancel={stopVolumeAdjust}
            onBlur={stopVolumeAdjust}
            onChange={handleVolumeInput}
            style={{
              background: `linear-gradient(to right, rgb(99 102 241) ${volumePercent}%, rgba(255,255,255,0.25) ${volumePercent}%)`,
            }}
            className="w-12 sm:w-20 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          />

          <Tooltip
            content={isFullscreen ? 'Exit Fullscreen (F)' : 'Fullscreen (F)'}
            placement="top"
            disabled={!visible}
          >
            <button
              type="button"
              data-testid="fullscreen-toggle-button"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Bottom: Interactive seek/progress bar */}
      <div className="w-full flex items-center pt-0.5">
        <input
          type="range"
          data-testid="seek-slider"
          aria-label="Seek video timeline"
          min={0}
          max={safeDuration > 0 ? safeDuration : 100}
          step="any"
          disabled={safeDuration <= 0}
          value={safeDuration > 0 ? displayTime : 0}
          onPointerDown={() => {
            setIsScrubbing(true);
            setScrubTime(displayTime);
          }}
          onPointerUp={stopScrubbing}
          onPointerCancel={stopScrubbing}
          onBlur={stopScrubbing}
          onChange={handleSeekInput}
          style={{
            background: `linear-gradient(to right, rgb(99 102 241) ${seekProgressPercent}%, rgba(255,255,255,0.25) ${seekProgressPercent}%)`,
          }}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer disabled:cursor-not-allowed accent-indigo-500 hover:h-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
      </div>
    </div>
  );
};
