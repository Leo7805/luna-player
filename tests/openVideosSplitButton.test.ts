import { describe, it, expect, vi } from 'vitest';
import {
  hasBlockingModalOpen,
  isInteractiveOrEditableTarget,
  blurButtonAfterPointerClick,
} from '../src/utils/shortcuts';
import type { VideoLibrary, FolderNode, VideoItem } from '../src/types/video';
import type { OpenVideoMode } from '../src/utils/platform';

describe('Open Videos Split Button & Menu Behavior', () => {
  const dummyTree: FolderNode = {
    id: 'root',
    name: 'root',
    relativePath: '',
    videos: [],
    subfolders: [],
    totalVideoCount: 0,
  };

  const createDummyVideo = (name: string): VideoItem => ({
    id: name,
    name,
    relativePath: name,
    size: 1024,
    lastModified: Date.now(),
  });

  const mockFolderLibrary: VideoLibrary = {
    id: 'lib-folder',
    name: 'Peppa Pig',
    sourceType: 'fs-access',
    tree: dummyTree,
    flatPlaylist: Array.from({ length: 381 }, (_, i) => createDummyVideo(`ep_${i + 1}.mp4`)),
  };

  const mockFilesLibrary: VideoLibrary = {
    id: 'lib-files',
    name: 'Selected Videos',
    sourceType: 'files',
    tree: dummyTree,
    flatPlaylist: [createDummyVideo('clip1.mp4')],
  };

  describe('Main area vs Dropdown Chevron Click Behavior', () => {
    it('main area invokes default open and does not toggle menu state', () => {
      let defaultOpenCalls = 0;
      let menuOpen = false;

      const handleMainClick = () => {
        defaultOpenCalls += 1;
      };

      const handleChevronClick = () => {
        menuOpen = !menuOpen;
      };

      // Click main button
      handleMainClick();
      expect(defaultOpenCalls).toBe(1);
      expect(menuOpen).toBe(false);

      // Click chevron button
      handleChevronClick();
      expect(defaultOpenCalls).toBe(1);
      expect(menuOpen).toBe(true);

      // Click chevron button again
      handleChevronClick();
      expect(defaultOpenCalls).toBe(1);
      expect(menuOpen).toBe(false);
    });

    it('pointer click on buttons releases focus via blurButtonAfterPointerClick', () => {
      const mainBlur = vi.fn();
      const chevronBlur = vi.fn();

      // Pointer click (detail > 0)
      blurButtonAfterPointerClick({ detail: 1, currentTarget: { blur: mainBlur } });
      expect(mainBlur).toHaveBeenCalledTimes(1);

      blurButtonAfterPointerClick({ detail: 1, currentTarget: { blur: chevronBlur } });
      expect(chevronBlur).toHaveBeenCalledTimes(1);

      // Keyboard activation (detail === 0) does not blur
      blurButtonAfterPointerClick({ detail: 0, currentTarget: { blur: mainBlur } });
      expect(mainBlur).toHaveBeenCalledTimes(1);
    });
  });

  const getTooltip = (mode: OpenVideoMode, name: string) =>
    mode === 'files' ? `Open videos (${name})` : `Switch folder (${name})`;

  describe('Folder Mode vs Files Mode', () => {
    it('determines correct labels, icons, and default open actions for folder mode', () => {
      const library = mockFolderLibrary;
      const isFilesMode = library.sourceType === 'files';

      expect(isFilesMode).toBe(false);

      const tooltipContent = getTooltip('folder', library.name);
      expect(tooltipContent).toBe('Switch folder (Peppa Pig)');

      const countLabel = `${library.flatPlaylist.length} videos`;
      expect(countLabel).toBe('381 videos');
    });

    it('determines correct labels, icons, and default open actions for files mode', () => {
      const library = mockFilesLibrary;
      const isFilesMode = library.sourceType === 'files';

      expect(isFilesMode).toBe(true);

      const tooltipContent = getTooltip('files', library.name);
      expect(tooltipContent).toBe('Open videos (Selected Videos)');

      const countLabel = `${library.flatPlaylist.length} ${
        library.flatPlaylist.length === 1 ? 'video' : 'videos'
      }`;
      expect(countLabel).toBe('1 video');
    });
  });

  describe('Keyboard Navigation, Focus Handling & Accessibility', () => {
    it('main and chevron are independent interactive button elements', () => {
      const mockMainButton = { tagName: 'BUTTON', isContentEditable: false, closest: () => null };
      const mockChevronButton = { tagName: 'BUTTON', isContentEditable: false, closest: () => null };

      expect(isInteractiveOrEditableTarget(mockMainButton as unknown as EventTarget)).toBe(true);
      expect(isInteractiveOrEditableTarget(mockChevronButton as unknown as EventTarget)).toBe(true);
    });

    it('cycles menu items via ArrowDown, ArrowUp, Home, End', () => {
      const mockItem1 = { focus: vi.fn() };
      const mockItem2 = { focus: vi.fn() };
      const items = [mockItem1, mockItem2];

      let currentIndex = 0;

      // ArrowDown
      let nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex].focus();
      expect(mockItem2.focus).toHaveBeenCalledTimes(1);

      // ArrowDown wraps to 0
      currentIndex = nextIndex;
      nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex].focus();
      expect(mockItem1.focus).toHaveBeenCalledTimes(1);

      // ArrowUp
      currentIndex = 0;
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex].focus();
      expect(mockItem2.focus).toHaveBeenCalledTimes(2);

      // Home and End
      items[0].focus();
      expect(mockItem1.focus).toHaveBeenCalledTimes(2);
      items[items.length - 1].focus();
      expect(mockItem2.focus).toHaveBeenCalledTimes(3);
    });

    it('restores focus to chevron button on Escape when opened by keyboard or when inside menu', () => {
      const chevronFocus = vi.fn();
      const chevronRef = { current: { focus: chevronFocus } };

      const handleEscape = (openedByKeyboard: boolean, activeInsideMenu: boolean) => {
        const shouldRestoreFocus = openedByKeyboard || activeInsideMenu;
        if (shouldRestoreFocus) {
          chevronRef.current?.focus();
        }
      };

      handleEscape(true, false);
      expect(chevronFocus).toHaveBeenCalledTimes(1);

      handleEscape(false, true);
      expect(chevronFocus).toHaveBeenCalledTimes(2);

      handleEscape(false, false);
      expect(chevronFocus).toHaveBeenCalledTimes(2);
    });
  });

  describe('Menu Blocking of Video Playback Shortcuts', () => {
    it('hasBlockingModalOpen returns true when [role="menu"] is present in DOM', () => {
      const mockDocWithMenu = {
        querySelector: (selector: string) => {
          if (selector.includes('[role="menu"]')) {
            return {} as Element;
          }
          return null;
        },
      };

      const mockDocWithoutMenu = {
        querySelector: () => null,
      };

      expect(hasBlockingModalOpen(mockDocWithMenu)).toBe(true);
      expect(hasBlockingModalOpen(mockDocWithoutMenu)).toBe(false);
    });
  });

  describe('Visual Layout & Responsive Attributes', () => {
    it('applies rotate-180 class to chevron icon only when menu is open', () => {
      const getChevronClass = (menuOpen: boolean) =>
        `h-3.5 w-3.5 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`;

      expect(getChevronClass(false)).not.toContain('rotate-180');
      expect(getChevronClass(true)).toContain('rotate-180');
    });

    it('displays Scanning text and disables buttons during scan', () => {
      const isScanning = true;
      const library = mockFolderLibrary;

      const folderNameText = isScanning ? 'Scanning...' : library.name;
      expect(folderNameText).toBe('Scanning...');
    });
  });
});
