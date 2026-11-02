import { useRef } from 'react';
import { Moon, Sun, FolderOpen, Video, HardDrive } from 'lucide-react';
import { VideoLibrary } from '../types/video';

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
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/30 border border-sky-500/30 text-sky-600 dark:text-sky-400 shadow-inner">
            <Moon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-lg text-slate-900 dark:text-white">
                Luna Player
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-300 dark:border-sky-500/20 font-semibold">
                v1.1
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium hidden sm:block">
              Private browser-based local video player
            </p>
          </div>
        </div>

        {/* Library Info Pill (if loaded) */}
        {library && (
          <div className="hidden md:flex items-center gap-3 px-3.5 py-1.5 rounded-full glass-panel-subtle text-xs border">
            <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-200">
              <HardDrive className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              <span className="truncate max-w-[200px]" title={library.name}>
                {library.name}
              </span>
            </div>
            <span className="text-slate-400 dark:text-slate-500 font-bold">•</span>
            <div className="flex items-center gap-1 text-slate-700 dark:text-slate-400 font-semibold">
              <Video className="h-3.5 w-3.5" />
              <span>
                {library.flatPlaylist.length}{' '}
                {library.flatPlaylist.length === 1 ? 'video' : 'videos'}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="glass-button p-2 rounded-xl text-slate-800 dark:text-slate-200 hover:text-sky-700 dark:hover:text-white transition cursor-pointer"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-600" />
            )}
          </button>

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

          <button
            onClick={handleOpenClick}
            disabled={isScanning}
            className="glass-button flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer disabled:opacity-50 text-slate-900 dark:text-white"
            title={isFsaSupported ? 'Open a local folder' : 'Select a local folder (File picker)'}
          >
            <FolderOpen className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <span>{isScanning ? 'Scanning...' : library ? 'Switch Folder' : 'Open Folder'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
