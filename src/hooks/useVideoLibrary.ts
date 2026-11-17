import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoLibrary } from '../types/video';
import {
  isFileSystemAccessSupported,
  promptOpenDirectory,
  verifyHandlePermission,
  scanDirectoryHandle,
} from '../services/directoryAccess';
import {
  isFsaOpenFileSupported,
  promptOpenFiles,
  verifyFileHandlesPermission,
  scanFileHandles,
} from '../services/fileAccess';
import { parseFileList, parseSelectedFiles } from '../services/fallbackAccess';
import { getDefaultOpenMode } from '../utils/platform';
import {
  getStoredDirectoryHandle,
  storeDirectoryHandle,
  clearStoredDirectoryHandle,
  getStoredFileHandles,
  storeFileHandles,
  clearStoredFileHandles,
  getStoredLibrarySource,
  setStoredLibrarySource,
} from '../services/idbStorage';

export interface StoredHandlePrompt {
  sourceType: 'folder' | 'files';
  handle?: FileSystemDirectoryHandle;
  fileHandles?: FileSystemFileHandle[];
  name: string;
  folderName?: string;
}

export function useVideoLibrary() {
  const [library, setLibrary] = useState<VideoLibrary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storedHandlePrompt, setStoredHandlePrompt] = useState<StoredHandlePrompt | null>(null);

  // Monotonic token to prevent asynchronous folder/file switching race conditions
  const scanVersionRef = useRef(0);
  const libraryRef = useRef<VideoLibrary | null>(null);
  libraryRef.current = library;
  const isPickingRef = useRef(false);

  const loadDirectory = useCallback(async (handle: FileSystemDirectoryHandle, isAutoRestore = false) => {
    const currentVersion = ++scanVersionRef.current;
    setIsScanning(true);
    setScanCount(0);
    setError(null);
    setStoredHandlePrompt(null);

    try {
      const scannedLib = await scanDirectoryHandle(handle, (count) => {
        if (scanVersionRef.current === currentVersion) {
          setScanCount(count);
        }
      });

      if (scanVersionRef.current !== currentVersion) {
        return; // Discard stale scan result
      }

      setLibrary(scannedLib);
      await storeDirectoryHandle(handle);
      await setStoredLibrarySource('folder');
    } catch (err: unknown) {
      if (scanVersionRef.current === currentVersion) {
        if (isAutoRestore) {
          // Auto-restoration on startup failed (e.g. folder deleted, moved, or unavailable).
          // Gracefully clean up stale handle without surfacing a misleading error message.
          clearStoredDirectoryHandle().catch(() => {});
        } else {
          setError(
            err instanceof Error
              ? `Unable to read folder: ${err.message}`
              : 'Unable to read the selected folder.'
          );
        }
      }
    } finally {
      if (scanVersionRef.current === currentVersion) {
        setIsScanning(false);
      }
    }
  }, []);

  const loadFilesFromHandles = useCallback(
    async (handles: FileSystemFileHandle[], isAutoRestore = false) => {
      const currentVersion = ++scanVersionRef.current;
      setIsScanning(true);
      setScanCount(0);
      setError(null);
      setStoredHandlePrompt(null);

      try {
        const scannedLib = await scanFileHandles(handles, (count) => {
          if (scanVersionRef.current === currentVersion) {
            setScanCount(count);
          }
        });

        if (scanVersionRef.current !== currentVersion) {
          return;
        }

        if (scannedLib && scannedLib.flatPlaylist.length > 0) {
          setLibrary(scannedLib);
          if (scannedLib.fileHandles && scannedLib.fileHandles.length > 0) {
            await storeFileHandles(scannedLib.fileHandles);
          }
          await setStoredLibrarySource('files');
        } else {
          if (isAutoRestore) {
            clearStoredFileHandles().catch(() => {});
          } else {
            setError('No supported video files could be loaded from the selection.');
          }
        }
      } catch (err: unknown) {
        if (scanVersionRef.current === currentVersion) {
          if (isAutoRestore) {
            clearStoredFileHandles().catch(() => {});
          } else {
            setError(
              err instanceof Error ? err.message : 'Error loading selected files.'
            );
          }
        }
      } finally {
        if (scanVersionRef.current === currentVersion) {
          setIsScanning(false);
        }
      }
    },
    []
  );

  // Restore last active library source on startup
  useEffect(() => {
    let isCancelled = false;

    async function restoreLastLibrary() {
      try {
        const lastSource = await getStoredLibrarySource();
        if (isCancelled) return;

        if (lastSource === 'files') {
          // User last used Open Files: NEVER restore an old directory handle.
          if (!isFsaOpenFileSupported()) return;

          const handles = await getStoredFileHandles();
          if (!handles || handles.length === 0 || isCancelled) return;

          const hasPermission = await verifyFileHandlesPermission(handles, false);
          if (isCancelled) return;

          if (hasPermission) {
            await loadFilesFromHandles(handles, true);
          } else {
            const displayName =
              handles.length === 1
                ? handles[0].name
                : `${handles.length} selected videos`;
            setStoredHandlePrompt({
              sourceType: 'files',
              fileHandles: handles,
              name: displayName,
              folderName: displayName,
            });
          }
          return;
        }

        // Either lastSource is 'folder' or legacy session with a stored directory handle
        if (!isFileSystemAccessSupported()) return;

        const handle = await getStoredDirectoryHandle();
        if (!handle || isCancelled) return;

        // Check permission without prompting
        const hasPermission = await verifyHandlePermission(handle, false);
        if (isCancelled) return;

        if (hasPermission) {
          await loadDirectory(handle, true);
        } else {
          setStoredHandlePrompt({
            sourceType: 'folder',
            handle,
            name: handle.name || 'Previous Folder',
            folderName: handle.name || 'Previous Folder',
          });
        }
      } catch {
        // IDB or handle failure; ignore silently
      }
    }

    restoreLastLibrary();

    return () => {
      isCancelled = true;
    };
  }, [loadDirectory, loadFilesFromHandles]);

  const openFolder = useCallback(async () => {
    if (isPickingRef.current) return;
    isPickingRef.current = true;

    try {
      const handle = await promptOpenDirectory();
      if (!handle) {
        // User cancelled selection: preserve current folder and playlist untouched
        return;
      }

      // Avoid unnecessary directory rescanning if the user selected the already-loaded folder
      const existingHandle = libraryRef.current?.handle;
      if (existingHandle && typeof existingHandle.isSameEntry === 'function') {
        try {
          if (await existingHandle.isSameEntry(handle)) {
            return;
          }
        } catch {
          // Ignore comparison failure and proceed with loading the selected directory
        }
      }

      await loadDirectory(handle, false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to select folder.'
      );
    } finally {
      isPickingRef.current = false;
    }
  }, [loadDirectory]);

  const openFiles = useCallback(async () => {
    if (isPickingRef.current) return;
    isPickingRef.current = true;

    try {
      const handles = await promptOpenFiles();
      if (!handles || handles.length === 0) {
        // User cancelled picker dialog
        return;
      }
      await loadFilesFromHandles(handles, false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to select files.'
      );
    } finally {
      isPickingRef.current = false;
    }
  }, [loadFilesFromHandles]);

  const reauthorizeStoredHandle = useCallback(async () => {
    if (!storedHandlePrompt) return;
    const { sourceType, handle, fileHandles } = storedHandlePrompt;

    try {
      if (sourceType === 'files' && fileHandles) {
        const granted = await verifyFileHandlesPermission(fileHandles, true);
        if (granted) {
          await loadFilesFromHandles(fileHandles, false);
        } else {
          setStoredHandlePrompt(null);
          await clearStoredFileHandles();
        }
      } else if (handle) {
        const granted = await verifyHandlePermission(handle, true);
        if (granted) {
          await loadDirectory(handle, false);
        } else {
          setStoredHandlePrompt(null);
          await clearStoredDirectoryHandle();
        }
      }
    } catch {
      setStoredHandlePrompt(null);
      if (sourceType === 'files') {
        await clearStoredFileHandles();
      } else {
        await clearStoredDirectoryHandle();
      }
    }
  }, [storedHandlePrompt, loadDirectory, loadFilesFromHandles]);

  const dismissStoredHandle = useCallback(async () => {
    if (storedHandlePrompt?.sourceType === 'files') {
      await clearStoredFileHandles();
    } else {
      await clearStoredDirectoryHandle();
    }
    setStoredHandlePrompt(null);
  }, [storedHandlePrompt]);

  const handleFallbackFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    scanVersionRef.current++;
    setIsScanning(true);
    setError(null);
    setStoredHandlePrompt(null);

    try {
      const parsedLib = parseFileList(files);
      if (parsedLib) {
        setLibrary(parsedLib);
        setStoredLibrarySource('folder').catch(() => {});
        clearStoredDirectoryHandle().catch(() => {});
      } else {
        setError('No supported video files were found in this folder.');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error processing selected files.'
      );
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleSelectedFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    scanVersionRef.current++;
    setIsScanning(true);
    setError(null);
    setStoredHandlePrompt(null);

    try {
      const parsedLib = parseSelectedFiles(files);
      if (parsedLib && parsedLib.flatPlaylist.length > 0) {
        setLibrary(parsedLib);
        setStoredLibrarySource('files').catch(() => {});
        clearStoredFileHandles().catch(() => {});
      } else {
        setError('No supported video files were selected.');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Error processing selected files.'
      );
    } finally {
      setIsScanning(false);
    }
  }, []);

  return {
    library,
    isScanning,
    scanCount,
    error,
    storedHandlePrompt,
    openFolder,
    openFiles,
    reauthorizeStoredHandle,
    dismissStoredHandle,
    handleFallbackFiles,
    handleSelectedFiles,
    isFsaSupported: isFileSystemAccessSupported(),
    isFsaOpenFileSupported: isFsaOpenFileSupported(),
    defaultOpenMode: getDefaultOpenMode(),
  };
}
