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
import { ListVideo } from 'lucide-react';
import sceneryBg from './assets/scenery.webp';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [showTheaterPlaylist, setShowTheaterPlaylist] = useState(false);

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

  return (
    <div
      className={`relative min-h-screen flex flex-col font-sans transition-colors duration-300 selection:bg-sky-500/30 selection:text-sky-700 dark:selection:text-sky-200 overflow-x-hidden ${
        theme === 'dark' ? 'text-slate-100' : 'text-slate-900'
      }`}
    >
      {/* High-Resolution Scenic Photographic Background (Moraine Lake & Alpine Peaks) */}
      <div
        className="fixed inset-0 pointer-events-none z-0 bg-cover bg-center bg-no-repeat transition-all duration-700"
        style={{ backgroundImage: `url(${sceneryBg})` }}
        data-testid="scenic-background"
      />

      {/* Theme-Aware Atmospheric Ambient Overlays */}
      <div
        className={`fixed inset-0 pointer-events-none z-0 transition-colors duration-500 ${
          theme === 'dark'
            ? 'bg-slate-950/70 backdrop-blur-[2px]'
            : 'bg-gradient-to-b from-sky-100/30 via-white/10 to-sky-50/30 backdrop-blur-[0.5px]'
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
                  onToggleTheaterMode={toggleTheaterMode}
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
            /* --- Normal Split Screen Layout --- */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
              {/* Left Column: Video Player & Controls (8 cols on lg) */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                <VideoPlayer
                  videoRef={videoRef}
                  currentVideo={currentVideo}
                  videoSrc={videoSrc}
                  isPlaying={isPlaying}
                  autoplayBlocked={autoplayBlocked}
                  playerError={playerError}
                  isTheaterMode={false}
                  onToggleTheaterMode={toggleTheaterMode}
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

              {/* Right Column: Hierarchical Playlist (4 cols on lg) */}
              <div className="lg:col-span-4 h-[650px] lg:sticky lg:top-20">
                <Playlist
                  library={library}
                  currentVideo={currentVideo}
                  onSelectVideo={(video) => selectVideo(video, true)}
                />
              </div>
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
