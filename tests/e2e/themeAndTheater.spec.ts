import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

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
    await page.getByRole('button', { name: /open video folder/i }).click();

    const videoContainer = page.locator('video').locator('..');
    await expect(videoContainer).toHaveClass(/bg-slate-950/);

    const themeToggleBtn = page.getByRole('button', { name: /switch to/i });
    const currentClass = (await page.locator('html').getAttribute('class')) || '';

    // Toggle theme once
    await themeToggleBtn.click();
    const nextClass = (await page.locator('html').getAttribute('class')) || '';
    expect(nextClass).not.toBe(currentClass);
    await expect(videoContainer).toHaveClass(/bg-slate-950/);

    // Toggle theme back
    await themeToggleBtn.click();
    const revertedClass = (await page.locator('html').getAttribute('class')) || '';
    expect(revertedClass).toBe(currentClass);
    await expect(videoContainer).toHaveClass(/bg-slate-950/);
  });

  test('toggles theater mode, centers video, and preserves playback state seamlessly', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

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
    const theaterBtn = page.getByRole('button', { name: /theater mode/i }).first();
    await theaterBtn.click();

    // Verify theater mode is active (video height expands)
    await expect(page.getByRole('button', { name: /exit theater mode/i }).first()).toBeVisible();

    const theaterBox = await video.boundingBox();
    expect(theaterBox).not.toBeNull();
    // Theater height should be greater than normal height
    expect(theaterBox!.height).toBeGreaterThanOrEqual(normalBox!.height);

    // Verify video is centered and maintains aspect ratio
    await expect(video).toHaveClass(/object-contain/);
    await expect(video).toHaveClass(/mx-auto/);

    // Verify playback state is preserved (still playing around 1.5s)
    const currentTimeInTheater = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTimeInTheater).toBeGreaterThanOrEqual(1.4);

    // Test collapsible playlist in theater mode
    const playlistToggleBtn = page.getByRole('button', { name: /playlist/i });
    await expect(playlistToggleBtn).toBeVisible();
    await playlistToggleBtn.click();
    await expect(page.getByRole('heading', { name: 'Playlist', level: 3 })).toBeVisible();

    // Exit theater mode
    const exitTheaterBtn = page.getByRole('button', { name: /exit theater mode/i }).first();
    await exitTheaterBtn.click();

    // Verify normal mode is restored
    await expect(page.getByRole('button', { name: /enter theater mode/i }).first()).toBeVisible();

    // Verify playback state is still preserved
    const currentTimeAfterExit = await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    expect(currentTimeAfterExit).toBeGreaterThanOrEqual(1.4);
  });

  test('overlay auto-hides after idle interval during playback and reappears on pointer activity', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    const playerContainer = video.locator('..');
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

    // Pause video - overlay should remain visible without auto-hiding
    await video.evaluate((el: HTMLVideoElement) => el.pause());
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-100/);
  });

  test('overlay remains accessible and visible when navigated via keyboard Tab while auto-hidden', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    const overlay = page.getByTestId('video-top-overlay');
    const theaterBtn = overlay.getByRole('button', { name: /theater mode/i });
    const fullscreenBtn = overlay.getByRole('button', { name: /fullscreen/i });

    // Start video playback looped so it does not complete during idle waits
    await video.evaluate((el: HTMLVideoElement) => {
      el.loop = true;
      el.play();
    });

    // Move pointer away to ensure no hover activity
    await page.mouse.move(0, 0);

    // Wait for the 2.5s idle auto-hide timer to trigger
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-0/);

    // Starting with overlay hidden, use real keyboard Tab navigation to reach overlay controls
    let reachedTheaterBtn = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const isFocused = await theaterBtn.evaluate((el) => el === document.activeElement);
      if (isFocused) {
        reachedTheaterBtn = true;
        break;
      }
    }

    expect(reachedTheaterBtn).toBe(true);
    await expect(theaterBtn).toBeFocused();

    // Overlay must immediately be visible once focused via Tab
    await expect(overlay).toHaveClass(/opacity-100/);

    // Overlay must remain visible while keyboard focus is held (even after idle duration)
    await page.waitForTimeout(3000);
    await expect(overlay).toHaveClass(/opacity-100/);

    // Activate Theater Mode via keyboard (Enter key)
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /exit theater mode/i }).first()).toBeVisible();

    // Advance focus to next overlay control (Fullscreen button) via Tab
    await page.keyboard.press('Tab');
    await expect(fullscreenBtn).toBeFocused();
    await expect(overlay).toHaveClass(/opacity-100/);

    // Tab out of the overlay controls to the next element
    await page.keyboard.press('Tab');
    expect(await fullscreenBtn.evaluate((el) => el === document.activeElement)).toBe(false);

    // After focus moves outside the overlay and mouse remains inactive, overlay should auto-hide
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

    await page.getByRole('button', { name: /open video folder/i }).click();

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
    const searchInput = page.getByPlaceholder(/search videos/i);
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
    await page.getByRole('button', { name: /open video folder/i }).click();

    await page.screenshot({ path: path.join(screenshotsDir, '1-desktop-1440-light.png') });

    // Viewport 2: Desktop (1440 × 900) - Light Theme Theater Mode
    const theaterBtn = page.getByRole('button', { name: /theater mode/i }).first();
    await theaterBtn.click();
    await expect(page.getByRole('button', { name: /exit theater mode/i }).first()).toBeVisible();
    await page.screenshot({ path: path.join(screenshotsDir, '2-desktop-1440-theater-light.png') });

    // Viewport 3: Laptop (1280 × 800) - Dark Theme
    await page.setViewportSize({ width: 1280, height: 800 });
    const themeBtn = page.getByRole('button', { name: /switch to/i });
    await themeBtn.click();
    await page.screenshot({ path: path.join(screenshotsDir, '3-laptop-1280-theater-dark.png') });

    // Viewport 4: Mobile (375 × 667) - Light Theme
    await page.setViewportSize({ width: 375, height: 667 });
    // Exit theater mode
    const exitTheaterBtn = page.getByRole('button', { name: /exit theater mode/i }).first();
    await exitTheaterBtn.click();
    await themeBtn.click(); // switch to light
    await page.screenshot({ path: path.join(screenshotsDir, '4-mobile-375-normal-light.png') });

    // Verify screenshots were written to disk
    expect(fs.existsSync(path.join(screenshotsDir, '1-desktop-1440-light.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '2-desktop-1440-theater-light.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '3-laptop-1280-theater-dark.png'))).toBe(true);
    expect(fs.existsSync(path.join(screenshotsDir, '4-mobile-375-normal-light.png'))).toBe(true);
  });
});
