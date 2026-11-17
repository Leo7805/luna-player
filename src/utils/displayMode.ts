export type DisplayMode = 'normal' | 'theater' | 'fullscreen';

/**
 * Determines the current mutually exclusive display mode.
 * Native fullscreen takes absolute precedence over theater mode.
 */
export function getActiveDisplayMode(
  isFullscreen: boolean,
  isTheaterMode: boolean
): DisplayMode {
  if (isFullscreen) return 'fullscreen';
  if (isTheaterMode) return 'theater';
  return 'normal';
}

/**
 * Returns the context menu labels for the Display Mode submenu.
 * Fullscreen and Theater Mode can never both be in 'Exit' state.
 */
export function getDisplayModeMenuLabels(
  isFullscreen: boolean,
  isTheaterMode: boolean
): { fullscreenLabel: string; theaterLabel: string } {
  const mode = getActiveDisplayMode(isFullscreen, isTheaterMode);
  return {
    fullscreenLabel: mode === 'fullscreen' ? 'Exit Fullscreen' : 'Fullscreen',
    theaterLabel: mode === 'theater' ? 'Exit Theater Mode' : 'Theater Mode',
  };
}

export interface TransitionActionPlan {
  shouldExitFullscreen: boolean;
  shouldRequestFullscreen: boolean;
  nextTheaterState: boolean;
}

/**
 * Pure transition state machine for display mode switching.
 */
export function planDisplayModeTransition(
  currentMode: DisplayMode,
  targetAction: 'toggle-fullscreen' | 'toggle-theater' | 'escape'
): TransitionActionPlan {
  switch (currentMode) {
    case 'normal':
      if (targetAction === 'toggle-fullscreen') {
        return {
          shouldExitFullscreen: false,
          shouldRequestFullscreen: true,
          nextTheaterState: false,
        };
      }
      if (targetAction === 'toggle-theater') {
        return {
          shouldExitFullscreen: false,
          shouldRequestFullscreen: false,
          nextTheaterState: true,
        };
      }
      return {
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      };

    case 'theater':
      if (targetAction === 'toggle-fullscreen') {
        // Theater -> Fullscreen: exit theater and request fullscreen synchronously
        return {
          shouldExitFullscreen: false,
          shouldRequestFullscreen: true,
          nextTheaterState: false,
        };
      }
      if (targetAction === 'toggle-theater' || targetAction === 'escape') {
        // Theater -> Normal
        return {
          shouldExitFullscreen: false,
          shouldRequestFullscreen: false,
          nextTheaterState: false,
        };
      }
      return {
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: true,
      };

    case 'fullscreen':
      if (targetAction === 'toggle-theater') {
        // Fullscreen -> Theater: exit fullscreen first, then enter theater
        return {
          shouldExitFullscreen: true,
          shouldRequestFullscreen: false,
          nextTheaterState: true,
        };
      }
      if (targetAction === 'toggle-fullscreen' || targetAction === 'escape') {
        // Fullscreen -> Normal
        return {
          shouldExitFullscreen: true,
          shouldRequestFullscreen: false,
          nextTheaterState: false,
        };
      }
      return {
        shouldExitFullscreen: false,
        shouldRequestFullscreen: false,
        nextTheaterState: false,
      };
  }
}
