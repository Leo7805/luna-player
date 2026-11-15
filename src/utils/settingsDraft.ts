import {
  cloneDefaultControlSettings,
  getPlaybackRateRangeValidationError,
  getPlaybackRateStepValidationError,
  getSeekDurationValidationError,
  getVolumeStepValidationError,
  type ControlSettings,
} from '../config/controlSettings';

export interface SettingsDraft {
  speedStep: string;
  speedMin: string;
  speedMax: string;
  fineSeconds: string;
  nearSeconds: string;
  farSeconds: string;
  volumeStepPercent: string;
}

export interface SettingsValidationErrors {
  speedStep: string | null;
  speedRange: string | null;
  seek: string | null;
  volumeStep: string | null;
}

function formatCompact(value: number): string {
  return String(Number(value.toFixed(4)));
}

export function createSettingsDraft(settings: ControlSettings): SettingsDraft {
  return {
    speedStep: formatCompact(settings.playbackRate.step),
    speedMin: formatCompact(settings.playbackRate.min),
    speedMax: formatCompact(settings.playbackRate.max),
    fineSeconds: formatCompact(settings.seek.fineSeconds),
    nearSeconds: formatCompact(settings.seek.nearSeconds),
    farSeconds: formatCompact(settings.seek.farSeconds),
    volumeStepPercent: formatCompact(settings.volume.step * 100),
  };
}

export function createDefaultSettingsDraft(): SettingsDraft {
  return createSettingsDraft(cloneDefaultControlSettings());
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateSettingsDraft(draft: SettingsDraft): {
  errors: SettingsValidationErrors;
  isValid: boolean;
  parsed: ControlSettings | null;
} {
  const speedStepNum = parseNumber(draft.speedStep);
  const speedMinNum = parseNumber(draft.speedMin);
  const speedMaxNum = parseNumber(draft.speedMax);
  const fineNum = parseNumber(draft.fineSeconds);
  const nearNum = parseNumber(draft.nearSeconds);
  const farNum = parseNumber(draft.farSeconds);
  const volumePercentNum = parseNumber(draft.volumeStepPercent);

  const speedStepError =
    speedStepNum === null
      ? 'Enter a valid speed step.'
      : getPlaybackRateStepValidationError(speedStepNum);

  const speedRangeError =
    speedMinNum === null || speedMaxNum === null
      ? 'Enter valid minimum and maximum speeds.'
      : getPlaybackRateRangeValidationError(speedMinNum, speedMaxNum);

  const seekError =
    fineNum === null || nearNum === null || farNum === null
      ? 'Enter valid seek durations.'
      : getSeekDurationValidationError(fineNum, nearNum, farNum);

  const volumeStepFraction = volumePercentNum === null ? null : volumePercentNum / 100;
  const volumeStepError =
    volumeStepFraction === null
      ? 'Enter a valid volume step.'
      : getVolumeStepValidationError(volumeStepFraction);

  const errors: SettingsValidationErrors = {
    speedStep: speedStepError,
    speedRange: speedRangeError,
    seek: seekError,
    volumeStep: volumeStepError,
  };

  const isValid =
    speedStepError === null &&
    speedRangeError === null &&
    seekError === null &&
    volumeStepError === null;

  if (!isValid) {
    return { errors, isValid: false, parsed: null };
  }

  return {
    errors,
    isValid: true,
    parsed: {
      playbackRate: {
        default: 1,
        step: speedStepNum!,
        min: speedMinNum!,
        max: speedMaxNum!,
      },
      seek: {
        fineSeconds: fineNum!,
        nearSeconds: nearNum!,
        farSeconds: farNum!,
      },
      volume: {
        step: Number(volumeStepFraction!.toFixed(4)),
        min: 0,
        max: 1,
        defaultUnmuted: 0.6,
      },
    },
  };
}
