import { PlaybackProgress, PlayerSettings, createVideoStorageKey } from '../types/video';

const PROGRESS_STORAGE_KEY = 'luna_playback_progress_v1';
const SETTINGS_STORAGE_KEY = 'luna_player_settings_v1';
const MAX_PROGRESS_RECORDS = 500;

export function loadAllProgress(): Record<string, PlaybackProgress> {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PlaybackProgress>;
  } catch {
    return {};
  }
}

export function saveVideoProgress(
  libraryId: string,
  relativePath: string,
  size: number,
  lastModified: number,
  currentTime: number,
  duration: number
): void {
  try {
    if (!libraryId || !relativePath || !Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const key = createVideoStorageKey(libraryId, relativePath, size, lastModified);
    const records = loadAllProgress();

    // Check if video is considered completed (near end: within 15 seconds, > 95%, or at/past duration)
    const isCompleted =
      duration > 0 &&
      (currentTime >= duration - 0.5 ||
        currentTime / duration >= 0.95 ||
        (duration > 15 && duration - currentTime < 15));

    records[key] = {
      currentTime: isCompleted ? 0 : Math.max(0, currentTime),
      duration,
      updatedAt: Date.now(),
      completed: isCompleted,
    };

    // Prune oldest entries if exceeds limit
    const keys = Object.keys(records);
    if (keys.length > MAX_PROGRESS_RECORDS) {
      const sortedKeys = keys.sort((a, b) => (records[a]?.updatedAt || 0) - (records[b]?.updatedAt || 0));
      const toRemove = sortedKeys.slice(0, keys.length - MAX_PROGRESS_RECORDS);
      for (const k of toRemove) {
        delete records[k];
      }
    }

    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Gracefully handle QuotaExceededError or disabled storage
  }
}

export function getVideoProgress(
  libraryId: string,
  relativePath: string,
  size: number,
  lastModified: number
): PlaybackProgress | null {
  try {
    const key = createVideoStorageKey(libraryId, relativePath, size, lastModified);
    const records = loadAllProgress();
    const record = records[key];
    if (!record) return null;

    // Validate sane values
    if (
      !Number.isFinite(record.currentTime) ||
      !Number.isFinite(record.duration) ||
      record.currentTime < 0
    ) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export function loadSettings(): PlayerSettings {
  const defaultSettings: PlayerSettings = {
    autoplayNext: true,
    volume: 1,
    muted: false,
  };

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    return {
      ...defaultSettings,
      ...parsed,
    };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: Partial<PlayerSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore error
  }
}
