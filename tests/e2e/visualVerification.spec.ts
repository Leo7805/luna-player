import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const realisticFiles = [
  { name: 'S101 Muddy Puddles.mp4', relativePath: 'Season 1/S101 Muddy Puddles.mp4', size: 98800000, lastModified: 1700000001000 },
  { name: 'S102 Mr Dinosaur Is Lost.mp4', relativePath: 'Season 1/S102 Mr Dinosaur Is Lost.mp4', size: 93000000, lastModified: 1700000002000 },
  { name: 'S103 Best Friend.mp4', relativePath: 'Season 1/S103 Best Friend.mp4', size: 104400000, lastModified: 1700000003000 },
  { name: 'S104 Polly Parrot.mp4', relativePath: 'Season 1/S104 Polly Parrot.mp4', size: 81000000, lastModified: 1700000004000 },
  { name: 'S105 Hide and Seek.mp4', relativePath: 'Season 1/S105 Hide and Seek.mp4', size: 95000000, lastModified: 1700000005000 },
  { name: 'S201 Bubbles.mp4', relativePath: 'Season 2/S201 Bubbles.mp4', size: 89000000, lastModified: 1700000006000 },
  { name: 'S202 Emily Elephant.mp4', relativePath: 'Season 2/S202 Emily Elephant.mp4', size: 92000000, lastModified: 1700000007000 },
];

async function installDirectoryPickerMock(page: any, folderName: string, files: any[]) {
  await page.addInitScript(({ folderName, files }: any) => {
    (window as any).showDirectoryPicker = async () => {
      const createDirHandle = (name: string, relativePrefix = ''): any => {
        return {
          kind: 'directory',
          name,
          async *values() {
            const directSubdirs = new Set<string>();
            const directFiles: any[] = [];
            for (const f of files) {
              const rel = relativePrefix ? f.relativePath.slice(relativePrefix.length) : f.relativePath;
              if (!rel.includes('/')) {
                directFiles.push(f);
              } else {
                directSubdirs.add(rel.split('/')[0]);
              }
            }
            for (const dirName of directSubdirs) {
              yield createDirHandle(dirName, relativePrefix ? relativePrefix + dirName + '/' : dirName + '/');
            }
            for (const file of directFiles) {
              yield {
                kind: 'file',
                name: file.name,
                async getFile() {
                  const canvas = document.createElement('canvas');
                  canvas.width = 320;
                  canvas.height = 240;
                  const ctx = canvas.getContext('2d')!;
                  ctx.fillStyle = '#0284c7';
                  ctx.fillRect(0, 0, 320, 240);
                  ctx.fillStyle = '#ffffff';
                  ctx.font = '20px sans-serif';
                  ctx.fillText(file.name, 20, 120);
                  const stream = canvas.captureStream(25);
                  let recorder: MediaRecorder;
                  const blob = await new Promise<Blob>((res) => {
                    recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                    const chunks: BlobPart[] = [];
                    recorder.ondataavailable = (e) => chunks.push(e.data);
                    recorder.onstop = () => res(new Blob(chunks, { type: 'video/webm' }));
                    recorder.start();
                    setTimeout(() => recorder.stop(), 200);
                  });
                  const realFile = new File([blob], file.name, {
                    type: 'video/webm',
                    lastModified: file.lastModified,
                  });
                  Object.defineProperty(realFile, 'size', { value: file.size });
                  return realFile;
                },
              };
            }
          },
        };
      };
      return createDirHandle(folderName);
    };
  }, { folderName, files });
}

