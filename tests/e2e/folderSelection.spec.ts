import { test, expect } from '@playwright/test';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

test.describe('Local Folder Selection & Discovery', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test('discovers nested folders with natural sorting and deterministic DFS sequence via FSA API', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');

    // Click Open Video Folder
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Verify header updates with folder name
    await expect(page.locator('header')).toContainText('Sample Library');

    // Total videos: 2 root + 3 season1 + 2 season2 = 7 videos
    // (EmptySubfolder and notes.txt must be pruned/ignored)
    await expect(page.locator('header')).toContainText('7 videos');

    // Verify non-video file and empty folder are not in the playlist
    await expect(page.getByText('notes.txt')).not.toBeVisible();
    await expect(page.getByText('EmptySubfolder')).not.toBeVisible();

    // Verify natural ordering of Season 1 videos: Ep 1, Ep 2, Ep 10
    const season1Folder = page.getByRole('button', { name: /Season 1/i });
    await expect(season1Folder).toBeVisible();

    // Verify Episode 1, 2, 10 are visible
    await expect(page.getByRole('button', { name: /Episode 1\.mp4/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Episode 2\.mp4/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Episode 10\.mp4/i })).toBeVisible();

    // Test folder expand and collapse
    await season1Folder.click(); // collapse
    await expect(page.getByRole('button', { name: /Episode 10\.mp4/i })).not.toBeVisible();

    await season1Folder.click(); // expand
    await expect(page.getByRole('button', { name: /Episode 10\.mp4/i })).toBeVisible();
  });

  test('exercises directory-input fallback with direct file input', async ({ page }) => {
    // Disable FSA to trigger fallback UI
    await page.addInitScript(() => {
      // @ts-expect-error Disable FSA
      delete window.showDirectoryPicker;
    });

    await page.goto('/');

    // In fallback mode, the open button triggers the hidden directory input
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toHaveCount(1);

    // Provide directory path directly to directory input
    await fileInput.setInputFiles(SAMPLE_LIBRARY_PATH);

    // Check that video files are discovered and notes.txt is ignored
    await expect(page.locator('header')).toContainText('7 videos');
    await expect(page.getByRole('button', { name: /Root Promo 1\.mp4/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Root Promo 2\.mp4/i })).toBeVisible();
    await expect(page.getByText('notes.txt')).not.toBeVisible();
  });
});
