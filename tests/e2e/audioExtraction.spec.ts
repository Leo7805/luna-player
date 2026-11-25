import { test, expect } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
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

test.describe('Background Audio Extraction & Minimizable Panel', () => {
  test.describe.configure({ mode: 'serial' });
  const fixtureFiles = loadFixtureDirectory(SAMPLE_LIBRARY_PATH);
  let server: PreviewServer;
  const previewUrl = 'http://localhost:5189/';

  test.beforeAll(async () => {
    await build({ logLevel: 'silent' });
    server = await preview({ preview: { port: 5189, strictPort: true } });
  });

  test.afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) =>
        server.httpServer.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  test('minimizes active Folder Mode extraction, keeps player & Theater Mode interactive, restores without duplicating, and cancels cleanly', async ({
    page,
  }) => {
    test.setTimeout(30000);

    await page.addInitScript(() => {
      // Build a tiny valid PCM WAV (FFmpeg auto-detects format by header) for real local encoding
      const wav = new ArrayBuffer(44 + 8000 * 2);
      const view = new DataView(wav);
      const writeAscii = (offset: number, value: string) =>
        [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      writeAscii(0, 'RIFF');
      view.setUint32(4, wav.byteLength - 8, true);
      writeAscii(8, 'WAVE');
      writeAscii(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 8000, true);
      view.setUint32(28, 16000, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeAscii(36, 'data');
      view.setUint32(40, 16000, true);

      const sourceNames = ['Track 1.mp4', 'Track 2.mp4', 'Track 3.mp4'];
      const sourceFiles = sourceNames.map(
        (name) => new File([wav], name, { type: 'video/mp4', lastModified: 1700000000000 })
      );

      const sourceDirHandle: any = {
        kind: 'directory',
        name: 'Audio Batch Folder',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        isSameEntry: async (other: any) => other === sourceDirHandle,
        async *values() {
          for (const file of sourceFiles) {
            yield {
              kind: 'file',
              name: file.name,
              queryPermission: async () => 'granted',
              requestPermission: async () => 'granted',
              getFile: async () => file,
            };
          }
        },
      };

      const writtenFiles = new Map<string, Uint8Array<ArrayBuffer>>();
      const writeResolvers: Array<() => void> = [];

      (window as any).__writtenAudioFiles = () => Array.from(writtenFiles.keys());
      (window as any).__pendingWrites = () => writeResolvers.length;
      (window as any).__releaseNextWrite = () => {
        const next = writeResolvers.shift();
        if (next) next();
      };

      const outputDirHandle: any = {
        kind: 'directory',
        name: 'Extracted Audio',
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
        isSameEntry: async (other: any) => other === outputDirHandle,
        getDirectoryHandle: async () => outputDirHandle,
        getFileHandle: async (name: string, opts?: { create?: boolean }) => {
          if (!opts?.create && !writtenFiles.has(name)) {
            throw new DOMException('Not found', 'NotFoundError');
          }
          return {
            kind: 'file',
            name,
            getFile: async () => new File([writtenFiles.get(name) ?? new Uint8Array()], name),
            createWritable: async () => {
              let pendingData: Uint8Array<ArrayBuffer> | null = null;
              let aborted = false;
              let abortReject: ((err: unknown) => void) | null = null;
              return {
                write: async (data: Uint8Array) => {
                  pendingData = new Uint8Array(data);
                  await new Promise<void>((resolve, reject) => {
                    abortReject = reject;
                    writeResolvers.push(resolve);
                  });
                },
                close: async () => {
                  if (!aborted && pendingData) {
                    writtenFiles.set(name, pendingData);
                  }
                },
                abort: async () => {
                  aborted = true;
                  if (abortReject) {
                    abortReject(new DOMException('Aborted', 'AbortError'));
                  }
                },
              };
            },
          };
        },
      };

      let pickerCalls = 0;
      window.showDirectoryPicker = async () => {
        pickerCalls++;
        return pickerCalls === 1 ? sourceDirHandle : outputDirHandle;
      };
    });

    await page.goto(previewUrl);
    await page.getByTestId('open-videos-button').click();
    await expect(page.locator('header')).toContainText('Audio Batch Folder');

    // Open Extract Audio dialog, select output folder, and start extraction
    await page.getByTestId('extract-audio-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /choose folder/i }).click();
    await expect(page.getByTestId('selected-output-folder')).toHaveText('Extracted Audio');

    await page.getByTestId('extract-audio-start-button').click();

    // Wait until file 1 reaches the gated write stage
    await expect.poll(() => page.evaluate(() => (window as any).__pendingWrites()), {
      timeout: 15000,
    }).toBe(1);

    // Minimize the expanded dialog
    await page.getByTestId('extract-audio-minimize-button').click();
    await expect(dialog).not.toBeVisible();

    const floatingPanel = page.getByTestId('extract-audio-floating-panel');
    await expect(floatingPanel).toBeVisible();
    await expect(page.getByTestId('floating-progress-position')).toHaveText('Processing 1 / 3');
    await expect(page.getByTestId('floating-progress-percent')).toHaveText('0%');
    await expect(page.getByTestId('floating-current-file')).toHaveText('Track 1.mp4');
    await expect(page.getByTestId('floating-current-stage')).toHaveText('Saving');
    // Dismiss button must not appear while running
    await expect(page.getByTestId('extract-audio-dismiss-button')).not.toBeVisible();

    // Interact with the playlist & Theater Mode while minimized (shortcuts must work!)
    await page.getByRole('button', { name: /Track 2\.mp4/i }).click();
    await expect(page.getByTestId('video-relative-path')).toHaveText('Track 2.mp4');

    await page.keyboard.press('t');
    await expect(page.getByTestId('playlist-sidebar')).toBeHidden();
    await expect(floatingPanel).toBeVisible();
    await expect(floatingPanel).toHaveClass(/bottom-24/);

    // Escape in minimized mode exits Theater Mode without cancelling extraction
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('playlist-sidebar')).toBeVisible();
    await expect(floatingPanel).toBeVisible();

    // Release file 1 write while minimized -> progress updates live in compact panel
    await page.evaluate(() => (window as any).__releaseNextWrite());
    await expect.poll(() => page.evaluate(() => (window as any).__pendingWrites()), {
      timeout: 15000,
    }).toBe(1);
    await expect(page.getByTestId('floating-progress-position')).toHaveText('Processing 2 / 3');
    await expect(page.getByTestId('floating-progress-percent')).toHaveText('33%');
    await expect(page.getByTestId('floating-count-completed')).toHaveText('1 completed');
    await expect(page.getByTestId('floating-current-file')).toHaveText('Track 2.mp4');

    // Restore expanded dialog -> same batch is active with 1 completed (not restarted)
    await page.getByTestId('extract-audio-restore-button').click();
    await expect(dialog).toBeVisible();
    await expect(floatingPanel).not.toBeVisible();
    await expect(page.getByTestId('count-completed')).toHaveText('1');

    // Pressing Escape while running minimizes instead of cancelling
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(floatingPanel).toBeVisible();

    // Clicking header Close (X) while running also minimizes instead of cancelling
    await page.getByTestId('extract-audio-restore-button').click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('extract-audio-close-button').click();
    await expect(dialog).not.toBeVisible();
    await expect(floatingPanel).toBeVisible();

    // Restore and explicitly Cancel the batch
    await page.getByTestId('extract-audio-restore-button').click();
    await expect(dialog).toBeVisible();
    await page.getByTestId('extract-audio-cancel-button').click();
    await expect(page.getByTestId('batch-status-message')).toContainText(/cancelled/i);
    await expect(page.getByTestId('extract-audio-start-button')).toContainText('Start Again');

    // Minimize cancelled terminal state -> Dismiss button appears and closes panel
    await page.getByTestId('extract-audio-minimize-button').click();
    await expect(floatingPanel).toBeVisible();
    await expect(page.getByTestId('floating-panel-title')).toHaveText('Extraction Cancelled');
    await expect(page.getByTestId('extract-audio-dismiss-button')).toBeVisible();
    await page.getByTestId('extract-audio-dismiss-button').click();
    await expect(floatingPanel).not.toBeVisible();

    // First completed file was preserved
    expect(await page.evaluate(() => (window as any).__writtenAudioFiles())).toEqual([
      'Track 1.mp3',
    ]);
  });

  test('preserves File Mode extraction snapshot across library switch and completes in background', async ({
    page,
  }) => {
    test.setTimeout(30000);

    await page.addInitScript(
      ({ folderFixtures }) => {
        const wav = new ArrayBuffer(44 + 8000 * 2);
        const view = new DataView(wav);
        const writeAscii = (offset: number, value: string) =>
          [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
        writeAscii(0, 'RIFF');
        view.setUint32(4, wav.byteLength - 8, true);
        writeAscii(8, 'WAVE');
        writeAscii(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 8000, true);
        view.setUint32(28, 16000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeAscii(36, 'data');
        view.setUint32(40, 16000, true);

        const fileModeNames = ['Clip A.mp4', 'Clip B.mp4'];
        window.showOpenFilePicker = async () =>
          fileModeNames.map((name) => {
            const fileObj = new File([wav], name, {
              type: 'video/mp4',
              lastModified: 1700000000000,
            });
            return {
              kind: 'file',
              name,
              queryPermission: async () => 'granted',
              requestPermission: async () => 'granted',
              getFile: async () => fileObj,
            } as unknown as FileSystemFileHandle;
          });

        const writtenFiles = new Map<string, Uint8Array<ArrayBuffer>>();
        const writeResolvers: Array<() => void> = [];
        (window as any).__writtenAudioFiles = () => Array.from(writtenFiles.keys());
        (window as any).__pendingWrites = () => writeResolvers.length;
        (window as any).__releaseNextWrite = () => {
          const next = writeResolvers.shift();
          if (next) next();
        };

        const outputDirHandle: any = {
          kind: 'directory',
          name: 'Flat Audio Out',
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          getDirectoryHandle: async () => outputDirHandle,
          getFileHandle: async (name: string, opts?: { create?: boolean }) => {
            if (!opts?.create && !writtenFiles.has(name)) {
              throw new DOMException('Not found', 'NotFoundError');
            }
            return {
              kind: 'file',
              name,
              getFile: async () => new File([writtenFiles.get(name) ?? new Uint8Array()], name),
              createWritable: async () => {
                let pendingData: Uint8Array<ArrayBuffer> | null = null;
                return {
                  write: async (data: Uint8Array) => {
                    pendingData = new Uint8Array(data);
                    await new Promise<void>((resolve) => writeResolvers.push(resolve));
                  },
                  close: async () => {
                    if (pendingData) writtenFiles.set(name, pendingData);
                  },
                  abort: async () => {},
                };
              },
            };
          },
        };

        const otherFolderFiles = folderFixtures
          .filter((f: any) => f.name.endsWith('.mp4'))
          .slice(0, 4)
          .map((f: any) => new File([wav], f.name, { type: 'video/mp4', lastModified: 1700000000000 }));

        const otherFolderHandle: any = {
          kind: 'directory',
          name: 'Other Folder',
          queryPermission: async () => 'granted',
          requestPermission: async () => 'granted',
          async *values() {
            for (const file of otherFolderFiles) {
              yield {
                kind: 'file',
                name: file.name,
                queryPermission: async () => 'granted',
                requestPermission: async () => 'granted',
                getFile: async () => file,
              };
            }
          },
        };

        let dirPickerCalls = 0;
        window.showDirectoryPicker = async () => {
          dirPickerCalls++;
          // First call is Output Folder for extraction; second call is switching to Other Folder
          return dirPickerCalls === 1 ? outputDirHandle : otherFolderHandle;
        };
      },
      { folderFixtures: fixtureFiles }
    );

    await page.goto(previewUrl);
    await page.getByTestId('open-videos-menu-button').click();
    await page.getByTestId('empty-state-menu-open-files').click();
    await expect(page.locator('header')).toContainText('Selected Videos');

    // Start File Mode extraction and minimize while file 1 is saving
    await page.getByTestId('extract-audio-button').click();
    await page.getByTestId('extract-audio-start-button').click();
    await expect.poll(() => page.evaluate(() => (window as any).__pendingWrites()), {
      timeout: 15000,
    }).toBe(1);

    await page.getByTestId('extract-audio-minimize-button').click();
    const floatingPanel = page.getByTestId('extract-audio-floating-panel');
    await expect(floatingPanel).toBeVisible();

    // Switch displayed library to a different 4-video folder while extraction is running
    await page.getByTestId('folder-switch-pill').click();
    await expect(page.locator('header')).toContainText('Other Folder');
    await expect(page.locator('header')).toContainText('4 videos');

    // Release both File Mode writes and verify original 2-video snapshot finishes cleanly
    await page.evaluate(() => (window as any).__releaseNextWrite());
    await expect.poll(() => page.evaluate(() => (window as any).__pendingWrites()), {
      timeout: 15000,
    }).toBe(1);
    await page.evaluate(() => (window as any).__releaseNextWrite());

    await expect(page.getByTestId('floating-panel-title')).toHaveText('Extraction Complete', {
      timeout: 15000,
    });
    await expect(page.getByTestId('floating-progress-percent')).toHaveText('100%');
    await expect(page.getByTestId('floating-count-completed')).toHaveText('2 completed');
    expect(await page.evaluate(() => (window as any).__writtenAudioFiles())).toEqual([
      'Clip A.mp3',
      'Clip B.mp3',
    ]);

    // Restoring dialog still shows original File Mode batch details (2 videos, playlist wording)
    await page.getByTestId('extract-audio-restore-button').click();
    await expect(page.getByTestId('extract-audio-total-count')).toHaveText('2 videos');
    await expect(page.getByTestId('extract-audio-source-description')).toHaveText(
      'Extract audio from all videos in the current playlist'
    );

    // Minimize and dismiss completed panel
    await page.getByTestId('extract-audio-minimize-button').click();
    await page.getByTestId('extract-audio-dismiss-button').click();
    await expect(floatingPanel).not.toBeVisible();
  });
});
