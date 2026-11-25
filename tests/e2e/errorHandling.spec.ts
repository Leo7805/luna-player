import { test, expect } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  loadFixtureDirectory,
  installDirectoryPickerMock,
  openFolderFromEmptyState,
  SAMPLE_LIBRARY_PATH,
} from './helpers/mockDirectory';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORRUPT_LIBRARY_PATH = path.resolve(__dirname, '../fixtures/corrupt-library');

test.describe('Error Handling & Asynchronous Edge Cases', () => {
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);
  const corruptFiles = loadFixtureDirectory(CORRUPT_LIBRARY_PATH);

  test('displays friendly error overlay on corrupted video files without crashing', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Corrupted Library', corruptFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    // Select corrupted.mp4
    const corruptBtn = page.getByRole('button', { name: /corrupted\.mp4/i });
    await corruptBtn.click();

    // Verify friendly error overlay appears
    await expect(page.getByText('Playback Issue')).toBeVisible({ timeout: 6000 });

    // Verify app remains responsive and displays active video path
    await expect(page.getByTestId('video-relative-path')).toHaveText('corrupted.mp4');
  });

  test('handles user cancellation of directory picker gracefully', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles, { shouldAbort: true });
    await page.goto('/');

    await openFolderFromEmptyState(page);

    // Empty state should remain intact without error dialog
    await expect(page.getByRole('heading', { name: 'Luna Player', level: 2 })).toBeVisible();
  });

  test('handles permission denial gracefully without crash', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles, { shouldDenyPermission: true });
    await page.goto('/');

    await openFolderFromEmptyState(page);

    // Displays helpful error in UI
    await expect(page.getByText(/Permission was denied/i)).toBeVisible();
  });

  test('rapid video switching cancels earlier file loads without stale content', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await openFolderFromEmptyState(page);

    // Rapidly click between multiple items
    const ep1 = page.getByRole('button', { name: /Episode 1\.mp4/i }).first();
    const ep2 = page.getByRole('button', { name: /Episode 2\.mp4/i }).first();
    const ep10 = page.getByRole('button', { name: /Episode 10\.mp4/i });

    await ep1.click();
    await ep2.click();
    await ep10.click();

    // The final state must accurately reflect the last clicked video (Episode 10)
    await expect(page.getByTestId('video-relative-path')).toContainText('Episode 10.mp4');
    await expect(page.locator('video')).toBeVisible();
  });
});
