import { useEffect, useRef, useState } from 'react';
import { useVideoLibrary } from './hooks/useVideoLibrary';
import { usePlayback } from './hooks/usePlayback';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Header';
import { VideoPlayer } from './components/VideoPlayer';
import { PlayerControls } from './components/PlayerControls';
import { Playlist } from './components/Playlist';
import { EmptyState } from './components/EmptyState';
import { RecoveryBanner } from './components/RecoveryBanner';
import { loadSettings, saveSettings } from './services/progressStorage';
import { ListVideo, PanelRightOpen } from 'lucide-react';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [showTheaterPlaylist, setShowTheaterPlaylist] = useState(false);
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
    currentIndex,
    totalCount,
    hasNext,
    hasPrevious,
    selectVideo,
    playNext,
    playPrevious,
    toggleAutoplayNext,
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

  const toggleTheaterMode = () => {
    setIsTheaterMode((prev) => !prev);
  };

  useEffect(() => {
    if (!isTheaterMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !document.fullscreenElement &&
        !document.querySelector('[data-testid="extract-audio-modal"]')
      ) {
        setIsTheaterMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTheaterMode]);

  const handleSetPlaylistCollapsed = (collapsed: boolean) => {
    setIsPlaylistCollapsed(collapsed);
    saveSettings({ playlistCollapsed: collapsed });
  };

  return (
    <div
      className={`relative min-h-screen flex flex-col font-sans transition-colors duration-300 selection:bg-sky-500/30 selection:text-sky-700 dark:selection:text-sky-200 overflow-x-hidden ${
        theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
      }`}
    >
      {/* Distant Panoramic Mountain Backdrop */}
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

      {/* Foreground Content Container */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <Header
          library={library}
          onOpenFolder={openFolder}
          onFallbackSelect={handleFallbackFiles}
          isFsaSupported={isFsaSupported}
          isScanning={isScanning}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Reauthorization / Directory Recovery Banner */}
        {storedHandlePrompt && (
          <RecoveryBanner
            prompt={storedHandlePrompt}
            onGrant={reauthorizeStoredHandle}
            onDismiss={dismissStoredHandle}
          />
        )}

      {/* Main Workspace */}
      <main
        className={`flex-1 flex flex-col w-full mx-auto p-4 sm:p-6 lg:p-8 transition-all duration-300 ${
          isTheaterMode ? 'max-w-[1600px]' : 'max-w-7xl'
        }`}
      >
        {library && library.flatPlaylist.length > 0 ? (
          isTheaterMode ? (
            /* --- Theater Mode Layout --- */
            <div className="flex flex-col gap-4 w-full">
              {/* Full Width Theater Video Player */}
              <div className="w-full flex justify-center">
                <VideoPlayer
                  videoRef={videoRef}
                  currentVideo={currentVideo}
                  videoSrc={videoSrc}
                  isPlaying={isPlaying}
                  autoplayBlocked={autoplayBlocked}
                  playerError={playerError}
                  isTheaterMode={true}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeeked={handleSeeked}
                  onVideoError={handleVideoError}
                  onEnded={handleEnded}
                  onManualPlay={handleManualPlay}
                />
              </div>

              {/* Theater Mode Controls */}
              <PlayerControls
                currentVideo={currentVideo}
                currentIndex={currentIndex}
                totalCount={totalCount}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                autoplayNext={autoplayNext}
                isTheaterMode={true}
                onPlayNext={playNext}
                onPlayPrevious={playPrevious}
                onToggleAutoplayNext={toggleAutoplayNext}
                onToggleTheaterMode={toggleTheaterMode}
              />

              {/* Toggleable Playlist in Theater Mode */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setShowTheaterPlaylist((prev) => !prev)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl glass-button text-xs font-semibold cursor-pointer shadow-sm text-slate-800 dark:text-slate-200"
                  >
                    <ListVideo className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span>
                      {showTheaterPlaylist ? 'Hide Playlist' : `Show Playlist (${totalCount} videos)`}
                    </span>
                  </button>
                </div>

                {showTheaterPlaylist && (
                  <div className="h-[480px] w-full mt-2 animate-in fade-in duration-200">
                    <Playlist
                      library={library}
                      currentVideo={currentVideo}
                      onSelectVideo={(video) => selectVideo(video, true)}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* --- Normal Split Screen Layout (with collapsible desktop Playlist sidebar) --- */
            <div
              className="relative flex flex-col lg:flex-row lg:items-stretch w-full gap-6 lg:gap-0"
              data-testid="desktop-split-layout"
            >
              {/* Left Column: Video Player & Controls */}
              <div
                data-testid="player-column"
                className={`w-full flex flex-col gap-4 min-w-0 lg:transition-all lg:duration-200 ease-out ${
                  isPlaylistCollapsed
                    ? 'lg:max-w-5xl xl:max-w-[1080px] lg:mx-auto'
                    : 'lg:flex-1'
                }`}
              >
                <VideoPlayer
                  videoRef={videoRef}
                  currentVideo={currentVideo}
                  videoSrc={videoSrc}
                  isPlaying={isPlaying}
                  autoplayBlocked={autoplayBlocked}
                  playerError={playerError}
                  isTheaterMode={false}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  onPlay={handlePlay}
                  onPause={handlePause}
                  onSeeked={handleSeeked}
                  onVideoError={handleVideoError}
                  onEnded={handleEnded}
                  onManualPlay={handleManualPlay}
                />

                <PlayerControls
                  currentVideo={currentVideo}
                  currentIndex={currentIndex}
                  totalCount={totalCount}
                  hasNext={hasNext}
                  hasPrevious={hasPrevious}
                  autoplayNext={autoplayNext}
                  isTheaterMode={false}
                  onPlayNext={playNext}
                  onPlayPrevious={playPrevious}
                  onToggleAutoplayNext={toggleAutoplayNext}
                  onToggleTheaterMode={toggleTheaterMode}
                />
              </div>

              {/* Right Column: Hierarchical Playlist (Matches Player Column height on lg desktop, stacked on mobile/tablet) */}
              <aside
                aria-label="Playlist sidebar"
                data-testid="playlist-sidebar"
                className={`relative w-full h-[520px] sm:h-[580px] lg:h-auto shrink-0 lg:transition-all lg:duration-200 ease-out ${
                  isPlaylistCollapsed
                    ? 'lg:w-0 lg:ml-0 lg:opacity-0 lg:translate-x-4 lg:pointer-events-none lg:overflow-hidden'
                    : 'lg:w-[360px] xl:w-[400px] lg:ml-6 lg:opacity-100 lg:translate-x-0'
                }`}
              >
                <div className="w-full h-full lg:absolute lg:inset-y-0 lg:left-0 lg:w-[360px] xl:w-[400px]">
                  <Playlist
                    library={library}
                    currentVideo={currentVideo}
                    onSelectVideo={(video) => selectVideo(video, true)}
                    onCollapseSidebar={() => handleSetPlaylistCollapsed(true)}
                  />
                </div>
              </aside>

              {/* Right-edge reopen button when Playlist is collapsed on desktop */}
              {isPlaylistCollapsed && (
                <button
                  type="button"
                  onClick={() => handleSetPlaylistCollapsed(false)}
                  className="hidden lg:flex fixed right-0 top-24 z-30 items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-l-2xl glass-panel border border-r-0 border-slate-300/80 dark:border-white/15 shadow-xl text-xs font-semibold text-slate-800 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-400 hover:pr-3.5 transition-all duration-200 cursor-pointer"
                  aria-label="Expand playlist"
                  title={`Show Playlist (${totalCount} videos)`}
                  data-testid="expand-playlist-button"
                >
                  <PanelRightOpen className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Playlist</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-slate-800 dark:text-slate-300 font-mono font-bold">
                    {totalCount}
                  </span>
                </button>
              )}
            </div>
          )
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
      </div>
    </div>
  );
}

export default App;
