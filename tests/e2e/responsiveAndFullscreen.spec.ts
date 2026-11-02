import { test, expect } from '@playwright/test';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

test.describe('Responsive Layout & Display Verification', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test('renders two-column split layout on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Verify main video player and playlist are visible side-by-side
    const video = page.locator('video');
    const playlist = page.getByRole('heading', { name: 'Playlist', level: 3 });

    await expect(video).toBeVisible();
    await expect(playlist).toBeVisible();

    const videoBox = await video.boundingBox();
    const playlistBox = await playlist.boundingBox();

    expect(videoBox).not.toBeNull();
    expect(playlistBox).not.toBeNull();

    // On desktop, playlist is to the right of the video
    expect(playlistBox!.x).toBeGreaterThan(videoBox!.x);
  });

  test('adapts to mobile viewport without horizontal overflow and keeps controls accessible', async ({ page }) => {
    // Set mobile viewport (iPhone SE size)
    await page.setViewportSize({ width: 375, height: 667 });
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Check no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verify player controls remain accessible
    const prevBtn = page.getByTitle(/previous video/i);
    const nextBtn = page.getByTitle(/next video/i);
    const autoplayToggle = page.getByRole('button', { name: /autoplay next/i });

    await expect(prevBtn).toBeVisible();
    await expect(nextBtn).toBeVisible();
    await expect(autoplayToggle).toBeVisible();

    // Scroll to playlist and verify it remains accessible
    const playlistHeader = page.getByRole('heading', { name: 'Playlist', level: 3 });
    await playlistHeader.scrollIntoViewIfNeeded();
    await expect(playlistHeader).toBeVisible();
  });

  test('video element includes native controls and fullscreen readiness', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    const video = page.locator('video');
    await expect(video).toHaveAttribute('controls', '');
    await expect(video).toHaveAttribute('playsinline', '');

    // Verify fullscreen API readiness on video element
    const isFullscreenSupported = await video.evaluate((el: HTMLVideoElement) => {
      return typeof el.requestFullscreen === 'function' || typeof (el as any).webkitRequestFullscreen === 'function';
    });
    expect(isFullscreenSupported).toBe(true);
  });
});
