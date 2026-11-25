import { test, expect } from '@playwright/test';
import {
  loadFixtureDirectory,
  installDirectoryPickerMock,
  openFolderFromEmptyState,
  SAMPLE_LIBRARY_PATH,
} from './helpers/mockDirectory';

test.describe('Playlist Interactions & Search Independence', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test.beforeEach(async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);
    await expect(page.locator('header')).toContainText('Sample Library');
  });

  test('clicking a video activates it and updates the player display', async ({ page }) => {
    // Select Root Promo 2
    const promo2Btn = page.getByRole('button', { name: /Root Promo 2\.mp4/i });
    await promo2Btn.click();

    // Verify player overlay displays "2 of 7" and the filename
    await expect(page.getByTestId('video-position-badge')).toHaveText('2 of 7');
    await expect(page.getByTestId('video-relative-path')).toContainText('Root Promo 2.mp4');

    // Verify active highlighting class
    await expect(promo2Btn).toHaveClass(/bg-sky-500\/20|bg-sky-100\/90/);
  });

  test('Previous and Next navigation traverses deterministic DFS sequence', async ({ page }) => {
    // By default, first video (Root Promo 1) is queued: "1 of 7"
    await expect(page.getByTestId('video-position-badge')).toHaveText('1 of 7');

    const nextBtn = page.getByTestId('next-video-button');
    const prevBtn = page.getByTestId('prev-video-button');

    // Initial state: Prev disabled, Next enabled
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Click Next -> Root Promo 2 ("2 of 7")
    await nextBtn.click();
    await expect(page.getByTestId('video-position-badge')).toHaveText('2 of 7');
    await expect(prevBtn).toBeEnabled();

    // Click Next -> Season 1/Episode 1.mp4 ("3 of 7")
    await nextBtn.click();
    await expect(page.getByTestId('video-position-badge')).toHaveText('3 of 7');
    await expect(page.getByTestId('video-relative-path')).toContainText('Episode 1.mp4');

    // Click Previous -> Root Promo 2 ("2 of 7")
    await prevBtn.click();
    await expect(page.getByTestId('video-position-badge')).toHaveText('2 of 7');
  });

  test('search filters visible playlist items without modifying underlying playback sequence', async ({ page }) => {
    await page.getByTestId('toggle-search-button').click();
    const searchInput = page.getByTestId('playlist-search-input');

    // Currently at video 1 of 7
    await expect(page.getByTestId('video-position-badge')).toHaveText('1 of 7');

    // Search for "Episode 10"
    await searchInput.fill('Episode 10');

    // Playlist should only show matching 1 video
    await expect(page.getByTestId('playlist-count-badge')).toHaveText('1/7');
    await expect(page.getByRole('button', { name: /Episode 10\.mp4/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Root Promo 1\.mp4/i })).not.toBeVisible();

    // The current active video and counter sequence must remain unchanged ("1 of 7")
    await expect(page.getByTestId('video-position-badge')).toHaveText('1 of 7');

    // Clicking Next still advances to video 2 ("Root Promo 2.mp4", "2 of 7")
    await page.getByTestId('video-player-container').hover();
    const nextBtn = page.getByTestId('next-video-button');
    await nextBtn.click();
    await expect(page.getByTestId('video-position-badge')).toHaveText('2 of 7');
    await expect(page.getByTestId('video-relative-path')).toContainText('Root Promo 2.mp4');

    // Clearing search restores all items
    await page.getByTestId('clear-search-button').click();
    await expect(searchInput).toHaveValue('');
    await expect(page.getByRole('button', { name: /Root Promo 1\.mp4/i })).toBeVisible();
  });
});
