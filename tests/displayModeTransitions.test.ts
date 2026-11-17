import { describe, it, expect } from 'vitest';
import {
  getActiveDisplayMode,
  getDisplayModeMenuLabels,
  planDisplayModeTransition,
} from '../src/utils/displayMode';

describe('Display Mode Transitions & Invariants', () => {
  describe('getActiveDisplayMode', () => {
    it('returns "normal" when neither fullscreen nor theater mode is active', () => {
      expect(getActiveDisplayMode(false, false)).toBe('normal');
    });

    it('returns "theater" when theater mode is active and fullscreen is false', () => {
      expect(getActiveDisplayMode(false, true)).toBe('theater');
    });

    it('returns "fullscreen" when fullscreen is active and theater mode is false', () => {
      expect(getActiveDisplayMode(true, false)).toBe('fullscreen');
    });

    it('strictly prioritizes "fullscreen" over theater mode if both flags are true', () => {
      // Prevents impossible simultaneous state from surfacing in UI
      expect(getActiveDisplayMode(true, true)).toBe('fullscreen');
    });
  });

  describe('getDisplayModeMenuLabels', () => {
    it('returns "Fullscreen" and "Theater Mode" when in normal mode', () => {
      const labels = getDisplayModeMenuLabels(false, false);
      expect(labels.fullscreenLabel).toBe('Fullscreen');
      expect(labels.theaterLabel).toBe('Theater Mode');
    });

    it('returns "Exit Fullscreen" and "Theater Mode" when fullscreen is active', () => {
      const labels = getDisplayModeMenuLabels(true, false);
      expect(labels.fullscreenLabel).toBe('Exit Fullscreen');
      expect(labels.theaterLabel).toBe('Theater Mode');
    });

    it('returns "Fullscreen" and "Exit Theater Mode" when theater is active', () => {
      const labels = getDisplayModeMenuLabels(false, true);
      expect(labels.fullscreenLabel).toBe('Fullscreen');
      expect(labels.theaterLabel).toBe('Exit Theater Mode');
    });

    it('never displays both "Exit Fullscreen" and "Exit Theater Mode" simultaneously', () => {
      const labelsWhenBoth = getDisplayModeMenuLabels(true, true);
      const exitCount = [labelsWhenBoth.fullscreenLabel, labelsWhenBoth.theaterLabel].filter((l) =>
        l.startsWith('Exit')
      ).length;
      expect(exitCount).toBeLessThanOrEqual(1);
      expect(labelsWhenBoth.fullscreenLabel).toBe('Exit Fullscreen');
      expect(labelsWhenBoth.theaterLabel).toBe('Theater Mode');
    });
  });

  describe('planDisplayModeTransition', () => {
    // 1. Normal → F → Fullscreen
    it('handles Normal → F → Fullscreen transition', () => {
      const plan = planDisplayModeTransition('normal', 'toggle-fullscreen');
      expect(plan).toEqual({
        shouldExitFullscreen: false,
        shouldRequestFullscreen: true,
        nextTheaterState: false,
      });
    });

    // 2. Normal → T → Theater
    it('handles Normal → T → Theater transition', () => {
      const plan = planDisplayModeTransition('normal', 'toggle-theater');
      expect(plan).toEqual({
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: true,
      });
    });

    // 3. Fullscreen → T → Theater (exit native Fullscreen first)
    it('handles Fullscreen → T → Theater transition by exiting fullscreen and entering theater', () => {
      const plan = planDisplayModeTransition('fullscreen', 'toggle-theater');
      expect(plan).toEqual({
        shouldExitFullscreen: true,
        shouldRequestFullscreen: false,
        nextTheaterState: true,
      });
    });

    // 4. Theater → F → Fullscreen (exit Theater and request native Fullscreen synchronously)
    it('handles Theater → F → Fullscreen transition by clearing theater and requesting fullscreen', () => {
      const plan = planDisplayModeTransition('theater', 'toggle-fullscreen');
      expect(plan).toEqual({
        shouldExitFullscreen: false,
        shouldRequestFullscreen: true,
        nextTheaterState: false,
      });
    });

    // 5. Fullscreen → F → Normal
    it('handles Fullscreen → F → Normal transition by exiting fullscreen', () => {
      const plan = planDisplayModeTransition('fullscreen', 'toggle-fullscreen');
      expect(plan).toEqual({
        shouldExitFullscreen: true,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      });
    });

    // 6. Theater → T → Normal
    it('handles Theater → T → Normal transition by disabling theater', () => {
      const plan = planDisplayModeTransition('theater', 'toggle-theater');
      expect(plan).toEqual({
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      });
    });

    // 7. Theater → Escape → Normal
    it('handles Theater → Escape → Normal transition', () => {
      const plan = planDisplayModeTransition('theater', 'escape');
      expect(plan).toEqual({
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      });
    });

    // 8. Fullscreen → Escape → Normal (exit native Fullscreen normally)
    it('handles Fullscreen → Escape → Normal transition', () => {
      const plan = planDisplayModeTransition('fullscreen', 'escape');
      expect(plan).toEqual({
        shouldExitFullscreen: true,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      });
    });
  });
});
