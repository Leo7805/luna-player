export type ShortcutAction =
  | 'toggle-playback'
  | 'decrease-playback-rate'
  | 'increase-playback-rate'
  | 'toggle-max-playback-rate'
  | 'decrease-volume'
  | 'increase-volume'
  | 'toggle-muted'
  | 'seek-backward-fine'
  | 'seek-forward-fine'
  | 'seek-backward'
  | 'seek-forward'
  | 'seek-backward-far'
  | 'seek-forward-far'
  | 'seek-start'
  | 'seek-end'
  | 'toggle-fullscreen';

export interface ShortcutResolution {
  action: ShortcutAction;
  /** True when this is a repeated keydown event for a toggle action that must not re-fire. */
  suppressedRepeat: boolean;
}

export interface ShortcutKeyEvent {
  key: string;
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
}

const KEY_TO_ACTION: Record<string, ShortcutAction> = {
  ' ': 'toggle-playback',
  k: 'toggle-playback',
  K: 'toggle-playback',
  Enter: 'toggle-muted',
  m: 'toggle-muted',
  M: 'toggle-muted',
  f: 'toggle-fullscreen',
  F: 'toggle-fullscreen',
  ',': 'seek-backward-fine',
  '.': 'seek-forward-fine',
  ArrowLeft: 'seek-backward',
  ArrowRight: 'seek-forward',
  ArrowUp: 'seek-backward-far',
  ArrowDown: 'seek-forward-far',
  '<': 'seek-start',
  '>': 'seek-end',
};

const CODE_TO_ACTION: Record<string, ShortcutAction> = {
  BracketLeft: 'decrease-playback-rate',
  BracketRight: 'increase-playback-rate',
  Backslash: 'toggle-max-playback-rate',
  Semicolon: 'decrease-volume',
  Quote: 'increase-volume',
};

const NON_REPEATABLE_TOGGLE_ACTIONS = new Set<ShortcutAction>([
  'toggle-playback',
  'toggle-muted',
  'toggle-max-playback-rate',
  'toggle-fullscreen',
]);

/**
 * Resolves a keyboard event into a Luna Player shortcut action.
 * Returns null if the event is modified, composing, default-prevented, or unmapped.
 */
export function resolveShortcutAction(event: ShortcutKeyEvent): ShortcutResolution | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return null;
  }

  const action = KEY_TO_ACTION[event.key] ?? CODE_TO_ACTION[event.code] ?? null;
  if (!action) {
    return null;
  }

  const suppressedRepeat = Boolean(event.repeat && NON_REPEATABLE_TOGGLE_ACTIONS.has(action));
  return { action, suppressedRepeat };
}

/**
 * Returns true when the event target is an interactive or editable element
 * whose native keyboard behavior should not be hijacked.
 */
export function isInteractiveOrEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') {
    return false;
  }

  const element = target as HTMLElement;
  const tagName = element.tagName;

  if (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON' ||
    tagName === 'SUMMARY' ||
    tagName === 'A' ||
    element.isContentEditable
  ) {
    return true;
  }

  return Boolean(
    element.closest(
      'button, input, textarea, select, summary, a, [contenteditable="true"], [contenteditable=""], [role="slider"], [role="menu"], [role="menuitem"], [role="dialog"]'
    )
  );
}

/**
 * Returns true when a blocking modal/dialog is currently open in the DOM,
 * regardless of where keyboard focus currently resides.
 */
export function hasBlockingModalOpen(root: Pick<Document, 'querySelector'> = document): boolean {
  return Boolean(
    root.querySelector('[role="dialog"], [aria-modal="true"], [data-testid="extract-audio-modal"]')
  );
}