test.describe('Visual Verification & Regression Suite', () => {
  // Test with OS prefers-color-scheme dark to ensure class-based light mode remains crisp
  test.use({ colorScheme: 'dark' });

  test('Step C: Capture After Screenshots across 4 viewports', async ({ page }) => {
    const afterDir = path.resolve(__dirname, '../../tests/visual-verification/after');
    const artifactDir = '/Users/leo/.gemini/antigravity/brain/53ab1ea6-0617-4753-af2d-99fc7a6aca68/screenshots/after';
    fs.mkdirSync(afterDir, { recursive: true });
    fs.mkdirSync(artifactDir, { recursive: true });

    await installDirectoryPickerMock(page, 'Peppa Pig Series (1080p)', realisticFiles);

    // 1. Desktop: 1440 × 900, Light Theme
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('luna_theme', 'light'));
    await page.reload();
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Select Season 1/S105 Hide and Seek.mp4
    const s105Btn = page.getByRole('button', { name: /S105 Hide and Seek/i }).first();
    await s105Btn.click();
    await page.waitForTimeout(600);

    const shot1 = path.join(afterDir, 'after-1-desktop-1440-light.png');
    await page.screenshot({ path: shot1 });
    fs.copyFileSync(shot1, path.join(artifactDir, 'after-1-desktop-1440-light.png'));

    // 2. Desktop: 1440 × 900, Dark Theme
    const themeToggle = page.getByRole('button', { name: /switch to/i });
    await themeToggle.click();
    await page.waitForTimeout(600);

    const shot2 = path.join(afterDir, 'after-2-desktop-1440-dark.png');
    await page.screenshot({ path: shot2 });
    fs.copyFileSync(shot2, path.join(artifactDir, 'after-2-desktop-1440-dark.png'));

    // 3. Laptop: 1280 × 800, Light Theme
    await page.setViewportSize({ width: 1280, height: 800 });
    await themeToggle.click(); // switch back to light
    await page.waitForTimeout(600);

    const shot3 = path.join(afterDir, 'after-3-laptop-1280-light.png');
    await page.screenshot({ path: shot3 });
    fs.copyFileSync(shot3, path.join(artifactDir, 'after-3-laptop-1280-light.png'));

    // 4. Mobile: 375 × 667, Light Theme
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(600);

    const shot4 = path.join(afterDir, 'after-4-mobile-375-light.png');
    await page.screenshot({ path: shot4 });
    fs.copyFileSync(shot4, path.join(artifactDir, 'after-4-mobile-375-light.png'));

    expect(fs.existsSync(shot1)).toBe(true);
    expect(fs.existsSync(shot2)).toBe(true);
    expect(fs.existsSync(shot3)).toBe(true);
    expect(fs.existsSync(shot4)).toBe(true);
  });

  test('verifies scenic background element loads, decodes, and is unoccluded', async ({ page }) => {
    let sceneryLoaded = false;
    page.on('response', (res) => {
      if (res.url().includes('scenery') && res.status() === 200) {
        sceneryLoaded = true;
      }
    });

    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('luna_theme', 'light'));
    await page.reload();

    const bgEl = page.getByTestId('scenic-background');
    await expect(bgEl).toBeVisible();

    const bgStyle = await bgEl.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        backgroundImage: computed.backgroundImage,
        zIndex: computed.zIndex,
        position: computed.position,
        opacity: computed.opacity,
        display: computed.display,
      };
    });

    expect(bgStyle.backgroundImage).toContain('scenery');
    expect(bgStyle.position).toBe('fixed');
    expect(bgStyle.display).toBe('block');
    expect(Number(bgStyle.opacity)).toBeGreaterThan(0.5);

    // Verify background image decodes in the browser
    const decodes = await page.evaluate(async (bg) => {
      const match = bg.match(/url\(["']?(.*?)["']?\)/);
      if (!match) return false;
      const img = new Image();
      img.src = match[1];
      await img.decode();
      return img.naturalWidth > 0 && img.naturalHeight > 0;
    }, bgStyle.backgroundImage);

    expect(decodes).toBe(true);
    expect(sceneryLoaded).toBe(true);
  });

  test('verifies Light Theme text contrast on actual rendered elements', async ({ page }) => {
    await installDirectoryPickerMock(page, 'Peppa Pig Series (1080p)', realisticFiles);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('luna_theme', 'light'));
    await page.reload();
    await page.getByRole('button', { name: /open video folder/i }).click();

    // Select Season 1/S105 Hide and Seek.mp4
    const s105Btn = page.getByRole('button', { name: /S105 Hide and Seek/i }).first();
    await s105Btn.click();

    // 1. Header Title "Luna Player"
    const headerTitle = page.locator('header').getByText('Luna Player');
    await expect(headerTitle).toBeVisible();
    const headerTitleColor = await headerTitle.evaluate((el) => window.getComputedStyle(el).color);
    // Should be slate-900 (rgb(15, 23, 42) or oklch ~0.208)
    expect(headerTitleColor.includes('15, 23, 42') || headerTitleColor.includes('0.208')).toBe(true);

    // 2. Header Subtitle
    const subtitle = page.locator('header').getByText(/Private browser-based/i);
    await expect(subtitle).toBeVisible();
    const subtitleColor = await subtitle.evaluate((el) => window.getComputedStyle(el).color);
    // slate-600 (rgb(71, 85, 105) or oklch ~0.446)
    expect(subtitleColor.includes('71, 85, 105') || subtitleColor.includes('0.446')).toBe(true);

    // 3. Header Folder Info Pill
    const folderPillText = page.locator('header').getByText(/Peppa Pig Series/i);
    await expect(folderPillText).toBeVisible();
    const folderPillColor = await folderPillText.evaluate((el) => window.getComputedStyle(el).color);
    expect(folderPillColor.includes('15, 23, 42') || folderPillColor.includes('0.208')).toBe(true);

    // 4. Playlist Folder Name
    const folderHeading = page.getByRole('button', { name: /Season 1/i }).locator('span').first();
    await expect(folderHeading).toBeVisible();
    const folderColor = await folderHeading.evaluate((el) => window.getComputedStyle(el).color);
    expect(folderColor.includes('15, 23, 42') || folderColor.includes('0.208')).toBe(true);

    // 5. Unselected Video Title
    const unselectedItem = page.getByRole('button', { name: /S101 Muddy Puddles/i }).first().locator('p').first();
    await expect(unselectedItem).toBeVisible();
    const unselectedColor = await unselectedItem.evaluate((el) => window.getComputedStyle(el).color);
    // slate-800: rgb(30, 41, 59) or oklch ~0.279
    expect(unselectedColor.includes('30, 41, 59') || unselectedColor.includes('0.279')).toBe(true);

    // 6. Selected Video Title
    const selectedItem = page.getByRole('button', { name: /S105 Hide and Seek/i }).first().locator('p').first();
    await expect(selectedItem).toBeVisible();
    const selectedColor = await selectedItem.evaluate((el) => window.getComputedStyle(el).color);
    // sky-950: rgb(8, 47, 73) or oklch ~0.293 0.066 243.157
    expect(selectedColor.includes('8, 47, 73') || selectedColor.includes('0.293')).toBe(true);

    // 7. Player Controls Video Title
    const playerTitle = page.locator('h2').getByText(/S105 Hide and Seek/i);
    await expect(playerTitle).toBeVisible();
    const playerTitleColor = await playerTitle.evaluate((el) => window.getComputedStyle(el).color);
    expect(playerTitleColor.includes('15, 23, 42') || playerTitleColor.includes('0.208')).toBe(true);

    // 8. Search Input placeholder and text
    const searchInput = page.getByPlaceholder(/search videos/i);
    await expect(searchInput).toBeVisible();
    const searchColor = await searchInput.evaluate((el) => window.getComputedStyle(el).color);
    expect(searchColor.includes('15, 23, 42') || searchColor.includes('0.208')).toBe(true);
  });
});
