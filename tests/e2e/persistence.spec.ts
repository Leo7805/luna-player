import { test, expect } from '@playwright/test';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

test.describe('Playback Position & Progress Persistence', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test('saves progress to localStorage and restores position without cross-video leakage', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Select Season 1/Episode 1 (duration: 3 seconds in fixture)
    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => el.duration);
    }).toBeGreaterThan(0);

    // Seek to 1.2 seconds and trigger pause to save
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = 1.2;
      el.dispatchEvent(new Event('pause'));
    });

    // Verify localStorage has the saved record
    const storedProgress = await page.evaluate(() => {
      return localStorage.getItem('luna_playback_progress_v1');
    });
    expect(storedProgress).not.toBeNull();
    expect(storedProgress).toContain('Season 1/Episode 1.mp4');

    // Switch to another video (Root Promo 1)
    const promo1Btn = page.getByRole('button', { name: /Root Promo 1\.mp4/i });
    await promo1Btn.click();

    // Verify new video starts from beginning (progress did not leak)
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => el.currentTime);
    }).toBeLessThan(0.5);
  });

  test('completed video resets resume position to the beginning', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();

    const ep1Btn = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    await ep1Btn.click();

    const video = page.locator('video');
    await expect.poll(async () => {
      return await video.evaluate((el: HTMLVideoElement) => el.duration);
    }).toBeGreaterThan(0);

    // Fast forward to completed state and dispatch ended
    await video.evaluate((el: HTMLVideoElement) => {
      el.currentTime = el.duration;
      el.dispatchEvent(new Event('ended'));
    });

    // Check that stored progress marks completed and resets currentTime to 0
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('luna_playback_progress_v1');
      return raw ? JSON.parse(raw) : null;
    });

    const ep1Key = Object.keys(stored).find((k) => k.includes('Season 1/Episode 1.mp4'));
    expect(ep1Key).toBeDefined();
    expect(stored[ep1Key!].completed).toBe(true);
    expect(stored[ep1Key!].currentTime).toBe(0);
  });
});
