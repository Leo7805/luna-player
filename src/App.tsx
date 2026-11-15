import React, { useEffect, useRef, useState } from 'react';
import { useVideoLibrary } from './hooks/useVideoLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { Playlist } from './components/Playlist';
import { EmptyState } from './components/EmptyState';
import { RecoveryBanner } from './components/RecoveryBanner';
import { Tooltip } from './components/Tooltip';
import { loadSettings, saveSettings } from './services/progressStorage';
import { PanelRightOpen } from 'lucide-react';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isPlaylistCollapsed, setIsPlaylistCollapsed] = useState<boolean>(
    () => Boolean(loadSettings().playlistCollapsed)
  );

  const {
    library,
    isScanning,
    scanCount,
    error,
    storedHandlePrompt,
    openFolder,
    reauthorizeStoredHandle,
    dismissStoredHandle,
    handleFallbackFiles,
    isFsaSupported,
  } = useVideoLibrary();

  const {
    videoRef,
    currentVideo,
    videoSrc,
    isPlaying,
    autoplayBlocked,
    playerError,
    autoplayNext,
    currentTime,
    duration,
    volume,
    muted,
    currentIndex,
    totalCount,
    hasNext,
    hasPrevious,
    selectVideo,
    playNext,
    playPrevious,
    toggleAutoplayNext,
    togglePlayPause,
    seekTo,
    setVolume,
    toggleMute,
    handleVolumeChange,
    handleLoadedMetadata,
    handleTimeUpdate,
    handlePlay,
    handlePause,
    handleSeeked,
    handleVideoError,
    handleEnded,
    handleManualPlay,
  } = usePlayback({ library });

  // Remember the last played video ID in settings when video changes
  useEffect(() => {
    if (currentVideo && library) {
      saveSettings({
        lastPlayedId: currentVideo.id,
        lastLibraryId: library.id,
      });
    }
  }, [currentVideo, library]);

  // When a library is newly loaded, attempt to queue the last played video or the first video
  const initialLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (library && library.flatPlaylist.length > 0 && initialLoadRef.current !== library.id) {
      initialLoadRef.current = library.id;

      const settings = loadSettings();
      let targetVideo = library.flatPlaylist[0];

      if (settings.lastLibraryId === library.id && settings.lastPlayedId) {
        const found = library.flatPlaylist.find((v) => v.id === settings.lastPlayedId);
        if (found) targetVideo = found;
      }

      // Pre-select without forcing immediate loud unprompted autoplay
      selectVideo(targetVideo, false);
    }
  }, [library, selectVideo]);

  const hasVideos = Boolean(library && library.flatPlaylist.length > 0);
  const isTheaterActive = isTheaterMode && hasVideos;

  const toggleTheaterMode = () => {
    setIsTheaterMode((prev) => !prev);
  };

  useEffect(() => {
    if (isTheaterMode && !hasVideos) {
      setIsTheaterMode(false);
    }
  }, [isTheaterMode, hasVideos]);

  useEffect(() => {
    if (!isTheaterActive) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isTheaterActive]);

  useEffect(() => {
    if (!isTheaterActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !document.fullscreenElement &&
        !document.querySelector('[role="dialog"]') &&
        !document.querySelector('[data-testid="extract-audio-modal"]')
      ) {
        setIsTheaterMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterActive]);

  const handleSetPlaylistCollapsed = (collapsed: boolean) => {
    setIsPlaylistCollapsed(collapsed);
    saveSettings({ playlistCollapsed: collapsed });
  };

  const mainStageStyle = {
    '--player-max-h': 'clamp(220px, calc(100dvh - 8.25rem), 760px)',
  } as React.CSSProperties;

  return (
    <div
      className={`relative min-h-dvh flex flex-col font-sans transition-colors duration-300 selection:bg-sky-500/30 selection:text-sky-700 dark:selection:text-sky-200 overflow-x-hidden ${
        isTheaterActive
          ? 'bg-black text-slate-100'
          : theme === 'dark'
          ? 'text-slate-100'
          : 'text-slate-900'
      }`}
    >
      {/* Distant Panoramic Mountain Backdrop (hidden in Theater Mode) */}
      {!isTheaterActive && (
        <>
          <div
            className={`fixed inset-0 pointer-events-none z-0 bg-cover bg-center md:bg-[center_35%] bg-no-repeat transition-all duration-700 ${
              theme === 'dark'
                ? 'brightness-[0.82] contrast-[1.05] saturate-[0.95]'
                : 'brightness-[1.02] contrast-[0.98] saturate-[1.05]'
            }`}
            style={{ backgroundImage: "url('/assets/scenery-distant.jpeg')" }}
            data-testid="scenic-background"
          />

          {/* Theme-Aware Atmospheric Ambient Overlays & Subtle Blur */}
          <div
            className={`fixed inset-0 pointer-events-none z-0 transition-all duration-500 ${
              theme === 'dark'
                ? 'bg-slate-950/45 backdrop-blur-[2.5px]'
                : 'bg-gradient-to-b from-sky-950/10 via-sky-500/5 to-slate-900/15 backdrop-blur-[1.5px]'
            }`}
          />
        </>
      )}

      {/* Foreground Content Container */}
      <div className="relative z-10 flex flex-col min-h-dvh">
        {/* Header (kept mounted, hidden in Theater Mode) */}
        <div
          className={isTheaterActive ? 'hidden' : undefined}
          aria-hidden={isTheaterActive || undefined}
          inert={isTheaterActive ? true : undefined}
        >
          <Header
            library={library}
            onOpenFolder={openFolder}
            onFallbackSelect={handleFallbackFiles}
            isFsaSupported={isFsaSupported}
            isScanning={isScanning}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </div>

        {/* Reauthorization / Directory Recovery Banner */}
        {storedHandlePrompt && (
          <div
            className={isTheaterActive ? 'hidden' : undefined}
            aria-hidden={isTheaterActive || undefined}
            inert={isTheaterActive ? true : undefined}
          >
            <RecoveryBanner
              prompt={storedHandlePrompt}
              onGrant={reauthorizeStoredHandle}
              onDismiss={dismissStoredHandle}
            />
          </div>
        )}

        {/* Main Workspace */}
        <main
          style={isTheaterActive ? undefined : mainStageStyle}
          className={`flex-1 flex flex-col justify-center w-full mx-auto ${
            isTheaterActive
              ? 'p-0 max-w-none'
              : 'px-4 sm:px-6 lg:px-8 py-3 lg:py-4 max-w-[1520px] transition-all duration-300'
          }`}
        >
          {hasVideos && library ? (
            /* --- Unified Layout Tree (Normal Split Screen & Immersive Theater Mode share one DOM tree) --- */
            <div
              className={`relative flex flex-col lg:flex-row lg:items-stretch w-full mx-auto gap-5 lg:gap-0 ${
                isTheaterActive
                  ? 'max-w-none'
                  : isPlaylistCollapsed
                  ? 'lg:max-w-[min(1080px,calc(var(--player-max-h)*16/9))]'
                  : 'lg:max-w-[min(100%,calc(var(--player-max-h)*16/9+408px))]'
              }`}
              data-testid="desktop-split-layout"
            >
              {/* Left Column: Video Player (with integrated controls; fixed full-viewport in Theater Mode) */}
              <div
                data-testid="player-column"
                className="w-full flex flex-col min-w-0 lg:flex-1 lg:transition-all lg:duration-200 ease-out"
              >
                <VideoPlayer
                  videoRef={videoRef}
                  currentVideo={currentVideo}
                  videoSrc={videoSrc}
                  isPlaying={isPlaying}
                  autoplayBlocked={autoplayBlocked}
                  playerError={playerError}
                  currentTime={currentTime}
                  duration={duration}
                  volume={volume}
                  muted={muted}
                  currentIndex={currentIndex}
                  totalCount={totalCount}
                  hasNext={hasNext}
                  hasPrevious={hasPrevious}
                  autoplayNext={autoplayNext}
                  isTheaterMode={isTheaterActive}
                  onToggleTheaterMode={toggleTheaterMode}
                  onToggleAutoplayNext={toggleAutoplayNext}
                  onTogglePlayPause={togglePlayPause}
                  onSeek={seekTo}
                  onPlayNext={playNext}
                  onPlayPrevious={playPrevious}
                  onToggleMute={toggleMute}
                  onVolumeChange={setVolume}
                  onNativeVolumeChange={handleVolumeChange}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeeked={handleSeeked}
                  onError={handleVideoError}
                  onEnded={handleEnded}
                  onManualPlay={handleManualPlay}
                />
              </div>

              {/* Right Column: Hierarchical Playlist (kept mounted & hidden in Theater Mode to preserve state) */}
              <aside
                aria-label="Playlist sidebar"
                data-testid="playlist-sidebar"
                aria-hidden={isTheaterActive || undefined}
                inert={isTheaterActive ? true : undefined}
                className={`relative w-full h-[460px] sm:h-[520px] lg:h-auto shrink-0 lg:transition-all lg:duration-200 ease-out ${
                  isTheaterActive
                    ? 'hidden'
                    : isPlaylistCollapsed
                    ? 'lg:w-0 lg:ml-0 lg:opacity-0 lg:translate-x-4 lg:pointer-events-none lg:overflow-hidden'
                    : 'lg:w-[360px] xl:w-[384px] lg:ml-6 lg:opacity-100 lg:translate-x-0'
                }`}
              >
                <div className="w-full h-full lg:absolute lg:inset-y-0 lg:left-0 lg:w-[360px] xl:w-[384px]">
                  <Playlist
                    library={library}
                    currentVideo={currentVideo}
                    onSelectVideo={(video) => selectVideo(video, true)}
                    onCollapseSidebar={() => handleSetPlaylistCollapsed(true)}
                  />
                </div>
              </aside>

              {/* Right-edge icon-only reopen button when Playlist is collapsed on desktop (hidden in Theater Mode) */}
              {isPlaylistCollapsed && !isTheaterActive && (
                <div className="hidden lg:flex fixed right-3 top-24 z-30">
                  <Tooltip content="Show Playlist" placement="left">
                    <button
                      type="button"
                      onClick={() => handleSetPlaylistCollapsed(false)}
                      className="inline-flex items-center justify-center p-2 rounded-xl glass-button shadow-lg text-slate-800 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition cursor-pointer"
                      aria-label="Show Playlist"
                      data-testid="expand-playlist-button"
                    >
                      <PanelRightOpen className="h-4 w-4 shrink-0" />
                    </button>
                  </Tooltip>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              onOpenFolder={openFolder}
              onFallbackSelect={handleFallbackFiles}
              isFsaSupported={isFsaSupported}
              isScanning={isScanning}
              scanCount={scanCount}
              error={error}
            />
          )}
        </main>

        {/* Minimal Copyright Footer (hidden in Theater Mode) */}
        <footer
          data-testid="app-footer"
          aria-hidden={isTheaterActive || undefined}
          className={`w-full py-2 px-4 text-center text-xs text-slate-500 dark:text-slate-400/80 shrink-0 select-none ${
            isTheaterActive ? 'hidden' : ''
          }`}
        >
          © 2026 Jin Liu · MIT License
        </footer>
      </div>
    </div>
  );
}

export default App;
