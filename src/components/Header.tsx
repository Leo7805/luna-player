import { useRef } from 'react';
import { Moon, Sun, FolderOpen } from 'lucide-react';
import { VideoLibrary } from '../types/video';
import { Tooltip } from './Tooltip';

interface HeaderProps {
  library: VideoLibrary | null;
  onOpenFolder: () => void;
  onFallbackSelect: (files: FileList | null) => void;
  isFsaSupported: boolean;
  isScanning: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export function Header({
  library,
  onOpenFolder,
  onFallbackSelect,
  isFsaSupported,
  isScanning,
  theme,
  onToggleTheme,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleOpenClick = () => {
    if (isFsaSupported) {
      onOpenFolder();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <header className="glass-panel sticky top-0 z-40 px-4 py-3 sm:px-6 backdrop-blur-xl transition-colors duration-300">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4 min-w-0">
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

        {/* Actions (Right: Clickable Folder Pill + Theme Toggle) */}
        <div className="flex items-center justify-end gap-2 sm:gap-2.5 min-w-0 flex-1">
          {/* Hidden directory input fallback */}
          <input
            ref={fileInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is standard in HTML5 directory inputs
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
            onChange={(e) => {
              onFallbackSelect(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Clickable Folder Information Pill */}
          {library && (
            <Tooltip content={`Switch folder (${library.name})`} placement="bottom">
              <button
                type="button"
                onClick={handleOpenClick}
                disabled={isScanning}
                className="group flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full glass-panel-subtle text-xs border border-slate-300/80 dark:border-white/15 hover:bg-slate-200/70 dark:hover:bg-white/10 hover:border-sky-500/40 dark:hover:border-sky-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer disabled:opacity-50 min-w-0 max-w-full"
                aria-label="Switch folder"
                data-testid="folder-switch-pill"
              >
                <FolderOpen className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 group-hover:scale-105 transition-transform" />
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
          )}

          {/* Theme Toggle (Far Right) */}
          <Tooltip
            content={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            placement="bottom"
          >
            <button
              type="button"
              onClick={onToggleTheme}
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
