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
