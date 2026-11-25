import React, { useRef, useState, useEffect } from 'react';
import { FolderOpen, Film, ChevronDown } from 'lucide-react';
import { OpenVideoMode } from '../utils/platform';
import { VideoLibrary } from '../types/video';
import { Tooltip } from './Tooltip';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface OpenVideosControlProps {
  variant: 'empty-state' | 'header';
  library?: VideoLibrary | null;
  defaultOpenMode: OpenVideoMode;
  isFsaSupported: boolean;
  isFsaOpenFileSupported?: boolean;
  isScanning: boolean;
  scanCount?: number;
  onOpenFolder: () => void;
  onOpenFiles?: () => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
}

export const OpenVideosControl: React.FC<OpenVideosControlProps> = ({
  variant,
  library,
  defaultOpenMode,
  isFsaSupported,
  isFsaOpenFileSupported = false,
  isScanning,
  scanCount = 0,
  onOpenFolder,
  onOpenFiles,
  onFallbackFolderSelect,
  onOpenFilesSelect,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const secondMenuItemRef = useRef<HTMLButtonElement | null>(null);
  const openedMenuByKeyboardRef = useRef(false);
  const folderFallbackInputRef = useRef<HTMLInputElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    if (openedMenuByKeyboardRef.current) {
      firstMenuItemRef.current?.focus();
    }

    const handlePointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        openedMenuByKeyboardRef.current = false;
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        const activeInsideMenu =
          containerRef.current?.contains(document.activeElement) &&
          (document.activeElement as HTMLElement | null)?.getAttribute('role') === 'menuitem';
        const shouldRestoreFocus = openedMenuByKeyboardRef.current || Boolean(activeInsideMenu);
        openedMenuByKeyboardRef.current = false;
        setMenuOpen(false);
        if (shouldRestoreFocus) {
          menuButtonRef.current?.focus();
        }
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const handleMenuToggleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const isPointerClick = e.detail > 0;
    if (isPointerClick) {
      blurButtonAfterPointerClick(e);
      openedMenuByKeyboardRef.current = false;
    } else {
      openedMenuByKeyboardRef.current = !menuOpen;
    }
    setMenuOpen((prev) => !prev);
  };

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [firstMenuItemRef.current, secondMenuItemRef.current].filter(
      (el): el is HTMLButtonElement => el !== null
    );
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = items[(currentIndex + 1) % items.length];
      next.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = items[(currentIndex - 1 + items.length) % items.length];
      prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === 'Tab') {
      openedMenuByKeyboardRef.current = false;
      setMenuOpen(false);
    }
  };

  const triggerOpenFolder = () => {
    setMenuOpen(false);
    if (isFsaSupported) {
      onOpenFolder();
    } else {
      folderFallbackInputRef.current?.click();
    }
  };

  const triggerOpenFiles = () => {
    setMenuOpen(false);
    if (isFsaOpenFileSupported && onOpenFiles) {
      onOpenFiles();
    } else {
      filesInputRef.current?.click();
    }
  };

  const triggerDefaultOpen = () => {
    if (defaultOpenMode === 'files') {
      triggerOpenFiles();
    } else {
      triggerOpenFolder();
    }
  };

  const isFilesMode = library?.sourceType === 'files';

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center min-w-0 max-w-full"
    >
      {/* Hidden Folder Input Fallback (macOS Safari / non-FSA browsers) */}
      <input
        ref={folderFallbackInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in HTML5 directory inputs
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        data-testid={`${variant}-folder-fallback-input`}
        onChange={(e) => {
          onFallbackFolderSelect(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Hidden Multi-File Video Input (iPad & manual Open Files) */}
      <input
        ref={filesInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        data-testid={`${variant}-files-input`}
        onChange={(e) => {
          onOpenFilesSelect(e.target.files);
          e.target.value = '';
        }}
      />

      {variant === 'empty-state' ? (
        <div
          data-testid="empty-state-split-button"
          className="inline-flex items-stretch rounded-full bg-sky-500 text-slate-950 shadow-xl shadow-sky-500/25 max-w-full"
        >
          <button
            type="button"
            onClick={(e) => {
              blurButtonAfterPointerClick(e);
              triggerDefaultOpen();
            }}
            disabled={isScanning}
            data-testid="open-videos-button"
            className="flex items-center gap-2.5 pl-6 pr-5 py-3.5 rounded-l-full hover:bg-sky-400 active:bg-sky-400/90 font-semibold text-sm transition-colors cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950/10 focus-visible:z-10"
          >
            {defaultOpenMode === 'files' ? (
              <Film className="h-5 w-5 shrink-0" />
            ) : (
              <FolderOpen className="h-5 w-5 shrink-0" />
            )}
            <span className="whitespace-nowrap">
              {isScanning ? `Scanning (${scanCount} found)...` : 'Open Videos'}
            </span>
          </button>

          {/* Subtle Vertical Separator */}
          <div
            data-testid="empty-state-split-divider"
            className="w-px my-2.5 bg-slate-950/20 shrink-0"
            aria-hidden="true"
          />

          <Tooltip content="More opening options" placement="bottom" disabled={menuOpen}>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={handleMenuToggleClick}
              disabled={isScanning}
              aria-label="More opening options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              data-testid="open-videos-menu-button"
              className="flex items-center justify-center pl-3.5 pr-4 py-3.5 rounded-r-full text-slate-950 hover:bg-sky-400 active:bg-sky-400/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950/10 focus-visible:z-10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  menuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </Tooltip>
        </div>
      ) : (
        library && (
          <div
            data-testid="header-split-button"
            className="inline-flex items-stretch rounded-full glass-panel-subtle border border-slate-300/80 dark:border-white/15 text-xs min-w-0 max-w-full"
          >
            {/* Main Area: Folder Information */}
            <Tooltip
              content={
                defaultOpenMode === 'files'
                  ? `Open videos (${library.name})`
                  : `Switch folder (${library.name})`
              }
              placement="bottom"
              disabled={menuOpen}
            >
              <button
                type="button"
                onClick={(e) => {
                  blurButtonAfterPointerClick(e);
                  triggerDefaultOpen();
                }}
                disabled={isScanning}
                className="group flex items-center gap-1.5 sm:gap-2 pl-3 sm:pl-3.5 pr-2 sm:pr-2.5 py-1.5 rounded-l-full hover:bg-slate-200/70 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:z-10 transition-colors cursor-pointer disabled:opacity-50 min-w-0"
                aria-label="Open Videos"
                data-testid="folder-switch-pill"
              >
                {isFilesMode ? (
                  <Film className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 group-hover:scale-105 transition-transform" />
                ) : (
                  <FolderOpen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 group-hover:scale-105 transition-transform" />
                )}
                <span
                  className="font-bold text-slate-900 dark:text-slate-200 truncate min-w-0 max-w-[85px] sm:max-w-[200px] md:max-w-[280px] lg:max-w-[360px]"
                  data-testid="header-folder-name"
                >
                  {isScanning ? 'Scanning...' : library.name}
                </span>
                <span
                  className="text-slate-400 dark:text-slate-500 font-bold shrink-0"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span
                  className="text-slate-700 dark:text-slate-400 font-semibold shrink-0 whitespace-nowrap"
                  data-testid="header-video-count"
                >
                  {library.flatPlaylist.length}{' '}
                  <span className="hidden xs:inline sm:inline">
                    {library.flatPlaylist.length === 1 ? 'video' : 'videos'}
                  </span>
                </span>
              </button>
            </Tooltip>

            {/* Subtle Vertical Separator */}
            <div
              className="w-px my-1.5 bg-slate-300/80 dark:bg-white/15 shrink-0"
              aria-hidden="true"
            />

            {/* Dropdown Area: ChevronDown */}
            <Tooltip content="More opening options" placement="bottom" disabled={menuOpen}>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={handleMenuToggleClick}
                disabled={isScanning}
                aria-label="More opening options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                data-testid="header-open-menu-button"
                className="flex items-center justify-center px-2 sm:px-2.5 py-1.5 rounded-r-full text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:z-10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </Tooltip>
          </div>
        )
      )}

      {/* Dropdown Menu: Open Folder / Open Files */}
      {menuOpen && (
        <div
          role="menu"
          data-testid={`${variant}-open-menu`}
          onKeyDown={handleMenuKeyDown}
          className={`absolute z-50 mt-2 w-44 rounded-xl glass-panel border border-slate-300/80 dark:border-white/15 shadow-2xl py-1.5 backdrop-blur-xl ${
            variant === 'empty-state' ? 'left-1/2 -translate-x-1/2 top-full' : 'right-0 top-full'
          }`}
        >
          <button
            ref={firstMenuItemRef}
            type="button"
            role="menuitem"
            data-testid={`${variant}-menu-open-folder`}
            onClick={(e) => {
              blurButtonAfterPointerClick(e);
              openedMenuByKeyboardRef.current = false;
              triggerOpenFolder();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300 focus:outline-none focus-visible:bg-sky-500/15 focus-visible:text-sky-700 dark:focus-visible:text-sky-300 transition cursor-pointer text-left"
          >
            <FolderOpen className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>Open Folder</span>
          </button>

          <button
            ref={secondMenuItemRef}
            type="button"
            role="menuitem"
            data-testid={`${variant}-menu-open-files`}
            onClick={(e) => {
              blurButtonAfterPointerClick(e);
              openedMenuByKeyboardRef.current = false;
              triggerOpenFiles();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-sky-500/15 hover:text-sky-700 dark:hover:text-sky-300 focus:outline-none focus-visible:bg-sky-500/15 focus-visible:text-sky-700 dark:focus-visible:text-sky-300 transition cursor-pointer text-left"
          >
            <Film className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>Open Files</span>
          </button>
        </div>
      )}
    </div>
  );
};
