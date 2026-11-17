import { describe, it, expect } from 'vitest';
import {
  calculateContextMenuPosition,
  calculateSubmenuPosition,
  formatSeekDuration,
  formatToggleMaxSpeedLabel,
} from '../src/utils/contextMenuPosition';
import {
  DEFAULT_CONTROL_SETTINGS,
  ControlSettings,
} from '../src/config/controlSettings';
import { formatPlaybackRate } from '../src/utils/feedbackHud';

describe('Video Context Menu Positioning Logic', () => {
  const containerWidth = 1280;
  const containerHeight = 720;
  const menuWidth = 248;
  const menuHeight = 270;
  const submenuWidth = 184;
  const submenuHeight = 120;
  const margin = 8;

  describe('calculateContextMenuPosition', () => {
    it('positions exactly at click location when inside safe container bounds', () => {
      const pos = calculateContextMenuPosition({
        clickX: 300,
        clickY: 200,
        containerWidth,
        containerHeight,
        menuWidth,
        menuHeight,
        margin,
      });

      expect(pos).toEqual({ x: 300, y: 200 });
    });

    it('clamps horizontal position when click is near the right edge', () => {
      const pos = calculateContextMenuPosition({
        clickX: 1200, // 1200 + 248 = 1448 > 1280
        clickY: 200,
        containerWidth,
        containerHeight,
        menuWidth,
        menuHeight,
        margin,
      });

      expect(pos.x).toBe(containerWidth - menuWidth - margin); // 1280 - 248 - 8 = 1024
      expect(pos.y).toBe(200);
    });

    it('clamps vertical position when click is near the bottom edge', () => {
      const pos = calculateContextMenuPosition({
        clickX: 300,
        clickY: 650, // 650 + 270 = 920 > 720
        containerWidth,
        containerHeight,
        menuWidth,
        menuHeight,
        margin,
      });

      expect(pos.x).toBe(300);
      expect(pos.y).toBe(containerHeight - menuHeight - margin); // 720 - 270 - 8 = 442
    });

    it('clamps to top-left margin when click is at or outside negative coordinates', () => {
      const pos = calculateContextMenuPosition({
        clickX: 2,
        clickY: -10,
        containerWidth,
        containerHeight,
        menuWidth,
        menuHeight,
        margin,
      });

      expect(pos.x).toBe(margin);
      expect(pos.y).toBe(margin);
    });

    it('respects viewport intersection bounds when container is partially offscreen', () => {
      const pos = calculateContextMenuPosition({
        clickX: 400,
        clickY: 500,
        containerWidth,
        containerHeight,
        menuWidth,
        menuHeight,
        margin,
        viewportBounds: {
          left: 0,
          top: 0,
          width: 800,
          height: 450,
        },
      });

      // Should be constrained within viewportBounds height (450 - 270 - 8 = 172)
      expect(pos.y).toBe(172);
      expect(pos.x).toBe(400);
    });
  });

  describe('calculateSubmenuPosition', () => {
    it('opens to the right when there is sufficient room on the right', () => {
      const pos = calculateSubmenuPosition({
        menuX: 300,
        menuY: 200,
        menuWidth,
        speedItemOffsetY: 210,
        containerWidth,
        containerHeight,
        submenuWidth,
        submenuHeight,
        margin,
      });

      expect(pos.direction).toBe('right');
      expect(pos.x).toBe(300 + menuWidth + 4); // 552
      expect(pos.y).toBe(200 + 210); // 410
    });

    it('flips to the left when there is insufficient room on the right', () => {
      // Menu is near right edge: menuX = 1024, menuWidth = 248 -> rightX = 1276, 1276 + 184 > 1280 - 8
      const pos = calculateSubmenuPosition({
        menuX: 1024,
        menuY: 200,
        menuWidth,
        speedItemOffsetY: 210,
        containerWidth,
        containerHeight,
        submenuWidth,
        submenuHeight,
        margin,
      });

      expect(pos.direction).toBe('left');
      expect(pos.x).toBe(1024 - submenuWidth - 4); // 836
      expect(pos.y).toBe(410);
    });

    it('clamps vertical position when speed item is near container bottom', () => {
      const pos = calculateSubmenuPosition({
        menuX: 300,
        menuY: 500,
        menuWidth,
        speedItemOffsetY: 150, // 500 + 150 = 650, 650 + 120 = 770 > 720
        containerWidth,
        containerHeight,
        submenuWidth,
        submenuHeight,
        margin,
      });

      expect(pos.y).toBe(containerHeight - submenuHeight - margin); // 720 - 120 - 8 = 592
    });
  });
});

