import { test, expect } from '@playwright/test';
import {
  loadFixtureDirectory,
  installDirectoryPickerMock,
  SAMPLE_LIBRARY_PATH,
} from './helpers/mockDirectory';

test.describe('Batch Audio Extractor UI', () => {
  test.setTimeout(10000);
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);

  test('renders Extract Audio action in Playlist header and opens dialog with format & folder options', async ({
    page,
  }) => {
    await installDirectoryPickerMock(page, 'Sample Library', fixtureFiles);
    await page.goto('/');
    await page.getByRole('button', { name: /open video folder/i }).click();
    await expect(page.locator('header')).toContainText('Sample Library');

    // Verify Extract Audio button is visible in Playlist header
    const extractBtn = page.getByRole('button', { name: /extract audio/i });
    await expect(extractBtn).toBeVisible();

    await extractBtn.click();

    // Verify dialog opens with video count and format options
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('extract-audio-total-count')).toHaveText('7 videos');

    // MP3 is selected by default
    const mp3Radio = dialog.getByRole('radio', { name: /MP3/i });
    const webmRadio = dialog.getByRole('radio', { name: /WebM \(Opus\)/i });
    await expect(mp3Radio).toBeChecked();
    await expect(webmRadio).not.toBeChecked();

    // Example output previews nested folder structure in .mp3, then updates to .webm
    await expect(page.getByTestId('example-output-path')).toHaveText('Season 1 / Episode 1.mp3');
    await webmRadio.check();
    await expect(page.getByTestId('example-output-path')).toHaveText('Season 1 / Episode 1.webm');

    // Choosing the same folder as the source triggers the conflict warning
    await dialog.getByRole('button', { name: /choose folder/i }).click();
    await expect(page.getByTestId('selected-output-folder')).toHaveText('Sample Library');
    await expect(page.getByTestId('same-folder-warning')).toBeVisible();

    // Cancel closes the dialog
    await dialog.getByRole('button', { name: /cancel/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
