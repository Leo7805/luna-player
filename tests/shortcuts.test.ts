import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CONTROL_SETTINGS,
  END_SEEK_OFFSET_SECONDS,
  PLAYBACK_RATE_EPSILON,
} from '../src/config/controlSettings';
import {
  resolveShortcutAction,
  isInteractiveOrEditableTarget,
  hasBlockingModalOpen,
  type ShortcutKeyEvent,
} from '../src/utils/shortcuts';

function makeEvent(overrides: Partial<ShortcutKeyEvent>): ShortcutKeyEvent {
  return {
    key: '',
    code: '',
    repeat: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    isComposing: false,
    defaultPrevented: false,
    ...overrides,
  };
}

describe('DEFAULT_CONTROL_SETTINGS', () => {
  it('matches Luna V default seek, playbackRate, and volume settings', () => {
    expect(DEFAULT_CONTROL_SETTINGS.seek).toEqual({
      fineSeconds: 1,
      nearSeconds: 5,
      farSeconds: 30,
    });
    expect(DEFAULT_CONTROL_SETTINGS.playbackRate).toEqual({
      default: 1,
      step: 0.25,
      min: 0.25,
      max: 5,
    });
    expect(DEFAULT_CONTROL_SETTINGS.volume).toEqual({
      step: 0.05,
      min: 0,
      max: 1,
      defaultUnmuted: 0.6,
    });
    expect(END_SEEK_OFFSET_SECONDS).toBe(0.5);
    expect(PLAYBACK_RATE_EPSILON).toBe(0.001);
  });
});

describe('resolveShortcutAction', () => {
  it('maps all 15 Luna V default shortcuts accurately', () => {
    expect(resolveShortcutAction(makeEvent({ key: ' ', code: 'Space' }))).toEqual({
      action: 'toggle-playback',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: '[', code: 'BracketLeft' }))).toEqual({
      action: 'decrease-playback-rate',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: ']', code: 'BracketRight' }))).toEqual({
      action: 'increase-playback-rate',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: '\\', code: 'Backslash' }))).toEqual({
      action: 'toggle-max-playback-rate',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: ';', code: 'Semicolon' }))).toEqual({
      action: 'decrease-volume',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: "'", code: 'Quote' }))).toEqual({
      action: 'increase-volume',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: 'Enter', code: 'Enter' }))).toEqual({
      action: 'toggle-muted',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: ',', code: 'Comma' }))).toEqual({
      action: 'seek-backward-fine',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: '.', code: 'Period' }))).toEqual({
      action: 'seek-forward-fine',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toEqual({
      action: 'seek-backward',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: 'ArrowRight', code: 'ArrowRight' }))).toEqual({
      action: 'seek-forward',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: 'ArrowUp', code: 'ArrowUp' }))).toEqual({
      action: 'seek-backward-far',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: 'ArrowDown', code: 'ArrowDown' }))).toEqual({
      action: 'seek-forward-far',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: '<', code: 'Comma' }))).toEqual({
      action: 'seek-start',
      suppressedRepeat: false,
    });
    expect(resolveShortcutAction(makeEvent({ key: '>', code: 'Period' }))).toEqual({
      action: 'seek-end',
      suppressedRepeat: false,
    });
  });

  it('preserves Luna Player K, M, and F aliases', () => {
    expect(resolveShortcutAction(makeEvent({ key: 'k', code: 'KeyK' }))?.action).toBe(
      'toggle-playback'
    );
    expect(resolveShortcutAction(makeEvent({ key: 'K', code: 'KeyK' }))?.action).toBe(
      'toggle-playback'
    );
    expect(resolveShortcutAction(makeEvent({ key: 'm', code: 'KeyM' }))?.action).toBe(
      'toggle-muted'
    );
    expect(resolveShortcutAction(makeEvent({ key: 'M', code: 'KeyM' }))?.action).toBe(
      'toggle-muted'
    );
    expect(resolveShortcutAction(makeEvent({ key: 'f', code: 'KeyF' }))?.action).toBe(
      'toggle-fullscreen'
    );
    expect(resolveShortcutAction(makeEvent({ key: 'F', code: 'KeyF' }))?.action).toBe(
      'toggle-fullscreen'
    );
  });

  it('allows held directional seek keys to repeat while suppressing held toggle keys', () => {
    const repeatableKeys: Array<Partial<ShortcutKeyEvent>> = [
      { key: ',', code: 'Comma' },
      { key: '.', code: 'Period' },
      { key: 'ArrowLeft', code: 'ArrowLeft' },
      { key: 'ArrowRight', code: 'ArrowRight' },
      { key: 'ArrowUp', code: 'ArrowUp' },
      { key: 'ArrowDown', code: 'ArrowDown' },
      { key: '[', code: 'BracketLeft' },
      { key: ']', code: 'BracketRight' },
      { key: ';', code: 'Semicolon' },
      { key: "'", code: 'Quote' },
    ];

    for (const k of repeatableKeys) {
      const resolved = resolveShortcutAction(makeEvent({ ...k, repeat: true }));
      expect(resolved).not.toBeNull();
      expect(resolved?.suppressedRepeat).toBe(false);
    }

    const toggleKeys: Array<Partial<ShortcutKeyEvent>> = [
      { key: ' ', code: 'Space' },
      { key: 'Enter', code: 'Enter' },
      { key: '\\', code: 'Backslash' },
      { key: 'k', code: 'KeyK' },
      { key: 'm', code: 'KeyM' },
      { key: 'f', code: 'KeyF' },
    ];

    for (const k of toggleKeys) {
      const resolved = resolveShortcutAction(makeEvent({ ...k, repeat: true }));
      expect(resolved).not.toBeNull();
      expect(resolved?.suppressedRepeat).toBe(true);
    }
  });

  it('ignores modified, composing, defaultPrevented, and unmapped events', () => {
    expect(resolveShortcutAction(makeEvent({ key: ' ', ctrlKey: true }))).toBeNull();
    expect(resolveShortcutAction(makeEvent({ key: 'f', metaKey: true }))).toBeNull();
    expect(resolveShortcutAction(makeEvent({ key: 'ArrowLeft', altKey: true }))).toBeNull();
    expect(resolveShortcutAction(makeEvent({ key: ' ', isComposing: true }))).toBeNull();
    expect(resolveShortcutAction(makeEvent({ key: ' ', defaultPrevented: true }))).toBeNull();
    expect(resolveShortcutAction(makeEvent({ key: 'x', code: 'KeyX' }))).toBeNull();
  });
});

describe('Target and modal guards', () => {
  it('detects interactive and editable elements', () => {
    const makeMockElement = (tagName: string, isContentEditable = false, closestMatch = false) => ({
      tagName,
      isContentEditable,
      closest: () => (closestMatch ? {} : null),
    });

    expect(isInteractiveOrEditableTarget(makeMockElement('INPUT') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('TEXTAREA') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('SELECT') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('BUTTON') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('SUMMARY') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('A') as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('DIV', true) as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('SPAN', false, true) as unknown as EventTarget)).toBe(true);
    expect(isInteractiveOrEditableTarget(makeMockElement('DIV', false, false) as unknown as EventTarget)).toBe(false);
    expect(isInteractiveOrEditableTarget(null)).toBe(false);
  });

  it('detects blocking modals regardless of focus', () => {
    expect(hasBlockingModalOpen({ querySelector: () => ({}) as Element })).toBe(true);
    expect(hasBlockingModalOpen({ querySelector: () => null })).toBe(false);
  });
});
