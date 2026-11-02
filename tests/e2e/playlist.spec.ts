import { test, expect } from '@playwright/test';
import { loadFixtureDirectory, installDirectoryPickerMock, SAMPLE_LIBRARY_PATH } from './helpers/mockDirectory';

test.describe('Playlist Interactions & Search Independence', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test.beforeEach(async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();
    await expect(page.locator('header')).toContainText('Sample Library');
  });

  test('clicking a video activates it and updates the player display', async ({ page }) => {
    // Select Root Promo 2
    const promo2Btn = page.getByRole('button', { name: /Root Promo 2\.mp4/i });
    await promo2Btn.click();

    // Verify player control bar displays "2 of 7" and the filename
    await expect(page.getByText('2 of 7')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Root Promo 2.mp4' })).toBeVisible();

    // Verify active highlighting class
    await expect(promo2Btn).toHaveClass(/bg-sky-500\/20/);
  });

  test('Previous and Next navigation traverses deterministic DFS sequence', async ({ page }) => {
    // By default, first video (Root Promo 1) is queued: "1 of 7"
    await expect(page.getByText('1 of 7')).toBeVisible();

    const nextBtn = page.getByTitle(/next video/i);
    const prevBtn = page.getByTitle(/previous video/i);

    // Initial state: Prev disabled, Next enabled
    await expect(prevBtn).toBeDisabled();
    await expect(nextBtn).toBeEnabled();

    // Click Next -> Root Promo 2 ("2 of 7")
    await nextBtn.click();
    await expect(page.getByText('2 of 7')).toBeVisible();
    await expect(prevBtn).toBeEnabled();

    // Click Next -> Season 1/Episode 1.mp4 ("3 of 7")
    await nextBtn.click();
    await expect(page.getByText('3 of 7')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Episode 1.mp4' })).toBeVisible();

    // Click Previous -> Root Promo 2 ("2 of 7")
    await prevBtn.click();
    await expect(page.getByText('2 of 7')).toBeVisible();
  });

  test('search filters visible playlist items without modifying underlying playback sequence', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search videos/i);

    // Currently at video 1 of 7
    await expect(page.getByText('1 of 7')).toBeVisible();

    // Search for "Episode 10"
    await searchInput.fill('Episode 10');

    // Playlist should only show matching 1 video
    await expect(page.getByText('1/7')).toBeVisible();
    await expect(page.getByRole('button', { name: /Episode 10\.mp4/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Root Promo 1\.mp4/i })).not.toBeVisible();

    // The current active video and counter sequence must remain unchanged ("1 of 7")
    await expect(page.getByText('1 of 7')).toBeVisible();

    // Clicking Next still advances to video 2 ("Root Promo 2.mp4", "2 of 7")
    const nextBtn = page.getByTitle(/next video/i);
    await nextBtn.click();
    await expect(page.getByText('2 of 7')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Root Promo 2.mp4' })).toBeVisible();

    // Clearing search restores all items
    await page.locator('button:has(svg.lucide-x)').click();
    await expect(page.getByPlaceholder(/search videos/i)).toHaveValue('');
    await expect(page.getByRole('button', { name: /Root Promo 1\.mp4/i })).toBeVisible();
  });
});
