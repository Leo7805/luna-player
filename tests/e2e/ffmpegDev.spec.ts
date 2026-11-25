import { test, expect } from '@playwright/test';

/**
 * Real-browser regression tests running directly against the Vite development server (`npm run dev`).
 * Verifies FFmpeg initialization, MP3 & WebM encoding, and Cancel -> Start Again recovery in dev mode.
 */
test.describe('FFmpeg Initialization in Vite Development Mode', () => {
  test('initializes FFmpeg in Vite dev mode, extracts MP3 and WebM, and recovers after Cancel -> Start Again', async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.addInitScript(() => {
      // Tiny valid PCM WAV (FFmpeg auto-detects container format by header) for real local encoding
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

      const sourceFiles = ['Dev Clip 1.mp4', 'Dev Clip 2.mp4'].map(
        (name) => new File([wav], name, { type: 'video/mp4', lastModified: 1700000000000 })
      );

      const sourceDirHandle: any = {
        kind: 'directory',
        name: 'Dev Test Folder',
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
      let pauseNextWrite = false;
      const writeResolvers: Array<() => void> = [];

      (window as any).__setPauseNextWrite = (pause: boolean) => {
        pauseNextWrite = pause;
      };
      (window as any).__pendingWrites = () => writeResolvers.length;
      (window as any).__getWrittenSizes = () =>
        Object.fromEntries(Array.from(writtenFiles.entries()).map(([k, v]) => [k, v.byteLength]));
      (window as any).__clearWrittenFiles = () => {
        writtenFiles.clear();
      };

      const outputDirHandle: any = {
        kind: 'directory',
        name: 'Dev Output Audio',
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
                  if (pauseNextWrite) {
                    pauseNextWrite = false;
                    await new Promise<void>((resolve, reject) => {
                      abortReject = reject;
                      writeResolvers.push(resolve);
                    });
                  }
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

    // Navigate to Playwright's Vite dev server (http://localhost:5193)
    await page.goto('/');
    await page.getByTestId('open-videos-button').click();
    await expect(page.locator('header')).toContainText('Dev Test Folder');

    // Open Extract Audio dialog & choose output folder
    await page.getByTestId('extract-audio-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /choose folder/i }).click();
    await expect(page.getByTestId('selected-output-folder')).toHaveText('Dev Output Audio');

    // 1. Extract MP3 in Vite dev mode
    await page.getByTestId('extract-audio-start-button').click();
    await expect(page.getByTestId('batch-status-message')).toContainText('Finished!', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('count-completed')).toHaveText('2');
    await expect(page.getByTestId('count-failed')).toHaveText('0');

    const mp3Sizes = await page.evaluate(() => (window as any).__getWrittenSizes());
    expect(mp3Sizes['Dev Clip 1.mp3']).toBeGreaterThan(500);
    expect(mp3Sizes['Dev Clip 2.mp3']).toBeGreaterThan(500);

    // 2. Switch to WebM and extract in Vite dev mode
    await dialog.getByRole('radio', { name: /WebM \(Opus\)/i }).check();
    await page.getByTestId('extract-audio-start-button').click();
    await expect(page.getByTestId('batch-status-message')).toContainText('Finished!', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('count-completed')).toHaveText('2');

    const webmSizes = await page.evaluate(() => (window as any).__getWrittenSizes());
    expect(webmSizes['Dev Clip 1.webm']).toBeGreaterThan(500);
    expect(webmSizes['Dev Clip 2.webm']).toBeGreaterThan(500);

    // 3. Cancel mid-batch and click Start Again to verify FFmpeg worker reinitialization in dev mode
    await page.evaluate(() => {
      (window as any).__clearWrittenFiles();
      (window as any).__setPauseNextWrite(true);
    });
    await dialog.getByRole('radio', { name: /MP3/i }).check();
    await page.getByTestId('extract-audio-start-button').click();

    await expect.poll(() => page.evaluate(() => (window as any).__pendingWrites()), {
      timeout: 15_000,
    }).toBe(1);

    await page.getByTestId('extract-audio-cancel-button').click();
    await expect(page.getByTestId('batch-status-message')).toContainText(/cancelled/i);

    // Retry (Start Again) — FFmpeg must reinitialize cleanly after termination
    await page.getByTestId('extract-audio-start-button').click();
    await expect(page.getByTestId('batch-status-message')).toContainText('Finished!', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('count-completed')).toHaveText('2');
    await expect(page.getByTestId('count-failed')).toHaveText('0');

    const retrySizes = await page.evaluate(() => (window as any).__getWrittenSizes());
    expect(retrySizes['Dev Clip 1.mp3']).toBeGreaterThan(500);
    expect(retrySizes['Dev Clip 2.mp3']).toBeGreaterThan(500);
    expect(consoleErrors).toEqual([]);
  });
});
