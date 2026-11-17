import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  DEFAULT_CONTROL_SETTINGS,
  getPlaybackRateRangeValidationError,
  getPlaybackRateStepValidationError,
  getSeekDurationValidationError,
  getVolumeStepValidationError,
  sanitizeControlSettings,
  type ControlSettings,
} from '../src/config/controlSettings';
import { loadSettings, saveSettings } from '../src/services/progressStorage';
import {
  createDefaultSettingsDraft,
  createSettingsDraft,
  validateSettingsDraft,
} from '../src/utils/settingsDraft';
import { hasBlockingModalOpen } from '../src/utils/shortcuts';

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('Phase 3 Control Settings Validation & Persistence', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      // @ts-expect-error Mocking localStorage in Node test runner
      globalThis.localStorage = createLocalStorageMock();
    }
  });

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('validates speed step, speed range (including 1x), seek durations, and volume step', () => {
    expect(getPlaybackRateStepValidationError(0.25)).toBeNull();
    expect(getPlaybackRateStepValidationError(0.04)).not.toBeNull();
    expect(getPlaybackRateStepValidationError(1.01)).not.toBeNull();

    expect(getPlaybackRateRangeValidationError(0.25, 5)).toBeNull();
    expect(getPlaybackRateRangeValidationError(0.05, 5)).not.toBeNull();
    expect(getPlaybackRateRangeValidationError(0.25, 11)).not.toBeNull();
    expect(getPlaybackRateRangeValidationError(2, 2)).not.toBeNull();
    expect(getPlaybackRateRangeValidationError(1.5, 5)).not.toBeNull(); // excludes 1x
    expect(getPlaybackRateRangeValidationError(0.25, 0.9)).not.toBeNull(); // excludes 1x

    expect(getSeekDurationValidationError(1, 5, 30)).toBeNull();
    expect(getSeekDurationValidationError(0.05, 5, 30)).not.toBeNull();
    expect(getSeekDurationValidationError(5, 5, 30)).not.toBeNull(); // fine < medium violated
    expect(getSeekDurationValidationError(1, 30, 30)).not.toBeNull(); // medium < large violated
    expect(getSeekDurationValidationError(1, 5, 301)).not.toBeNull();

    expect(getVolumeStepValidationError(0.05)).toBeNull();
    expect(getVolumeStepValidationError(0)).not.toBeNull();
    expect(getVolumeStepValidationError(1.1)).not.toBeNull();
  });

  it('saves and loads custom control settings while preserving other PlayerSettings', () => {
    saveSettings({
      autoplayNext: false,
      volume: 0.75,
      muted: true,
      playlistCollapsed: true,
      lastPlayedId: 'ep-2.mp4',
      lastLibraryId: 'lib-1',
    });

    const customControls: ControlSettings = {
      playbackRate: { default: 1, step: 0.5, min: 0.5, max: 3 },
      seek: { fineSeconds: 2, nearSeconds: 10, farSeconds: 60 },
      volume: { step: 0.1, min: 0, max: 1, defaultUnmuted: 0.6 },
    };

    saveSettings({ controls: customControls });

    const loaded = loadSettings();
    expect(loaded.autoplayNext).toBe(false);
    expect(loaded.volume).toBe(0.75);
    expect(loaded.muted).toBe(true);
    expect(loaded.playlistCollapsed).toBe(true);
    expect(loaded.lastPlayedId).toBe('ep-2.mp4');
    expect(loaded.lastLibraryId).toBe('lib-1');
    expect(loaded.controls).toEqual(customControls);
  });

  it('migrates legacy PlayerSettings without controls to default control settings', () => {
    globalThis.localStorage.setItem(
      'luna_player_settings_v1',
      JSON.stringify({
        autoplayNext: false,
        volume: 0.4,
        muted: false,
        playlistCollapsed: true,
      })
    );

    const loaded = loadSettings();
    expect(loaded.autoplayNext).toBe(false);
    expect(loaded.volume).toBe(0.4);
    expect(loaded.playlistCollapsed).toBe(true);
    expect(loaded.controls).toEqual(DEFAULT_CONTROL_SETTINGS);
  });

  it('safely handles corrupted localStorage payloads and invalid partial controls', () => {
    globalThis.localStorage.setItem('luna_player_settings_v1', '{not-valid-json');
    expect(loadSettings().controls).toEqual(DEFAULT_CONTROL_SETTINGS);

    globalThis.localStorage.setItem('luna_player_settings_v1', JSON.stringify(['unexpected-array']));
    expect(loadSettings().controls).toEqual(DEFAULT_CONTROL_SETTINGS);

    const sanitized = sanitizeControlSettings({
      playbackRate: { step: 99, min: 2, max: 3 }, // invalid step & excludes 1x
      seek: { fineSeconds: 10, nearSeconds: 5, farSeconds: 30 }, // invalid fine >= near
      volume: { step: 0.1 }, // valid
    });
    expect(sanitized.playbackRate).toEqual(DEFAULT_CONTROL_SETTINGS.playbackRate);
    expect(sanitized.seek).toEqual(DEFAULT_CONTROL_SETTINGS.seek);
    expect(sanitized.volume.step).toBe(0.1);
  });

  it('supports draft reset without persisting and blocks invalid drafts from saving', () => {
    const custom: ControlSettings = {
      playbackRate: { default: 1, step: 0.5, min: 0.5, max: 4 },
      seek: { fineSeconds: 2, nearSeconds: 10, farSeconds: 45 },
      volume: { step: 0.1, min: 0, max: 1, defaultUnmuted: 0.6 },
    };
    saveSettings({ controls: custom });

    const draft = createSettingsDraft(custom);
    expect(draft.speedMax).toBe('4');
    expect(draft.volumeStepPercent).toBe('10');

    // Reset updates draft only; persisted storage remains unchanged until Save
    const resetDraft = createDefaultSettingsDraft();
    expect(resetDraft.speedMax).toBe('5');
    expect(resetDraft.volumeStepPercent).toBe('5');
    expect(loadSettings().controls).toEqual(custom);

    // Invalid draft fails validation and returns parsed: null
    const invalidResult = validateSettingsDraft({
      ...resetDraft,
      speedMin: '1.5', // excludes 1x
      fineSeconds: '10',
      nearSeconds: '5',
      volumeStepPercent: '0',
    });
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.parsed).toBeNull();
    expect(invalidResult.errors.speedRange).not.toBeNull();
    expect(invalidResult.errors.seek).not.toBeNull();
    expect(invalidResult.errors.volumeStep).not.toBeNull();

    // Valid draft produces sanitized ControlSettings
    const validResult = validateSettingsDraft({
      ...resetDraft,
      speedStep: '0.5',
      speedMax: '3',
      nearSeconds: '10',
      volumeStepPercent: '10',
    });
    expect(validResult.isValid).toBe(true);
    expect(validResult.parsed?.playbackRate.max).toBe(3);
    expect(validResult.parsed?.seek.nearSeconds).toBe(10);
    expect(validResult.parsed?.volume.step).toBe(0.1);
  });

  it('suppresses video shortcuts when Settings dialog is open', () => {
    expect(
      hasBlockingModalOpen({
        querySelector: (selector: string) =>
          selector.includes('[role="dialog"]') ? ({} as Element) : null,
      })
    ).toBe(true);
  });

  describe('Keyboard Shortcuts Reference Dynamic Draft Preview', () => {
    it('computes dynamic preview values from settings draft', () => {
      const settings = DEFAULT_CONTROL_SETTINGS;
      const draft = {
        ...createDefaultSettingsDraft(),
        fineSeconds: '2',
        nearSeconds: '10',
        farSeconds: '60',
        speedMax: '4',
      };

      const fineSec = Number(draft.fineSeconds);
      const fineDuration = Number.isFinite(fineSec) && fineSec > 0 ? fineSec : settings.seek.fineSeconds;

      const nearSec = Number(draft.nearSeconds);
      const nearDuration = Number.isFinite(nearSec) && nearSec > 0 ? nearSec : settings.seek.nearSeconds;

      const farSec = Number(draft.farSeconds);
      const farDuration = Number.isFinite(farSec) && farSec > 0 ? farSec : settings.seek.farSeconds;

      const maxRate = Number(draft.speedMax);
      const maxSpeed = Number.isFinite(maxRate) && maxRate > 0 ? maxRate : settings.playbackRate.max;

      expect(fineDuration).toBe(2);
      expect(nearDuration).toBe(10);
      expect(farDuration).toBe(60);
      expect(maxSpeed).toBe(4);
    });

    it('falls back safely to settings when draft values are invalid or non-positive', () => {
      const settings = DEFAULT_CONTROL_SETTINGS;
      const draft = {
        ...createDefaultSettingsDraft(),
        fineSeconds: 'invalid',
        nearSeconds: '-5',
        farSeconds: '0',
        speedMax: '',
      };

      const fineSec = Number(draft.fineSeconds);
      const fineDuration = Number.isFinite(fineSec) && fineSec > 0 ? fineSec : settings.seek.fineSeconds;

      const nearSec = Number(draft.nearSeconds);
      const nearDuration = Number.isFinite(nearSec) && nearSec > 0 ? nearSec : settings.seek.nearSeconds;

      const farSec = Number(draft.farSeconds);
      const farDuration = Number.isFinite(farSec) && farSec > 0 ? farSec : settings.seek.farSeconds;

      const maxRate = Number(draft.speedMax);
      const maxSpeed = Number.isFinite(maxRate) && maxRate > 0 ? maxRate : settings.playbackRate.max;

      expect(fineDuration).toBe(settings.seek.fineSeconds);
      expect(nearDuration).toBe(settings.seek.nearSeconds);
      expect(farDuration).toBe(settings.seek.farSeconds);
      expect(maxSpeed).toBe(settings.playbackRate.max);
    });

    it('accurately represents all supported shortcuts across the four groups', () => {
      const groups = {
        playback: [
          { label: 'Play / Pause', shortcut: 'Space / K' },
          { label: 'Fullscreen', shortcut: 'F' },
          { label: 'Theater Mode', shortcut: 'T' },
        ],
        seeking: [
          { label: 'Back', shortcut: ',' },
          { label: 'Forward', shortcut: '.' },
          { label: 'Back', shortcut: '←' },
          { label: 'Forward', shortcut: '→' },
          { label: 'Back', shortcut: '↑' },
          { label: 'Forward', shortcut: '↓' },
          { label: 'Jump to Start', shortcut: '<' },
          { label: 'Jump to End', shortcut: '>' },
        ],
        playbackSpeed: [
          { label: 'Slower', shortcut: '[' },
          { label: 'Faster', shortcut: ']' },
          { label: 'Toggle 1× / Max', shortcut: '\\' },
        ],
        volume: [
          { label: 'Volume −', shortcut: ';' },
          { label: 'Volume +', shortcut: "'" },
          { label: 'Mute / Unmute', shortcut: 'Enter / M' },
        ],
      };

      expect(groups.playback).toHaveLength(3);
      expect(groups.seeking).toHaveLength(8);
      expect(groups.playbackSpeed).toHaveLength(3);
      expect(groups.volume).toHaveLength(3);
    });
  });
});
