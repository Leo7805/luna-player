import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_FEEDBACK_TIMING } from '../src/config/controlSettings';
import {
  accumulateSeek,
  formatPlaybackRate,
  formatSeekSeconds,
  formatVolumePercent,
  scheduleFeedbackTimers,
} from '../src/utils/feedbackHud';

describe('Feedback HUD formatting', () => {
  it('formats signed seek distances', () => {
    expect(formatSeekSeconds(5)).toBe('+5s');
    expect(formatSeekSeconds(15)).toBe('+15s');
    expect(formatSeekSeconds(-30)).toBe('-30s');
    expect(formatSeekSeconds(-1)).toBe('-1s');
    expect(formatSeekSeconds(1.25)).toBe('+1.3s');
  });

  it('formats playback rates and volume percentages', () => {
    expect(formatPlaybackRate(1)).toBe('1×');
    expect(formatPlaybackRate(1.25)).toBe('1.25×');
    expect(formatPlaybackRate(2)).toBe('2×');
    expect(formatPlaybackRate(5)).toBe('5×');

    expect(formatVolumePercent(0.65)).toBe('65%');
    expect(formatVolumePercent(0)).toBe('0%');
    expect(formatVolumePercent(1)).toBe('100%');
    expect(formatVolumePercent(1.5)).toBe('100%');
  });
});

describe('Seek accumulation and reset', () => {
  it('accumulates repeated seeks in the same direction within 1000ms', () => {
    const first = accumulateSeek(null, 5, 1000);
    expect(first).toEqual({ direction: 1, totalSeconds: 5, timestamp: 1000 });

    const second = accumulateSeek(first, 5, 1400);
    expect(second).toEqual({ direction: 1, totalSeconds: 10, timestamp: 1400 });

    const third = accumulateSeek(second, 5, 2000);
    expect(third).toEqual({ direction: 1, totalSeconds: 15, timestamp: 2000 });
  });

  it('resets accumulation when direction reverses', () => {
    const forward = accumulateSeek(null, 5, 1000);
    const secondForward = accumulateSeek(forward, 5, 1200);
    expect(secondForward.totalSeconds).toBe(10);

    const reversed = accumulateSeek(secondForward, -5, 1400);
    expect(reversed).toEqual({ direction: -1, totalSeconds: -5, timestamp: 1400 });
  });

  it('resets accumulation after the 1000ms window expires', () => {
    const first = accumulateSeek(null, 5, 1000);
    const expired = accumulateSeek(first, 5, 2001);
    expect(expired).toEqual({ direction: 1, totalSeconds: 5, timestamp: 2001 });
  });
});

describe('Feedback HUD display, fade, and cleanup timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches Luna V default 600ms display and 400ms fade durations', () => {
    expect(DEFAULT_FEEDBACK_TIMING).toEqual({
      accumulationWindowMs: 1000,
      displayDurationMs: 600,
      fadeDurationMs: 400,
    });

    const onFade = vi.fn();
    const onHide = vi.fn();
    scheduleFeedbackTimers(onFade, onHide);

    vi.advanceTimersByTime(599);
    expect(onFade).not.toHaveBeenCalled();
    expect(onHide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onFade).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(399);
    expect(onHide).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('cancels stale timers on rapid consecutive actions or unmount cleanup', () => {
    const firstFade = vi.fn();
    const firstHide = vi.fn();
    const cleanupFirst = scheduleFeedbackTimers(firstFade, firstHide);

    vi.advanceTimersByTime(300);
    cleanupFirst();

    const secondFade = vi.fn();
    const secondHide = vi.fn();
    const cleanupSecond = scheduleFeedbackTimers(secondFade, secondHide);

    vi.advanceTimersByTime(599);
    expect(firstFade).not.toHaveBeenCalled();
    expect(firstHide).not.toHaveBeenCalled();
    expect(secondFade).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(secondFade).toHaveBeenCalledTimes(1);
    expect(secondHide).not.toHaveBeenCalled();

    // Unmount before fade completes
    cleanupSecond();
    vi.advanceTimersByTime(500);
    expect(secondHide).not.toHaveBeenCalled();
  });
});
