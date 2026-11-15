export interface SeekControlSettings {
  fineSeconds: number;
  nearSeconds: number;
  farSeconds: number;
}

export interface PlaybackRateControlSettings {
  default: number;
  step: number;
  min: number;
  max: number;
}

export interface VolumeControlSettings {
  step: number;
  min: number;
  max: number;
  defaultUnmuted: number;
}

export interface ControlSettings {
  seek: SeekControlSettings;
  playbackRate: PlaybackRateControlSettings;
  volume: VolumeControlSettings;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  seek: {
    fineSeconds: 1,
    nearSeconds: 5,
    farSeconds: 30,
  },
  playbackRate: {
    default: 1,
    step: 0.25,
    min: 0.25,
    max: 5,
  },
  volume: {
    step: 0.05,
    min: 0,
    max: 1,
    defaultUnmuted: 0.6,
  },
};

export const END_SEEK_OFFSET_SECONDS = 0.5;
export const PLAYBACK_RATE_EPSILON = 0.001;

export interface FeedbackTimingSettings {
  accumulationWindowMs: number;
  displayDurationMs: number;
  fadeDurationMs: number;
}

export const DEFAULT_FEEDBACK_TIMING: FeedbackTimingSettings = {
  accumulationWindowMs: 1000,
  displayDurationMs: 600,
  fadeDurationMs: 400,
};

export const CONTROL_LIMITS = {
  playbackRate: {
    minRate: 0.1,
    maxRate: 10,
    minStep: 0.05,
    maxStep: 1,
  },
  seek: {
    fineMin: 0.1,
    fineMax: 5,
    nearMin: 1,
    nearMax: 60,
    farMin: 5,
    farMax: 300,
  },
  volume: {
    minStepExclusive: 0,
    maxStep: 1,
  },
} as const;

export function cloneDefaultControlSettings(): ControlSettings {
  return {
    seek: { ...DEFAULT_CONTROL_SETTINGS.seek },
    playbackRate: { ...DEFAULT_CONTROL_SETTINGS.playbackRate },
    volume: { ...DEFAULT_CONTROL_SETTINGS.volume },
  };
}

export function getPlaybackRateStepValidationError(step: number): string | null {
  const { minStep, maxStep } = CONTROL_LIMITS.playbackRate;
  if (!Number.isFinite(step) || step < minStep || step > maxStep) {
    return `Speed step must be between ${minStep}× and ${maxStep}×.`;
  }
  return null;
}

export function getPlaybackRateRangeValidationError(min: number, max: number): string | null {
  const { minRate, maxRate } = CONTROL_LIMITS.playbackRate;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min < minRate ||
    max > maxRate
  ) {
    return `Speed minimum and maximum must be between ${minRate}× and ${maxRate}×.`;
  }
  if (min >= max) {
    return 'Minimum speed must be less than maximum speed.';
  }
  if (min > 1 || max < 1) {
    return 'Speed range must include 1×.';
  }
  return null;
}

export function getSeekDurationValidationError(
  fineSeconds: number,
  nearSeconds: number,
  farSeconds: number
): string | null {
  const { fineMin, fineMax, nearMin, nearMax, farMin, farMax } = CONTROL_LIMITS.seek;
  if (!Number.isFinite(fineSeconds) || fineSeconds < fineMin || fineSeconds > fineMax) {
    return `Fine seek must be between ${fineMin} and ${fineMax} seconds.`;
  }
  if (!Number.isFinite(nearSeconds) || nearSeconds < nearMin || nearSeconds > nearMax) {
    return `Medium seek must be between ${nearMin} and ${nearMax} seconds.`;
  }
  if (!Number.isFinite(farSeconds) || farSeconds < farMin || farSeconds > farMax) {
    return `Large seek must be between ${farMin} and ${farMax} seconds.`;
  }
  if (!(fineSeconds < nearSeconds && nearSeconds < farSeconds)) {
    return 'Seek durations must satisfy Fine < Medium < Large.';
  }
  return null;
}

export function getVolumeStepValidationError(step: number): string | null {
  const { minStepExclusive, maxStep } = CONTROL_LIMITS.volume;
  if (!Number.isFinite(step) || step <= minStepExclusive || step > maxStep) {
    return 'Volume step must be greater than 0% and at most 100%.';
  }
  return null;
}

/**
 * Safely sanitizes untrusted/partial/corrupted control settings into a valid ControlSettings object.
 */
export function sanitizeControlSettings(raw: unknown): ControlSettings {
  const defaults = cloneDefaultControlSettings();
  if (!raw || typeof raw !== 'object') {
    return defaults;
  }

  const candidate = raw as Record<string, unknown>;

  // Seek
  let seek = defaults.seek;
  if (candidate.seek && typeof candidate.seek === 'object') {
    const s = candidate.seek as Record<string, unknown>;
    const fine = Number(s.fineSeconds);
    const near = Number(s.nearSeconds);
    const far = Number(s.farSeconds);
    if (getSeekDurationValidationError(fine, near, far) === null) {
      seek = { fineSeconds: fine, nearSeconds: near, farSeconds: far };
    }
  }

  // Playback Rate
  let playbackRate = defaults.playbackRate;
  if (candidate.playbackRate && typeof candidate.playbackRate === 'object') {
    const p = candidate.playbackRate as Record<string, unknown>;
    const step = Number(p.step);
    const min = Number(p.min);
    const max = Number(p.max);
    if (
      getPlaybackRateStepValidationError(step) === null &&
      getPlaybackRateRangeValidationError(min, max) === null
    ) {
      playbackRate = {
        default: DEFAULT_CONTROL_SETTINGS.playbackRate.default,
        step,
        min,
        max,
      };
    }
  }

  // Volume
  let volume = defaults.volume;
  if (candidate.volume && typeof candidate.volume === 'object') {
    const v = candidate.volume as Record<string, unknown>;
    const step = Number(v.step);
    if (getVolumeStepValidationError(step) === null) {
      volume = {
        ...defaults.volume,
        step,
      };
    }
  }

  return { seek, playbackRate, volume };
}
