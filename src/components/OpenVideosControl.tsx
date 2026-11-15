import React, { useRef, useState, useEffect } from 'react';
import { FolderOpen, Film, MoreHorizontal } from 'lucide-react';
import { OpenVideoMode } from '../utils/platform';
import { VideoLibrary } from '../types/video';
import { Tooltip } from './Tooltip';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface OpenVideosControlProps {
  variant: 'empty-state' | 'header';
  library?: VideoLibrary | null;
  defaultOpenMode: OpenVideoMode;
  isFsaSupported: boolean;
  isScanning: boolean;
  scanCount?: number;
  onOpenFolder: () => void;
  onFallbackFolderSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
}

export const OpenVideosControl: React.FC<OpenVideosControlProps> = ({
  variant,
  library,
  defaultOpenMode,
  isFsaSupported,
  isScanning,
  scanCount = 0,
  onOpenFolder,
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
    filesInputRef.current?.click();
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
    <div ref={containerRef} className="relative inline-flex items-center gap-1.5 min-w-0">
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
        <>
          <button
            type="button"
            onClick={(e) => {
              blurButtonAfterPointerClick(e);
              triggerDefaultOpen();
            }}
            disabled={isScanning}
            data-testid="open-videos-button"
            className="flex items-center gap-3 px-7 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm shadow-xl shadow-sky-500/25 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {defaultOpenMode === 'files' ? (
              <Film className="h-5 w-5" />
            ) : (
              <FolderOpen className="h-5 w-5" />
            )}
            <span>
              {isScanning ? `Scanning (${scanCount} found)...` : 'Open Videos'}
            </span>
          </button>

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
              className="inline-flex items-center justify-center p-3.5 rounded-2xl glass-button text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer disabled:opacity-50"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </Tooltip>
        </>
      ) : (
        library && (
          <>
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
                className="group flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full glass-panel-subtle text-xs border border-slate-300/80 dark:border-white/15 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:border-sky-500/40 dark:hover:border-sky-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer disabled:opacity-50 min-w-0 max-w-full"
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
                className="glass-button p-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-sky-700 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </Tooltip>
          </>
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
