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
    await page.getByTestId('open-videos-button').click();
    await expect(page.locator('header')).toContainText('Sample Library');

    // Verify Extract Audio button is visible and enabled in Playlist header
    const extractBtn = page.getByTestId('extract-audio-button');
    await expect(extractBtn).toBeVisible();
    await expect(extractBtn).toBeEnabled();

    await extractBtn.click();

    // Verify dialog opens with Folder Mode copy, video count, and format options
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('extract-audio-total-count')).toHaveText('7 videos');
    await expect(page.getByTestId('extract-audio-source-description')).toHaveText(
      'Extract audio from all videos in the current folder'
    );
    await expect(page.getByTestId('extract-audio-ready-count')).toHaveText(
      '7 videos ready for extraction'
    );
    await expect(page.getByTestId('extract-audio-output-mode')).toHaveText(
      'Preserve original folder structure'
    );

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

  test('enables Extract Audio in File Mode with a single video and shows flat output preview', async ({
    page,
  }) => {
    const sampleVideo = fixtureFiles.find((f) => f.name.endsWith('.mp4'))!;
    await installDirectoryPickerMock(page, 'Output Audio', []);
    await page.addInitScript(
      ({ file }) => {
        const binaryString = atob(file.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const fileObj = new File([bytes], 'Lesson 01.mp4', {
          type: 'video/mp4',
          lastModified: 1700000000000,
        });
        window.showOpenFilePicker = async () => [
          {
            kind: 'file',
            name: 'Lesson 01.mp4',
            queryPermission: async () => 'granted',
            requestPermission: async () => 'granted',
            getFile: async () => fileObj,
          } as unknown as FileSystemFileHandle,
        ];
      },
      { file: sampleVideo }
    );

    await page.goto('/');
    await page.getByTestId('open-videos-menu-button').click();
    await page.getByTestId('empty-state-menu-open-files').click();
    await expect(page.locator('header')).toContainText('Selected Videos');

    const extractBtn = page.getByTestId('extract-audio-button');
    await expect(extractBtn).toBeVisible();
    await expect(extractBtn).toBeEnabled();
    await expect(extractBtn).toHaveAttribute('aria-label', 'Extract Audio');

    await extractBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('extract-audio-total-count')).toHaveText('1 video');
    await expect(page.getByTestId('extract-audio-source-description')).toHaveText(
      'Extract audio from all videos in the current playlist'
    );
    await expect(page.getByTestId('extract-audio-ready-count')).toHaveText(
      '1 video ready for extraction'
    );
    await expect(page.getByTestId('extract-audio-output-mode')).toHaveText(
      'Save extracted audio directly into the chosen output folder'
    );
    await expect(page.getByTestId('example-output-path')).toHaveText('Lesson 01.mp3');

    await dialog.getByRole('radio', { name: /WebM \(Opus\)/i }).check();
    await expect(page.getByTestId('example-output-path')).toHaveText('Lesson 01.webm');

    await dialog.getByRole('button', { name: /choose folder/i }).click();
    await expect(page.getByTestId('selected-output-folder')).toHaveText('Output Audio');
    await expect(page.getByTestId('same-folder-warning')).not.toBeVisible();
  });

  test('supports multiple File Mode playlist videos including duplicate filenames', async ({
    page,
  }) => {
    const sampleVideo = fixtureFiles.find((f) => f.name.endsWith('.mp4'))!;
    await installDirectoryPickerMock(page, 'Selected Videos', []);
    await page.addInitScript(
      ({ file }) => {
        const binaryString = atob(file.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const names = ['Episode 01.mp4', 'Episode 01.mp4', 'Video B.mp4'];
        window.showOpenFilePicker = async () =>
          names.map((name, idx) => {
            const fileObj = new File([bytes], name, {
              type: 'video/mp4',
              lastModified: 1700000000000 + idx,
            });
            return {
              kind: 'file',
              name,
              queryPermission: async () => 'granted',
              requestPermission: async () => 'granted',
              getFile: async () => fileObj,
            } as unknown as FileSystemFileHandle;
          });
      },
      { file: sampleVideo }
    );

    await page.goto('/');
    await page.getByTestId('open-videos-menu-button').click();
    await page.getByTestId('empty-state-menu-open-files').click();

    const extractBtn = page.getByTestId('extract-audio-button');
    await expect(extractBtn).toBeEnabled();
    await extractBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('extract-audio-total-count')).toHaveText('3 videos');
    await expect(page.getByTestId('extract-audio-ready-count')).toHaveText(
      '3 videos ready for extraction'
    );
    await expect(page.getByTestId('example-output-path')).toHaveText('Episode 01.mp3');

    // Even if output folder is named "Selected Videos", File Mode must not show same-folder warning
    await dialog.getByRole('button', { name: /choose folder/i }).click();
    await expect(page.getByTestId('selected-output-folder')).toHaveText('Selected Videos');
    await expect(page.getByTestId('same-folder-warning')).not.toBeVisible();
  });
});