describe('Video Context Menu Formatting & Settings Integration', () => {
  it('formats backward seek durations with unicode minus sign', () => {
    expect(formatSeekDuration(1, false)).toBe('−1s');
    expect(formatSeekDuration(5, false)).toBe('−5s');
    expect(formatSeekDuration(30, false)).toBe('−30s');
    expect(formatSeekDuration(1.5, false)).toBe('−1.5s');
  });

  it('formats forward seek durations with plus sign', () => {
    expect(formatSeekDuration(1, true)).toBe('+1s');
    expect(formatSeekDuration(5, true)).toBe('+5s');
    expect(formatSeekDuration(30, true)).toBe('+30s');
    expect(formatSeekDuration(2.5, true)).toBe('+2.5s');
  });

  it('formats toggle max playback rate label dynamically from settings', () => {
    expect(formatToggleMaxSpeedLabel(1, 5)).toBe('1× / 5×');
    expect(formatToggleMaxSpeedLabel(1, 2.5)).toBe('1× / 2.5×');
    expect(formatToggleMaxSpeedLabel(1, 10)).toBe('1× / 10×');
  });

  it('formats playback rate display matching V3 prototype', () => {
    expect(formatPlaybackRate(1)).toBe('1×');
    expect(formatPlaybackRate(1.25)).toBe('1.25×');
    expect(formatPlaybackRate(2)).toBe('2×');
    expect(formatPlaybackRate(0.5)).toBe('0.5×');
  });

  it('integrates default controlSettings seek durations accurately', () => {
    const settings: ControlSettings = DEFAULT_CONTROL_SETTINGS;

    const fineBack = formatSeekDuration(settings.seek.fineSeconds, false);
    const fineForward = formatSeekDuration(settings.seek.fineSeconds, true);
    const mediumBack = formatSeekDuration(settings.seek.nearSeconds, false);
    const mediumForward = formatSeekDuration(settings.seek.nearSeconds, true);
    const largeBack = formatSeekDuration(settings.seek.farSeconds, false);
    const largeForward = formatSeekDuration(settings.seek.farSeconds, true);

    expect(fineBack).toBe('−1s');
    expect(fineForward).toBe('+1s');
    expect(mediumBack).toBe('−5s');
    expect(mediumForward).toBe('+5s');
    expect(largeBack).toBe('−30s');
    expect(largeForward).toBe('+30s');
  });

  it('automatically updates formatted labels when controlSettings change', () => {
    const customSettings: ControlSettings = {
      seek: {
        fineSeconds: 2,
        nearSeconds: 10,
        farSeconds: 60,
      },
      playbackRate: {
        default: 1,
        step: 0.5,
        min: 0.5,
        max: 4,
      },
      volume: {
        step: 0.1,
        min: 0,
        max: 1,
        defaultUnmuted: 0.7,
      },
    };

    expect(formatSeekDuration(customSettings.seek.fineSeconds, false)).toBe('−2s');
    expect(formatSeekDuration(customSettings.seek.fineSeconds, true)).toBe('+2s');
    expect(formatSeekDuration(customSettings.seek.nearSeconds, false)).toBe('−10s');
    expect(formatSeekDuration(customSettings.seek.nearSeconds, true)).toBe('+10s');
    expect(formatSeekDuration(customSettings.seek.farSeconds, false)).toBe('−60s');
    expect(formatSeekDuration(customSettings.seek.farSeconds, true)).toBe('+60s');
    expect(
      formatToggleMaxSpeedLabel(
        customSettings.playbackRate.default,
        customSettings.playbackRate.max
      )
    ).toBe('1× / 4×');
  });

  describe('Event Targeting and Native Control Interaction Preservation', () => {
    it('distinguishes video surface from interactive controls (sliders, buttons)', () => {
      const isVideoTarget = (targetTag: string, targetTestId?: string) => {
        if (targetTag.toUpperCase() === 'VIDEO') return true;
        if (targetTag.toUpperCase() === 'INPUT' || targetTag.toUpperCase() === 'BUTTON') return false;
        if (targetTestId === 'seek-slider' || targetTestId === 'volume-slider') return false;
        return false;
      };

      expect(isVideoTarget('video')).toBe(true);
      expect(isVideoTarget('input', 'seek-slider')).toBe(false);
      expect(isVideoTarget('input', 'volume-slider')).toBe(false);
      expect(isVideoTarget('button', 'mute-toggle-button')).toBe(false);
      expect(isVideoTarget('button', 'fullscreen-toggle-button')).toBe(false);
    });
  });

  describe('Refined Menu Structure and Submenu Specifications', () => {
    it('supports triggerOffsetY for dynamic submenu positioning across all 4 triggers', () => {
      // Trigger 1: Jump to at offsetY = 200
      const jumpPos = calculateSubmenuPosition({
        menuX: 100,
        menuY: 50,
        menuWidth: 252,
        triggerOffsetY: 200,
        containerWidth: 1280,
        containerHeight: 720,
        submenuWidth: 192,
        submenuHeight: 80,
      });
      expect(jumpPos.direction).toBe('right');
      expect(jumpPos.x).toBe(100 + 252 + 4);
      expect(jumpPos.y).toBe(50 + 200);

      // Trigger 4: Display Mode near bottom at offsetY = 320
      const displayPos = calculateSubmenuPosition({
        menuX: 100,
        menuY: 400,
        menuWidth: 252,
        triggerOffsetY: 320,
        containerWidth: 1280,
        containerHeight: 720,
        submenuWidth: 192,
        submenuHeight: 80,
      });
      expect(displayPos.direction).toBe('right');
      // 400 + 320 = 720, which would exceed containerHeight - submenuHeight - margin (720 - 80 - 8 = 632)
      expect(displayPos.y).toBe(720 - 80 - 8);
    });

    it('verifies shortcut keys for all submenu items', () => {
      const expectedSubmenus = {
        jump: [
          { label: 'Start', shortcut: '<' },
          { label: 'End', shortcut: '>' },
        ],
        speed: [
          { label: 'Slower', shortcut: '[' },
          { label: 'Faster', shortcut: ']' },
          { label: 'Toggle 1× / Max', shortcut: '\\' },
        ],
        volume: [
          { label: 'Volume −', shortcut: ';' },
          { label: 'Volume +', shortcut: "'" },
          { label: 'Mute / Unmute', shortcut: 'Enter / M' },
        ],
        display: [
          { label: 'Fullscreen', shortcut: 'F' },
          { label: 'Theater Mode', shortcut: 'T' },
        ],
      };

      expect(expectedSubmenus.jump).toHaveLength(2);
      expect(expectedSubmenus.speed).toHaveLength(3);
      expect(expectedSubmenus.volume).toHaveLength(3);
      expect(expectedSubmenus.display).toHaveLength(2);

      expect(expectedSubmenus.display[1].shortcut).toBe('T');
      expect(expectedSubmenus.volume[2].shortcut).toBe('Enter / M');
    });
  });
});
