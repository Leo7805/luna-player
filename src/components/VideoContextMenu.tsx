import React, { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react';
import {
  RotateCcw,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  CornerDownRight,
  SkipBack,
  SkipForward,
  Gauge,
  ChevronRight,
  Minus,
  Plus,
  MoveHorizontal,
  Volume2,
  Volume1,
  VolumeX,
  Maximize,
  Tv,
} from 'lucide-react';
import { ControlSettings } from '../config/controlSettings';
import {
  calculateContextMenuPosition,
  calculateSubmenuPosition,
  formatSeekDuration,
  formatToggleMaxSpeedLabel,
  ContextMenuPosition,
  SubmenuPosition,
} from '../utils/contextMenuPosition';
import { formatPlaybackRate, formatVolumePercent } from '../utils/feedbackHud';

export type SubmenuType = 'jump' | 'speed' | 'volume' | 'display' | null;

export interface VideoContextMenuProps {
  isOpen: boolean;
  anchorX: number;
  anchorY: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  controlSettings: ControlSettings;
  currentPlaybackRate: number;
  currentVolume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isTheaterMode: boolean;
  isPlayable: boolean;
  onClose: () => void;
  onSeekBackwardFine: () => void;
  onSeekForwardFine: () => void;
  onSeekBackwardMedium: () => void;
  onSeekForwardMedium: () => void;
  onSeekBackwardLarge: () => void;
  onSeekForwardLarge: () => void;
  onSeekToStart: () => void;
  onSeekToEnd: () => void;
  onDecreasePlaybackRate: () => void;
  onIncreasePlaybackRate: () => void;
  onToggleMaxPlaybackRate: () => void;
  onDecreaseVolume: () => void;
  onIncreaseVolume: () => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
  onToggleTheaterMode: () => void;
}

export const VideoContextMenu: React.FC<VideoContextMenuProps> = ({
  isOpen,
  anchorX,
  anchorY,
  containerRef,
  controlSettings,
  currentPlaybackRate,
  currentVolume,
  isMuted,
  isFullscreen,
  isTheaterMode,
  isPlayable,
  onClose,
  onSeekBackwardFine,
  onSeekForwardFine,
  onSeekBackwardMedium,
  onSeekForwardMedium,
  onSeekBackwardLarge,
  onSeekForwardLarge,
  onSeekToStart,
  onSeekToEnd,
  onDecreasePlaybackRate,
  onIncreasePlaybackRate,
  onToggleMaxPlaybackRate,
  onDecreaseVolume,
  onIncreaseVolume,
  onToggleMute,
  onToggleFullscreen,
  onToggleTheaterMode,
}) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const submenuRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuType>(null);
  const [menuPos, setMenuPos] = useState<ContextMenuPosition>({ x: anchorX, y: anchorY });
  const [submenuPos, setSubmenuPos] = useState<SubmenuPosition>({ x: 0, y: 0, direction: 'right' });
  const [activeMenuIndex, setActiveMenuIndex] = useState<number>(0);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number>(-1);

  // Reset menu internal states when opening or anchor changes
  useEffect(() => {
    if (isOpen) {
      setActiveSubmenu(null);
      setActiveMenuIndex(0);
      setActiveSubmenuIndex(-1);
    }
  }, [isOpen, anchorX, anchorY]);

  // Measure and position main menu inside player container
  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current || !menuRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();

    const clickX = anchorX - containerRect.left;
    const clickY = anchorY - containerRect.top;

    const nextPos = calculateContextMenuPosition({
      clickX,
      clickY,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      menuWidth: menuRect.width || 252,
      menuHeight: menuRect.height || 380,
    });

    setMenuPos(nextPos);
  }, [isOpen, anchorX, anchorY, containerRef]);

  // Position the active submenu beside its trigger item
  useLayoutEffect(() => {
    if (!isOpen || !activeSubmenu || !containerRef.current || !menuRef.current) return;

    const triggerEl = triggerRefs.current[activeSubmenu];
    if (!triggerEl) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const triggerRect = triggerEl.getBoundingClientRect();
    const submenuWidth = submenuRef.current ? submenuRef.current.offsetWidth : 192;
    const submenuHeight = submenuRef.current ? submenuRef.current.offsetHeight : 120;

    const triggerOffsetY = triggerRect.top - menuRect.top;

    const nextSubmenuPos = calculateSubmenuPosition({
      menuX: menuPos.x,
      menuY: menuPos.y,
      menuWidth: menuRect.width || 252,
      triggerOffsetY,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      submenuWidth,
      submenuHeight,
    });

    setSubmenuPos(nextSubmenuPos);
  }, [isOpen, activeSubmenu, menuPos, containerRef]);

  // Focus management on open
  useEffect(() => {
    if (isOpen && menuRef.current) {
      menuRef.current.focus();
    }
  }, [isOpen]);

  const handleAction = useCallback(
    (actionFn: () => void) => {
      if (!isPlayable) return;
      actionFn();
      onClose();
    },
    [isPlayable, onClose]
  );

  // Global escape and outside click/pointerdown listener
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (activeSubmenu) {
          const prevSubmenu = activeSubmenu;
          setActiveSubmenu(null);
          setActiveSubmenuIndex(-1);
          triggerRefs.current[prevSubmenu]?.focus();
        } else {
          onClose();
        }
      }
    };

    const handleOutsidePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        menuRef.current?.contains(target) ||
        submenuRef.current?.contains(target)
      ) {
        return;
      }

      onClose();
    };

    window.addEventListener('keydown', handleWindowKeyDown, true);
    window.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
      window.removeEventListener('pointerdown', handleOutsidePointerDown);
    };
  }, [isOpen, activeSubmenu, onClose]);

  if (!isOpen) return null;

  const { seek, playbackRate } = controlSettings;
  const toggleSpeedLabel = formatToggleMaxSpeedLabel(playbackRate.default, playbackRate.max);

  // Main menu items definition (10 items total)
  const mainMenuItems = [
    // Pair 1: Fine Seek (0, 1)
    {
      id: 'seek-fine-back',
      icon: <RotateCcw className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Back',
      duration: formatSeekDuration(seek.fineSeconds, false),
      shortcut: ',',
      action: () => handleAction(onSeekBackwardFine),
    },
    {
      id: 'seek-fine-forward',
      icon: <RotateCw className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Forward',
      duration: formatSeekDuration(seek.fineSeconds, true),
      shortcut: '.',
      action: () => handleAction(onSeekForwardFine),
    },
    // Pair 2: Medium Seek (2, 3)
    {
      id: 'seek-medium-back',
      icon: <ArrowLeft className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Back',
      duration: formatSeekDuration(seek.nearSeconds, false),
      shortcut: '←',
      action: () => handleAction(onSeekBackwardMedium),
    },
    {
      id: 'seek-medium-forward',
      icon: <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Forward',
      duration: formatSeekDuration(seek.nearSeconds, true),
      shortcut: '→',
      action: () => handleAction(onSeekForwardMedium),
    },
    // Pair 3: Large Seek (4, 5)
    {
      id: 'seek-large-back',
      icon: <ChevronsLeft className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Back',
      duration: formatSeekDuration(seek.farSeconds, false),
      shortcut: '↑',
      action: () => handleAction(onSeekBackwardLarge),
    },
    {
      id: 'seek-large-forward',
      icon: <ChevronsRight className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Forward',
      duration: formatSeekDuration(seek.farSeconds, true),
      shortcut: '↓',
      action: () => handleAction(onSeekForwardLarge),
    },
    // Submenu Triggers (6, 7, 8, 9)
    {
      id: 'jump-to',
      submenuKey: 'jump' as SubmenuType,
      icon: <CornerDownRight className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Jump to',
      action: () => {
        setActiveSubmenu((prev) => (prev === 'jump' ? null : 'jump'));
      },
    },
    {
      id: 'playback-speed',
      submenuKey: 'speed' as SubmenuType,
      icon: <Gauge className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Playback Speed',
      duration: formatPlaybackRate(currentPlaybackRate),
      action: () => {
        setActiveSubmenu((prev) => (prev === 'speed' ? null : 'speed'));
      },
    },
    {
      id: 'volume',
      submenuKey: 'volume' as SubmenuType,
      icon: isMuted ? (
        <VolumeX className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />
      ) : (
        <Volume2 className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />
      ),
      label: 'Volume',
      duration: isMuted ? 'Muted' : formatVolumePercent(currentVolume),
      action: () => {
        setActiveSubmenu((prev) => (prev === 'volume' ? null : 'volume'));
      },
    },
    {
      id: 'display-mode',
      submenuKey: 'display' as SubmenuType,
      icon: <Tv className="w-4 h-4 text-slate-300 dark:text-slate-300 light:text-slate-600 shrink-0" />,
      label: 'Display Mode',
      action: () => {
        setActiveSubmenu((prev) => (prev === 'display' ? null : 'display'));
      },
    },
  ];

  // Submenu items map
  const submenus = {
    jump: [
      {
        id: 'jump-start',
        icon: <SkipBack className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Start',
        shortcut: '<',
        action: () => handleAction(onSeekToStart),
      },
      {
        id: 'jump-end',
        icon: <SkipForward className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'End',
        shortcut: '>',
        action: () => handleAction(onSeekToEnd),
      },
    ],
    speed: [
      {
        id: 'speed-slower',
        icon: <Minus className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Slower',
        shortcut: '[',
        action: () => handleAction(onDecreasePlaybackRate),
      },
      {
        id: 'speed-faster',
        icon: <Plus className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Faster',
        shortcut: ']',
        action: () => handleAction(onIncreasePlaybackRate),
      },
      {
        id: 'speed-toggle-max',
        icon: <MoveHorizontal className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: toggleSpeedLabel,
        shortcut: '\\',
        action: () => handleAction(onToggleMaxPlaybackRate),
      },
    ],
    volume: [
      {
        id: 'volume-decrease',
        icon: <Volume1 className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Volume −',
        shortcut: ';',
        action: () => handleAction(onDecreaseVolume),
      },
      {
        id: 'volume-increase',
        icon: <Volume2 className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Volume +',
        shortcut: "'",
        action: () => handleAction(onIncreaseVolume),
      },
      {
        id: 'volume-mute-toggle',
        icon: <VolumeX className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: 'Mute / Unmute',
        shortcut: 'Enter / M',
        action: () => handleAction(onToggleMute),
      },
    ],
    display: [
      {
        id: 'display-fullscreen',
        icon: <Maximize className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
        shortcut: 'F',
        action: () => handleAction(onToggleFullscreen),
      },
      {
        id: 'display-theater',
        icon: <Tv className="w-4 h-4 text-indigo-300 dark:text-indigo-300 light:text-indigo-600 shrink-0" />,
        label: isTheaterMode ? 'Exit Theater Mode' : 'Theater Mode',
        shortcut: 'T',
        action: () => handleAction(onToggleTheaterMode),
      },
    ],
  };

  const currentSubmenuItems = activeSubmenu ? submenus[activeSubmenu] : [];

  // Keyboard navigation within menu
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeSubmenu && activeSubmenuIndex >= 0) {
        setActiveSubmenuIndex((prev) => (prev + 1) % currentSubmenuItems.length);
      } else {
        setActiveMenuIndex((prev) => (prev + 1) % mainMenuItems.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeSubmenu && activeSubmenuIndex >= 0) {
        setActiveSubmenuIndex((prev) => (prev - 1 + currentSubmenuItems.length) % currentSubmenuItems.length);
      } else {
        setActiveMenuIndex((prev) => (prev - 1 + mainMenuItems.length) % mainMenuItems.length);
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (activeMenuIndex >= 6 && activeMenuIndex <= 9) {
        const item = mainMenuItems[activeMenuIndex];
        if (item.submenuKey) {
          setActiveSubmenu(item.submenuKey);
          setActiveSubmenuIndex(0);
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (activeSubmenu) {
        const submenuWas = activeSubmenu;
        setActiveSubmenu(null);
        setActiveSubmenuIndex(-1);
        const parentIdx = mainMenuItems.findIndex((m) => m.submenuKey === submenuWas);
        if (parentIdx >= 0) {
          setActiveMenuIndex(parentIdx);
        }
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (activeSubmenu && activeSubmenuIndex >= 0) {
        currentSubmenuItems[activeSubmenuIndex].action();
      } else if (activeMenuIndex >= 6 && activeMenuIndex <= 9) {
        const item = mainMenuItems[activeMenuIndex];
        if (item.submenuKey) {
          setActiveSubmenu((prev) => (prev === item.submenuKey ? null : item.submenuKey));
          setActiveSubmenuIndex(0);
        }
      } else if (activeMenuIndex >= 0 && activeMenuIndex < 6) {
        mainMenuItems[activeMenuIndex].action();
      }
    }
  };

  return (
    <>
      {/* Main Context Menu */}
      <div
        ref={menuRef}
        role="menu"
        aria-label="Video context menu"
        tabIndex={-1}
        data-testid="video-context-menu"
        style={{
          left: `${menuPos.x}px`,
          top: `${menuPos.y}px`,
        }}
        onKeyDown={handleMenuKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="absolute z-50 w-[252px] select-none p-1.5 rounded-2xl bg-slate-900/95 dark:bg-[#0f172a]/95 light:bg-white/95 text-slate-200 dark:text-slate-200 light:text-slate-800 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300/90 shadow-2xl backdrop-blur-md focus:outline-none"
      >
        {/* Pair 1: Fine Seek */}
        {mainMenuItems.slice(0, 2).map((item, idx) => (
          <MenuItem
            key={item.id}
            item={item}
            isActive={!activeSubmenu && activeMenuIndex === idx}
            disabled={!isPlayable}
            onMouseEnter={() => {
              setActiveMenuIndex(idx);
              setActiveSubmenu(null);
            }}
          />
        ))}

        <div className="h-px my-1 bg-slate-700/60 dark:bg-white/10 light:bg-slate-200" role="separator" />

        {/* Pair 2: Medium Seek */}
        {mainMenuItems.slice(2, 4).map((item, idx) => (
          <MenuItem
            key={item.id}
            item={item}
            isActive={!activeSubmenu && activeMenuIndex === idx + 2}
            disabled={!isPlayable}
            onMouseEnter={() => {
              setActiveMenuIndex(idx + 2);
              setActiveSubmenu(null);
            }}
          />
        ))}

        <div className="h-px my-1 bg-slate-700/60 dark:bg-white/10 light:bg-slate-200" role="separator" />

        {/* Pair 3: Large Seek */}
        {mainMenuItems.slice(4, 6).map((item, idx) => (
          <MenuItem
            key={item.id}
            item={item}
            isActive={!activeSubmenu && activeMenuIndex === idx + 4}
            disabled={!isPlayable}
            onMouseEnter={() => {
              setActiveMenuIndex(idx + 4);
              setActiveSubmenu(null);
            }}
          />
        ))}

        <div className="h-px my-1 bg-slate-700/60 dark:bg-white/10 light:bg-slate-200" role="separator" />

        {/* Submenu Triggers: Jump to, Playback Speed, Volume, Display Mode */}
        {mainMenuItems.slice(6).map((item, idx) => {
          const itemIndex = idx + 6;
          const isTriggerActive = activeSubmenu === item.submenuKey;
          const isRowHighlighted = (!activeSubmenu && activeMenuIndex === itemIndex) || isTriggerActive;

          return (
            <div
              key={item.id}
              onMouseEnter={() => {
                setActiveMenuIndex(itemIndex);
                if (item.submenuKey) {
                  setActiveSubmenu(item.submenuKey);
                  setActiveSubmenuIndex(-1);
                }
              }}
            >
              <button
                ref={(el) => {
                  if (item.submenuKey) {
                    triggerRefs.current[item.submenuKey] = el;
                  }
                }}
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={isTriggerActive}
                data-testid={`context-menu-${item.id}-trigger`}
                disabled={!isPlayable}
                onClick={item.action}
                className={`flex items-center w-full h-[34px] px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                  !isPlayable
                    ? 'opacity-40 cursor-not-allowed'
                    : isRowHighlighted
                    ? 'bg-white/10 dark:bg-white/10 light:bg-slate-100 text-white dark:text-white light:text-slate-900'
                    : 'hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-100'
                }`}
              >
                {item.icon}
                <span className="flex-1 ml-2.5 text-[13px] font-medium tracking-tight">
                  {item.label}
                </span>
                <div className="flex items-center gap-1">
                  {item.duration && (
                    <span className="text-xs font-medium tabular-nums text-indigo-400 dark:text-indigo-400 light:text-indigo-600">
                      {item.duration}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400/80 dark:text-slate-400/80 light:text-slate-500/80 shrink-0" />
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Active Submenu */}
      {activeSubmenu && currentSubmenuItems.length > 0 && (
        <div
          ref={submenuRef}
          role="menu"
          aria-label={`${activeSubmenu} options`}
          tabIndex={-1}
          data-testid={`video-context-submenu-${activeSubmenu}`}
          style={{
            left: `${submenuPos.x}px`,
            top: `${submenuPos.y}px`,
          }}
          onKeyDown={handleMenuKeyDown}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className="absolute z-50 w-[192px] select-none p-1.5 rounded-2xl bg-slate-900/95 dark:bg-[#0f172a]/95 light:bg-white/95 text-slate-200 dark:text-slate-200 light:text-slate-800 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300/90 shadow-2xl backdrop-blur-md focus:outline-none"
        >
          {currentSubmenuItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              data-testid={`context-submenu-${item.id}`}
              disabled={!isPlayable}
              onClick={item.action}
              onMouseEnter={() => setActiveSubmenuIndex(idx)}
              className={`flex items-center w-full h-[34px] px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
                !isPlayable
                  ? 'opacity-40 cursor-not-allowed'
                  : activeSubmenuIndex === idx
                  ? 'bg-white/10 dark:bg-white/10 light:bg-slate-100 text-white dark:text-white light:text-slate-900'
                  : 'hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-100'
              }`}
            >
              {item.icon}
              <span className="flex-1 ml-2.5 text-[13px] font-medium tracking-tight">
                {item.label}
              </span>
              <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded border border-slate-700/80 dark:border-white/15 light:border-slate-300 bg-slate-800/60 dark:bg-white/5 light:bg-slate-100 text-[11px] font-mono font-medium text-slate-400 dark:text-slate-400 light:text-slate-600">
                {item.shortcut}
              </kbd>
            </button>
          ))}
        </div>
      )}
    </>
  );
};

interface MenuItemProps {
  item: {
    id: string;
    icon: React.ReactNode;
    label: string;
    duration?: string;
    shortcut?: string;
    action: () => void;
  };
  isActive: boolean;
  disabled: boolean;
  onMouseEnter: () => void;
}

const MenuItem: React.FC<MenuItemProps> = ({ item, isActive, disabled, onMouseEnter }) => {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={`context-menu-${item.id}`}
      disabled={disabled}
      onClick={item.action}
      onMouseEnter={onMouseEnter}
      className={`flex items-center w-full h-[34px] px-2.5 rounded-lg text-left transition-colors cursor-pointer ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : isActive
          ? 'bg-white/10 dark:bg-white/10 light:bg-slate-100 text-white dark:text-white light:text-slate-900'
          : 'hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-100'
      }`}
    >
      {item.icon}
      <span className="flex-1 ml-2.5 text-[13px] font-medium tracking-tight">
        {item.label}
      </span>
      {item.duration && (
        <span className="text-xs tabular-nums text-slate-400 dark:text-slate-400 light:text-slate-500 mr-2.5">
          {item.duration}
        </span>
      )}
      {item.shortcut && (
        <kbd className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1 rounded border border-slate-700/80 dark:border-white/15 light:border-slate-300 bg-slate-800/60 dark:bg-white/5 light:bg-slate-100 text-[11px] font-mono font-medium text-slate-400 dark:text-slate-400 light:text-slate-600">
          {item.shortcut}
        </kbd>
      )}
    </button>
  );
};
