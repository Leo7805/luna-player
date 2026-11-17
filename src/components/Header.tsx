import React from 'react';
import { Moon, Sun, Settings } from 'lucide-react';
import { VideoLibrary } from '../types/video';
import { OpenVideoMode } from '../utils/platform';
import { Tooltip } from './Tooltip';
import { OpenVideosControl } from './OpenVideosControl';
import { blurButtonAfterPointerClick } from '../utils/shortcuts';

interface HeaderProps {
  library: VideoLibrary | null;
  onOpenFolder: () => void;
  onFallbackSelect: (files: FileList | null) => void;
  onOpenFilesSelect: (files: FileList | null) => void;
  defaultOpenMode: OpenVideoMode;
  isFsaSupported: boolean;
  isScanning: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: (openedByKeyboard: boolean) => void;
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Header({
  library,
  onOpenFolder,
  onFallbackSelect,
  onOpenFilesSelect,
  defaultOpenMode,
  isFsaSupported,
  isScanning,
  theme,
  onToggleTheme,
  onOpenSettings,
  settingsButtonRef,
}: HeaderProps) {

  return (
    <header className="glass-panel sticky top-0 z-40 px-4 py-3 sm:px-6 lg:px-8 backdrop-blur-xl transition-colors duration-300">
      <div className="w-full flex items-center justify-between gap-3 sm:gap-4 min-w-0">
        {/* Brand (Left) */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center shrink-0">
            <img
              src="/favicon.svg"
              alt="Luna Player"
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain drop-shadow-sm"
            />
          </div>
          <div>
            <span className="block font-bold tracking-tight text-base sm:text-lg leading-tight text-slate-900 dark:text-white">
              Luna Player
            </span>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:block">
              Local Video Player
            </p>
          </div>
        </div>

        {/* Actions (Right: Open Videos Split Button + Settings + Theme Toggle) */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5 min-w-0 flex-1">
          <OpenVideosControl
            variant="header"
            library={library}
            defaultOpenMode={defaultOpenMode}
            isFsaSupported={isFsaSupported}
            isScanning={isScanning}
            onOpenFolder={onOpenFolder}
            onFallbackFolderSelect={onFallbackSelect}
            onOpenFilesSelect={onOpenFilesSelect}
          />

          {/* Settings Button */}
          <Tooltip content="Keyboard & Control Settings" placement="bottom">
            <button
              ref={settingsButtonRef}
              type="button"
              onClick={(e) => {
                const openedByKeyboard = e.detail === 0;
                blurButtonAfterPointerClick(e);
                onOpenSettings(openedByKeyboard);
              }}
              className="glass-button p-2 rounded-xl text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition cursor-pointer shrink-0"
              aria-label="Keyboard & Control Settings"
              data-testid="settings-button"
            >
              <Settings className="h-4 w-4" />
            </button>
          </Tooltip>

          {/* Theme Toggle (Far Right) */}
          <Tooltip
            content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            placement="bottom"
          >
            <button
              type="button"
              onClick={(e) => {
                blurButtonAfterPointerClick(e);
                onToggleTheme();
              }}
              className="glass-button p-2 rounded-xl text-slate-800 dark:text-slate-200 hover:text-sky-700 dark:hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer shrink-0"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              data-testid="theme-toggle-button"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-indigo-600" />
              )}
            </button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
