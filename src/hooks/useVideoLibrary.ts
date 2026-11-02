import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoLibrary } from '../types/video';
import {
  isFileSystemAccessSupported,
  promptOpenDirectory,
  verifyHandlePermission,
  scanDirectoryHandle,
} from '../services/directoryAccess';
import { parseFileList } from '../services/fallbackAccess';
import {
  getStoredDirectoryHandle,
  storeDirectoryHandle,
  clearStoredDirectoryHandle,
} from '../services/idbStorage';

export interface StoredHandlePrompt {
  handle: FileSystemDirectoryHandle;
  folderName: string;
}

export function useVideoLibrary() {
  const [library, setLibrary] = useState<VideoLibrary | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [storedHandlePrompt, setStoredHandlePrompt] = useState<StoredHandlePrompt | null>(null);

  // Monotonic token to prevent asynchronous folder switching race conditions
  const scanVersionRef = useRef(0);

  // Attempt to restore previously opened folder on startup
  useEffect(() => {
    let isCancelled = false;

    async function checkStoredHandle() {
      if (!isFileSystemAccessSupported()) return;

      try {
        const handle = await getStoredDirectoryHandle();
        if (!handle || isCancelled) return;

        // Check permission without prompting
        const hasPermission = await verifyHandlePermission(handle, false);
        if (isCancelled) return;

        if (hasPermission) {
          // Already authorized (e.g. within active session or persistent grant)
          loadDirectory(handle);
        } else {
          // Prompt user gracefully via banner (requires user gesture)
          setStoredHandlePrompt({
            handle,
            folderName: handle.name || 'Previous Folder',
          });
        }
      } catch {
        // IDB or handle failure; ignore silently and clear stale entry
        clearStoredDirectoryHandle().catch(() => {});
      }
    }

    checkStoredHandle();

    return () => {
      isCancelled = true;
    };
  }, []);

  const loadDirectory = useCallback(async (handle: FileSystemDirectoryHandle) => {
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
    } catch (err: unknown) {
      if (scanVersionRef.current === currentVersion) {
        setError(
          err instanceof Error
            ? `Unable to read folder: ${err.message}`
            : 'Unable to read the selected folder.'
        );
      }
    } finally {
      if (scanVersionRef.current === currentVersion) {
        setIsScanning(false);
      }
    }
  }, []);

  const openFolder = useCallback(async () => {
    try {
      const handle = await promptOpenDirectory();
      if (!handle) return;
      await loadDirectory(handle);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to select folder.'
      );
    }
  }, [loadDirectory]);

  const reauthorizeStoredHandle = useCallback(async () => {
    if (!storedHandlePrompt) return;
    const { handle } = storedHandlePrompt;

    try {
      const granted = await verifyHandlePermission(handle, true);
      if (granted) {
        await loadDirectory(handle);
      } else {
        // User denied permission; clear handle
        setStoredHandlePrompt(null);
        await clearStoredDirectoryHandle();
      }
    } catch {
      setStoredHandlePrompt(null);
      await clearStoredDirectoryHandle();
    }
  }, [storedHandlePrompt, loadDirectory]);

  const dismissStoredHandle = useCallback(async () => {
    setStoredHandlePrompt(null);
    await clearStoredDirectoryHandle();
  }, []);

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

  return {
    library,
    isScanning,
    scanCount,
    error,
    storedHandlePrompt,
    openFolder,
    reauthorizeStoredHandle,
    dismissStoredHandle,
    handleFallbackFiles,
    isFsaSupported: isFileSystemAccessSupported(),
  };
}
