import { test, expect } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

// These tests share one production preview server and its retained session resources.
test.describe.configure({ mode: 'serial' });

let directory: string;
let server: PreviewServer;
let url: string;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'luna-ffmpeg-'));
  await build({ build: { outDir: directory, rollupOptions: { input: resolve('tests/browser/ffmpeg.html') } } });
  server = await preview({ build: { outDir: directory }, preview: { port: 5187, strictPort: true } });
  url = 'http://localhost:5187/tests/browser/ffmpeg.html';
});
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.httpServer.close(err => err ? reject(err) : resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

test('production worker recreates and encodes MP3 and WebM offline with HTTP cache disabled', async ({ page, context }) => {
  test.setTimeout(60_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(url);
  await page.waitForFunction(() => !!window.ffmpegVerification);
  await page.evaluate(() => window.ffmpegVerification.initialize());
  expect(await page.evaluate(() => window.ffmpegVerification.encode('mp3'))).toBeGreaterThan(0);
  await context.setOffline(true);
  await page.evaluate(() => window.ffmpegVerification.terminate());
  await page.evaluate(() => window.ffmpegVerification.initialize());
  expect(await page.evaluate(() => window.ffmpegVerification.encode('mp3'))).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.ffmpegVerification.encode('webm'))).toBeGreaterThan(0);
  await page.evaluate(() => window.ffmpegVerification.terminate());
});

for (const asset of ['worker', 'core', 'wasm']) {
  test(`production ${asset} failure settles and permits retry`, async ({ page }) => {
    test.setTimeout(45_000);
    await page.route('**/assets/**', async route => {
      const path = new URL(route.request().url()).pathname;
      const matches = asset === 'wasm' ? path.endsWith('.wasm')
        : asset === 'worker' ? /\/worker-[^/]+\.js$/.test(path)
        : /\/ffmpeg-core-[^/]+\.js$/.test(path);
      if (!matches) return route.continue();
      const response = await route.fetch();
      const body = await response.body();
      // Preserve Vite's tiny URL export modules; corrupt only the actual runtime.
      if (body.length < 1000) return route.fulfill({ response, body });
      await route.fulfill({ response, body: 'invalid runtime content' });
    });
    await page.goto(url);
    await page.waitForFunction(() => !!window.ffmpegVerification);
    const error = await page.evaluate(async () => {
      try { await window.ffmpegVerification.initialize(); return ''; }
      catch (error) { return String(error); }
    });
    expect(error).toMatch(/timed out|Failed to initialize/);
    await page.unrouteAll();
    await page.evaluate(() => window.ffmpegVerification.initialize());
    await page.evaluate(() => window.ffmpegVerification.terminate());
  });
}

test('former direct-URL lifecycle hangs on an uncached offline worker request', async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.goto(url);
  await page.waitForFunction(() => !!window.legacyVerification);
  await page.evaluate(async () => { window.legacyEngine = await window.legacyVerification.create(); });
  await context.setOffline(true);
  const failedWorker = page.waitForEvent('requestfailed', request => /\/worker-[^/]+\.js$/.test(request.url()));
  const settled = await page.evaluate(async () => {
    window.legacyEngine.terminate();
    const result = await Promise.race([
      window.legacyEngine.initialize().then(() => 'resolved', () => 'rejected'),
      new Promise<string>(resolve => setTimeout(() => resolve('pending'), 1000)),
    ]);
    window.legacyEngine.terminate();
    return result;
  });
  await failedWorker;
  expect(settled).toBe('pending');
});
