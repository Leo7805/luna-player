export interface ContextMenuPositionInput {
  clickX: number;
  clickY: number;
  containerWidth: number;
  containerHeight: number;
  menuWidth: number;
  menuHeight: number;
  margin?: number;
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface SubmenuPositionInput {
  menuX: number;
  menuY: number;
  menuWidth: number;
  triggerOffsetY?: number;
  speedItemOffsetY?: number;
  containerWidth: number;
  containerHeight: number;
  submenuWidth: number;
  submenuHeight: number;
  margin?: number;
  gap?: number;
}

export interface SubmenuPosition {
  x: number;
  y: number;
  direction: 'right' | 'left';
}

const DEFAULT_MARGIN = 8;
const DEFAULT_GAP = 4;

/**
 * Calculates clamped coordinates for the main context menu inside the player container.
 * Ensures the entire menu stays within visible boundaries.
 */
export function calculateContextMenuPosition({
  clickX,
  clickY,
  containerWidth,
  containerHeight,
  menuWidth,
  menuHeight,
  margin = DEFAULT_MARGIN,
  viewportBounds,
}: ContextMenuPositionInput): ContextMenuPosition {
  let minX = margin;
  let maxX = Math.max(margin, containerWidth - menuWidth - margin);
  let minY = margin;
  let maxY = Math.max(margin, containerHeight - menuHeight - margin);

  // If viewport bounds relative to container are provided, constrain within visible intersection
  if (viewportBounds) {
    const vMinX = Math.max(margin, viewportBounds.left + margin);
    const vMaxX = Math.max(vMinX, viewportBounds.left + viewportBounds.width - menuWidth - margin);
    const vMinY = Math.max(margin, viewportBounds.top + margin);
    const vMaxY = Math.max(vMinY, viewportBounds.top + viewportBounds.height - menuHeight - margin);

    minX = Math.max(minX, vMinX);
    maxX = Math.min(maxX, vMaxX);
    minY = Math.max(minY, vMinY);
    maxY = Math.min(maxY, vMaxY);
  }

  const x = Math.min(Math.max(clickX, minX), maxX);
  const y = Math.min(Math.max(clickY, minY), maxY);

  return { x, y };
}

/**
 * Calculates the position and direction for the speed submenu.
 * Flips to the left of the main menu if there is insufficient room on the right.
 */
export function calculateSubmenuPosition({
  menuX,
  menuY,
  menuWidth,
  triggerOffsetY,
  speedItemOffsetY,
  containerWidth,
  containerHeight,
  submenuWidth,
  submenuHeight,
  margin = DEFAULT_MARGIN,
  gap = DEFAULT_GAP,
}: SubmenuPositionInput): SubmenuPosition {
  // Try opening to the right
  const rightX = menuX + menuWidth + gap;
  const canFitRight = rightX + submenuWidth <= containerWidth - margin;

  let x: number;
  let direction: 'right' | 'left';

  if (canFitRight) {
    x = rightX;
    direction = 'right';
  } else {
    // Open to the left
    x = Math.max(margin, menuX - submenuWidth - gap);
    direction = 'left';
  }

  // Vertical alignment with the trigger item
  const offsetY = triggerOffsetY ?? speedItemOffsetY ?? 0;
  let y = menuY + offsetY;
  const maxY = Math.max(margin, containerHeight - submenuHeight - margin);

  if (y > maxY) {
    y = maxY;
  }
  if (y < margin) {
    y = margin;
  }

  return { x, y, direction };
}

/**
 * Formats seek duration with unicode minus sign (e.g., "−1s", "+1s", "−30s").
 */
export function formatSeekDuration(seconds: number, isForward: boolean): string {
  const rounded = Math.round(Math.abs(seconds) * 10) / 10;
  return isForward ? `+${rounded}s` : `\u2212${rounded}s`;
}

/**
 * Formats the toggle max speed label (e.g., "1× / 5×").
 */
export function formatToggleMaxSpeedLabel(defaultRate: number, maxRate: number): string {
  const roundedDefault = Math.round(defaultRate * 100) / 100;
  const roundedMax = Math.round(maxRate * 100) / 100;
  return `${roundedDefault}\u00d7 / ${roundedMax}\u00d7`;
}
