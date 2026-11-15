import { DEFAULT_FEEDBACK_TIMING } from '../config/controlSettings';

export type FeedbackIcon =
  | 'play'
  | 'pause'
  | 'fast-forward'
  | 'rewind'
  | 'speed'
  | 'volume-up'
  | 'volume-down'
  | 'volume-muted';

export interface FeedbackMessage {
  id: number;
  icon: FeedbackIcon;
  label: string;
}

export interface SeekAccumulatorState {
  direction: -1 | 1;
  totalSeconds: number;
  timestamp: number;
}

/**
 * Formats a signed seek delta in seconds (e.g., "+5s", "-30s", "+1.5s").
 */
export function formatSeekSeconds(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}s`;
}

/**
 * Formats a playback rate multiplier (e.g., "1.25×", "2×").
 */
export function formatPlaybackRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return `${rounded}×`;
}

/**
 * Formats a 0..1 volume value as a percentage string (e.g., "65%").
 */
export function formatVolumePercent(volume: number): string {
  const clamped = Math.max(0, Math.min(1, volume));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Accumulates consecutive seek deltas in the same direction within the
 * configured accumulation window, resetting on opposite direction or timeout.
 */
export function accumulateSeek(
  previous: SeekAccumulatorState | null,
  deltaSeconds: number,
  now: number,
  accumulationWindowMs: number = DEFAULT_FEEDBACK_TIMING.accumulationWindowMs
): SeekAccumulatorState {
  const direction: -1 | 1 = deltaSeconds >= 0 ? 1 : -1;
  const withinWindow =
    previous !== null &&
    previous.direction === direction &&
    now - previous.timestamp <= accumulationWindowMs;

  const totalSeconds = withinWindow ? previous.totalSeconds + deltaSeconds : deltaSeconds;
  return {
    direction,
    totalSeconds,
    timestamp: now,
  };
}

/**
 * Pure timer controller for HUD display & fade lifecycle.
 * Useful for both React components and deterministic timer unit tests.
 */
export function scheduleFeedbackTimers(
  onFade: () => void,
  onHide: () => void,
  displayDurationMs: number = DEFAULT_FEEDBACK_TIMING.displayDurationMs,
  fadeDurationMs: number = DEFAULT_FEEDBACK_TIMING.fadeDurationMs
): () => void {
  const fadeTimer = setTimeout(onFade, displayDurationMs);
  const hideTimer = setTimeout(onHide, displayDurationMs + fadeDurationMs);

  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(hideTimer);
  };
}
