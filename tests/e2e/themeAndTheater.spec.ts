import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import {
  loadFixtureDirectory,
  installDirectoryPickerMock,
  openFolderFromEmptyState,
  SAMPLE_LIBRARY_PATH,
} from './helpers/mockDirectory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('Theme & Theater Mode Enhancements (V1.1)', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test('toggles light/dark theme and persists preference in localStorage', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');

    const themeToggleBtn = page.getByRole('button', { name: /switch to/i });
    await expect(themeToggleBtn).toBeVisible();

    // Default theme check (dark by default or matches OS)
    const initialTheme = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });

    // Toggle theme
    await themeToggleBtn.click();

    // Verify root html class toggles
    const newTheme = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    expect(newTheme).not.toBe(initialTheme);

    // Verify localStorage persistence
    const storedTheme = await page.evaluate(() => localStorage.getItem('luna_theme'));
    expect(storedTheme).toBe(newTheme);

    // Reload page and verify theme choice persists
    await page.reload();
    const persistedTheme = await page.evaluate(() => {
      return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    expect(persistedTheme).toBe(newTheme);
  });

  test('keeps video player canvas dark in both light and dark themes', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    const videoContainer = page.getByTestId('video-player-container');
    await expect(videoContainer).toHaveClass(/bg-black/);

    const themeToggleBtn = page.getByTestId('theme-toggle-button');
    const currentClass = (await page.locator('html').getAttribute('class')) || '';

    // Toggle theme once
    await themeToggleBtn.click();
    const nextClass = (await page.locator('html').getAttribute('class')) || '';
    expect(nextClass).not.toBe(currentClass);
    await expect(videoContainer).toHaveClass(/bg-black/);

    // Toggle theme back
    await themeToggleBtn.click();
    const revertedClass = (await page.locator('html').getAttribute('class')) || '';
    expect(revertedClass).toBe(currentClass);
    await expect(videoContainer).toHaveClass(/bg-black/);
  });

  test('toggles theater mode, centers video, and preserves playback state seamlessly', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    // Select Season 1/Episode 1
    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => el.duration);
    }).toBeGreaterThan(0);

    // Seek to 1.5 seconds and play
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = 1.5;
      el.play();
    });

    // Verify initial normal mode dimensions
    const normalBox = await video.boundingBox();
    expect(normalBox).not.toBeNull();

    // Enter theater mode via controls button
    const theaterBtn = page.getByTestId('theater-mode-button');
    await theaterBtn.click();

    // Verify theater mode is active (full viewport, playlist hidden)
    await expect(theaterBtn).toHaveAttribute('aria-label', 'Exit Theater Mode');
    await expect(page.getByTestId('playlist-sidebar')).toBeHidden();

    const theaterBox = await video.boundingBox();
    expect(theaterBox).not.toBeNull();
    // Theater height should be greater than normal height
    expect(theaterBox!.height).toBeGreaterThanOrEqual(normalBox!.height);

    // Verify video maintains aspect ratio inside centered container
    await expect(video).toHaveClass(/object-contain/);
    await expect(page.getByTestId('video-player-container')).toHaveClass(/items-center/);
    await expect(page.getByTestId('video-player-container')).toHaveClass(/justify-center/);

    // Verify playback state is preserved (still playing around 1.5s)
    const currentTimeInTheater = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTimeInTheater).toBeGreaterThanOrEqual(1.4);

    // Exit theater mode
    await theaterBtn.click();

    // Verify normal mode and playlist sidebar are restored
    await expect(theaterBtn).toHaveAttribute('aria-label', 'Enter Theater Mode');
    await expect(page.getByTestId('playlist-sidebar')).toBeVisible();

    // Verify playback state is still preserved
    const currentTimeAfterExit = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTimeAfterExit).toBeGreaterThanOrEqual(1.4);
  });

  test('overlay auto-hides after idle interval during playback and reappears on pointer activity', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    const playerContainer = page.getByTestId('video-player-container');
    const overlay = page.getByTestId('video-top-overlay');

    // Start video playback (looped so it does not reach the end during the 3s idle wait)
    await video.evaluate((el: HTMLVideoElement) => {
      el.loop = true;
      el.play();
    });

    // Trigger mouse movement over video container
    await playerContainer.hover({ position: { x: 100, y: 100 } });
    await expect(overlay).toHaveClass(/opacity-100/);

    // Wait for the 2.5s idle auto-hide timer to trigger
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-0/);

    // Move pointer again over video
    await playerContainer.hover({ position: { x: 120, y: 120 } });
    await expect(overlay).toHaveClass(/opacity-100/);

    // Pause video - overlay remains visible during the shorter 3s window (paused delay is 4s)
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-100/);
  });

  test('overlay remains accessible and visible when navigated via keyboard Tab', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    const playerContainer = page.getByTestId('video-player-container');
    const overlay = page.getByTestId('video-top-overlay');
    const theaterBtn = page.getByTestId('theater-mode-button');

    // Start video playback looped so it does not complete during idle waits
    await video.evaluate((el: HTMLVideoElement) => {
      el.loop = true;
      el.play();
    });

    // Reveal overlay via pointer activity, then use keyboard Tab to focus Theater Mode button
    await playerContainer.hover({ position: { x: 100, y: 100 } });
    await expect(overlay).toHaveClass(/opacity-100/);

    await page.getByTestId('theme-toggle-button').focus();
    let reachedTheaterBtn = false;
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      if (await theaterBtn.evaluate((el) => el === document.activeElement)) {
        reachedTheaterBtn = true;
        break;
      }
    }

    expect(reachedTheaterBtn).toBe(true);
    await expect(theaterBtn).toBeFocused();
    await expect(overlay).toHaveClass(/opacity-100/);

    // Move pointer away so only keyboard focus keeps the overlay visible past the 2.5s idle timeout
    await page.mouse.move(0, 0);
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-100/);

    // Activate Theater Mode via keyboard (Enter key)
    await page.keyboard.press('Enter');
    await expect(theaterBtn).toHaveAttribute('aria-label', 'Exit Theater Mode');

    // Exit Theater Mode via Escape and move focus outside the player container
    await page.keyboard.press('Escape');
    await expect(theaterBtn).toHaveAttribute('aria-label', 'Enter Theater Mode');
    await page.getByTestId('theme-toggle-button').focus();

    // After focus moves outside the player and mouse remains inactive, overlay auto-hides
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-0/);
  });

  test('verifies Light Theme typography contrast, panel opacity, and playlist legibility', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');

    // Force light theme
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('luna_theme', 'light');
    });
    await page.reload();

    await openFolderFromEmptyState(page);

    // Verify header branding contrast
    const brandTitle = page.locator('header').getByText('Luna Player');
    await expect(brandTitle).toBeVisible();

    // Check computed text color of brand title in Light theme
    const titleColor = await brandTitle.evaluate((el) => window.getComputedStyle(el).color);
    // slate-900 is rgb(15, 23, 42) or oklch(0.208 ...) in Tailwind 4
    expect(titleColor.includes('15, 23, 42') || titleColor.includes('0.208')).toBe(true);

    // Verify folder header text in playlist has strong contrast
    const folderTitle = page.getByRole('button', { name: /Season 1/i }).locator('span').first();
    const folderColor = await folderTitle.evaluate((el) => window.getComputedStyle(el).color);
    expect(folderColor.includes('15, 23, 42') || folderColor.includes('0.208')).toBe(true);

    // Verify unselected video item text has readable contrast (slate-800: rgb(30, 41, 59) or oklch(0.279 ...))
    const ep2Item = page.getByRole('button', { name: /Episode 2\.mp4/i }).first().locator('p').first();
    const ep2Color = await ep2Item.evaluate((el) => window.getComputedStyle(el).color);
    expect(ep2Color.includes('30, 41, 59') || ep2Color.includes('0.279')).toBe(true);

    // Verify search input has solid dark text
    await page.getByTestId('toggle-search-button').click();
    const searchInput = page.getByTestId('playlist-search-input');
    const searchColor = await searchInput.evaluate((el) => window.getComputedStyle(el).color);
    expect(searchColor.includes('15, 23, 42') || searchColor.includes('0.208')).toBe(true);
  });

  test('captures visual verification screenshots across desktop, laptop, and mobile viewports', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Banff Expedition', fixtureFiles);

    const screenshotsDir = path.resolve(__dirname, '../../screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Viewport 1: Desktop (1440 × 900) - Light Theme
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('luna_theme', 'light');
    });
    await page.reload();
    await openFolderFromEmptyState(page);

    await page.screenshot({ path: path.join(screenshotsDir, '1-desktop-1440-light.png') });

    // Viewport 2: Desktop (1440 × 900) - Light Theme Theater Mode
    const playerContainer = page.getByTestId('video-player-container');
    const theaterBtn = page.getByTestId('theater-mode-button');
    await playerContainer.hover();
    await theaterBtn.click();
    await expect(theaterBtn).toHaveAttribute('aria-label', 'Exit Theater Mode');
    await page.screenshot({ path: path.join(screenshotsDir, '2-desktop-1440-theater-light.png') });

    // Viewport 3: Laptop (1280 × 800) - Dark Theme Theater Mode
    await theaterBtn.click(); // exit theater mode to toggle theme in header
    await page.setViewportSize({ width: 1280, height: 800 });
    const themeBtn = page.getByTestId('theme-toggle-button');
    await themeBtn.click();
    await playerContainer.hover();
    await theaterBtn.click();
    await page.screenshot({ path: path.join(screenshotsDir, '3-laptop-1280-theater-dark.png') });

    // Viewport 4: Mobile (375 × 667) - Light Theme
    await page.setViewportSize({ width: 375, height: 667 });
    await playerContainer.hover();
    await theaterBtn.click(); // exit theater mode
    await themeBtn.click(); // switch to light
    await page.screenshot({ path: path.join(screenshotsDir, '4-mobile-375-normal-light.png') });

    // Verify screenshots were written to disk
    expect(fs.existsSync(path.join(screenshotsDir, '1-desktop-1440-light.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '2-desktop-1440-theater-light.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '3-laptop-1280-theater-dark.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '4-mobile-375-normal-light.png'))).toBe(true);
  });
});
